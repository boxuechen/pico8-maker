-- SPRING COURIER: carry the parcel to the gate; optional high gem.
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

-- Arrows move, O/Z jumps. X starts or retries. 60 Hz.
-- Tune speed, jump_v, gravity together; windows are update ticks.
speed=1.2 jump_v=-3.5 gravity=0.18 grace_ticks=5 buffer_ticks=4
function _init()
 assets() state="title" px=8 py=100 vy=0 grace=0 buffer=0
 parcel=false bonus=false ticks=0
 floors={{0,108,40,20},{56,108,28,20},{100,108,28,20},{58,88,22,4}}
end
function start()
 state="play" px=8 py=100 vy=0 grace=0 buffer=0
 parcel=false bonus=false ticks=0
end
function standing()
 for f in all(floors) do
  if px+6>f[1] and px<f[1]+f[3] and abs(py+8-f[2])<0.05 then return true end
 end
 return false
end
function _update60()
 ticks+=1
 if state!="play" then
  if btnp(5) then start() end
  return
 end
 if standing() then grace=grace_ticks else grace=max(0,grace-1) end
 if btnp(4) then buffer=buffer_ticks else buffer=max(0,buffer-1) end
 if buffer>0 and grace>0 then
  vy=jump_v buffer=0 grace=0 sound(1)
 end
 if not btn(4) and vy<-1.5 then vy=-1.5 end
 if btn(0) then px-=speed end
 if btn(1) then px+=speed end
 px=mid(0,px,122)
 local old=py vy=min(3,vy+gravity) py+=vy
 for f in all(floors) do
  if vy>=0 and old+8<=f[2] and py+8>=f[2] and px+6>f[1] and px<f[1]+f[3] then
   py=f[2]-8 vy=0
  end
 end
 if not parcel and abs(px-66)<8 and abs(py-78)<10 then parcel=true sound(1) end
 if not bonus and abs(px-30)<7 and abs(py-67)<8 then bonus=true sound(1) end
 if parcel and px>112 and py>92 and py<108 then state="won" sound(3) end
 if py>128 then state="lost" sound(2) end
end
function _draw()
 cls(1)
 for x=0,127,16 do pset(x,30+(x%3)*6,13) end
 print("spring courier",4,3,7)
 print(parcel and "parcel: yes" or "get the parcel!",4,11,10)
 for f in all(floors) do
  rectfill(f[1],f[2],f[1]+f[3]-1,127,3)
  rectfill(f[1],f[2],f[1]+f[3]-1,f[2]+2,11)
 end
 -- Upper shelf is a one-way platform, not a filled ground column.
 rectfill(58,92,79,107,1)
 rect(113,94,124,107,parcel and 11 or 5)
 print("exit",108,87,7)
 if not parcel then spr(2,65,78) else spr(2,px+5,py-4) end
 if not bonus then circ(33,70,3,14) end
 spr(1,px-1,py)
 print("o: jump  arrows: move",4,120,7)
 if state=="title" then banner("spring courier","parcel -> exit") end
 if state=="lost" then banner("missed the landing","try a held jump") end
 if state=="won" then banner("delivery complete",bonus and "bonus gem delivered!" or "try the high gem!") end
end
