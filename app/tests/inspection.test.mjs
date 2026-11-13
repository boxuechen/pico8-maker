import test from "node:test";
import assert from "node:assert/strict";
import { TestGame } from "./helpers/game.mjs";
import { Game } from "../src/game.js";
import { cartBytes } from "../src/pico8/cart.js";
import { normalizePlaytests } from "../src/pico8/playtests.js";
const head = (r) => JSON.parse(r.output[0].text.split("\n")[0]);
const source = `g={moves=3,won=false}
function _update() if btnp(4) then g.moves-=1 end if g.moves==0 then g.won=true end end
function _draw() cls(g.won and 11 or 1) end`;
async function setup(t) {
  const g = new TestGame();
  t.after(() => g.dispose());
  await g.execute("load_game", { source });
  return g;
}
test("inspect reads without images; debug evidence, old frame and authored/live isolation are explicit", async (t) => {
  const g = await setup(t),
    bytes = cartBytes(g.snapshot),
    draft = g.draft,
    revision = g.revision;
  await g.live.advance({ frames: 1 });
  const live = g.live.observe();
  const frame = g.testFrame,
    seq = g.testStateSeq,
    run = g.playtests.active.id;
  let r = await g.execute("inspect_game", {
    mode: "read",
    paths: [["g", "moves"]],
  });
  assert.deepEqual(head(r).values, [3]);
  assert.equal(r.output.length, 1);
  assert.equal(g.testStateSeq, seq);
  r = await g.execute("inspect_game", {
    mode: "debug",
    code: 'g.moves=1; printh("injected"); return g.moves',
  });
  assert.equal(head(r).purpose, "debug");
  assert.equal(head(r).staleFrame, true);
  assert.equal(
    head(r).stateSeq,
    undefined,
    "internal sequences stay host-side",
  );
  assert.equal(g.testStateSeq, seq + 1);
  assert.equal(head(r).frameId, frame.frameId);
  assert.equal(g.testFrame, frame);
  assert.equal(head(r).run, run);
  assert.equal(JSON.parse(r.output[1].text).logs.entries[0].text, "injected");
  const observe = head(await g.execute("observe_game", {}));
  assert.equal(observe.staleFrame, true);
  assert.equal(observe.imageScale, 4);
  assert.equal(observe.purpose, "debug");
  assert.deepEqual(cartBytes(g.snapshot), bytes);
  assert.equal(g.draft, draft);
  assert.equal(g.revision, revision);
  assert.deepEqual(g.live.observe(), live);
  await g.execute("press_buttons", { steps: [{ frames: 1, buttons: 16 }] });
  assert.equal(
    head(
      await g.execute("inspect_game", { mode: "read", paths: [["g", "won"]] }),
    ).values[0],
    true,
  );
  assert.equal(g.frameStateSeq, g.testStateSeq);
  assert.equal(
    head(await g.execute("observe_game", {})).staleFrame,
    undefined,
    "a completed frame after debug is current",
  );
  const restored = normalizePlaytests(g.playtests.runs);
  assert.equal(restored[0].purpose, "debug");
  assert.equal(restored[0].debugEvents[0].status, "completed");
  await g.execute("reset_game", {});
  assert.notEqual(g.playtests.active.id, run);
  assert.equal(g.playtests.active.purpose, "normal");
  assert.deepEqual(
    head(
      await g.execute("inspect_game", {
        mode: "read",
        paths: [
          ["g", "moves"],
          ["g", "won"],
        ],
      }),
    ).values,
    [3, false],
  );
  // The same final source wins via ordinary input without injecting state.
  await g.execute("press_buttons", {
    steps: [
      { frames: 1, buttons: 16, tap: true },
      { frames: 1, buttons: 16, tap: true },
      { frames: 1, buttons: 16, tap: true },
    ],
  });
  assert.equal(
    head(
      await g.execute("inspect_game", { mode: "read", paths: [["g", "won"]] }),
    ).values[0],
    true,
  );
  assert.equal(g.playtests.active.purpose, "normal");
});
test("invalid inspection has no dispatch; executed errors and lost replies remain debug until reset", async (t) => {
  const g = await setup(t),
    rpc = g.rpc.bind(g);
  let calls = 0;
  g.rpc = async (...args) => {
    calls++;
    return rpc(...args);
  };
  await assert.rejects(() =>
    g.execute("inspect_game", { mode: "read", paths: [["g"]], code: "g=0" }),
  );
  assert.equal(calls, 0);
  assert.equal(g.playtests.active.purpose, "normal");
  let result = await g.execute("inspect_game", {
    mode: "debug",
    code: 'g.moves=0; error("expected")',
  });
  assert.equal(result.isError, true);
  assert.equal(head(result).requiresReset, true);
  assert.equal(g.playtests.active.purpose, "debug");
  // Partial writes stay readable; only further execution needs a reset.
  assert.deepEqual(
    head(
      await g.execute("inspect_game", {
        mode: "read",
        paths: [["g", "moves"]],
      }),
    ).values,
    [0],
  );
  await assert.rejects(
    () => g.execute("press_buttons", { steps: [{ frames: 1, buttons: 0 }] }),
    /reset_game/,
  );
  await assert.rejects(
    () => g.execute("inspect_game", { mode: "debug", code: "return 1" }),
    /reset_game/,
  );
  await g.execute("reset_game", {});
  // A chunk the compiler rejects never ran: no debug label, event or stale image.
  const seqBefore = g.testStateSeq;
  result = await g.execute("inspect_game", { mode: "debug", code: "g.moves=" });
  assert.equal(result.isError, true);
  assert.equal(head(result).executed, false);
  assert.equal(head(result).purpose, "normal");
  assert.equal(head(result).staleFrame, undefined);
  assert.equal(head(result).requiresReset, undefined);
  assert.equal(g.testStateSeq, seqBefore);
  assert.equal(g.playtests.active.purpose, "normal");
  assert.equal(g.playtests.active.debugEvents.length, 0);
  assert.equal(normalizePlaytests(g.playtests.runs).at(-1).purpose, "normal");
  await g.execute("press_buttons", { steps: [{ frames: 1, buttons: 0 }] });
  g.rpc = async (action, args) => {
    if (action === "inspect") {
      await rpc(action, args);
      throw Error("lost reply");
    }
    return rpc(action, args);
  };
  await assert.rejects(
    () => g.execute("inspect_game", { mode: "debug", code: "g.moves=0" }),
    /lost reply/,
  );
  assert.equal(g.debugRequiresReset, true);
  assert.equal(g.playtests.active.debugEvents[0].status, "unknown");
  assert.equal(
    normalizePlaytests(g.playtests.runs).at(-1).debugEvents[0].reason,
    "lost reply",
  );
  assert.equal(normalizePlaytests(g.playtests.runs).at(-1).purpose, "debug");
  g.rpc = rpc;
  await g.execute("reset_game", {});
  assert.equal(g.debugRequiresReset, false);
});
test("STOP persists debug before dispatch, rejects the pending call, and ignores a late Worker reply", async (t) => {
  const g = await setup(t),
    rpc = g.rpc.bind(g),
    controller = new AbortController();
  let posted;
  g.worker = {
    postMessage: (data) => {
      posted = data;
      queueMicrotask(() => controller.abort());
    },
    terminate() {},
  };
  g.cancelTests = Game.prototype.cancelTests.bind(g);
  g.rpc = (action, args) =>
    action === "inspect"
      ? Game.prototype.rpc.call(g, action, args)
      : rpc(action, args);
  const saved = g.playtests.active;
  await assert.rejects(() =>
    g.execute(
      "inspect_game",
      { mode: "debug", code: "g.moves=0" },
      controller.signal,
    ),
  );
  assert.equal(posted.action, "inspect");
  assert.equal(saved.purpose, "debug");
  assert.equal(saved.debugEvents[0].status, "unknown");
  assert.equal(g.pending.has(posted.id), false);
  assert.equal(g.playtests.active, null);
  assert.equal(normalizePlaytests(g.playtests.runs).at(-1).purpose, "debug");
});

test("a fault before the next completed frame keeps the pre-debug image identity", async (t) => {
  const g = await setup(t);
  await g.execute("load_game", {
    source:
      'g={fail=false} function _update() if g.fail then error("fail") end end function _draw() cls(1) end',
  });
  const frameSeq = g.frameStateSeq;
  await g.execute("inspect_game", { mode: "debug", code: "g.fail=true" });
  const result = head(
    await g.execute("press_buttons", { steps: [{ frames: 1, buttons: 0 }] }),
  );
  assert.equal(result.execution.completedFrames, 0);
  assert.equal(result.staleFrame, true);
  assert.equal(g.frameStateSeq, frameSeq);
  assert.ok(g.testStateSeq > g.frameStateSeq);
});
