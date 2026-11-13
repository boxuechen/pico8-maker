// Read existing PICO-8 cartridges (.p8 text and .p8.png) into Maker snapshots,
// so community carts and local files can be remixed as the user's own cart.
import {
  ASSET_BYTES,
  decodeAssets,
  emptyAssets,
  encodeAssets,
} from "./assets.js";

const ROM_CODE = 0x4300;
const ROM_END = 0x8000;
const labelDigits = "0123456789abcdefghijklmnopqrstuv";
const labelPalette = [
  "000000",
  "1d2b53",
  "7e2553",
  "008751",
  "ab5236",
  "5f574f",
  "c2c3c7",
  "fff1e8",
  "ff004d",
  "ffa300",
  "ffec27",
  "00e436",
  "29adff",
  "83769c",
  "ff77a8",
  "ffccaa",
  "291814",
  "111d35",
  "422136",
  "125359",
  "742f29",
  "49333b",
  "a28879",
  "f3ef7d",
  "be1250",
  "ff6c24",
  "a8e72e",
  "00b543",
  "065ab5",
  "754665",
  "ff6e59",
  "ff9d81",
].map((hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)));

// P8SCII → the Unicode glyphs PICO-8 writes in .p8 text files.
const low = [
  "\0",
  "¹",
  "²",
  "³",
  "⁴",
  "⁵",
  "⁶",
  "⁷",
  "⁸",
  "\t",
  "\n",
  "ᵇ",
  "ᶜ",
  "\r",
  "ᵉ",
  "ᶠ",
  "▮",
  "■",
  "□",
  "⁙",
  "⁘",
  "‖",
  "◀",
  "▶",
  "「",
  "」",
  "¥",
  "•",
  "、",
  "。",
  "゛",
  "゜",
];
const high = [
  "█",
  "▒",
  "🐱",
  "⬇️",
  "░",
  "✽",
  "●",
  "♥",
  "☉",
  "웃",
  "⌂",
  "⬅️",
  "😐",
  "♪",
  "🅾️",
  "◆",
  "…",
  "➡️",
  "★",
  "⧗",
  "⬆️",
  "ˇ",
  "∧",
  "❎",
  "▤",
  "▥",
  ..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんっゃゅょ",
  ..."アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンッャュョ",
  "◜",
  "◝",
];
export function p8sciiToText(bytes) {
  let text = "";
  for (const b of bytes)
    text +=
      b < 32
        ? low[b]
        : b === 127
          ? "○"
          : b < 128
            ? String.fromCharCode(b)
            : high[b - 128];
  return text;
}

const legacyTable =
  "\n 0123456789abcdefghijklmnopqrstuvwxyz!#%(){}[]<>+=/*:;.,~_";
function legacyCode(code) {
  const size = (code[4] << 8) | code[5];
  const out = [];
  for (let pos = 8; out.length < size && pos < code.length;) {
    const b = code[pos++];
    if (b === 0) out.push(code[pos++]);
    else if (b <= 0x3b) out.push(legacyTable.charCodeAt(b - 1));
    else {
      const next = code[pos++];
      const offset = (b - 0x3c) * 16 + (next & 15);
      const start = out.length - offset;
      if (offset < 1 || start < 0) throw new Error("Corrupt cartridge code");
      for (let i = 0; i < (next >> 4) + 2; i++) out.push(out[start + i]);
    }
  }
  return out;
}
function pxaCode(code) {
  const size = (code[4] << 8) | code[5];
  let pos = 64; // bit position after the 8-byte header
  const limit = code.length * 8;
  const bit = () => {
    if (pos >= limit) throw new Error("Corrupt cartridge code");
    const v = (code[pos >> 3] >> (pos & 7)) & 1;
    pos++;
    return v;
  };
  const bits = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v |= bit() << i;
    return v;
  };
  const mtf = Array.from({ length: 256 }, (_, i) => i);
  const out = [];
  while (out.length < size) {
    if (bit()) {
      let extra = 0;
      while (bit()) extra++;
      const index = bits(4 + extra) + (((1 << extra) - 1) << 4);
      const c = mtf[index];
      if (c === undefined) throw new Error("Corrupt cartridge code");
      mtf.splice(index, 1);
      mtf.unshift(c);
      out.push(c);
    } else {
      const offsetBits = bit() ? (bit() ? 5 : 10) : 15;
      const offset = bits(offsetBits) + 1;
      if (offsetBits === 10 && offset === 1) {
        for (let c = bits(8); c; c = bits(8)) out.push(c);
      } else {
        let length = 3;
        for (let part = 7; part === 7;) length += part = bits(3);
        const start = out.length - offset;
        if (start < 0) throw new Error("Corrupt cartridge code");
        for (let i = 0; i < length; i++) out.push(out[start + i]);
      }
    }
  }
  return out;
}
/** Lua source from a 32K cartridge ROM (raw, legacy :c: or PXA compressed). */
export function romSource(rom) {
  const code = rom.subarray(ROM_CODE, ROM_END);
  let bytes;
  if (code[0] === 0 && code[1] === 0x70 && code[2] === 0x78 && code[3] === 0x61)
    bytes = pxaCode(code);
  else if (
    code[0] === 0x3a &&
    code[1] === 0x63 &&
    code[2] === 0x3a &&
    code[3] === 0
  )
    bytes = legacyCode(code);
  else {
    const end = code.indexOf(0);
    bytes = code.subarray(0, end < 0 ? code.length : end);
  }
  return p8sciiToText(bytes).replace(/\r\n?/g, "\n");
}

/** Minimal 8-bit RGB/RGBA PNG decoder; exact pixels, no colour management. */
export async function decodePng(bytes, inflate) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((v, i) => bytes[i] === v)) throw new Error("Not a PNG image");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0,
    depth = 0,
    type = 0,
    interlace = 0;
  const chunks = [];
  for (let pos = 8; pos + 8 <= bytes.length;) {
    const length = view.getUint32(pos);
    const name = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const data = bytes.subarray(pos + 8, pos + 8 + length);
    if (name === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (name === "IDAT") chunks.push(data);
    else if (name === "IEND") break;
    pos += 12 + length;
  }
  if (depth !== 8 || (type !== 6 && type !== 2) || interlace)
    throw new Error("Unsupported PNG format for a PICO-8 cartridge");
  const joined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  chunks.reduce((o, c) => (joined.set(c, o), o + c.length), 0);
  const raw = await inflate(joined);
  const bpp = type === 6 ? 4 : 3;
  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0, p = 0; y < height; y++) {
    const filter = raw[p++];
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = raw[p + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const e = a + b - c;
        const pa = Math.abs(e - a),
          pb = Math.abs(e - b),
          pc = Math.abs(e - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      rgba[o] = cur[x * bpp];
      rgba[o + 1] = cur[x * bpp + 1];
      rgba[o + 2] = cur[x * bpp + 2];
      rgba[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev = cur;
    p += stride;
  }
  return { width, height, rgba };
}

/** A .p8.png image (160×205) → ROM, snapshot and its 128×128 label. */
export function readPngCart({ width, height, rgba }) {
  if (width !== 160 || height !== 205)
    throw new Error("This image is not a PICO-8 .p8.png cartridge.");
  const rom = new Uint8Array(ROM_END + 1);
  for (let i = 0; i < rom.length; i++) {
    const o = i * 4;
    rom[i] =
      ((rgba[o + 3] & 3) << 6) |
      ((rgba[o] & 3) << 4) |
      ((rgba[o + 1] & 3) << 2) |
      (rgba[o + 2] & 3);
  }
  const label = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const from = ((y + 24) * 160 + x + 16) * 4;
      label.set(
        [rgba[from], rgba[from + 1], rgba[from + 2], 255],
        (y * 128 + x) * 4,
      );
    }
  const source = romSource(rom);
  return {
    snapshot: { source, assets: encodeAssets(rom.subarray(0, ASSET_BYTES)) },
    label,
    title: headerTitle(source),
  };
}

function headerTitle(source) {
  const match = /^--\s*(.+)$/m.exec(source.split("\n", 1)[0] ?? "");
  return match?.[1].trim().slice(0, 80) || "";
}

/** .p8 text → snapshot with native resources and the optional label. */
export function readTextCart(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (!/^pico-8 cartridge/.test(lines[0] ?? ""))
    throw new Error("This file is not a PICO-8 .p8 cartridge.");
  const sections = {};
  let current = null;
  for (const line of lines.slice(1)) {
    const header = /^__([a-z0-9_]+)__\s*$/.exec(line);
    if (header) sections[(current = header[1])] = [];
    else if (current) sections[current].push(line);
  }
  if (!sections.lua) throw new Error("The cartridge has no Lua code.");
  if (sections.lua.some((l) => /^#include\b/.test(l)))
    throw new Error("Carts with #include files cannot be imported yet.");
  const bytes = decodeAssets(emptyAssets()).slice();
  const hex = (s, i) => parseInt(s.slice(i, i + 2), 16) || 0;
  (sections.gfx ?? []).slice(0, 128).forEach((row, y) => {
    for (let x = 0; x < 128 && x < row.length; x += 2)
      bytes[y * 64 + (x >> 1)] =
        (parseInt(row[x], 16) || 0) | ((parseInt(row[x + 1], 16) || 0) << 4);
  });
  (sections.gff ?? []).slice(0, 2).forEach((row, r) => {
    for (let i = 0; i < 128 && i * 2 < row.length; i++)
      bytes[0x3000 + r * 128 + i] = hex(row, i * 2);
  });
  (sections.map ?? []).slice(0, 32).forEach((row, y) => {
    for (let i = 0; i < 128 && i * 2 < row.length; i++)
      bytes[0x2000 + y * 128 + i] = hex(row, i * 2);
  });
  (sections.sfx ?? []).slice(0, 64).forEach((row, id) => {
    if (row.length < 168) return;
    const b = 0x3200 + id * 68;
    for (let i = 0; i < 4; i++) bytes[b + 64 + i] = hex(row, i * 2);
    for (let n = 0; n < 32; n++) {
      const o = 8 + n * 5;
      const pitch = hex(row, o) & 63;
      const wave = parseInt(row[o + 2], 16) || 0;
      const volume = (parseInt(row[o + 3], 16) || 0) & 7;
      const effect = (parseInt(row[o + 4], 16) || 0) & 7;
      const note =
        pitch |
        ((wave & 7) << 6) |
        (volume << 9) |
        (effect << 12) |
        ((wave >> 3) << 15);
      bytes[b + n * 2] = note & 255;
      bytes[b + n * 2 + 1] = note >> 8;
    }
  });
  (sections.music ?? []).slice(0, 64).forEach((row, id) => {
    const match = /^([0-9a-f]{2}) ([0-9a-f]{8})/.exec(row);
    if (!match) return;
    const flags = parseInt(match[1], 16);
    for (let i = 0; i < 4; i++)
      bytes[0x3100 + id * 4 + i] =
        (hex(match[2], i * 2) & 127) | (((flags >> i) & 1) << 7);
  });
  let label = null;
  if (sections.label?.length >= 128) {
    label = new Uint8Array(128 * 128 * 4);
    sections.label.slice(0, 128).forEach((row, y) => {
      for (let x = 0; x < 128; x++) {
        const [r, g, b] =
          labelPalette[Math.max(0, labelDigits.indexOf(row[x]))];
        label.set([r, g, b, 255], (y * 128 + x) * 4);
      }
    });
  }
  const source = sections.lua.join("\n").replace(/\n+$/, "");
  return {
    snapshot: { source, assets: encodeAssets(bytes) },
    label,
    title: headerTitle(source),
  };
}

const browserInflate = async (data) =>
  new Uint8Array(
    await new Response(
      new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate")),
    ).arrayBuffer(),
  );

/** Any supported cartridge bytes → { snapshot, label, title }. */
export async function readCartBytes(bytes, inflate = browserInflate) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50)
    return readPngCart(await decodePng(bytes, inflate));
  return readTextCart(new TextDecoder().decode(bytes));
}
