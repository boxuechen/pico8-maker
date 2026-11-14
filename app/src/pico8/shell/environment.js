// The shell flow's environment for one cart: a just-bash shell over /cart (with
// /cart/main.lua mapped to the cart draft), the read-only pico8 skill at
// /skill/pico8 and `p8` running in a separate Worker. After a p8 command that
// runs main.lua, Maker commits a changed draft (Game.commit)
// and replays the tested route (Game.replayRoute), so versions,
// preview, playtest records and coverage stay Maker's own.
import { capabilities } from "../capabilities.js";
import { sameSnapshot } from "../assets.js";
import { parsePress } from "./checks.js";
import { durableEnv } from "./durable-env.js";
import { remoteP8 } from "./p8-remote.js";
import { CART, SKILL } from "./prompt.js";
import { withSoundBank } from "./sounds.js";

const WRITES = new Set(["writeFile", "appendFile", "mkdir", "rm", "cp", "mv", "chmod", "symlink", "link", "utimes"]);
const RUNS_MAIN = new Set(["check", "run", "look"]);

function readOnly(fs) {
  return new Proxy(fs, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== "function") return value;
      if (WRITES.has(prop))
        return async () => {
          throw new Error(`EROFS: ${SKILL} is read-only. Work in ${CART} (main.lua and your own files).`);
        };
      return value.bind(target);
    },
  });
}

/** p8 press text → Game route calls (≤ maxInputSteps steps and ≤ maxInputFrames frames each). */
export function routeCalls(press) {
  const calls = [];
  let steps = [],
    frames = 0;
  const flush = () => {
    if (steps.length) calls.push({ steps });
    (steps = []), (frames = 0);
  };
  for (const step of parsePress(press)) {
    let left = step.frames;
    while (left > 0) {
      if (steps.length === capabilities.maxInputSteps || frames === capabilities.maxInputFrames) flush();
      const n = Math.min(left, capabilities.maxInputFrames - frames);
      steps.push({ frames: n, buttons: step.bits });
      (frames += n), (left -= n);
    }
  }
  flush();
  return calls;
}

/**
 * @param game Maker's Game for the open cart
 * @param skillFiles { "SKILL.md": ..., "reference/api.md": ..., ... }
 * @param sendP8 request → response for a p8 host (see p8-remote.js)
 * @returns { env: pi-durable ExecutionEnv, exec(command) for tests }
 */
export async function createShellEnvironment({ game, skillFiles, sendP8 }) {
  const { Bash, defineCommand, InMemoryFs, MountableFs } = await import("just-bash");
  const cart = new InMemoryFs({ "/main.lua": game.draft.source });
  const skill = readOnly(new InMemoryFs(Object.fromEntries(Object.entries(skillFiles).map(([k, v]) => [`/${k}`, v]))));
  const fs = new MountableFs({
    base: new InMemoryFs({ "/tmp/.keep": "" }),
    mounts: [
      { mountPoint: CART, filesystem: cart },
      { mountPoint: SKILL, filesystem: skill },
    ],
  });
  // The draft is the truth for main.lua: copy it in before each operation and
  // back out after, so undo/restore and agent edits never diverge.
  const pull = async () => {
    const draft = game.draft.source;
    const here = (await cart.exists("/main.lua")) ? await cart.readFile("/main.lua", "utf8") : null;
    if (here !== draft) await cart.writeFile("/main.lua", draft);
  };
  const push = async () => {
    const here = (await cart.exists("/main.lua")) ? await cart.readFile("/main.lua", "utf8") : "";
    if (here !== game.draft.source) game.setDraft(here);
  };
  // The sound bank goes only into a cart's first version; existing carts keep their resources.
  const cartAssets = () => (game.hasGame ? game.draft.assets : withSoundBank(game.draft.assets));
  // Maker keeps 12 routes per cart, and the model runs p8 far more often than it
  // would record a route. Replay only routes that count as evidence: the last
  // `p8 run` of a bash command (a scan loop runs p8 many times), when it changed
  // g.mode (reached a result or retried) or is the first route on this revision;
  // never the same press twice on one revision.
  let pendingRoute = null;
  const recorded = new Map();
  const p8 = defineCommand("p8", async (args, ctx) => {
    await push();
    const plays = [];
    const r = await remoteP8(sendP8, { assets: async () => cartAssets(), onPlay: (p) => plays.push(p) })(args, ctx);
    await push();
    const notes = [];
    const file = args.slice(1).find((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
    if (RUNS_MAIN.has(args[0]) && (!file || ctx.fs.resolvePath(ctx.cwd, file) === `${CART}/main.lua`)) {
      notes.push(...(await commit(ctx.signal)));
      // Runs with --setup changed state by hand: not normal play, never recorded.
      const run = plays.findLast((p) => p.command === "run" && p.ok && !p.setup);
      if (run && game.hasGame && !game.cartSummary().draftDirty) pendingRoute = run;
    }
    return { ...r, stdout: r.stdout + notes.map((n) => `Maker: ${n}\n`).join("") };
  });

  async function commit(signal) {
    if (!game.draft.source.trim() || sameSnapshot(game.draft, game.snapshot)) return [];
    const assets = cartAssets();
    if (assets !== game.draft.assets) game.setWorking({ ...game.draft, assets });
    const result = await game.commit(signal);
    if (result.isError) {
      const first = result.output?.find((o) => o.type === "text")?.text ?? "";
      return [`not committed; the player keeps the last version. ${first.split("\n").at(-1)}`];
    }
    // The commit note carries the coverage facts for the new revision.
    const text = result.output?.find((o) => o.type === "text")?.text ?? "";
    const note = text.slice(text.indexOf("Committed as version")).split("\n")[0];
    const facts = note.startsWith("Committed as version") ? note.replace(/^Committed as version \d+\.\s*/, "") : "";
    return [`committed as version ${game.revision}; the player now runs it.${facts ? ` ${facts}` : ""} Only p8 run routes on this version count as tested.`];
  }
  // Record the tested route on the committed cart.
  async function replay({ press, modes }, signal) {
    const calls = routeCalls(press);
    const seen = recorded.get(game.revision) ?? new Set();
    recorded.set(game.revision, seen);
    if (!calls.length || seen.has(press) || (seen.size && !modes?.length)) return;
    seen.add(press);
    await game.replayRoute(calls, signal);
  }

  const bash = new Bash({ fs, cwd: CART, env: { HOME: CART, PWD: CART }, customCommands: [p8] });
  const exec = async (command, options) => {
    await pull();
    pendingRoute = null;
    try {
      return await bash.exec(command, options);
    } catch (e) {
      if (options?.signal?.aborted) throw e;
      return { stdout: "", stderr: `bash: ${e?.message ?? e}\n`, exitCode: 1 };
    } finally {
      await push();
      const route = pendingRoute;
      pendingRoute = null;
      if (route && game.hasGame && !game.cartSummary().draftDirty) await replay(route, options?.signal);
    }
  };
  const base = durableEnv({ fs, exec, cwd: CART });
  // Every file operation of the read/edit/write tools sees and updates the draft.
  const env = new Proxy(base, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== "function" || prop === "exec") return value;
      return async (...args) => {
        await pull();
        try {
          return await value.apply(target, args);
        } finally {
          await push();
        }
      };
    },
  });
  return { env, exec, fs };
}
