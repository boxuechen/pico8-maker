import { emptySnapshot } from "../../src/pico8/assets.js";

// A public task contract, separate from the implementation/oracle. Deliberately
// constrained geometry makes state + pixel assertions possible across models.
export const shooterContract = `实现一个确定性的单屏两波射击小游戏（30Hz）。左右键每帧移动2像素，x限制8..120；O持续开火，间隔6帧，子弹从玩家上方发出、每帧向上4像素。玩家初始x=64,y=112,hp=3。每波三个敌人中心在(32,24),(64,24),(96,24)，各一击消灭；清掉第一波立即出现相同的第二波，累计6次击杀后胜利。存活敌人每60帧向下发射速度3的子弹；命中玩家扣1HP，有20帧无敌，HP为0失败。命中阈值abs(dx)<5且abs(dy)<5。胜负后X重开，恢复全部本局状态。不得自动命中、自动胜利或注入进度。
使用全局g保存mode（play/win/lose）、player（x/y/hp/inv）、bullets（玩家弹）、hostiles（敌弹）、enemies（敌人）、wave、kills、tick和cooldown；实体表元素包含x/y。_init和重开共用new_game()。这是一份可独立验证的任务接口，不要添加测试专用函数。无随机性。
背景色0；玩家为中心(玩家x,112)的7x7实心绿色11，敌人为中心上述位置的7x7实心红色8；玩家弹黄色10、敌弹橙色9，半径1像素。HUD置于y<16。胜利/失败在y=56..72绘制全宽实心绿色11/红色8横条（文字可置于x>=16,y>=60）。保持中心像素配色，不使用调色板重映射。其余细节自由设计。完成并用正常输入验证核心循环、两波胜利、失败和重开，边界情况可用独立debug轮次。`;

export const shooterSource = `function new_game()
 g={mode="play",player={x=64,y=112,hp=3,inv=0},bullets={},hostiles={},enemies={},wave=1,kills=0,tick=0,cooldown=0}
 spawn_wave()
end
function spawn_wave()
 for x=32,96,32 do add(g.enemies,{x=x,y=24}) end
end
function _init() new_game() end
function _update()
 if g.mode!="play" then if btnp(5) then new_game() end return end
 g.tick+=1 g.player.inv=max(0,g.player.inv-1) g.cooldown=max(0,g.cooldown-1)
 if btn(0) then g.player.x=max(8,g.player.x-2) end
 if btn(1) then g.player.x=min(120,g.player.x+2) end
 if btn(4) and g.cooldown==0 then add(g.bullets,{x=g.player.x,y=106}) g.cooldown=6 end
 if g.tick%60==0 then for e in all(g.enemies) do add(g.hostiles,{x=e.x,y=e.y+4}) end end
 for b in all(g.bullets) do
  b.y-=4
  for e in all(g.enemies) do
   if abs(b.x-e.x)<5 and abs(b.y-e.y)<5 then del(g.enemies,e) del(g.bullets,b) g.kills+=1 break end
  end
  if b.y<0 then del(g.bullets,b) end
 end
 for b in all(g.hostiles) do
  b.y+=3
  if abs(b.x-g.player.x)<5 and abs(b.y-g.player.y)<5 and g.player.inv==0 then
   g.player.hp-=1 g.player.inv=20 del(g.hostiles,b)
  elseif b.y>127 then del(g.hostiles,b) end
 end
 if g.player.hp<=0 then g.mode="lose"
 elseif #g.enemies==0 then
  if g.wave==2 then g.mode="win" else g.wave=2 spawn_wave() end
 end
end
function _draw()
 cls(0)
 print("TWO WAVES  "..g.kills.."/6",2,2,7)
 print("HP "..g.player.hp.."  O FIRE X RETRY",2,10,7)
 for e in all(g.enemies) do rectfill(e.x-3,e.y-3,e.x+3,e.y+3,8) end
 for b in all(g.bullets) do circfill(b.x,b.y,1,10) end
 for b in all(g.hostiles) do circfill(b.x,b.y,1,9) end
 rectfill(g.player.x-3,109,g.player.x+3,115,11)
 if g.mode!="play" then rectfill(0,56,127,72,g.mode=="win" and 11 or 8) print(g.mode.." X RETRY",40,62,0) end
end`;

export const shooterCases = [
  {
    id: "shooter-repair",
    snapshot: () =>
      emptySnapshot(shooterSource.replace("g.player.inv=20", "g.player.inv=0")),
    prompt:
      "修复现有两波射击游戏：受伤后无敌20帧，目前无敌时间错误。保留射击、两波敌人、胜负、X重开与画面；不要更改其他规则。验证修复和最终版正常路线。以下是既定行为契约：\n" +
      shooterContract,
  },
  {
    id: "shooter-create",
    snapshot: () => emptySnapshot(),
    prompt:
      "从空白卡带新建以下小型射击游戏，不依赖外部卡带：\n" + shooterContract,
  },
];
