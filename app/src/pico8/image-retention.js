// Enlarged frame PNGs dominate request size. Before each provider request,
// replace older tool-result images with a short text note. The stored
// transcript and UI keep every image; only the outgoing request changes.
//
// - Images from earlier user requests are always replaced: re-observe instead.
// - Within the current request, keep the newest `keep` images. The cut moves in
//   steps of `step`, so the request prefix (and provider cache) stays stable
//   for several tool rounds instead of changing on every call.
export const imageRetention = Object.freeze({ keep: 16, step: 16 });
export const omittedImageText =
  "[Earlier frame image omitted to save context. Run p8 look again for a current frame.]";

export function retainRecentImages(messages, { keep, step } = imageRetention) {
  let lastUser = -1;
  messages.forEach((m, i) => {
    if (m.role === "user") lastUser = i;
  });
  const current = [];
  messages.forEach((m, i) => {
    if (i > lastUser && m.role === "toolResult" && Array.isArray(m.content))
      m.content.forEach((part, j) => {
        if (part.type === "image") current.push(`${i}:${j}`);
      });
  });
  const cut = Math.max(0, Math.floor((current.length - keep) / step) * step);
  const dropped = new Set(current.slice(0, cut));
  let changed = false;
  const result = messages.map((m, i) => {
    if (m.role !== "toolResult" || !Array.isArray(m.content)) return m;
    if (!m.content.some((p) => p.type === "image")) return m;
    const content = m.content.map((part, j) =>
      part.type === "image" && (i < lastUser || dropped.has(`${i}:${j}`))
        ? { type: "text", text: omittedImageText }
        : part,
    );
    if (content.every((p, j) => p === m.content[j])) return m;
    changed = true;
    return { ...m, content };
  });
  return changed ? result : messages;
}

export const textOnlyImageText =
  "[Image not shown: this model reads text only. Use the 32x32 text picture of p8 look, or p8 look --crop x,y,w,h for exact pixels.]";

/** For a model without image input: every tool-result image becomes a text note. */
export function textOnlyImages(messages) {
  let changed = false;
  const result = messages.map((m) => {
    if (m.role !== "toolResult" || !Array.isArray(m.content) || !m.content.some((p) => p.type === "image")) return m;
    changed = true;
    return { ...m, content: m.content.map((p) => (p.type === "image" ? { type: "text", text: textOnlyImageText } : p)) };
  });
  return changed ? result : messages;
}
