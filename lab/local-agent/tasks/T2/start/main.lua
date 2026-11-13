function new_game()
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
   g.player.hp-=1 g.player.inv=0 del(g.hostiles,b)
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
end