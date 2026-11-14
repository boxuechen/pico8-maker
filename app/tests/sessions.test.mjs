import { emptySnapshot } from "../src/pico8/assets.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  activeSession,
  addSession,
  updateSession,
  sessionContext,
} from "../src/sessions.js";
import {
  newCart,
  duplicateCart,
  openCartStore,
  memoryBackend,
} from "../src/cart-store.js";
import { Agent } from "./helpers/agent.mjs";
import { defaultConfig } from "../src/model-config.js";
import { Game } from "../src/game.js";

test("sessions round-trip independently while source and versions stay shared", async () => {
  const backend = memoryBackend(),
    store = await openCartStore({ backend });
  const cart = newCart({
    title: "Frog",
    versions: ["v1", "v2"].map(emptySnapshot),
    revision: 2,
    workingDraft: emptySnapshot("v2 + edits"),
    contentVersion: 3,
  });
  const first = activeSession(cart);
  updateSession(cart, cart.id, first.id, {
    transcript: [{ role: "user", content: "first" }],
    draft: "first draft",
    interrupted: true,
  });
  const second = addSession(cart);
  updateSession(cart, cart.id, second.id, {
    transcript: [{ role: "user", content: "second" }],
    draft: "second draft",
  });
  assert.equal(
    updateSession(cart, cart.id, first.id, { draft: "late result" }),
    false,
  );
  assert.equal(
    updateSession(cart, "another cart", second.id, { transcript: [] }),
    false,
  );
  await store.put(cart);
  const restored = (await openCartStore({ backend })).carts[0];
  assert.equal(activeSession(restored).id, second.id);
  assert.equal(activeSession(restored).draft, "second draft");
  restored.activeSessionId = first.id;
  assert.equal(activeSession(restored).draft, "first draft");
  assert.equal(activeSession(restored).interrupted, true);
  assert.equal(restored.workingDraft.source, "v2 + edits");
  assert.deepEqual(
    restored.versions.map((s) => s.source),
    ["v1", "v2"],
  );
  const copy = duplicateCart(restored);
  assert.notEqual(copy.id, restored.id);
  assert.ok(
    copy.sessions.every(
      (s) => !restored.sessions.some((old) => old.id === s.id),
    ),
  );
  assert.equal(activeSession(copy).draft, "first draft");
  assert.equal(activeSession(copy).interrupted, false);
  copy.sessions[0].transcript.push({ role: "assistant", content: "copy" });
  assert.equal(restored.sessions[0].transcript.length, 1);
});
test("source context detects edits from other sessions even before a commit", () => {
  const cart = newCart();
  const a = activeSession(cart);
  a.lastContentVersion = 0;
  addSession(cart);
  cart.contentVersion++;
  cart.workingDraft = emptySnapshot("edited");
  assert.match(sessionContext(cart, a), /shared cart content changed/);
  assert.match(
    sessionContext(cart, a),
    /Earlier source, resources and test results are stale/,
  );
  assert.doesNotMatch(sessionContext(cart, activeSession(cart)), /stale/);
  assert.match(sessionContext(cart, a), /Draft has uncommitted changes/);
});
test("real Pi conversations isolate histories and read the current shared game on resume", async (t) => {
  const cart = newCart({ title: "One cart" });
  const first = activeSession(cart);
  const game = new Game(() => {});
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    const delta = { role: "assistant", content: "session reply" };
    return new Response(
      `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "deepseek-flash", choices: [{ index: 0, delta, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
  async function run(session, prompt) {
    cart.activeSessionId = session.id;
    const agent = new Agent(
      game,
      (_view, transcript) => {
        session.transcript = transcript;
      },
      { projectContext: () => sessionContext(cart, session) },
    );
    try {
      await agent.open(session.transcript);
      await agent.configure({ ...defaultConfig, apiKey: "fixture" });
      await agent.send(prompt);
      // Snapshot committed messages even if the watch callback has not fired yet.
      const view = await agent.root.context(
        (await import("@earendil-works/chord/context")).BACKGROUND_CONTEXT,
      );
      session.transcript = view.messages;
    } finally {
      await agent.dispose();
    }
  }
  await run(first, "SESSION_A_ONLY");
  first.lastContentVersion = 0;
  const second = addSession(cart);
  game.setDraft("print('session B changes')");
  cart.contentVersion++;
  await run(second, "SESSION_B_ONLY");
  assert.ok(!JSON.stringify(requests[1]).includes("SESSION_A_ONLY"));
  await run(first, "RESUME_A");
  const resumed = JSON.stringify(requests[2]);
  assert.ok(resumed.includes("SESSION_A_ONLY"));
  assert.ok(!resumed.includes("SESSION_B_ONLY"));
  assert.ok(resumed.includes("shared cart content changed"));
  assert.equal(
    game.draft.source,
    "print('session B changes')",
  );
});

test("closing an idle session can preserve the shared game runtime", async () => {
  let cancellations = 0;
  const game = {
    draft: { source: "" },
    cancelTests() {
      cancellations++;
    },
  };
  const first = new Agent(game, () => {});
  await first.open();
  await first.dispose({ preserveGame: true });
  assert.equal(cancellations, 0);
  const second = new Agent(game, () => {});
  await second.open();
  await second.dispose();
  assert.equal(cancellations, 1);
});
