import test from "node:test";
import assert from "node:assert/strict";
import { Agent, knowledge } from "./helpers/knowledge.mjs";
import { defaultConfig } from "../src/model-config.js";
import { Game } from "../src/game.js";
import { emptySnapshot } from "../src/pico8/assets.js";
import { createPico8Extension } from "../src/pico8/extension.js";
import { sessionContext, activeSession } from "../src/sessions.js";
import { newCart } from "../src/cart-store.js";
import { EvaluationGame } from "../scripts/evaluation/core.mjs";

const reply = (name, args = {}) => {
  const delta = name
    ? {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: crypto.randomUUID(),
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      }
    : { role: "assistant", content: "Done." };
  return new Response(
    `data: ${JSON.stringify({
      id: "fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "deepseek-flash",
      choices: [
        { index: 0, delta, finish_reason: name ? "tool_calls" : "stop" },
      ],
    })}\n\ndata: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
};
const textOf = (message) =>
  typeof message.content === "string"
    ? message.content
    : message.content
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n");

for (const [boundary, source] of [
  ["lines", "-- short line\n".repeat(2100) + "-- TAIL_SENTINEL"],
  ["bytes", ("--" + "a".repeat(98) + "\n").repeat(550) + "-- TAIL_SENTINEL"],
  ["oversized UTF-8 line", "--" + "界".repeat(25000) + "\n-- TAIL_SENTINEL"],
]) {
  test(`read_game continuation crosses ${boundary} through the actual Harness`, async (t) => {
    let requests = 0;
    let sawTail = false;
    t.mock.method(globalThis, "fetch", async (_url, init) => {
      const body = JSON.parse(init.body);
      if (++requests === 1) return reply("read_game");
      const text = textOf(
        body.messages.filter((m) => m.role === "tool").at(-1),
      );
      assert.ok(!text.includes("Use bash:"));
      assert.ok(!text.includes("\ufffd"));
      if (requests === 2) assert.match(text, /draftSourceBudget/);
      if (text.includes("TAIL_SENTINEL")) {
        sawTail = true;
        return reply();
      }
      assert.ok(
        requests < 6,
        "continuations must advance, not repeat the first page",
      );
      const next = text.match(/Continue with read\((\{[^\n]+?\})\)/);
      assert.ok(next, text.slice(-1000));
      return reply("read", JSON.parse(next[1]));
    });
    const game = new Game(() => {}, { draft: emptySnapshot(source) });
    const agent = new Agent(game, () => {});
    t.after(() => agent.dispose());
    await agent.open();
    await agent.configure({ ...defaultConfig, apiKey: "fixture" });
    assert.equal((await agent.send("Read the current source.")).status, "done");
    assert.equal(sawTail, true);
    assert.equal(game.worker, undefined, "source reads never start a Worker");
  });
}

test("byte ranges preserve every UTF-8 character and enforce the source-only boundary", async () => {
  const source = "a界🙂z".repeat(5);
  const game = new Game(() => {}, { draft: emptySnapshot(source) });
  const read = createPico8Extension({ game, knowledge }).tools.find(
    (t) => t.name === "read",
  );
  let offset = 0,
    rebuilt = "";
  while (offset < Buffer.byteLength(source)) {
    const r = await read.execute(
      { path: "/cart/main.lua", byteOffset: offset, byteLimit: 7 },
      {},
      {},
    );
    rebuilt += r.output[0].text;
    offset += Buffer.byteLength(r.output[0].text);
  }
  assert.equal(rebuilt, source);
  for (const args of [
    { path: "/extensions/pico8/AGENT.md", byteOffset: 0 },
    { path: "main.lua", byteOffset: 2 },
    { path: "main.lua", byteOffset: 0, offset: 1 },
    { path: "main.lua", byteLimit: 16 },
  ])
    await assert.rejects(() => read.execute(args, {}, {}));
});

test("request baseline stays stable through own edit/load and detects external changes on the next request", async (t) => {
  const cart = newCart({
    versions: [emptySnapshot("print(1)")],
    revision: 1,
    contentVersion: 3,
  });
  const session = activeSession(cart);
  session.lastContentVersion = 3;
  const game = new Game(() => {}, {
    versions: cart.versions,
    onDraft: (draft) => {
      cart.workingDraft = draft;
      cart.contentVersion++;
    },
    onSave: (versions, revision) => {
      cart.versions = versions;
      cart.revision = revision;
      cart.contentVersion++;
    },
  });
  game.ensureWorker = async () => {};
  game.player = { pause: async () => {}, loadCart: async () => {} };
  game.rpc = async (action) =>
    action === "advance"
      ? { observation: { state: "paused", frame: null, diagnostics: [] } }
      : { state: "paused", frame: null, diagnostics: [] };
  let calls = 0;
  const prompts = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    prompts.push(
      body.messages
        .filter((m) => m.role === "system")
        .map(textOf)
        .join("\n"),
    );
    calls++;
    if (calls === 1)
      return reply("edit", {
        path: "main.lua",
        edits: [{ oldText: "print(1)", newText: "print(2)" }],
      });
    if (calls === 2) return reply("load_game");
    if (calls === 3) {
      const status = textOf(
        body.messages.filter((m) => m.role === "tool").at(-1),
      );
      assert.match(status, /"committedRevision":2/);
    }
    return reply();
  });
  const agent = new Agent(game, () => {}, {
    projectContext: () => sessionContext(cart, session),
  });
  t.after(() => agent.dispose());
  await agent.open();
  await agent.configure({ ...defaultConfig, apiKey: "fixture" });
  await agent.send("Change the number.");
  assert.equal(prompts.length, 3);
  assert.ok(prompts.every((p) => !p.includes("shared cart content changed")));
  assert.ok(prompts.every((p) => p.includes("change counter 3")));
  session.lastContentVersion = cart.contentVersion;
  await game.workspace.writeFile("main.lua", "print(99)");
  await agent.send("Review the current game.");
  assert.match(
    prompts.at(-1),
    /shared cart content changed before this request/,
  );
  assert.match(
    prompts.at(-1),
    /does not invalidate evidence gathered during this request/,
  );
});

test("cart status distinguishes dirty resources, committed frames, failed drafts and advisory budgets", async (t) => {
  const game = new EvaluationGame();
  t.after(() => game.dispose());
  const over =
    "function _init() local a=0\n" +
    "a+=1\n".repeat(3000) +
    "end\nfunction _draw() cls(1) end";
  const loaded = await game.execute("load_game", { source: over });
  assert.equal(
    loaded.isError,
    false,
    "estimates must not impose a new authoring cap",
  );
  const status = JSON.parse(loaded.output[0].text.split("\n")[0]).cart;
  assert.ok(status.draftSourceBudget.codeTokensApprox > 8192);
  assert.equal(status.draftSourceBudget.warnings.length, 1);
  assert.match(status.draftSourceBudget.compatibility, /unverified/);
  assert.equal(status.draftDirty, false);
  assert.equal(status.observed.cartRevision, game.revision);
  const committed = game.revision;
  await game.execute("edit_assets", {
    edits: [{ kind: "sprite", id: 1, flags: 1 }],
  });
  const observed = await game.execute("observe_game", {
    format: "ascii",
    region: { x: 0, y: 0, width: 1, height: 1 },
  });
  const dirty = JSON.parse(observed.output[0].text.split("\n")[0]).cart;
  assert.equal(dirty.draftDirty, true);
  assert.deepEqual(dirty.observed, {
    kind: "committed",
    cartRevision: committed,
  });
  const failed = await game.execute("load_game", {
    source: "function broken(",
  });
  const failure = JSON.parse(failed.output[0].text.split("\n")[0]).cart;
  assert.equal(failure.committedRevision, committed);
  assert.equal(failure.draftDirty, true);
  assert.deepEqual(failure.observed, {
    kind: "failed-draft",
    cartRevision: null,
  });
  assert.equal(game.source, over);
});
