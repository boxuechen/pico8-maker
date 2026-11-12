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

test("actual test worker uses player safety defaults and advances 600 frames", async (t) => {
  let reply;
  const previousSelf = globalThis.self;
  globalThis.self = {
    postMessage(value) {
      reply = value;
    },
  };
  t.after(() => {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  });
  await import("../src/test-worker.js");
  const send = async (data) => {
    await self.onmessage({ data: { id: 1, ...data } });
    assert.equal(reply.error, undefined);
    return reply.result;
  };
  await send({
    action: "init",
    url: new URL("../public/player/main/player.mjs", import.meta.url).href,
  });
  const source =
    "function _init() local n=0 for i=1,1000 do for j=1,1000 do n+=1 end end end function _draw() cls(1) end";
  const limited = await createPico8Session();
  t.after(() => limited.dispose());
  assert.equal(
    (await limited.loadSource(source, { instructionBudget: 1000000 })).state,
    "faulted",
  );
  assert.equal((await send({ action: "load", source })).state, "ready");
  const advanced = await send({ action: "advance", frames: 600, buttons: 0 });
  assert.equal(advanced.outcome, "completed");
  assert.equal(advanced.completedFrames, 600);
  const infinite = await send({
    action: "load",
    source: "function _init() while true do end end",
  });
  assert.equal(
    infinite.state,
    "faulted",
    "default VM safety still stops infinite code",
  );
});
