// /cart backed by an OPFS directory. Write-through: the whole directory is read
// into an InMemoryFs on open (carts are a few files), every read is served from
// memory, and every mutation is mirrored to OPFS before it resolves. Symlinks,
// modes and times stay in memory only.
import { InMemoryFs } from "just-bash";

const MUTATIONS = new Set(["writeFile", "appendFile", "mkdir", "rm", "cp", "mv"]);

async function readDir(handle, prefix, files) {
  for await (const [name, child] of handle.entries()) {
    const path = `${prefix}/${name}`;
    if (child.kind === "directory") {
      files[path] = { content: "", directory: true };
      await readDir(child, path, files);
    } else files[path] = new Uint8Array(await (await child.getFile()).arrayBuffer());
  }
}

async function dirHandle(root, path, create) {
  let h = root;
  for (const part of path.split("/").filter(Boolean)) h = await h.getDirectoryHandle(part, { create });
  return h;
}

const parentAndName = (path) => {
  const i = path.lastIndexOf("/");
  return [path.slice(0, i) || "/", path.slice(i + 1)];
};

/** Make OPFS match memory at `path` (file, directory tree or absence). */
async function mirror(mem, root, path) {
  if (path === "/") {
    for (const name of await mem.readdir("/")) await mirror(mem, root, `/${name}`);
    return;
  }
  const [parent, name] = parentAndName(path);
  const exists = await mem.exists(path);
  const dir = await dirHandle(root, parent, exists).catch(() => null);
  if (!dir) return;
  if (!exists) return dir.removeEntry(name, { recursive: true }).catch((e) => (e?.name === "NotFoundError" ? undefined : Promise.reject(e)));
  const st = await mem.lstat(path);
  if (st.isSymbolicLink) return;
  if (st.isDirectory) {
    await dir.getDirectoryHandle(name, { create: true });
    for (const child of await mem.readdir(path)) await mirror(mem, root, `${path}/${child}`);
    return;
  }
  const file = await dir.getFileHandle(name, { create: true });
  const w = await file.createWritable();
  await w.write(await mem.readFileBuffer(path));
  await w.close();
}

/** Paths a mutation may have changed, in the order to mirror them. */
function touched(method, args) {
  if (method === "mv") return [args[0], args[1]];
  if (method === "cp") return [args[1]];
  return [args[0]];
}

/**
 * @param root FileSystemDirectoryHandle (e.g. from navigator.storage.getDirectory())
 * @param seed optional { "main.lua": "..." } written over what is already there
 * @returns IFileSystem with an extra `flushed()` that resolves after pending mirrors
 */
export async function openOpfsFs(root, seed = {}) {
  const files = {};
  await readDir(root, "", files);
  const init = {};
  for (const [path, v] of Object.entries(files)) if (!v?.directory) init[path] = v;
  const mem = new InMemoryFs(init);
  for (const [path, v] of Object.entries(files)) if (v?.directory) await mem.mkdir(path, { recursive: true });
  let queue = Promise.resolve();
  const sync = (paths) => (queue = queue.then(async () => {
    for (const p of paths) await mirror(mem, root, mem.resolvePath("/", p));
  }));
  const fs = new Proxy(mem, {
    get(target, prop) {
      if (prop === "flushed") return () => queue;
      const value = Reflect.get(target, prop);
      if (typeof value !== "function") return value;
      if (!MUTATIONS.has(prop)) return value.bind(target);
      return async (...args) => {
        const result = await value.apply(target, args);
        await sync(touched(prop, args));
        return result;
      };
    },
  });
  for (const [name, content] of Object.entries(seed)) {
    const [parent] = parentAndName(`/${name}`);
    if (parent !== "/") await fs.mkdir(parent, { recursive: true });
    await fs.writeFile(`/${name}`, content);
  }
  return fs;
}
