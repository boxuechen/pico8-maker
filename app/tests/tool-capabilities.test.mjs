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
import { Playtests, normalizePlaytests } from "../src/pico8/playtests.js";
import { newCart, normalizeCart } from "../src/cart-store.js";

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

test("feedback comparison uses the request baseline and never changes the test cart or export", async (t) => {
  const original = emptySnapshot("function _draw() cls(12) end");
  const g = gameFor(t, original),
    saved = [];
  g.onComparison = (value) => saved.push(value);
  g.player.start = async () => g.live.advance({ frames: 1 });
  g.beginRequest();
  await g.execute("load_game", { source: "function _draw() cls(8) end" });
  await g.execute("load_game", { source: "function _draw() cls(11) end" });
  g.endRequest();
  assert.equal(saved.length, 1);
  assert.deepEqual(g.comparison.snapshot, original);
  const current = { ...g.snapshot },
    testFrame = g.session.observe().frame.rgba.slice(),
    run = g.playtests.active.id;
  await g.previewComparison("before");
  assert.deepEqual(
    [...g.live.observe().frame.rgba.slice(0, 3)],
    [41, 173, 255],
  );
  assert.deepEqual(g.snapshot, current);
  assert.deepEqual(g.draft, current);
  assert.deepEqual(g.session.observe().frame.rgba, testFrame);
  assert.equal(g.playtests.active.id, run);
  await g.restoreProject();
  await g.player.start();
  assert.deepEqual([...g.live.observe().frame.rgba.slice(0, 3)], [0, 228, 54]);
  g.beginRequest();
  g.endRequest(); // An explanation-only request keeps the comparison.
  assert.deepEqual(g.comparison.snapshot, original);
  const restored = normalizeCart(newCart({ comparison: g.comparison }));
  assert.deepEqual(restored.comparison.snapshot, original);
  g.beginRequest();
  await g.execute("load_game", { source: "function _draw() cls(7) end" });
  g.endRequest();
  assert.deepEqual(g.comparison.snapshot, current);
});

test("a rejected edit does not replace a saved comparison", async (t) => {
  const g = gameFor(t);
  const comparison = { snapshot: emptySnapshot("print(1)"), revision: 1 };
  g.comparison = comparison;
  g.beginRequest();
  const failed = await g.execute("load_game", { source: "not valid lua!" });
  g.endRequest();
  assert.equal(failed.isError, true);
  assert.equal(g.comparison, comparison);
});

test("tap inputs release repeated buttons and capture logical step ends in the real runtime", async (t) => {
  const g = gameFor(
    t,
    emptySnapshot(`function _init() n=0 end
function _update() if btnp(4) then n+=1 end end
function _draw() cls(0) rectfill(0,0,n,2,8) end`),
  );
  await g.execute("reset_game", { purpose: "normal" });
  const result = await g.execute("press_buttons", {
    steps: [
      { frames: 1, buttons: 16, tap: true, capture: true },
      { frames: 1, buttons: 16, tap: true, capture: true },
    ],
  });
  assert.deepEqual(
    headers(result).map((m) => m.checkpoint.afterFrames),
    [3, 6],
  );
  assert.equal(headers(result)[0].execution.completedFrames, 6);
  assert.deepEqual([...g.testFrame.rgba.slice(2 * 4, 2 * 4 + 3)], [255, 0, 77]);
  assert.deepEqual([...g.testFrame.rgba.slice(3 * 4, 3 * 4 + 3)], [0, 0, 0]);
  assert.equal(headers(result)[0].playtest.purpose, "normal");
  for (const args of [
    { frames: 599, buttons: 16, tap: true },
    { frames: 1, buttons: 0, tap: true },
    { frames: 1, buttons: 16, tap: 1 },
    { steps: [{ frames: 1, buttons: 0 }], capture: true },
    {
      steps: [
        { frames: 9, buttons: 0, capture: true },
        { frames: 1, buttons: 0 },
      ],
      captureFrames: [1, 2, 3, 4, 5, 6, 7],
    },
  ]) {
    const before = g.session.observe().frame.frameId;
    await assert.rejects(g.execute("press_buttons", args));
    assert.equal(g.session.observe().frame.frameId, before);
  }
});

test("recorded routes persist, replay exact frames, and reject out-of-order calls without input", async (t) => {
  const g = gameFor(t);
  await g.execute("reset_game", { purpose: "normal" });
  await g.execute("press_buttons", {
    frames: 8,
    buttons: 2,
    tap: true,
    capture: true,
  });
  await g.execute("press_buttons", { frames: 3, buttons: 1 });
  const expected = g.testFrame.rgba.slice(),
    saved = normalizeCart(newCart({ playtests: g.playtests.runs })).playtests;
  assert.equal(saved[0].calls.length, 2);
  assert.equal(saved[0].calls[0].frames.length, 1);
  assert.equal(JSON.stringify(saved).includes('"rgba"'), false);
  g.playtests = new Playtests(saved);
  await assert.rejects(
    g.execute("press_buttons", { replay: { run: "r1", call: 0 } }),
    /reset_game/,
  );
  await g.execute("reset_game", { purpose: "normal" });
  let before = g.session.observe().frame.frameId;
  await assert.rejects(
    g.execute("press_buttons", { replay: { run: "r1", call: 1 } }),
    /order/,
  );
  assert.equal(g.session.observe().frame.frameId, before);
  for (let call = 0; call < 2; call++) {
    const result = await g.execute("press_buttons", {
      replay: { run: "r1", call },
    });
    assert.equal(headers(result)[0].playtest.matchesRecordedFrame, true);
    assert.equal(headers(result)[0].playtest.sameCart, true);
  }
  assert.deepEqual(g.testFrame.rgba, expected);
  const index = await g.workspace.readTextFile("playtests.json");
  assert.equal(JSON.parse(index.value).runs.length, 2);
  assert.equal(
    (await g.workspace.writeFile("playtests/r1.json", "{}")).ok,
    false,
  );
  assert.equal(
    JSON.parse((await g.workspace.readTextFile("playtests/r1.json")).value)
      .calls.length,
    2,
  );
});

test("changed carts get new replay evidence and ordinary input breaks continuity", async (t) => {
  const g = gameFor(t);
  await g.execute("reset_game", { purpose: "debug" });
  await g.execute("press_buttons", { frames: 2, buttons: 2 });
  await g.execute("press_buttons", { frames: 2, buttons: 1 });
  const old = g.playtests.runs[0];
  await g.execute("load_game", { source: "function _draw() cls(8) end" });
  await g.execute("reset_game", { purpose: "normal" });
  const r = await g.execute("press_buttons", {
    replay: { run: old.id, call: 0 },
  });
  assert.equal(headers(r)[0].playtest.sameCart, false);
  assert.equal(headers(r)[0].playtest.matchesRecordedFrame, false);
  assert.equal(old.purpose, "debug");
  assert.equal(g.playtests.active.purpose, "normal");
  await g.execute("press_buttons", { frames: 1, buttons: 0 });
  await assert.rejects(
    g.execute("press_buttons", { replay: { run: old.id, call: 1 } }),
    /breaks/,
  );
  assert.deepEqual(
    normalizePlaytests([
      { ...old, calls: [{ input: { frames: 900, buttons: 0 } }] },
    ]),
    [],
  );
});

test("failed loads and worker loss cannot extend an old route", async (t) => {
  const g = gameFor(t);
  await g.execute("reset_game", { purpose: "normal" });
  await g.execute("press_buttons", { frames: 1, buttons: 0 });
  const before = JSON.stringify(g.playtests.runs);
  await g.execute("load_game", { source: "this is not lua" });
  assert.equal(g.playtests.active, null);
  await g.execute("press_buttons", { frames: 1, buttons: 0 });
  assert.equal(JSON.stringify(g.playtests.runs), before);
  await g.execute("reset_game", {});
  Game.prototype.cancelTests.call(g);
  assert.equal(g.playtests.active, null);
  const invalid = new Game(() => {}, { versions: [fixtureSnapshot()] });
  invalid.ensureWorker = () => assert.fail("invalid reset started worker");
  await assert.rejects(invalid.execute("reset_game", { purpose: "passed" }));
});
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

test("invalid input errors locate the bad field and explain recovery without advancing", async () => {
  const g = new Game(() => {}, { versions: [fixtureSnapshot()] });
  g.ensureWorker = () => assert.fail("invalid request initialized the Worker");
  g.player = { pause: () => assert.fail("invalid request paused the player") };
  for (const [args, message] of [
    [
      { steps: Array.from({ length: 9 }, () => ({ frames: 1, buttons: 0 })) },
      /received 9.*Split/,
    ],
    [
      {
        steps: [
          { frames: 2, buttons: 0 },
          { frames: 0, buttons: 0 },
        ],
      },
      /steps\[1\]\.frames/,
    ],
    [
      {
        steps: [
          { frames: 2, buttons: 0 },
          { frames: 2, buttons: 64 },
        ],
      },
      /steps\[1\]\.buttons/,
    ],
    [
      {
        steps: [
          { frames: 500, buttons: 0 },
          { frames: 101, buttons: 0 },
        ],
      },
      /received 601.*Split/,
    ],
    [
      { frames: 20, buttons: 0, captureFrames: [10, 25] },
      /captureFrames\[1\].*1–20/,
    ],
    [
      { frames: 20, buttons: 0, captureFrames: [10, 10] },
      /captureFrames\[1\].*greater.*cumulative/,
    ],
    [
      { frames: 20, buttons: 0, captureFrames: [10, 5] },
      /captureFrames\[1\].*greater.*cumulative/,
    ],
  ]) {
    await assert.rejects(g.execute("press_buttons", args), (error) => {
      assert.match(error.message, message);
      assert.match(error.message, /No input was executed/);
      return true;
    });
  }
});

test("fixed-point warning reaches real load evidence without rewriting or blocking the cart", async (t) => {
  const g = gameFor(t);
  const source = `function _init() best=99999 end
function _draw() cls(0) pset(0,0,best<0 and 8 or 11) end`;
  const result = await g.execute("load_game", { source });
  assert.equal(result.isError, false);
  assert.equal(g.source, source);
  const warning = headers(result)[0].cart.draftSourceBudget.warnings[0];
  assert.match(warning, /Line 1.*99999.*16.16/);
  assert.deepEqual(
    [...g.testFrame.rgba.slice(0, 3)],
    [255, 0, 77],
    "the unchanged literal wraps negative in the actual runtime",
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
    captureFrames: [10, 11],
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

test("default final-only capture preserves batched movement and release timing", async (t) => {
  const g = gameFor(t);
  const steps = [
    { frames: 10, buttons: 2 },
    { frames: 1, buttons: 0 },
    { frames: 5, buttons: 1 },
  ];
  await g.execute("reset_game", {});
  const sampled = await g.execute("press_buttons", {
    steps,
    captureFrames: [10, 11],
  });
  const expected = g.testFrame.rgba.slice();
  const expectedExecution = headers(sampled)[0].execution;
  for (const options of [{}, { captureFrames: [] }]) {
    await g.execute("reset_game", {});
    const result = await g.execute("press_buttons", { steps, ...options });
    const meta = headers(result);
    assert.equal(meta.length, 1);
    assert.deepEqual(meta[0].checkpoint, { step: 3, afterFrames: 16 });
    assert.deepEqual(meta[0].execution, expectedExecution);
    assert.equal(result.output.filter((p) => p.type === "image").length, 1);
    assert.equal(g.testFrames.length, 1);
    assert.deepEqual(g.testFrame.rgba, expected);
  }
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
