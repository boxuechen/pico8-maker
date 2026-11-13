import { createServer } from "node:http";
import { readFileSync } from "node:fs";
// Load page.html in headless Chrome and print what the bundled tools and OPFS did.
// SMOKE_CHROME_NO_SANDBOX=1 where Chrome's renderer sandbox fails inside an outer sandbox.
import { launchChrome, evaluate, delay } from "../../../app/scripts/evaluation/chrome-cdp.mjs";
const dir = new URL(".", import.meta.url).pathname;
const server = createServer((req, res) => {
  const f = req.url === "/" ? "page.html" : req.url === "/tools.js" ? "dist/tools.js" : req.url.slice(1);
  let body;
  try { body = readFileSync(dir + f); } catch { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : "text/javascript" });
  res.end(body);
}).listen(5191, "127.0.0.1");
const keep = setInterval(() => {}, 1000);
const chrome = await launchChrome({ profilePrefix: "probe-", extraFlags: process.env.SMOKE_CHROME_NO_SANDBOX ? ["--no-sandbox"] : [] });
await chrome.cdp.command("Runtime.enable");
await chrome.cdp.command("Page.navigate", { url: "http://127.0.0.1:5191/" });
let r;
for (let i = 0; i < 60 && !r; i++) { await delay(250); r = await evaluate(chrome.cdp, "window.__probe ?? null"); }
console.log(JSON.stringify(r, null, 1));
await chrome.close(); server.close(); clearInterval(keep);
if (!r?.ok) process.exitCode = 1;
