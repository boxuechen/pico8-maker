// Lab tasks on the host (Node only): the skill tree, task loading, scoring and
// run metrics, shared by bin/eval.mjs and browser/run.mjs.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadCasesText, scoreSource } from "./maker.mjs";
import { emptySnapshot, shooterCases, SKILL_DIR, verifyShooter } from "./maker.mjs";

const LAB = resolve(new URL("..", import.meta.url).pathname);

export function readTree(root) {
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
export const skillFiles = readTree(SKILL_DIR);

export function loadTask(id) {
  const dir = join(LAB, "tasks", id);
  const task = JSON.parse(readFileSync(join(dir, "task.json"), "utf8"));
  if (task.kind === "s4") {
    const c = shooterCases.find((x) => x.id === task.case);
    return { ...task, id, text: c.prompt, cart: { "main.lua": c.snapshot().source } };
  }
  return { ...task, id, dir, text: readFileSync(join(dir, "task.md"), "utf8").trim(), cart: readTree(join(dir, "start")) };
}

export async function score(task, source) {
  if (task.kind === "s4") {
    if (!source.trim()) return { pass: false, detail: "main.lua is empty" };
    const r = await verifyShooter(emptySnapshot(source));
    const failed = Object.entries(r.checks ?? {}).filter(([, v]) => v !== true && v?.passed !== true).map(([k]) => k);
    return { pass: r.passed, detail: r.passed ? "S4 oracle passed" : `S4 oracle failed: ${failed.join(", ") || "see report"}` };
  }
  return scoreSource(source, loadCasesText(readFileSync(join(task.dir, task.score), "utf8")));
}

export function metrics(events) {
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
