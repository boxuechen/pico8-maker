// Browser-only cart shelf. There is no server: every cart (chat transcript,
// source versions, label) lives in IndexedDB, falling back to memory when the
// browser refuses storage.
import { sampleSource } from "./sample.js";

const dbName = "pico8-maker";
const maxSource = 100000;

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `cart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function newCart(patch = {}) {
  const now = Date.now();
  return {
    id: uuid(),
    title: "Untitled cartridge",
    transcript: [],
    versions: [sampleSource],
    revision: 1,
    label: null,
    draft: "",
    interrupted: false,
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
    !Array.isArray(data.transcript) ||
    !Array.isArray(data.versions) ||
    !data.versions.length ||
    !data.versions.every((v) => typeof v === "string" && v.length <= maxSource)
  )
    return null;
  const cart = { ...newCart(), ...data };
  cart.versions = cart.versions.slice(-12);
  cart.revision = Math.max(Number(cart.revision) || 0, cart.versions.length);
  if (typeof cart.title !== "string" || !cart.title.trim())
    cart.title = "Untitled cartridge";
  return cart;
}

/** A cart earns a shelf slot once it has a conversation or an edit. */
export function isOnShelf(cart) {
  return (
    !!cart &&
    (cart.transcript.length > 0 || cart.versions.length > 1 || cart.revision > 1)
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
  return newCart({
    ...structuredCopy(cart),
    id: uuid(),
    title: `${cart.title} (copy)`.slice(0, 120),
    interrupted: false,
    savedRevision: null,
    createdAt: now,
    updatedAt: now,
  });
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
  const session = (await backend.get("meta", "session"))?.value ?? {};
  const carts = (await backend.getAll("carts")).map(normalizeCart).filter(Boolean);
  return {
    persistent,
    carts: sortCarts(carts),
    session,
    put: (cart) => backend.put("carts", cart),
    remove: (id) => backend.delete("carts", id),
    setSession(patch) {
      Object.assign(session, patch);
      return backend.put("meta", { key: "session", value: { ...session } });
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
