#!/usr/bin/env node
// Runs lab tasks through the stock Pi coding agent and scores them with hidden checks.
//   node bin/eval.mjs --model qwen3.5:4b-q4_K_M [--tasks T0,T1] [--repeat 3]
//     [--thinking off] [--time-ms 600000]
// Each run gets a fresh workspace and a temporary Pi agent directory; the agent sees
// only the workspace, the pico8 skill and bin/ (p8) on PATH. Results go to .cache/lab/.
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const LAB = resolve(new URL("..", import.meta.url).pathname);
const PI = join(LAB, "node_modules/.bin/pi");
const { values: a } = parseArgs({
  options: {
    model: { type: "string" },
    tasks: { type: "string", default: "T0" },
    repeat: { type: "string", default: "1" },
    thinking: { type: "string", default: "off" },
    "time-ms": { type: "string", default: "600000" },
    // Load the pico8 skill up front (/skill:pico8) instead of relying on the model to read it.
    "force-skill": { type: "boolean", default: false },
  },
});
if (!a.model) throw new Error("--model is required");
const runId = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13) + "-" + Math.random().toString(36).slice(2, 6);
const OUT = join(LAB, "../../.cache/lab", runId);
mkdirSync(OUT, { recursive: true });

// Everything the agent can see lives outside the lab: a temporary agent dir with
// its own copy of the skill and a p8 launcher. A run once followed the skill's
// lab path and edited a task's original start file.
function sandboxDirs() {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-agent-"));
  for (const f of ["models.json", "settings.json"]) cpSync(join(LAB, "agent", f), join(agentDir, f));
  cpSync(join(LAB, "skill/pico8"), join(agentDir, "skills/pico8"), { recursive: true });
  mkdirSync(join(agentDir, "bin"));
  writeFileSync(join(agentDir, "bin/p8"), `#!/bin/sh\nexec node ${JSON.stringify(join(LAB, "bin/p8"))} "$@"\n`, { mode: 0o755 });
  return agentDir;
}

function runPi(work, prompt, log) {
  const agentDir = sandboxDirs();
  const args = [
    "--mode", "json", "--no-session", "--offline", "--no-extensions", "--no-mcp",
    "--no-context-files", "--no-prompt-templates", "--no-skills",
    "--skill", join(agentDir, "skills/pico8"),
    "--model", `ollama/${a.model}`, "--thinking", a.thinking, prompt,
  ];
  return new Promise((done) => {
    const t0 = Date.now();
    const child = spawn(PI, args, {
      cwd: work,
      env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PATH: `${join(agentDir, "bin")}:${process.env.PATH}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "", timedOut = false;
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, Number(a["time-ms"]));
    child.on("close", (code) => {
      clearTimeout(timer);
      writeFileSync(log, out);
      if (err.trim()) writeFileSync(log.replace(/\.jsonl$/, ".stderr.txt"), err);
      done({ code, timedOut, seconds: Math.round((Date.now() - t0) / 1000), events: out });
    });
  });
}

function metrics(events) {
  const tools = {};
  let turns = 0, toolErrors = 0, outputTokens = 0, final = "";
  for (const line of events.split("\n")) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== "message_end") continue;
    const m = e.message;
    if (m.role === "assistant") {
      turns++;
      outputTokens += m.usage?.output ?? 0;
      for (const p of m.content ?? []) {
        if (p.type === "toolCall") {
          const key = p.name === "bash" && /\bp8\s+check\b/.test(p.arguments?.command ?? "") ? "bash:p8 check" : p.name;
          tools[key] = (tools[key] ?? 0) + 1;
        }
        if (p.type === "text" && p.text.trim()) final = p.text.trim();
      }
    }
    if (m.role === "toolResult" && m.isError) toolErrors++;
  }
  return { turns, tools, toolCalls: Object.values(tools).reduce((x, y) => x + y, 0), toolErrors, outputTokens, final: final.slice(0, 400) };
}

async function score(task, dir, work) {
  if (task.kind === "python") {
    const scoring = mkdtempSync(join(tmpdir(), "lab-score-"));
    cpSync(work, scoring, { recursive: true });
    cpSync(join(dir, "hidden"), scoring, { recursive: true });
    const [cmd, ...rest] = task.score;
    return new Promise((done) => {
      const c = spawn(cmd, rest, { cwd: scoring, stdio: ["ignore", "pipe", "pipe"] });
      let text = "";
      c.stdout.on("data", (d) => (text += d));
      c.stderr.on("data", (d) => (text += d));
      c.on("close", (code) => done({ pass: code === 0, detail: text.trim().split("\n").slice(-3).join(" | ") }));
    });
  }
  if (task.kind === "p8") {
    const { scoreCart } = await import(join(LAB, "src/checks.mjs"));
    return scoreCart(join(work, "main.lua"), join(dir, task.score));
  }
  throw new Error(`unknown task kind ${task.kind}`);
}

const taskHash = () => execFileSync("git", ["-C", LAB, "status", "--porcelain", "tasks"], { encoding: "utf8" });
const before = taskHash();
const rows = [];
for (const id of a.tasks.split(",")) {
  const dir = join(LAB, "tasks", id);
  const task = JSON.parse(readFileSync(join(dir, "task.json"), "utf8"));
  const text = readFileSync(join(dir, "task.md"), "utf8").trim();
  const prompt = a["force-skill"] && task.kind === "p8" ? `/skill:pico8 ${text}` : text;
  for (let n = 1; n <= Number(a.repeat); n++) {
    const base = join(OUT, `${id}-${n}`), work = join(base, "work");
    mkdirSync(work, { recursive: true });
    if (existsSync(join(dir, "start"))) cpSync(join(dir, "start"), work, { recursive: true });
    const run = await runPi(work, prompt, join(base, "events.jsonl"));
    if (taskHash() !== before) throw new Error(`run ${id}-${n} modified the lab's task files; restore them with git checkout and investigate ${base}`);
    const m = metrics(run.events);
    const s = await score(task, dir, work);
    const row = { task: id, n, pass: s.pass, seconds: run.seconds, timedOut: run.timedOut, exit: run.code, ...m, score: s.detail };
    writeFileSync(join(base, "result.json"), JSON.stringify(row, null, 1));
    rows.push(row);
    console.log(JSON.stringify({ ...row, final: undefined }));
  }
}
const md = [
  `# ${a.model} · thinking ${a.thinking}${a["force-skill"] ? " · skill forced" : ""} · ${runId}`,
  "",
  "| task | n | pass | s | turns | tools | errors | out tok | stopped |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.task} | ${r.n} | ${r.pass ? "✓" : "✗"} | ${r.seconds} | ${r.turns} | ${Object.entries(r.tools).map(([k, v]) => `${k}×${v}`).join(" ")} | ${r.toolErrors} | ${r.outputTokens} | ${r.timedOut ? "timeout" : "yes"} |`),
];
writeFileSync(join(OUT, "summary.md"), md.join("\n") + "\n");
console.log(`\n${md.join("\n")}\n\nArchive: ${OUT}`);
