// Exercise the built/deployed UI with a local scripted provider and real WASM.
// Start: MOCK_MODEL_PORT=8791 node app/tests/mock-model.mjs
// Run: node app/scripts/evaluation/deployment-smoke.mjs <site-url>
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChrome, evaluate, delay } from "./chrome-cdp.mjs";

const site = new URL(process.argv[2] || "http://127.0.0.1:5177/pico8-maker/");
const fixture = process.env.MOCK_MODEL_URL || "http://127.0.0.1:8791";
const downloads = await mkdtemp(join(tmpdir(), "maker-deployment-downloads-"));
const browser = await launchChrome({ profilePrefix: "maker-deployment-" });
const errors = [];
let fixtureRequests = 0;
const origin = site.origin;
const run = (source) => evaluate(browser.cdp, source);
async function waitFor(source, description, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await run(source)) return;
    await delay(100);
  }
  throw new Error(
    `Timed out: ${description}. ${await run("document.body.innerText.slice(-2500)")}`,
  );
}
const click = (selector) =>
  run(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function fill(selector, value) {
  await run(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', {bubbles:true}));
  })()`);
}

browser.cdp.socket.addEventListener("message", async ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.method === "Runtime.exceptionThrown")
    errors.push(message.params.exceptionDetails.text);
  if (message.method === "Network.responseReceived") {
    const { response } = message.params;
    if (
      response.url.startsWith(origin) &&
      response.status >= 400 &&
      !response.url.endsWith("favicon.ico")
    )
      errors.push(`${response.status} ${response.url}`);
  }
  if (message.method !== "Fetch.requestPaused") return;
  const { requestId, request } = message.params;
  try {
    const headers = [
      { name: "Access-Control-Allow-Origin", value: origin },
      { name: "Access-Control-Allow-Headers", value: "*" },
      { name: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
    ];
    if (request.method === "OPTIONS") {
      await browser.cdp.command("Fetch.fulfillRequest", {
        requestId,
        responseCode: 204,
        responseHeaders: headers,
      });
      return;
    }
    fixtureRequests++;
    const response = await fetch(
      new URL(new URL(request.url).pathname, fixture),
      {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: request.postData,
      },
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    await browser.cdp.command("Fetch.fulfillRequest", {
      requestId,
      responseCode: response.status,
      responseHeaders: [
        ...headers,
        {
          name: "Content-Type",
          value: response.headers.get("content-type") || "text/plain",
        },
      ],
      body: bytes.toString("base64"),
    });
  } catch (error) {
    errors.push(error.message);
    await browser.cdp
      .command("Fetch.failRequest", { requestId, errorReason: "Failed" })
      .catch(() => {});
  }
});

try {
  await browser.cdp.command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.cdp.command("Network.enable");
  await browser.cdp.command("Fetch.enable", {
    patterns: [{ urlPattern: "https://model-fixture.invalid/*" }],
  });
  await browser.cdp.command("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloads,
  });
  await browser.cdp.command("Page.navigate", { url: site.href });
  await waitFor(
    `document.querySelector('[aria-label="Model settings"]')?.disabled === false`,
    "home ready",
  );
  assert.equal(
    await run(
      'new Set([...document.querySelectorAll("button.cart")].map(e=>e.getAttribute("aria-label"))).size',
    ),
    11,
  );
  const background = await run(
    'getComputedStyle(document.querySelector(".shell")).backgroundImage',
  );
  assert.ok(
    background.includes("/pico8-maker/assets/pico8-tv.png"),
    background,
  );
  await click('[aria-label="Model settings"]');
  await fill("dialog select", "custom");
  await fill('dialog input[type="url"]', "https://model-fixture.invalid/v1");
  await fill('dialog input[type="password"]', "fixture-dummy-key");
  await fill(
    'dialog input[placeholder="Model ID from your provider"]',
    "fixture-resources",
  );
  await click("dialog .dialog-actions .secondary");
  await waitFor(
    'document.querySelector("dialog .dialog-actions .secondary")?.disabled === false && document.querySelector("dialog .notice")?.textContent.length > 0',
    "connection probe",
  );
  const probe = await run(
    'document.querySelector("dialog .notice").textContent',
  );
  console.log(JSON.stringify({ connectionProbe: probe }));
  assert.ok(fixtureRequests >= 2, "image/tool probe reached scripted model");
  assert.ok(!/error|失败|不支持/i.test(probe), probe);
  await click("dialog .primary");
  await waitFor('!document.querySelector("dialog[open]")', "settings saved");
  await fill(
    "#game-prompt",
    "Make a small sprite scene with left/right movement and sound.",
  );
  await click('[aria-label="Send message"]');
  await waitFor(
    '!!document.querySelector("#name-dialog-title")',
    "cart naming",
  );
  await fill("dialog input", "Deployment smoke");
  await click("dialog .primary");
  await waitFor(
    `document.querySelector('.save-cart')?.disabled === false && !document.querySelector('[aria-label="Stop generation"]') && document.body.innerText.includes('资源联调完成')`,
    "cart creation and playtesting",
  );
  assert.equal(
    await run('document.querySelectorAll(".error[role=alert]").length'),
    0,
  );
  await click('[aria-label="Start playing"]');
  await waitFor(
    `!!document.querySelector('[aria-label="Pause game"]')`,
    "live player",
  );
  await delay(200);
  const before = await run(
    'document.querySelector(".player-mount canvas").toDataURL()',
  );
  await browser.cdp.command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await delay(200);
  await browser.cdp.command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  const after = await run(
    'document.querySelector(".player-mount canvas").toDataURL()',
  );
  assert.notEqual(
    after,
    before,
    "live keyboard input changes actual game pixels",
  );
  await click(".save-cart");
  let exported;
  for (let attempt = 0; attempt < 100; attempt++) {
    exported = (await readdir(downloads)).find((name) => name.endsWith(".p8"));
    if (exported) break;
    await delay(100);
  }
  assert.ok(exported, "SAVE CART downloads a .p8 file");
  const cart = await readFile(join(downloads, exported), "utf8");
  assert.ok(cart.startsWith("pico-8 cartridge"));
  assert.ok(
    cart.includes("resource test") &&
      cart.includes("__gfx__") &&
      cart.includes("__sfx__"),
  );
  await browser.cdp.command("Page.reload");
  await waitFor(
    'document.querySelector(".save-cart")?.disabled === false && document.body.innerText.includes("Deployment smoke")',
    "saved cart restored",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      site: site.href,
      provider: "scripted local fixture (not real AI)",
      fixtureRequests,
      gallery: 11,
      keyboardPixelsChanged: true,
      exported,
      restored: true,
      errors,
    }),
  );
} finally {
  await browser.close();
  await rm(downloads, { recursive: true, force: true });
}
