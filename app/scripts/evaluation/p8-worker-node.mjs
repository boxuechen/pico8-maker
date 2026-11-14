// Node: run the shell flow's p8 Worker (src/pico8/shell/p8-worker.js) in a
// worker_thread with the self/postMessage shim the evaluator uses for its test Worker.
import { Worker } from "node:worker_threads";
import { portSender } from "../../src/pico8/shell/p8-remote.js";

export async function startNodeP8Worker(skillFiles) {
  const entry = new URL("../../src/pico8/shell/p8-worker.js", import.meta.url).href;
  const playerUrl = new URL("../../public/player/main/player.mjs", import.meta.url).href;
  const worker = new Worker(
    `const { parentPort } = require("node:worker_threads");
     globalThis.self = { postMessage: (d) => parentPort.postMessage(d) };
     import(${JSON.stringify(entry)}).then(() => parentPort.on("message", (data) => self.onmessage({ data })));`,
    { eval: true, execArgv: [] },
  );
  const send = portSender(worker);
  await send({ init: { url: playerUrl, skillFiles } });
  return { send, close: () => worker.terminate() };
}
