import test from "node:test";
import assert from "node:assert/strict";
import { runTask } from "../src/phases.mjs";
import { newestImageOnly } from "../src/loop.mjs";
import { prompts } from "../src/prompts.mjs";
import { smoke } from "../src/smoke.mjs";
import { soundAssets } from "../src/sounds.mjs";
import { emptySnapshot, shooterSource, verifyShooter } from "../src/maker.mjs";

let id = 0;
const call = (name, args) => ({ role: "assistant", content: [{ type: "toolCall", id: `c${++id}`, name, arguments: args }], stopReason: "toolUse", usage: { input: 10, output: 5, cacheRead: 0 } });
const say = (text) => ({ role: "assistant", content: [{ type: "text", text }], stopReason: "stop", usage: { input: 10, output: 5, cacheRead: 0 } });

// Replays a fixed script and records what each request contained.
function scripted(script) {
  const seen = [];
  return {
    seen,
    complete: async (req) => {
      seen.push(req);
      const next = script.shift();
      if (!next) throw new Error("script exhausted");
      return typeof next === "function" ? next(req) : next;
    },
  };
}

test("example and template boot and respond under the host check, with the sound bank", async () => {
  for (const source of [prompts.template, prompts.example]) {
    const r = await smoke(source, soundAssets());
    assert.equal(r.ok, true, r.lines.join("\n"));
  }
});

test("a create task runs plan, build and test in fresh conversations and enforces phase exits", async () => {
  const model = scripted([
    say("TITLE: Star Catch\nCONTROLS: left/right move\nSTATE: g.caught=0\nRULES: stars fall\nWIN: caught 10\nLOSE: missed 3\nCHECKS: idle 300 frames -> lose"),
    call("write_game", { source: prompts.example }),
    call("done", { summary: "star catch" }),
    call("done", { unverified: [] }), // rejected: no check on this version
    call("check", { cases: [
      { name: "idle loses", steps: [{ press: [], frames: 400 }], expect: [{ path: "g.mode", equals: "lose" }] },
      { name: "caught wins", setup: "g.caught=9 g.stars={{x=64,y=110,vy=1}}", steps: [{ press: [], frames: 10 }], expect: [{ path: "g.mode", equals: "win" }] },
      { name: "wrong case", steps: [{ press: [], frames: 1 }], expect: [{ path: "g.caught", atLeast: 5 }] },
    ] }),
    call("done", { unverified: ["win by normal play"] }),
  ]);
  const r = await runTask({ id: "catch", kind: "create", prompt: "Make a catch game." }, { complete: model.complete });
  assert.equal(r.status, "done");
  assert.deepEqual(r.phases.map((p) => p.name), ["plan", "build", "test"]);
  // Fresh conversation per phase, carrying plan and numbered source as text.
  const testIntro = model.seen[3].messages[0].content;
  assert.match(testIntro, /PLAN:\nTITLE: Star Catch/);
  assert.match(testIntro, /\s+1\| -- STAR CATCH/);
  assert.equal(model.seen[3].messages.length, 1);
  assert.deepEqual(model.seen[3].tools.map((t) => t.name), ["check", "play", "edit_game", "done"]);
  const rejected = r.phases[2].messages.find((m) => m.role === "toolResult" && m.isError);
  assert.match(rejected.content[0].text, /run check on the current version/);
  const checked = r.phases[2].messages.find((m) => m.role === "toolResult" && m.toolName === "check").content[0].text;
  assert.match(checked, /PASS idle loses: g.mode="lose" \| mode play→lose@\d+/);
  assert.match(checked, /PASS caught wins \(setup\)/);
  assert.match(checked, /FAIL wrong case: g.caught is 0, expected at least 5\n2\/3 passed/);
  assert.match(r.reply, /Game: Star Catch[\s\S]*- idle loses: [\s\S]*- caught wins \(with setup\)[\s\S]*FAILED wrong case[\s\S]*- win by normal play/);
  assert.equal(r.toolCalls, 5);
  assert.equal(r.toolErrors, 1);
});

test("a repair task skips planning, starts from the existing cart and passes the oracle", async () => {
  const broken = shooterSource.replace("g.player.inv=20", "g.player.inv=0");
  const model = scripted([
    call("edit_game", { edits: [{ find: "g.player.hp-=1 g.player.inv=0", replace: "g.player.hp-=1 g.player.inv=20" }] }),
    call("done", { summary: "fixed" }),
    call("check", { cases: [{ name: "idle loses", steps: [{ press: [], frames: 300 }], expect: [{ path: "g.mode", equals: "lose" }] }] }),
    call("done", { unverified: [] }),
  ]);
  const r = await runTask({ id: "repair", kind: "repair", prompt: "Fix invulnerability.", snapshot: emptySnapshot(broken) }, { complete: model.complete });
  assert.equal(r.status, "done");
  assert.deepEqual(r.phases.map((p) => p.name), ["build", "test"]);
  assert.match(model.seen[0].messages[0].content, /g.player.inv=0/);
  assert.equal((await verifyShooter(emptySnapshot(r.source))).passed, true);
});

test("caps stop a task and only the newest image is sent", async () => {
  const r = await runTask({ id: "x", kind: "repair", prompt: "p", snapshot: emptySnapshot(shooterSource) }, {
    complete: scripted(Array.from({ length: 5 }, () => call("play", { steps: [{ press: [], frames: 1 }] }))).complete,
    toolCalls: 3,
    turns: { build: 12, test: 16 },
  });
  assert.equal(r.status, "build_tools");
  const img = { type: "image", mimeType: "image/png", data: "x" };
  const out = newestImageOnly([{ role: "toolResult", content: [img] }, { role: "toolResult", content: [img] }]);
  assert.equal(out[0].content[0].type, "text");
  assert.equal(out[1].content[0].type, "image");
});
