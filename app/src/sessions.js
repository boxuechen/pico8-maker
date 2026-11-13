import { emptySnapshot, sameSnapshot } from "./pico8/assets.js";
import { coverageNote, revisionCoverage } from "./pico8/playtests.js";

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function newSession(patch = {}) {
  const now = Date.now();
  return {
    id: newId(),
    title: "New session",
    transcript: [],
    draft: "",
    interrupted: false,
    lastContentVersion: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}
export function activeSession(cart) {
  const session = cart.sessions.find((s) => s.id === cart.activeSessionId);
  if (!session) throw new Error("The cart has no active session");
  return session;
}
export function addSession(cart) {
  const session = newSession();
  cart.sessions.push(session);
  cart.activeSessionId = session.id;
  return session;
}
// Captured cart/session identities make late callbacks harmless after switching.
export function updateSession(cart, cartId, sessionId, patch) {
  if (cart.id !== cartId || cart.activeSessionId !== sessionId) return false;
  const session = activeSession(cart);
  const changed = Object.keys(patch).some(
    (key) => JSON.stringify(session[key]) !== JSON.stringify(patch[key]),
  );
  if (!changed) return false;
  const contentChanged =
    ("transcript" in patch &&
      JSON.stringify(session.transcript) !==
        JSON.stringify(patch.transcript)) ||
    ("title" in patch && session.title !== patch.title);
  Object.assign(session, patch);
  if (contentChanged) session.updatedAt = cart.updatedAt = Date.now();
  return true;
}
export function sessionContext(cart, session) {
  const changed =
    session.lastContentVersion != null &&
    session.lastContentVersion !== cart.contentVersion;
  const committed = cart.versions.at(-1);
  const dirty =
    cart.workingDraft != null &&
    !sameSnapshot(cart.workingDraft, committed ?? emptySnapshot());
  return [
    `Cart ${JSON.stringify(cart.title)} at request start. ${committed ? `Committed revision ${cart.revision}.` : "No committed game."} ${dirty ? "Draft has uncommitted changes." : "Draft is clean."} Follow tool results for current state.`,
    committed &&
      `Recorded playtests: ${coverageNote(revisionCoverage(cart.playtests, cart.revision))}`,
    changed &&
      "The shared cart content changed before this request. Earlier source, resources and test results are stale. Use the current draft and establish fresh evidence.",
  ]
    .filter(Boolean)
    .join("\n");
}
