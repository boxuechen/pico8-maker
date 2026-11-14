// The agent's world: a just-bash shell over a virtual filesystem with the cart
// workspace at /cart (writable) and the pico8 skill at /skill/pico8 (read-only),
// plus `p8` as a shell command. Platform-neutral: the same environment backs the
// Node lab and, with an OPFS-backed /cart, the browser.
import { Bash, defineCommand, InMemoryFs, MountableFs } from "just-bash";
import { runP8 } from "./maker.mjs";

export const CART = "/cart";
export const SKILL = "/skill/pico8";

const WRITES = new Set(["writeFile", "appendFile", "mkdir", "rm", "cp", "mv", "chmod", "symlink", "link", "utimes"]);

/** Reject every mutation, naming the writable place instead. */
export function readOnly(fs, mountPoint) {
  return new Proxy(fs, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== "function") return value;
      if (WRITES.has(prop))
        return async () => {
          throw new Error(`EROFS: ${mountPoint} is read-only. Work in ${CART} (main.lua and your own files).`);
        };
      return value.bind(target);
    },
  });
}

/**
 * @param cartFiles { "main.lua": "...", "checks.json": "..." } relative to /cart
 * @param skillFiles { "SKILL.md": "...", "reference/api.md": "...", ... } relative to /skill/pico8
 * @param cartFs optional IFileSystem for /cart (e.g. OPFS in the browser)
 * @param p8 optional command body (args, ctx) => { stdout, stderr, exitCode } replacing the
 *   in-process p8, e.g. remoteP8(send) to run it in a Worker
 */
export function createEnvironment({ cartFiles = {}, skillFiles = {}, cartFs, p8: p8Body } = {}) {
  const cart = cartFs ?? new InMemoryFs(Object.fromEntries(Object.entries(cartFiles).map(([k, v]) => [`/${k}`, v])));
  const skill = readOnly(new InMemoryFs(Object.fromEntries(Object.entries(skillFiles).map(([k, v]) => [`/${k}`, v]))), SKILL);
  const fs = new MountableFs({
    base: new InMemoryFs({ "/tmp/.keep": "" }),
    mounts: [
      { mountPoint: CART, filesystem: cart },
      { mountPoint: SKILL, filesystem: skill },
    ],
  });
  const memo = new Map();
  const p8 = defineCommand(
    "p8",
    p8Body ??
      (async (args, ctx) => {
        const r = await runP8(args, { fs: ctx.fs, cwd: ctx.cwd, memo });
        return { stdout: r.stdout, stderr: "", exitCode: r.exitCode };
      }),
  );
  const bash = new Bash({ fs, cwd: CART, env: { HOME: CART, PWD: CART }, customCommands: [p8] });
  // just-bash lets some filesystem errors escape exec (e.g. a redirect into the
  // read-only skill); report them like a shell would instead of crashing the run.
  const exec = async (command, options) => {
    try {
      return await bash.exec(command, options);
    } catch (e) {
      if (options?.signal?.aborted) throw e;
      return { stdout: "", stderr: `bash: ${e?.message ?? e}\n`, exitCode: 1 };
    }
  };
  return { fs, bash, exec, cwd: CART };
}
