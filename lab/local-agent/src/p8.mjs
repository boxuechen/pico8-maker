// `p8` subcommands over any just-bash IFileSystem: the agent's virtual fs (as a
// just-bash command) or the real disk (bin/p8). Text only, except `look --png`,
// which writes an image file for an image-capable read tool. Every error says
// what to do next.
import { posix } from "./posix-path.mjs";
import { checkSource, explainFault, formatItems, loadCasesText, parsePress } from "./checks.mjs";
import { cartText } from "./maker.mjs";
import { encodePng } from "./png.mjs";
import { Runtime } from "./runtime.mjs";
import { soundAssets } from "./sounds.mjs";

export const TEMPLATE_DIR = "/skill/pico8/templates";

const usage = (templates) => `usage:
  p8 check [main.lua]                        lint, boot, input and every case in checks.json
  p8 run [main.lua] --press "right*30 x" [--read g.score,g.mode]
  p8 look [main.lua] [--press "..."] [--png screen.png]
                                             32x32 text picture of the screen; --png also writes a 512x512 image
  p8 new <template>                          start main.lua from a template (${templates.join(", ")})
  p8 export [main.lua] [game.p8]             write a PICO-8 cart`;

function options(args) {
  const opts = {},
    rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) (opts[args[i].slice(2)] = args[i + 1] ?? ""), i++;
    else rest.push(args[i]);
  }
  return { opts, rest };
}
const compact = (v, max = 600) => {
  const s = JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…(truncated; read a narrower path)" : s;
};

class UserError extends Error {}

/** Boot, play the presses, and report mode changes, sounds and the final state. */
async function play(src, press) {
  const rt = new Runtime();
  const loaded = await rt.load(src);
  if (!loaded.ok) return { rt, lines: [`does not boot: ${loaded.diagnostics.map((d) => explainFault(d, src)).join("; ")}`], ok: false };
  const lines = [];
  let mode = (await rt.read(["g.mode"]))["g.mode"];
  const sounds = (loaded.audio ?? []).map((e) => `sfx ${e.sfx ?? `music ${e.music}`}@1`);
  for (const step of parsePress(press)) {
    const r = await rt.advance(step.bits, step.frames, async (frame) => {
      const now = (await rt.read(["g.mode"]))["g.mode"];
      if (now !== mode) lines.push(`frame ${frame}: g.mode ${JSON.stringify(mode)}→${JSON.stringify(now)}`), (mode = now);
    });
    for (const e of r.audio) sounds.push("sfx" in e ? `sfx ${e.sfx}@${e.frame}` : `music ${e.music}@${e.frame}`);
    if (r.fault) {
      lines.push(`fault at frame ${rt.frames + 1}: ${r.fault.map((d) => explainFault(d, src)).join("; ")}`);
      return { rt, lines, ok: false };
    }
  }
  lines.unshift(`ran ${rt.frames} frames`);
  if (sounds.length) lines.push(`sounds: ${sounds.slice(0, 12).join(", ")}${sounds.length > 12 ? ", …" : ""}`);
  return { rt, lines, ok: true };
}

/**
 * Run one p8 invocation.
 * @param argv arguments after `p8`
 * @param io { fs: IFileSystem, cwd, templateDir?, memo?: Map } – memo remembers the
 *   last failing check per file across invocations of one environment.
 * @returns { stdout, exitCode }
 */
export async function runP8(argv, io) {
  const out = [];
  const log = (s) => out.push(s);
  try {
    const exitCode = await dispatch(argv, io, log);
    return { stdout: out.join("\n") + (out.length ? "\n" : ""), exitCode };
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    return { stdout: `error: ${e.message}\n`, exitCode: 2 };
  }
}

async function dispatch(argv, { fs, cwd, templateDir = TEMPLATE_DIR, memo = new Map() }, log) {
  const at = (p) => posix.resolve(cwd, p);
  const templates = async () =>
    (await fs.exists(templateDir)) ? (await fs.readdir(templateDir)).filter((f) => f.endsWith(".lua")).map((f) => f.slice(0, -4)) : [];
  const source = async (file = "main.lua") => {
    if (!(await fs.exists(at(file)))) throw new UserError(`${file} not found. Create it, or start from a template with: p8 new skeleton`);
    const text = await fs.readFile(at(file), "utf8");
    if (!text.trim()) throw new UserError(`${file} is empty. Write the game, or start from a template with: p8 new skeleton`);
    return text;
  };
  const [cmd, ...args] = argv;
  const { opts, rest } = options(args);
  switch (cmd) {
    case "check": {
      const code = await source(rest[0]);
      const casesPath = at("checks.json");
      const cases = (await fs.exists(casesPath)) ? loadCasesText(await fs.readFile(casesPath, "utf8")) : [];
      const items = await checkSource(code, cases);
      const pass = items.every((i) => i.pass);
      // A run re-checked an unchanged file ~60 times, reading the same failure as
      // a stuck tool. Say plainly that only an edit can change the result.
      const key = JSON.stringify([code, cases]),
        file = at(rest[0] ?? "main.lua");
      if (!pass && memo.get(file) === key)
        log("NOTE: main.lua has not changed since your last p8 check, so the result is the same. Edit the code on the line named in the FAIL below, then check again.");
      memo.set(file, key);
      log(formatItems(items));
      return pass ? 0 : 1;
    }
    case "run": {
      const r = await play(await source(rest[0]), opts.press ?? "wait*30");
      try {
        if (r.ok) {
          const paths = opts.read ? opts.read.split(",").map((p) => p.trim()).filter(Boolean) : ["g"];
          const values = await r.rt.read(paths);
          for (const p of paths) r.lines.push(`${p} = ${compact(values[p])}`);
        }
        log(r.lines.join("\n"));
        return r.ok ? 0 : 1;
      } finally {
        await r.rt.dispose();
      }
    }
    case "look": {
      const r = await play(await source(rest[0]), opts.press ?? "wait*30");
      try {
        const pic = r.rt.ascii(32);
        const lines = [...r.lines, ...(pic ? ["screen 32x32 (one character per 4x4 pixels, colour 0-f):", pic] : [])];
        if (opts.png !== undefined && r.rt.frame) {
          const file = opts.png || "screen.png";
          await fs.writeFile(at(file), await encodePng(r.rt.frame.rgba, 128, 128, 4));
          lines.push(`wrote ${file} (512x512, 4x enlarged). Open it with the read tool to see the screen.`);
        }
        log(lines.join("\n"));
        return r.ok ? 0 : 1;
      } finally {
        await r.rt.dispose();
      }
    }
    case "new": {
      const name = rest[0],
        names = await templates();
      if (!names.includes(name)) throw new UserError(`unknown template "${name ?? ""}"; choose one of: ${names.join(", ")}`);
      const target = at("main.lua");
      // Never offer an overwrite: small models used it to throw away a game they should fix.
      if ((await fs.exists(target)) && (await fs.readFile(target, "utf8")).trim())
        throw new UserError("main.lua already has a game. Fix or change that game with edit; p8 new is only for an empty main.lua.");
      await fs.writeFile(target, await fs.readFile(posix.join(templateDir, `${name}.lua`), "utf8"));
      log(`main.lua now holds the ${name} template. Change it, then run: p8 check`);
      return 0;
    }
    case "export": {
      const file = rest[1] ?? "game.p8";
      await fs.writeFile(at(file), cartText({ source: await source(rest[0]), assets: soundAssets() }, "game"));
      log(`wrote ${file}`);
      return 0;
    }
    default:
      log(usage(await templates()));
      return cmd ? 2 : 0;
  }
}
