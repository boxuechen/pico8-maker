// Start the p8 Worker in the browser and talk to it one request per command.
import { portSender } from "./p8-remote.js";

export async function startBrowserP8Worker({ playerUrl, skillFiles }) {
  const worker = new Worker(new URL("./p8-worker.js", import.meta.url), { type: "module" });
  const send = portSender(worker);
  await send({ init: { url: playerUrl, skillFiles } });
  return { send, close: () => worker.terminate() };
}
