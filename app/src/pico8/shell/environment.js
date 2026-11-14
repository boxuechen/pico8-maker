// The shell flow's environment for one cart: a just-bash shell over /cart (with
// /cart/main.lua and the resource files gfx/gff/map/sfx/music.txt mapped to the
// cart draft), the read-only pico8 skill at
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
import { applyResourceFiles, assetFiles, RESOURCE_FILES } from "./resource-files.js";

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
  // The draft is the truth for main.lua and the resource files: copy it in
  // before each operation and back out after, so undo/restore and agent edits
  // never diverge. Resource files are rewritten only when the draft's resources
  // changed elsewhere (undo, another conversation) or a file is missing, so a
  // malformed edit stays for p8 to report instead of being overwritten.
  let synced = null;
  const pull = async () => {
    // A new cart gets the skill's sound bank in sfx 0-7 before anything reads sfx.txt.
    if (!game.hasGame) {
      const banked = withSoundBank(game.draft.assets);
      if (banked !== game.draft.assets) game.setWorking({ ...game.draft, assets: banked });
    }
    const draft = game.draft.source;
    const here = (await cart.exists("/main.lua")) ? await cart.readFile("/main.lua", "utf8") : null;
    if (here !== draft) await cart.writeFile("/main.lua", draft);
    const assets = game.draft.assets;
    const missing = [];
    for (const name of RESOURCE_FILES) if (!(await cart.exists(`/${name}`))) missing.push(name);
    if (assets !== synced || missing.length) {
      const files = assetFiles(assets);
      for (const name of assets !== synced ? RESOURCE_FILES : missing) await cart.writeFile(`/${name}`, files[name]);
      synced = assets;
    }
  };
  const push = async () => {
    const here = (await cart.exists("/main.lua")) ? await cart.readFile("/main.lua", "utf8") : "";
    if (here !== game.draft.source) game.setDraft(here);
    const files = {};
    for (const name of RESOURCE_FILES) if (await cart.exists(`/${name}`)) files[name] = await cart.readFile(`/${name}`, "utf8");
    const { assets, errors } = applyResourceFiles(game.draft.assets, files);
    if (!errors.length && assets !== game.draft.assets) {
      game.setWorking({ ...game.draft, assets });
      synced = assets;
    }
  };
  // The sound bank goes only into a cart's first version; existing carts keep their resources.
  const cartAssets = () => (game.hasGame ? game.draft.assets : withSoundBank(game.draft.assets));
  // Maker keeps 12 routes per cart, and the model runs p8 far more often than it
  // would record a route. Replay only routes that count as evidence: per bash
  // command, every `p8 run` that entered a g.mode no recorded route on this
  // revision has entered yet (at most 3; a scan loop runs p8 many times), or else
  // its last run when this revision has no route yet; never the same press twice.
  // (Only the last run used to count, so `lose; lose+retry; wait*90` lost the loss.)
  let pendingRoutes = [];
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
      const run = plays.some((p) => p.command === "run" && p.ok && !p.setup);
      const current = game.hasGame && !game.cartSummary().draftDirty;
      if (run && current)
        pendingRoutes.push(...plays.filter((p) => p.command === "run" && p.ok && !p.setup).map((p) => ({ ...p, revision: game.revision })));
      if (current) notes.push(...setupOnly(plays));
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
    // A commit (new or replacing this request's version) starts fresh route evidence.
    recorded.delete(game.revision);
    reached.delete(game.revision);
    // The commit note carries the coverage facts for the new revision.
    const text = result.output?.find((o) => o.type === "text")?.text ?? "";
    const note = text.slice(text.indexOf("Committed as version")).split("\n")[0];
    const facts = note.startsWith("Committed as version") ? note.replace(/^Committed as version \d+\.\s*/, "") : "";
    return [`committed as version ${game.revision}; the player now runs it.${facts ? ` ${facts}` : ""} Only p8 run routes on this version count as tested.`];
  }
  // g.mode values reached with presses only, per committed revision. Models often
  // reach a loss or a retry only with --setup and then report it as verified;
  // say so on the run that does it.
  const reached = new Map();
  function setupOnly(plays) {
    const seen = reached.get(game.revision) ?? new Set();
    reached.set(game.revision, seen);
    for (const p of plays) if (p.command === "run" && p.ok && !p.setup) for (const m of p.modes) seen.add(m);
    const byHand = [...new Set(plays.filter((p) => p.ok && p.setup).flatMap((p) => p.modes))].filter((m) => !seen.has(m));
    if (!byHand.length) return [];
    const names = byHand.map((m) => `g.mode ${JSON.stringify(m)}`).join(" and ");
    return [`${names} reached only with --setup on version ${game.revision} (state set by hand). Before calling it verified, reach it with presses only: p8 run --press "..." without --setup; otherwise list it under Unverified.`];
  }
  // Record the tested route on the committed cart.
  async function replay(runs, signal) {
    const rev = game.revision;
    const state = recorded.get(rev) ?? { presses: new Set(), modes: new Set() };
    recorded.set(rev, state);
    const mine = runs.filter((r) => r.revision === rev && !state.presses.has(r.press) && routeCalls(r.press).length);
    const picked = [];
    for (const r of mine) {
      const fresh = (r.modes ?? []).filter((m) => !state.modes.has(m));
      if (picked.length < 3 && fresh.length) picked.push(r), fresh.forEach((m) => state.modes.add(m));
    }
    if (!picked.length && !state.presses.size && mine.length) picked.push(mine.at(-1));
    for (const r of picked) {
      state.presses.add(r.press);
      for (const m of r.modes ?? []) state.modes.add(m);
      await game.replayRoute(routeCalls(r.press), signal);
    }
  }

  const bash = new Bash({ fs, cwd: CART, env: { HOME: CART, PWD: CART }, customCommands: [p8] });
  const exec = async (command, options) => {
    await pull();
    pendingRoutes = [];
    try {
      return await bash.exec(command, options);
    } catch (e) {
      if (options?.signal?.aborted) throw e;
      return { stdout: "", stderr: `bash: ${e?.message ?? e}\n`, exitCode: 1 };
    } finally {
      await push();
      const routes = pendingRoutes;
      pendingRoutes = [];
      if (routes.length && game.hasGame && !game.cartSummary().draftDirty) await replay(routes, options?.signal);
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
