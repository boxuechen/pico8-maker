// Real-browser smoke of the product entry: home composer → MAKE → workbench,
// with a real provider and a temporary Chrome profile
// (the user's cart library is never touched). Reports the committed version,
// the tool steps shown in the conversation, console problems and a screenshot.
//
//   SMOKE_DEEPSEEK_KEY=... node scripts/evaluation/app-smoke.mjs
// Set SMOKE_CHROME_NO_SANDBOX=1 where Chrome's renderer sandbox crashes inside an outer sandbox.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { launchChrome, evaluate, delay } from "./chrome-cdp.mjs";

const apiKey = process.env.SMOKE_DEEPSEEK_KEY;
if (!apiKey) throw Error("SMOKE_DEEPSEEK_KEY is required");
const modelConfig = {
  provider: "deepseek",
  model: "deepseek-flash",
  baseUrl: "https://api.deepseek.com",
  apiKey,
  remember: true,
  thinkingLevel: "medium",
};
const port = 5188;
const origin = `http://127.0.0.1:${port}`;
const prompt =
  "Make a PICO-8 fruit catch game: move a basket left and right to catch falling fruit, 10 catches win, 3 misses lose, sounds for catching and missing, press X to restart after the end.";
const timeoutMs = 15 * 60 * 1000;
const out = new URL(`../../../.cache/evaluations/app-smoke-${crypto.randomUUID()}/`, import.meta.url);
await mkdir(out, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: new URL("../../", import.meta.url).pathname,
  stdio: "ignore",
});
for (let i = 0; ; i++) {
  try {
    if ((await fetch(origin + "/")).ok) break;
  } catch {}
  if (i > 300) throw Error("dev server did not start");
  await delay(200);
}
const chrome = await launchChrome({
  profilePrefix: "pico-maker-app-smoke-",
  extraFlags: process.env.SMOKE_CHROME_NO_SANDBOX ? ["--no-sandbox"] : [],
});
const { cdp } = chrome;
const problems = [];
await cdp.command("Runtime.enable");
await cdp.command("Page.enable");
await cdp.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const onMessage = ({ data }) => {
  const m = JSON.parse(String(data));
  if (m.method === "Runtime.exceptionThrown")
    problems.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type))
    problems.push(`${m.params.type}: ` + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
};
cdp.socket.addEventListener("message", onMessage);
const page = (expr) => evaluate(cdp, expr);
let exit = 1;
try {
  log(`Chrome ${chrome.version}`);
  await cdp.command("Page.navigate", { url: origin + "/" });
  await delay(1500);
  await page(`localStorage.setItem("pico-demo-model", ${JSON.stringify(JSON.stringify(modelConfig))}); localStorage.setItem("pico8-maker-lang", "en"); true`);
  await cdp.command("Page.navigate", { url: origin + "/" });
  for (let i = 0; ; i++) {
    if (await page(`!!document.querySelector('textarea[aria-label="Message"]') && !!document.querySelector('.composer-model-button:not(.unconfigured)')`)) break;
    if (i > 300) throw Error("home composer not ready");
    await delay(200);
  }
  // React controls the textarea: set through the native setter, then fire input.
  await page(`(() => {
    const ta = document.querySelector('textarea[aria-label="Message"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, ${JSON.stringify(prompt)});
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  for (let i = 0; await page(`!!document.querySelector('button.send')?.disabled`); i++) {
    if (i > 100) throw Error("send button stays disabled");
    await delay(100);
  }
  await page(`document.querySelector('button.send').click(); true`);
  log("sent from home");
  const started = Date.now();
  let sawRunning = false,
    lastSteps = "";
  for (;;) {
    const s = await page(`({
      running: !!document.querySelector('button.send.stop'),
      version: document.querySelector('.version-badge')?.textContent ?? "",
      steps: [...document.querySelectorAll('.tool-step, .tool-label, [class*="tool"]')].map((e) => e.textContent.trim()).filter(Boolean).slice(-6).join(" | ").slice(0, 300),
    })`);
    if (s.running) sawRunning = true;
    if (s.steps !== lastSteps) log("steps:", s.steps), (lastSteps = s.steps);
    if (sawRunning && !s.running) break;
    if (Date.now() - started > timeoutMs) throw Error("app smoke timed out");
    await delay(1000);
  }
  await delay(1500);
  const summary = await page(`({
    url: location.href,
    version: document.querySelector('.version-badge')?.textContent ?? "",
    tools: [...new Set([...document.querySelectorAll('[class*="tool"]')].map((e) => e.textContent.trim().split("\\n")[0]).filter(Boolean))].slice(0, 30),
    reply: [...document.querySelectorAll('[data-message-role="assistant"], .assistant, .message.assistant')].map((e) => e.textContent).at(-1)?.slice(0, 1200) ?? "",
    canvas: !!document.querySelector('canvas'),
  })`);
  // Tool calls and failed results from the stored conversation (IndexedDB).
  Object.assign(summary, await page(`new Promise((resolve) => {
    const open = indexedDB.open("pico8-maker", 1);
    open.onsuccess = () => {
      const req = open.result.transaction("carts").objectStore("carts").getAll();
      req.onsuccess = () => {
        const messages = [];
        const walk = (v) => {
          if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === "object") {
            if (v.role === "assistant" || v.role === "toolResult") messages.push(v);
            else Object.values(v).forEach(walk);
          }
        };
        walk(req.result);
        const calls = new Map();
        for (const m of messages) if (m.role === "assistant") for (const p of m.content ?? []) if (p.type === "toolCall") calls.set(p.id, p);
        const text = (m) => (m.content ?? []).map((p) => p.text ?? "").join("").slice(0, 400);
        const label = (c) => c ? (c.name === "bash" ? "bash: " + String(c.arguments?.command ?? "").slice(0, 120) : c.name + " " + JSON.stringify(c.arguments ?? {}).slice(0, 120)) : "?";
        resolve({
          calls: [...calls.values()].map(label),
          failedTools: messages.filter((m) => m.role === "toolResult" && m.isError).map((m) => ({ call: label(calls.get(m.toolCallId)), result: text(m) })),
        });
      };
    };
  })`));
  const shot = await cdp.command("Page.captureScreenshot", { format: "png" });
  await writeFile(new URL("workbench.png", out), Buffer.from(shot.data, "base64"));
  summary.seconds = Math.round((Date.now() - started) / 1000);
  summary.screenshot = new URL("workbench.png", out).pathname;
  summary.problems = problems;
  await writeFile(new URL("summary.json", out), JSON.stringify(summary, null, 2).replaceAll(apiKey, "[REDACTED]"));
  console.log(JSON.stringify(summary, null, 2));
  exit = 0;
} finally {
  cdp.socket.removeEventListener("message", onMessage);
  await chrome.close();
  server.kill("SIGTERM");
}
process.exit(exit);
