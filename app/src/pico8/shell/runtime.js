// One loaded cart in an inspection session: load, frame-by-frame input, raw
// state reads, setup code and a text thumbnail of the last frame. Resources
// default to the fixed sound bank (sounds.js); Maker passes the cart's own.
import { cartBytes } from "../cart.js";
import { compactInspected } from "../observation.js";
import { soundAssets } from "./sounds.js";

// The player runtime is injected: Node imports player.mjs directly, a browser
// Worker imports it by URL (it is a static asset, not part of the bundle).
let createSession = () => {
  throw new Error("p8: no player runtime; call setSessionFactory first");
};
export function setSessionFactory(factory) {
  createSession = factory;
}

export const BUTTONS = { left: 1, right: 2, up: 4, down: 8, o: 16, x: 32 };
const input = (buttons = 0) => ({
  controllers: [buttons, 0, 0, 0, 0, 0, 0, 0],
  devkit: { mouseXRaw: 0, mouseYRaw: 0, mouseButtons: 0, wheelRaw: 0, movementXRaw: 0, movementYRaw: 0, keypresses: [] },
});
export const mask = (press = []) =>
  press.reduce((m, name) => {
    if (!(name in BUTTONS)) throw new Error(`unknown button "${name}"; use ${Object.keys(BUTTONS).join(", ")}`);
    return m | BUTTONS[name];
  }, 0);

const diagnostics = (observation) =>
  (observation?.diagnostics ?? []).map((d) => ({
    message: String(d.message ?? d.code ?? "runtime error").replace(/^cart\.p8:\d+: /, ""),
    line: d.line ?? (Number(/cart\.p8:(\d+)/.exec(d.message ?? "")?.[1]) || null),
  }));

export class Runtime {
  constructor(assets = soundAssets()) {
    this.assets = assets;
    this.session = null;
    this.frames = 0;
    this.frame = null;
  }
  /** Load source in a fresh session and run the first frame. */
  async load(source) {
    await this.dispose();
    this.session = await createSession({ inspection: true });
    this.frames = 0;
    this.frame = null;
    // A fixed seed makes checks repeatable; appended so line numbers stay the same.
    // It runs after the cart's own top-level code and before _init.
    const seeded = `${source}\nsrand(1)`;
    const loaded = await this.session.loadCart(cartBytes({ source: seeded, assets: this.assets }));
    if (loaded.state === "faulted") return { ok: false, diagnostics: diagnostics(loaded) };
    const first = await this.advance(0, 1);
    return first.fault ? { ok: false, diagnostics: first.fault } : { ok: true, audio: first.audio };
  }
  /** Advance frames holding buttons. Stops early on a fault or a stopped cart. */
  async advance(buttons, frames, onFrame) {
    const audio = [];
    for (let i = 0; i < frames; i++) {
      const r = await this.session.advance({ frames: 1, input: input(buttons) });
      for (const e of r.audio?.events ?? []) audio.push({ ...e, frame: this.frames + 1 });
      if (r.observation.frame) this.frame = r.observation.frame;
      if (r.outcome === "faulted") return { audio, fault: diagnostics(r.observation) };
      if (r.outcome !== "completed")
        return { audio, fault: [{ message: "the cart stopped running (no _update/_draw loop, stop() or end of program)", line: null }] };
      this.frames++;
      await onFrame?.(this.frames);
    }
    return { audio };
  }
  /** printh lines since load: [{ frame, text }] (bounded by the player's log buffer). */
  logs() {
    const snap = this.session?.readLogs?.();
    return (snap?.entries ?? []).map((e) => ({ frame: e.frameId ?? null, text: String(e.text ?? "") }));
  }
  /** Read dotted paths such as "g.player.x" (or "#g.enemies" for a length); values are plain JSON. */
  async read(paths) {
    const keys = paths.map((p) => p.replace(/^#/, "").split(".").map((k) => (/^\d+$/.test(k) ? Number(k) : k)));
    const r = await this.session.inspect({ mode: "read", paths: keys });
    if (!r.ok) throw new Error(r.error?.message ?? "state read failed");
    return Object.fromEntries(
      paths.map((p, i) => {
        const v = plain(compactInspected(r.values[i]));
        return [p, p.startsWith("#") ? (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : null) : v];
      }),
    );
  }
  async setup(code) {
    const r = await this.session.inspect({ mode: "debug", code });
    return r.ok ? { ok: true } : { ok: false, message: r.error?.message ?? "setup failed" };
  }
  /** size×size characters 0-f: the most common palette colour of each block. */
  ascii(size = 32) {
    if (!this.frame) return null;
    const { rgba } = this.frame,
      block = 128 / size,
      rows = [];
    for (let by = 0; by < size; by++) {
      let row = "";
      for (let bx = 0; bx < size; bx++) {
        const counts = new Array(16).fill(0);
        for (let y = by * block; y < (by + 1) * block; y++)
          for (let x = bx * block; x < (bx + 1) * block; x++) {
            const i = (y * 128 + x) * 4;
            counts[nearest(rgba[i], rgba[i + 1], rgba[i + 2])]++;
          }
        row += counts.indexOf(Math.max(...counts)).toString(16);
      }
      rows.push(row);
    }
    return rows.join("\n");
  }
  /** Palette colour 0-15 of one screen pixel in the last frame (null off screen or before a frame). */
  pixel(x, y) {
    if (!this.frame || !(x >= 0 && x < 128 && y >= 0 && y < 128)) return null;
    const i = (Math.floor(y) * 128 + Math.floor(x)) * 4,
      { rgba } = this.frame;
    return nearest(rgba[i], rgba[i + 1], rgba[i + 2]);
  }
  /** Distinct palette colours in the current frame (a blank screen has one). */
  colors() {
    const seen = new Set();
    const rgba = this.frame?.rgba ?? [];
    for (let i = 0; i < rgba.length; i += 4) seen.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
    return seen.size;
  }
  async dispose() {
    const s = this.session;
    this.session = null;
    await s?.dispose();
  }
}

// Runtime tags such as {type:"nil"} become null; functions become "<function>".
function plain(v) {
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    if (v.type === "nil") return null;
    if (v.type === "table") return Object.fromEntries(v.entries.map((e) => [String(e.key), plain(e.value)]));
    if (typeof v.type === "string" && Object.keys(v).length <= 2) return `<${v.type}>`;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

const PALETTE = [0x000000, 0x1d2b53, 0x7e2553, 0x008751, 0xab5236, 0x5f574f, 0xc2c3c7, 0xfff1e8,
  0xff004d, 0xffa300, 0xffec27, 0x00e436, 0x29adff, 0x83769c, 0xff77a8, 0xffccaa];
function nearest(r, g, b) {
  let best = 0, dist = Infinity;
  PALETTE.forEach((c, i) => {
    const d = (r - (c >> 16)) ** 2 + (g - ((c >> 8) & 255)) ** 2 + (b - (c & 255)) ** 2;
    if (d < dist) (dist = d), (best = i);
  });
  return best;
}
