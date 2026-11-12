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
    lastSourceVersion: null,
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
    session.lastSourceVersion != null &&
    session.lastSourceVersion !== cart.sourceVersion;
  return `Current cart: ${JSON.stringify(cart.title)}. Workspace ID: ${cart.id}. Active session ID: ${session.id}.
Shared source revision: ${cart.revision}; working-file change counter: ${cart.sourceVersion}.
${session.lastSourceVersion == null ? "This is a new conversation about the existing cart." : changed ? "The shared source changed since this conversation last ran. Previous source and test results in this history are stale." : "This conversation shares its source with the cart's other sessions."}
Read /cart/main.lua before making changes. Use the current shared working file, never restore source from conversation history. Starting or switching conversations does not reset the game. Re-establish current test state before relying on historical frames.`;
}
