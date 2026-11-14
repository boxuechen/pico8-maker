#!/usr/bin/env node
// Runs lab tasks through the stock Pi coding agent in process and scores them.
//   DEEPSEEK_API_KEY=... node bin/eval.mjs [--provider deepseek] [--model deepseek-flash]
//     [--tasks T1,T2] [--repeat 1] [--thinking high] [--time-ms 600000] [--parallel 3]
//     [--loop session|durable] [--p8 inline|worker]
// Each run gets its own virtual environment (env.mjs): /cart seeded from the task's
// start/ folder, /skill/pico8 read-only, p8 as a shell command. The agent never
// touches the host disk. Scoring: hidden checks (p8 tasks) or the S4 shooter
// oracle (s4 tasks). Results go to .cache/lab/<run>/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { piSystemPrompt, runAgent, skillPrompt } from "../src/agent.mjs";
import { runDurableAgent } from "../src/durable-agent.mjs";
import { CART, createEnvironment } from "../src/env.mjs";
import { applyResourceFiles, remoteP8, RESOURCE_FILES } from "../src/maker.mjs";
import { startP8Worker } from "../src/p8-worker-node.mjs";
import { loadTask, metrics, score, skillFiles } from "../src/tasks.mjs";

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
    loop: { type: "string", default: "session" },
    p8: { type: "string", default: "inline" },
  },
});
const apiKey = process.env[`${a.provider.toUpperCase().replace(/-/g, "_")}_API_KEY`];
const runId = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13) + "-" + Math.random().toString(36).slice(2, 6);
const OUT = join(LAB, "../../.cache/lab", runId);
mkdirSync(OUT, { recursive: true });

async function runOne(task, n) {
  const base = join(OUT, `${task.id}-${n}`);
  mkdirSync(base, { recursive: true });
  // worker: p8 runs in its own thread, one message per command (Maker's main-thread shape).
  const worker = a.p8 === "worker" ? await startP8Worker(skillFiles) : null;
  const env = createEnvironment({ cartFiles: task.cart, skillFiles, ...(worker ? { p8: remoteP8(worker.send) } : {}) });
  const model = { provider: a.provider, id: a.model, apiKey, modelsPath: a["models-path"] };
  const common = { env, prompt: skillPrompt(skillFiles["SKILL.md"], task.text), model, thinking: a.thinking, timeMs: Number(a["time-ms"]) };
  // session: Pi coding-agent AgentSession; durable: pi-durable Harness with the same system prompt.
  const run = a.loop === "durable" ? await runDurableAgent({ ...common, systemPrompt: await piSystemPrompt(env, model) }) : await runAgent(common);
  await worker?.close();
  writeFileSync(join(base, "events.jsonl"), run.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const source = (await env.fs.exists(`${CART}/main.lua`)) ? await env.fs.readFile(`${CART}/main.lua`, "utf8") : "";
  writeFileSync(join(base, "main.lua"), source);
  // Final resources: the task's start with the cart's resource files applied (malformed files count as unchanged).
  const files = {};
  for (const name of RESOURCE_FILES) if (await env.fs.exists(`${CART}/${name}`)) files[name] = await env.fs.readFile(`${CART}/${name}`, "utf8");
  const s = await score(task, source, applyResourceFiles(task.assets, files).assets);
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
  `# ${a.provider}/${a.model} · thinking ${a.thinking} · loop ${a.loop} · p8 ${a.p8} · ${runId}`,
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
