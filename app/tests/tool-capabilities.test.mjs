import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/game.js";
import { TestGame, input } from "./helpers/game.mjs";
import { fixtureSnapshot } from "../scripts/evaluation/skills-cases.mjs";
import { inputPlan } from "../src/pico8/input-sequence.js";
import {
  emptySnapshot,
  editAssets,
  decodeAssets,
} from "../src/pico8/assets.js";
import { renderMap } from "../src/pico8/asset-preview.js";
import { cartBytes } from "../src/pico8/cart.js";
import { createPico8Session } from "../public/player/main/player.mjs";
import { describeTool } from "../src/workbench-state.js";
import { Agent } from "./helpers/knowledge.mjs";
import { defaultConfig } from "../src/model-config.js";

const headers = (r) =>
  r.output
    .filter((p) => p.type === "text")
    .map((p) => JSON.parse(p.text.split("\n")[0]));
function gameFor(t, snapshot = fixtureSnapshot()) {
  const g = new TestGame();
  g.versions = [snapshot];
  g.draft = { ...snapshot };
  t.after(() => g.dispose());
  return g;
}
test("invalid complete input plans have no player or runtime side effects", async () => {
  const g = new Game(() => {}, { versions: [fixtureSnapshot()] });
  g.ensureWorker = () => assert.fail("invalid request initialized the Worker");
  g.player = { pause: () => assert.fail("invalid request paused the player") };
  for (const args of [
    { steps: [] },
    { steps: [{ frames: 1, buttons: 2 }], frames: 1 },
    {
      steps: [
        { frames: 500, buttons: 2 },
        { frames: 101, buttons: 0 },
      ],
    },
    {
      steps: [
        { frames: 10, buttons: 2 },
        { frames: 1, buttons: 64 },
      ],
    },
    { frames: 10, buttons: 2, captureFrames: [11] },
    { frames: 10, buttons: 2, captureFrames: [2, 2] },
    { frames: 10, buttons: 2, captureFrames: [4, 2] },
    {
      frames: 10,
      buttons: 2,
      captureFrames: Array.from({ length: 8 }, (_, i) => i + 1),
    },
  ])
    await assert.rejects(g.execute("press_buttons", args));
  assert.deepEqual(
    inputPlan({ frames: 600, buttons: 0, captureFrames: [] }).captures,
    [600],
  );
});

test("real input sequences preserve checkpoints, exact movement and runtime statistics", async (t) => {
  const g = gameFor(t);
  await g.execute("reset_game", {});
  const result = await g.execute("press_buttons", {
    steps: [
      { frames: 10, buttons: 2 },
      { frames: 1, buttons: 0 },
      { frames: 5, buttons: 1 },
    ],
  });
  const meta = headers(result);
  assert.deepEqual(
    meta.map((m) => m.checkpoint.afterFrames),
    [10, 11, 16],
  );
  assert.equal(meta[0].execution.completedFrames, 16);
  assert.equal(meta[0].execution.outcome, "completed");
  assert.deepEqual(
    meta[0].execution.steps.map((s) => s.completedFrames),
    [10, 1, 5],
  );
  assert.equal(result.output.filter((p) => p.type === "image").length, 3);
  assert.equal(g.testFrames.length, 3);
  for (const [i, x] of [18, 18, 13].entries()) {
    assert.deepEqual(
      [
        ...g.testFrames[i].rgba.slice(
          (64 * 128 + x) * 4,
          (64 * 128 + x) * 4 + 3,
        ),
      ],
      [0, 228, 54],
    );
    assert.equal(
      meta[i].frame.cpuInstructions,
      g.testFrames[i].cpuInstructions,
    );
    assert.equal(meta[i].frame.slowFrame, g.testFrames[i].slowFrame);
    assert.equal(meta[i].cart.observed.cartRevision, g.revision);
  }
  const before = g.session.observe();
  const observed = headers(
    await g.execute("observe_game", {
      format: "ascii",
      region: { x: 0, y: 0, width: 1, height: 1 },
    }),
  )[0];
  assert.equal(observed.frame.frameId, before.frame.frameId);
  assert.equal(observed.frame.cpuInstructions, before.frame.cpuInstructions);
  assert.equal(g.session.observe().frame.frameId, before.frame.frameId);
});

test("checkpoint sampling does not inject button releases or change btnp timing", async (t) => {
  const source = `function _init() n=0 end
function _update() if btnp(4) then n+=1 end end
function _draw() cls(0) rectfill(0,0,n,2,8) end`;
  const g = gameFor(t, emptySnapshot(source));
  const baseline = await createPico8Session();
  t.after(() => baseline.dispose());
  await baseline.loadCart(cartBytes(g.snapshot));
  await baseline.advance({ frames: 1 });
  await g.execute("reset_game", {});
  await g.execute("press_buttons", {
    frames: 22,
    buttons: 16,
    captureFrames: [1, 7, 14, 20],
  });
  for (const n of [1, 7, 14, 20, 22]) {
    while (baseline.observe().frame.frameId < n)
      await baseline.advance({ frames: 1, input: input(16) });
    const sample = g.testFrames.find((f) => f.frameId === n);
    assert.ok(sample);
    assert.deepEqual(sample.rgba, baseline.observe().frame.rgba);
  }
  const retry = await g.execute("press_buttons", {
    steps: [
      { frames: 1, buttons: 0 },
      { frames: 1, buttons: 16 },
    ],
  });
  assert.equal(headers(retry)[0].execution.completedFrames, 2);
});

for (const [name, ending, outcome] of [
  ["stop", "stop()", "stopped"],
  ["fault", 'error("fixture fault")', "faulted"],
]) {
  test(`real ${name} returns partial progress and skips remaining steps`, async (t) => {
    const g = gameFor(
      t,
      emptySnapshot(`function _init() n=0 end
function _update() n+=1 if n==5 then ${ending} end end
function _draw() cls(0) pset(n,0,8) end`),
    );
    await g.execute("reset_game", {});
    const result = await g.execute("press_buttons", {
      steps: [
        { frames: 10, buttons: 2 },
        { frames: 20, buttons: 1 },
      ],
      captureFrames: [],
    });
    const m = headers(result)[0];
    assert.equal(m.execution.outcome, outcome);
    assert.equal(m.execution.requestedFrames, 30);
    assert.ok(m.execution.completedFrames < 10);
    assert.equal(m.execution.steps.length, 1);
    assert.equal(m.checkpoint.afterFrames, m.execution.completedFrames);
    assert.equal(result.isError, outcome === "faulted");
    assert.equal(g.revision, 1);
  });
}

test("STOP between real sequence chunks rejects the call and sends no later input", async (t) => {
  const g = gameFor(t);
  await g.execute("reset_game", {});
  const c = new AbortController(),
    rpc = g.rpc.bind(g);
  let calls = 0;
  g.rpc = async (action, args) => {
    const r = await rpc(action, args);
    if (action === "advance" && ++calls === 1) c.abort();
    return r;
  };
  await assert.rejects(
    g.execute(
      "press_buttons",
      {
        steps: [
          { frames: 2, buttons: 2 },
          { frames: 2, buttons: 1 },
        ],
      },
      c.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});

test("resource previews are versioned, correctly colored and cannot operate the game", async (t) => {
  const g = gameFor(t);
  const images = [];
  const image = g.image.bind(g);
  g.image = (value) => {
    images.push(value);
    return image(value);
  };
  g.ensureWorker = () => assert.fail("resource preview started runtime");
  g.player.pause = () => assert.fail("resource preview paused player");
  const edited = await g.execute("edit_assets", {
    edits: [{ kind: "sprite", id: 1, rows: Array(8).fill("eeeeeeee") }],
  });
  assert.deepEqual(headers(edited)[0].changes, [
    { kind: "sprite", id: 1, fields: ["rows"] },
  ]);
  const draft = await g.execute("read_assets", {
    kind: "sprite",
    id: 1,
    count: 2,
    format: "png",
  });
  const saved = await g.execute("read_assets", {
    kind: "sprite",
    id: 1,
    count: 2,
    format: "both",
    version: "committed",
  });
  assert.equal(headers(draft)[0].resourceView.version, "draft");
  assert.equal(headers(draft)[0].resourceView.cartRevision, null);
  assert.equal(headers(saved)[1].resourceView.cartRevision, 1);
  assert.deepEqual(
    headers(draft)[0].resourceView.preview.slots.map((s) => [s.id, s.flags]),
    [
      [1, 7],
      [2, 3],
    ],
  );
  const at = (10 * images[0].width + 4) * 4;
  assert.deepEqual([...images[0].rgba.slice(at, at + 3)], [255, 119, 168]);
  assert.deepEqual([...images[1].rgba.slice(at, at + 3)], [0, 228, 54]);
  assert.equal(g.testFrame, null);
  assert.equal(g.revision, 1);
  const unchanged = await g.execute("edit_assets", {
    edits: [{ kind: "sprite", id: 1, flags: 7 }],
  });
  assert.deepEqual(headers(unchanged)[0].changes, []);
  await assert.rejects(
    g.execute("read_assets", { kind: "sfx", id: 0, format: "png" }),
  );
  const empty = new Game(() => {});
  await assert.rejects(empty.execute("read_assets", { version: "committed" }));
});

test("shared map renderer matches actual WASM map pixels, including tile 0 and sprite 255", async (t) => {
  const snapshot = emptySnapshot(
    "function _draw() cls(0) map(126,31,0,0,2,1) end",
  );
  snapshot.assets = editAssets(snapshot.assets, [
    { kind: "sprite", id: 0, rows: Array(8).fill("eeeeeeee") },
    { kind: "sprite", id: 255, rows: Array(8).fill("8b8b8b8b"), flags: 128 },
    { kind: "map", x: 126, y: 31, rows: [[0, 255]] },
  ]);
  const g = gameFor(t, snapshot);
  await g.execute("reset_game", {});
  const rendered = renderMap(decodeAssets(snapshot.assets), {
    x: 126,
    y: 31,
    width: 2,
    height: 1,
  });
  for (let y = 0; y < 8; y++)
    assert.deepEqual(
      rendered.rgba.slice(y * 16 * 4, (y + 1) * 16 * 4),
      g.testFrame.rgba.slice(y * 128 * 4, (y * 128 + 16) * 4),
    );
  const before = g.session.observe().frame.frameId;
  const preview = await g.execute("read_assets", {
    kind: "map",
    x: 126,
    y: 31,
    width: 2,
    height: 1,
    format: "png",
  });
  assert.deepEqual(headers(preview)[0].resourceView.preview.origin, {
    x: 126,
    y: 31,
  });
  assert.equal(headers(preview)[0].resourceView.preview.width, 35);
  assert.equal(g.session.observe().frame.frameId, before);
});

test("Harness delivers all eight checkpoint images and resource provenance to the model", async (t) => {
  const g = gameFor(t);
  await g.execute("reset_game", {});
  let n = 0;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const request = JSON.parse(init.body);
    n++;
    const texts = JSON.stringify(request.messages);
    if (n === 2) {
      assert.match(texts, /completedFrames/);
      assert.match(texts, /cpuInstructions/);
      assert.equal((texts.match(/data:image\/png;base64/g) ?? []).length, 8);
    }
    if (n === 3) {
      assert.match(texts, /sprite-atlas/);
      assert.match(texts, /committedRevision/);
    }
    const call =
      n === 1
        ? [
            "press_buttons",
            { frames: 8, buttons: 2, captureFrames: [1, 2, 3, 4, 5, 6, 7] },
          ]
        : n === 2
          ? ["read_assets", { kind: "sprite", id: 1, format: "png" }]
          : null;
    const delta = call
      ? {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `call-${n}`,
              type: "function",
              function: { name: call[0], arguments: JSON.stringify(call[1]) },
            },
          ],
        }
      : { role: "assistant", content: "Verified." };
    return new Response(
      `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "deepseek-flash", choices: [{ index: 0, delta, finish_reason: call ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
  const agent = new Agent(g, () => {});
  t.after(() => agent.dispose());
  await agent.open();
  await agent.configure({ ...defaultConfig, apiKey: "fixture" });
  assert.equal(
    (await agent.send("Inspect the new tool outputs.")).status,
    "done",
  );
  assert.equal(n, 3);
  assert.equal(
    describeTool({
      toolName: "press_buttons",
      args: { steps: [{ frames: 8, buttons: 2 }] },
    }).meta,
    "1 steps · 8f",
  );
});
