// One loaded cart in an inspection session: load, frame-by-frame input with
// g.mode tracking, raw state reads, setup code and model images.
import {
  cartBytes,
  compactInspected,
  createPico8Session,
  emptySnapshot,
  modelImage,
  png,
} from "./maker.mjs";

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
  constructor(assets = emptySnapshot().assets) {
    this.assets = assets;
    this.session = null;
    this.frames = 0;
    this.frame = null;
  }
  /** Load source in a fresh session and run the first frame. */
  async load(source) {
    await this.dispose();
    this.session = await createPico8Session({ inspection: true });
    this.frames = 0;
    this.frame = null;
    const loaded = await this.session.loadCart(cartBytes({ source, assets: this.assets }));
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
  /** Read dotted paths such as "g.player.x"; values are compacted to plain JSON. */
  async read(paths) {
    const r = await this.session.inspect({ mode: "read", paths: paths.map((p) => p.split(".").map((k) => (/^\d+$/.test(k) ? Number(k) : k))) });
    if (!r.ok) throw new Error(r.error?.message ?? "state read failed");
    return Object.fromEntries(paths.map((p, i) => [p, plain(compactInspected(r.values[i]))]));
  }
  async setup(code) {
    const r = await this.session.inspect({ mode: "debug", code });
    return r.ok ? { ok: true } : { ok: false, message: r.error?.message ?? "setup failed" };
  }
  image() {
    if (!this.frame) return null;
    const big = modelImage(this.frame);
    return { type: "image", mimeType: "image/png", data: png(big.rgba, big.width, big.height).toString("base64") };
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
