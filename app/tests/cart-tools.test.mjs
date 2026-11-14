import { emptySnapshot } from "../src/pico8/assets.js";
import test from "node:test";
import assert from "node:assert/strict";
import { countTokens } from "../src/pico8/tokens.js";
import { sourceBudget } from "../src/pico8/source-budget.js";
import { cartText, cartFileName, labelLines } from "../src/pico8/cart.js";
import { describeTool, mergeSteps } from "../src/workbench-state.js";

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

test("large decimal advice skips comments, strings, identifiers and bit patterns", () => {
  const source = [
    "-- 99999",
    "// 99999",
    "--[=[ 99999\n99999 ]=]",
    'local label="escaped \\"99999"',
    "local other='99999'",
    "local long=[==[99999\n99999]==]",
    "local id99999=0xffff local bits=0b1111111111111111",
    "local minimum=-32768 local maximum=32767.99",
    "local best=99999",
    "local counter=-1e5",
    "local value=99_999",
  ].join("\n");
  const advice = sourceBudget(source);
  assert.equal(advice.codeTokensApprox, countTokens(source));
  assert.equal(advice.warnings.length, 3);
  assert.match(advice.warnings[0], /Line 11: decimal literal 99999/);
  assert.match(advice.warnings[1], /Line 12: decimal literal 1e5/);
  assert.match(advice.warnings[2], /Line 13: decimal literal 99_999/);
  assert.ok(
    advice.warnings.every((w) => w.includes("16.16") && w.includes("nil")),
  );
});

test("decimal advice remains bounded and clears when source is repaired", () => {
  const source = Array.from({ length: 100 }, (_, i) => `v${i}=99999`).join(
    "\n",
  );
  const advice = sourceBudget(source);
  assert.equal(advice.warnings.length, 5);
  assert.match(advice.warnings.at(-1), /96 more/);
  assert.deepEqual(sourceBudget("local best=nil").warnings, []);
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

test("tool display merges repeated steps and labels bash commands", () => {
  const tools = [
    { toolCallId: "1", toolName: "bash", result: "ok" },
    { toolCallId: "2", toolName: "bash", result: "ok" },
    { toolCallId: "3", toolName: "edit", result: "ok" },
  ];
  assert.deepEqual(
    mergeSteps(tools, false).map((s) => s.tools.length),
    [2, 1],
  );
  assert.deepEqual(describeTool({ toolName: "bash", args: { command: "p8 check\nls" } }), { label: "Ran", meta: "p8 check" });
});
