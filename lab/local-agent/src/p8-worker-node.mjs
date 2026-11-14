// Node: run src/p8-worker.mjs in a worker_thread with the same self/postMessage
// shim Maker's evaluator uses for its test Worker.
import { Worker } from "node:worker_threads";
import { portSender } from "./p8-remote.mjs";

export async function startP8Worker(skillFiles) {
  const entry = new URL("./p8-worker.mjs", import.meta.url).href;
  const worker = new Worker(
    `const { parentPort } = require("node:worker_threads");
     globalThis.self = { postMessage: (d) => parentPort.postMessage(d) };
     import(${JSON.stringify(entry)}).then(() => parentPort.on("message", (data) => self.onmessage({ data })));`,
    { eval: true },
  );
  const send = portSender(worker);
  await send({ init: { skillFiles } });
  return { send, close: () => worker.terminate() };
}
