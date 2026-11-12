import {
  ok,
  err,
  FileError,
  LineScanner,
} from "@earendil-works/pi-durable/env";
import { documentationRoot } from "./knowledge-files.js";

// Compose one cart's writable environment with shared, immutable documentation.
// The documentation store only accepts manifest paths; no arbitrary URL access.
export function mountKnowledge(cart, knowledge) {
  const dirs = new Set(["/", "/extensions", documentationRoot]);
  const files = new Map(
    Object.entries(knowledge.files).map(([file, meta]) => {
      const path = `${documentationRoot}/${file}`;
      for (
        let d = path.slice(0, path.lastIndexOf("/"));
        d;
        d = d.slice(0, d.lastIndexOf("/"))
      )
        dirs.add(d);
      return [
        path,
        {
          name: file.split("/").at(-1),
          path,
          kind: "file",
          size: meta.size,
          mtimeMs: 0,
        },
      ];
    }),
  );
  const resolve = (path) => {
    const parts = [];
    for (const part of (path.startsWith("/")
      ? path
      : `${cart?.cwd ?? "/cart"}/${path}`
    ).split("/")) {
      if (part === "..") parts.pop();
      else if (part && part !== ".") parts.push(part);
    }
    return "/" + parts.join("/");
  };
  const missing = (path) =>
    err(new FileError("not_found", "File not found", path));
  const info = (path) =>
    files.get(path) ??
    (dirs.has(path)
      ? {
          name: path.split("/").at(-1),
          path,
          kind: "directory",
          size: 0,
          mtimeMs: 0,
        }
      : null);
  const env = {
    id: cart?.id ?? `pico8-documents-${knowledge.version}`,
    cwd: cart?.cwd ?? "/cart",
    absolutePath: async (path) => ok(resolve(path)),
    canonicalPath: async (path, ctx) =>
      (await env.exists(path, ctx)).value ? ok(resolve(path)) : missing(path),
    async exists(path, ctx) {
      const p = resolve(path);
      return info(p) ? ok(true) : cart ? cart.exists(p, ctx) : ok(false);
    },
    async fileInfo(path, ctx) {
      const p = resolve(path);
      return info(p) ? ok(info(p)) : cart ? cart.fileInfo(p, ctx) : missing(p);
    },
    async listDir(path, ctx) {
      const p = resolve(path);
      if (!dirs.has(p)) return cart ? cart.listDir(p, ctx) : missing(p);
      const children = [...dirs, ...files.keys()]
        .filter(
          (x) =>
            x !== p && x.slice(0, x.lastIndexOf("/")) === (p === "/" ? "" : p),
        )
        .map(info);
      if (p === "/" && cart) {
        const existing = await cart.listDir(p, ctx);
        if (existing.ok)
          children.push(
            ...existing.value.filter(
              (x) => !children.some((y) => y.path === x.path),
            ),
          );
      }
      return ok(children);
    },
    async readTextFile(path, ctx = {}) {
      ctx.abortSignal?.throwIfAborted();
      const p = resolve(path);
      if (dirs.has(p))
        return err(new FileError("is_directory", "Is a directory", p));
      if (!files.has(p)) return cart ? cart.readTextFile(p, ctx) : missing(p);
      try {
        return ok(await knowledge.read(p, ctx));
      } catch (e) {
        return err(
          new FileError(
            ctx.abortSignal?.aborted ? "aborted" : "unknown",
            e.message,
            p,
            e,
          ),
        );
      }
    },
    async openBinaryReader(path, _options, ctx = {}) {
      const result = await env.readTextFile(path, ctx);
      if (!result.ok) return result;
      const bytes = new TextEncoder().encode(result.value);
      const metadata = {
        ...(await env.fileInfo(path, ctx)).value,
        size: bytes.length,
      };
      let closed = false;
      const check = (context) => {
        context?.abortSignal?.throwIfAborted();
        if (closed) throw new Error("Reader is closed");
      };
      return ok({
        async info(context) {
          check(context);
          return ok(metadata);
        },
        async read(offset, length, context) {
          check(context);
          return ok(bytes.slice(offset, offset + length));
        },
        async scanLines(options, context) {
          check(context);
          const scan = new LineScanner(options.startLine, options.endLine);
          scan.push(bytes);
          return ok(scan.finish());
        },
        async close() {
          closed = true;
        },
      });
    },
  };
  // All mutations remain cart-only, even when called through the composed env.
  return new Proxy(env, {
    get(target, key) {
      if (key in target) return target[key];
      const value = cart?.[key];
      return typeof value === "function" ? value.bind(cart) : value;
    },
  });
}
