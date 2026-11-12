// Browser-only cart workspaces. There is no server: shared game files and
// versions, independent conversation sessions and labels live in IndexedDB,
// falling back to memory when the browser refuses storage.
import { newSession, newId } from "./sessions.js";
import { sampleSource } from "./sample.js";

const dbName = "pico8-maker";
const maxSource = 100000;

export function newCart(patch = {}) {
  const now = Date.now();
  const session = patch.sessions?.[0] ?? newSession();
  return {
    id: newId(),
    title: "Untitled cartridge",
    schemaVersion: 2,
    sessions: [session],
    activeSessionId: session.id,
    sourceVersion: 0,
    versions: [sampleSource],
    revision: 1,
    label: null,
    // Agent's working copy of main.lua; null means "same as the latest version".
    sourceDraft: null,
    savedRevision: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

/** Validate a stored record; returns a complete cart or null. */
export function normalizeCart(data) {
  if (
    !data ||
    typeof data.id !== "string" ||
    !Array.isArray(data.sessions) ||
    !data.sessions.length ||
    !data.sessions.every(
      (s) => typeof s.id === "string" && Array.isArray(s.transcript),
    ) ||
    new Set(data.sessions.map((s) => s.id)).size !== data.sessions.length ||
    !Array.isArray(data.versions) ||
    !data.versions.length ||
    !data.versions.every((v) => typeof v === "string" && v.length <= maxSource)
  )
    return null;
  const cart = { ...newCart(), ...data };
  cart.versions = cart.versions.slice(-12);
  if (
    typeof cart.sourceDraft !== "string" ||
    cart.sourceDraft.length > maxSource
  )
    cart.sourceDraft = null;
  cart.sourceVersion = Math.max(0, Number(cart.sourceVersion) || 0);
  cart.sessions = cart.sessions.map((s) => ({
    ...newSession(),
    ...s,
    draft: typeof s.draft === "string" ? s.draft : "",
  }));
  if (!cart.sessions.some((s) => s.id === cart.activeSessionId))
    cart.activeSessionId = cart.sessions[0].id;
  cart.revision = Math.max(Number(cart.revision) || 0, cart.versions.length);
  if (typeof cart.title !== "string" || !cart.title.trim())
    cart.title = "Untitled cartridge";
  return cart;
}

/** A cart earns a shelf slot once it has a conversation or an edit. */
export function isOnShelf(cart) {
  return (
    !!cart &&
    (cart.sessions.length > 1 ||
      cart.sessions.some((s) => s.transcript.length > 0 || s.draft.trim()) ||
      cart.sourceDraft != null ||
      cart.versions.length > 1 ||
      cart.revision > 1)
  );
}

/** "saved" when the current revision has been downloaded as a file. */
export function saveStatus(cart) {
  return cart.savedRevision != null && cart.savedRevision === cart.revision
    ? "saved"
    : "unsaved";
}

export const sortCarts = (carts) =>
  [...carts].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

export function duplicateCart(cart) {
  const now = Date.now();
  const copy = structuredCopy(cart);
  const activeIndex = cart.sessions.findIndex(
    (s) => s.id === cart.activeSessionId,
  );
  copy.sessions = copy.sessions.map((s) => ({
    ...s,
    id: newId(),
    interrupted: false,
  }));
  return newCart({
    ...copy,
    id: newId(),
    title: `${cart.title} (copy)`.slice(0, 120),
    activeSessionId: copy.sessions[activeIndex].id,
    savedRevision: null,
    createdAt: now,
    updatedAt: now,
  });
}

// One-time record upgrade at the storage boundary. Runtime code uses only sessions.
export function upgradeCart(data) {
  if (!data || data.sessions || !Array.isArray(data.transcript)) return data;
  const { transcript, draft, interrupted, workspace, ...shared } = data;
  const session = newSession({
    title: data.title || "First session",
    transcript,
    draft: draft ?? "",
    interrupted: !!interrupted,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
  return {
    ...shared,
    schemaVersion: 2,
    sessions: [session],
    activeSessionId: session.id,
    sourceDraft: workspace ?? null,
    sourceVersion: 0,
  };
}

// IndexedDB only accepts structured-cloneable values; JSON keeps it plain.
const structuredCopy = (value) => JSON.parse(JSON.stringify(value));

export function memoryBackend() {
  const stores = { carts: new Map(), meta: new Map() };
  const keyOf = (store, value) => (store === "carts" ? value.id : value.key);
  return {
    async getAll(store) {
      return [...stores[store].values()].map(structuredCopy);
    },
    async get(store, key) {
      const value = stores[store].get(key);
      return value === undefined ? undefined : structuredCopy(value);
    },
    async put(store, value) {
      stores[store].set(keyOf(store, value), structuredCopy(value));
    },
    async delete(store, key) {
      stores[store].delete(key);
    },
  };
}

const request = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export async function idbBackend(factory = globalThis.indexedDB) {
  if (!factory) throw new Error("IndexedDB is unavailable");
  const open = factory.open(dbName, 1);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains("carts"))
      db.createObjectStore("carts", { keyPath: "id" });
    if (!db.objectStoreNames.contains("meta"))
      db.createObjectStore("meta", { keyPath: "key" });
  };
  const db = await request(open);
  // A newer tab upgrading the schema should not be blocked by this one.
  db.onversionchange = () => db.close();
  const run = (store, mode, fn) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      let result;
      const r = fn(tx.objectStore(store));
      r.onsuccess = () => (result = r.result);
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  return {
    getAll: (s) => run(s, "readonly", (o) => o.getAll()),
    get: (s, k) => run(s, "readonly", (o) => o.get(k)),
    put: (s, v) => run(s, "readwrite", (o) => o.put(structuredCopy(v))),
    delete: (s, k) => run(s, "readwrite", (o) => o.delete(k)),
  };
}

export async function openCartStore({ backend } = {}) {
  let persistent = true;
  if (!backend) {
    try {
      backend = await idbBackend();
    } catch {
      backend = memoryBackend();
      persistent = false;
    }
  }
  const navigation = (await backend.get("meta", "session"))?.value ?? {};
  const carts = [];
  for (const record of await backend.getAll("carts")) {
    const upgraded = upgradeCart(record);
    const cart = normalizeCart(upgraded);
    if (!cart) continue;
    if (upgraded !== record) await backend.put("carts", cart);
    carts.push(cart);
  }
  return {
    persistent,
    carts: sortCarts(carts),
    navigation,
    put: (cart) => backend.put("carts", cart),
    remove: (id) => backend.delete("carts", id),
    setNavigation(patch) {
      Object.assign(navigation, patch);
      return backend.put("meta", { key: "session", value: { ...navigation } });
    },
  };
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence() {
  try {
    if (await globalThis.navigator?.storage?.persisted?.()) return true;
    return (await globalThis.navigator?.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
