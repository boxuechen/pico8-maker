// Checks behind `p8 check` and task scoring. Every check runs in a fresh
// session from boot, and every failure line says what to change.
import { readFileSync, existsSync } from "node:fs";
import { lint } from "./lint.mjs";
import { BUTTONS, Runtime } from "./runtime.mjs";

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

/** Turn runtime errors into a line number and a next step. */
export function explainFault(d) {
  const where = d.line ? `line ${d.line}: ` : "";
  let hint = "";
  const call = /attempt to call (?:a nil value \()?(?:global|field|method) '(\w+)'/.exec(d.message);
  if (call) hint = ` → ${call[1]} is not defined. It is not a PICO-8 function, or it is defined after it is used; see reference/api.md.`;
  else if (/attempt to index .*nil/.test(d.message))
    hint = " → a table is nil here; create it in new_game() before _update uses it.";
  else if (/attempt to (perform arithmetic|compare) .*nil/.test(d.message))
    hint = " → a value is nil here; give every g field a starting value in new_game().";
  return `${where}${d.message}${hint}`;
}

const show = (v) => JSON.stringify(v ?? null);
function judge(actual, start, e) {
  if ("equals" in e && show(actual) !== show(e.equals)) return `is ${show(actual)}, expected ${show(e.equals)}`;
  if ("notEquals" in e && show(actual) === show(e.notEquals)) return `is ${show(actual)}, expected a different value`;
  if ("atLeast" in e && !(actual >= e.atLeast)) return `is ${show(actual)}, expected at least ${e.atLeast}`;
  if ("atMost" in e && !(actual <= e.atMost)) return `is ${show(actual)}, expected at most ${e.atMost}`;
  if (e.changes === true && show(actual) === show(start)) return `stayed ${show(actual)}, expected it to change`;
  if (e.changes === false && show(actual) !== show(start)) return `changed ${show(start)}→${show(actual)}, expected no change`;
  return null;
}

async function boot(source) {
  const rt = new Runtime();
  const loaded = await rt.load(source);
  if (!loaded.ok) return { rt, fault: loaded.diagnostics };
  const run = await rt.advance(0, BOOT_FRAMES - 1);
  return { rt, fault: run.fault };
}

/** One scripted case from boot: optional setup Lua, button steps, expectations on g. */
export async function runCase(source, c) {
  const rt = new Runtime();
  try {
    const loaded = await rt.load(source);
    if (!loaded.ok) return { pass: false, detail: `does not boot: ${loaded.diagnostics.map(explainFault).join("; ")}` };
    if (c.setup) {
      const s = await rt.setup(c.setup);
      if (!s.ok) return { pass: false, detail: `setup failed: ${s.message}` };
    }
    const paths = (c.expect ?? []).map((e) => e.path);
    const start = await rt.read(paths.length ? paths : ["g.mode"]);
    let mode = (await rt.read(["g.mode"]))["g.mode"];
    const modes = [];
    for (const step of parsePress(c.press)) {
      const r = await rt.advance(step.bits, step.frames, async (frame) => {
        const now = (await rt.read(["g.mode"]))["g.mode"];
        if (now !== mode) modes.push(`${mode}→${now} at frame ${frame}`), (mode = now);
      });
      if (r.fault) return { pass: false, detail: `fault: ${r.fault.map(explainFault).join("; ")}` };
    }
    const values = await rt.read(paths);
    const fails = c.expect.map((e) => [e.path, judge(values[e.path], start[e.path], e)]).filter(([, f]) => f);
    const facts = fails.length ? fails.map(([p, f]) => `${p} ${f}`) : paths.map((p) => `${p}=${show(values[p])}`);
    return { pass: !fails.length, detail: [...facts, ...(modes.length ? [`mode ${modes.join(", ")}`] : [])].join("; ") };
  } finally {
    await rt.dispose();
  }
}

/** Full check: lint, boot, input response, then cases. Returns [{name, pass, detail}]. */
export async function checkSource(source, cases = []) {
  const items = [];
  const { errors, tokens } = lint(source);
  if (errors.length) {
    for (const e of errors) items.push({ name: "lint", pass: false, detail: `${e.line ? `line ${e.line}: ` : ""}${e.message}` });
    return items;
  }
  items.push({ name: "lint", pass: true, detail: `${tokens} of 8192 tokens` });
  const base = await boot(source);
  try {
    if (base.fault) {
      items.push({ name: "boot", pass: false, detail: base.fault.map(explainFault).join("; ") });
      return items;
    }
    const { g } = await base.rt.read(["g"]);
    const colours = base.rt.colors();
    const problems = [];
    if (!g || typeof g !== "object") problems.push("global g is missing; create it in new_game() and call new_game() from _init()");
    else if (typeof g.mode !== "string") problems.push('g.mode is not set; use g.mode="play" in new_game()');
    if (colours < 2) problems.push("the screen has one colour; draw the game in _draw()");
    items.push({ name: "boot", pass: !problems.length, detail: problems.length ? problems.join("; ") : `${BOOT_FRAMES} frames, g.mode=${show(g.mode)}, ${colours} colours` });
    if (problems.length) return items;
    // Some button must change g or the screen compared with idling.
    const idle = await boot(source);
    await idle.rt.advance(0, HOLD_FRAMES);
    const idleG = JSON.stringify((await idle.rt.read(["g"])).g),
      idleFrame = idle.rt.ascii(32);
    await idle.rt.dispose();
    const responds = [];
    for (const name of ["left", "right", "up", "down", "o", "x"]) {
      const held = await boot(source);
      const r = await held.rt.advance(BUTTONS[name], HOLD_FRAMES);
      if (r.fault) {
        items.push({ name: "input", pass: false, detail: `holding ${name}: ${r.fault.map(explainFault).join("; ")}` });
        await held.rt.dispose();
        return items;
      }
      if (JSON.stringify((await held.rt.read(["g"])).g) !== idleG || held.rt.ascii(32) !== idleFrame) responds.push(name);
      await held.rt.dispose();
    }
    items.push({ name: "input", pass: responds.length > 0, detail: responds.length ? `responds to ${responds.join(", ")}` : "no button changes g or the screen; read btn() in _update()" });
  } finally {
    await base.rt.dispose();
  }
  for (const c of cases) {
    const r = await runCase(source, c);
    items.push({ name: c.name, pass: r.pass, detail: r.detail });
  }
  return items;
}

export function formatItems(items) {
  const failed = items.filter((i) => !i.pass).length;
  return [...items.map((i) => `${i.pass ? "PASS" : "FAIL"} ${i.name}: ${i.detail}`), failed ? `${failed} FAILED` : "ALL PASSED"].join("\n");
}

export const loadCases = (path) => (path && existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).cases ?? [] : []);

/** Evaluation scoring: every item must pass, including hidden cases. */
export async function scoreCart(mainPath, checksPath) {
  if (!existsSync(mainPath)) return { pass: false, detail: "main.lua is missing" };
  const items = await checkSource(readFileSync(mainPath, "utf8"), loadCases(checksPath));
  const failed = items.filter((i) => !i.pass);
  return { pass: !failed.length, detail: failed.length ? failed.map((i) => `${i.name}: ${i.detail}`).join(" | ").slice(0, 600) : `${items.length} checks passed` };
}
