import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { checkSource, loadCasesText, parsePress, scoreSource, SKILL_DIR } from "../src/maker.mjs";

const scoreCart = (main, checks) => scoreSource(readFileSync(main, "utf8"), loadCasesText(readFileSync(checks, "utf8")));

const lab = new URL("..", import.meta.url).pathname;

test("press strings parse into button steps", () => {
  assert.deepEqual(parsePress("right*30 left+o*2 wait*5 x").map(({ bits, frames }) => [bits, frames]), [[2, 30], [17, 2], [0, 5], [32, 1]]);
  assert.throws(() => parsePress("jump*3"), /unknown button "jump"/);
});

test("lint and runtime failures name the line and the fix", async () => {
  const lintFail = await checkSource("function _update() x=math.abs(-1) end function _draw() cls() end");
  assert.match(lintFail[0].detail, /line 1: math.abs does not exist; use abs/);
  const fault = await checkSource('function _init() g={mode="play"} end function _update() foo() end function _draw() cls(1) print("a",1,1,7) end');
  assert.match(fault.at(-1).detail, /foo is not defined/);
});

for (const t of ["T1", "T2", "T3", "T4", "T5"])
  test(`${t}: the start cart fails hidden checks and the reference solution passes`, async () => {
    assert.equal((await scoreCart(join(lab, `tasks/${t}/start/main.lua`), join(lab, `tasks/${t}/hidden.json`))).pass, false);
    const r = await scoreCart(join(lab, `tests/fixtures/${t}-solution.lua`), join(lab, `tasks/${t}/hidden.json`));
    assert.equal(r.pass, true, r.detail);
  });

test("p8 check reads checks.json and sets the exit code", () => {
  const dir = mkdtempSync(join(tmpdir(), "p8-"));
  copyFileSync(join(lab, "tasks/T2/start/main.lua"), join(dir, "main.lua"));
  copyFileSync(join(lab, "tasks/T2/start/checks.json"), join(dir, "checks.json"));
  let out = "", code = 0;
  try { out = execFileSync(join(lab, "bin/p8"), ["check"], { cwd: dir, encoding: "utf8" }); } catch (e) { out = e.stdout; code = e.status; }
  assert.equal(code, 1);
  assert.match(out, /FAIL second bullet within 20 frames is ignored: g.player.hp is 1, expected 2\n1 FAILED/);
  copyFileSync(join(lab, "tests/fixtures/T2-solution.lua"), join(dir, "main.lua"));
  assert.match(execFileSync(join(lab, "bin/p8"), ["check"], { cwd: dir, encoding: "utf8" }), /ALL PASSED$/m);
  writeFileSync(join(dir, "main.lua"), "");
  try { execFileSync(join(lab, "bin/p8"), ["check"], { cwd: dir, encoding: "utf8" }); } catch (e) { out = e.stdout; }
  assert.match(out, /is empty.*p8 new skeleton/);
});

test("faults quote the code and name common slips", async () => {
  const game = (update) => `function new_game() g={mode="play",lives=3,player={x=1}} end
function _init() new_game() end
function _update() ${update} end
function _draw() cls(1) print("a",1,1,7) end`;
  const boot = async (update) => (await checkSource(game(update))).find((i) => i.name === "boot").detail;
  assert.match(await boot("lives-=1"), /lives is not a global; this game keeps it in g, so write g.lives[\s\S]*code: function _update\(\) lives-=1 end/);
  assert.match(await boot("if g.g.lives<0 then end"), /g\.g somewhere/);
  assert.match(await boot("g.player.inv-=1"), /field inv has no starting value/);
});

test("the agent environment: p8 in the shell, unchanged re-checks, isolation from the host", async () => {
  const { createEnvironment } = await import("../src/env.mjs");
  const env = createEnvironment({
    cartFiles: { "main.lua": readFileSync(join(lab, "tasks/T2/start/main.lua"), "utf8"), "checks.json": readFileSync(join(lab, "tasks/T2/start/checks.json"), "utf8") },
    skillFiles: { "SKILL.md": "skill" },
  });
  const sh = async (c) => { const r = await env.exec(c); return { code: r.exitCode, out: r.stdout + r.stderr }; };
  assert.match((await sh("p8 check")).out, /1 FAILED/);
  assert.match((await sh("p8 check")).out, /^NOTE: main.lua has not changed/);
  assert.equal((await sh('sed -i "s/g.player.inv=0 del/g.player.inv=20 del/" main.lua && p8 check')).code, 0);
  assert.match((await sh("echo x > /skill/pico8/x.txt")).out, /EROFS: \/skill\/pico8 is read-only/);
  assert.match((await sh(`cat ${join(lab, "package.json")}`)).out, /No such file or directory/);
  assert.match((await sh("p8 look --png s.png")).out, /wrote s.png \(512x512/);
  assert.deepEqual([...(await env.fs.readFileBuffer("/cart/s.png")).slice(1, 4)], [80, 78, 71]);
});

test("p8 in a worker thread prints exactly what in-process p8 prints and writes back its files", async () => {
  const { createEnvironment } = await import("../src/env.mjs");
  const { remoteP8 } = await import("../src/maker.mjs");
  const { startP8Worker } = await import("../src/p8-worker-node.mjs");
  const skillFiles = { "SKILL.md": "skill", "templates/skeleton.lua": readFileSync(join(SKILL_DIR, "templates/skeleton.lua"), "utf8") };
  const cartFiles = { "main.lua": readFileSync(join(lab, "tasks/T2/start/main.lua"), "utf8"), "checks.json": readFileSync(join(lab, "tasks/T2/start/checks.json"), "utf8") };
  const worker = await startP8Worker(skillFiles);
  const plays = [];
  try {
    const inline = createEnvironment({ cartFiles, skillFiles });
    const remote = createEnvironment({ cartFiles, skillFiles, p8: remoteP8(worker.send, { onPlay: (p) => plays.push(p) }) });
    const script = ["p8 check", "p8 check", "p8 run --press 'right*20 x' --read g.score", "p8 look --png shots/a.png | head -3", "p8 look --png /tmp/b.png | tail -1", "rm main.lua && touch main.lua && p8 new skeleton && p8 check", "p8 bogus"];
    for (const command of script) {
      const [a, b] = [await inline.exec(command), await remote.exec(command)];
      assert.equal(b.stdout, a.stdout, command);
      assert.equal(b.exitCode, a.exitCode, command);
    }
    for (const path of ["/cart/shots/a.png", "/tmp/b.png", "/cart/main.lua"])
      assert.deepEqual(await remote.fs.readFileBuffer(path), await inline.fs.readFileBuffer(path), path);
    assert.deepEqual(plays.map((p) => [p.command, p.ok, p.frame?.rgba.length]), [["run", true, 65536], ["look", true, 65536], ["look", true, 65536]]);
  } finally {
    await worker.close();
  }
});

test("g and g.mode are optional: toys and plain-global carts pass boot and input", async () => {
  const plain = "x=64\nfunction _update() if btn(1) then x+=1 end end\nfunction _draw() cls(1) circfill(x,64,3,8) end";
  const noMode = "function _init() g={x=64} end\nfunction _update() if btn(0) then g.x-=1 end end\nfunction _draw() cls(1) pset(g.x,64,7) end";
  for (const [src, note] of [[plain, /no global g/], [noMode, /no g.mode/]]) {
    const items = await checkSource(src);
    assert.ok(items.every((i) => i.pass), JSON.stringify(items));
    assert.match(items.find((i) => i.name === "boot").detail, note);
  }
  const still = await checkSource("function _update() end\nfunction _draw() cls(1) end");
  assert.ok(still.some((i) => !i.pass), "a one-colour screen still fails: " + JSON.stringify(still));
});
