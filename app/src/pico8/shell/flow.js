// Open the agent environment for one Agent: start p8's Worker (or take the warm
// one), build the environment and the extension. Node callers (tests,
// evaluators) pass startP8.
import skillFiles from "../../generated/shell-skill.js";
import { createShellEnvironment } from "./environment.js";
import { createShellExtension } from "./extension.js";

const playerUrl = () =>
  new URL(`${import.meta.env?.BASE_URL ?? "/"}player/main/player.mjs`, globalThis.location?.href).href;

const startBrowser = async (url) => {
  const { startBrowserP8Worker } = await import("./p8-client.js");
  return startBrowserP8Worker({ playerUrl: url, skillFiles });
};

// One p8 Worker started while the page is idle, so the first conversation does
// not wait for the Worker, its player module and wasm. Used once, then replaced.
let warm = null;
export function prewarmShell() {
  if (warm || typeof Worker === "undefined") return;
  const url = playerUrl();
  warm = { url, worker: startBrowser(url).catch(() => null) };
}

export async function openShellFlow({ game, startP8 }) {
  const start =
    startP8 ??
    (async () => {
      // Game.mount sets game.url first thing; the same player module serves p8.
      const url = game.url ?? playerUrl();
      const ready = warm?.url === url ? await warm.worker : null;
      if (ready) {
        warm = null;
        setTimeout(prewarmShell, 0);
        return ready;
      }
      return startBrowser(url);
    });
  const worker = await start(skillFiles);
  try {
    const { env, exec } = await createShellEnvironment({ game, skillFiles, sendP8: worker.send });
    return {
      env,
      exec,
      extension: createShellExtension({ game, skillFiles }),
      close: () => worker.close(),
    };
  } catch (e) {
    await worker.close();
    throw e;
  }
}
