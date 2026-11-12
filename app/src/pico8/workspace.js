// A one-file virtual workspace for the agent: /cart/main.lua is the cart's
// working source. The model edits it with pi-durable's built-in `edit` tool;
// load_game compiles it and commits a version. There is no shell and no other
// file, so nothing outside the cart can be read or written.
import { ok, err, FileError, ExecutionError } from "@earendil-works/pi-durable/env";

export const cartDir = "/cart";
export const mainPath = "/cart/main.lua";

function normalize(path) {
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}
const notSupported = (path) =>
  err(new FileError("not_supported", "Not supported in the cart workspace", path));
const notFound = (path) =>
  err(
    new FileError(
      "not_found",
      `Only ${mainPath} exists in this workspace (relative path: main.lua)`,
      path,
    ),
  );
const dirs = new Set(["/", cartDir]);

/**
 * `read()` returns the working source; `write(text)` replaces it. Writes longer
 * than `maxLength` characters are rejected.
 */
export class CartWorkspace {
  constructor({ read, write, maxLength = Infinity }) {
    this.read = read;
    this.write = write;
    this.maxLength = maxLength;
    this.id = "pico8-cart";
    this.cwd = cartDir;
  }
  resolve(path) {
    return normalize(String(path).startsWith("/") ? path : `${this.cwd}/${path}`);
  }
  info(path) {
    if (path === mainPath)
      return {
        name: "main.lua",
        path,
        kind: "file",
        size: new TextEncoder().encode(this.read()).length,
        mtimeMs: 0,
      };
    if (dirs.has(path))
      return { name: path.split("/").pop() || "/", path, kind: "directory", size: 0, mtimeMs: 0 };
    return null;
  }
  async absolutePath(path) {
    return ok(this.resolve(path));
  }
  async joinPath(parts) {
    return ok(normalize(parts.join("/")));
  }
  async canonicalPath(path) {
    const p = this.resolve(path);
    return this.info(p) ? ok(p) : notFound(p);
  }
  async exists(path) {
    return ok(!!this.info(this.resolve(path)));
  }
  async fileInfo(path) {
    const p = this.resolve(path);
    const info = this.info(p);
    return info ? ok(info) : notFound(p);
  }
  async listDir(path) {
    const p = this.resolve(path);
    if (p === "/") return ok([this.info(cartDir)]);
    if (p === cartDir) return ok([this.info(mainPath)]);
    return p === mainPath
      ? err(new FileError("not_directory", "Not a directory", p))
      : notFound(p);
  }
  async readTextFile(path) {
    const p = this.resolve(path);
    if (p === mainPath) return ok(this.read());
    return dirs.has(p)
      ? err(new FileError("is_directory", "Is a directory", p))
      : notFound(p);
  }
  async readTextLines(path, options) {
    const r = await this.readTextFile(path);
    if (!r.ok) return r;
    const lines = r.value.split("\n");
    return ok(options?.maxLines ? lines.slice(0, options.maxLines) : lines);
  }
  async readBinaryFile(path) {
    const r = await this.readTextFile(path);
    return r.ok ? ok(new TextEncoder().encode(r.value)) : r;
  }
  async writeFile(path, content) {
    const p = this.resolve(path);
    if (p !== mainPath)
      return err(
        new FileError(
          "permission_denied",
          `Only ${mainPath} can be written in this workspace`,
          p,
        ),
      );
    const text = typeof content === "string" ? content : new TextDecoder().decode(content);
    if (text.length > this.maxLength)
      return err(
        new FileError(
          "invalid",
          `The cart source is limited to ${this.maxLength} characters`,
          p,
        ),
      );
    this.write(text);
    return ok(undefined);
  }
  async appendFile(path, content) {
    const r = await this.readTextFile(path);
    if (!r.ok) return r;
    const add = typeof content === "string" ? content : new TextDecoder().decode(content);
    return this.writeFile(path, r.value + add);
  }
  async flushFile(path) {
    return (await this.fileInfo(path)).ok ? ok(undefined) : notFound(this.resolve(path));
  }
  async truncateFile(path) {
    return notSupported(this.resolve(path));
  }
  async renameFile(path) {
    return notSupported(this.resolve(path));
  }
  async openTextLineReader(path) {
    return notSupported(this.resolve(path));
  }
  async openBinaryReader(path) {
    return notSupported(this.resolve(path));
  }
  async openDirReader(path) {
    return notSupported(this.resolve(path));
  }
  async watch(targets) {
    return notSupported(targets?.[0]?.path);
  }
  async createDir(path) {
    return notSupported(this.resolve(path));
  }
  async remove(path) {
    return notSupported(this.resolve(path));
  }
  async createTempDir() {
    return notSupported();
  }
  async createTempFile() {
    return notSupported();
  }
  async exec() {
    return err(
      new ExecutionError(
        "shell_unavailable",
        "The cart workspace has no shell. Use read_game, edit and load_game.",
      ),
    );
  }
  async cleanup() {}
}
