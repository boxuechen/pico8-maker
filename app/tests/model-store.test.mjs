import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "../src/model-config.js";
import {
  readModelConfig,
  writeModelConfig,
  clearModelConfig,
} from "../src/model-store.js";

test("model key persists by default, opt-out removes it, clear preserves project data", () => {
  const data = new Map([["pico-maker-project", "game-and-chat"]]);
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  assert.equal(readModelConfig(storage).remember, true);
  const saved = { ...defaultConfig, apiKey: "fixture-not-real" };
  writeModelConfig(saved, storage);
  assert.deepEqual(readModelConfig(storage), saved);
  writeModelConfig({ ...saved, remember: false }, storage);
  assert.equal(readModelConfig(storage).apiKey, "");
  writeModelConfig(saved, storage);
  clearModelConfig(storage);
  assert.equal(readModelConfig(storage).apiKey, "");
  assert.equal(data.get("pico-maker-project"), "game-and-chat");
  data.set("pico-demo-model", "broken");
  assert.deepEqual(readModelConfig(storage), defaultConfig);
});

test("unavailable storage is reported on save and clear, without discarding it silently", () => {
  const storage = {
    getItem() {
      throw new Error("unavailable");
    },
    setItem() {
      throw new Error("unavailable");
    },
    removeItem() {
      throw new Error("unavailable");
    },
  };
  assert.deepEqual(readModelConfig(storage), defaultConfig);
  assert.throws(() => writeModelConfig(defaultConfig, storage), /unavailable/);
  assert.throws(() => clearModelConfig(storage), /unavailable/);
});
