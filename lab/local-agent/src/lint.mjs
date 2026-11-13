// Static checks run before every load. Errors block loading because PICO-8
// would reject or crash on them; each message says what to write instead.
import { countTokens, TOKEN_LIMIT } from "./maker.mjs";

// Replace strings and comments with spaces, keeping line structure, so API
// checks only see code.
export function codeOnly(source) {
  let out = "";
  for (let i = 0; i < source.length; ) {
    const rest = source.slice(i);
    const long = /^--\[(=*)\[/.exec(rest) ?? /^\[(=*)\[/.exec(rest);
    if (long) {
      const close = `]${long[1]}]`;
      const end = source.indexOf(close, i + long[0].length);
      const stop = end < 0 ? source.length : end + close.length;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else if (rest.startsWith("--") || rest.startsWith("//")) {
      const end = source.indexOf("\n", i);
      const stop = end < 0 ? source.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (rest[0] === '"' || rest[0] === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== rest[0] && source[j] !== "\n")
        j += source[j] === "\\" ? 2 : 1;
      const stop = Math.min(j + 1, source.length);
      out += source[i] + " ".repeat(Math.max(0, stop - i - 2)) + (stop - i > 1 ? source[stop - 1] : "");
      i = stop;
    } else {
      out += source[i++];
    }
  }
  return out;
}

const foreign = [
  [/\blove\s*\./, "love.* is the LÖVE engine; use PICO-8 functions (_update, _draw, btn, spr, rectfill)."],
  [/\bmath\s*\.\s*(\w+)/, (m) => `math.${m[1]} does not exist; use ${{ floor: "flr", random: "rnd", abs: "abs", max: "max", min: "min", sqrt: "sqrt", sin: "sin", cos: "cos", ceil: "ceil" }[m[1]] ?? "the PICO-8 function"} (see API).`],
  [/\bstring\s*\.\s*(\w+)/, (m) => `string.${m[1]} does not exist; use sub(s,i,j), #s, tostr, tonum or ..`],
  [/\btable\s*\.\s*insert\b/, "table.insert does not exist; use add(t,v)."],
  [/\btable\s*\.\s*remove\b/, "table.remove does not exist; use del(t,v) or deli(t,i)."],
  [/\b(os|io)\s*\./, "os/io do not exist in PICO-8."],
  [/\brequire\s*\(/, "require does not exist; keep everything in main.lua."],
  [/\bpygame\b|\bconsole\.log\b/, "That is not Lua for PICO-8; use print/printh."],
];

export function lint(source) {
  const errors = [],
    warnings = [];
  const lines = source.split("\n");
  lines.forEach((line, i) => {
    const bad = [...line].find((c) => c.codePointAt(0) > 0x7e || (c.codePointAt(0) < 0x20 && c !== "\t" && c !== "\r"));
    if (bad)
      errors.push({
        line: i + 1,
        message: `non-ASCII character "${bad}". PICO-8 source must be plain ASCII: write comments and text in English.`,
      });
  });
  const code = codeOnly(source).split("\n");
  code.forEach((line, i) => {
    for (const [pattern, message] of foreign) {
      const m = pattern.exec(line);
      if (m)
        errors.push({ line: i + 1, message: typeof message === "function" ? message(m) : message });
    }
    if (/^local\s+g\b/.test(line))
      errors.push({ line: i + 1, message: "g must be global so the host can read it: write g=... without local." });
  });
  const all = code.join("\n");
  if (!/\bfunction\s+_draw\s*\(/.test(all))
    errors.push({ line: null, message: "missing function _draw(); without it the cart stops after one frame." });
  if (!/\bfunction\s+_update(60)?\s*\(/.test(all))
    errors.push({ line: null, message: "missing function _update(); game logic runs there every frame." });
  if (!/\bfunction\s+new_game\s*\(/.test(all))
    warnings.push({ line: null, message: "no new_game(): keep all round state in g and rebuild it in new_game() for retry." });
  const tokens = countTokens(source);
  if (tokens > TOKEN_LIMIT)
    errors.push({ line: null, message: `about ${tokens} tokens, over the ${TOKEN_LIMIT} limit; shorten the code.` });
  return { errors, warnings, tokens };
}

export const formatIssues = (issues) =>
  issues.map((e) => `- ${e.line ? `line ${e.line}: ` : ""}${e.message}`).join("\n");
