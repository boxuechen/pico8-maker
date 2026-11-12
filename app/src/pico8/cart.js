import { assetSections, validSnapshot } from "./assets.js";
// .p8 text cartridges: Lua, native resources and an optional __label__ from the
// AI playtest, so the saved cart carries a picture in PICO-8 and SPLORE.
const palette = [
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
  // Secret palette 128–143, written as g–v in label data.
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
const digits = "0123456789abcdefghijklmnopqrstuv";

function nearest(r, g, b) {
  let best = 0;
  let distance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < distance) {
      distance = d;
      best = i;
      if (!d) break;
    }
  }
  return digits[best];
}

/** RGBA (128×128×4) → 128 lines of PICO-8 label digits. */
export function labelLines(rgba) {
  if (!rgba || rgba.length < 128 * 128 * 4) return null;
  const lines = [];
  for (let y = 0; y < 128; y++) {
    let line = "";
    for (let x = 0; x < 128; x++) {
      const o = (y * 128 + x) * 4;
      line += nearest(rgba[o], rgba[o + 1], rgba[o + 2]);
    }
    lines.push(line);
  }
  return lines;
}

export function cartText(snapshot, label) {
  if (!validSnapshot(snapshot)) throw new Error("Invalid cart snapshot");
  if (/^__[a-zA-Z0-9_]+__\s*$/m.test(snapshot.source))
    throw new Error(
      "main.lua must contain Lua only; use edit_assets for resources",
    );
  const lines = Array.isArray(label) ? label : labelLines(label);
  return `pico-8 cartridge // http://www.pico-8.com\nversion 43\n__lua__\n${snapshot.source}\n${assetSections(snapshot.assets)}${
    lines ? `__label__\n${lines.join("\n")}\n` : ""
  }`;
}

export function cartFileName(title = "") {
  const slug = String(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  return `${slug || "my-game"}.p8`;
}

/** Encode exactly the same complete cart used by export and both players. */
export const cartBytes = (snapshot) =>
  new TextEncoder().encode(cartText(snapshot));

/** Download a committed cart as a .p8 file (browser only). */
export function downloadCart(snapshot, { title, label } = {}) {
  const url = URL.createObjectURL(
    new Blob([cartText(snapshot, label)], { type: "text/plain" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = cartFileName(title);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
