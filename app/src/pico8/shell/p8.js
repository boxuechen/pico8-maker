// `p8` subcommands over any just-bash IFileSystem: the agent's virtual fs (as a
// just-bash command) or the real disk (bin/p8). Text only, except `look --png`,
// which writes an image file for an image-capable read tool. Every error says
// what to do next.
import { posix } from "./posix-path.js";
import { checkSource, explainFault, formatItems, loadCasesText, parsePress } from "./checks.js";
import { cartText } from "../cart.js";
import { encodePng } from "./png.js";
import { BUTTONS, Runtime } from "./runtime.js";
import { soundAssets } from "./sounds.js";
import { applyResourceFiles, describeSfx, RESOURCE_FILES } from "./resource-files.js";
import { renderMap, renderSheet } from "../asset-preview.js";
import { decodeAssets } from "../assets.js";

export const TEMPLATE_DIR = "/skill/pico8/templates";

const usage = (templates) => `usage:
  p8 check [main.lua]                        lint, boot, input and every case in checks.json
  p8 run [main.lua] --press "right*30 x" [--read g.score,g.mode] [--setup "g.score=9"]
  p8 run --bot "lua" --until "lua" [--press "x"] [--frames 1800]
                                             a Lua bot picks the buttons every frame (after --press) until
                                             --until is true; its presses are replayed as normal play
  p8 look [main.lua] [--press "..."] [--png screen.png] [--crop x,y,w,h] [--setup "lua"]
                                             32x32 text picture of the screen; --crop prints exact pixels
                                             (at most 64x64); --png also writes a 512x512 image
                                             --setup runs Lua after boot, before the presses (main.lua is unchanged)
  p8 sheet [--png sheet.png]                 the sprite sheet (gfx.txt) as a 512x512 image with an 8x8 grid
  p8 map [x,y,w,h] [--png map.png]           map cells drawn with their sprites (default 0,0,16,16)
  p8 sfx <id>                                one sound effect from sfx.txt in words
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

/** Scale an RGBA image by k and draw a one-pixel grey line every `step` source pixels. */
function gridImage(rgba, width, height, k, step) {
  const W = width * k, H = height * k, out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const line = (x % (step * k) === 0 || y % (step * k) === 0) && x && y;
      const i = (Math.floor(y / k) * width + Math.floor(x / k)) * 4;
      out.set(line ? [95, 87, 79, 255] : rgba.subarray(i, i + 4), (y * W + x) * 4);
    }
  return { rgba: out, width: W, height: H };
}

/** "x,y,w,h" in screen pixels, clipped to the screen, at most 64x64. */
function parseCrop(text) {
  const n = String(text).split(",").map((v) => Number(v.trim()));
  if (n.length !== 4 || n.some((v) => !Number.isInteger(v)) || n[2] < 1 || n[3] < 1)
    throw new UserError(`--crop takes x,y,w,h in screen pixels, e.g. --crop 56,96,16,16 (got "${text}")`);
  const x = Math.max(0, n[0]), y = Math.max(0, n[1]);
  const w = Math.min(n[0] + n[2], 128) - x, h = Math.min(n[1] + n[3], 128) - y;
  if (w < 1 || h < 1) throw new UserError(`--crop ${text} is outside the 128x128 screen`);
  if (w > 64 || h > 64) throw new UserError(`--crop is at most 64x64 pixels; use the 32x32 picture or --png for the whole screen`);
  return { x, y, w, h };
}

/** Tell the host what a run or look played (Maker shows the last frame and records the route). */
const report = (onPlay, command, press, r, setup) =>
  onPlay?.({ command, press, ...(setup ? { setup } : {}), frames: r.rt.frames, ok: r.ok, modes: r.modes ?? [], frame: r.rt.frame ? { width: 128, height: 128, rgba: r.rt.frame.rgba } : null });

/** printh output of the run, the last 20 lines. */
function printhLines(rt, lines) {
  const logs = rt.logs();
  if (!logs.length) return;
  lines.push(`printh (${logs.length} line${logs.length > 1 ? "s" : ""}${logs.length > 20 ? ", last 20" : ""}):`);
  for (const l of logs.slice(-20)) lines.push(`  ${l.text.slice(0, 200)}`);
}

/** Boot, run optional setup Lua, play the presses, and report mode changes, sounds and the final state. */
async function play(src, press, assets, setup) {
  const rt = new Runtime(assets);
  const loaded = await rt.load(src);
  if (!loaded.ok) return { rt, lines: [`does not boot: ${loaded.diagnostics.map((d) => explainFault(d, src)).join("; ")}`], ok: false };
  const lines = [],
    modes = [];
  if (setup) {
    const s = await rt.setup(setup);
    if (!s.ok) return { rt, lines: [`setup failed: ${s.message}. --setup runs Lua statements after boot, e.g. --setup "g.score=9 g.player.x=10"`], modes, ok: false };
    lines.push("setup ran (main.lua unchanged; this run is not recorded as normal play)");
  }
  let mode = (await rt.read(["g.mode"]))["g.mode"];
  const sounds = (loaded.audio ?? []).map((e) => `sfx ${e.sfx ?? `music ${e.music}`}@1`);
  for (const step of parsePress(press)) {
    const r = await rt.advance(step.bits, step.frames, async (frame) => {
      const now = (await rt.read(["g.mode"]))["g.mode"];
      if (now !== mode) lines.push(`frame ${frame}: g.mode ${JSON.stringify(mode)}→${JSON.stringify(now)}`), modes.push(now), (mode = now);
    });
    for (const e of r.audio) sounds.push("sfx" in e ? `sfx ${e.sfx}@${e.frame}` : `music ${e.music}@${e.frame}`);
    if (r.fault) {
      printhLines(rt, lines);
      lines.push(`fault at frame ${rt.frames + 1}: ${r.fault.map((d) => explainFault(d, src)).join("; ")}`);
      return { rt, lines, modes, ok: false };
    }
  }
  lines.splice(setup ? 1 : 0, 0, `ran ${rt.frames} frames`);
  if (sounds.length) lines.push(`sounds: ${sounds.slice(0, 12).join(", ")}${sounds.length > 12 ? ", …" : ""}`);
  printhLines(rt, lines);
  return { rt, lines, modes, ok: true };
}

const BOT_HELP =
  '--bot is a Lua function body that returns the buttons to hold this frame (left=1 right=2 up=4 down=8 o=16 x=32, add them; nil = none), e.g. --bot "local f=g.fruits[1] if f then return f.x<g.basket.x and 1 or 2 end"';
const NAMES = Object.entries(BUTTONS);
/** Buttons per frame → "left*16 wait*3 right+o*2". */
export function pressText(bits) {
  const out = [];
  for (let i = 0; i < bits.length; ) {
    let j = i;
    while (j < bits.length && bits[j] === bits[i] && j - i < 3600) j++;
    const name = NAMES.filter(([, b]) => bits[i] & b).map(([n]) => n).join("+") || "wait";
    out.push(j - i > 1 ? `${name}*${j - i}` : name);
    i = j;
  }
  return out.join(" ");
}

/**
 * Let a Lua bot choose the buttons each frame from the game state (after an
 * optional --press prefix) until --until is true. Only the buttons are kept:
 * the caller replays them in a fresh session as normal play, so a bot that
 * changes state proves nothing.
 */
async function botPresses(src, assets, { bot, until, press, frames }) {
  const rt = new Runtime(assets);
  try {
    const loaded = await rt.load(src);
    if (!loaded.ok) return { error: `does not boot: ${loaded.diagnostics.map((d) => explainFault(d, src)).join("; ")}` };
    const def = await rt.setup(`function __p8bot()\n${bot}\nend\nfunction __p8until() return ${until} end`);
    if (!def.ok) return { error: `--bot/--until do not compile: ${def.message}. ${BOT_HELP}; --until is a Lua expression such as "g.mode~='play'".` };
    const bits = [];
    for (const step of parsePress(press ?? "")) {
      const r = await rt.advance(step.bits, step.frames);
      if (r.fault) return { error: `fault during --press: ${r.fault.map((d) => explainFault(d, src)).join("; ")}` };
      for (let i = 0; i < step.frames; i++) bits.push(step.bits);
    }
    for (let i = 0; ; i++) {
      const s = await rt.setup("__p8u=__p8until() and true or false __p8b=0 if not __p8u then __p8b=__p8bot() or 0 end");
      if (!s.ok) return { error: `--bot or --until failed at frame ${rt.frames + 1}: ${s.message}` };
      const v = await rt.read(["__p8u", "__p8b"]);
      if (v.__p8u === true) return { bits, reached: true };
      if (i >= frames) return { bits, reached: false };
      const b = Number(v.__p8b) & 63;
      const r = await rt.advance(b, 1);
      bits.push(b);
      if (r.fault) return { bits, reached: false };
    }
  } finally {
    await rt.dispose();
  }
}

/**
 * Run one p8 invocation.
 * @param argv arguments after `p8`
 * @param io { fs: IFileSystem, cwd, templateDir?, memo?: Map, onPlay?, assets? } – memo remembers the
 *   last failing check per file across invocations of one environment; onPlay gets
 *   { command, press, frames, ok, modes (g.mode values entered), frame } after each run/look; assets are the cart
 *   resources loaded with main.lua (default: the fixed sound bank).
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

async function dispatch(argv, { fs, cwd, templateDir = TEMPLATE_DIR, memo = new Map(), onPlay, assets }, log) {
  const at = (p) => posix.resolve(cwd, p);
  const templates = async () =>
    (await fs.exists(templateDir)) ? (await fs.readdir(templateDir)).filter((f) => f.endsWith(".lua")).map((f) => f.slice(0, -4)) : [];
  const source = async (file = "main.lua") => {
    if (!(await fs.exists(at(file)))) throw new UserError(`${file} not found. Create it, or start from a template with: p8 new skeleton (or p8 new toy)`);
    const text = await fs.readFile(at(file), "utf8");
    if (!text.trim()) throw new UserError(`${file} is empty. Write the game, or start from a template with: p8 new skeleton (or p8 new toy)`);
    return text;
  };
  // gfx.txt, gff.txt, map.txt, sfx.txt and music.txt in the cart folder override
  // the base resources; a malformed file stops the command with its line.
  const resources = async () => {
    const files = {};
    for (const name of RESOURCE_FILES) if (await fs.exists(at(name))) files[name] = await fs.readFile(at(name), "utf8");
    const r = applyResourceFiles(assets ?? soundAssets(), files);
    if (r.errors.length) throw new UserError(`${r.errors.join("\n")}\nFix the file (formats: /skill/pico8/reference/asset-authoring.md); nothing was run.`);
    return r.assets;
  };
  const [cmd, ...args] = argv;
  const { opts, rest } = options(args);
  switch (cmd) {
    case "check": {
      const code = await source(rest[0]);
      const casesPath = at("checks.json");
      const cases = (await fs.exists(casesPath)) ? loadCasesText(await fs.readFile(casesPath, "utf8")) : [];
      const items = await checkSource(code, cases, { assets: await resources() });
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
      let press = opts.press ?? "wait*30";
      const head = [];
      if (opts.bot !== undefined) {
        if (opts.setup !== undefined) throw new UserError("--bot plays normal input from boot; it cannot be combined with --setup");
        if (!opts.bot.trim()) throw new UserError(BOT_HELP);
        const frames = opts.frames === undefined ? 1800 : Number(opts.frames);
        if (!Number.isInteger(frames) || frames < 1 || frames > 3600) throw new UserError("--frames is the bot's frame budget, 1..3600 (default 1800)");
        const found = await botPresses(await source(rest[0]), await resources(), { bot: opts.bot, until: opts.until || "false", press: opts.press, frames });
        if (found.error) throw new UserError(found.error);
        if (!found.bits.length) throw new UserError(`--until is already true at boot${opts.press ? " after --press" : ""}; nothing to play`);
        press = pressText(found.bits);
        head.push(
          `bot played ${found.bits.length} frames; --until ${found.reached ? "became true" : `was not reached within ${frames} frames`}.`,
          `presses (replayed below with presses only, recorded as normal play): ${press.length > 800 ? press.slice(0, 800) + " …" : press}`,
        );
      }
      const r = await play(await source(rest[0]), press, await resources(), opts.setup);
      r.lines.unshift(...head);
      try {
        await report(onPlay, "run", press, r, opts.setup);
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
      const r = await play(await source(rest[0]), opts.press ?? "wait*30", await resources(), opts.setup);
      try {
        await report(onPlay, "look", opts.press ?? "wait*30", r, opts.setup);
        const crop = opts.crop !== undefined ? parseCrop(opts.crop) : null;
        const pic = crop ? r.rt.crop(crop) : r.rt.ascii(32);
        const title = crop
          ? `pixels x=${crop.x}..${crop.x + crop.w - 1}, y=${crop.y}..${crop.y + crop.h - 1} (one character per pixel, colour 0-f; row 1 is y=${crop.y}):`
          : "screen 32x32 (one character per 4x4 pixels, colour 0-f):";
        const lines = [...r.lines, ...(pic ? [title, pic] : [])];
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
    case "sheet": {
      const bytes = decodeAssets(await resources());
      const sheet = renderSheet(bytes);
      const file = opts.png || "sheet.png";
      const g = gridImage(sheet.rgba, 128, 128, 4, 8);
      await fs.writeFile(at(file), await encodePng(g.rgba, g.width, g.height));
      log(`wrote ${file} (512x512: the 128x128 sprite sheet at 4x, grey lines every 8 pixels). Sprite n is at x=(n%16)*8, y=flr(n/16)*8; sprites 128-255 share memory with map rows 32-63. Open it with the read tool.`);
      return 0;
    }
    case "map": {
      const n = (rest[0] ?? "0,0,16,16").split(",").map(Number);
      if (n.length !== 4 || n.some((v) => !Number.isInteger(v)) || n[0] < 0 || n[1] < 0 || n[2] < 1 || n[3] < 1 || n[0] + n[2] > 128 || n[1] + n[3] > 32 || n[2] > 32 || n[3] > 32)
        throw new UserError(`p8 map takes x,y,w,h in map cells inside 128x32, at most 32x32 (got "${rest[0]}")`);
      const [x, y, width, height] = n;
      const img = renderMap(decodeAssets(await resources()), { x, y, width, height });
      const file = opts.png || "map.png";
      const g = gridImage(img.rgba, img.width, img.height, 2, 8);
      await fs.writeFile(at(file), await encodePng(g.rgba, g.width, g.height));
      log(`wrote ${file} (${img.width * 2}x${img.height * 2}: cells x=${x}..${x + width - 1}, y=${y}..${y + height - 1} at 2x, grey lines between cells; tile 0 is empty). Open it with the read tool.`);
      return 0;
    }
    case "sfx": {
      const id = Number(rest[0]);
      if (!Number.isInteger(id) || id < 0 || id > 63) throw new UserError("p8 sfx takes an sfx id 0-63, e.g. p8 sfx 3");
      log(describeSfx(await resources(), id));
      return 0;
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
      await fs.writeFile(at(file), cartText({ source: await source(rest[0]), assets: await resources() }, "game"));
      log(`wrote ${file}`);
      return 0;
    }
    default:
      log(usage(await templates()));
      return cmd ? 2 : 0;
  }
}
