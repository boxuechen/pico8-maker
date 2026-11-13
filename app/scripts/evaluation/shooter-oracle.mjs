import { createPico8Session } from "../../public/player/main/player.mjs";
import { cartBytes } from "../../src/pico8/cart.js";
import { fingerprint, normalCalls } from "../../src/pico8/playtests.js";
import { png } from "./png.mjs";
import { inputPlan } from "../../src/pico8/input-sequence.js";
const keys = [
  "mode",
  "player",
  "bullets",
  "hostiles",
  "enemies",
  "wave",
  "kills",
  "tick",
  "cooldown",
];
const rgb = {
  0: [0, 0, 0],
  8: [255, 0, 77],
  9: [255, 163, 0],
  10: [255, 236, 39],
  11: [0, 228, 54],
};
const input = (b) => ({
  controllers: [b, 0, 0, 0, 0, 0, 0, 0],
  devkit: {
    mouseXRaw: 0,
    mouseYRaw: 0,
    mouseButtons: 0,
    wheelRaw: 0,
    movementXRaw: 0,
    movementYRaw: 0,
    keypresses: [],
  },
});
export function luaValue(v) {
  if (v?.type === "table")
    return Object.fromEntries(
      v.entries.map((e) => [luaValue(e.key), luaValue(e.value)]),
    );
  if (v && typeof v === "object") throw Error(`Unreadable state: ${v.type}`);
  return v;
}
const list = (t) => Object.values(t ?? {});
export const pixel = (frame, x, y, c) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  rgb[c].every((v, i) => frame.rgba[(y * 128 + x) * 4 + i] === v);
async function snapshot(session) {
  const r = await session.inspect({
    mode: "read",
    paths: keys.map((k) => ["g", k]),
  });
  if (!r.ok || r.truncated || r.values.length !== keys.length)
    throw Error("State contract unavailable");
  const state = Object.fromEntries(
    keys.map((k, i) => [k, luaValue(r.values[i])]),
  );
  for (const name of ["bullets", "hostiles", "enemies"])
    state[name] = list(state[name]);
  if (
    !["play", "win", "lose"].includes(state.mode) ||
    !Number.isFinite(state.player?.hp) ||
    !Number.isFinite(state.kills)
  )
    throw Error("Invalid shooter state contract");
  return { state, frame: session.observe().frame };
}
export function tracker() {
  return {
    hits: 0,
    damage: 0,
    movingShot: false,
    coreLoop: false,
    victory: false,
    failure: false,
    retry: false,
    invulnerability: false,
    violations: [],
  };
}
export function track(t, b, a) {
  const s = a.state,
    p = b?.state,
    f = a.frame;
  const violation = (msg) => {
    if (!t.violations.includes(msg)) t.violations.push(msg);
  };
  if (!pixel(f, s.player.x, 112, 11)) violation("player state/pixels disagree");
  for (const e of s.enemies)
    if (!pixel(f, e.x, e.y, 8)) violation("enemy state/pixels disagree");
  if (!p) {
    if (
      s.mode !== "play" ||
      s.player.x !== 64 ||
      s.player.hp !== 3 ||
      s.kills !== 0 ||
      s.wave !== 1 ||
      s.enemies
        .map((e) => `${e.x},${e.y}`)
        .sort()
        .join(";") !== "32,24;64,24;96,24"
    )
      violation("invalid normal start");
    return;
  }
  if (p.mode === "play" && s.mode === "play") {
    if (
      s.bullets.some(
        (n) =>
          p.bullets.some((o) => n.x === o.x && n.y === o.y - 4) &&
          pixel(f, n.x, n.y, 10),
      )
    )
      t.movingShot = true;
    if (p.player.inv > 1 && s.player.hp < p.player.hp)
      violation("damage during invulnerability");
    if (
      s.player.hp === p.player.hp &&
      s.player.inv !== Math.max(0, p.player.inv - 1)
    )
      violation("invulnerability timer did not count down");
  }
  if (s.kills > p.kills) {
    const removed = p.enemies.filter(
      (e) =>
        !s.enemies.some((n) => n.x === e.x && n.y === e.y) || s.wave > p.wave,
    );
    const hits = removed.filter((e) =>
      p.bullets.some(
        (b) => Math.abs(b.x - e.x) < 5 && Math.abs(b.y - 4 - e.y) < 5,
      ),
    );
    if (s.kills - p.kills !== hits.length)
      violation("kill without matching projectile collision");
    else t.hits += hits.length;
    if (s.wave === p.wave && removed.some((e) => pixel(f, e.x, e.y, 8)))
      violation("removed enemy still visible");
  }
  if (s.player.hp < p.player.hp) {
    const hit = p.hostiles.some(
      (b) => Math.abs(b.x - s.player.x) < 5 && Math.abs(b.y + 3 - 112) < 5,
    );
    if (p.player.hp - s.player.hp !== 1 || !hit)
      violation("damage without hostile collision");
    else t.damage++;
    if (s.player.inv !== 20)
      violation("damage must start 20-frame invulnerability");
    else t.invulnerability = true;
  }
  t.coreLoop ||= t.movingShot && t.hits > 0;
  if (s.mode === "win") {
    if (
      t.hits === 6 &&
      s.kills === 6 &&
      s.wave === 2 &&
      s.enemies.length === 0 &&
      pixel(f, 0, 56, 11)
    )
      t.victory = true;
    else violation("unearned or invisible victory");
  }
  if (s.mode === "lose") {
    if (s.player.hp === 0 && t.damage === 3 && pixel(f, 0, 56, 8))
      t.failure = true;
    else violation("unearned or invisible failure");
  }
  if (p.mode !== "play" && s.mode === "play") {
    if (
      s.player.x === 64 &&
      s.player.hp === 3 &&
      s.player.inv === 0 &&
      s.wave === 1 &&
      s.kills === 0 &&
      s.tick <= 1 &&
      s.cooldown === 0 &&
      s.bullets.length === 0 &&
      s.hostiles.length === 0 &&
      s.enemies
        .map((e) => e.x)
        .sort((a, b) => a - b)
        .join(",") === "32,64,96" &&
      !pixel(f, 0, 56, 11) &&
      !pixel(f, 0, 56, 8)
    )
      t.retry = true;
    else violation("retry did not restore round state");
    t.hits = 0;
    t.damage = 0;
    t.movingShot = false;
  }
}
async function open(snapshotCart) {
  const session = await createPico8Session({ inspection: true });
  try {
    const loaded = await session.loadCart(cartBytes(snapshotCart));
    if (loaded.state === "faulted") throw Error("Cart failed to load");
    const run = await session.advance({ frames: 1, input: input(0) });
    if (run.outcome !== "completed") throw Error("Startup failed");
    return {
      session,
      current: await snapshot(session),
      t: tracker(),
      inputs: [],
    };
  } catch (e) {
    await session.dispose();
    throw e;
  }
}
async function step(ctx, buttons) {
  const r = await ctx.session.advance({ frames: 1, input: input(buttons) });
  if (r.outcome !== "completed") throw Error("Runtime did not complete frame");
  const last = ctx.inputs.at(-1);
  if (last?.buttons === buttons) last.frames++;
  else ctx.inputs.push({ frames: 1, buttons });
  const next = await snapshot(ctx.session);
  track(ctx.t, ctx.current, next);
  ctx.current = next;
  return next;
}
const capture = async (route, c) => ({
  route,
  state: c.current.state,
  steps: structuredClone(c.inputs),
  frameHash: await fingerprint(c.current.frame.rgba),
  image: {
    mimeType: "image/png",
    data: png(c.current.frame.rgba).toString("base64"),
  },
  tracker: structuredClone(c.t),
});
const coverage = (t, unknown = "failed") =>
  Object.fromEntries(
    ["coreLoop", "victory", "failure", "retry"].map((k) => [
      k,
      t.violations.length ? "failed" : t[k] ? "passed" : unknown,
    ]),
  );
export async function verifyShooter(cart) {
  const evidence = [],
    checks = {},
    contexts = [];
  let win, loss;
  try {
    const miss = await open(cart);
    contexts.push(miss);
    track(miss.t, null, miss.current);
    for (let i = 0; i < 28; i++) await step(miss, 1);
    for (let i = 0; i < 30; i++) await step(miss, 16);
    evidence.push(await capture("off-axis", miss));
    checks.offAxisCannotKill =
      miss.current.state.kills === 0 &&
      miss.current.state.enemies.length === 3 &&
      miss.t.movingShot;
    const w = await open(cart);
    contexts.push(w);
    track(w.t, null, w.current);
    for (let i = 0; i < 500 && w.current.state.mode === "play"; i++) {
      const s = w.current.state;
      const e = s.enemies.toSorted(
        (a, b) => Math.abs(a.x - s.player.x) - Math.abs(b.x - s.player.x),
      )[0];
      await step(
        w,
        e && Math.abs(e.x - s.player.x) > 1 ? (e.x < s.player.x ? 1 : 2) : 16,
      );
    }
    evidence.push(await capture("normal-win", w));
    await settleResult(w);
    await step(w, 32);
    evidence.push(await capture("retry-win", w));
    win = w.t;
    checks.normalWin = win.victory;
    checks.retryAfterWin = win.retry;
    const l = await open(cart);
    contexts.push(l);
    track(l.t, null, l.current);
    for (let i = 0; i < 300 && l.current.state.mode === "play"; i++)
      await step(l, 0);
    evidence.push(await capture("normal-loss", l));
    await settleResult(l);
    await step(l, 32);
    evidence.push(await capture("retry-loss", l));
    loss = l.t;
    checks.normalLoss = loss.failure;
    checks.retryAfterLoss = loss.retry;
    checks.invulnerability = loss.invulnerability;
    checks.stateAndPixels = [miss, w, l].every(
      (c) => c.t.violations.length === 0,
    );
  } catch (e) {
    checks.runtimeAndContract = false;
    evidence.push({ error: e.message });
  } finally {
    await Promise.all(contexts.map((c) => c.session.dispose()));
  }
  const combined = tracker();
  for (const t of [win, loss].filter(Boolean)) {
    for (const k of ["coreLoop", "victory", "failure", "retry"])
      combined[k] ||= t[k];
    combined.violations.push(...t.violations);
  }
  return {
    oracle: "two-wave-shooter-v1",
    cartHash: await fingerprint(cartBytes(cart)),
    checks,
    coverage: coverage(combined),
    evidence,
    passed:
      Object.values(checks).every(Boolean) &&
      Object.values(coverage(combined)).every((v) => v === "passed"),
  };
}

// The contract allows a short result lock (the published reset skeleton uses
// one), so release every button for one second before pressing X.
const resultSettleFrames = 30;
async function settleResult(c) {
  for (let i = 0; i < resultSettleFrames; i++) await step(c, 0);
}

// Re-run only the Agent's recorded normal input, with the final unmodified cart.
// A route stays debug once code runs, but calls before its first debug event
// started from a normal load/reset and are replayed as normal evidence; routes
// declared debug from the start never count (same rule as host coverage).
export async function verifyAgentRoutes(cart, runs, ledger) {
  const cartHash = await fingerprint(cartBytes(cart)),
    aggregate = tracker(),
    evidence = [];
  let firstCoreCall = null;
  for (const run of runs
    .filter((r) => r.cartHash === cartHash && !r.truncated)
    .map((r) => ({ ...r, calls: normalCalls(r) }))
    .filter((r) => r.calls.length)) {
    let c;
    try {
      c = await open(cart);
      track(c.t, null, c.current);
      let candidate = null;
      for (let i = 0; i < run.calls.length; i++) {
        const call = run.calls[i];
        if (call.outcome !== "completed") throw Error("Incomplete input route");
        const plan = inputPlan(call.input);
        if (
          call.completedFrames !== plan.total ||
          !call.frames.some((f) => f.afterFrames === plan.total)
        )
          throw Error("Incomplete route progress or final checkpoint");
        let left = call.completedFrames,
          at = 0;
        for (const s of plan.steps) {
          for (let j = 0; j < s.frames && left > 0; j++, left--) {
            await step(c, s.buttons);
            at++;
            const checkpoint = call.frames.find((f) => f.afterFrames === at);
            if (
              checkpoint &&
              checkpoint.hash !== (await fingerprint(c.current.frame.rgba))
            )
              throw Error("Recorded frame differs from fresh route");
          }
        }
        const ordinal = ledger.find(
          (l) => l.run === run.id && l.recordedCall === i + 1,
        )?.ordinal;
        if (c.t.coreLoop && candidate === null && Number.isInteger(ordinal))
          candidate = ordinal;
      }
      if (!c.t.violations.length) {
        for (const k of ["coreLoop", "victory", "failure", "retry"])
          aggregate[k] ||= c.t[k];
        if (candidate !== null)
          firstCoreCall =
            firstCoreCall === null
              ? candidate
              : Math.min(firstCoreCall, candidate);
      }
      evidence.push({
        run: run.id,
        coverage: coverage(c.t, "unknown"),
        violations: c.t.violations,
      });
    } catch (e) {
      evidence.push({ run: run.id, error: e.message });
    } finally {
      await c?.session.dispose();
    }
  }
  return {
    cartHash,
    coverage: coverage(aggregate, "unknown"),
    firstVerifiedCoreLoopCall: firstCoreCall,
    evidence,
  };
}
