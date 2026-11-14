// Shell flow (opt-in): environment, commits through load_game, route replay and
// the extension surface. No model requests.
import test from "node:test";
import assert from "node:assert/strict";
import skillFiles from "../src/generated/shell-skill.js";
import { emptySnapshot, assetSummary } from "../src/pico8/assets.js";
import { createShellEnvironment, routeCalls } from "../src/pico8/shell/environment.js";
import { createShellExtension } from "../src/pico8/shell/extension.js";
import { EvaluationGame } from "../scripts/evaluation/node-game.mjs";
import { startNodeP8Worker } from "../scripts/evaluation/p8-worker-node.mjs";
import { createKnowledgeFiles } from "../src/pico8/knowledge-files.js";

test("p8 press text becomes bounded press_buttons calls", () => {
  assert.deepEqual(routeCalls("right*30 x wait*5"), [{ steps: [{ frames: 30, buttons: 2 }, { frames: 1, buttons: 32 }, { frames: 5, buttons: 0 }] }]);
  const long = routeCalls("left*700");
  assert.deepEqual(long.map((c) => c.steps.map((s) => s.frames)), [[600], [100]]);
  const many = routeCalls(Array.from({ length: 10 }, () => "o").join(" "));
  assert.deepEqual(many.map((c) => c.steps.length), [8, 2]);
});

test("shell environment: draft-backed main.lua, commits via load_game, replayed routes, read-only skill", async () => {
  const draft = emptySnapshot();
  const game = new EvaluationGame({ versions: [], draft });
  const worker = await startNodeP8Worker(skillFiles);
  try {
    const { exec, env } = await createShellEnvironment({ game, skillFiles, sendP8: worker.send });
    const sh = async (c) => {
      const r = await exec(c);
      return { code: r.exitCode, out: r.stdout + r.stderr };
    };
    assert.match((await sh("p8 new skeleton")).out, /main.lua now holds the skeleton template/);
    assert.match(game.draft.source, /function new_game/);
    assert.equal(game.hasGame, false);
    const checked = await sh("p8 check");
    assert.match(checked.out, /PASS boot/);
    assert.match(checked.out, /Maker: committed as version 1; the player now runs it\. Revision 1: no normal-input route recorded yet\. Only p8 run routes on this version count as tested\.\n$/);
    assert.equal(game.hasGame, true);
    assert.deepEqual(assetSummary(game.snapshot.assets).sfx, [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.match((await sh("p8 check")).out, /PASS boot[\s\S]*$/);
    assert.doesNotMatch((await sh("p8 check")).out, /Maker:/);
    await sh("sed -i 's/^-- /-- edited /' main.lua");
    assert.notEqual(game.draft.source, game.snapshot.source);
    const ran = await sh("p8 run --press 'right*10 x' --read g.mode");
    assert.match(ran.out, /g.mode = "play"/);
    assert.match(ran.out, /Maker: committed as version 2/);
    assert.equal(game.cartSummary().draftDirty, false);
    const runs = game.playtests.runs.filter((r) => r.revision === 2);
    assert.ok(runs.length >= 1, "the p8 run route is recorded on the committed revision");
    assert.match((await sh("echo x > /skill/pico8/SKILL.md")).out, /EROFS/);
    assert.match((await sh("cat /skill/pico8/SKILL.md | head -3")).out, /name: pico8/);
    assert.match((await sh("p8 look --png /tmp/s.png | tail -1")).out, /wrote \/tmp\/s.png/);
    const png = await env.readBinaryFile("/tmp/s.png");
    assert.ok(png.ok && png.value[1] === 80);
    const read = await env.readTextFile("main.lua");
    assert.equal(read.value, game.draft.source);
    await env.writeFile("/cart/main.lua", "function _draw() cls(3) end");
    assert.equal(game.draft.source, "function _draw() cls(3) end");
    assert.match((await sh("p8 check")).out, /FAIL lint[\s\S]*Maker: committed as version 3/);
  } finally {
    await worker.close();
    await game.dispose();
  }
});

test("shell extension: coding tools, the two resource tools reworded, startup sections", async () => {
  const game = new EvaluationGame({ versions: [], draft: emptySnapshot() });
  const knowledge = createKnowledgeFiles({ load: async () => "" });
  try {
    const ext = createShellExtension({ game, knowledge, skillFiles });
    assert.deepEqual(ext.tools.map((t) => t.name), ["read", "write", "edit", "bash", "read_assets", "edit_assets"]);
    for (const t of ext.tools) assert.doesNotMatch(t.description, /load_game/);
    assert.deepEqual(ext.sections.map((s) => s.key), ["shell_prompt", "shell_skill", "pico8_host"]);
    const text = await Promise.all(ext.sections.map((s) => s.render({}, {})));
    assert.match(text[0], /^You are a coding assistant running inside pi/);
    assert.doesNotMatch(text[0], /Pi documentation/);
    assert.match(text[1], /^<skill name="pico8" location="\/skill\/pico8\/SKILL.md">/);
    assert.match(text[2], /commits it/);
    const edited = await ext.tools.find((t) => t.name === "edit_assets").execute({ edits: [{ kind: "sfx", id: 9, speed: 4, notes: [{ pitch: 30, waveform: 1, volume: 5, effect: 0 }] }] }, {}, {});
    assert.doesNotMatch(JSON.stringify(edited.output), /load_game/);
  } finally {
    await game.dispose();
  }
});

test("Agent with flow shell offers the shell tools and no frozen game tools", async () => {
  const { readFile } = await import("node:fs/promises");
  const { BACKGROUND_CONTEXT: context } = await import("@earendil-works/chord/context");
  const { Agent } = await import("../src/agent.js");
  const index = (await import("../src/generated/pico8-files.js")).default;
  const knowledge = createKnowledgeFiles({
    load: (file) => readFile(new URL(`../public/extensions/pico8/${index.version}/${file}`, import.meta.url), "utf8"),
  });
  const game = new EvaluationGame({ versions: [], draft: emptySnapshot() });
  const agent = new Agent(game, () => {}, { knowledge, flow: "shell", startP8: startNodeP8Worker, projectContext: () => "Cart test." });
  try {
    await agent.open();
    const resolved = await agent.root.agent(context);
    const names = resolved.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["bash", "edit", "edit_assets", "read", "read_assets", "write"]);
    assert.deepEqual(resolved.sections.map((s) => s.key), ["shell_prompt", "shell_skill", "pico8_host", "pico8_project"]);
    const r = await agent.shell.exec("p8 new skeleton && p8 check | tail -1");
    assert.match(r.stdout, /Maker: committed as version 1/);
  } finally {
    await agent.dispose();
    await game.dispose();
  }
});

test("shell environment: one route per bash command, existing carts keep their resources", async () => {
  const source = `function new_game() g={mode="play",x=64} end
function _init() new_game() end
function _update() if btn(0) then g.x-=1 end if btn(1) then g.x+=1 end end
function _draw() cls(1) circfill(g.x,64,4,8) end`;
  const committed = { ...emptySnapshot(), source };
  const game = new EvaluationGame({ versions: [committed], draft: committed });
  const worker = await startNodeP8Worker(skillFiles);
  try {
    const { exec } = await createShellEnvironment({ game, skillFiles, sendP8: worker.send });
    await exec("sed -i 's/cls(1)/cls(2)/' main.lua && p8 check > /dev/null");
    assert.equal(game.revision, 2);
    assert.deepEqual(assetSummary(game.snapshot.assets).sfx, [], "no sound bank in an existing cart");
    const before = game.playtests.runs.length;
    await exec('for n in 5 6 7 8; do p8 run --press "right*$n" > /dev/null; done');
    assert.equal(game.playtests.runs.length, before + 1, "a scan loop records only its last route");
    await exec('p8 run --press "right*8" > /dev/null');
    assert.equal(game.playtests.runs.length, before + 1, "the same press is not recorded twice on a revision");
    await exec('p8 run --press "left*3" > /dev/null');
    assert.equal(game.playtests.runs.length, before + 1, "after the first route, only routes that change g.mode are recorded");
  } finally {
    await worker.close();
    await game.dispose();
  }
});
