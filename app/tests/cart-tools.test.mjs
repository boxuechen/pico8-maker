import { emptySnapshot } from "../src/pico8/assets.js";
import test from "node:test";
import assert from "node:assert/strict";
import { countTokens } from "../src/pico8/tokens.js";
import { cartText, cartFileName, labelLines } from "../src/pico8/cart.js";
import { formatButtons, mergeSteps } from "../src/workbench-state.js";

test("token counter follows the manual's free-token rules", () => {
  assert.equal(countTokens("x=1"), 3);
  assert.equal(countTokens("local a=-1"), 3);
  assert.equal(countTokens("a=b-1"), 5);
  assert.equal(countTokens('print("hi",4,4,7)'), 6);
  assert.equal(countTokens("-- note\n--[[ long\ncomment ]]\nend"), 0);
  assert.equal(countTokens("a.b=c"), 4);
  assert.equal(countTokens("return -1"), 2);
  assert.equal(countTokens("p.vy+=gravity"), 4);
});

test("saved carts carry a 128×128 label using palette digits", () => {
  const rgba = new Uint8ClampedArray(128 * 128 * 4);
  for (let i = 0; i < 128 * 128; i++) rgba.set([0xff, 0x77, 0xa8, 255], i * 4);
  rgba.set([0x29, 0x18, 0x14, 255], 0); // secret palette 128 → "g"
  const lines = labelLines(rgba);
  assert.equal(lines.length, 128);
  assert.ok(lines.every((line) => line.length === 128));
  assert.equal(lines[0][0], "g");
  assert.equal(lines[0][1], "e");
  const text = cartText(emptySnapshot("print(1)"), rgba);
  assert.match(text, /^pico-8 cartridge/);
  assert.match(text, /__lua__\nprint\(1\)\n__gfx__\n/);
  assert.match(text, /__label__\n/);
  assert.equal(
    cartText(emptySnapshot("x=1")),
    cartText(emptySnapshot("x=1"), null),
  );
  assert.doesNotMatch(cartText(emptySnapshot("x=1")), /__label__/);
});

test("cart file names are short, safe slugs", () => {
  assert.equal(
    cartFileName("The character cannot jump over the wall. Help me fix it."),
    "the-character-cannot-jump-over-the-wall.p8",
  );
  assert.equal(cartFileName("角色跳不过墙"), "my-game.p8");
});

test("tool display: button masks and merged repeat steps", () => {
  assert.equal(formatButtons(2 | 32), "→ + X");
  assert.equal(formatButtons(0), "release");
  const tools = [
    { toolCallId: "1", toolName: "press_buttons", result: "ok" },
    { toolCallId: "2", toolName: "press_buttons", result: "ok" },
    { toolCallId: "3", toolName: "load_game", result: "ok" },
    { toolCallId: "4", toolName: "load_game", result: "ok" },
  ];
  const steps = mergeSteps(tools, false);
  assert.deepEqual(
    steps.map((s) => s.tools.length),
    [2, 1, 1],
  );
});
