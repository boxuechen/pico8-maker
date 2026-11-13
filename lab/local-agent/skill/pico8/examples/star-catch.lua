-- STAR CATCH: move the basket, catch 10 stars, miss 3 and you lose.
-- Built on the template: global g, new_game(), result lock and X retry.
function new_game()
 g={mode="play",t=0,wait=0,caught=0,missed=0,
  player={x=64,y=116},
  stars={}}
end

function _init() new_game() end

function spawn_star()
 add(g.stars,{x=8+flr(rnd(112)),y=0,vy=1+rnd(1)})
end

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
 if g.t%30==0 then spawn_star() end
 for s in all(g.stars) do
  s.y+=s.vy
  if abs(s.x-g.player.x)<8 and abs(s.y-g.player.y)<4 then
   del(g.stars,s) g.caught+=1 sfx(0)
  elseif s.y>127 then
   del(g.stars,s) g.missed+=1 sfx(2)
  end
 end
 if g.caught>=10 then g.mode="win" sfx(3)
 elseif g.missed>=3 then g.mode="lose" sfx(4) end
end

function _draw()
 cls(1)
 for s in all(g.stars) do circfill(s.x,s.y,2,10) end
 rectfill(g.player.x-7,g.player.y-2,g.player.x+7,g.player.y+2,4)
 print("caught "..g.caught.."/10",2,2,7)
 print("missed "..g.missed.."/3",80,2,8)
 if g.mode!="play" then
  rectfill(0,56,127,72,g.mode=="win" and 11 or 8)
  print(g.mode=="win" and "you win" or "game over",40,59,7)
  print("x: retry",44,66,7)
 end
end
