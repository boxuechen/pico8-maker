import { emptySnapshot } from "../src/pico8/assets.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createPico8Session } from "../public/player/main/player.mjs";
import palette from "../src/pico8/palette.js";
import {
  observationOptions,
  encodeAscii,
  cropRgba,
  observationText,
  modelImage,
  compactInspected,
} from "../src/pico8/observation.js";
import { capabilities } from "../src/pico8/capabilities.js";
import { Game } from "../src/game.js";

const rowsOf = (text) =>
  text.split("\npixels:\n")[1].split("\nend pixels")[0].split("\n");
const rgb = new Map(
  palette.map((c) => [
    c.displayCode,
    [
      ...c.rgb
        .slice(1)
        .match(/../g)
        .map((n) => parseInt(n, 16)),
      255,
    ],
  ]),
);
const source = (mode) => `
function _draw()
 pal()
 ${mode === "duplicate" ? "pal(2,8,0)" : ""}
 for i=0,15 do pal(i,${mode === "extended" ? "128+15-i" : mode === "duplicate" ? "136" : "(i+3)%16"},1) end
 for y=0,127 do
  for x=0,127 do pset(x,y,(x+y*3)%16) end
 end
end`;
const expectedSlot = (x, y, mode) => {
  const n = (x + y * 3) % 16;
  return mode === "duplicate" && n === 2 ? 8 : n;
};

function sampleObservation() {
  const packedScreen = new Uint8Array(8192);
  for (let i = 0; i < packedScreen.length; i++)
    packedScreen[i] = (i * 37) & 255;
  return {
    v: 1,
    sessionId: "fixture-session",
    revision: 2,
    generation: 3,
    state: "paused",
    diagnostics: [],
    frame: {
      frameId: 9,
      targetFps: 30,
      width: 128,
      height: 128,
      packedScreen,
      displayPalette: Uint8Array.from({ length: 16 }, (_, i) => i),
      rgba: new Uint8ClampedArray(65536),
    },
  };
}

test("regions reject invalid input and preserve exact boundary/odd-pixel crops", () => {
  assert.deepEqual(observationOptions(), {
    format: "png",
    region: { x: 0, y: 0, width: 128, height: 128 },
  });
  const valid = { x: 127, y: 127, width: 1, height: 1 };
  assert.deepEqual(
    observationOptions({ format: "ascii", region: valid }).region,
    valid,
  );
  for (const args of [
    null,
    [],
    { format: null },
    { format: "jpg" },
    { scale: 2 },
    { region: null },
    { region: { x: 0, y: 0, width: 128 } },
    { region: { ...valid, x: -1 } },
    { region: { ...valid, width: 0 } },
    { region: { ...valid, x: 0.5 } },
    { region: { ...valid, x: "1" } },
    { region: { ...valid, width: Infinity } },
    { region: { ...valid, extra: 1 } },
  ])
    assert.throws(() => observationOptions(args));
});

test("real WASM ASCII reconstructs the same RGBA for draw remaps, all display colors and duplicate colors", async (t) => {
  const session = await createPico8Session();
  t.after(() => session.dispose());
  for (const mode of ["default", "extended", "duplicate"]) {
    await session.loadSource(source(mode));
    const { observation, outcome } = await session.advance({ frames: 1 });
    assert.equal(outcome, "completed");
    const frame = observation.frame;
    const crops = [
      { x: 0, y: 0, width: 128, height: 128 },
      { x: 1, y: 3, width: 7, height: 5 },
      { x: 127, y: 127, width: 1, height: 1 },
    ];
    for (const region of crops) {
      const options = observationOptions({ format: "ascii", region });
      const text = observationText(observation, options);
      const rows = rowsOf(text);
      assert.equal(rows.length, region.height);
      assert.equal(
        text.split("\n").filter((line) => /^[0-9a-f] = /.test(line)).length,
        16,
      );
      const reconstructed = [];
      rows.forEach((row, y) => {
        assert.equal(row.length, region.width);
        [...row].forEach((char, x) => {
          const slot = parseInt(char, 16);
          assert.equal(slot, expectedSlot(region.x + x, region.y + y, mode));
          reconstructed.push(...rgb.get(frame.displayPalette[slot]));
        });
      });
      assert.deepEqual(
        new Uint8ClampedArray(reconstructed),
        cropRgba(frame, region),
      );
      assert.ok(Buffer.byteLength(text) <= capabilities.observationMaxBytes);
      assert.ok(text.split("\n").length <= capabilities.observationMaxLines);
      for (const code of frame.displayPalette)
        assert.ok(
          text.includes(palette.find((c) => c.displayCode === code).name),
        );
      assert.equal(
        text,
        observationText(session.observe(), options),
        "observation must not advance or change the frame",
      );
    }
    if (mode === "duplicate")
      assert.match(
        encodeAscii(frame, crops[1]),
        /8 = deep rose \(#be1250\), display code 136/,
      );
  }
});

test("display register flag bits follow player decoding and incomplete frames fail explicitly", () => {
  const frame = sampleObservation().frame;
  frame.displayPalette[8] = 0xf8;
  const region = observationOptions().region;
  assert.match(
    encodeAscii(frame, region),
    /8 = deep rose \(#be1250\), display code 136/,
  );
  assert.throws(() =>
    encodeAscii({ ...frame, packedScreen: new Uint8Array(1) }, region),
  );
  assert.throws(() =>
    cropRgba({ ...frame, rgba: new Uint8ClampedArray(1) }, region),
  );
});

test("diagnostic overflow cannot truncate the full pixel grid; absent frames are explicit", () => {
  const observation = sampleObservation();
  observation.diagnostics = [
    {
      message: "诊断\n".repeat(100000),
      details: { large: "x".repeat(100000) },
    },
  ];
  const text = observationText(
    observation,
    observationOptions({ format: "ascii" }),
  );
  assert.equal(JSON.parse(text.split("\n")[0]).diagnosticsTruncated, true);
  assert.equal(rowsOf(text).length, 128);
  assert.ok(Buffer.byteLength(text) <= capabilities.observationMaxBytes);
  assert.match(
    observationText({ ...observation, frame: null }, observationOptions()),
    /No completed test frame/,
  );
  assert.equal(
    observation.diagnostics[0].message.length,
    300000,
    "source diagnostics stay untouched",
  );
});

test("crop intersection and nearest-neighbor expansion preserve exact original pixels", () => {
  assert.deepEqual(
    observationOptions({ region: { x: -2, y: 126, width: 5, height: 8 } })
      .region,
    { x: 0, y: 126, width: 3, height: 2 },
  );
  assert.throws(
    () => observationOptions({ region: { x: -5, y: 0, width: 3, height: 1 } }),
    /intersect/,
  );
  const rgba = Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255]);
  const result = modelImage({ rgba, width: 2, height: 1 });
  assert.equal(result.width, 8);
  assert.equal(result.height, 4);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 8; x++) {
      const offset = (y * 8 + x) * 4;
      assert.deepEqual(
        result.rgba.slice(offset, offset + 4),
        rgba.slice(x < 4 ? 0 : 4, x < 4 ? 4 : 8),
      );
    }
  assert.deepEqual([...rgba], [1, 2, 3, 255, 4, 5, 6, 255]);
});

test("model state reads compact complete tables without losing sparse, tagged or truncated data", () => {
  const t = (...pairs) => ({
    type: "table",
    entries: pairs.map(([key, value]) => ({ key, value })),
  });
  const row = t([1, 5], [2, 3], [3, 1]);
  assert.deepEqual(compactInspected(t([1, row], [2, row])), [
    [5, 3, 1],
    [5, 3, 1],
  ]);
  assert.deepEqual(compactInspected(t(["x", 40], ["y", 24])), { x: 40, y: 24 });
  assert.deepEqual(compactInspected(t()), []);
  assert.deepEqual(compactInspected({ type: "nil" }), { type: "nil" });
  // Sparse, mixed, "type"-keyed and truncated tables keep explicit entries.
  for (const value of [
    t([1, false], [7, 1.5]),
    t([1, 1], ["x", 2]),
    t(["type", "nil"]),
    { ...t([1, 1]), truncated: "entries" },
  ])
    assert.equal(compactInspected(value).type, "table");
  assert.deepEqual(compactInspected(t([2, t(["x", 1])], [9, 0])).entries[0], {
    key: 2,
    value: { x: 1 },
  });
  const board = t(
    ...Array.from({ length: 8 }, (_, y) => [
      y + 1,
      t(...Array.from({ length: 8 }, (_, x) => [x + 1, ((x + y) % 5) + 1])),
    ]),
  );
  assert.ok(
    JSON.stringify(compactInspected(board)).length * 8 <
      JSON.stringify(board).length,
    "an 8x8 board is at least eight times smaller",
  );
});
