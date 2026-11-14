// Cart resources as text files in /cart, in the .p8 section formats:
//   gfx.txt    128 lines × 128 hex digits: the sprite sheet, one digit per pixel
//   gff.txt      2 lines × 256 hex digits: sprite flags, two digits per sprite (0-127, 128-255)
//   map.txt     32 lines × 256 hex digits: map rows, two digits (tile id) per cell
//   sfx.txt     64 lines × 168 hex digits: per sfx, 8 header digits then 32 notes × 5 digits
//   music.txt   64 lines "ff 41424344": flags, then four channel sfx ids (+0x40 = channel off)
// Files present override the base resources section by section; a malformed file
// is an error with its line, never silently zeroed.
import { assetSections, decodeAssets, encodeAssets, sound } from "../assets.js";

export const RESOURCE_FILES = ["gfx.txt", "gff.txt", "map.txt", "sfx.txt", "music.txt"];

const SPEC = {
  "gfx.txt": { lines: 128, pattern: /^[0-9a-f]{128}$/, shape: "128 hex digits (one per pixel)" },
  "gff.txt": { lines: 2, pattern: /^[0-9a-f]{256}$/, shape: "256 hex digits (two per sprite)" },
  "map.txt": { lines: 32, pattern: /^[0-9a-f]{256}$/, shape: "256 hex digits (two per cell)" },
  "sfx.txt": { lines: 64, pattern: /^[0-9a-f]{168}$/, shape: "168 hex digits (8 header + 32 notes × 5)" },
  "music.txt": { lines: 64, pattern: /^[0-9a-f]{2} [0-9a-f]{8}$/, shape: '"ff 41424344" (flags, space, 4 channel ids)' },
};

/** Resource hex → { "gfx.txt": text, ... } exactly as written to /cart. */
export function assetFiles(assets) {
  const sections = {};
  let current = null;
  for (const line of assetSections(assets).split("\n")) {
    const header = /^__([a-z]+)__$/.exec(line);
    if (header) sections[(current = header[1])] = [];
    else if (current && line) sections[current].push(line);
  }
  return Object.fromEntries(RESOURCE_FILES.map((name) => [name, sections[name.slice(0, -4)].join("\n") + "\n"]));
}

/** Check a resource file's text; returns error strings (empty when valid). */
export function resourceErrors(name, text) {
  const spec = SPEC[name];
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const errors = [];
  if (lines.length !== spec.lines) errors.push(`${name} has ${lines.length} lines; it needs exactly ${spec.lines}`);
  lines.forEach((line, i) => {
    if (errors.length < 4 && !spec.pattern.test(line))
      errors.push(`${name} line ${i + 1} is not ${spec.shape}: ${JSON.stringify(line.slice(0, 40))}${line.length > 40 ? "…" : ""} (${line.length} chars)`);
  });
  return errors;
}

const byte = (s, i) => parseInt(s.slice(i, i + 2), 16);

/** Base resources with every present, valid file applied → { assets, errors }. */
export function applyResourceFiles(base, files) {
  const errors = RESOURCE_FILES.filter((n) => files[n] !== undefined).flatMap((n) => resourceErrors(n, files[n]));
  if (errors.length) return { assets: base, errors };
  const bytes = decodeAssets(base).slice();
  const rows = (name) => files[name].replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  if (files["gfx.txt"] !== undefined)
    rows("gfx.txt").forEach((row, y) => {
      for (let x = 0; x < 128; x += 2) bytes[y * 64 + (x >> 1)] = parseInt(row[x], 16) | (parseInt(row[x + 1], 16) << 4);
    });
  if (files["gff.txt"] !== undefined)
    rows("gff.txt").forEach((row, r) => {
      for (let i = 0; i < 128; i++) bytes[0x3000 + r * 128 + i] = byte(row, i * 2);
    });
  if (files["map.txt"] !== undefined)
    rows("map.txt").forEach((row, y) => {
      for (let i = 0; i < 128; i++) bytes[0x2000 + y * 128 + i] = byte(row, i * 2);
    });
  if (files["sfx.txt"] !== undefined)
    rows("sfx.txt").forEach((row, id) => {
      const b = 0x3200 + id * 68;
      for (let i = 0; i < 4; i++) bytes[b + 64 + i] = byte(row, i * 2);
      for (let n = 0; n < 32; n++) {
        const o = 8 + n * 5;
        const pitch = byte(row, o) & 63,
          wave = parseInt(row[o + 2], 16),
          volume = parseInt(row[o + 3], 16) & 7,
          effect = parseInt(row[o + 4], 16) & 7;
        const note = pitch | ((wave & 7) << 6) | (volume << 9) | (effect << 12) | ((wave >> 3) << 15);
        bytes[b + n * 2] = note & 255;
        bytes[b + n * 2 + 1] = note >> 8;
      }
    });
  if (files["music.txt"] !== undefined)
    rows("music.txt").forEach((row, id) => {
      const flags = byte(row, 0);
      for (let i = 0; i < 4; i++) bytes[0x3100 + id * 4 + i] = (byte(row, 3 + i * 2) & 127) | (((flags >> i) & 1) << 7);
    });
  return { assets: encodeAssets(bytes), errors: [] };
}

const NOTE_NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const WAVES = ["triangle", "tilted saw", "saw", "square", "pulse", "organ", "noise", "phaser"];
const EFFECTS = ["none", "slide", "vibrato", "drop", "fade in", "fade out", "arp fast", "arp slow"];

/** One sfx in words, for `p8 sfx <id>`. */
export function describeSfx(assets, id) {
  const s = sound(decodeAssets(assets), id);
  const notes = s.notes
    .map((n, i) => (n.volume ? `${String(i).padStart(2)}: ${NOTE_NAMES[n.pitch % 12]}${Math.floor(n.pitch / 12)} (pitch ${n.pitch}) ${n.waveform < 8 ? WAVES[n.waveform] : `custom ${n.waveform - 8}`} vol ${n.volume}${n.effect ? ` ${EFFECTS[n.effect]}` : ""}` : null))
    .filter(Boolean);
  return [
    `sfx ${id}: speed ${s.speed} (${s.speed} ticks of 1/120 s per note), loop ${s.loopStart}-${s.loopEnd}${notes.length ? "" : ", silent"}`,
    ...notes,
  ].join("\n");
}
