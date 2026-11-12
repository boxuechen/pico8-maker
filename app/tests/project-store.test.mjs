import test from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { Agent } from "../src/agent.js";
import {
  compactTranscript,
  recoverTranscript,
} from "../src/project-store.js";
const user = { role: "user", content: "把小猫变成蓝色", timestamp: 1 };
const call = {
  role: "assistant",
  content: [
    { type: "toolCall", id: "call-1", name: "observe_game", arguments: {} },
  ],
  api: "openai-completions",
  provider: "fixture",
  model: "fixture",
  stopReason: "toolUse",
  timestamp: 2,
};
const result = {
  role: "toolResult",
  toolCallId: "call-1",
  toolName: "observe_game",
  content: [
    { type: "text", text: "帧 1" },
    { type: "image", data: "large-image", mimeType: "image/png" },
  ],
  isError: false,
  timestamp: 3,
};
test("snapshot omits screenshots and repairs interrupted tools without replaying them", () => {
  const compact = compactTranscript([{ model: [user, call, result] }]);
  assert.equal(JSON.stringify(compact).includes("large-image"), false);
  assert.equal(recoverTranscript(compact)[2].isError, false);
  const recovered = recoverTranscript([user, call]);
  assert.equal(recovered[2].toolCallId, "call-1");
  assert.equal(recovered[2].isError, true);
});
test("restored history is in the actual model context, with no automatic generation or tool replay", async () => {
  let called = false;
  let view;
  const agent = new Agent(
    {
      execute() {
        called = true;
      },
      cancelTests() {},
    },
    (value) => {
      view = value;
    },
  );
  try {
    await agent.open([user, call]);
    const restored = await agent.root.context(context);
    assert.equal(restored.messages[0].content, user.content);
    assert.equal(restored.messages.at(-1).role, "toolResult");
    assert.equal(restored.messages.at(-1).isError, true);
    assert.equal(view.isRunning, false);
    assert.equal(called, false);
    assert.equal(view.messages[0].content[0].text, user.content);
  } finally {
    await agent.dispose();
  }
});
