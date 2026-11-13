// Real-browser end-to-end smoke for the frozen agent flow: dev server, headless
// Chrome, the production Game (browser Worker, canvas PNG) and Agent driven
// through the case-study page with a real provider. The key is read from the
// environment, written only into the temporary Chrome profile, and redacted
// from the archive by the page itself.
//
//   SMOKE_DEEPSEEK_KEY=... node scripts/evaluation/browser-smoke.mjs
import { spawn } from "node:child_process";
import {
  launchChrome,
  evaluate,
  delay,
} from "./chrome-cdp.mjs";

const apiKey = process.env.SMOKE_DEEPSEEK_KEY;
if (!apiKey) throw Error("SMOKE_DEEPSEEK_KEY is required");
const port = 5187;
const origin = `http://127.0.0.1:${port}`;
const prompt =
  "做一个 PICO-8 接水果小游戏：左右移动篮子接住掉落的水果，接到 10 个获胜，漏掉 3 个失败，接到和漏掉都有音效，结束后可以重开。";
const timeoutMs = 15 * 60 * 1000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const server = spawn(
  "npx",
  ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: new URL("../../", import.meta.url).pathname,
    stdio: "ignore",
  },
);
for (let i = 0; ; i++) {
  try {
    if ((await fetch(origin + "/")).ok) break;
  } catch {}
  if (i > 300) throw Error("dev server did not start");
  await delay(200);
}
// Chrome's own renderer sandbox crashes the tab inside some outer sandboxes;
// the smoke only loads the local dev server, so allow disabling it explicitly.
const chrome = await launchChrome({
  profilePrefix: "pico-maker-smoke-",
  extraFlags: process.env.SMOKE_CHROME_NO_SANDBOX ? ["--no-sandbox"] : [],
});
const { cdp } = chrome;
const problems = [];
await cdp.command("Runtime.enable");
const onMessage = ({ data }) => {
  const m = JSON.parse(String(data));
  if (m.method === "Runtime.exceptionThrown")
    problems.push(
      "exception: " +
        (m.params.exceptionDetails.exception?.description ??
          m.params.exceptionDetails.text),
    );
  if (
    m.method === "Runtime.consoleAPICalled" &&
    ["error", "warning"].includes(m.params.type)
  )
    problems.push(
      `${m.params.type}: ` +
        m.params.args
          .map((a) => a.value ?? a.description ?? "")
          .join(" ")
          .slice(0, 300),
    );
};
cdp.socket.addEventListener("message", onMessage);
let exit = 1;
try {
  log(`Chrome ${chrome.version}`);
  await cdp.command("Page.navigate", { url: origin + "/" });
  await delay(1500);
  await evaluate(
    cdp,
    `localStorage.setItem("pico-demo-model", JSON.stringify({provider:"deepseek",model:"deepseek-flash",baseUrl:"https://api.deepseek.com",apiKey:${JSON.stringify(apiKey)},remember:true,thinkingLevel:"high"})); true`,
  );
  await cdp.command("Page.navigate", {
    url: origin + "/scripts/evaluation/case-study.html",
  });
  for (let i = 0; ; i++) {
    const status = await evaluate(
      cdp,
      "document.getElementById('status')?.textContent ?? ''",
    );
    if (status.startsWith("准备就绪")) break;
    if (i > 300) throw Error("case page not ready: " + status);
    await delay(200);
  }
  await evaluate(
    cdp,
    `document.getElementById('prompt').value=${JSON.stringify(prompt)}; document.getElementById('send').click(); true`,
  );
  log("sent");
  const started = Date.now();
  let last = "";
  for (;;) {
    const history = await evaluate(
      cdp,
      "document.getElementById('history').textContent",
    );
    const status = await evaluate(
      cdp,
      "document.getElementById('status').textContent",
    );
    if (status !== last && /tools/.test(status) && Date.now() % 4 < 1)
      log(status);
    last = status;
    if (history.trim()) {
      log("result:", history.trim());
      log("status:", status);
      break;
    }
    if (Date.now() - started > timeoutMs + 60000)
      throw Error("smoke timed out");
    await delay(1000);
  }
  const summary = await evaluate(
    cdp,
    `({archive: document.getElementById('archive').textContent, revision: document.getElementById('revision').textContent, response: document.getElementById('response').textContent.slice(0, 3000)})`,
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log("browser problems:", problems.length ? problems : "none");
  exit = 0;
} finally {
  cdp.socket.removeEventListener("message", onMessage);
  await chrome.close();
  server.kill("SIGTERM");
}
process.exit(exit);
