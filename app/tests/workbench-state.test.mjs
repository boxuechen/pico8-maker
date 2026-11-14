import { interruptedToolResult } from "../src/project-store.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  groupAssistantTurns,
  toolState,
  summarizeTools,
} from "../src/workbench-state.js";
import { projectView } from "../src/agent.js";
test("one assistant post per user turn retains text and every tool across model iterations", () => {
  const messages = [
    { id: "u1", role: "user", content: [{ type: "text", text: "make" }] },
    {
      id: "a1",
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "1" }],
    },
    {
      id: "a2",
      role: "assistant",
      content: [
        { type: "text", text: "Testing" },
        { type: "tool-call", toolCallId: "2" },
      ],
    },
    { id: "a3", role: "assistant", content: [{ type: "text", text: "Done" }] },
    { id: "u2", role: "user", content: [] },
    { id: "a4", role: "assistant", content: [] },
  ];
  const copy = JSON.stringify(messages);
  const result = groupAssistantTurns(messages);
  assert.equal(result.length, 4);
  assert.equal(result[1].id, "a1");
  assert.equal(result[1].content.length, 4);
  assert.equal(result[3].id, "a4");
  assert.equal(JSON.stringify(messages), copy);
});
test("tool completion, errors and cancellation never share a success state", () => {
  assert.equal(toolState({ result: "ok" }, false), "completed");
  assert.equal(toolState({ result: "bad", isError: true }, false), "failed");
  const exited = [{ type: "text", text: "1 FAILED\n" }, { type: "text", text: "<harness>\n[error] Command exited with code 1\n</harness>" }];
  assert.equal(toolState({ toolName: "bash", result: exited, isError: true }, false), "completed");
  assert.equal(toolState({ toolName: "bash", result: [{ type: "text", text: "Command timed out after 5 seconds" }], isError: true }, false), "failed");
  assert.equal(
    toolState({ result: interruptedToolResult, isError: true }, false),
    "interrupted",
  );
  assert.equal(toolState({}, true), "running");
  assert.equal(toolState({}, false), "interrupted");
  assert.equal(
    summarizeTools([{ result: "ok" }, {}], false).state,
    "interrupted",
  );
  assert.equal(
    summarizeTools(
      [{ result: "ok" }, { result: "error", isError: true }],
      false,
    ).detail,
    "2 steps · 1 failed",
  );
});
test("streaming and committed assistant messages share a stable UI identity", () => {
  const entries = [
    { id: "u", model: [{ role: "user", content: "hello" }] },
    {
      id: "a",
      model: [
        {
          role: "assistant",
          content: [
            { type: "toolCall", id: "t", name: "read_game", arguments: {} },
          ],
        },
      ],
    },
  ];
  const live = projectView({
    entries,
    docs: {
      "pi.live": {
        run: {},
        generation: {
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Working" }],
          },
        },
      },
    },
  });
  const done = projectView({
    entries: [
      ...entries,
      {
        id: "b",
        model: [
          { role: "assistant", content: [{ type: "text", text: "Done" }] },
        ],
      },
    ],
  });
  assert.equal(live.messages[1].id, done.messages[1].id);
  assert.equal(live.messages[1].content.length, 2);
  assert.equal(live.messages[1].status.type, "running");
});
