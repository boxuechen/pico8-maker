import { emptySnapshot } from "../src/pico8/assets.js";
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
  titleFromPrompt,
  importedCart,
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
    normalizeCart({ id: "x", sessions: [newSession()], versions: null }),
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
      versions: [42],
    }),
    null,
  );
  const fixed = normalizeCart({
    schemaVersion: 3,
    id: "x",
    sessions: [newSession()],
    versions: ["a", "b"].map(emptySnapshot),
    title: "",
  });
  assert.equal(fixed.title, "Untitled cartridge");
  assert.equal(fixed.revision, 2);
  // Schema 3 conversations used the removed agent tools: the game stays, history goes.
  const old = { ...newSession(), title: "Old", transcript: [{ id: "e1", model: [{ role: "user", content: "hi" }] }] };
  const upgraded = normalizeCart({ schemaVersion: 3, id: "y", sessions: [old], activeSessionId: old.id, versions: ["a"].map(emptySnapshot), title: "Kept" });
  assert.equal(upgraded.schemaVersion, 4);
  assert.equal(upgraded.title, "Kept");
  assert.equal(upgraded.revision, 1);
  assert.equal(upgraded.sessions.length, 1);
  assert.notEqual(upgraded.sessions[0].id, old.id);
  assert.equal(upgraded.sessions[0].transcript?.length ?? 0, 0);
  assert.equal(upgraded.activeSessionId, upgraded.sessions[0].id);
  const backend = memoryBackend();
  await backend.put("carts", { id: "broken" });
  await backend.put("carts", newCart({ id: "ok" }));
  const store = await openCartStore({ backend });
  assert.deepEqual(
    store.carts.map((c) => c.id),
    ["ok"],
  );
});

test("large source and draft survive a storage round trip without an app character cap", async () => {
  const backend = memoryBackend();
  const source = "-- source\n".repeat(12000);
  const draft = source + "-- working edit";
  const store = await openCartStore({ backend });
  await store.put(
    newCart({
      id: "large",
      versions: [emptySnapshot(source)],
      workingDraft: emptySnapshot(draft),
    }),
  );
  const reopened = await openCartStore({ backend });
  assert.equal(reopened.carts[0].versions[0].source, source);
  assert.equal(reopened.carts[0].workingDraft.source, draft);
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
  assert.equal(saveStatus(newCart({ named: true })), "empty");

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
  assert.equal(first.title, "New Cart 1");
  await store.remove(first.id);
  const reopened = await openCartStore({ backend });
  assert.equal((await reopened.createCart()).title, "New Cart 2");
  await reopened.createCart("New Cart9");
  assert.equal((await reopened.createCart()).title, "New Cart 10");
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
  assert.equal((await store.createCart()).title, "New Cart 8");
});

test("new empty carts persist without demo source or a version", async () => {
  const cart = newCart({ named: true });
  assert.deepEqual(cart.versions, []);
  assert.equal(cart.revision, 0);
  const backend = memoryBackend();
  const store = await openCartStore({ backend });
  await store.put(cart);
  const restored = (await openCartStore({ backend })).carts[0];
  assert.deepEqual(restored.versions, []);
  assert.equal(restored.revision, 0);
  assert.equal(isOnShelf(restored), true);
});

test("titles from prompts and imported carts", () => {
  assert.equal(titleFromPrompt("  Make a frog game.  "), "Make a frog game");
  assert.equal(
    titleFromPrompt("A frog hops across lily pads to catch flies before the sun sets"),
    "A frog hops across lily pads to catch…",
  );
  const cart = importedCart({
    title: "Mole Mole remix",
    snapshot: { source: "print(1)", assets: "00" },
    origin: { title: "Mole Mole", author: "Adam Atomic" },
  });
  assert.equal(cart.revision, 1);
  assert.equal(cart.versions.length, 1);
  assert.equal(isOnShelf(cart), true);
  assert.equal(saveStatus(cart), "unsaved");
  assert.equal(cart.origin.author, "Adam Atomic");
});

test("cart working files: checks.json is kept, other names and non-text values are dropped", () => {
  const base = newCart({ workingDraft: emptySnapshot("x=1") });
  assert.deepEqual(base.files, {});
  const kept = normalizeCart({ ...base, files: { "checks.json": '{"cases":[]}', "notes.txt": "x", "gfx.txt": 3 } });
  assert.deepEqual(kept.files, { "checks.json": '{"cases":[]}' });
  assert.deepEqual(normalizeCart({ ...base, files: "bad" }).files, {});
  const { files: _, ...old } = base;
  assert.deepEqual(normalizeCart(old).files, {}, "carts saved before files existed load with none");
});
