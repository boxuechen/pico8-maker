import test from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { Agent } from "./helpers/knowledge.mjs";
import { compactTranscript, recoverTranscript } from "../src/project-store.js";
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

test("actual Pi compaction survives two reopenings without expanding context or hiding old chat", async (t) => {
  const { defaultConfig } = await import("../src/model-config.js");
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response(
      `data: ${JSON.stringify({
        id: "summary",
        object: "chat.completion.chunk",
        created: 1,
        model: "deepseek-flash",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: "SUMMARY: the player should be blue.",
            },
            finish_reason: "stop",
          },
        ],
      })}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
  const game = {
    cancelTests() {},
    execute() {
      throw new Error("tools must not replay");
    },
  };
  let agent = new Agent(game, () => {});
  t.after(() => agent.dispose());
  await agent.open();
  await agent.configure({ ...defaultConfig, apiKey: "fixture" });
  const original = ["OLD DETAIL ".repeat(100), "RECENT REQUEST"];
  for (const content of original) {
    const submission = await agent.root.submit(
      {
        type: "write",
        entry: {
          kind: "pi.user",
          model: [{ role: "user", content, timestamp: 1 }],
        },
      },
      context,
    );
    await submission.wait(context);
  }
  await agent.root.configure({ compaction: { keepRecentTokens: 1 } }, context);
  const task = await agent.root.compact(undefined, context);
  await agent.harness.waitForTask(task, context);
  const before = await agent.root.context(context);
  assert.equal(before.head.kind, "pi.compaction");
  assert.ok(!JSON.stringify(before.messages).includes("OLD DETAIL"));
  const page = await agent.root.entries(
    { order: "ascending" },
    1000,
    undefined,
    context,
  );
  let snapshot = compactTranscript(page.items);
  for (let i = 0; i < 2; i++) {
    await agent.dispose();
    let view;
    agent = new Agent(game, (next) => {
      view = next;
    });
    await agent.open(snapshot);
    const after = await agent.root.context(context);
    assert.deepEqual(after.messages, before.messages);
    assert.ok(JSON.stringify(view.messages).includes("OLD DETAIL"));
    assert.ok(!JSON.stringify(view.messages).includes("SUMMARY:"));
    snapshot = compactTranscript([...agent.transcriptEntries.values()]);
  }
  assert.equal(
    requests,
    1,
    "restore must not regenerate a summary or replay input",
  );
});

test("thinking signatures and interrupted tools survive structured snapshots", async () => {
  const thought = {
    type: "thinking",
    thinking: "Checking the plan",
    thinkingSignature: "signed-block",
  };
  const snapshot = compactTranscript([
    {
      id: 10,
      kind: "pi.assistant",
      model: [{ ...call, content: [thought, ...call.content] }],
    },
  ]);
  const agent = new Agent(
    {
      cancelTests() {},
      execute() {
        throw new Error("no replay");
      },
    },
    () => {},
  );
  try {
    await agent.open(snapshot);
    const restored = await agent.root.context(context);
    assert.deepEqual(restored.messages[0].content[0], thought);
    assert.equal(restored.messages.at(-1).toolCallId, "call-1");
    assert.equal(restored.messages.at(-1).isError, true);
  } finally {
    await agent.dispose();
  }
});
