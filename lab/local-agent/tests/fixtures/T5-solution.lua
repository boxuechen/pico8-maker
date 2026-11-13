function new_game()
 g={mode="play",t=0,wait=0,score=0,missed=0,player={x=64,y=116},apples={}}
end
function _init() new_game() end
function _update()
 if g.mode!="play" then
  g.wait+=1
  if g.wait>15 and btnp(5) then new_game() end
  return
 end
 g.t+=1
 if btn(0) then g.player.x-=3 end
 if btn(1) then g.player.x+=3 end
 g.player.x=mid(8,g.player.x,119)
 if g.t%30==0 then add(g.apples,{x=8+flr(rnd(112)),y=0}) end
 for a in all(g.apples) do
  a.y+=1
  if abs(a.x-g.player.x)<8 and abs(a.y-g.player.y)<4 then del(g.apples,a) g.score+=1 sfx(0)
  elseif a.y>127 then del(g.apples,a) g.missed+=1 sfx(2) end
 end
 if g.score>=10 then g.mode="win" sfx(3) elseif g.missed>=3 then g.mode="lose" sfx(4) end
end
function _draw()
 cls(3)
 for a in all(g.apples) do circfill(a.x,a.y,2,8) end
 rectfill(g.player.x-7,g.player.y-2,g.player.x+7,g.player.y+2,4)
 print("score "..g.score,2,2,7) print("missed "..g.missed.."/3",80,2,8)
 if g.mode!="play" then
  rectfill(0,56,127,72,g.mode=="win" and 11 or 8)
  print(g.mode=="win" and "you win" or "game over",40,59,7)
  print("x: retry",44,66,7)
 end
end
