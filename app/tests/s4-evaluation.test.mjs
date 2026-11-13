import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "../src/model-config.js";
import { emptySnapshot } from "../src/pico8/assets.js";
import {
  shooterCases,
  shooterSource,
} from "../scripts/evaluation/shooter-case.mjs";
import {
  verifyShooter,
  verifyAgentRoutes,
} from "../scripts/evaluation/shooter-oracle.mjs";
import { EvaluationGame } from "../scripts/evaluation/node-game.mjs";
import { runS4Case } from "../scripts/evaluation/s4-runner.mjs";
import {
  transcriptEvidence,
  usageMetrics,
} from "../scripts/evaluation/s4-metrics.mjs";
import { resolveMatrix } from "../scripts/evaluation/s4-matrix.mjs";
import {
  boardImage,
  boardRows,
  scoreBoard,
  compareImages,
} from "../scripts/evaluation/image-comparison.mjs";
const head = (r) => JSON.parse(r.output[0].text.split("\n")[0]);
const winSteps = [
  { frames: 20, buttons: 16 },
  { frames: 16, buttons: 1 },
  { frames: 20, buttons: 16 },
  { frames: 32, buttons: 2 },
  { frames: 26, buttons: 16 },
  { frames: 16, buttons: 1 },
  { frames: 20, buttons: 16 },
  { frames: 16, buttons: 1 },
  { frames: 20, buttons: 16 },
];
const press = (g, steps) => g.execute("press_buttons", { steps });

test("independent shooter oracle accepts real action/feedback, victory, loss and retries", async () => {
  const cart = emptySnapshot(shooterSource),
    before = structuredClone(cart),
    r = await verifyShooter(cart);
  assert.equal(r.passed, true);
  assert.deepEqual(cart, before);
  // The published skeleton's short result lock is a valid retry.
  const locked = shooterSource
    .replace("wave=1,kills=0,tick=0,cooldown=0}", "wave=1,kills=0,tick=0,cooldown=0,wait=0}")
    .replace(
      "if g.mode!=\"play\" then if btnp(5) then new_game() end return end",
      "if g.mode!=\"play\" then g.wait+=1 if g.wait>15 and btnp(5) then new_game() end return end",
    );
  assert.notEqual(locked, shooterSource);
  const lockedResult = await verifyShooter(emptySnapshot(locked));
  assert.equal(lockedResult.passed, true, JSON.stringify(lockedResult.checks));
  assert.ok(
    r.evidence.every((e) => e.steps.length && e.image.data && e.frameHash),
  );
});

test("oracle rejects invulnerability regression, fake progress, invisible enemies and broken retry", async () => {
  for (const source of [
    shooterCases[0].snapshot().source,
    shooterSource.replace(
      "g.tick+=1",
      'g.kills=6 g.wave=2 g.enemies={} g.mode="win" return\n g.tick+=1',
    ),
    shooterSource.replace("e.x+3,e.y+3,8", "e.x+3,e.y+3,0"),
    shooterSource.replace(
      "if btnp(5) then new_game() end",
      'if btnp(5) then g.mode="play" end',
    ),
    shooterSource.replace("max(0,g.player.inv-1)", "g.player.inv"),
  ])
    assert.equal((await verifyShooter(emptySnapshot(source))).passed, false);
});

test("Agent route evidence requires final cart, completed inputs and matching pixels; only normal input before debug counts", async (t) => {
  const g = new EvaluationGame();
  t.after(() => g.dispose());
  await g.execute("load_game", { source: shooterSource });
  const initial = structuredClone(g.testFrame),
    read = await g.execute("inspect_game", {
      mode: "read",
      paths: [["g", "enemies"]],
    });
  assert.deepEqual(head(read).values[0], [
    { x: 32, y: 24 },
    { x: 64, y: 24 },
    { x: 96, y: 24 },
  ]);
  assert.deepEqual(g.testFrame, initial);
  await press(g, [{ frames: 30, buttons: 16 }]);
  const ledger = [{ run: "r1", recordedCall: 1, ordinal: 3 }];
  let result = await verifyAgentRoutes(g.snapshot, g.playtests.runs, ledger);
  assert.equal(result.coverage.coreLoop, "passed");
  assert.equal(result.coverage.victory, "unknown");
  assert.equal(result.firstVerifiedCoreLoopCall, 3);
  const mismatched = structuredClone(g.playtests.runs);
  mismatched[0].calls[0].frames[0].hash = "0".repeat(64);
  assert.equal(
    (await verifyAgentRoutes(g.snapshot, mismatched, ledger)).coverage.coreLoop,
    "unknown",
  );
  const interrupted = structuredClone(g.playtests.runs);
  interrupted[0].calls[0].outcome = "interrupted";
  assert.equal(
    (await verifyAgentRoutes(g.snapshot, interrupted, ledger)).coverage
      .coreLoop,
    "unknown",
  );
  for (const mutate of [
    (call) => {
      call.frames = [];
    },
    (call) => {
      call.completedFrames--;
    },
  ]) {
    const incomplete = structuredClone(g.playtests.runs);
    mutate(incomplete[0].calls[0]);
    assert.equal(
      (await verifyAgentRoutes(g.snapshot, incomplete, ledger)).coverage
        .coreLoop,
      "unknown",
    );
  }
  assert.equal(
    (
      await verifyAgentRoutes(
        emptySnapshot(shooterSource + "\n-- new revision"),
        g.playtests.runs,
        ledger,
      )
    ).coverage.coreLoop,
    "unknown",
  );
  const bytes = structuredClone(g.snapshot);
  await g.execute("inspect_game", {
    mode: "debug",
    code: 'g.kills=6; g.mode="win"',
  });
  assert.deepEqual(g.snapshot, bytes);
  assert.equal(g.playtests.runs[0].purpose, "debug");
  // The normal prefix still proves the core loop; the injected win never counts.
  await press(g, [{ frames: 1, buttons: 0 }]);
  result = await verifyAgentRoutes(g.snapshot, g.playtests.runs, ledger);
  assert.equal(result.coverage.coreLoop, "passed");
  assert.equal(result.coverage.victory, "unknown");
  assert.equal(result.firstVerifiedCoreLoopCall, 3);
  // A route declared debug from its start contributes nothing.
  const declared = structuredClone(g.playtests.runs);
  declared[0].debugEvents[0].routePurpose = "debug";
  result = await verifyAgentRoutes(g.snapshot, declared, ledger);
  assert.equal(result.coverage.coreLoop, "unknown");
  assert.equal(result.firstVerifiedCoreLoopCall, null);
});

test("normal retry resets per-round oracle counters without losing prior coverage", async (t) => {
  const g = new EvaluationGame();
  t.after(() => g.dispose());
  await g.execute("load_game", { source: shooterSource });
  for (let round = 0; round < 2; round++) {
    await press(g, winSteps.slice(0, 5));
    await press(g, winSteps.slice(5));
    await press(g, [
      { frames: 1, buttons: 32 },
      { frames: 1, buttons: 0 },
    ]);
  }
  await press(g, [
    { frames: 240, buttons: 0 },
    { frames: 1, buttons: 32 },
  ]);
  const r = await verifyAgentRoutes(g.snapshot, g.playtests.runs, []);
  assert.deepEqual(r.coverage, {
    coreLoop: "passed",
    victory: "passed",
    failure: "passed",
    retry: "passed",
  });
});

function response(delta, finish = "stop") {
  const chunks = [
    { choices: [{ index: 0, delta, finish_reason: null }] },
    {
      choices: [{ index: 0, delta: {}, finish_reason: finish }],
      usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    },
  ];
  return new Response(
    chunks.map((c) => "data: " + JSON.stringify(c) + "\n\n").join("") +
      "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );
}
test("scripted provider exercises real Agent, Worker and S4 reports (not a real-model result)", async (t) => {
  const route = [
    ["load_game", { source: shooterSource }],
    ["inspect_game", { mode: "read", paths: [["g", "enemies"]] }],
    ["press_buttons", { steps: winSteps.slice(0, 5) }],
    ["press_buttons", { steps: winSteps.slice(5) }],
    [
      "press_buttons",
      {
        steps: [
          { frames: 1, buttons: 32 },
          { frames: 240, buttons: 0 },
          { frames: 1, buttons: 32 },
        ],
      },
    ],
  ];
  for (const task of shooterCases) {
    let next = 0;
    t.mock.method(globalThis, "fetch", async () => {
      const call = route[next++];
      return call
        ? response(
            {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: `s4-${next}`,
                  type: "function",
                  function: {
                    name: call[0],
                    arguments: JSON.stringify(call[1]),
                  },
                },
              ],
            },
            "tool_calls",
          )
        : response({
            role: "assistant",
            content: "Verified this scripted fixture.",
          });
    });
    const r = await runS4Case(task, { ...defaultConfig, apiKey: "fixture" });
    assert.equal(r.status, "done");
    assert.equal(r.passed, true, JSON.stringify(r.checks));
    assert.equal(r.metrics.firstSuccessfulLoadCall, 1);
    assert.equal(r.metrics.firstVerifiedCoreLoopCall, 3);
    assert.equal(r.metrics.stateReads, 1);
    assert.equal(r.metrics.onePixelRowObservations, 0);
    assert.equal(r.metrics.toolCalls, 5);
    assert.equal(r.metrics.usage.tokens.total, 660);
    assert.equal(r.metrics.imageDimensions["512x512"], 4);
    assert.equal(transcriptEvidence(r.entries).ledger.length, 3);
    t.mock.restoreAll();
  }
});

test("provider rejection is retained as an error with unknown Agent coverage", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({ error: { message: "fixture access denied" } }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
  );
  const r = await runS4Case(shooterCases[1], {
    ...defaultConfig,
    apiKey: "fixture",
  });
  assert.equal(r.status, "error");
  assert.match(r.error, /fixture access denied/);
  assert.equal(r.passed, false);
  assert.equal(r.metrics.toolCalls, 0);
  assert.equal(r.metrics.usage.tokens, null);
  assert.equal(r.metrics.firstVerifiedCoreLoopCall, null);
});

test("matrix records missing configurations without inventing model capabilities or sharing keys", () => {
  const row = {
    id: "kimi",
    family: "Kimi",
    provider: "kimi-coding",
    model: "kimi-for-coding",
    baseUrl: "https://api.kimi.com/coding/v1",
    apiKeyEnv: "S4_KIMI_KEY",
    thinkingLevel: "high",
  };
  assert.equal(
    resolveMatrix({ schemaVersion: 1, models: [row] }, {})[0].status,
    "not_run",
  );
  const r = resolveMatrix(
    { schemaVersion: 1, models: [row] },
    { S4_KIMI_KEY: "fixture" },
  )[0];
  assert.equal(r.status, "ready");
  assert.ok(r.metadata.input.includes("image"));
  assert.ok(!JSON.stringify(r.metadata).includes("fixture"));
  assert.throws(() =>
    resolveMatrix(
      { schemaVersion: 1, models: [{ ...row, apiKey: "secret" }] },
      {},
    ),
  );
  assert.throws(() =>
    resolveMatrix({ schemaVersion: 1, models: [row, row] }, {}),
  );
  assert.equal(usageMetrics([{ usage: { totalTokens: 0 } }]).tokens, null);
  assert.equal(
    usageMetrics([{ usage: { totalTokens: 100, cost: { total: 0.1 } } }]).cost
      .basis,
    "catalog_estimate",
  );
});

test("image A/B uses identical cells, nearest-neighbor 4x scaling and independent requests", async (t) => {
  const small = boardImage(128),
    large = boardImage(512);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++)
      for (let c = 0; c < 4; c++)
        assert.equal(
          large.rgba[(y * 512 + x) * 4 + c],
          small.rgba[(Math.floor(y / 4) * 128 + Math.floor(x / 4)) * 4 + c],
        );
  assert.equal(scoreBoard(JSON.stringify(boardRows)).exact, true);
  assert.equal(scoreBoard("[[0]]").valid, false);
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return response({ role: "assistant", content: JSON.stringify(boardRows) });
  });
  const r = await compareImages({ ...defaultConfig, apiKey: "fixture" });
  assert.ok(r.results.every((r) => r.score.exact));
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].messages.length, bodies[1].messages.length);
  assert.equal(
    bodies[0].messages.at(-1).content[0].text,
    bodies[1].messages.at(-1).content[0].text,
  );
});

test("evaluation Worker cancellation also settles startup and allows a fresh session", async (t) => {
  const g = new EvaluationGame();
  t.after(() => g.dispose());
  const opening = g.ensureWorker();
  g.cancelTests();
  await assert.rejects(opening, /startup|stopped/);
  assert.equal(g.worker, null);
  assert.equal(
    (await g.execute("load_game", { source: shooterSource })).isError,
    false,
  );
});
