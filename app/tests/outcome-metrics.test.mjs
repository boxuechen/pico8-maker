import test from "node:test";
import assert from "node:assert/strict";
import { outcomeMetrics } from "../scripts/evaluation/outcome-metrics.mjs";

test("cumulative snapshots count identities once and preserve missing/error evidence", () => {
  const entry = { model: [
    { role: "assistant", content: [
      { type: "toolCall", id: "a", name: "load_game", arguments: {} },
      { type: "toolCall", id: "b", name: "observe_game", arguments: { region: { height: 1 } } },
      { type: "toolCall", id: "c", name: "press_buttons", arguments: {} },
    ] },
    { role: "toolResult", toolCallId: "a", isError: false, content: [{ type: "text", text: "棋盘" }] },
    { role: "toolResult", toolCallId: "b", isError: true, content: [] },
  ] };
  const metrics = outcomeMetrics([entry, entry]);
  assert.equal(metrics.toolCalls, 3);
  assert.equal(metrics.failedTools, 1);
  assert.equal(metrics.missingResults, 1);
  assert.equal(metrics.resultTextBytes, 6);
  assert.equal(metrics.resultTextCharacters, 2);
  assert.equal(metrics.firstSuccessfulLoadCall, 1);
  assert.equal(metrics.firstVerifiedCoreLoopCall, null);
  assert.equal(metrics.agentCoverage.victory, "unknown");
  assert.equal(metrics.independentCoverage.victory, "unknown");
});

test("counts PNG dimensions, state reads and debug calls without gameplay inference", () => {
  const png = Buffer.alloc(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.writeUInt32BE(512, 16); png.writeUInt32BE(256, 20);
  const metrics = outcomeMetrics([{ model: [
    { role: "assistant", content: [
      { type: "toolCall", id: "r", name: "inspect_game", arguments: { mode: "read" } },
      { type: "toolCall", id: "d", name: "inspect_game", arguments: { mode: "debug" } },
    ] },
    { role: "toolResult", toolCallId: "r", content: [] },
    { role: "toolResult", toolCallId: "d", content: [
      { type: "image", mimeType: "image/png", data: png.toString("base64") },
      { type: "image", mimeType: "image/png", data: "omitted" },
    ] },
  ] }]);
  assert.equal(metrics.stateReads, 1);
  assert.equal(metrics.debugExecutions, 1);
  assert.deepEqual(metrics.imageDimensions, { "512x256": 1, unknown: 1 });
  assert.equal(metrics.firstSuccessfulLoadCall, null);
});
