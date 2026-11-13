// Host-run checks after every successful load. Each check uses fresh sessions so
// the result does not depend on what the model played before.
import { Runtime } from "./runtime.mjs";

const BOOT_FRAMES = 30,
  HOLD_FRAMES = 10;

// Flatten g to "path" -> scalar for diffs; arrays report their length.
function flatten(value, prefix = "g", out = {}, depth = 0) {
  if (Array.isArray(value)) {
    out[`#${prefix}`] = value.length;
    if (depth < 2) value.slice(0, 4).forEach((v, i) => flatten(v, `${prefix}.${i + 1}`, out, depth + 1));
  } else if (value && typeof value === "object") {
    if (depth < 3) for (const [k, v] of Object.entries(value)) flatten(v, `${prefix}.${k}`, out, depth + 1);
  } else out[prefix] = value;
  return out;
}
export function diffState(before, after, limit = 3) {
  const a = flatten(before),
    b = flatten(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
  return keys.slice(0, limit).map((k) => `${k} ${a[k] ?? "nil"}→${b[k] ?? "nil"}`);
}

async function boot(assets, source) {
  const rt = new Runtime(assets);
  const loaded = await rt.load(source);
  if (!loaded.ok) return { rt, fault: loaded.diagnostics };
  const run = await rt.advance(0, BOOT_FRAMES - 1);
  return { rt, fault: run.fault, audio: [...(loaded.audio ?? []), ...run.audio] };
}
const frameKey = (rt) => Buffer.from(rt.frame?.rgba ?? []).toString("base64");

export async function smoke(source, assets) {
  const report = { ok: false, lines: [], image: null };
  const base = await boot(assets, source);
  try {
    if (base.fault) {
      report.lines.push(`boot: fault within ${BOOT_FRAMES} frames: ${base.fault.map((d) => `${d.line ? `line ${d.line}: ` : ""}${d.message}`).join("; ")}`);
      return report;
    }
    const { g } = await base.rt.read(["g"]);
    report.image = base.rt.image();
    report.colors = base.rt.colors();
    if (!g || typeof g !== "object") {
      report.lines.push("state: global g is missing after boot; create it in new_game() called from _init().");
      return report;
    }
    report.mode = g.mode;
    report.lines.push(`boot: ${BOOT_FRAMES} frames ok, g.mode=${JSON.stringify(g.mode ?? null)}, ${report.colors} colour(s) on screen${base.audio.length ? `, ${base.audio.length} sound start(s)` : ""}`);
    if (typeof g.mode !== "string") report.lines.push("state: set g.mode to \"play\" in new_game().");
    if (report.colors < 2) report.lines.push("screen: only one colour is drawn; check _draw().");
    // Compare holding each main button with idling for the same frames.
    const idle = await boot(assets, source);
    await idle.rt.advance(0, HOLD_FRAMES);
    const idleState = (await idle.rt.read(["g"])).g,
      idleFrame = frameKey(idle.rt);
    await idle.rt.dispose();
    report.responds = {};
    for (const [name, bit] of [["left", 1], ["right", 2], ["o", 16]]) {
      const held = await boot(assets, source);
      const run = await held.rt.advance(bit, HOLD_FRAMES);
      if (run.fault) {
        report.lines.push(`${name}: fault while held: ${run.fault.map((d) => `${d.line ? `line ${d.line}: ` : ""}${d.message}`).join("; ")}`);
        report.responds[name] = "fault";
      } else {
        const changed = diffState(idleState, (await held.rt.read(["g"])).g);
        const pixels = frameKey(held.rt) !== idleFrame;
        report.responds[name] = changed.length || pixels;
        report.lines.push(`${name} held ${HOLD_FRAMES} frames: ${changed.length ? changed.join(", ") : pixels ? "screen changes, g unchanged" : "no change"}`);
      }
      await held.rt.dispose();
    }
    report.ok = typeof g.mode === "string" && report.colors > 1 && !Object.values(report.responds).includes("fault");
    return report;
  } finally {
    await base.rt.dispose();
  }
}
