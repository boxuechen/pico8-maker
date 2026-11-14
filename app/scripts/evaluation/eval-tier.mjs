#!/usr/bin/env node
// Layered evaluation in one command (real provider requests; DeepSeek models):
//   quick  lab T1–T9 (about 2 min)            every skill or p8 change
//   agent  quick + S4 ×N (about 6–10 min)     every agent-facing change
//   full   agent + Garden/Lodge reruns + app smoke (about 30 min)   large changes
//
//   DEEPSEEK_API_KEY=... node scripts/evaluation/eval-tier.mjs --tier agent [--model deepseek-flash] [--repeat 5]
//
// Runs the layers in parallel, keeps every child log under
// .cache/evaluations/tier-<id>/ and prints one summary table. Case reruns still
// need manual play for fun and win/restart quality.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({
  options: {
    tier: { type: "string", default: "quick" },
    model: { type: "string", default: "deepseek-flash" },
    repeat: { type: "string", default: "5" },
    thinking: { type: "string", default: "high" },
  },
});
const tiers = ["quick", "agent", "full"];
if (!tiers.includes(a.tier)) throw new Error("--tier quick|agent|full");
const key = process.env.DEEPSEEK_API_KEY;
if (!key) throw new Error("set DEEPSEEK_API_KEY");
const level = tiers.indexOf(a.tier);
const APP = new URL("../../", import.meta.url).pathname;
const LAB = new URL("../../../lab/local-agent/", import.meta.url).pathname;
const id = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13) + "-" + Math.random().toString(36).slice(2, 6);
const out = join(APP, "../.cache/evaluations", `tier-${a.tier}-${id}`);
mkdirSync(out, { recursive: true });
const matrix = join(out, "matrix.json");
writeFileSync(matrix, JSON.stringify({ schemaVersion: 1, models: [{ id: a.model, family: "DeepSeek", provider: "deepseek", model: a.model, baseUrl: "https://api.deepseek.com", apiKeyEnv: "DEEPSEEK_API_KEY", thinkingLevel: a.thinking }] }));

const env = { ...process.env, S4_DEEPSEEK_KEY: key, SMOKE_DEEPSEEK_KEY: key, SMOKE_MODEL: a.model, SMOKE_CHROME_NO_SANDBOX: process.env.SMOKE_CHROME_NO_SANDBOX ?? "1" };
const run = (name, cwd, args, extra = {}) =>
  new Promise((resolve) => {
    const log = join(out, `${name}.log`);
    const started = Date.now();
    const child = spawn(process.execPath, args, { cwd, env: { ...env, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    child.on("close", (code) => {
      writeFileSync(log, text);
      resolve({ name, code, seconds: Math.round((Date.now() - started) / 1000), text });
    });
  });

const jobs = [run("lab", LAB, ["bin/eval.mjs", "--loop", "durable", "--p8", "worker", "--model", a.model, "--thinking", a.thinking, "--tasks", "T1,T2,T3,T4,T5,T6,T7,T8,T9", "--parallel", "9"])];
if (level >= 1)
  for (let i = 1; i <= Number(a.repeat); i++) jobs.push(run(`s4-${i}`, APP, ["scripts/evaluation/run-s4.mjs", "--run", "--matrix", matrix]));
if (level >= 2) {
  for (const c of ["garden", "lodge"]) jobs.push(run(`case-${c}`, APP, ["scripts/evaluation/run-case.mjs", "--case", c, "--model", a.model]));
  jobs.push(run("app-smoke", APP, ["scripts/evaluation/app-smoke.mjs"]));
}
const results = await Promise.all(jobs);

const lines = [`# tier ${a.tier} · deepseek/${a.model} · thinking ${a.thinking} · ${id}`, ""];
const lab = results.find((r) => r.name === "lab");
const labRows = lab.text.split("\n").filter((l) => /^\| T\d/.test(l));
const labPass = labRows.filter((l) => l.split("|")[3].trim() === "✓").length;
lines.push(`lab: ${labPass}/${labRows.length} (${lab.seconds} s)` + (labRows.length ? "" : ` — exit ${lab.code}, see lab.log`));
for (const l of labRows) if (l.split("|")[3].trim() !== "✓") lines.push(`  failed ${l.slice(0, 160)}`);
const s4 = {};
for (const r of results.filter((r) => r.name.startsWith("s4-")))
  for (const line of r.text.split("\n").filter((l) => l.startsWith("{"))) {
    const row = JSON.parse(line);
    const t = (s4[row.task] ??= { n: 0, independent: 0, all: 0, seconds: [], errors: 0 });
    t.n++;
    if (row.status !== "done") t.errors++;
    if (row.checks?.independentGameplay) t.independent++;
    if (row.checks && Object.values(row.checks).every(Boolean)) t.all++;
    t.seconds.push(Math.round(row.metrics.elapsedMs / 1000));
  }
const median = (v) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];
for (const [task, t] of Object.entries(s4))
  lines.push(`S4 ${task}: independent ${t.independent}/${t.n}, all checks ${t.all}/${t.n}, median ${median(t.seconds)} s${t.errors ? `, ${t.errors} not done` : ""}`);
for (const r of results.filter((r) => r.name.startsWith("case-"))) {
  const archive = /archive (\S+)/.exec(r.text)?.[1];
  let detail = `exit ${r.code}`;
  if (archive) {
    const rep = JSON.parse(readFileSync(join(archive, "report.json"), "utf8"));
    detail = rep.runs.map((t) => `${t.id} ${t.status} ${Math.round(t.elapsedMs / 1000)} s ${t.metrics.toolCalls} calls r${t.revision}`).join("; ");
    if (rep.resultReplay) detail += ` · replay: ${rep.resultReplay.summary}`;
  }
  lines.push(`${r.name}: ${detail}`);
}
const smoke = results.find((r) => r.name === "app-smoke");
if (smoke) {
  const s = smoke.text.indexOf("{\n");
  const j = s >= 0 ? JSON.parse(smoke.text.slice(s)) : null;
  lines.push(j ? `app-smoke: ${j.version} in ${j.seconds} s, ${j.calls?.length ?? "?"} calls, problems ${j.problems.length}` : `app-smoke: exit ${smoke.code}, see app-smoke.log`);
}
lines.push("", `logs: ${out}`);
writeFileSync(join(out, "summary.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
