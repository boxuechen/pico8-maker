-- FISH CATCH: move the cat, catch falling fish, do not miss too many.
player_speed=2
fall_speed=1
goal=10
max_missed=3

function new_game()
 g={mode="play",t=0,wait=0,caught=0,missed=0,
  player={x=64,y=116},
  fish={}}
end

function _init() new_game() end

function spawn_fish()
 add(g.fish,{x=8+flr(rnd(112)),y=0,vy=fall_speed})
end

function _update()
 if g.mode!="play" then
  g.wait+=1
  if g.wait>15 and btnp(5) then new_game() end
  return
 end
 g.t+=1
 if btn(0) then g.player.x-=player_speed end
 if btn(1) then g.player.x+=player_speed end
 g.player.x=mid(8,g.player.x,119)
 if g.t%30==0 then spawn_fish() end
 for f in all(g.fish) do
  f.y+=f.vy
  if abs(f.x-g.player.x)<8 and abs(f.y-g.player.y)<4 then
   del(g.fish,f) g.caught+=1 sfx(0)
  elseif f.y>127 then
   del(g.fish,f) g.missed+=1 sfx(2)
  end
 end
 if g.caught>=goal then g.mode="win" sfx(3)
 elseif g.missed>=max_missed then g.mode="lose" sfx(4) end
end

function _draw()
 cls(12)
 rectfill(0,121,127,127,15)
 for f in all(g.fish) do
  ovalfill(f.x-3,f.y-2,f.x+3,f.y+2,9)
  pset(f.x+2,f.y-1,0)
 end
 local p=g.player
 rectfill(p.x-6,p.y-3,p.x+6,p.y+3,6)
 line(p.x-6,p.y-3,p.x-4,p.y-6,6)
 line(p.x+6,p.y-3,p.x+4,p.y-6,6)
 pset(p.x-3,p.y-1,0)
 pset(p.x+3,p.y-1,0)
 print("fish "..g.caught.."/"..goal,2,2,7)
 print("missed "..g.missed.."/"..max_missed,70,2,8)
 if g.mode!="play" then
  rectfill(0,56,127,72,g.mode=="win" and 11 or 8)
  print(g.mode=="win" and "you win" or "game over",40,59,7)
  print("x: retry",44,66,7)
 end
end
