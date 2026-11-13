#!/usr/bin/env node
// Run the agent side in headless Chrome: a module Worker holds just-bash, an OPFS
// /cart, the real p8 (player wasm) and Pi's agent loop calling the model API.
//   node browser/run.mjs --probe                      p8 + shell + OPFS, no model
//   DEEPSEEK_API_KEY=... node browser/run.mjs --task T1 [--thinking high]
// Build first: node browser/build.mjs. Scoring is the same as bin/eval.mjs;
// results go to .cache/lab/browser-<run>/.
// SMOKE_CHROME_NO_SANDBOX=1 where Chrome's renderer sandbox fails inside an outer sandbox.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { launchChrome, delay } from "../../../app/scripts/evaluation/chrome-cdp.mjs";
import { piSystemPrompt, skillPrompt } from "../src/agent.mjs";
import { createEnvironment } from "../src/env.mjs";
import { loadTask, metrics, score, skillFiles } from "../src/tasks.mjs";

const { values: a } = parseArgs({
  options: {
    probe: { type: "boolean", default: false },
    task: { type: "string", default: "T1" },
    provider: { type: "string", default: "deepseek" },
    model: { type: "string", default: "deepseek-flash" },
    thinking: { type: "string", default: "high" },
    "time-ms": { type: "string", default: "600000" },
  },
});
const LAB = resolve(new URL("..", import.meta.url).pathname);
const DIR = join(LAB, "browser");
const PLAYER = join(LAB, "../../app/public/player");
const task = loadTask(a.task);
const model = { provider: a.provider, id: a.model, apiKey: process.env[`${a.provider.toUpperCase().replace(/-/g, "_")}_API_KEY`] };
if (!a.probe && !model.apiKey) throw new Error(`set ${a.provider.toUpperCase()}_API_KEY`);
const job = a.probe
  ? { mode: "probe", cart: task.cart, skillFiles }
  : {
      mode: "task",
      cart: task.cart,
      skillFiles,
      prompt: skillPrompt(skillFiles["SKILL.md"], task.text),
      systemPrompt: await piSystemPrompt(createEnvironment({ cartFiles: task.cart, skillFiles }), model),
      model,
      thinking: a.thinking,
      timeMs: Number(a["time-ms"]),
    };

const TYPES = { html: "text/html", js: "text/javascript", mjs: "text/javascript", wasm: "application/wasm", json: "application/json" };
let finish;
const done = new Promise((r) => (finish = r));
const body = (req) => new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => r(s)); });
const server = createServer(async (req, res) => {
  if (req.method === "POST") {
    const text = await body(req);
    if (req.url === "/progress") console.log("  ", text);
    if (req.url === "/result") finish(JSON.parse(text));
    return res.end();
  }
  if (req.url === "/job") return res.end(JSON.stringify(job));
  const file = req.url === "/" ? join(DIR, "page.html") : req.url === "/worker.js" ? join(DIR, "dist/worker.js") : req.url.startsWith("/player/") ? join(PLAYER, req.url.slice(8).split("?")[0]) : null;
  try {
    const data = readFileSync(file);
    res.writeHead(200, { "content-type": TYPES[file.split(".").pop()] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${server.address().port}/`;
const chrome = await launchChrome({ profilePrefix: "lab-browser-", extraFlags: process.env.SMOKE_CHROME_NO_SANDBOX ? ["--no-sandbox"] : [] });
await chrome.cdp.command("Runtime.enable");
chrome.cdp.socket.addEventListener("message", ({ data }) => {
  const m = JSON.parse(String(data));
  if (m.method === "Runtime.consoleAPICalled") console.log("  [console]", m.params.args?.map((x) => x.value ?? x.description).join(" ").slice(0, 300));
  if (m.method === "Runtime.exceptionThrown") console.log("  [exception]", m.params.exceptionDetails?.exception?.description?.slice(0, 500) ?? m.params.exceptionDetails?.text);
});
await chrome.cdp.command("Page.navigate", { url });
const result = await Promise.race([done, delay(Number(a["time-ms"]) + 60000).then(() => ({ status: "timeout", error: "no result from the page" }))]);
await chrome.close();
server.close();

if (a.probe) {
  console.log(JSON.stringify(result, null, 1));
  process.exitCode = /PASS boot/.test(result.steps?.[0]?.out ?? "") && result.memoryMatchesOpfs ? 0 : 1;
} else {
  const runId = "browser-" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 13) + "-" + Math.random().toString(36).slice(2, 6);
  const out = join(LAB, "../../.cache/lab", runId);
  mkdirSync(out, { recursive: true });
  const events = result.events ?? [];
  writeFileSync(join(out, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(join(out, "main.lua"), result.source ?? "");
  const s = await score(task, result.source ?? "");
  const row = { task: task.id, pass: s.pass, seconds: result.seconds, status: result.status, ...(result.error ? { error: result.error } : {}), files: result.files, ...metrics(events), score: s.detail };
  writeFileSync(join(out, "result.json"), JSON.stringify(row, null, 1));
  console.log(JSON.stringify({ ...row, final: undefined }));
  console.log("results:", out);
  if (!s.pass) process.exitCode = 1;
}
