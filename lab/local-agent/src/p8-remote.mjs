// `p8` across a message boundary: one request per command, so a host can run the
// player runtime off its own thread (Maker's main thread) without a round trip per
// frame. The client sends the files under the shell's cwd; the host runs the
// unchanged runP8 on a private InMemoryFs (plus the skill templates) and returns
// stdout, exit code, every file it created or changed, and what run/look played.
import { InMemoryFs } from "just-bash";
import { runP8 } from "./p8.mjs";
import { posix } from "./posix-path.mjs";

const SKILL = "/skill/pico8";
const MAX_FILES = 64;
const MAX_BYTES = 4 << 20;

const equal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Host side: `handle(request)` for messages `{ argv, cwd, files }`; keeps the check memo across calls. */
export function p8Host({ skillFiles = {} } = {}) {
  const memo = new Map();
  const skill = Object.fromEntries(Object.entries(skillFiles).map(([k, v]) => [`${SKILL}/${k}`, v]));
  return async function handle({ argv, cwd, files }) {
    const fs = new InMemoryFs({ ...skill, ...files, "/tmp/.keep": "" });
    const plays = [];
    const r = await runP8(argv, { fs, cwd, memo, onPlay: (p) => plays.push(p) });
    const changes = {};
    for (const path of fs.getAllPaths()) {
      if (path.startsWith(SKILL) || path === "/tmp/.keep") continue;
      const st = await fs.stat(path).catch(() => null);
      if (!st?.isFile) continue;
      const bytes = await fs.readFileBuffer(path);
      const before = files[path];
      const prev = typeof before === "string" ? new TextEncoder().encode(before) : before;
      if (!prev || !equal(prev, bytes)) changes[path] = bytes;
    }
    return { stdout: r.stdout, exitCode: r.exitCode, changes, plays };
  };
}

async function collect(fs, dir, out, budget) {
  for (const name of await fs.readdir(dir)) {
    const path = posix.join(dir, name);
    const st = await fs.stat(path);
    if (st.isDirectory) await collect(fs, path, out, budget);
    else if (st.isFile) {
      if (++budget.files > MAX_FILES || (budget.bytes += st.size) > MAX_BYTES) throw new Error(`p8: ${dir} holds too many files to send`);
      out[path] = await fs.readFileBuffer(path);
    }
  }
}

/**
 * Client side: a just-bash custom command body. `send(request)` delivers to a host
 * (a Worker, a worker_thread, or p8Host directly) and resolves with its response.
 * `onPlay(play)` lets the host page show frames and record routes.
 */
export function remoteP8(send, { onPlay } = {}) {
  return async (args, ctx) => {
    const files = {};
    const cwd = ctx.cwd.startsWith(SKILL) ? "/" : ctx.cwd;
    await collect(ctx.fs, cwd, files, { files: 0, bytes: 0 });
    const r = await send({ argv: args, cwd: ctx.cwd, files });
    for (const [path, bytes] of Object.entries(r.changes)) {
      await ctx.fs.mkdir(posix.dirname(path), { recursive: true });
      await ctx.fs.writeFile(path, bytes);
    }
    for (const p of r.plays) await onPlay?.(p);
    return { stdout: r.stdout, stderr: "", exitCode: r.exitCode };
  };
}

/** Request/response over a postMessage-style port (Web Worker or worker_threads). */
export function portSender(port) {
  let next = 0;
  const pending = new Map();
  const onMessage = (data) => {
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
  };
  if (port.on) port.on("message", onMessage);
  else port.addEventListener("message", ({ data }) => onMessage(data));
  return (request) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      port.postMessage({ id, request });
    });
}
