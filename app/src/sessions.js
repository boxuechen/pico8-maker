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
  return `Current cart: ${JSON.stringify(cart.title)}. Workspace ID: ${cart.id}. Active session ID: ${session.id}.
At the start of this request: shared cart revision ${cart.revision}; source/resource change counter ${cart.contentVersion}. Tool results describe subsequent changes and current draft/committed state.
${cart.versions.length ? "A committed game exists in this cart." : "No game has been committed yet. The working file may be empty or contain an unfinished draft; create and load the first playable version before testing."}
${session.lastContentVersion == null ? "This is a new conversation about the existing cart." : changed ? "The shared cart content changed before this request, since this conversation last ran. Source, resources and test results from earlier requests are stale; this does not invalidate evidence gathered during this request." : "This conversation shares its source and resources with the cart's other sessions."}
Read /cart/main.lua and read_assets before making changes. Resources are shared across conversations too. Use the current shared working draft, never restore source from conversation history. Starting or switching conversations does not reset the game. Re-establish current test state before relying on historical frames.`;
}
