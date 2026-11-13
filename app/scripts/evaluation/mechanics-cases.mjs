import { emptySnapshot, editAssets } from "../../src/pico8/assets.js";

// Small, deliberately broken games. Keep these fixtures and their independent
// pixel checks outside published agent knowledge. No debug hooks in game code.
export const jumpSource = `function _init() x=20 y=88 vy=0 end
function _update()
 if btn(0) then x=max(0,x-1) end
 if btn(1) then x=min(120,x+1) end
 if btnp(4) then vy=-4 end
 vy+=0.5 y+=vy
 if y>=88 then y=88 vy=0 end
end
function _draw()
 cls(0)
 print("JUMP FIXTURE",2,2,7)
 print("ARROWS MOVE O JUMP",2,10,7)
 rectfill(0,96,127,127,5)
 rectfill(x,y,x+7,y+7,11)
end`;

export const enemySource = `function _init() x=8 hp=3 inv=0 mode="play" end
function _update()
 if mode!="play" then
  if btnp(4) then _init() end
  return
 end
 inv=max(0,inv-1)
 if btn(0) then x=max(0,x-1) end
 if btn(1) then x=min(120,x+1) end
 if abs(x-48)<8 and inv<=0 then hp-=1 inv=0 end
 if hp<=0 then mode="lose"
 elseif x>=104 then mode="win" end
end
function _draw()
 cls(0)
 print("ENEMY FIXTURE",2,2,7)
 print("ARROWS MOVE O RETRY",2,10,7)
 for i=1,hp do rectfill(i*8,20,i*8+4,24,8) end
 rectfill(48,80,55,87,8)
 rectfill(104,72,105,87,10)
 rectfill(x,80,x+7,87,11)
 if mode!="play" then
  rectfill(0,110,127,127,mode=="win" and 11 or 8)
  print(mode.." O RETRY",24,116,0)
 end
end`;

export const mapSource = `function _init()
 x=1 y=1 score=0 mode="play"
 for j=0,7 do for i=0,7 do mset(i,j,0) end end
 mset(2,1,1) mset(1,2,2) mset(3,2,2)
end
function move(dx,dy)
 local nx=x+dx local ny=y+dy
 if nx<0 or nx>7 or ny<0 or ny>7 then return end
 if true then x=nx y=ny end
 if mget(x,y)==2 then score+=1 end
 if score>=2 then mode="win" end
end
function _update()
 if mode!="play" then
  if btnp(4) then _init() end
  return
 end
 if btnp(0) then move(-1,0) end
 if btnp(1) then move(1,0) end
 if btnp(2) then move(0,-1) end
 if btnp(3) then move(0,1) end
end
function _draw()
 cls(0)
 print("MAP FIXTURE",2,2,7)
 print("ARROWS MOVE O RETRY",2,10,7)
 for i=1,score do rectfill(i*8,20,i*8+4,24,10) end
 map(0,0,0,32,8,8)
 rectfill(x*8+1,y*8+33,x*8+6,y*8+38,11)
 if mode=="win" then
  rectfill(0,110,127,127,11) print("WIN O RETRY",24,116,0)
 end
end`;

export const mechanicsCases = [
  {
    id: "jump",
    mechanic: true,
    snapshot: () => emptySnapshot(jumpSource),
    prompt:
      "修好这个很小的跳跃场景：O 只能在地面起跳，空中再次按 O 不应再次起跳；角色要落回地面且能再次跳。保留左右移动、重力、跳跃力度和现有画面，验证起跳、空中重复按键、落地和再次起跳，不增加关卡或其他玩法。",
  },
  {
    id: "enemy",
    mechanic: true,
    snapshot: () => emptySnapshot(enemySource),
    prompt:
      "修好这个小场景的敌人接触伤害：每次受伤后有 20 个更新帧的无敌时间，持续接触不能每帧扣血，无敌结束后仍接触则再次受伤。保留 3 点生命、移动、到达旗帜获胜、零生命失败和 O 重试。验证扣血间隔、胜负及两种结果后的重试，重试应恢复生命和移动。保留现有画面。",
  },
  {
    id: "map",
    mechanic: true,
    snapshot: () => {
      const snapshot = emptySnapshot(mapSource);
      snapshot.assets = editAssets(snapshot.assets, [
        { kind: "sprite", id: 1, rows: Array(8).fill("55555555") },
        {
          kind: "sprite",
          id: 2,
          rows: [
            "00000000",
            "00aaaa00",
            "0aaaaaa0",
            "0aaaaaa0",
            "0aaaaaa0",
            "0aaaaaa0",
            "00aaaa00",
            "00000000",
          ],
        },
      ]);
      return snapshot;
    },
    prompt:
      "修好这个单屏地图小游戏：tile 1 是不能穿过的墙，tile 2 金币拾取后要消失且只能计分一次，两枚不同金币全部收集后才获胜，O 重试恢复金币、分数和起点。保留地图位置、资源、逐格移动和画面。实际验证墙阻挡、重复经过已拾取位置、收齐获胜和重试。",
  },
];

// Run after saving the agent transcript. These inputs are independent evidence,
// never credited as the agent's own playtest or as proof of general game quality.
export async function verifyMechanics(id, game) {
  const checks = {},
    evidence = [];
  async function run(action, args = {}) {
    const result = await game.execute(action, args);
    evidence.push({ action, args, result });
    if (result.isError) throw new Error(`Runtime failed during ${action}`);
    return game.testFrame;
  }
  const reset = () => run("reset_game");
  const press = (frames, buttons) => run("press_buttons", { steps: [{ frames, buttons }] });
  const color = (x, y, rgb) => {
    const start = (y * 128 + x) * 4;
    return rgb.every((c, i) => game.testFrame.rgba[start + i] === c);
  };
  const green = [0, 228, 54],
    red = [255, 0, 77],
    yellow = [255, 236, 39],
    black = [0, 0, 0];
  try {
    await reset();
    if (id === "jump") {
      const start = game.testFrame.rgba.slice();
      await press(1, 16);
      checks.jumpLeavesGround = !color(20, 95, green);
      await press(4, 0);
      const normal = game.testFrame.rgba.slice();
      await reset();
      await press(1, 16);
      await press(3, 0);
      await press(1, 16);
      checks.noAirJump = normal.every((v, i) => v === game.testFrame.rgba[i]);
      await press(40, 0);
      checks.landsOnGround = start.every(
        (v, i) => v === game.testFrame.rgba[i],
      );
      await press(1, 16);
      checks.canJumpAgain = !color(20, 95, green);
      await reset();
      await press(4, 2);
      checks.horizontalMovement = color(24, 88, green) && color(20, 88, black);
    } else if (id === "enemy") {
      // The first collision occurs at x=41, then exactly 20 update frames
      // must elapse before another hit. Hearts are the visible HP evidence.
      await press(33, 2);
      checks.firstHitCostsOne =
        color(8, 20, red) && color(16, 20, red) && color(24, 20, black);
      await press(19, 0);
      checks.invulnerabilityWindow = color(16, 20, red);
      await press(1, 0);
      checks.damageResumes = color(8, 20, red) && color(16, 20, black);
      await press(20, 0);
      checks.loss = color(0, 110, red);
      await press(1, 16);
      checks.retryAfterLoss =
        color(24, 20, red) && color(8, 80, green) && color(0, 110, black);
      await press(96, 2);
      checks.win = color(0, 110, green);
      await press(1, 16);
      checks.retryAfterWin =
        color(24, 20, red) && color(8, 80, green) && color(0, 110, black);
    } else if (id === "map") {
      await press(1, 2);
      checks.wallBlocks = color(9, 41, green) && !color(17, 41, green);
      await reset();
      await press(1, 8);
      await press(1, 4);
      checks.coinRemoved = color(11, 49, black) && color(8, 20, yellow);
      await press(1, 8);
      checks.noDoubleCollection = color(16, 20, black) && color(0, 110, black);
      await press(1, 2);
      await press(1, 0);
      await press(1, 2);
      checks.allCoinsWin = color(16, 20, yellow) && color(0, 110, green);
      await press(1, 16);
      checks.retryRestoresMap =
        color(11, 49, yellow) &&
        color(27, 49, yellow) &&
        color(9, 41, green) &&
        color(8, 20, black) &&
        color(0, 110, black);
    } else throw new Error(`Unknown mechanics case ${id}`);
    checks.noRuntimeFault = true;
  } catch (error) {
    checks.noRuntimeFault = false;
    evidence.push({ error: error.message });
  }
  return { checks, evidence };
}
