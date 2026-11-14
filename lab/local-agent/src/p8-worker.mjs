// Worker entry for `p8` (Web Worker semantics: self.onmessage / self.postMessage).
// The first request is { init: { skillFiles } }; every later one is a p8Host request.
import { p8Host } from "./maker.mjs";

let handle;
self.onmessage = async ({ data: { id, request } }) => {
  try {
    if (request.init) {
      handle = p8Host(request.init);
      return self.postMessage({ id, result: true });
    }
    if (!handle) throw new Error("p8 worker is not initialised");
    self.postMessage({ id, result: await handle(request) });
  } catch (e) {
    self.postMessage({ id, error: String(e?.stack ?? e) });
  }
};
