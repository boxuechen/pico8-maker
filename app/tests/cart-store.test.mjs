import { newSession, activeSession } from "../src/sessions.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  openCartStore,
  memoryBackend,
  newCart,
  normalizeCart,
  isOnShelf,
  saveStatus,
  duplicateCart,
  sortCarts,
} from "../src/cart-store.js";

test("without IndexedDB the shelf falls back to memory and says so", async () => {
  assert.equal(globalThis.indexedDB, undefined);
  const store = await openCartStore();
  assert.equal(store.persistent, false);
  assert.deepEqual(store.carts, []);
  await store.put(
    newCart({ sessions: [newSession({ transcript: [{ role: "user" }] })] }),
  );
});

test("carts round-trip, sort newest first and keep the session", async () => {
  const backend = memoryBackend();
  const store = await openCartStore({ backend });
  const a = newCart({
    title: "A",
    updatedAt: 1,
    sessions: [newSession({ transcript: [{ role: "user" }] })],
  });
  const b = newCart({
    title: "B",
    updatedAt: 2,
    sessions: [newSession({ transcript: [{ role: "user" }] })],
  });
  await store.put(a);
  await store.put(b);
  await store.setNavigation({ currentId: a.id, active: false });
  const reopened = await openCartStore({ backend });
  assert.deepEqual(
    reopened.carts.map((c) => c.title),
    ["B", "A"],
  );
  assert.equal(reopened.navigation.currentId, a.id);
  assert.deepEqual(
    sortCarts([a, b]).map((c) => c.title),
    ["B", "A"],
  );
});

test("records are validated; broken ones are skipped", async () => {
  assert.equal(
    normalizeCart({ id: "x", sessions: [newSession()], versions: [] }),
    null,
  );
  assert.equal(
    normalizeCart({ id: 1, sessions: [newSession()], versions: ["a"] }),
    null,
  );
  assert.equal(
    normalizeCart({
      id: "x",
      sessions: [newSession()],
      versions: ["a".repeat(100001)],
    }),
    null,
  );
  const fixed = normalizeCart({
    id: "x",
    sessions: [newSession()],
    versions: ["a", "b"],
    title: "",
  });
  assert.equal(fixed.title, "Untitled cartridge");
  assert.equal(fixed.revision, 2);
  const backend = memoryBackend();
  await backend.put("carts", { id: "broken" });
  await backend.put("carts", newCart({ id: "ok" }));
  const store = await openCartStore({ backend });
  assert.deepEqual(
    store.carts.map((c) => c.id),
    ["ok"],
  );
});

test("shelf membership, save status and duplicates", () => {
  const blank = newCart();
  assert.equal(isOnShelf(blank), false);
  assert.equal(
    isOnShelf({
      ...blank,
      sessions: [newSession({ transcript: [{ role: "user" }] })],
    }),
    true,
  );

  const cart = newCart({
    revision: 4,
    sessions: [newSession({ transcript: [{ role: "user" }] })],
  });
  assert.equal(saveStatus(cart), "unsaved");
  assert.equal(saveStatus({ ...cart, savedRevision: 4 }), "saved");
  assert.equal(saveStatus({ ...cart, savedRevision: 3 }), "unsaved");

  const copy = duplicateCart({ ...cart, title: "Frog", savedRevision: 4 });
  assert.notEqual(copy.id, cart.id);
  assert.equal(copy.title, "Frog (copy)");
  assert.equal(copy.savedRevision, null);
  assert.deepEqual(copy.sessions[0].transcript, cart.sessions[0].transcript);
  copy.sessions[0].transcript.push({ role: "assistant" });
  assert.equal(cart.sessions[0].transcript.length, 1);
});

test("named empty carts persist and default numbering survives reload and deletion", async () => {
  const backend = memoryBackend();
  const store = await openCartStore({ backend });
  const named = await store.createCart("  月亮钓鱼  ");
  assert.equal(named.title, "月亮钓鱼");
  assert.equal(isOnShelf(named), true);
  const first = await store.createCart("   ");
  assert.equal(first.title, "New Cart1");
  await store.remove(first.id);
  const reopened = await openCartStore({ backend });
  assert.equal((await reopened.createCart()).title, "New Cart2");
  await reopened.createCart("New Cart9");
  assert.equal((await reopened.createCart()).title, "New Cart10");
  assert.equal(
    (await openCartStore({ backend })).carts.find((c) => c.id === named.id)
      .title,
    "月亮钓鱼",
  );
});

test("default cart names skip existing numbered titles", async () => {
  const backend = memoryBackend();
  await backend.put("carts", newCart({ title: "New Cart7" }));
  const store = await openCartStore({ backend });
  assert.equal((await store.createCart()).title, "New Cart8");
});
