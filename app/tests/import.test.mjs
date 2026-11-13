import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import {
  readCartBytes,
  readTextCart,
  p8sciiToText,
} from "../src/pico8/import.js";
import { cartText } from "../src/pico8/cart.js";
import { validSnapshot } from "../src/pico8/assets.js";

const inflate = async (data) => new Uint8Array(inflateSync(data));
const carts = new URL("../src/assets/carts/", import.meta.url);

test("bundled .p8.png carts decode to Lua source and native resources", async () => {
  for (const file of readdirSync(carts)) {
    const bytes = new Uint8Array(readFileSync(new URL(file, carts)));
    const { snapshot, label } = await readCartBytes(bytes, inflate);
    assert.ok(validSnapshot(snapshot), file);
    assert.match(snapshot.source, /function|_draw/, file);
    assert.equal(label.length, 128 * 128 * 4, file);
  }
  const mole = await readCartBytes(
    new Uint8Array(readFileSync(new URL("molemole-1.p8.png", carts))),
    inflate,
  );
  assert.equal(mole.title, "mole mole");
});

test(".p8 text import round-trips Maker exports, including sfx and music", async () => {
  const text = readFileSync(
    new URL("../public/case-studies/lodge-podge/final.p8", import.meta.url),
    "utf8",
  );
  const first = readTextCart(text);
  assert.equal(first.title, "lodge podge");
  const again = readTextCart(cartText(first.snapshot));
  assert.equal(again.snapshot.source, first.snapshot.source);
  assert.equal(again.snapshot.assets, first.snapshot.assets);
  // The exported resource text is identical to the original file's sections.
  const sections = (s) => s.slice(s.indexOf("__gfx__"));
  assert.equal(
    sections(cartText(first.snapshot)).trim(),
    sections(text).split("__label__")[0].trim(),
  );
});

test("P8SCII glyphs map to the Unicode used by .p8 files", () => {
  assert.equal(p8sciiToText([0x62, 0x74, 0x6e, 0x28, 0x94, 0x29]), "btn(⬆️)");
  assert.equal(p8sciiToText([0x8e, 0x97]), "🅾️❎");
});

test("non-cart files are rejected with a readable message", async () => {
  await assert.rejects(
    readCartBytes(new TextEncoder().encode("hello")),
    /not a PICO-8 \.p8 cartridge/,
  );
});
