// Browser-only cart workspaces. There is no server: shared game files and
// versions, independent conversation sessions and labels live in IndexedDB,
// falling back to memory when the browser refuses storage.
import { newSession, newId } from "./sessions.js";
import { validSnapshot } from "./pico8/assets.js";
import { normalizePlaytests } from "./pico8/playtests.js";

const dbName = "pico8-maker";
// Default names in either UI language share one counter: "New Cart 3", "新卡带 3".
const numbered = /^(?:New Cart|新卡带) ?(\d+)$/;

/** Cart working files the Agent may keep next to main.lua. */
export const CART_FILES = ["checks.json"];

export function newCart(patch = {}) {
  const now = Date.now();
  const session = patch.sessions?.[0] ?? newSession();
  return {
    id: newId(),
    title: "Untitled cartridge",
    schemaVersion: 4,
    sessions: [session],
    activeSessionId: session.id,
    contentVersion: 0,
    versions: [],
    playtests: [],
    // Working files kept with the cart, outside versions (checks.json).
    files: {},
    comparison: null,
    revision: 0,
    label: null,
    // Source and resource draft; null means same as the latest complete version.
    workingDraft: null,
    savedRevision: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

/** Validate a stored record; returns a complete cart or null. */
export function normalizeCart(data) {
  // Version 3 conversations were made with the earlier agent tools; the shell
  // agent cannot resume them, so they are cleared and the cart keeps its game.
  if (data?.schemaVersion === 3 && Array.isArray(data.sessions)) {
    const session = newSession();
    data = { ...data, schemaVersion: 4, sessions: [session], activeSessionId: session.id };
  }
  if (
    !data ||
    data.schemaVersion !== 4 ||
    typeof data.id !== "string" ||
    !Array.isArray(data.sessions) ||
    !data.sessions.length ||
    !data.sessions.every(
      (s) => typeof s.id === "string" && Array.isArray(s.transcript),
    ) ||
    new Set(data.sessions.map((s) => s.id)).size !== data.sessions.length ||
    !Array.isArray(data.versions) ||
    !data.versions.every(validSnapshot) ||
    (data.workingDraft != null && !validSnapshot(data.workingDraft))
  )
    return null;
  const cart = { ...newCart(), ...data };
  cart.versions = cart.versions.slice(-12);
  cart.playtests = normalizePlaytests(cart.playtests);
  cart.files = Object.fromEntries(
    Object.entries(cart.files && typeof cart.files === "object" ? cart.files : {}).filter(
      ([k, v]) => CART_FILES.includes(k) && typeof v === "string",
    ),
  );
  cart.comparison =
    validSnapshot(cart.comparison?.snapshot) &&
    Number.isInteger(cart.comparison.revision) &&
    cart.comparison.revision > 0
      ? {
          snapshot: { ...cart.comparison.snapshot },
          revision: cart.comparison.revision,
        }
      : null;
  cart.contentVersion = Math.max(0, Number(cart.contentVersion) || 0);
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

/** Named carts remain on the shelf even before their first conversation. */
export function isOnShelf(cart) {
  return (
    !!cart &&
    (cart.named === true ||
      cart.sessions.length > 1 ||
      cart.sessions.some((s) => s.transcript.length > 0 || s.draft.trim()) ||
      cart.workingDraft != null ||
      cart.versions.length > 0 ||
      cart.revision > 0)
  );
}

/** "empty" before the first version; "saved" once the current revision was downloaded. */
export function saveStatus(cart) {
  if (!cart.versions?.length && !cart.revision) return "empty";
  return cart.savedRevision != null && cart.savedRevision === cart.revision
    ? "saved"
    : "unsaved";
}

/** A cart title from the first prompt: one line, trimmed at a word boundary. */
export function titleFromPrompt(text, max = 40) {
  const line = String(text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.。!！?？]+$/, "");
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trim()}…`;
}

/** A new shelf cart holding an imported or remixed cartridge as its first version. */
export function importedCart({ title, snapshot, label = null, origin = null }) {
  return newCart({
    title: String(title || "Untitled cartridge")
      .trim()
      .slice(0, 120),
    named: true,
    versions: [snapshot],
    revision: 1,
    label,
    origin,
  });
}

export const sortCarts = (carts) =>
  [...carts].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

export function duplicateCart(cart, suffix = "(copy)") {
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
    title: `${cart.title} ${suffix}`.slice(0, 120),
    activeSessionId: copy.sessions[activeIndex].id,
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
  const navigation = (await backend.get("meta", "session"))?.value ?? {};
  const carts = [];
  for (const record of await backend.getAll("carts")) {
    const cart = normalizeCart(record);
    if (!cart) continue;
    carts.push(cart);
  }
  return {
    persistent,
    carts: sortCarts(carts),
    navigation,
    put: (cart) => backend.put("carts", cart),
    remove: (id) => backend.delete("carts", id),
    defaultCartName(prefix = "New Cart") {
      return `${prefix} ${Math.max(navigation.nextCartNumber || 1, ...carts.map((c) => Number(numbered.exec(c.title)?.[1] || 0) + 1))}`;
    },
    async createCart(name = "", prefix) {
      const title = name.trim().slice(0, 120) || this.defaultCartName(prefix);
      const number = numbered.exec(title)?.[1];
      if (number)
        await this.setNavigation({
          nextCartNumber: Math.max(
            navigation.nextCartNumber || 1,
            Number(number) + 1,
          ),
        });
      const cart = newCart({ title, named: true });
      await backend.put("carts", cart);
      carts.push(cart);
      return cart;
    },
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
