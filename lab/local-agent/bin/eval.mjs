#!/usr/bin/env node
// Runs lab tasks through the stock Pi coding agent in process and scores them.
//   DEEPSEEK_API_KEY=... node bin/eval.mjs [--provider deepseek] [--model deepseek-flash]
//     [--tasks T1,T2] [--repeat 1] [--thinking high] [--time-ms 600000] [--parallel 3]
// Each run gets its own virtual environment (env.mjs): /cart seeded from the task's
// start/ folder, /skill/pico8 read-only, p8 as a shell command. The agent never
// touches the host disk. Scoring: hidden checks (p8 tasks) or the S4 shooter
// oracle (s4 tasks). Results go to .cache/lab/<run>/.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { runAgent, skillPrompt } from "../src/agent.mjs";
import { loadCasesText, scoreSource } from "../src/checks.mjs";
import { CART, createEnvironment } from "../src/env.mjs";
import { emptySnapshot, shooterCases, verifyShooter } from "../src/maker.mjs";

const LAB = resolve(new URL("..", import.meta.url).pathname);
const { values: a } = parseArgs({
  options: {
    provider: { type: "string", default: "deepseek" },
    model: { type: "string", default: "deepseek-flash" },
    "models-path": { type: "string" },
    tasks: { type: "string", default: "T1,T2,T3,T4,T5,T6" },
    repeat: { type: "string", default: "1" },
    thinking: { type: "string", default: "high" },
    "time-ms": { type: "string", default: "600000" },
    parallel: { type: "string", default: "3" },
  },
});
const apiKey = process.env[`${a.provider.toUpperCase().replace(/-/g, "_")}_API_KEY`];
const runId = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13) + "-" + Math.random().toString(36).slice(2, 6);
const OUT = join(LAB, "../../.cache/lab", runId);
mkdirSync(OUT, { recursive: true });

function readTree(root) {
  const files = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else files[relative(root, p)] = readFileSync(p, "utf8");
    }
  };
  walk(root);
  return files;
}
const skillFiles = readTree(join(LAB, "skill/pico8"));

function loadTask(id) {
  const dir = join(LAB, "tasks", id);
  const task = JSON.parse(readFileSync(join(dir, "task.json"), "utf8"));
  if (task.kind === "s4") {
    const c = shooterCases.find((x) => x.id === task.case);
    return { ...task, id, text: c.prompt, cart: { "main.lua": c.snapshot().source } };
  }
  return { ...task, id, dir, text: readFileSync(join(dir, "task.md"), "utf8").trim(), cart: readTree(join(dir, "start")) };
}

async function score(task, source) {
  if (task.kind === "s4") {
    if (!source.trim()) return { pass: false, detail: "main.lua is empty" };
    const r = await verifyShooter(emptySnapshot(source));
    const failed = Object.entries(r.checks ?? {}).filter(([, v]) => v !== true && v?.passed !== true).map(([k]) => k);
    return { pass: r.passed, detail: r.passed ? "S4 oracle passed" : `S4 oracle failed: ${failed.join(", ") || "see report"}` };
  }
  return scoreSource(source, loadCasesText(readFileSync(join(task.dir, task.score), "utf8")));
}

function metrics(events) {
  const tools = {},
    usage = { input: 0, output: 0, cacheRead: 0 };
  let turns = 0,
    toolErrors = 0,
    final = "";
  for (const { message: m } of events) {
    if (m.role === "assistant") {
      turns++;
      for (const k of Object.keys(usage)) usage[k] += m.usage?.[k] ?? 0;
      for (const p of m.content ?? []) {
        if (p.type === "toolCall") {
          const cmd = p.name === "bash" ? /\b(p8\s+\w+)/.exec(p.arguments?.command ?? "")?.[1] : null;
          const key = cmd ? `bash:${cmd}` : p.name;
          tools[key] = (tools[key] ?? 0) + 1;
        }
        if (p.type === "text" && p.text.trim()) final = p.text.trim();
      }
    }
    if (m.role === "toolResult" && m.isError) toolErrors++;
  }
  return { turns, tools, toolCalls: Object.values(tools).reduce((x, y) => x + y, 0), toolErrors, usage, final: final.slice(0, 600) };
}

async function runOne(task, n) {
  const base = join(OUT, `${task.id}-${n}`);
  mkdirSync(base, { recursive: true });
  const env = createEnvironment({ cartFiles: task.cart, skillFiles });
  const run = await runAgent({
    env,
    prompt: skillPrompt(skillFiles["SKILL.md"], task.text),
    model: { provider: a.provider, id: a.model, apiKey, modelsPath: a["models-path"] },
    thinking: a.thinking,
    timeMs: Number(a["time-ms"]),
  });
  writeFileSync(join(base, "events.jsonl"), run.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const source = (await env.fs.exists(`${CART}/main.lua`)) ? await env.fs.readFile(`${CART}/main.lua`, "utf8") : "";
  writeFileSync(join(base, "main.lua"), source);
  const s = await score(task, source);
  const row = { task: task.id, n, pass: s.pass, seconds: run.seconds, status: run.status, ...(run.error ? { error: run.error } : {}), ...metrics(run.events), score: s.detail };
  writeFileSync(join(base, "result.json"), JSON.stringify(row, null, 1));
  console.log(JSON.stringify({ ...row, final: undefined }));
  return row;
}

const jobs = [];
for (const id of a.tasks.split(",")) {
  const task = loadTask(id);
  for (let n = 1; n <= Number(a.repeat); n++) jobs.push([task, n]);
}
const rows = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(Number(a.parallel), jobs.length) }, async () => {
    while (next < jobs.length) {
      const [task, n] = jobs[next++];
      rows.push(await runOne(task, n));
    }
  }),
);
rows.sort((x, y) => x.task.localeCompare(y.task) || x.n - y.n);
const md = [
  `# ${a.provider}/${a.model} · thinking ${a.thinking} · ${runId}`,
  "",
  "| task | n | pass | s | turns | tools | errors | in/out/cached tok | status |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    (r) =>
      `| ${r.task} | ${r.n} | ${r.pass ? "✓" : "✗"} | ${r.seconds} | ${r.turns} | ${Object.entries(r.tools).map(([k, v]) => `${k}×${v}`).join(" ")} | ${r.toolErrors} | ${r.usage.input}/${r.usage.output}/${r.usage.cacheRead} | ${r.status} |`,
  ),
];
writeFileSync(join(OUT, "summary.md"), md.join("\n") + "\n");
console.log(`\n${md.join("\n")}\n\nArchive: ${OUT}`);
