// Native cartridge data, 0x0000–0x42ff. A single hex string is the canonical
// storage representation: compact, immutable, JSON-safe and free of alias copies.
export const ASSET_BYTES = 0x4300;
const hex = (n) => n.toString(16).padStart(2, "0");
export const encodeAssets = (bytes) => Array.from(bytes, hex).join("");
export function validAssets(value) {
  return (
    typeof value === "string" &&
    value.length === ASSET_BYTES * 2 &&
    /^[0-9a-f]+$/.test(value)
  );
}
export function decodeAssets(value) {
  if (!validAssets(value)) throw new Error("Invalid cartridge resource data");
  return Uint8Array.from(value.match(/../g), (s) => parseInt(s, 16));
}
function createEmptyAssets() {
  const bytes = new Uint8Array(ASSET_BYTES);
  for (let i = 0; i < 64; i++) {
    bytes.set([0x41, 0x42, 0x43, 0x44], 0x3100 + i * 4);
    bytes[0x3200 + i * 68 + 65] = 16;
  }
  return encodeAssets(bytes);
}
const defaultAssets = createEmptyAssets();
export const emptyAssets = () => defaultAssets;
export const emptySnapshot = (source = "") => ({
  source,
  assets: emptyAssets(),
});
export const validSnapshot = (s) =>
  !!s && typeof s.source === "string" && validAssets(s.assets);
export const sameSnapshot = (a, b) =>
  a?.source === b?.source && a?.assets === b?.assets;
function integer(n, min, max, name) {
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${name} must be an integer ${min}–${max}`);
  return n;
}
function boolean(n, name) {
  if (typeof n !== "boolean") throw new Error(`${name} must be boolean`);
  return n;
}
export function pixel(bytes, x, y) {
  return (bytes[y * 64 + (x >> 1)] >> ((x & 1) * 4)) & 15;
}
export function sprite(bytes, id) {
  integer(id, 0, 255, "sprite id");
  const x = (id % 16) * 8,
    y = Math.floor(id / 16) * 8;
  return {
    kind: "sprite",
    id,
    flags: bytes[0x3000 + id],
    rows: Array.from({ length: 8 }, (_, j) =>
      Array.from({ length: 8 }, (_, i) =>
        pixel(bytes, x + i, y + j).toString(16),
      ).join(""),
    ),
  };
}
export function sound(bytes, id) {
  integer(id, 0, 63, "sfx id");
  const b = 0x3200 + id * 68;
  return {
    kind: "sfx",
    id,
    speed: bytes[b + 65],
    loopStart: bytes[b + 66],
    loopEnd: bytes[b + 67],
    notes: Array.from({ length: 32 }, (_, i) => {
      const n = bytes[b + i * 2] | (bytes[b + i * 2 + 1] << 8);
      return {
        pitch: n & 63,
        waveform: ((n >> 6) & 7) + (n >> 15) * 8,
        volume: (n >> 9) & 7,
        effect: (n >> 12) & 7,
      };
    }),
  };
}
export function music(bytes, id) {
  integer(id, 0, 63, "music id");
  const b = 0x3100 + id * 4;
  return {
    kind: "music",
    id,
    channels: Array.from({ length: 4 }, (_, i) =>
      bytes[b + i] & 64 ? null : bytes[b + i] & 63,
    ),
    loopStart: !!(bytes[b] & 128),
    loopEnd: !!(bytes[b + 1] & 128),
    stop: !!(bytes[b + 2] & 128),
  };
}
export function assetSummary(value) {
  const bytes = decodeAssets(value);
  return {
    sprites: Array.from({ length: 256 }, (_, id) => id).filter((id) =>
      sprite(bytes, id).rows.some((r) => /[1-9a-f]/.test(r)),
    ),
    flaggedSprites: Array.from({ length: 256 }, (_, id) => id).filter(
      (id) => bytes[0x3000 + id],
    ),
    mapCells: bytes.subarray(0x2000, 0x3000).filter((n) => n !== 0).length,
    sfx: Array.from({ length: 64 }, (_, id) => id).filter((id) =>
      sound(bytes, id).notes.some((n) => n.volume),
    ),
    music: Array.from({ length: 64 }, (_, id) => id).filter((id) =>
      music(bytes, id).channels.some((c) => c !== null),
    ),
    mapSize: { width: 128, height: 32 },
  };
}
export function readAssets(value, args = {}) {
  if (!args.kind) return assetSummary(value);
  const bytes = decodeAssets(value);
  if (args.kind === "map") {
    const x = integer(args.x, 0, 127, "x"),
      y = integer(args.y, 0, 31, "y");
    const w = integer(args.width, 1, Math.min(32, 128 - x), "width"),
      h = integer(args.height, 1, Math.min(32, 32 - y), "height");
    return {
      kind: "map",
      x,
      y,
      rows: Array.from({ length: h }, (_, j) =>
        Array.from(
          bytes.slice(
            0x2000 + (y + j) * 128 + x,
            0x2000 + (y + j) * 128 + x + w,
          ),
        ),
      ),
    };
  }
  const readers = { sprite, sfx: sound, music };
  if (!readers[args.kind]) throw new Error("Unknown resource kind");
  const id = integer(args.id, 0, args.kind === "sprite" ? 255 : 63, "id");
  const count = integer(
    args.count ?? 1,
    1,
    args.kind === "sfx" ? 4 : 16,
    "count",
  );
  return Array.from({ length: count }, (_, i) =>
    readers[args.kind](bytes, id + i),
  );
}
// Apply every edit to a private copy; invalid batches never partially mutate a draft.
export function editAssets(value, edits) {
  if (!Array.isArray(edits) || !edits.length || edits.length > 64)
    throw new Error("edits must contain 1–64 resource edits");
  const bytes = decodeAssets(value);
  for (const e of edits) {
    if (!e || typeof e !== "object") throw new Error("Invalid resource edit");
    if (e.kind === "sprite") {
      const id = integer(e.id, 0, 255, "sprite id");
      if (e.rows !== undefined) {
        if (
          !Array.isArray(e.rows) ||
          e.rows.length !== 8 ||
          !e.rows.every((r) => typeof r === "string" && /^[0-9a-f]{8}$/.test(r))
        )
          throw new Error(
            "sprite rows must be eight strings of eight lowercase hex pixels",
          );
        const x = (id % 16) * 8,
          y = Math.floor(id / 16) * 8;
        for (let j = 0; j < 8; j++)
          for (let i = 0; i < 8; i += 2)
            bytes[(y + j) * 64 + (x + i) / 2] =
              parseInt(e.rows[j][i], 16) |
              (parseInt(e.rows[j][i + 1], 16) << 4);
      }
      if (e.flags !== undefined)
        bytes[0x3000 + id] = integer(e.flags, 0, 255, "flags");
      if (e.rows === undefined && e.flags === undefined)
        throw new Error("sprite edit needs rows or flags");
    } else if (e.kind === "map") {
      const x = integer(e.x, 0, 127, "x"),
        y = integer(e.y, 0, 31, "y");
      if (!Array.isArray(e.rows) || !e.rows.length || e.rows.length > 32 - y)
        throw new Error("map rows exceed the 128×32 authored map");
      const width = e.rows[0]?.length;
      integer(width, 1, Math.min(32, 128 - x), "map width");
      e.rows.forEach((row, j) => {
        if (!Array.isArray(row) || row.length !== width)
          throw new Error("map rows must have equal width");
        row.forEach((tile, i) => {
          bytes[0x2000 + (y + j) * 128 + x + i] = integer(tile, 0, 255, "tile");
        });
      });
    } else if (e.kind === "sfx") {
      const b = 0x3200 + integer(e.id, 0, 63, "sfx id") * 68;
      if (!Array.isArray(e.notes) || e.notes.length > 32)
        throw new Error(
          "sfx notes must contain 0–32 notes; omitted tail notes are silent",
        );
      const speed = integer(e.speed, 1, 255, "speed"),
        start = integer(e.loopStart ?? 0, 0, 31, "loopStart"),
        end = integer(e.loopEnd ?? 0, 0, 32, "loopEnd");
      if (end !== 0 && end <= start)
        throw new Error(
          "loopEnd must exceed loopStart, or be 0 to disable looping",
        );
      bytes.fill(0, b, b + 68);
      e.notes.forEach((n, i) => {
        const packed =
          integer(n.pitch, 0, 63, "pitch") |
          (integer(n.waveform, 0, 7, "waveform") << 6) |
          (integer(n.volume, 0, 7, "volume") << 9) |
          (integer(n.effect, 0, 7, "effect") << 12);
        bytes[b + i * 2] = packed & 255;
        bytes[b + i * 2 + 1] = packed >> 8;
      });
      bytes.set([0, speed, start, end], b + 64);
    } else if (e.kind === "music") {
      const b = 0x3100 + integer(e.id, 0, 63, "music id") * 4;
      if (!Array.isArray(e.channels) || e.channels.length !== 4)
        throw new Error(
          "music channels must contain four SFX ids or null (disabled)",
        );
      e.channels.forEach((c, i) => {
        bytes[b + i] = c === null ? 64 + i : integer(c, 0, 63, "channel sfx");
      });
      [e.loopStart ?? false, e.loopEnd ?? false, e.stop ?? false].forEach(
        (flag, i) => {
          if (boolean(flag, "music flag")) bytes[b + i] |= 128;
        },
      );
    } else throw new Error("Unknown resource kind");
  }
  return encodeAssets(bytes);
}
export function assetSections(value) {
  const bytes = decodeAssets(value);
  const gfx = Array.from({ length: 128 }, (_, y) =>
    Array.from({ length: 128 }, (_, x) => pixel(bytes, x, y).toString(16)).join(
      "",
    ),
  );
  const map = Array.from({ length: 32 }, (_, y) =>
    Array.from(bytes.slice(0x2000 + y * 128, 0x2080 + y * 128), hex).join(""),
  );
  const sfx = Array.from({ length: 64 }, (_, id) => {
    const b = 0x3200 + id * 68,
      s = sound(bytes, id);
    return (
      Array.from(bytes.slice(b + 64, b + 68), hex).join("") +
      s.notes
        .map(
          (n) =>
            hex(n.pitch) +
            n.waveform.toString(16) +
            n.volume.toString(16) +
            n.effect.toString(16),
        )
        .join("")
    );
  });
  const patterns = Array.from({ length: 64 }, (_, id) => {
    const b = 0x3100 + id * 4;
    const flags = Array.from(
      { length: 4 },
      (_, i) => (bytes[b + i] >> 7) << i,
    ).reduce((a, n) => a | n, 0);
    return (
      hex(flags) +
      " " +
      Array.from(bytes.slice(b, b + 4), (n) => hex(n & 127)).join("")
    );
  });
  return `__gfx__\n${gfx.join("\n")}\n__gff__\n${Array.from(bytes.slice(0x3000, 0x3080), hex).join("")}\n${Array.from(bytes.slice(0x3080, 0x3100), hex).join("")}\n__map__\n${map.join("\n")}\n__sfx__\n${sfx.join("\n")}\n__music__\n${patterns.join("\n")}\n`;
}
