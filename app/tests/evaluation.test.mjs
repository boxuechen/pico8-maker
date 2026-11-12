import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import {
  EvaluationGame,
  RunBudget,
  blankSource,
  png,
} from "../scripts/evaluation/core.mjs";
import { freezePacks } from "../scripts/evaluation/packs.mjs";
import { createPico8Extension } from "../src/pico8/extension.js";
test("frozen treatment keeps baseline APIs but cannot expose design cases", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "pico8-eval-packs-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const { A, B } = await freezePacks(folder);
  assert.ok(
    Object.keys(B.pack.files).length > Object.keys(A.pack.files).length,
  );
  const tool = createPico8Extension({
    game: {},
    knowledge: A.knowledge,
  }).tools.find((t) => t.name === "read");
  await assert.rejects(() =>
    tool.execute(
      { path: "/extensions/pico8/cases/celeste-classic.md" },
      {},
      {},
    ),
  );
  assert.ok(!A.pack.files["references/game-design.md"]);
  assert.ok(B.pack.files["references/game-design.md"]);
});
test("evaluation transport uses real Game validation, rollback and non-advancing observations", async (t) => {
  const g = new EvaluationGame();
  t.after(() => g.dispose());
  assert.equal(g.source, blankSource);
  const source = "function _draw() cls(8) pset(1,2,11) end";
  assert.equal((await g.execute("load_game", { source })).isError, false);
  const frame = g.session.observe().frame.frameId;
  const a = await g.execute("observe_game", {
    format: "both",
    region: { x: 1, y: 2, width: 1, height: 1 },
  });
  assert.equal(g.session.observe().frame.frameId, frame);
  const b = Buffer.from(a.output[1].data, "base64");
  assert.equal(b.readUInt32BE(16), 1);
  assert.equal(b.readUInt32BE(20), 1);
  assert.equal(
    (await g.execute("load_game", { source: "function invalid(" })).isError,
    true,
  );
  assert.equal(g.source, source);
  await assert.rejects(() =>
    g.execute("press_buttons", { frames: 601, buttons: 0 }),
  );
});
test("PNG encodes exact RGBA and budgets count cached tokens and tool calls", () => {
  const data = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]),
    bytes = png(data, 2, 1);
  let at = 8,
    payload = [];
  while (at < bytes.length) {
    const n = bytes.readUInt32BE(at),
      type = bytes.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") payload.push(bytes.subarray(at + 8, at + 8 + n));
    at += n + 12;
  }
  assert.deepEqual([...inflateSync(Buffer.concat(payload))], [0, ...data]);
  const b = new RunBudget({ tokens: 100, tools: 2, milliseconds: 10000 });
  b.tool();
  b.tool();
  assert.throws(() => b.tool(), /tool_budget/);
  const c = new RunBudget({ tokens: 100, tools: 2, milliseconds: 10000 });
  c.usage({ input: 5, output: 10, cacheRead: 80, cacheWrite: 5 });
  assert.throws(() => c.check(), /token_budget/);
  assert.equal(c.snapshot().reportedTokens, 100);
});
