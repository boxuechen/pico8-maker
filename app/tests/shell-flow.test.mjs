// The agent environment: draft-backed shell, commits, route replay and the
// extension surface. No model requests.
import test from "node:test";
import assert from "node:assert/strict";
import skillFiles from "../src/generated/shell-skill.js";
import { emptySnapshot, assetSummary } from "../src/pico8/assets.js";
import { createShellEnvironment, routeCalls } from "../src/pico8/shell/environment.js";
import { createShellExtension } from "../src/pico8/shell/extension.js";
import { EvaluationGame } from "../scripts/evaluation/node-game.mjs";
import { startNodeP8Worker } from "../scripts/evaluation/p8-worker-node.mjs";

test("p8 press text becomes bounded press_buttons calls", () => {
  assert.deepEqual(routeCalls("right*30 x wait*5"), [{ steps: [{ frames: 30, buttons: 2 }, { frames: 1, buttons: 32 }, { frames: 5, buttons: 0 }] }]);
  const long = routeCalls("left*700");
  assert.deepEqual(long.map((c) => c.steps.map((s) => s.frames)), [[600], [100]]);
  const many = routeCalls(Array.from({ length: 10 }, () => "o").join(" "));
  assert.deepEqual(many.map((c) => c.steps.length), [8, 2]);
});

test("shell environment: draft-backed main.lua, commits, replayed routes, read-only skill", async () => {
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

test("shell extension: coding tools and startup sections", async () => {
  const game = new EvaluationGame({ versions: [], draft: emptySnapshot() });
  try {
    const ext = createShellExtension({ game, skillFiles });
    assert.deepEqual(ext.tools.map((t) => t.name), ["read", "write", "edit", "bash"]);
    for (const t of ext.tools) assert.doesNotMatch(t.description, /load_game/);
    assert.deepEqual(ext.sections.map((s) => s.key), ["shell_prompt", "shell_skill", "pico8_host"]);
    const text = await Promise.all(ext.sections.map((s) => s.render({}, {})));
    assert.match(text[0], /^You are a coding assistant running inside pi/);
    assert.doesNotMatch(text[0], /Pi documentation/);
    assert.match(text[1], /^<skill name="pico8" location="\/skill\/pico8\/SKILL.md">/);
    assert.match(text[2], /commits it/);
    assert.match(text[2], /gfx.txt \(sprite sheet\)/);
  } finally {
    await game.dispose();
  }
});

test("Agent offers the shell tools and startup sections", async () => {
  const { readFile } = await import("node:fs/promises");
  const { BACKGROUND_CONTEXT: context } = await import("@earendil-works/chord/context");
  const { Agent } = await import("../src/agent.js");
  const game = new EvaluationGame({ versions: [], draft: emptySnapshot() });
  const agent = new Agent(game, () => {}, { startP8: startNodeP8Worker, projectContext: () => "Cart test." });
  try {
    await agent.open();
    const resolved = await agent.root.agent(context);
    const names = resolved.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["bash", "edit", "read", "write"]);
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

test("a bash command records every run that enters a new g.mode, not only its last run", async () => {
  const source = `function new_game() g={mode="play",t=0} end
function _init() new_game() end
function _update() if g.mode=="play" then g.t+=1 if g.t>20 then g.mode="lose" end if btnp(4) then g.mode="win" end
 elseif btnp(5) then new_game() end end
function _draw() cls(1) print(g.mode,2,2,7) end`;
  const committed = { ...emptySnapshot(), source };
  const game = new EvaluationGame({ versions: [committed], draft: committed });
  const worker = await startNodeP8Worker(skillFiles);
  try {
    const { exec } = await createShellEnvironment({ game, skillFiles, sendP8: worker.send });
    const before = game.playtests.runs.length;
    // The model's real command: loss, loss then retry, then an idle run last.
    await exec('p8 run --press "wait*25" > /dev/null; p8 run --press "wait*25 x wait" > /dev/null; p8 run --press "wait*3" > /dev/null');
    const routes = game.playtests.runs.slice(before);
    assert.equal(routes.length, 2, "the loss and the retry are kept; the idle last run adds nothing");
    await exec('for n in 22 23 24 25 26; do p8 run --press "wait*$n" > /dev/null; done');
    assert.equal(game.playtests.runs.length, before + 2, "runs reaching a g.mode already recorded are not replayed again");
    await exec('p8 run --press "wait*2 o" > /dev/null; p8 run --press "wait*3" > /dev/null');
    assert.equal(game.playtests.runs.length, before + 3, "a win is new evidence");
  } finally {
    await worker.close();
    await game.dispose();
  }
});

test("p8 run --bot: a Lua bot finds presses to a result, replayed and recorded as normal play", async () => {
  const { catchBase } = await import("../scripts/evaluation/turn-cases.mjs");
  const committed = { ...emptySnapshot(), source: catchBase };
  const game = new EvaluationGame({ versions: [committed], draft: committed });
  const worker = await startNodeP8Worker(skillFiles);
  try {
    const { exec } = await createShellEnvironment({ game, skillFiles, sendP8: worker.send });
    const before = game.playtests.runs.length;
    const bot = `local t=nil for f in all(g.fruits) do if not t or f.y>t.y then t=f end end if t then if t.x<g.basket.x-1 then return 1 elseif t.x>g.basket.x+1 then return 2 end end`;
    const r = await exec(`p8 run --bot "${bot}" --until "g.mode=='win'" --frames 3600 --read g.mode,g.score`);
    assert.equal(r.exitCode, 0, r.stdout);
    assert.match(r.stdout, /bot played \d+ frames; --until became true/);
    assert.match(r.stdout, /presses \(replayed below with presses only, recorded as normal play\): (left|right|wait)/);
    assert.match(r.stdout, /g.mode "play"→"win"/);
    assert.match(r.stdout, /g.mode = "win"/);
    assert.equal(game.playtests.runs.length, before + 1, "the bot's presses are recorded as a normal route");
    assert.equal(game.playtests.runs.at(-1).purpose, "normal");
    // A bot that cheats by changing state proves nothing: the replay shows the real result.
    const cheat = await exec(`p8 run --bot "g.score=10" --until "g.mode=='win'" --read g.mode`);
    assert.match(cheat.stdout, /--until became true/);
    assert.doesNotMatch(cheat.stdout, /g.mode = "win"/);
    assert.match((await exec(`p8 run --bot "return 2" --setup "g.score=1"`)).stdout, /cannot be combined with --setup/);
    assert.match((await exec(`p8 run --bot "return (" --until "false"`)).stdout, /do not compile: .*returns the buttons/);
  } finally {
    await worker.close();
    await game.dispose();
  }
});

test("p8 --setup changes state without touching main.lua and is never recorded as a route", async () => {
  const source = `function new_game() g={mode="play",score=0} end
function _init() new_game() end
function _update() if btnp(5) then g.score+=1 end if g.score>=10 then g.mode="win" end end
function _draw() cls(1) print(g.score,2,2,7) end`;
  const committed = { ...emptySnapshot(), source };
  const game = new EvaluationGame({ versions: [committed], draft: committed });
  const worker = await startNodeP8Worker(skillFiles);
  try {
    const { exec } = await createShellEnvironment({ game, skillFiles, sendP8: worker.send });
    const before = game.playtests.runs.length;
    const r = await exec(`p8 run --setup "g.score=9" --press "x wait" --read g.mode,g.score`);
    assert.equal(r.exitCode, 0, r.stdout);
    assert.match(r.stdout, /setup ran \(main.lua unchanged/);
    assert.match(r.stdout, /g.mode "play"→"win"/);
    assert.match(r.stdout, /g.score = 10/);
    assert.match(r.stdout, /Maker: g.mode "win" reached only with --setup on version 1 .*without --setup, or for a long route p8 run --bot .*Otherwise list it under Unverified/);
    assert.equal(game.draft.source, source);
    assert.equal(game.revision, 1);
    assert.equal(game.playtests.runs.length, before, "setup runs are not replayed");
    const bad = await exec(`p8 look --setup "g.score=" --press wait`);
    assert.equal(bad.exitCode, 1);
    assert.match(bad.stdout, /setup failed: .*--setup runs Lua statements/);
    await exec(`p8 run --press "x"`);
    assert.equal(game.playtests.runs.length, before + 1, "a normal run is still recorded");
    // Once presses alone reach the result, a --setup run no longer warns.
    assert.doesNotMatch((await exec(`p8 run --press "${"x wait ".repeat(10).trim()}" --read g.mode`)).stdout, /reached only with --setup/);
    assert.doesNotMatch((await exec(`p8 run --setup "g.score=9" --press "x"`)).stdout, /reached only with --setup/);
  } finally {
    await worker.close();
    await game.dispose();
  }
});

test("one user request makes one version: later commits replace it and clear its routes", async () => {
  const src = (c) => `function new_game() g={mode="play",x=64} end
function _init() new_game() end
function _update() if btn(1) then g.x+=1 end end
function _draw() cls(${c}) circfill(g.x,64,3,8) end`;
  const v1 = { ...emptySnapshot(), source: src(1) };
  const game = new EvaluationGame({ versions: [v1], draft: v1 });
  const worker = await startNodeP8Worker(skillFiles);
  try {
    const { exec } = await createShellEnvironment({ game, skillFiles, sendP8: worker.send });
    game.beginRequest();
    await exec("sed -i 's/cls(1)/cls(2)/' main.lua && p8 run --press 'right*3' > /dev/null");
    assert.equal(game.revision, 2);
    assert.equal(game.playtests.runs.filter((r) => r.revision === 2 && r.calls.length).length, 1);
    const second = await exec("sed -i 's/cls(2)/cls(3)/' main.lua && p8 check | tail -1");
    assert.match(second.stdout, /Maker: committed as version 2; .*replaces this request's earlier version 2/);
    assert.equal(game.revision, 2);
    assert.equal(game.versions.length, 2, "v1 plus this request's single version");
    assert.match(game.snapshot.source, /cls\(3\)/);
    assert.equal(game.playtests.runs.filter((r) => r.revision === 2 && r.calls.length).length, 0, "routes on the replaced code are gone");
    await exec("p8 run --press 'right*3' > /dev/null");
    assert.equal(game.playtests.runs.filter((r) => r.revision === 2 && r.calls.length).length, 1, "the same press is recorded again on the new code");
    game.endRequest();
    game.beginRequest();
    await exec("sed -i 's/cls(3)/cls(4)/' main.lua && p8 check > /dev/null");
    assert.equal(game.revision, 3, "the next request makes a new version");
    await game.undo();
    assert.match(game.snapshot.source, /cls\(3\)/, "undo steps back one request");
  } finally {
    await worker.close();
    await game.dispose();
  }
});

test("resource files in /cart follow the draft, commit with main.lua and keep a malformed edit for p8 to report", async () => {
  const source = `function _update() if btn(1) then x=(x or 0)+1 end end
function _draw() cls(1) spr(1,60,60) end`;
  const committed = { ...emptySnapshot(), source };
  const game = new EvaluationGame({ versions: [committed], draft: committed });
  const worker = await startNodeP8Worker(skillFiles);
  try {
    const { exec, env } = await createShellEnvironment({ game, skillFiles, sendP8: worker.send });
    const ls = await exec("ls");
    assert.match(ls.stdout, /gfx.txt[\s\S]*main.lua[\s\S]*sfx.txt/);
    assert.deepEqual(assetSummary(game.draft.assets).sfx, [], "an existing cart gets no sound bank");
    // Sprite 1 (x 8-15, y 0-7) becomes solid yellow.
    await exec("sed -i '1,8s/^\\(.\\{8\\}\\).\\{8\\}/\\1aaaaaaaa/' gfx.txt");
    assert.deepEqual(assetSummary(game.draft.assets).sprites, [1]);
    const look = await exec("p8 look --crop 60,60,8,8 | sed -n 3p");
    assert.match(look.stdout, /^aaaaaaaa$/m);
    assert.equal(game.revision, 2, "the resource change committed with main.lua");
    assert.deepEqual(assetSummary(game.snapshot.assets).sprites, [1]);
    await env.writeFile("/cart/map.txt", "oops\n");
    const bad = await exec("p8 check");
    assert.equal(bad.exitCode, 2);
    assert.match(bad.stdout, /map.txt has 1 lines; it needs exactly 32/);
    assert.equal((await env.readTextFile("/cart/map.txt")).value, "oops\n", "the malformed file is not overwritten");
    await exec("rm map.txt");
    assert.match((await exec("ls")).stdout, /map.txt/, "a deleted resource file comes back from the draft");
    assert.match((await exec("p8 sfx 0")).stdout, /sfx 0: .*silent/);
    const sheet = await exec("p8 sheet --png /tmp/sheet.png");
    assert.match(sheet.stdout, /wrote \/tmp\/sheet.png \(512x512/);
  } finally {
    await worker.close();
    await game.dispose();
  }
});

test("text-only models: host rules say so and tool images become text notes", async () => {
  const game = new EvaluationGame({ versions: [], draft: emptySnapshot() });
  try {
    let vision = true;
    const ext = createShellExtension({ game, skillFiles, vision: () => vision });
    const host = ext.sections.find((s) => s.key === "pico8_host");
    assert.doesNotMatch(await host.render({}, {}), /cannot see images/);
    vision = false;
    assert.match(await host.render({}, {}), /This model cannot see images/);
    const before = ext.hooks[0].hooks?.beforeRequest ?? ext.hooks[0].beforeRequest ?? Object.values(ext.hooks[0]).find((v) => v?.beforeRequest)?.beforeRequest;
    const messages = [
      { role: "user", content: "go" },
      { role: "toolResult", toolCallId: "a", content: [{ type: "text", text: "png" }, { type: "image", mimeType: "image/png", data: "x" }] },
    ];
    const out = await before({ messages }, {}, {});
    assert.equal(JSON.stringify(out.messages).includes('"image"'), false);
    assert.match(JSON.stringify(out.messages), /reads text only/);
  } finally {
    await game.dispose();
  }
});
