#!/usr/bin/env node
// Generic result check for case reruns: replay every normal-input route the
// Agent recorded on the final revision in a fresh session (the same seeded
// runtime p8 uses), read g.mode after every frame and report whether normal
// play reached a win, a loss and a restart after a result. Carts without a
// string g.mode are reported as not machine-checkable (toys, other state names).
//
//   node scripts/evaluation/result-replay.mjs <case-archive-dir>...   rechecks archives
import { readFile, writeFile } from "node:fs/promises";
import { createPico8Session } from "../../public/player/main/player.mjs";
import { inputPlan } from "../../src/pico8/input-sequence.js";
import { Runtime, setSessionFactory } from "../../src/pico8/shell/runtime.js";

setSessionFactory(createPico8Session);

const RESULT = /^(win|won|victory|clear|cleared|complete|lose|lost|over|gameover|dead|fail)/;
const kind = (mode) => (/^(win|won|victory|clear|complete)/.test(mode) ? "win" : RESULT.test(mode) ? "lose" : null);

/** One route → { run, calls, frames, modes: [{frame, mode}], win, lose, restart, fault } */
async function replayRoute(snapshot, route) {
  const rt = new Runtime(snapshot.assets);
  try {
    const loaded = await rt.load(snapshot.source);
    if (!loaded.ok) return { run: route.id, fault: "does not boot" };
    let mode = (await rt.read(["g.mode"]))["g.mode"];
    const modes = [{ frame: rt.frames, mode }];
    let fault = null;
    for (const call of route.calls) {
      for (const step of inputPlan(call.input).steps) {
        const r = await rt.advance(step.buttons, step.frames, async (frame) => {
          const now = (await rt.read(["g.mode"]))["g.mode"];
          if (now !== mode) modes.push({ frame, mode: now }), (mode = now);
        });
        if (r.fault) {
          fault = r.fault.map((d) => d.message).join("; ");
          break;
        }
      }
      if (fault) break;
    }
    const kinds = modes.map((m) => (typeof m.mode === "string" ? kind(m.mode.toLowerCase()) : null));
    const firstResult = kinds.findIndex(Boolean);
    return {
      run: route.id,
      calls: route.calls.length,
      frames: rt.frames,
      modes,
      win: kinds.includes("win"),
      lose: kinds.includes("lose"),
      restart: firstResult >= 0 && kinds.slice(firstResult + 1).some((k, i) => !k && typeof modes[firstResult + 1 + i].mode === "string"),
      ...(fault ? { fault } : {}),
    };
  } finally {
    await rt.dispose();
  }
}

/** Final snapshot + recorded playtests → { tracked, routes, win, lose, restart, summary } */
export async function resultReplay(snapshot, playtests, revision) {
  const routes = (playtests ?? []).filter((r) => r.revision === revision && r.purpose === "normal" && !r.debugEvents?.length && r.calls?.length);
  const probe = new Runtime(snapshot.assets);
  let tracked = false;
  try {
    if ((await probe.load(snapshot.source)).ok) tracked = typeof (await probe.read(["g.mode"]))["g.mode"] === "string";
  } finally {
    await probe.dispose();
  }
  const replays = [];
  for (const route of routes) replays.push(await replayRoute(snapshot, route));
  const any = (k) => replays.filter((r) => r[k]).map((r) => r.run);
  const result = { tracked, revision, routes: replays.length, win: any("win"), lose: any("lose"), restart: any("restart"), replays };
  const yes = (list) => (list.length ? `yes (${list.join(", ")})` : "no");
  result.summary = !tracked
    ? `no string g.mode on the final version; ${replays.length} normal route(s), results not machine-checkable`
    : !replays.length
      ? "no normal-input route on the final version"
      : `${replays.length} normal route(s): win ${yes(result.win)}, loss ${yes(result.lose)}, restart after a result ${yes(result.restart)}`;
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const dir of process.argv.slice(2)) {
    const report = JSON.parse(await readFile(new URL("report.json", `file://${dir.replace(/\/?$/, "/")}`), "utf8"));
    const last = report.runs.at(-1);
    const r = await resultReplay(last.after, report.playtests, last.revision);
    await writeFile(new URL("result-replay.json", `file://${dir.replace(/\/?$/, "/")}`), JSON.stringify(r, null, 1));
    console.log(`${dir.split("/").filter(Boolean).at(-1)}: r${last.revision} · ${r.summary}`);
  }
  process.exit(0);
}
