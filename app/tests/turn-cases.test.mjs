// The edit-turn checks are trustworthy only if each turn's checks pass on a
// reference solution and the new checks fail on the previous turn's cart.
import test from "node:test";
import assert from "node:assert/strict";
import { createPico8Session } from "../public/player/main/player.mjs";
import { setSessionFactory } from "../src/pico8/shell/runtime.js";
import { checkSource } from "../src/pico8/shell/checks.js";
import { catchBase, editTurns, assetTurns } from "../scripts/evaluation/turn-cases.mjs";
import { emptySnapshot } from "../src/pico8/assets.js";
import { withSoundBank } from "../src/pico8/shell/sounds.js";
import { assetFiles, applyResourceFiles } from "../src/pico8/shell/resource-files.js";

setSessionFactory(createPico8Session);

const swap = (src, pairs) =>
  pairs.reduce((s, [a, b]) => {
    assert.ok(s.includes(a), `reference edit: ${a}`);
    return s.replace(a, b);
  }, src);

// Reference solutions, each built on the previous one.
const t1 = swap(catchBase, [
  ["basket={x=64,y=116},fruits={}}", "basket={x=64,y=116},fruits={},combo=0}"],
  ["   g.score+=1", "   g.combo+=1\n   g.score+=g.combo"],
  ["   g.lives-=1", "   g.lives-=1\n   g.combo=0"],
  [' print("lives "..g.lives,90,2,7)', ' print("lives "..g.lives,90,2,7)\n print("x"..g.combo,110,10,10)'],
]);
const t2 = swap(t1, [["  f.y+=1", "  f.y+=2"]]);
const t3 = swap(t2, [
  ["g.basket.y+3,4)", "g.basket.y+3,12)"],
  ["circfill(f.x,f.y,3,8)", "circfill(f.x,f.y,3,9)"],
]);
const t4 = swap(t3, [
  ["fruits={},combo=0}", "fruits={},combo=0,paused=false}"],
  [' if g.mode=="play" then update_play()', ' if g.mode=="play" then\n  if btnp(5) then g.paused=not g.paused end\n  if not g.paused then update_play() end'],
  [' if g.mode=="win" then', ' if g.paused then print("paused",52,62,7) end\n if g.mode=="win" then'],
]);
const refs = [t1, t2, t3, t4];

const failing = async (src, checks) => (await checkSource(src, checks)).filter((i) => !i.pass);

test("base game passes the base rules", async () => {
  assert.deepEqual(await failing(catchBase, editTurns[0].checks.filter((c) => c.name.startsWith("base:"))), []);
});

for (const [i, turn] of editTurns.entries()) {
  test(`edit turn ${i + 1}: reference passes every check; the previous cart fails the new ones`, async () => {
    assert.deepEqual(await failing(refs[i], turn.checks), [], "reference");
    const prev = i ? refs[i - 1] : catchBase;
    const fresh = turn.checks.filter((c) => c.name.startsWith(`t${i + 1}:`));
    const prevFails = (await failing(prev, fresh)).map((f) => f.name).filter((n) => !fresh.find((c) => c.name === n).guard);
    // Guards hold on the old behaviour too (t2: basket speed unchanged).
    const expected = fresh.filter((c) => !c.guard).map((c) => c.name);
    assert.deepEqual(prevFails, expected, "previous cart");
  });
}

test("guards catch wrong changes: a streak that never resets, a pause that never resumes", async () => {
  const noReset = swap(t1, [["   g.lives-=1\n   g.combo=0", "   g.lives-=1"]]);
  assert.deepEqual((await failing(noReset, editTurns[0].checks)).map((f) => f.name), ["t1: a miss resets the streak"]);
  const stuck = swap(t4, [["then g.paused=not g.paused end", "then g.paused=true end"]]);
  assert.deepEqual((await failing(stuck, editTurns[3].checks)).map((f) => f.name), ["t4: x again resumes"]);
});

// Assets suite: reference carts for sprites, audio and a second level.
const bank = withSoundBank(emptySnapshot().assets);
const baseSnap = { ...emptySnapshot(), source: catchBase, assets: bank };
function withFiles(assets, edit) {
  const files = assetFiles(assets);
  const next = Object.fromEntries(Object.entries(edit(files)).map(([k, v]) => [k, v]));
  const r = applyResourceFiles(assets, next);
  assert.deepEqual(r.errors, []);
  return r.assets;
}
// Sprite 0: red apple with a green leaf; sprites 1-2: a 16x8 brown/orange basket.
const apple = ["000bb000", "00b88000", "08888880", "88888888", "88888788", "88888888", "08888880", "00888800"];
const basket = ["4949494949494949", "9494949494949494", "4949494949494949", "0494949494949490", "0049494949494900", "0004949494949000", "0000444444440000", "0000000000000000"];
const sprites = withFiles(bank, (f) => {
  const rows = f["gfx.txt"].trimEnd().split("\n");
  for (let y = 0; y < 8; y++) rows[y] = apple[y] + basket[y] + rows[y].slice(24);
  return { "gfx.txt": rows.join("\n") + "\n" };
});
const a1 = {
  source: swap(catchBase, [
    ["rectfill(g.basket.x-8,g.basket.y-4,g.basket.x+7,g.basket.y+3,4)", "spr(1,g.basket.x-8,g.basket.y-4,2,1)"],
    ["circfill(f.x,f.y,3,8)", "spr(0,f.x-4,f.y-4)"],
  ]),
  assets: sprites,
};
const a2 = {
  source: swap(a1.source, [
    ["function _init() new_game() end", "function _init() new_game() music(0) end"],
    ["   g.lives-=1", "   g.lives-=1\n   sfx(3)"],
  ]),
  assets: withFiles(sprites, (f) => {
    const rows = f["music.txt"].trimEnd().split("\n");
    rows[0] = "01 05414243";
    rows[1] = "02 06414243";
    return { "music.txt": rows.join("\n") + "\n" };
  }),
};
const a3 = {
  source: swap(a2.source, [
    ["  f.y+=1", "  f.y+=g.score>=10 and 2 or 1"],
    ["if g.score>=10 then", "if g.score>=20 then"],
  ]),
  assets: a2.assets,
};
const assetRefs = [a1, a2, a3];

for (const [i, turn] of assetTurns.entries()) {
  test(`asset turn ${i + 1}: reference passes; the previous cart fails the new scores`, async () => {
    const ref = assetRefs[i];
    assert.deepEqual(await failing(ref.source, turn.checks), [], "rules on the reference");
    const mine = await turn.score(ref);
    assert.deepEqual(mine.items.filter((x) => !x.pass), [], "reference score");
    const prev = await turn.score(i ? assetRefs[i - 1] : baseSnap);
    assert.deepEqual(prev.items.filter((x) => x.pass && !x.guard).map((x) => x.name), [], "previous cart passes none of the new scores");
  });
}
