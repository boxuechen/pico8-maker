-- LANTERN VAULT: get the relic, return to the starting pad.
-- New example code, pixel data and note sequences; no classic-game assets.
-- Resources: sprite 1 courier, sprite 2 gem; music SFX 0 / channel 0;
-- feedback SFX 1..4 / channel 3. Round state lives in g; new_game() rebuilds it.
function assets()
 pal() palt()
 local art={
 {"000bb000","00b77b00","00bbbb00","000bb000","0bbbbbb0","000bb000","00b00b00","0bb00bb0"},
 {"000a0000","00aaa000","0aa7aa00","aa777aa0","0aaaaa00","00aaa000","000a0000","00000000"}}
 for n,rows in ipairs(art) do
  for y=0,7 do for x=0,7 do
   sset(n*8+x,y,tonum("0x"..sub(rows[y+1],x+1,x+1)))
  end end
 end
 for id=0,4 do
  local b=0x3200+id*68 memset(b,0,68)
  local notes=({{24,31,28,31,24,31,36,31},{36,40,43},{24,19,12},{36,43,48},{48,43,36}})[id+1]
  for i,k in ipairs(notes) do
   poke(b+(i-1)*2,k) poke(b+(i-1)*2+1,(id==0 and 2 or 5)*2)
  end
  poke(b+65,id==0 and 16 or 5)
  if id==0 then poke(b+66,0) poke(b+67,#notes) end
 end
 poke(0x3100,128,64,64,64) music(0,0,1)
end
function sound(id) sfx(id,3,0,id==0 and 8 or 3) end
function banner(title,subtitle)
 rectfill(5,39,122,85,1) rect(5,39,122,85,6)
 print(title,12,47,10) print(subtitle,12,59,7)
 print("x: start / retry",12,74,11)
end

-- Arrows move one turn; O/Z waits; X starts/retries after a short result lock.
-- Idle is free. Each move/wait costs 1 fuel; optional pink gems cost 2 extra.
-- Walls are free. Resolve warned row
-- after movement, then show the next row. Escape wins before fuel loss.
starting_fuel=24
walls={{3,2},{3,3},{3,4}} gem_cells={{2,3},{4,3}}
function new_game()
 g={mode="play",tx=1,ty=5,fuel=starting_fuel,hp=3,turn=0,danger=1,
  relic=false,gems=0,taken={},flash=0,wait=0}
end
function _init() assets() new_game() g.mode="title" g.wait=16 end
function blocked(x,y)
 if x<1 or x>5 or y<1 or y>5 then return true end
 for w in all(walls) do if x==w[1] and y==w[2] then return true end end
 return false
end
function _update60()
 g.flash=max(0,g.flash-1)
 if g.mode!="play" then
  g.wait+=1
  if g.wait>15 and btnp(5) then new_game() end
  return
 end
 local dx,dy=0,0
 if btnp(0) then dx=-1 elseif btnp(1) then dx=1
 elseif btnp(2) then dy=-1 elseif btnp(3) then dy=1 end
 local wait=btnp(4)
 if dx==0 and dy==0 and not wait then return end
 if blocked(g.tx+dx,g.ty+dy) then sound(4) return end
 g.tx+=dx g.ty+=dy g.fuel-=1 g.turn+=1
 if g.ty==g.danger then g.hp-=1 g.flash=20 sound(2) end
 g.danger=g.turn%5+1
 if g.tx==5 and g.ty==1 and not g.relic then g.relic=true sound(1) end
 for i,c in ipairs(gem_cells) do
  if g.tx==c[1] and g.ty==c[2] and not g.taken[i] then
   g.taken[i]=true g.gems+=1 g.fuel-=2 sound(1)
  end
 end
 if g.hp<=0 then g.mode="lose"
 elseif g.tx==1 and g.ty==5 and g.relic then g.mode="win" sound(3)
 elseif g.fuel<=0 then g.mode="lose" sound(2) end
end
function _draw()
 cls(1)
 print("lantern vault",4,3,7)
 print("fuel:"..g.fuel.." hp:"..g.hp,4,11,11)
 print("pink gem: -2 fuel",4,19,14)
 for y=1,5 do for x=1,5 do
  local sx,sy=8+x*18,10+y*18
  rectfill(sx,sy,sx+15,sy+15,blocked(x,y) and 5 or 2)
  if y==g.danger and not blocked(x,y) then
   rect(sx,sy,sx+15,sy+15,9) print("!",sx+1,sy+1,9)
  end
 end end
 rect(26,100,41,115,11)
 if not g.relic then spr(2,101,32) end
 for i,c in ipairs(gem_cells) do
  if not g.taken[i] then circ(15+c[1]*18,17+c[2]*18,3,14) end
 end
 if g.flash%6<3 then spr(1,12+g.tx*18,14+g.ty*18) end
 print(g.relic and "return to green pad" or "relic: top right",4,120,7)
 if g.mode=="title" then banner("lantern vault","arrows move / o wait") end
 if g.mode=="lose" then banner("lantern faded","row ! hurts next turn") end
 if g.mode=="win" then banner("relic recovered!","banked gems: "..g.gems) end
end
