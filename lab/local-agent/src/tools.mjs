// Model-facing tools. They share one Bench (the cart being made) and never call
// the model. Every result is {content, isError?, done?}; errors say what to do.
import { formatIssues, lint } from "./lint.mjs";
import { Runtime, mask } from "./runtime.mjs";
import { smoke } from "./smoke.mjs";

export const numbered = (source, from = 1, to = Infinity) =>
  source
    .split("\n")
    .map((l, i) => [i + 1, l])
    .filter(([n]) => n >= from && n <= to)
    .map(([n, l]) => `${String(n).padStart(3)}| ${l}`)
    .join("\n");
const around = (source, line, radius = 4) =>
  line ? numbered(source, line - radius, line + radius) : "";
const text = (t) => ({ type: "text", text: t });

/** The cart under construction: draft source, last clean load and play session. */
export class Bench {
  constructor({ source, assets }) {
    this.source = source;
    this.assets = assets;
    this.loaded = null; // source of the last load that passed lint and booted
    this.smoke = null;
    this.play = null; // Runtime used by play; reset on every new load
    this.playedSinceLoad = false;
    this.log = [];
  }
  /** lint → load → smoke for a new draft. */
  async apply(source) {
    this.source = source;
    const issues = lint(source);
    if (issues.errors.length)
      return {
        isError: true,
        content: [text(`Not loaded. Fix these first:\n${formatIssues(issues.errors)}${issues.errors.find((e) => e.line) ? `\n\n${around(source, issues.errors.find((e) => e.line).line)}` : ""}`)],
      };
    const report = await smoke(source, this.assets);
    if (report.lines[0]?.startsWith("boot: fault")) {
      const line = Number(/line (\d+)/.exec(report.lines[0])?.[1]) || null;
      return { isError: true, content: [text(`Loaded but crashed: ${report.lines[0].slice(6)}${hint(report.lines[0])}${line ? `\n\n${around(source, line)}` : ""}`)] };
    }
    this.loaded = source;
    this.smoke = report;
    await this.play?.dispose();
    this.play = null;
    this.playedSinceLoad = false;
    const warn = issues.warnings.length ? `\nWarnings:\n${formatIssues(issues.warnings)}` : "";
    return {
      content: [
        text(`Loaded (${source.split("\n").length} lines, ~${issues.tokens} tokens). Host check${report.ok ? "" : " found problems"}:\n${report.lines.map((l) => `- ${l}`).join("\n")}${warn}\nThe image shows frame 30.`),
        ...(report.image ? [report.image] : []),
      ],
    };
  }
  async dispose() {
    await this.play?.dispose();
  }
}

function hint(message) {
  const m = /attempt to call (?:a nil value \()?global '(\w+)'/.exec(message);
  if (m) return `\n'${m[1]}' is not a PICO-8 function and is not defined in main.lua: define it or use a function from the API list.`;
  if (/attempt to (index|perform arithmetic on) a nil value/.test(message))
    return "\nA variable is nil here: make sure new_game() creates every field of g that _update/_draw use.";
  return "";
}

// Exact replacement first; if it fails, match the same lines ignoring
// indentation and trailing spaces (small models often re-indent).
export function applyEdits(source, edits) {
  let out = source;
  for (const [i, { find, replace }] of edits.entries()) {
    if (!find) throw new Error(`edit ${i + 1}: find is empty. To start over use write_game with the complete source.`);
    const count = out.split(find).length - 1;
    if (count === 1) {
      out = out.replace(find, () => replace);
      continue;
    }
    if (count > 1) throw new Error(`edit ${i + 1}: find matches ${count} places; include more surrounding lines so it is unique.`);
    const lines = out.split("\n"),
      want = find.split("\n").map((l) => l.trim()).filter((l, j, a) => l || (j > 0 && j < a.length - 1));
    const hits = [];
    for (let s = 0; s + want.length <= lines.length; s++)
      if (want.every((w, j) => lines[s + j].trim() === w)) hits.push(s);
    if (hits.length !== 1) {
      const first = want[0];
      const near = lines.findIndex((l) => first && l.trim() && (l.includes(first) || first.includes(l.trim())));
      throw new Error(
        `edit ${i + 1}: find text not found${hits.length > 1 ? " uniquely" : ""}. Copy it exactly from the current source (without line numbers):\n${near >= 0 ? around(out, near + 1, 6) : numbered(out)}`,
      );
    }
    lines.splice(hits[0], want.length, ...replace.split("\n"));
    out = lines.join("\n");
  }
  return out;
}

// Small models sometimes send nested arguments as JSON strings or a single
// value where a list is expected; accept the obvious intent.
export function loose(value) {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (!/^[[{]/.test(t)) return value;
  try {
    return JSON.parse(t);
  } catch {
    try {
      return JSON.parse(`[${t}]`).flat(); // e.g. '[{...}], {...}'

    } catch {
      return value;
    }
  }
}
const list = (v) => (v === undefined ? undefined : Array.isArray((v = loose(v))) ? v : [v]);

const schema = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });

export function writeGame(bench) {
  return {
    name: "write_game",
    description: "Replace the whole main.lua with complete PICO-8 Lua source. The host checks, loads and test-boots it and returns problems or a host check report with a screenshot.",
    parameters: schema({ source: { type: "string", description: "Complete main.lua" } }, ["source"]),
    execute: (args) => bench.apply(String(args.source ?? "")),
  };
}

export function editGame(bench) {
  return {
    name: "edit_game",
    description: "Change parts of main.lua. Each find must be text copied from the current source (without line numbers) and match one place. All edits apply together, then the host reloads and checks like write_game.",
    parameters: schema(
      {
        edits: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: schema({ find: { type: "string" }, replace: { type: "string" } }, ["find", "replace"]),
        },
      },
      ["edits"],
    ),
    async execute(args) {
      let next;
      try {
        next = applyEdits(bench.source, list(args.edits) ?? []);
      } catch (e) {
        return { isError: true, content: [text(`No edits applied. ${e.message}`)] };
      }
      return bench.apply(next);
    },
  };
}

const MAX_FRAMES = 1800;
export function play(bench) {
  return {
    name: "play",
    description: "Play the loaded game with button input and see what happened: g.mode changes with frame numbers, chosen state values, sound starts and the last frame. Buttons: left right up down o x. 30 frames = 1 second.",
    parameters: schema({
      reset: { type: "boolean", description: "Restart the game from boot first. Default: continue the current play session (a new session starts after every load)." },
      setup: { type: "string", description: "Optional Lua run once before the steps to set up a case, e.g. g.player.hp=1. Results after setup are setup evidence, not normal play." },
      steps: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: schema(
          {
            press: { type: "array", items: { type: "string", enum: ["left", "right", "up", "down", "o", "x"] }, description: "Buttons held; [] for none" },
            frames: { type: "integer", minimum: 1, maximum: 600 },
          },
          ["press", "frames"],
        ),
      },
      read: { type: "array", maxItems: 8, items: { type: "string" }, description: 'State paths to report, e.g. "g.score". Default: all of g.' },
    }, ["steps"]),
    async execute(args) {
      if (!bench.loaded) return { isError: true, content: [text("No game is loaded. Fix the source with edit_game or write_game first.")] };
      const rawSteps = list(args.steps) ?? [];
      if (!rawSteps.length) return { isError: true, content: [text('steps is required, e.g. [{"press":["right"],"frames":30}].')] };
      const total = rawSteps.reduce((n, s) => n + (Number(s?.frames) || 0), 0);
      if (total > MAX_FRAMES) return { isError: true, content: [text(`At most ${MAX_FRAMES} frames per play call (got ${total}).`)] };
      let steps;
      try {
        steps = rawSteps.map((s) => {
          const press = list(s?.press) ?? [],
            frames = Math.trunc(Number(s?.frames));
          if (!(frames >= 1 && frames <= 600)) throw new Error("each step needs frames between 1 and 600");
          return { bits: mask(press), frames, press };
        });
      } catch (e) {
        return { isError: true, content: [text(e.message)] };
      }
      const fresh = args.reset || !bench.play;
      if (fresh) {
        await bench.play?.dispose();
        bench.play = new Runtime(bench.assets);
        const r = await bench.play.load(bench.loaded);
        if (!r.ok) return { isError: true, content: [text("The loaded game failed to boot again.")] };
      }
      const rt = bench.play,
        out = [`${fresh ? "From boot" : "Continuing"} at frame ${rt.frames}.`];
      if (args.setup) {
        const s = await rt.setup(args.setup);
        out.push(s.ok ? `setup ran: ${args.setup}` : `setup failed: ${s.message}`);
        if (!s.ok) return { isError: true, content: [text(out.join("\n"))] };
      }
      let mode = (await rt.read(["g.mode"]))["g.mode"];
      const changes = [`frame ${rt.frames}: mode=${mode}`],
        audio = [];
      let fault = null;
      for (const step of steps) {
        const r = await rt.advance(step.bits, step.frames, async (frame) => {
          const now = (await rt.read(["g.mode"]))["g.mode"];
          if (now !== mode) changes.push(`frame ${frame}: mode ${mode}→${now}`), (mode = now);
        });
        audio.push(...r.audio);
        if (r.fault) {
          fault = r.fault;
          break;
        }
      }
      // A run counts as normal play until setup code touches it.
      if (fresh) bench.runIsNormal = !args.setup;
      else if (args.setup) bench.runIsNormal = false;
      bench.playedSinceLoad ||= bench.runIsNormal;
      out.push(`Ran ${steps.map((s) => `${s.frames}f [${s.press.join("+") || "none"}]`).join(", ")} → now frame ${rt.frames}.`);
      out.push(`Mode: ${changes.join("; ")}`);
      if (fault) out.push(`FAULT: ${fault.map((d) => `${d.line ? `line ${d.line}: ` : ""}${d.message}`).join("; ")}${hint(fault[0]?.message ?? "")}`);
      if (!fault) {
        const paths = list(args.read)?.map(String) ?? [];
        const values = await rt.read(paths.length ? paths : ["g"]);
        let shown = JSON.stringify(values);
        if (shown.length > 1500) shown = `${shown.slice(0, 1500)}… (truncated; use read for specific paths)`;
        out.push(`State: ${shown}`);
      }
      out.push(audio.length ? `Sounds: ${audio.slice(0, 12).map((a) => ("sfx" in a ? `sfx ${a.sfx}@${a.frame}` : `music ${a.music}@${a.frame}`)).join(", ")}` : "Sounds: none");
      const image = rt.image();
      bench.log.push({ tool: "play", setup: !!args.setup, fresh, frames: total, fault: !!fault });
      return { isError: !!fault, content: [text(out.join("\n")), ...(image ? [image] : [])] };
    },
  };
}

/** Phase-finishing tool. accept() returns null to finish or a reason to continue. */
export function done(parameters, description, accept) {
  return {
    name: "done",
    description,
    parameters,
    async execute(args) {
      const reason = await accept(args);
      return reason ? { isError: true, content: [text(`Not done yet: ${reason}`)] } : { done: args, content: [text("Accepted.")] };
    },
  };
}
