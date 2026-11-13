// `p8` subcommands. Text only; every error says what to do next.
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkSource, explainFault, formatItems, loadCases, parsePress } from "./checks.mjs";
import { cartText } from "./maker.mjs";
import { Runtime } from "./runtime.mjs";
import { soundAssets } from "./sounds.mjs";

const TEMPLATES = resolve(new URL("../skill/pico8/templates", import.meta.url).pathname);
const USAGE = `usage:
  p8 check [main.lua]                        lint, boot, input and every case in checks.json
  p8 run [main.lua] --press "right*30 x" [--read g.score,g.mode]
  p8 look [main.lua] [--press "..."]         32x32 text picture of the screen
  p8 new <template>                          start main.lua from a template (${templates().join(", ")})
  p8 export [main.lua] [game.p8]             write a PICO-8 cart`;

function templates() {
  return existsSync(TEMPLATES) ? readdirSync(TEMPLATES).filter((f) => f.endsWith(".lua")).map((f) => f.slice(0, -4)) : [];
}
function options(args) {
  const opts = {},
    rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) opts[args[i].slice(2)] = args[i + 1] ?? "", i++;
    else rest.push(args[i]);
  }
  return { opts, rest };
}
function source(file) {
  const path = resolve(file ?? "main.lua");
  if (!existsSync(path)) throw new Error(`${file ?? "main.lua"} not found. Create it, or start from a template with: p8 new skeleton`);
  const text = readFileSync(path, "utf8");
  if (!text.trim()) throw new Error(`${file ?? "main.lua"} is empty. Write the game, or start from a template with: p8 new skeleton`);
  return text;
}
const compact = (v, max = 600) => {
  const s = JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…(truncated; read a narrower path)" : s;
};

/** Boot, play the presses, and report mode changes, sounds and the final state. */
async function play(src, press) {
  const rt = new Runtime();
  const loaded = await rt.load(src);
  if (!loaded.ok) return { rt, lines: [`does not boot: ${loaded.diagnostics.map(explainFault).join("; ")}`], ok: false };
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
      lines.push(`fault at frame ${rt.frames + 1}: ${r.fault.map(explainFault).join("; ")}`);
      return { rt, lines, ok: false };
    }
  }
  lines.unshift(`ran ${rt.frames} frames`);
  if (sounds.length) lines.push(`sounds: ${sounds.slice(0, 12).join(", ")}${sounds.length > 12 ? ", …" : ""}`);
  return { rt, lines, ok: true };
}

export async function main(argv) {
  const [cmd, ...args] = argv;
  const { opts, rest } = options(args);
  switch (cmd) {
    case "check": {
      const items = await checkSource(source(rest[0]), loadCases(resolve("checks.json")));
      console.log(formatItems(items));
      return items.every((i) => i.pass) ? 0 : 1;
    }
    case "run": {
      const r = await play(source(rest[0]), opts.press ?? "wait*30");
      try {
        if (r.ok) {
          const paths = opts.read ? opts.read.split(",").map((p) => p.trim()).filter(Boolean) : ["g"];
          const values = await r.rt.read(paths);
          for (const p of paths) r.lines.push(`${p} = ${compact(values[p])}`);
        }
        console.log(r.lines.join("\n"));
        return r.ok ? 0 : 1;
      } finally {
        await r.rt.dispose();
      }
    }
    case "look": {
      const r = await play(source(rest[0]), opts.press ?? "wait*30");
      try {
        const pic = r.rt.ascii(32);
        console.log([...r.lines, ...(pic ? ["screen 32x32 (one character per 4x4 pixels, colour 0-f):", pic] : [])].join("\n"));
        return r.ok ? 0 : 1;
      } finally {
        await r.rt.dispose();
      }
    }
    case "new": {
      const name = rest[0];
      if (!templates().includes(name)) throw new Error(`unknown template "${name ?? ""}"; choose one of: ${templates().join(", ")}`);
      const target = resolve("main.lua");
      if (existsSync(target) && readFileSync(target, "utf8").trim() && opts.force === undefined)
        throw new Error("main.lua already has code; edit it instead (or add --force 1 to replace it)");
      copyFileSync(join(TEMPLATES, `${name}.lua`), target);
      console.log(`main.lua now holds the ${name} template. Change it, then run: p8 check`);
      return 0;
    }
    case "export": {
      const out = resolve(rest[1] ?? "game.p8");
      writeFileSync(out, cartText({ source: source(rest[0]), assets: soundAssets() }, "game"));
      console.log(`wrote ${out}`);
      return 0;
    }
    default:
      console.log(USAGE);
      return cmd ? 2 : 0;
  }
}
