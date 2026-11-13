function new_game()
 g={mode="play",t=0,wait=0,time=0,player={x=64,y=116},rocks={}}
end
function _init() new_game() end
function _update()
 if g.mode!="play" then
  g.wait+=1
  if g.wait>15 and btnp(5) then new_game() end
  return
 end
 g.t+=1 g.time+=1
 if btn(0) then g.player.x-=2 end
 if btn(1) then g.player.x+=2 end
 g.player.x=mid(4,g.player.x,123)
 if g.t%20==0 then add(g.rocks,{x=flr(rnd(120))+4,y=0}) end
 for r in all(g.rocks) do
  r.y+=2
  if abs(r.x-g.player.x)<6 and abs(r.y-g.player.y)<6 then g.mode="lose" sfx(4) end
  if r.y>130 then del(g.rocks,r) end
 end
 if g.mode=="play" and g.time>=900 then g.mode="win" sfx(3) end
end
function _draw()
 cls(1)
 for r in all(g.rocks) do circfill(r.x,r.y,3,5) end
 rectfill(g.player.x-3,g.player.y-3,g.player.x+3,g.player.y+3,11)
 print("time "..flr(g.time/30),2,2,7)
 if g.mode!="play" then
  rectfill(0,56,127,72,g.mode=="win" and 11 or 8)
  print(g.mode=="win" and "you win" or "game over",40,59,7)
  print("x: retry",44,66,7)
 end
end
