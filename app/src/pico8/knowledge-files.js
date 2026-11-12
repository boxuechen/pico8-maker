import manifest from "../generated/pico8-files.js";

export const documentationRoot = "/extensions/pico8";

// One shared, immutable document store per app. References are fetched only on
// demand; successful reads are cached, failures can be retried. No cart copies.
export function createKnowledgeFiles({ index = manifest, load } = {}) {
  const cache = new Map();
  const base = `${import.meta.env?.BASE_URL ?? "/"}extensions/pico8/${index.version}/`;
  const fetchFile =
    load ??
    (async (file) => {
      const response = await fetch(base + file);
      if (!response.ok)
        throw new Error(
          `Could not read PICO-8 document ${file} (${response.status})`,
        );
      return response.text();
    });
  const read = async (path, context = {}) => {
    context.abortSignal?.throwIfAborted();
    const file = path.startsWith(documentationRoot + "/")
      ? path.slice(documentationRoot.length + 1)
      : path;
    if (!Object.hasOwn(index.files, file))
      throw new Error(`Unknown PICO-8 document: ${path}`);
    if (!cache.has(file)) {
      const pending = Promise.resolve()
        .then(() => fetchFile(file))
        .then(async (text) => {
          const bytes = new TextEncoder().encode(text);
          const digest = await globalThis.crypto.subtle.digest(
            "SHA-256",
            bytes,
          );
          const hash = Array.from(new Uint8Array(digest), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join("");
          if (hash !== index.files[file].sha256)
            throw new Error(`PICO-8 document version mismatch: ${file}`);
          return text;
        })
        .catch((error) => {
          cache.delete(file);
          throw error;
        });
      cache.set(file, pending);
    }
    const text = await cache.get(file);
    context.abortSignal?.throwIfAborted();
    return text;
  };
  return {
    version: index.version,
    files: index.files,
    sections: index.sections,
    read,
    // Load required instructions before opening the agent. A missing document
    // must not silently produce an agent without its authoring rules.
    async prepare() {
      await Promise.all(
        Object.values(index.sections).map((file) => read(file)),
      );
    },
  };
}
export const defaultKnowledgeFiles = createKnowledgeFiles();
