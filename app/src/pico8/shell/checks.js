// Checks behind `p8 check` and task scoring. Every check runs in a fresh
// session from boot, and every failure line says what to change.
import { lint } from "./lint.js";
import { BUTTONS, Runtime } from "./runtime.js";

const BOOT_FRAMES = 30,
  HOLD_FRAMES = 10;

/** "right*30 left+o*10 wait*20 x" → [{bits, frames, label}]. A bare name is one frame. */
export function parsePress(text = "") {
  return String(text)
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => {
      const m = /^([a-z+]+)(?:\*(\d+))?$/.exec(token.toLowerCase());
      if (!m) throw new Error(`bad press "${token}"; write e.g. right*30, left+o*10, wait*20 or x`);
      const bits = m[1].split("+").reduce((acc, name) => {
        if (name === "wait" || name === "none") return acc;
        if (!(name in BUTTONS)) throw new Error(`unknown button "${name}"; use left right up down o x wait`);
        return acc | BUTTONS[name];
      }, 0);
      const frames = Number(m[2] ?? 1);
      if (frames < 1 || frames > 3600) throw new Error(`frames in "${token}" must be 1..3600`);
      return { bits, frames, label: token };
    });
}

/** The trimmed source text of a 1-based line, for quoting in failures. */
export const codeAt = (source, line) => (line ? source.split("\n")[line - 1]?.trim() ?? "" : "");

/**
 * Turn runtime errors into a line number, the code on that line and a next step.
 * Small models could not locate a fault from the variable name alone (one kept
 * re-running checks; another rewrote lives as g.lives everywhere, giving g.g.lives).
 */
export function explainFault(d, source = "") {
  const where = d.line ? `line ${d.line}: ` : "";
  const nil = /attempt to (?:perform arithmetic on|concatenate|compare|index) (global|field|local) '(\w+)'/.exec(d.message);
  const call = /attempt to call (?:a nil value \()?(?:global|field|method) '(\w+)'/.exec(d.message);
  let hint = "";
  if (call) hint = ` → ${call[1]} is not defined. It is not a PICO-8 function, or it is defined after it is used; see reference/api.md.`;
  else if (nil?.[2] === "g" && /\bg\.g\./.test(source))
    hint = " → the code says g.g somewhere; fields of g are written g.name, not g.g.name.";
  else if (nil?.[1] === "global" && new RegExp(`\\bg\\.${nil[2]}\\b|[{,]\\s*${nil[2]}\\s*=`).test(source))
    hint = ` → ${nil[2]} is not a global; this game keeps it in g, so write g.${nil[2]} on this line.`;
  else if (nil?.[1] === "global")
    hint = ` → ${nil[2]} has no value; give it one before this line runs (round state belongs in g, set in new_game()).`;
  else if (nil?.[1] === "field" && /index/.test(d.message))
    hint = ` → ${nil[2]} is nil here, so it cannot be indexed; create it in new_game() before _update uses it.`;
  else if (nil?.[1] === "field")
    hint = ` → the field ${nil[2]} has no starting value; add ${nil[2]}=... to the table that should hold it in new_game(), or fix the name on this line.`;
  else if (/attempt to index .*nil/.test(d.message))
    hint = " → a table is nil here; create it in new_game() before _update uses it.";
  else if (/attempt to (perform arithmetic|compare|concatenate) .*nil/.test(d.message))
    hint = " → a value is nil here; give every g field a starting value in new_game().";
  const code = codeAt(source, d.line);
  return `${where}${d.message}${hint}${code ? `\n    code: ${code}` : ""}`;
}

/** JSON with sorted keys: Lua table iteration order differs between sessions. */
const canonical = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
const show = (v) => canonical(v ?? null);
function judge(actual, start, e) {
  if ("equals" in e && show(actual) !== show(e.equals)) return `is ${show(actual)}, expected ${show(e.equals)}`;
  if ("notEquals" in e && show(actual) === show(e.notEquals)) return `is ${show(actual)}, expected a different value`;
  if ("atLeast" in e && !(actual >= e.atLeast)) return `is ${show(actual)}, expected at least ${e.atLeast}`;
  if ("atMost" in e && !(actual <= e.atMost)) return `is ${show(actual)}, expected at most ${e.atMost}`;
  if (e.changes === true && show(actual) === show(start)) return `stayed ${show(actual)}, expected it to change`;
  if (e.changes === false && show(actual) !== show(start)) return `changed ${show(start)}→${show(actual)}, expected no change`;
  return null;
}

// An expectation names a state path, or a screen pixel whose x and y are numbers or paths.
// With `each` (a path to a list) the path and pixel names are fields of every element.
const needs = (e) =>
  e.each ? [e.each] : [...(e.path ? [e.path] : []), ...(Array.isArray(e.pixel) ? e.pixel.filter((v) => typeof v === "string") : [])];

function pixelAt(rt, e, at) {
  const [x, y] = e.pixel.map(at);
  if (typeof x !== "number" || typeof y !== "number") return [x, y, null, "has no numeric position"];
  const colour = rt.pixel(x, y);
  return [x, y, colour, colour === null ? "is off screen" : judge(colour, undefined, e)];
}

/** → [label, value, failure or null] for one expectation against read values and the last frame. */
function evaluate(rt, e, values, start) {
  if (e.each) {
    const list = values[e.each];
    const items = Array.isArray(list) ? list : list && typeof list === "object" ? Object.values(list) : null;
    if (!items) return [`each ${e.each}`, list, "is not a list"];
    for (const [i, item] of items.entries()) {
      const field = (k) => (typeof k === "string" ? item?.[k] : k);
      if (Array.isArray(e.pixel)) {
        const [x, y, colour, fail] = pixelAt(rt, e, field);
        if (fail) return [`${e.each}[${i + 1}] pixel ${JSON.stringify(e.pixel)}=(${show(x)},${show(y)})`, colour, fail];
      } else {
        const fail = judge(item?.[e.path], undefined, e);
        if (fail) return [`${e.each}[${i + 1}].${e.path}`, item?.[e.path], fail];
      }
    }
    return [`each ${e.each} (${items.length})`, "ok", null];
  }
  if (!Array.isArray(e.pixel)) return [e.path, values[e.path], judge(values[e.path], start[e.path], e)];
  const [x, y, colour, fail] = pixelAt(rt, e, (v) => (typeof v === "string" ? values[v] : v));
  return [`pixel ${JSON.stringify(e.pixel)}=(${show(x)},${show(y)})`, colour, fail];
}

async function boot(source, assets) {
  const rt = new Runtime(assets);
  const loaded = await rt.load(source);
  if (!loaded.ok) return { rt, fault: loaded.diagnostics };
  const run = await rt.advance(0, BOOT_FRAMES - 1);
  return { rt, fault: run.fault };
}

/** One scripted case from boot: optional setup Lua, button steps, expectations on g. */
export async function runCase(source, c, assets) {
  const rt = new Runtime(assets);
  try {
    const loaded = await rt.load(source);
    if (!loaded.ok) return { pass: false, detail: `does not boot: ${loaded.diagnostics.map(explainFault).join("; ")}` };
    if (c.setup) {
      const s = await rt.setup(c.setup);
      if (!s.ok) return { pass: false, detail: `setup failed: ${s.message}` };
    }
    const expects = c.expect ?? [];
    const paths = expects.filter((e) => e.path && !e.each).map((e) => e.path);
    const start = await rt.read(paths.length ? paths : ["g.mode"]);
    let mode = (await rt.read(["g.mode"]))["g.mode"];
    const modes = [];
    // `always` expectations are judged after every pressed frame; the first broken frame is reported.
    const always = expects.filter((e) => e.always);
    const alwaysPaths = [...new Set(always.flatMap(needs))];
    const broken = new Map();
    let pressed = 0;
    for (const step of parsePress(c.press)) {
      const r = await rt.advance(step.bits, step.frames, async (frame) => {
        pressed++;
        const now = (await rt.read(["g.mode"]))["g.mode"];
        if (now !== mode) modes.push(`${mode}→${now} at frame ${frame}`), (mode = now);
        const pending = always.filter((e) => !broken.has(e));
        if (!pending.length) return;
        const values = alwaysPaths.length ? await rt.read(alwaysPaths) : {};
        for (const e of pending) {
          const [label, , fail] = evaluate(rt, e, values, start);
          if (fail) broken.set(e, `${label} ${fail} after ${pressed} pressed frames (${step.label})`);
        }
      });
      if (r.fault) return { pass: false, detail: `fault: ${r.fault.map((d) => explainFault(d, source)).join("; ")}` };
    }
    const wanted = [...new Set(expects.flatMap(needs))];
    const values = wanted.length ? await rt.read(wanted) : {};
    const results = expects.map((e) => {
      if (broken.has(e)) return [null, null, broken.get(e)];
      const [label, value, fail] = evaluate(rt, e, values, start);
      return [label, value, fail && `${label} ${fail}`];
    });
    const fails = results.filter(([, , f]) => f);
    const facts = fails.length ? fails.map(([, , f]) => f) : results.map(([p, v]) => `${p}=${show(v)}`);
    return { pass: !fails.length, detail: [...facts, ...(modes.length ? [`mode ${modes.join(", ")}`] : [])].join("; ") };
  } finally {
    await rt.dispose();
  }
}

/** Full check: lint, boot, input response, then cases. Returns [{name, pass, detail}]. */
/** `assets`: the cart resources to load with the source (default: the fixed sound bank). */
export async function checkSource(source, cases = [], { assets } = {}) {
  const items = [];
  const { errors, tokens } = lint(source);
  if (errors.length) {
    for (const e of errors) {
      const code = codeAt(source, e.line);
      items.push({ name: "lint", pass: false, detail: `${e.line ? `line ${e.line}: ` : ""}${e.message}${code ? `\n    code: ${code}` : ""}` });
    }
    return items;
  }
  items.push({ name: "lint", pass: true, detail: `${tokens} of 8192 tokens` });
  const base = await boot(source, assets);
  try {
    if (base.fault) {
      items.push({ name: "boot", pass: false, detail: base.fault.map((d) => explainFault(d, source)).join("; ") });
      return items;
    }
    const { g } = await base.rt.read(["g"]);
    const colours = base.rt.colors();
    const problems = [];
    // g and g.mode are optional: games without a result (toys, sandboxes) need neither.
    const state =
      !g || typeof g !== "object"
        ? "no global g (state reads need --read on your own globals)"
        : typeof g.mode === "string"
          ? `g.mode=${show(g.mode)}`
          : "no g.mode (no result tracking)";
    if (colours < 2) problems.push("the screen has one colour; draw the game in _draw()");
    items.push({ name: "boot", pass: !problems.length, detail: problems.length ? problems.join("; ") : `${BOOT_FRAMES} frames, ${state}, ${colours} colours` });
    if (problems.length) return items;
    // Some button must change g (when there is one) or the screen compared with idling.
    const idle = await boot(source, assets);
    await idle.rt.advance(0, HOLD_FRAMES);
    const idleG = canonical((await idle.rt.read(["g"])).g),
      idleFrame = idle.rt.ascii(32);
    await idle.rt.dispose();
    const responds = [];
    for (const name of ["left", "right", "up", "down", "o", "x"]) {
      const held = await boot(source, assets);
      const r = await held.rt.advance(BUTTONS[name], HOLD_FRAMES);
      if (r.fault) {
        items.push({ name: "input", pass: false, detail: `holding ${name}: ${r.fault.map((d) => explainFault(d, source)).join("; ")}` });
        await held.rt.dispose();
        return items;
      }
      if (canonical((await held.rt.read(["g"])).g) !== idleG || held.rt.ascii(32) !== idleFrame) responds.push(name);
      await held.rt.dispose();
    }
    items.push({ name: "input", pass: responds.length > 0, detail: responds.length ? `responds to ${responds.join(", ")}` : "no button changes g or the screen; read btn() in _update()" });
  } finally {
    await base.rt.dispose();
  }
  for (const c of cases) {
    const r = await runCase(source, c, assets);
    items.push({ name: c.name, pass: r.pass, detail: r.detail });
  }
  return items;
}

export function formatItems(items) {
  const failed = items.filter((i) => !i.pass).length;
  return [...items.map((i) => `${i.pass ? "PASS" : "FAIL"} ${i.name}: ${i.detail}`), failed ? `${failed} FAILED` : "ALL PASSED"].join("\n");
}

/** Parse checks.json text into cases. */
export const loadCasesText = (text) => JSON.parse(text).cases ?? [];

/** Evaluation scoring: every item must pass, including hidden cases. */
export async function scoreSource(source, cases, { assets } = {}) {
  if (!source?.trim()) return { pass: false, detail: "main.lua is missing or empty" };
  const items = await checkSource(source, cases, { assets });
  const failed = items.filter((i) => !i.pass);
  return { pass: !failed.length, detail: failed.length ? failed.map((i) => `${i.name}: ${i.detail}`).join(" | ").slice(0, 600) : `${items.length} checks passed` };
}
