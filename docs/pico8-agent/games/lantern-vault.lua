-- LANTERN VAULT: get the relic, return to the starting pad.
-- New example code, pixel data and note sequences; no classic-game assets.
-- Resources: sprite 1 courier, sprite 2 gem; music SFX 0 / channel 0;
-- feedback SFX 1..4 / channel 3. All state is rebuilt by _init.
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

-- Arrows move one turn; O/Z waits; X starts/retries. Idle is free.
-- Each move/wait costs 1 fuel; optional pink gems cost 2 extra. Walls are free.
-- Resolve warned row
-- after movement, then show the next row. Escape wins before fuel loss.
starting_fuel=24
function _init()
 assets() state="title" tx=1 ty=5 fuel=starting_fuel hp=3
 turn=0 danger=1 relic=false gems=0 taken={} flash=0
 walls={{3,2},{3,3},{3,4}} gem_cells={{2,3},{4,3}}
end
function start()
 state="play" tx=1 ty=5 fuel=starting_fuel hp=3
 turn=0 danger=1 relic=false gems=0 taken={} flash=0
end
function blocked(x,y)
 if x<1 or x>5 or y<1 or y>5 then return true end
 for w in all(walls) do if x==w[1] and y==w[2] then return true end end
 return false
end
function _update60()
 flash=max(0,flash-1)
 if state!="play" then if btnp(5) then start() end return end
 local dx,dy=0,0
 if btnp(0) then dx=-1 elseif btnp(1) then dx=1
 elseif btnp(2) then dy=-1 elseif btnp(3) then dy=1 end
 local wait=btnp(4)
 if dx==0 and dy==0 and not wait then return end
 if blocked(tx+dx,ty+dy) then sound(4) return end
 tx+=dx ty+=dy fuel-=1 turn+=1
 if ty==danger then hp-=1 flash=20 sound(2) end
 danger=turn%5+1
 if tx==5 and ty==1 and not relic then relic=true sound(1) end
 for i,g in ipairs(gem_cells) do
  if tx==g[1] and ty==g[2] and not taken[i] then
   taken[i]=true gems+=1 fuel-=2 sound(1)
  end
 end
 if hp<=0 then state="lost"
 elseif tx==1 and ty==5 and relic then state="won" sound(3)
 elseif fuel<=0 then state="lost" sound(2) end
end
function _draw()
 cls(1)
 print("lantern vault",4,3,7)
 print("fuel:"..fuel.." hp:"..hp,4,11,11)
 print("pink gem: -2 fuel",4,19,14)
 for y=1,5 do for x=1,5 do
  local sx,sy=8+x*18,10+y*18
  rectfill(sx,sy,sx+15,sy+15,blocked(x,y) and 5 or 2)
  if y==danger and not blocked(x,y) then
   rect(sx,sy,sx+15,sy+15,9) print("!",sx+1,sy+1,9)
  end
 end end
 rect(26,100,41,115,11)
 if not relic then spr(2,101,32) end
 for i,g in ipairs(gem_cells) do
  if not taken[i] then circ(15+g[1]*18,17+g[2]*18,3,14) end
 end
 if flash%6<3 then spr(1,12+tx*18,14+ty*18) end
 print(relic and "return to green pad" or "relic: top right",4,120,7)
 if state=="title" then banner("lantern vault","arrows move / o wait") end
 if state=="lost" then banner("lantern faded","row ! hurts next turn") end
 if state=="won" then banner("relic recovered!","banked gems: "..gems) end
end
