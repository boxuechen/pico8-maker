// Worker entry for `p8` (Web Worker semantics; Node uses a self/postMessage shim).
// First request: { init: { url, skillFiles } } where url is the player module.
import { p8Host } from "./p8-remote.js";
import { setSessionFactory } from "./runtime.js";

let handle;
self.onmessage = async ({ data: { id, request } }) => {
  try {
    if (request.init) {
      const player = await import(/* @vite-ignore */ request.init.url);
      setSessionFactory((options) => player.createPico8Session(options));
      handle = p8Host({ skillFiles: request.init.skillFiles });
      return self.postMessage({ id, result: true });
    }
    if (!handle) throw new Error("p8 worker is not initialised");
    self.postMessage({ id, result: await handle(request) });
  } catch (e) {
    self.postMessage({ id, error: String(e?.stack ?? e) });
  }
};
