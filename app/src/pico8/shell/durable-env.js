// pi-durable ExecutionEnv over the agent environment (env.mjs): files from its
// just-bash MountableFs, commands through its shell. This is the shape Maker's
// shell flow would use, with /cart/main.lua mapped to the cart draft.
import { ok, err, ExecutionError, FileError, LineScanner } from "@earendil-works/pi-durable/env";
import { posix } from "./posix-path.js";

/** just-bash throws Node-style messages ("ENOENT: ...", "EROFS: ..."); map them to FileError codes. */
function fileError(e, path) {
  const m = String(e?.message ?? e);
  const code = /ENOENT/.test(m) ? "not_found" : /EISDIR/.test(m) ? "is_directory" : /ENOTDIR/.test(m) ? "not_directory" : /EROFS|EACCES|EPERM/.test(m) ? "permission_denied" : "unknown";
  return err(new FileError(code, m, path));
}

export function durableEnv({ fs, exec, cwd }) {
  const abs = (p) => posix.resolve(cwd, String(p));
  const info = async (p) => {
    const st = await fs.stat(p);
    return { name: posix.basename(p) || "/", path: p, kind: st.isDirectory ? "directory" : st.isSymbolicLink ? "symlink" : "file", size: st.size, mtimeMs: st.mtime?.getTime?.() ?? 0 };
  };
  const wrap = (fn) => async (path, ...rest) => {
    const p = abs(path);
    try {
      return ok(await fn(p, ...rest));
    } catch (e) {
      return fileError(e, p);
    }
  };
  const notSupported = async (path) => err(new FileError("not_supported", "Not supported here", path));
  let temp = 0;
  const self = {
    id: "lab-cart",
    cwd,
    absolutePath: async (p) => ok(abs(p)),
    joinPath: async (parts) => ok(posix.join(...parts)),
    canonicalPath: wrap(async (p) => (await fs.exists(p) ? p : Promise.reject(new Error(`ENOENT: ${p}`)))),
    exists: wrap((p) => fs.exists(p)),
    fileInfo: wrap(info),
    listDir: wrap(async (p) => Promise.all((await fs.readdir(p)).map((n) => info(posix.join(p, n))))),
    readTextFile: wrap((p) => fs.readFile(p, "utf8")),
    readTextLines: wrap(async (p, o) => {
      const lines = (await fs.readFile(p, "utf8")).split("\n");
      return o?.maxLines ? lines.slice(0, o.maxLines) : lines;
    }),
    readBinaryFile: wrap((p) => fs.readFileBuffer(p)),
    writeFile: wrap(async (p, content) => {
      await fs.mkdir(posix.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    }),
    appendFile: wrap((p, content) => fs.appendFile(p, content)),
    flushFile: wrap(async () => undefined),
    truncateFile: wrap(async (p, size) => fs.writeFile(p, (await fs.readFileBuffer(p)).slice(0, size))),
    renameFile: async (a, b) => {
      try {
        return ok(await fs.mv(abs(a), abs(b)));
      } catch (e) {
        return fileError(e, abs(a));
      }
    },
    createDir: wrap((p, o) => fs.mkdir(p, { recursive: !!o?.recursive })),
    remove: wrap((p, o) => fs.rm(p, { recursive: !!o?.recursive, force: !!o?.force })),
    createTempDir: async (prefix = "tmp") => {
      const p = `/tmp/${prefix}${++temp}`;
      await fs.mkdir(p, { recursive: true });
      return ok(p);
    },
    createTempFile: async (o) => {
      const p = `/tmp/${o?.prefix ?? "tmp"}${++temp}${o?.suffix ?? ""}`;
      await fs.writeFile(p, "");
      return ok(p);
    },
    openTextLineReader: notSupported,
    openDirReader: notSupported,
    watch: async (targets) => notSupported(targets?.[0]?.path),
    async openBinaryReader(path, _o, context) {
      context?.abortSignal?.throwIfAborted();
      const r = await self.readBinaryFile(path);
      if (!r.ok) return r;
      const bytes = r.value;
      const meta = { ...(await info(abs(path))), size: bytes.length };
      return ok({
        info: async () => ok(meta),
        read: async (offset, length) => ok(bytes.slice(offset, offset + length)),
        scanLines: async (options) => {
          const scan = new LineScanner(options.startLine, options.endLine);
          scan.push(bytes);
          return ok(scan.finish());
        },
        close: async () => {},
      });
    },
    async exec(command, options, context) {
      if (typeof command !== "string") return err(new ExecutionError("spawn_error", "argv execution is not supported; pass a shell command"));
      const controller = new AbortController();
      const stop = () => controller.abort();
      context?.abortSignal?.addEventListener("abort", stop, { once: true });
      const timer = options?.timeout ? setTimeout(stop, options.timeout * 1000) : undefined;
      try {
        const r = await exec(command, { cwd: options?.cwd ?? cwd, signal: controller.signal });
        if (r.stdout) options?.onOutput?.(r.stdout, context, { stream: "stdout" });
        if (r.stderr) options?.onOutput?.(r.stderr, context, { stream: "stderr" });
        if (context?.abortSignal?.aborted) return err(new ExecutionError("aborted", "Command aborted"));
        if (controller.signal.aborted) return err(new ExecutionError("timeout", "Command timed out"));
        return ok({ exitCode: r.exitCode });
      } finally {
        clearTimeout(timer);
        context?.abortSignal?.removeEventListener("abort", stop);
      }
    },
    cleanup: async () => {},
  };
  return self;
}
