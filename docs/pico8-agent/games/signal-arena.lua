-- SIGNAL ARENA: leave the warned lane, then X on the core to hit.
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

-- Arrow taps move one grid cell; X starts/retries/strikes. 60 Hz.
-- The short result lock keeps a held strike from skipping the result.
warning_ticks=48 attack_ticks=12 recovery_ticks=60
function new_game()
 g={mode="play",gx=2,gy=4,hp=3,hits=0,phase="warn",timer=0,target=4,
  axis=0,cooldown=0,flash=0,cycle=0,wait=0}
 begin_warning()
end
function _init() assets() new_game() g.mode="title" g.wait=16 end
function begin_warning()
 g.phase="warn" g.timer=warning_ticks-g.hits*8
 g.axis=g.cycle%2 g.target=g.axis==0 and g.gy or g.gx g.cycle+=1
end
function _update60()
 if g.mode!="play" then
  g.wait+=1
  if g.wait>15 and btnp(5) then new_game() end
  return
 end
 g.cooldown=max(0,g.cooldown-1) g.flash=max(0,g.flash-1)
 if g.cooldown==0 then
  local dx=(btn(1) and 1 or 0)-(btn(0) and 1 or 0)
  local dy=(btn(3) and 1 or 0)-(btn(2) and 1 or 0)
  if dx!=0 then g.gx=mid(0,g.gx+dx,4) g.cooldown=8
  elseif dy!=0 then g.gy=mid(0,g.gy+dy,4) g.cooldown=8 end
 end
 if g.phase=="recover" and g.gx==2 and g.gy==2 and btnp(5) then
  g.hits+=1 sound(1)
  if g.hits==3 then g.mode="win" sound(3) return end
  begin_warning() return
 end
 g.timer-=1
 if g.timer<=0 then
  if g.phase=="warn" then g.phase="attack" g.timer=attack_ticks sound(4)
  elseif g.phase=="attack" then g.phase="recover" g.timer=recovery_ticks
  else begin_warning() end
 end
 if g.phase=="attack" and (g.axis==0 and g.gy==g.target or g.axis==1 and g.gx==g.target) and g.flash==0 then
  g.hp-=1 g.flash=30 sound(2)
  if g.hp==0 then g.mode="lose" end
 end
end
function _draw()
 cls(1)
 print("signal arena",4,3,7) print("hp:"..g.hp.."  core:"..g.hits.."/3",4,11,11)
 for y=0,4 do for x=0,4 do
  local danger=(g.axis==0 and y==g.target or g.axis==1 and x==g.target)
  local c=5
  if danger and g.phase=="warn" then c=9 end
  if danger and g.phase=="attack" then c=8 end
  rectfill(16+x*19,25+y*17,32+x*19,39+y*17,c)
  if danger and g.phase=="warn" then print("!",23+x*19,29+y*17,0) end
  if danger and g.phase=="attack" then line(16+x*19,25+y*17,32+x*19,39+y*17,7) end
 end end
 circfill(62,66,5,g.phase=="recover" and 10 or 2)
 print(g.phase=="recover" and "x" or "-",61,64,0)
 if g.flash%6<3 then spr(1,21+g.gx*19,28+g.gy*17) end
 print(g.phase=="recover" and "x on core: strike!" or "leave the marked lane",4,115,7)
 if g.mode=="title" then banner("signal arena","dodge -> strike core") end
 if g.mode=="lose" then banner("signal lost","watch the ! marks") end
 if g.mode=="win" then banner("core quieted!","three clean openings") end
end
