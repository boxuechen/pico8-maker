import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPico8Session } from "../public/player/main/player.mjs";
import config from "../vite.config.mjs";
import { Game } from "../src/game.js";
import { sampleSource, cartBytes } from "../src/sample.js";
const carts = JSON.parse(
  await readFile(new URL("../src/assets/carts.json", import.meta.url)),
);
test("all gallery cartridges are embedded byte-for-byte in HTML and run in the real WASM player", async () => {
  const tags = config.plugins
    .find((p) => p.name === "embedded-pico-cartridges")
    .transformIndexHtml();
  const embedded = JSON.parse(tags[0].children);
  for (const cart of carts) {
    const raw = new Uint8Array(
      await readFile(
        new URL(`../public/assets/carts/${cart.id}.p8.png`, import.meta.url),
      ),
    );
    assert.deepEqual(
      new Uint8Array(Buffer.from(embedded[cart.id], "base64")),
      raw,
      cart.id,
    );
    const session = await createPico8Session();
    try {
      assert.notEqual(
        (await session.loadCart(raw)).state,
        "faulted",
        cart.id + " loads",
      );
      const result = await session.advance({ frames: 120 });
      assert.notEqual(result.observation.state, "faulted", cart.id + " runs");
      assert.ok(result.observation.frame?.rgba.length, cart.id + " renders");
    } finally {
      await session.dispose();
    }
  }
});
test("leaving gallery restores project cartridge without changing saved versions", async () => {
  let saved = false,
    loaded;
  const game = new Game(() => {}, {
    versions: [sampleSource],
    onSave: () => {
      saved = true;
    },
  });
  game.activeCart = carts[0];
  game.player = {
    loadCart: async (bytes) => {
      loaded = bytes;
    },
  };
  await game.restoreProject();
  assert.deepEqual(loaded, cartBytes(sampleSource));
  assert.equal(game.activeCart, null);
  assert.equal(game.source, sampleSource);
  assert.equal(saved, false);
});

test("leaving gallery for an empty project pauses it without loading a demo", async () => {
  const game = new Game(() => {});
  let paused = false;
  game.activeCart = carts[0];
  game.player = {
    pause: async () => {
      paused = true;
    },
    loadCart: async () => {
      throw new Error("must not load a default game");
    },
  };
  await game.restoreProject();
  assert.equal(paused, true);
  assert.equal(game.activeCart, null);
  assert.equal(game.source, "");
  assert.deepEqual(game.versions, []);
});
