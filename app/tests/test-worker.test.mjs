import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { emptySnapshot } from "../src/pico8/assets.js";
import { cartBytes } from "../src/pico8/cart.js";

test("real test Worker load creates fresh memory persistence and VM state", async (t) => {
  const entry = new URL("../src/test-worker.js", import.meta.url).href;
  const worker = new Worker(
    `
    const { parentPort } = require('node:worker_threads');
    globalThis.self = { postMessage: data => parentPort.postMessage(data) };
    import(${JSON.stringify(entry)}).then(() => {
      parentPort.on('message', data => self.onmessage({ data }));
      parentPort.postMessage({ ready: true });
    });
  `,
    { eval: true },
  );
  t.after(() => worker.terminate());
  await new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
  });
  let id = 0;
  const rpc = (action, args = {}) =>
    new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => {
        worker.off("message", onMessage);
        reject(Error("Worker timeout"));
      }, 5000);
      const onMessage = (data) => {
        if (data.id !== current) return;
        clearTimeout(timer);
        worker.off("message", onMessage);
        data.error ? reject(Error(data.error)) : resolve(data.result);
      };
      worker.on("message", onMessage);
      worker.postMessage({ id: current, action, ...args });
    });
  await rpc("init", {
    url: new URL("../public/player/main/player.mjs", import.meta.url).href,
  });
  const cart = cartBytes(
    emptySnapshot(`function _init() printh("boot") cartdata("fresh_fixture") n=dget(0) end
function _update() printh("tick") n+=1 dset(0,n) end
function _draw() cls(0) pset(0,0,n) end`),
  );
  await rpc("load", { cart });
  const first = await rpc("advance", { frames: 1, buttons: 0 });
  assert.equal(
    (await rpc("inspect", { request: { mode: "read", paths: [["n"]] } }))
      .inspection.values[0],
    1,
  );
  const debug = await rpc("inspect", {
    request: { mode: "debug", code: "n=8; return n" },
  });
  assert.equal(debug.inspection.values[0], 8);
  assert.deepEqual(debug.observation.frame.rgba, first.observation.frame.rgba);
  await rpc("advance", { frames: 10, buttons: 0 });
  await rpc("load", { cart });
  const fresh = await rpc("advance", { frames: 1, buttons: 0 });
  assert.deepEqual(
    first.observation.logs.entries.map((e) => e.text),
    ["boot", "tick"],
  );
  assert.deepEqual(fresh.observation.logs, first.observation.logs);
  assert.notEqual(fresh.observation.sessionId, first.observation.sessionId);
  assert.equal(
    fresh.observation.frame.frameId,
    first.observation.frame.frameId,
  );
  assert.deepEqual(fresh.observation.frame.rgba, first.observation.frame.rgba);
});
