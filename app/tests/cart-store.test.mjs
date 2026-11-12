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
  await store.put(newCart({ transcript: [{ role: "user" }] }));
});

test("carts round-trip, sort newest first and keep the session", async () => {
  const backend = memoryBackend();
  const store = await openCartStore({ backend });
  const a = newCart({ title: "A", updatedAt: 1, transcript: [{ role: "user" }] });
  const b = newCart({ title: "B", updatedAt: 2, transcript: [{ role: "user" }] });
  await store.put(a);
  await store.put(b);
  await store.setSession({ currentId: a.id, active: false });
  const reopened = await openCartStore({ backend });
  assert.deepEqual(
    reopened.carts.map((c) => c.title),
    ["B", "A"],
  );
  assert.equal(reopened.session.currentId, a.id);
  assert.deepEqual(sortCarts([a, b]).map((c) => c.title), ["B", "A"]);
});

test("records are validated; broken ones are skipped", async () => {
  assert.equal(normalizeCart({ id: "x", transcript: [], versions: [] }), null);
  assert.equal(normalizeCart({ id: 1, transcript: [], versions: ["a"] }), null);
  assert.equal(
    normalizeCart({ id: "x", transcript: [], versions: ["a".repeat(100001)] }),
    null,
  );
  const fixed = normalizeCart({ id: "x", transcript: [], versions: ["a", "b"], title: "" });
  assert.equal(fixed.title, "Untitled cartridge");
  assert.equal(fixed.revision, 2);
  const backend = memoryBackend();
  await backend.put("carts", { id: "broken" });
  await backend.put("carts", newCart({ id: "ok" }));
  const store = await openCartStore({ backend });
  assert.deepEqual(store.carts.map((c) => c.id), ["ok"]);
});

test("shelf membership, save status and duplicates", () => {
  const blank = newCart();
  assert.equal(isOnShelf(blank), false);
  assert.equal(isOnShelf({ ...blank, transcript: [{ role: "user" }] }), true);

  const cart = newCart({ revision: 4, transcript: [{ role: "user" }] });
  assert.equal(saveStatus(cart), "unsaved");
  assert.equal(saveStatus({ ...cart, savedRevision: 4 }), "saved");
  assert.equal(saveStatus({ ...cart, savedRevision: 3 }), "unsaved");

  const copy = duplicateCart({ ...cart, title: "Frog", savedRevision: 4 });
  assert.notEqual(copy.id, cart.id);
  assert.equal(copy.title, "Frog (copy)");
  assert.equal(copy.savedRevision, null);
  assert.deepEqual(copy.transcript, cart.transcript);
  copy.transcript.push({ role: "assistant" });
  assert.equal(cart.transcript.length, 1);
});
