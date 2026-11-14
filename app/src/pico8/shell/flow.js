// Open the shell flow for one Agent: start p8's Worker, build the environment
// and the extension. Node callers (tests, evaluators) pass startP8.
import skillFiles from "../../generated/shell-skill.js";
import { createShellEnvironment } from "./environment.js";
import { createShellExtension } from "./extension.js";

const playerUrl = () =>
  new URL(`${import.meta.env?.BASE_URL ?? "/"}player/main/player.mjs`, globalThis.location?.href).href;

export async function openShellFlow({ game, knowledge, startP8 }) {
  const start =
    startP8 ??
    (async (files) => {
      const { startBrowserP8Worker } = await import("./p8-client.js");
      return startBrowserP8Worker({ playerUrl: playerUrl(), skillFiles: files });
    });
  const worker = await start(skillFiles);
  try {
    const { env, exec } = await createShellEnvironment({ game, skillFiles, sendP8: worker.send });
    return {
      env,
      exec,
      extension: createShellExtension({ game, knowledge, skillFiles }),
      close: () => worker.close(),
    };
  } catch (e) {
    await worker.close();
    throw e;
  }
}
