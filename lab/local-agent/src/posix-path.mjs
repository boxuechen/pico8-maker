// Minimal POSIX path helpers for virtual filesystems (no node:path, so it bundles for browsers).
function normalize(path) {
  const parts = [];
  for (const p of path.split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") parts.pop();
    else parts.push(p);
  }
  return "/" + parts.join("/");
}
export const posix = {
  normalize,
  resolve: (cwd, path) => normalize(path.startsWith("/") ? path : `${cwd}/${path}`),
  join: (...parts) => normalize(parts.join("/")),
  dirname: (path) => normalize(path).replace(/\/[^/]*$/, "") || "/",
};
