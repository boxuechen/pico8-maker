import test from "node:test";
import assert from "node:assert/strict";
import { outcomeMetrics } from "../scripts/evaluation/outcome-metrics.mjs";

test("cumulative snapshots count identities once and preserve missing/error evidence", () => {
  const entry = { model: [
    { role: "assistant", content: [
      { type: "toolCall", id: "a", name: "bash", arguments: { command: "p8 check" } },
      { type: "toolCall", id: "b", name: "read", arguments: { path: "main.lua" } },
      { type: "toolCall", id: "c", name: "bash", arguments: { command: "p8 run --press x" } },
    ] },
    { role: "toolResult", toolCallId: "a", isError: false, content: [{ type: "text", text: "棋盘\nMaker: committed as version 1; the player now runs it." }] },
    { role: "toolResult", toolCallId: "b", isError: true, content: [] },
  ] };
  const metrics = outcomeMetrics([entry, entry]);
  assert.equal(metrics.toolCalls, 3);
  assert.deepEqual(metrics.byP8, { check: 1, run: 1 });
  assert.equal(metrics.failedTools, 1);
  assert.equal(metrics.missingResults, 1);
  assert.equal(metrics.firstSuccessfulLoadCall, 1);
  assert.equal(metrics.firstVerifiedCoreLoopCall, null);
  assert.equal(metrics.agentCoverage.victory, "unknown");
  assert.equal(metrics.independentCoverage.victory, "unknown");
});

test("counts PNG dimensions, state reads and looks without gameplay inference", () => {
  const png = Buffer.alloc(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.writeUInt32BE(512, 16); png.writeUInt32BE(256, 20);
  const metrics = outcomeMetrics([{ model: [
    { role: "assistant", content: [
      { type: "toolCall", id: "r", name: "bash", arguments: { command: "p8 run --press 'right*5' --read g.x" } },
      { type: "toolCall", id: "l", name: "bash", arguments: { command: "p8 look --png s.png" } },
      { type: "toolCall", id: "i", name: "read", arguments: { path: "s.png" } },
    ] },
    { role: "toolResult", toolCallId: "r", content: [] },
    { role: "toolResult", toolCallId: "l", content: [] },
    { role: "toolResult", toolCallId: "i", content: [
      { type: "image", mimeType: "image/png", data: png.toString("base64") },
      { type: "image", mimeType: "image/png", data: "omitted" },
    ] },
  ] }]);
  assert.equal(metrics.stateReads, 1);
  assert.equal(metrics.lookShare, 1 / 3);
  assert.deepEqual(metrics.imageDimensions, { "512x256": 1, unknown: 1 });
  assert.equal(metrics.firstSuccessfulLoadCall, null);
});
