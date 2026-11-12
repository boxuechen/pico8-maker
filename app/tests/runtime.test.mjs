import test from "node:test";
import assert from "node:assert/strict";
import { createPico8Session } from "../public/player/main/player.mjs";
import { sampleSource, cartBytes } from "../src/sample.js";
const input = (buttons) => ({
  controllers: [buttons, 0, 0, 0, 0, 0, 0, 0],
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
function robot(frame) {
  const points = [];
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      if (
        frame.rgba[i] === 0 &&
        frame.rgba[i + 1] === 228 &&
        frame.rgba[i + 2] === 54
      )
        points.push([x, y]);
    }
  assert.ok(points.length, "robot must be visible");
  return {
    x: Math.min(...points.map((p) => p[0])),
    y: Math.min(...points.map((p) => p[1])),
  };
}
async function jump(session) {
  await session.advance({ frames: 24, input: input(2) });
  await session.advance({ frames: 1, input: input(34) });
  return session.advance({ frames: 45, input: input(2) });
}
test("same real WASM input fails before jump fix and clears unchanged wall after", async (t) => {
  const session = await createPico8Session();
  t.after(() => session.dispose());
  await session.loadSource(sampleSource);
  const before = await jump(session);
  assert.equal(before.outcome, "completed");
  assert.deepEqual(robot(before.observation.frame), { x: 58, y: 100 });
  await session.loadSource(
    sampleSource.replace("jump_speed=-3", "jump_speed=-4.5"),
  );
  const after = await jump(session);
  assert.equal(after.outcome, "completed");
  const position = robot(after.observation.frame);
  assert.ok(position.x > 78, JSON.stringify(position));
  assert.equal(position.y, 100, "must land");
});
test("invalid Lua is diagnosed and a valid .p8 export loads again", async (t) => {
  const session = await createPico8Session();
  t.after(() => session.dispose());
  assert.equal((await session.loadSource("function broken(")).state, "faulted");
  assert.equal(
    (await session.loadCart(cartBytes(sampleSource))).state,
    "ready",
  );
  assert.equal((await session.advance({ frames: 1 })).outcome, "completed");
});
test("infinite guest code is bounded by VM instruction budget", async (t) => {
  const session = await createPico8Session();
  t.after(() => session.dispose());
  const result = await session.loadSource(
    "function _init() while true do end end",
    { instructionBudget: 10000 },
  );
  assert.equal(result.state, "faulted");
  assert.ok(result.diagnostics.length);
});
