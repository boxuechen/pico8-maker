#!/usr/bin/env node
// Run lab tasks against a model and archive the results.
//
//   node bin/eval.mjs --model qwen3.5:9b-q4_K_M [--base-url http://127.0.0.1:11434/v1]
//     [--api openai-responses|openai-completions] [--key-env LAB_API_KEY]
//     [--tasks shooter-repair,shooter-create,catch] [--repeat 3] [--thinking low]
//     [--test-thinking off] [--time-ms 900000]
//
// Writes .cache/lab/<run>/ with one directory per task run (report.json, final.p8,
// reply.md) and summary.json / summary.md. Keys come only from the environment.
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { cartText, emptySnapshot, shooterCases, verifyShooter } from "../src/maker.mjs";
import { connect } from "../src/model.mjs";
import { runTask } from "../src/phases.mjs";

const { values: a } = parseArgs({
  options: {
    model: { type: "string" },
    "base-url": { type: "string", default: "http://127.0.0.1:11434/v1" },
    api: { type: "string", default: "openai-responses" },
    "key-env": { type: "string", default: "LAB_API_KEY" },
    tasks: { type: "string", default: "shooter-repair,shooter-create,catch" },
    repeat: { type: "string", default: "1" },
    thinking: { type: "string", default: "low" },
    "test-thinking": { type: "string", default: "off" },
    "time-ms": { type: "string", default: "900000" },
  },
});
if (!a.model) throw new Error("--model is required");

const shooter = Object.fromEntries(shooterCases.map((c) => [c.id, c]));
const tasks = {
  "shooter-repair": { kind: "repair", prompt: shooter["shooter-repair"].prompt, snapshot: shooter["shooter-repair"].snapshot(), oracle: true },
  "shooter-create": { kind: "create", prompt: shooter["shooter-create"].prompt, oracle: true },
  catch: {
    kind: "create",
    prompt: "做一个 PICO-8 接水果小游戏：左右移动篮子接住掉落的水果，接到 10 个获胜，漏掉 3 个失败，接到和漏掉都有音效，结束后可以重开。",
  },
};

const apiKey = process.env[a["key-env"]] ?? "local";
const model = connect({ baseUrl: a["base-url"], model: a.model, api: a.api, apiKey });
const root = new URL("../../../.cache/lab/", import.meta.url);
const run = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}-${randomUUID().slice(0, 8)}`;
const dir = new URL(`${run}/`, root);
await mkdir(dir, { recursive: true });
const thinking = { plan: a.thinking, build: a.thinking, test: a["test-thinking"] };
const redact = (value) => JSON.parse(JSON.stringify(value, (k, v) => (k === "data" && typeof v === "string" && v.length > 200 ? `[image ${v.length} b64]` : typeof v === "string" && apiKey.length > 8 ? v.replaceAll(apiKey, "[REDACTED]") : v)));

const rows = [];
for (const id of a.tasks.split(",")) {
  for (let i = 1; i <= Number(a.repeat); i++) {
    if (!tasks[id]) throw new Error(`unknown task ${id}`);
    const task = { id, ...tasks[id] };
    const log = (e) => {
      if (e.kind === "phase") console.log(`  ${e.name}: ${e.status}`);
      if (e.kind === "tool") console.log(`    ${e.isError ? "✗" : "✓"} ${e.name}${e.isError ? `: ${e.text.split("\n")[0].slice(0, 100)}` : ""}`);
    };
    console.log(`${id} #${i}`);
    const r = await runTask(task, { complete: model.complete, thinking, timeMs: Number(a["time-ms"]), onEvent: log });
    const snapshot = { source: r.source, assets: r.assets };
    const oracle = task.oracle ? await verifyShooter(snapshot) : null;
    const out = new URL(`${id}-${i}/`, dir);
    await mkdir(out, { recursive: true });
    await writeFile(new URL("final.p8", out), cartText(snapshot));
    await writeFile(new URL("reply.md", out), r.reply + "\n");
    await writeFile(new URL("report.json", out), JSON.stringify(redact({ task: { id, kind: task.kind }, model: a.model, thinking, result: r, oracle: oracle && { passed: oracle.passed, checks: oracle.checks, coverage: oracle.coverage } }), null, 1));
    const row = {
      task: id,
      n: i,
      status: r.status,
      oracle: oracle ? oracle.passed : null,
      seconds: Math.round(r.elapsedMs / 1000),
      toolCalls: r.toolCalls,
      toolErrors: r.toolErrors,
      output: r.usage.output,
      input: r.usage.input,
      cacheRead: r.usage.cacheRead,
      phases: r.phases.map((p) => `${p.name}:${p.status}:${Math.round(p.ms / 1000)}s`).join(" "),
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
const head = ["task", "n", "status", "oracle", "seconds", "toolCalls", "toolErrors", "output", "input", "cacheRead", "phases"];
const md = [`# ${a.model} · thinking ${a.thinking}/${a["test-thinking"]} · ${run}`, "", `| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${head.map((h) => r[h] ?? "").join(" | ")} |`)].join("\n");
await writeFile(new URL("summary.json", dir), JSON.stringify({ model: a.model, api: a.api, thinking: a.thinking, rows }, null, 1));
await writeFile(new URL("summary.md", dir), md + "\n");
console.log(`\n${md}\n\nArchive: ${dir.pathname}`);
process.exit(0);
