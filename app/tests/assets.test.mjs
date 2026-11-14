import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyAssets,
  emptySnapshot,
  editAssets,
  readAssets,
  decodeAssets,
  validSnapshot,
} from "../src/pico8/assets.js";
import { cartBytes, cartText } from "../src/pico8/cart.js";
import { decodeP8, createPico8Session } from "../public/player/main/player.mjs";
import { Game } from "../src/game.js";
import { TestGame } from "./helpers/game.mjs";
import {
  newCart,
  openCartStore,
  memoryBackend,
  duplicateCart,
  normalizeCart,
} from "../src/cart-store.js";
import { sessionContext, activeSession, addSession } from "../src/sessions.js";
import { applyResourceFiles, assetFiles, resourceErrors } from "../src/pico8/shell/resource-files.js";

const rows = (color) => Array(8).fill(color.repeat(8));
const edits = [
  { kind: "sprite", id: 1, rows: rows("8"), flags: 129 },
  { kind: "sprite", id: 255, rows: rows("b"), flags: 64 },
  {
    kind: "map",
    x: 0,
    y: 0,
    rows: [
      [1, 255],
      [0, 1],
    ],
  },
  { kind: "map", x: 127, y: 31, rows: [[255]] },
  {
    kind: "sfx",
    id: 0,
    speed: 8,
    loopStart: 0,
    loopEnd: 2,
    notes: [
      { pitch: 24, waveform: 0, volume: 5, effect: 0 },
      { pitch: 63, waveform: 7, volume: 7, effect: 7 },
    ],
  },
  {
    kind: "music",
    id: 63,
    channels: [0, null, 63, null],
    loopStart: true,
    loopEnd: true,
    stop: true,
  },
];
const assets = editAssets(emptyAssets(), edits);
const source = `function _init()
 assert(sget(8,0)==8 and sget(127,127)==11)
 assert(fget(1,0) and fget(1,7) and fget(255,6))
 assert(mget(0,0)==1 and mget(127,31)==255)
 assert(peek(0x3200)==24 and peek(0x3201)==10 and peek(0x3241)==8)
 assert(peek(0x31fc)==128 and peek(0x31fd)==193 and peek(0x31fe)==191)
 sfx(0)
end
function _draw() cls(0) spr(1,0,0) map(0,0,16,0,2,1) end`;

test("resource sections round-trip all native data through the real cartridge codec", () => {
  const bytes = cartBytes({ source, assets });
  const decoded = decodeP8(bytes);
  assert.deepEqual(decoded.rom.slice(0, 0x4300), decodeAssets(assets));
  assert.equal(new TextDecoder().decode(decoded.code).trim(), source);
  assert.deepEqual(readAssets(assets).sprites, [1, 255]);
  assert.deepEqual(readAssets(assets).sfx, [0]);
  assert.deepEqual(readAssets(assets).music, [63]);
  assert.equal(readAssets(assets).mapCells, 4);
  assert.equal(
    readAssets(assets, { kind: "sfx", id: 0 })[0].notes[1].pitch,
    63,
  );
  assert.equal(
    readAssets(assets, { kind: "sfx", id: 0 })[0].notes[2].volume,
    0,
  );
  const changedFlags = editAssets(assets, [
    { kind: "sprite", id: 1, flags: 2 },
  ]);
  assert.deepEqual(
    readAssets(changedFlags, { kind: "sprite", id: 1 })[0].rows,
    rows("8"),
  );
  const changedPixels = editAssets(changedFlags, [
    { kind: "sprite", id: 1, rows: rows("9") },
  ]);
  assert.equal(
    readAssets(changedPixels, { kind: "sprite", id: 1 })[0].flags,
    2,
  );
  assert.throws(() => cartText({ source: "__gfx__\n00", assets }), /Lua only/);
});

test("resources load before _init, render and survive reset in the real WASM runtime", async (t) => {
  const session = await createPico8Session();
  t.after(() => session.dispose());
  const loaded = await session.loadCart(cartBytes({ source, assets }));
  assert.equal(loaded.state, "ready", JSON.stringify(loaded.diagnostics));
  const frame = (await session.advance({ frames: 2 })).observation.frame;
  assert.deepEqual([...frame.rgba.slice(0, 4)], [255, 0, 77, 255]);
  assert.deepEqual([...frame.rgba.slice(16 * 4, 17 * 4)], [255, 0, 77, 255]);
  assert.deepEqual([...frame.rgba.slice(24 * 4, 25 * 4)], [0, 228, 54, 255]);
  assert.equal((await session.reset()).state, "ready");
  assert.deepEqual(
    [
      ...(await session.advance({ frames: 1 })).observation.frame.rgba.slice(
        0,
        4,
      ),
    ],
    [255, 0, 77, 255],
  );
});

test("invalid batches, shared-map rows and out-of-range reads cannot partially change the draft", async () => {
  const game = new Game(() => {});
  const original = game.draft;
  for (const edit of [
    { kind: "sprite", id: 256, rows: rows("8") },
    { kind: "sprite", id: 1, rows: ["bad"] },
    { kind: "map", x: 0, y: 32, rows: [[1]] },
    { kind: "map", x: 127, y: 0, rows: [[1, 2]] },
    { kind: "map", x: 0, y: 0, rows: [[1], [1, 2]] },
    { kind: "sfx", id: 0, speed: 0, notes: [] },
    { kind: "sfx", id: 0, speed: 8, loopStart: 3, loopEnd: 2, notes: [] },
    { kind: "music", id: 0, channels: [64, null, null, null] },
    { kind: "music", id: 0, channels: [0, null, null, null], stop: "false" },
  ]) {
    await assert.rejects(() =>
      game.execute("edit_assets", { edits: [edits[0], edit] }),
    );
    assert.deepEqual(game.draft, original);
  }
  assert.throws(() =>
    readAssets(assets, { kind: "sprite", id: 255, count: 2 }),
  );
  assert.throws(() => readAssets(assets, { kind: "sfx", id: 0, count: 5 }));
  assert.throws(() =>
    readAssets(assets, { kind: "map", x: 127, y: 31, width: 2, height: 1 }),
  );
  assert.equal(validSnapshot({ source: "x", assets: "00" }), false);
});

test("resource-only commits, failed source edits, undo and cart switching preserve complete versions", async (t) => {
  const g = new TestGame();
  t.after(() => g.dispose());
  await g.execute("edit_assets", { edits });
  assert.equal(g.versions.length, 1);
  assert.equal(g.draft.assets, assets);
  assert.equal((await g.execute("load_game", { source })).isError, false);
  const first = { ...g.snapshot };
  const count = g.versions.length;
  await g.execute("edit_assets", {
    edits: [{ kind: "sprite", id: 2, rows: rows("9") }],
  });
  assert.equal(g.source, source);
  assert.equal((await g.execute("load_game", {})).isError, false);
  assert.equal(g.versions.length, count + 1);
  assert.equal(g.snapshot.source, first.source);
  assert.notEqual(g.snapshot.assets, first.assets);
  const second = { ...g.snapshot };
  await g.execute("load_game", {});
  assert.equal(
    g.versions.length,
    count + 1,
    "identical source/resources do not make another version",
  );
  await g.execute("edit_assets", {
    edits: [{ kind: "sprite", id: 1, rows: rows("e") }],
  });
  const failingAssets = g.draft.assets;
  const resourceFailure = await g.execute("load_game", {});
  assert.equal(
    resourceFailure.isError,
    true,
    "resource-only changes may violate _init assertions",
  );
  assert.deepEqual(g.snapshot, second);
  assert.equal(g.draft.assets, failingAssets);
  const failed = await g.execute("load_game", { source: "function broken(" });
  assert.equal(failed.isError, true);
  assert.equal(g.draft.assets, failingAssets);
  assert.equal(g.draft.source, "function broken(");
  assert.deepEqual(g.snapshot, second);
  const recovered = await g.execute("reset_game", {});
  assert.equal(
    recovered.isError,
    false,
    "restored code checks that restored resources also match",
  );
  await g.undo();
  assert.deepEqual(g.snapshot, first);
  assert.deepEqual(g.draft, first);
  assert.equal((await g.live.advance({ frames: 1 })).outcome, "completed");
  const exported = decodeP8(cartBytes(g.snapshot));
  assert.deepEqual(exported.rom.slice(0, 0x4300), decodeAssets(first.assets));
  await g.switchProject([], 0);
  assert.deepEqual(g.draft, emptySnapshot());
  await g.switchProject([second], 1, {
    source: "-- draft",
    assets: failingAssets,
  });
  assert.deepEqual(g.snapshot, second);
  assert.equal(g.draft.assets, failingAssets);
});

test("asset-only drafts persist, duplicate and invalidate resumed conversations", async () => {
  const backend = memoryBackend(),
    store = await openCartStore({ backend });
  const cart = newCart({
    versions: [{ source, assets }],
    revision: 1,
    workingDraft: {
      source,
      assets: editAssets(assets, [{ kind: "sprite", id: 2, rows: rows("a") }]),
    },
  });
  const session = activeSession(cart);
  session.lastContentVersion = 0;
  addSession(cart);
  cart.contentVersion = 1;
  assert.match(sessionContext(cart, session), /shared cart content changed/);
  assert.match(
    sessionContext(cart, session),
    /Earlier source, resources and test results are stale/,
  );
  await store.put(cart);
  const reopened = (await openCartStore({ backend })).carts[0];
  assert.deepEqual(reopened.workingDraft, cart.workingDraft);
  assert.deepEqual(reopened.versions, cart.versions);
  const copy = duplicateCart(reopened);
  copy.versions[0].assets = emptyAssets();
  assert.equal(reopened.versions[0].assets, assets);
  assert.deepEqual(copy.workingDraft, reopened.workingDraft);
  assert.equal(normalizeCart({ ...cart, schemaVersion: 2 }), null);
  assert.equal(
    normalizeCart({ ...cart, workingDraft: { source, assets: "bad" } }),
    null,
  );
});

test("resource files round-trip the native resources and reject malformed text with its line", () => {
  const files = assetFiles(assets);
  assert.deepEqual(Object.keys(files), ["gfx.txt", "gff.txt", "map.txt", "sfx.txt", "music.txt"]);
  assert.equal(applyResourceFiles(emptyAssets(), files).assets, assets);
  // Present files override their section only.
  const onlyMap = applyResourceFiles(assets, { "map.txt": assetFiles(emptyAssets())["map.txt"] }).assets;
  assert.equal(readAssets(onlyMap).mapCells, 0);
  assert.deepEqual(readAssets(onlyMap).sprites, readAssets(assets).sprites);
  const broken = files["gfx.txt"].replace(/^.{3}/, "xyz");
  const r = applyResourceFiles(assets, { "gfx.txt": broken });
  assert.equal(r.assets, assets, "nothing is applied when a file is malformed");
  assert.match(r.errors[0], /gfx.txt line 1 is not 128 hex digits/);
  assert.match(resourceErrors("music.txt", "00 41424344\n")[0], /needs exactly 64/);
});

test("cancellation during live loading never commits and restores the full previous cart", async () => {
  const previous = { source: "old", assets };
  const g = new Game(() => {}, { versions: [previous] });
  const controller = new AbortController();
  const loaded = [];
  g.ensureWorker = async () => {};
  const observation = { state: "ready", diagnostics: [], frame: null };
  g.rpc = async (action) => (action === "load" ? observation : { observation });
  g.player = {
    pause: async () => {},
    loadCart: async (bytes) => {
      loaded.push(decodeP8(bytes));
      if (loaded.length === 1) controller.abort();
    },
  };
  await g.execute("edit_assets", {
    edits: [{ kind: "sprite", id: 3, rows: rows("9") }],
  });
  const draftAssets = g.draft.assets;
  await assert.rejects(
    () => g.execute("load_game", { source: "new" }, controller.signal),
    /abort/i,
  );
  assert.equal(g.versions.length, 1);
  assert.deepEqual(g.snapshot, previous);
  assert.equal(g.draft.assets, draftAssets);
  assert.equal(loaded.length, 2);
  assert.deepEqual(loaded[1].rom.slice(0, 0x4300), decodeAssets(assets));
});
