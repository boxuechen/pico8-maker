-- SPRING COURIER: carry the parcel to the gate; optional high gem.
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

-- Arrows move, O/Z jumps. X starts or retries after a short result lock. 60 Hz.
-- Tune speed, jump_v, gravity together; windows are update ticks.
speed=1.2 jump_v=-3.5 gravity=0.18 grace_ticks=5 buffer_ticks=4
floors={{0,108,40,20},{56,108,28,20},{100,108,28,20},{58,88,22,4}}
function new_game()
 g={mode="play",px=8,py=100,vy=0,grace=0,buffer=0,
  parcel=false,bonus=false,ticks=0,wait=0}
end
function _init() assets() new_game() g.mode="title" g.wait=16 end
function standing()
 for f in all(floors) do
  if g.px+6>f[1] and g.px<f[1]+f[3] and abs(g.py+8-f[2])<0.05 then return true end
 end
 return false
end
function _update60()
 g.ticks+=1
 if g.mode!="play" then
  g.wait+=1
  if g.wait>15 and btnp(5) then new_game() end
  return
 end
 if standing() then g.grace=grace_ticks else g.grace=max(0,g.grace-1) end
 if btnp(4) then g.buffer=buffer_ticks else g.buffer=max(0,g.buffer-1) end
 if g.buffer>0 and g.grace>0 then
  g.vy=jump_v g.buffer=0 g.grace=0 sound(1)
 end
 if not btn(4) and g.vy<-1.5 then g.vy=-1.5 end
 if btn(0) then g.px-=speed end
 if btn(1) then g.px+=speed end
 g.px=mid(0,g.px,122)
 local old=g.py g.vy=min(3,g.vy+gravity) g.py+=g.vy
 for f in all(floors) do
  if g.vy>=0 and old+8<=f[2] and g.py+8>=f[2] and g.px+6>f[1] and g.px<f[1]+f[3] then
   g.py=f[2]-8 g.vy=0
  end
 end
 if not g.parcel and abs(g.px-66)<8 and abs(g.py-78)<10 then g.parcel=true sound(1) end
 if not g.bonus and abs(g.px-30)<7 and abs(g.py-67)<8 then g.bonus=true sound(1) end
 if g.parcel and g.px>112 and g.py>92 and g.py<108 then g.mode="win" sound(3) end
 if g.py>128 then g.mode="lose" sound(2) end
end
function _draw()
 cls(1)
 for x=0,127,16 do pset(x,30+(x%3)*6,13) end
 print("spring courier",4,3,7)
 print(g.parcel and "parcel: yes" or "get the parcel!",4,11,10)
 for f in all(floors) do
  rectfill(f[1],f[2],f[1]+f[3]-1,127,3)
  rectfill(f[1],f[2],f[1]+f[3]-1,f[2]+2,11)
 end
 -- Upper shelf is a one-way platform, not a filled ground column.
 rectfill(58,92,79,107,1)
 rect(113,94,124,107,g.parcel and 11 or 5)
 print("exit",108,87,7)
 if not g.parcel then spr(2,65,78) else spr(2,g.px+5,g.py-4) end
 if not g.bonus then circ(33,70,3,14) end
 spr(1,g.px-1,g.py)
 print("o: jump  arrows: move",4,120,7)
 if g.mode=="title" then banner("spring courier","parcel -> exit") end
 if g.mode=="lose" then banner("missed the landing","try a held jump") end
 if g.mode=="win" then banner("delivery complete",g.bonus and "bonus gem delivered!" or "try the high gem!") end
end
