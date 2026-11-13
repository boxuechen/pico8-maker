import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { lint, codeOnly } from "../src/lint.mjs";
import { applyEdits, Bench, editGame, play, writeGame } from "../src/tools.mjs";
import { emptySnapshot, shooterSource } from "../src/maker.mjs";

const template = await readFile(new URL("../prompts/template.lua", import.meta.url), "utf8");
const textOf = (r) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

test("lint catches what PICO-8 rejects and ignores strings and comments", () => {
  assert.deepEqual(lint(template).errors, []);
  assert.deepEqual(lint(shooterSource).errors, []);
  const bad = lint("local g={}\nfunction _update() x=math.floor(1) love.draw() end\n-- 中文\nfunction _draw() end");
  const messages = bad.errors.map((e) => `${e.line}:${e.message}`).join("\n");
  assert.match(messages, /^1:g must be global/m);
  assert.match(messages, /^2:math.floor does not exist; use flr/m);
  assert.match(messages, /^2:love/m);
  assert.match(messages, /^3:non-ASCII/m);
  assert.equal(lint('function _update() end function _draw() print("math.floor") end -- love.draw').errors.length, 0);
  assert.match(lint("function _draw() end").errors[0].message, /_update/);
  assert.equal(codeOnly('a="x--y" -- c\nb=1').split("\n")[1], "b=1");
});

test("edits apply exactly, tolerate re-indentation and explain failures", () => {
  const src = "function f()\n  x=1\n  y=2\nend";
  assert.equal(applyEdits(src, [{ find: "x=1", replace: "x=3" }]), "function f()\n  x=3\n  y=2\nend");
  assert.equal(applyEdits(src, [{ find: "x=1\ny=2", replace: "  z=0" }]), "function f()\n  z=0\nend");
  assert.throws(() => applyEdits(src, [{ find: "", replace: "a" }]), /write_game/);
  assert.throws(() => applyEdits("a=1\na=1", [{ find: "a=1", replace: "b" }]), /matches 2 places/);
  assert.throws(() => applyEdits(src, [{ find: "x=9", replace: "b" }]), /not found[\s\S]*2\|   x=1/);
});

test("bench pipeline: lint blocks, crashes are located, clean loads run the host check", async (t) => {
  const bench = new Bench(emptySnapshot(""));
  t.after(() => bench.dispose());
  const write = writeGame(bench),
    edit = editGame(bench);
  let r = await write.execute({ source: "-- 射击\nfunction _update() end\nfunction _draw() end" });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /line 1: non-ASCII[\s\S]*1\| -- /);
  r = await write.execute({ source: "function _init() g={mode='play'} end\nfunction _update() boom() end\nfunction _draw() cls() end" });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /crashed[\s\S]*'boom' is not a PICO-8 function[\s\S]*2\| function _update/);
  assert.equal(bench.loaded, null);
  r = await write.execute({ source: template });
  assert.equal(r.isError, undefined);
  assert.match(textOf(r), /left held 10 frames: g.player.x 64→44/);
  assert.equal(r.content.at(-1).type, "image");
  r = await edit.execute({ edits: [{ find: "g.player.x-=2", replace: "g.player.x-=3" }] });
  assert.match(textOf(r), /64→34/);
  assert.equal(bench.loaded, bench.source);
});

test("play reports mode changes, state, setup evidence and faults", async (t) => {
  const bench = new Bench(emptySnapshot(""));
  t.after(() => bench.dispose());
  const p = play(bench);
  assert.match(textOf(await p.execute({ steps: [{ press: [], frames: 1 }] })), /No game is loaded/);
  await writeGame(bench).execute({ source: shooterSource });
  let r = await p.execute({ reset: true, steps: [{ press: [], frames: 300 }], read: ["g.mode", "g.player.hp"] });
  assert.match(textOf(r), /mode play→lose/);
  assert.match(textOf(r), /"g.player.hp":0/);
  assert.equal(bench.playedSinceLoad, true);
  r = await p.execute({ steps: [{ press: [], frames: 20 }, { press: ["x"], frames: 1 }], read: ["g.mode"] });
  assert.match(textOf(r), /mode lose→play/);
  r = await p.execute({ reset: true, setup: "g.kills=5 g.enemies={{x=64,y=24}} g.wave=2", steps: [{ press: ["o"], frames: 30 }], read: ["g.mode"] });
  assert.match(textOf(r), /setup ran[\s\S]*mode play→win/);
  assert.match(textOf(await p.execute({ steps: [{ press: ["jump"], frames: 1 }] })), /unknown button|must be equal/);
});

test("lengths and repeated calls", async (t) => {
  const bench = new Bench(emptySnapshot(""));
  t.after(() => bench.dispose());
  await writeGame(bench).execute({ source: shooterSource });
  const r = await play(bench).execute({ reset: true, steps: [{ press: [], frames: 1 }], read: ["#g.enemies", "#g.bullets"] });
  assert.match(textOf(r), /"#g.enemies":3,"#g.bullets":0/);
  const { runLoop } = await import("../src/loop.mjs");
  let n = 0;
  const same = { role: "assistant", content: [{ type: "toolCall", id: "a", name: "noop", arguments: { x: 1 } }], stopReason: "toolUse" };
  const loop = await runLoop({
    complete: async () => (n++ < 2 ? structuredClone(same) : { role: "assistant", content: [{ type: "text", text: "ok" }], stopReason: "stop" }),
    system: "", messages: [], tools: [{ name: "noop", execute: async () => ({ content: [{ type: "text", text: "ran" }] }) }],
    maxTurns: 5, budget: { toolCalls: 10 }, deadline: Date.now() + 10000,
  });
  const results = loop.messages.filter((m) => m.role === "toolResult");
  assert.equal(results[0].content[0].text, "ran");
  assert.match(results[1].content[0].text, /identical to your previous call/);
});

test("play accepts stringified steps and single values", async (t) => {
  const bench = new Bench(emptySnapshot(""));
  t.after(() => bench.dispose());
  await writeGame(bench).execute({ source: shooterSource });
  const r = await play(bench).execute({ reset: true, steps: '[{"frames": 20, "press": "left"}], {"frames": 5, "press": []}', read: "g.player.x" });
  assert.equal(r.isError, false);
  assert.match(textOf(r), /25f|now frame 26/);
  assert.match(textOf(r), /"g.player.x":24/);
});
