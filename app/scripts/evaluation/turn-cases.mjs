// Multi-turn evaluation cases (run-turns.mjs).
//
// `edits`: follow-up requests on a known, deterministic base game. After every
// turn the final cart is scored with hidden checks.json cases: that turn's
// request plus every earlier one and the base rules (regressions). The checks
// only use names the base game already has (g.score, g.lives, g.basket,
// g.fruits, g.mode), since the skill asks to keep existing names. Every turn
// has a reference solution (tests/turn-cases.test.mjs): its checks pass on the
// reference and fail on the previous turn's reference (`guard` cases may also
// pass there: they catch a wrong change, not a missing one).
//
// `assets`: the same base game, then requests that need resource files or a
// structural change (sprites, music and distinct sounds, a second level that
// changes the win rule). Scored by functions (`score`) that look at the screen,
// the audio events and the resources, plus the base rules still in force.
//
// `vague`: one-line requests for a new game plus one follow-up, the way users
// ask. Scored generically (lint/boot/input, faults, result replay of the
// Agent's normal routes); screenshots are kept for review.

import { assetSummary } from "../../src/pico8/assets.js";
import { Runtime } from "../../src/pico8/shell/runtime.js";

export const catchBase = `-- fruit catch
function new_game()
 g={mode="play",score=0,lives=3,tick=0,
  basket={x=64,y=116},fruits={}}
end

function _init() new_game() end

local drops={32,96,64,48,80,24,104,56,72,40}

function update_play()
 g.tick+=1
 if btn(0) then g.basket.x-=2 end
 if btn(1) then g.basket.x+=2 end
 g.basket.x=mid(8,g.basket.x,120)
 if g.tick%30==0 then
  add(g.fruits,{x=drops[(g.tick\\30-1)%#drops+1],y=0})
 end
 for f in all(g.fruits) do
  f.y+=1
  if f.y>=112 and f.y<=118 and abs(f.x-g.basket.x)<10 then
   del(g.fruits,f)
   g.score+=1
   sfx(0)
  elseif f.y>128 then
   del(g.fruits,f)
   g.lives-=1
  end
 end
 if g.score>=10 then g.mode="win" sfx(1)
 elseif g.lives<=0 then g.mode="lose" sfx(2) end
end

function _update()
 if g.mode=="play" then update_play()
 elseif btnp(5) then new_game() end
end

function _draw()
 cls(1)
 rectfill(g.basket.x-8,g.basket.y-4,g.basket.x+7,g.basket.y+3,4)
 for f in all(g.fruits) do circfill(f.x,f.y,3,8) end
 print("score "..g.score,2,2,7)
 print("lives "..g.lives,90,2,7)
 if g.mode=="win" then
  rectfill(0,56,127,72,11) print("you win! x to retry",26,62,0)
 elseif g.mode=="lose" then
  rectfill(0,56,127,72,8) print("game over x to retry",24,62,7)
 end
end
`;

// The base game's own checks.json, as the Agent would have left it: the
// scripted suites start with it. Turn 3 of `assets` changes the win rule, so
// "10 points win" must be updated (not deleted) for the Agent's checks to pass.
export const catchChecks = JSON.stringify(
  {
    cases: [
      { name: "right moves 2px", press: "right*5", expect: [{ path: "g.basket.x", equals: 74 }] },
      { name: "catching scores", setup: "g.fruits={{x=64,y=108}}", press: "wait*12", expect: [{ path: "g.score", equals: 1 }] },
      { name: "last life lost loses", setup: "g.lives=1 g.fruits={{x=10,y=120}}", press: "wait*12", expect: [{ path: "g.mode", equals: "lose" }] },
      { name: "10 points win", setup: "g.score=9 g.fruits={{x=64,y=108}}", press: "wait*12", expect: [{ path: "g.mode", equals: "win" }] },
      { name: "x restarts", setup: "g.mode='lose' g.lives=0", press: "x wait", expect: [{ path: "g.mode", equals: "play" }, { path: "g.lives", equals: 3 }] },
    ],
  },
  null,
  1,
);

/**
 * The Agent's own checks.json after a turn: it must pass, keep at least as many
 * cases as it started with, and keep every starting case (by name, or renamed
 * with the same presses and all its expectations) except those whose rule the
 * request changed (`changed`).
 */
export async function ownChecks(snapshot, files, checkSource, changed = []) {
  const text = files?.["checks.json"];
  if (!text) return [{ name: "own: checks.json kept", pass: false, detail: "checks.json was deleted" }];
  let cases;
  try {
    cases = JSON.parse(text).cases ?? [];
  } catch (e) {
    return [{ name: "own: checks.json kept", pass: false, detail: `not JSON: ${e.message}` }];
  }
  // A starting case is kept under its name, or as a case with the same presses that still has
  // every one of its expectations (renamed and strengthened, such as a restart that now also resets a level).
  const names = new Set(cases.map((c) => c.name));
  const same = (a, b) => (a.press ?? "") === (b.press ?? "") && (a.expect ?? []).every((e) => (b.expect ?? []).some((f) => JSON.stringify(f) === JSON.stringify(e)));
  const start = JSON.parse(catchChecks).cases;
  const missing = start.filter((c) => !names.has(c.name) && !changed.includes(c.name) && !cases.some((d) => same(c, d))).map((c) => c.name);
  if (cases.length < start.length) missing.push(`${start.length - cases.length} case(s) in total`);
  const failed = (await checkSource(snapshot.source, cases, { assets: snapshot.assets })).filter((i) => !i.pass);
  return [
    { name: "own: starting cases kept", pass: !missing.length, detail: missing.length ? `missing ${missing.join(", ")}` : `${cases.length} cases` },
    { name: "own: checks.json passes", pass: !failed.length, detail: failed.map((i) => `${i.name}: ${i.detail}`).join("; ").slice(0, 300) || "all pass" },
  ];
}

// Base rules: hold on the base game and after every turn (speed-independent).
const base = [
  { name: "base: right moves 2px", press: "right*5", expect: [{ path: "g.basket.x", equals: 74 }] },
  { name: "base: basket stays in 8..120", press: "left*60", expect: [{ path: "g.basket.x", equals: 8 }, { path: "g.basket.x", atLeast: 8, always: true }] },
  { name: "base: catching scores", setup: "g.fruits={{x=64,y=108}}", press: "wait*12", expect: [{ path: "g.score", atLeast: 1 }, { path: "g.lives", equals: 3 }] },
  { name: "base: a miss costs a life", setup: "g.fruits={{x=10,y=120}}", press: "wait*12", expect: [{ path: "g.lives", equals: 2 }, { path: "g.score", equals: 0 }] },
  { name: "base: last life lost loses", setup: "g.lives=1 g.fruits={{x=10,y=120}}", press: "wait*12", expect: [{ path: "g.mode", equals: "lose" }] },
  { name: "base: 10 points win", setup: "g.score=9 g.fruits={{x=64,y=108}}", press: "wait*12", expect: [{ path: "g.mode", equals: "win" }] },
  { name: "base: x restarts after a result", setup: "g.mode='lose' g.score=5 g.lives=0", press: "x wait", expect: [{ path: "g.mode", equals: "play" }, { path: "g.score", equals: 0 }, { path: "g.lives", equals: 3 }, { path: "#g.fruits", equals: 0 }] },
];

// Turn checks. Three fruits 12px apart at the basket are caught one after another.
const combo = [
  { name: "t1: consecutive catches score 1+2+3", setup: "g.fruits={{x=64,y=108},{x=64,y=96},{x=64,y=84}}", press: "wait*40", expect: [{ path: "g.score", equals: 6 }] },
  { name: "t1: a miss resets the streak", guard: true, setup: "g.fruits={{x=64,y=108},{x=10,y=114},{x=64,y=90}}", press: "wait*40", expect: [{ path: "g.score", equals: 2 }, { path: "g.lives", equals: 2 }] },
];
const speed = [
  { name: "t2: fruit falls 2px per frame", setup: "g.fruits={{x=20,y=40}}", press: "wait*5", expect: [{ path: "g.fruits.1.y", equals: 50 }] },
  { name: "t2: basket speed unchanged", guard: true, press: "right*5", expect: [{ path: "g.basket.x", equals: 74 }] },
];
const colours = [
  { name: "t3: basket blue", press: "left*20 right*30", expect: [{ pixel: ["g.basket.x", "g.basket.y"], equals: 12, always: true }] },
  { name: "t3: fruit orange", setup: "g.fruits={{x=30,y=50}}", press: "wait*3", expect: [{ each: "g.fruits", pixel: ["x", "y"], equals: 9, always: true }] },
];
const pause = [
  { name: "t4: x pauses the fall", setup: "g.fruits={{x=20,y=40}}", press: "x wait*10", expect: [{ path: "g.fruits.1.y", atMost: 42 }, { path: "g.lives", equals: 3 }] },
  { name: "t4: x again resumes", guard: true, setup: "g.fruits={{x=20,y=40}}", press: "x wait*10 x wait*10", expect: [{ path: "g.fruits.1.y", atLeast: 56 }] },
  { name: "t4: basket frozen while paused", press: "x right*10", expect: [{ path: "g.basket.x", atMost: 66 }] },
];

export const editTurns = [
  { prompt: "加个连击：连续接住水果时，第 n 个连续接住的得 n 分（第一个 1 分、第二个 2 分……），漏接一个就从头算；在右上角显示当前连击数。其他规则不变。", checks: [...base, ...combo] },
  { prompt: "水果下落太慢了，改成原来的两倍速度，篮子速度不变。", checks: [...base, ...combo, ...speed] },
  { prompt: "篮子换成蓝色（12 号色），水果换成橙色（9 号色）。", checks: [...base, ...combo, ...speed, ...colours] },
  { prompt: "加一个暂停：游戏进行中按 X 暂停、再按 X 继续，暂停时屏幕中间显示 PAUSED，水果和篮子都不动。胜负画面上按 X 还是重新开始。", checks: [...base, ...combo, ...speed, ...colours, ...pause] },
];

const item = (name, pass, detail, guard = false) => ({ name, pass: !!pass, detail, ...(guard ? { guard } : {}) });
/** Fresh session of a snapshot; `fn(rt)` runs inside it. */
async function within(snapshot, fn) {
  const rt = new Runtime(snapshot.assets);
  try {
    const loaded = await rt.load(snapshot.source);
    if (!loaded.ok) return null;
    return await fn(rt, loaded);
  } finally {
    await rt.dispose();
  }
}
const colourSet = (rt, x0, y0, w, h) => {
  const set = new Set();
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set.add(rt.pixel(x, y));
  set.delete(null);
  return set;
};
const sfxIds = (events) => [...new Set(events.filter((e) => "sfx" in e).map((e) => e.sfx))].sort((a, b) => a - b);

async function spriteScore(snapshot) {
  const sum = assetSummary(snapshot.assets);
  const items = [
    item("a1: sprites drawn in gfx.txt", sum.sprites.length >= 2, `${sum.sprites.length} non-empty sprites`),
    item("a1: the code draws sprites", /\b(spr|sspr)\s*\(/.test(snapshot.source), "spr()/sspr() call in main.lua"),
  ];
  const seen = await within(snapshot, async (rt) => {
    await rt.setup("g.fruits={{x=40,y=60}}");
    await rt.advance(0, 1);
    const bg = rt.pixel(100, 90);
    const fruit = colourSet(rt, 32, 52, 17, 17);
    const basket = colourSet(rt, 52, 106, 25, 20);
    basket.delete(bg);
    return { fruit: [...fruit], basket: [...basket], frame: rt.frame.rgba };
  });
  if (!seen) return { items: [...items, item("a1: boots", false, "does not boot")] };
  items.push(item("a1: fruit is a red apple with a green leaf", seen.fruit.includes(8) && (seen.fruit.includes(3) || seen.fruit.includes(11)), `colours ${seen.fruit.join(",")} around (40,60)`));
  items.push(item("a1: basket has detail (2+ colours besides the background)", seen.basket.length >= 2, `colours ${seen.basket.join(",")}`));
  return { items, frames: { sprites: seen.frame } };
}

async function audioScore(snapshot) {
  const sum = assetSummary(snapshot.assets);
  const items = [item("a2: music authored in music.txt", sum.music.length >= 1, `patterns ${sum.music.join(",") || "none"}`)];
  const music = await within(snapshot, async (rt, loaded) => {
    const r = await rt.advance(0, 60);
    return [...(loaded.audio ?? []), ...r.audio].some((e) => "music" in e && e.music >= 0);
  });
  items.push(item("a2: music starts within 2 s", music, music ? "music event" : "no music event in the first 60 frames"));
  const run = (setup) =>
    within(snapshot, async (rt) => {
      await rt.setup(setup);
      return sfxIds((await rt.advance(0, 14)).audio);
    });
  const caught = (await run("g.fruits={{x=64,y=108}}")) ?? [],
    missed = (await run("g.fruits={{x=10,y=120}}")) ?? [];
  items.push(
    item("a2: catch and miss play different sounds", caught.length && missed.length && caught.join() !== missed.join(), `catch sfx ${caught.join(",") || "none"}, miss sfx ${missed.join(",") || "none"}`),
  );
  return { items };
}

async function levelScore(snapshot) {
  const r = await within(snapshot, async (rt) => {
    const out = [];
    const read = async (...p) => rt.read(p);
    await rt.setup("g.score=9 g.fruits={{x=64,y=108}}");
    await rt.advance(0, 12);
    const at10 = await read("g.mode", "g.score");
    out.push(item("a3: 10 points no longer win", at10["g.mode"] === "play" && at10["g.score"] === 10, `g.mode=${at10["g.mode"]} g.score=${at10["g.score"]}`));
    // A fruit the game spawns itself (it may carry the game's own speed field).
    await rt.setup("g.fruits={}");
    let spawned = null;
    for (let i = 0; i < 90 && !spawned; i++) {
      await rt.advance(0, 1);
      const list = (await read("g.fruits"))["g.fruits"];
      const first = list && Object.values(list)[0];
      if (first && typeof first.y === "number") spawned = first;
    }
    await rt.advance(0, 5);
    const later = (await read("g.fruits.1.y"))["g.fruits.1.y"];
    const fell = spawned && typeof later === "number" ? later - spawned.y : null;
    out.push(item("a3: level 2 fruit falls 2px per frame", fell === 10, spawned ? `a spawned item fell ${fell} px in 5 frames` : "no item spawned within 90 frames"));
    await rt.advance(0, 90);
    const frame = rt.frame.rgba;
    await rt.setup("g.mode='play' g.score=19 g.lives=3 g.fruits={{x=64,y=108}}");
    await rt.advance(0, 12);
    const at20 = (await read("g.mode"))["g.mode"];
    out.push(item("a3: 20 points win", at20 === "win", `g.mode=${at20}`, true));
    return { items: out, frames: { level2: frame } };
  });
  return r ?? { items: [item("a3: boots", false, "does not boot")] };
}

const rulesExceptWin = base.filter((c) => c.name !== "base: 10 points win");
export const assetTurns = [
  { prompt: "把篮子和水果画成像素精灵：水果像红苹果、带一片绿叶，篮子像编织篮。不要再用纯色圆和矩形，其他规则不变。", checks: base, score: spriteScore },
  { prompt: "加一段轻快的背景音乐，开局就循环播放；接住水果和漏接要用不同的音效。", checks: base, score: audioScore },
  { changes: ["10 points win"], prompt: "加第二关：得到 10 分后不再直接胜利，而是进入第二关，屏幕中间显示 LEVEL 2 两秒（游戏不暂停）。第二关水果下落速度翻倍，并开始掉落炸弹，接到炸弹扣一条命；总分到 20 才胜利。", checks: rulesExceptWin, score: levelScore },
];

export const vagueCases = {
  snake: ["做个贪吃蛇", "吃到食物时加个音效，蛇越长走得越快"],
  meteor: ["做一个躲避下落陨石的小游戏，越玩越难", "加一个护盾道具，吃到后能挡一次陨石"],
  paint: ["做一个用方向键画画的小玩具，按 O 换颜色", "再加一个按 X 清空画布"],
};
