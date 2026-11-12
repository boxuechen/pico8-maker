pico-8 cartridge // http://www.pico-8.com
version 43
__lua__
-- TIDEWAY RESCUE
-- Guide stranded animals across a river crossing.
-- Calm -> WARNING -> DANGER waves -> calm. Carry 2 at a time.

local W,SW,CARRYR=128,34,2
local TOP,BOT=44,84
local ROWS,RH=5,8
local NF=18
local CWARN,WDANG,WCA=26,16,22

-- ---------- art ----------
local function put_sprite(n,rows)
 local ox=(n%16)*8 oy=flr(n/16)*8
 for y=0,7 do
  local r=rows[y+1]
  for x=0,7 do sset(ox+x,oy+y,tonum("0x"..sub(r,x+1,x+1))) end
 end
end
local art={
 { "04444440","044ff440","04466440","0f6666f0",
  "07766770","0d7777d0","0dd00dd0","0d0000d0"},
 { "00007ddd","0007dddd","7777dddd","7b77dddd",
  "7777dddd","0007dddd","00007ddd","00000000"},
 { "000ee000","00e777e0","0e7ff7e0","0e7f7fe0",
  "0e7ff7e0","00e77e00","0ee00ee0","00000000"},
 { "0000000f","00000ff7","0f0fff77","0ffffff0",
  "0fffffff","00f000f0","00f000f0","00000000"},
 { "00000000","00000000","cc0cc0cc","0cc0cc00",
  "00000000","00000000","00000000","00000000"},
 { "0dd0dd0d","dd0dd0dd","00000000","dd0dd0dd",
  "0dd0dd0d","00000000","00000000","00000000"},
 { "00000000","0f0ff0f0","ffffffff","ffffffff",
  "0ffffff0","00fff000","000f0000","00000000"},
 { "00000000","050dd050","5dddddd5","5dddddd5",
  "05dddd50","005dd000","00050000","00000000"},
 { "04444440","0f4664f0","04466440","04466440",
  "07766770","0d7777d0","0dd00dd0","0d0000d0"},
 { "44444444","4cccccc4","4cbbbbbc","4cbccdbc",
  "4cbbbbbc","4cccccc4","44466644","00000000"},
 { "44444444","4cccccc4","4cbbbbbc","4cbccbc0",
  "4cbbbbbc","0cccccc4","44466644","00000000"},
 { "00000000","04444440","4aaaaaaaa4","4aaaaaaa4",
  "4aaaaaaaa4","04444440","00000000","00000000"},
 { "00000000","0000f000","000f0f00","0ff0ff0f",
  "000f0f00","0000f000","00000000","00000000"},
 { "00000000","00005000","00057500","00577700",
  "00057500","00005000","00000000","00000000"},
 { "00000000","00777700","07777770","0776f770",
  "0776f770","07777770","00777700","00000000"},
 { "44444444","4cccccc4","4cb777bc","4cb7f7bc",
  "4cb777bc","4cccccc4","44466644","00000000"},
}

-- ---------- sound ----------
local function wr_sfx(id,notes,speed)
 local base=0x3200+id*68
 memset(base,0,68)
 for i=1,#notes do
  local n=notes[i]
  poke(base+(i-1)*2,n[1]+(n[2]%4)*64)
  poke(base+(i-1)*2+1,flr(n[2]/4)+n[3]*2+n[4]*16)
 end
 poke(base+65,speed)
end
local function wr_music(p,chs)
 local base=0x3100+p*4
 for i=1,4 do
  local c=chs[i] or 0x40
  if i<3 then c+=0x80 end
  poke(base+i-1,c)
 end
end

-- ---------- level setup ----------
function newlevel(n,first)
 lvl=n
 stranded={} delay={}
 local cnt=min(3+n,6)
 for i=1,cnt do
  local r=1+(i+n)%3
  stranded[i]={name=r,anim=(i*37)%60}
  delay[i]=40+flr(rnd(80))+i*6
 end
 carried={} nc=0
 hearts=3 banked=0
 px=SW py=(TOP+BOT)/2
 hop=0 face=1
 phase="calm" pt=CWARN
 wavey=0
 fx={}
 if first then popup="GET THEM ACROSS" popupt=110
 else popup="RESCUE "..(n-1).." MORE!" popupt=80 end
end

function _init()
 srand(20240611)
 for i=1,#art do put_sprite(i,art[i]) end
 wr_sfx(0,{{12,0,3,0},{12,0,2,0},{19,0,3,0},{12,0,2,0},
           {17,0,3,0},{12,0,2,0},{22,0,3,0},{17,0,2,0},
           {12,0,3,0},{12,0,2,0},{19,0,3,0},{12,0,2,0},
           {15,0,3,0},{12,0,2,0},{22,0,3,0},{24,0,2,0}},5)
 wr_sfx(1,{{19,2,2,0},{24,2,2,0},{26,2,2,0},{24,2,2,0},
           {22,2,2,0},{19,2,2,0},{17,2,2,0},{15,2,2,0},
           {19,2,2,0},{24,2,2,0},{26,2,2,0},{31,2,2,0},
           {29,2,2,0},{26,2,2,0},{22,2,2,0},{19,2,2,0}},5)
 wr_music(0,{0,1,64,64})
 wr_sfx(2,{{36,3,4,3},{31,3,4,0},{24,3,3,0}},5)
 wr_sfx(3,{{24,3,3,0},{30,3,4,0}},5)
 wr_sfx(4,{{31,2,4,0},{19,2,5,3}},6)
 wr_sfx(5,{{22,5,3,0},{29,5,3,0},{34,5,4,0},{36,5,4,0},{41,5,4,2}},5)
 wr_sfx(6,{{41,1,3,5},{36,1,4,0}},5)
 wr_sfx(7,{{45,4,3,0},{45,4,3,0},{38,4,4,3}},3)
 wr_sfx(8,{{12,6,5,3},{8,6,5,3},{8,6,4,3}},5)
 wr_sfx(9,{{19,0,3,0},{22,0,3,0},{26,0,3,0},{31,0,3,0}},5)

 cartdata("tideway_rescue_v1")
 local ver=dget(0)
 save_ok=(ver==0 or ver==1)
 best=mid(0,flr(dget(1)),999)
 if ver==0 then
  dset(1,best) dset(0,1)
 end
 tick=0 shake=0 inv=0 popupt=0 overT=0
 mode="title"
 score=0
 music(0,0,3)
 newlevel(1,true)
end

-- ---------- helpers ----------
local function addfx(x,y,c)
 add(fx,{x=x,y=y,c=c,t=18})
end
local function burst(x,y,col,n,spd)
 for i=1,n do
  local a=rnd(1)
  add(fx,{x=x,y=y,c=col,t=14+rnd(8),vx=cos(a)*spd,vy=sin(a)*spd,g=0.06})
 end
end
function save_high(s)
 if s>best then
  best=s
  if save_ok then dset(1,best) end
 end
end
local function resettimer()
 phase="calm" pt=CWARN
end
local function pick()
 if nc<CARRYR and #stranded>0 then
  local c=del(stranded,1)
  nc+=1 carried[nc]=c
  sfx(3,3,0,2)
  addfx(px,py-10,10)
 end
end
local function drop()
 if nc>0 then
  local c=carried[nc]
  carried[nc]=nil nc-=1
  add(stranded,c) add(delay,0)
  sfx(2,3,0,2)
 end
end
local function hurt()
 hearts-=1
 sfx(4,3,0,2)
 shake=10
 burst(px,py,8,12,1.8)
 if nc>0 then
  local c=carried[nc] carried[nc]=nil nc-=1
  add(stranded,c) add(delay,60)
  addfx(px,py-10,7)
 end
 py=(TOP+BOT)/2
 inv=45
 resettimer()
 if hearts<=0 then
  mode="over" overT=0
  save_high(score)
  sfx(8,3,0,3)
  burst(px,py,12,16,2.2)
 end
end
local function rescue()
 score+=nc
 banked+=nc
 sfx(5,3,0,5)
 addfx(px,py-12,10)
 burst(px,py,11,10,1.6)
 carried={} nc=0
 if banked>=6 then
  save_high(score)
  mode="clear" overT=0
  sfx(6,3,0,4)
 end
end

-- ---------- update ----------
function _update60()
 tick+=1
 if shake>0 then shake-=1 end
 if popupt>0 then popupt-=1 end
 for i=#fx,1,-1 do
  local f=fx[i]
  f.t-=1
  if f.vx then
   f.x+=f.vx f.y+=f.vy f.vy+=f.g
  else
   f.y-=0.5
  end
  if f.t<=0 then del(fx,f) end
 end

 if mode=="title" then
  if btnp(4) or btnp(5) then
   mode="play" score=0
   newlevel(1,true)
   sfx(9,3,0,4)
  end
  return
 end
 if mode=="over" or mode=="clear" then
  overT+=1
  if overT>18 and (btnp(5) or btnp(4)) then
   local n=(mode=="clear") and lvl+1 or lvl
   mode="play" score=0
   newlevel(n,false)
   sfx(9,3,0,4)
  end
  return
 end

 for i=1,#stranded do
  local s=stranded[i]
  s.anim+=1
  if delay[i] and delay[i]>0 then delay[i]-=1 end
 end

 pt-=1
 if phase=="calm" then
  if pt<=0 then phase="warn" pt=CWARN end
 elseif phase=="warn" then
  if pt==9 or pt==4 then sfx(7,3,0,2) end
  if pt<=0 then
   phase="danger" pt=WDANG
   sfx(8,3,0,3)
  end
 elseif phase=="danger" then
  wavey+=1
  if pt<=0 then phase="after" pt=WCA end
 elseif phase=="after" then
  if pt<=0 then phase="calm" pt=CWARN end
 end

 if btnp(0) then
  local nx=px-NF if nx>=SW-2 then px=nx face=-1 hop=6 end
 elseif btnp(1) then
  local nx=px+NF if nx<=W-14 then px=nx face=1 hop=6 end
 elseif btnp(2) then
  local ny=py-RH if ny>=TOP+2 then py=ny hop=6 end
 elseif btnp(3) then
  local ny=py+RH if ny<=BOT-2 then py=ny hop=6 end
 end
 if hop>0 then hop-=1 end
 if btnp(4) then pick() end
 if btnp(5) then drop() end

 local row=flr((py-TOP)/RH)+1
 if phase=="danger" and row>=2 and row<=ROWS then
  if inv<=0 then hurt() end
 end
 if inv>0 then inv-=1 end

 if mode=="play" and px<=SW+2 and nc>0 then
  rescue()
 end
end

-- ---------- draw ----------
function _draw()
 local sx,sy=0,0
 if shake>0 and mode=="play" then
  sx=rnd(2)-1 sy=rnd(2)-1
 end
 camera(sx,sy)
 rectfill(0,0,127,127,1)
 for i=0,3 do ovalfill(16+i*36,42,26,20,2) end
 rectfill(0,0,127,14,3)
 rectfill(0,14,127,18,11)
 rectfill(0,BOT+2,127,127,3)
 rectfill(0,BOT+2,127,BOT+8,11)
 rectfill(0,TOP,127,BOT+2,12)
 if phase=="warn" or phase=="danger" then
  rectfill(0,TOP-2,127,BOT+2,2)
 end
 for y=TOP+2,BOT,9 do
  for x=0,127,16 do
   local off
   if phase=="danger" then off=flr(tick*3) else off=flr(tick*0.6) end
   spr(5,(x+off)%144-8,y,1,1)
  end
 end
 for i=0,4 do
  local x=SW+2+i*NF
  if x<W-14 then
   if phase=="danger" then
    spr(6,mid(0,x+flr(sin(tick*0.3+i)*4),116),TOP-10)
   else
    rectfill(x+2,TOP-5,x+5,TOP-3,6)
   end
  end
 end
 rectfill(W-14,TOP-6,W-1,BOT+2,3)
 for i=0,4 do spr(12,W-12,TOP+i*RH+2,1,1) end
 rectfill(W-4,TOP-4,W-2,BOT+2,11)

 if phase=="warn" then
  local p=1-(pt/CWARN)
  local wy=TOP-14+flr(p*12)
  spr(6,mid(0,58+flr(sin(tick*0.4)*40),110),wy,2,1)
  local n=1+flr((CWARN-pt)/9)
  for i=1,3 do
   circfill(94+i*8,10,i<=n and 2 or 1,i<=n and 8 or 5)
  end
  print("!WAVE!",66,3,8)
 elseif phase=="danger" then
  for x=0,120,8 do spr(6,x+flr(tick*5)%8,TOP-10,1,1) end
 elseif phase=="after" then
  local n=(WCA-pt)%4
  for i=0,2 do circfill(44+i*20,TOP-6,2+n,6) end
 end

 local kx=px ky=py
 if hop>0 then ky-=1 end
 local flick=inv>0 and (flr(tick/2)%2==0)
 if not flick then spr(hop>2 and 9 or 1,kx,ky,1,1,face<0) end
 for i=1,nc do
  spr(carried[i].name,kx+3,ky+8+i*7,1,1)
 end
 for i=#stranded,1,-1 do
  local s=stranded[i]
  if (delay[i] or 0)<=0 then
   local ay=TOP+4+((i-1)%5)*8
   local ax=6+flr((i-1)/5)*8
   spr(s.name,ax,ay+flr(sin(s.anim*0.12)),1,1)
  else
   spr(6,4+(i-1)*6,TOP+2,1,1)
  end
 end
 line(0,TOP-1,127,TOP-1,6)

 rectfill(0,92,127,127,0)
 rectfill(0,92,127,93,5)
 for i=1,3 do
  spr(i<=hearts and 7 or 8,2+(i-1)*9,96)
 end
 for i=1,CARRYR do
  local x=34+(i-1)*10
  rectfill(x-1,96,x+7,103,(i<=nc) and 2 or 5)
  if i<=nc then spr(carried[i].name,x,96) else spr(6,x,96) end
 end
 print("LEFT "..#stranded,60,96,7)
 print("SAVED "..banked.."/6",60,106,10)
 print("SCORE "..score,60,116,6)
 if popupt>0 and popup then
  local w=#popup*4+6
  rectfill(62-w/2,26,66+w/2,36,0)
  rect(62-w/2,26,66+w/2,36,10)
  print(popup,64-w/2,29,10)
 end
 for i=1,#fx do
  local f=fx[i]
  pset(f.x,f.y,f.c)
 end
 camera()

 if mode=="title" then
  draw_title()
 elseif mode=="over" then
  rectfill(6,30,122,96,0)
  rect(6,30,122,96,8)
  print("THE RIVER WON",26,38,8)
  print("try again",46,48,7)
  print("score "..score,44,62,10)
  print("best  "..best,44,72,9)
  if overT>18 and flr(tick/16)%2==0 then print("press X",44,84,11) end
 elseif mode=="clear" then
  rectfill(6,26,122,100,0)
  rect(6,26,122,100,11)
  print("CROSSING CLEAR!",20,34,11)
  print("score "..score,42,50,10)
  print("best  "..best,42,60,9)
  print("next ferry: faster",18,72,7)
  if overT>18 and flr(tick/16)%2==0 then print("press X",44,86,11) end
 end
end

function draw_title()
 rectfill(0,0,127,127,1)
 for i=0,5 do
  spr(5,(i*24+flr(tick*0.8))%144-16,74,1,1)
  spr(5,(i*24-flr(tick*0.8))%144-16,98,1,1)
 end
 rectfill(0,110,127,127,3)
 print("t i d e w a y",22,12,12)
 print("RESCUE",42,24,7)
 spr(1,38,40)
 spr(2,50,44) spr(3,60,40) spr(4,50,54)
 print("carry 2 across",30,62,6)
 print("z pick  x drop",28,70,10)
 if flr(tick/18)%2==0 then print("press O to start",40,88,11)
 else print("press O to start",40,88,7) end
end

__label__
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111
11111111111111111111222111111111111122222221111122222222222222222222222222222222222222222211111111111111111111111111111111111111
11111111111111111112222211111111122222222222222222222222222222222222222222222222222222222222222222221111111111111111111111111111
11111111111111111122222221111112222222222222222222222222222222222222222222222222222222222222222222222222222111111111111111111111
11111111111111111122222221111122222222222222222222222222222222222222222222222222222222222222222222222222222222211111111111111111
11111111111111111222222222111222222222222222222222222222222222222222222222222222222222222222222222222222222222222221111111111111
11111111111111111222222222112222222222222222222222222222222222222222222222222222222222222222222222222222222222222222221111111111
11111111111111111222222222122aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2222222222222222222211111111
11111111111111112222222222222a000000000000000000000000000000000000000000000000000000000000000000000a2222222222222222222222111111
11111111111111112222222222222a000000000000000000000000000000000000000000000000000000000000000000000a2222222222222222222222211111
11111111111111112222222222222a000000000000000000000000000000000000000000000000000000000000000000000a2222222222222222222222221111
11111111111111112222222222222a0aaa0aaa0aaa00000aaa0a0a0aaa0aaa00000aaa0aaa0aaa00aa00aa00aa000000000a2222222222222222222222222111
11111111111111112222222222222a0a000aa000a0000000a00a0a0aa00aaa00000a0a0a000a0a0a0a0a000a00000000000a2222222222222222222222222111
11111111111111112222222222222a0a0a0a0000a0000000a00aaa0a000a0a00000aaa0a000aa00a0a000a000a000000000a2222222222222222222222222111
11111111111111112222222222222a0aaa0aaa00a0000000a00a0a0aaa0a0a00000a0a0aaa0a0a0aa00aa00aa0000000000a2222222222222222222222221111
11111111111111112222222222222a000000000000000000000000000000000000000000000000000000000000000000000a2222222222222222222222211111
11111111111111112222222222222a000000000000000000000000000000000000000000000000000000000000000000000a2222222222222222222222111111
11111111111111111222222222122aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2222222222222222222211111111
11111111111111111222222222112222222222222222222222222222222222222222222222222222222222222222222222222222222222222222221111111111
11111111111111111222222222111222222222222222222222222222222222222222222222222222222222222222222222222222222222222233333333333333
11111111111111111122222221111122222222666622222222222222666622222222222222666622222222222222666622222222222222666633333333333333
1111111111111111112222222111111222222266662222222222222266662222222222222266662222222222222266662222222222211166663333333333bbb3
1111111111111111111222221111111112222266662222222222222266662222222222222266662222222222222266662222111111111166663333333333bbb3
1111111111111111111122211111111111112222222111112222222222222222222222222222222222222222221111111111111111111111113333333333bbb3
66666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccddcddcddcddcddcddcddcddcdcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
ccccddcddcddcddcddcddcddcddcddcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3334444443bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
ccccddcddcddcddcddcddcddcddcddcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccddcddcddcddcddcddcddcddcdcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3334444443bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3334444443bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3334444443bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3334444443bbb3
ccccccccccccccccccccccccccccccccccc444444ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
ccccccccccccccccccccccccccccccccccc44ff44ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
ccccccccccccccccccccccccccccccccccc446644ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccf6666fccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3334444443bbb3
ccccccccccccccccccccccccccccccccccc776677ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccd7777dccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccddccddccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccdccccdccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3334444443bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3334444443bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3334444443bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc334aaaaaaabbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3334444443bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc3333333333bbb3
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
55555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555
55555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000055dd5dd5d055dd5dd5d0000000000000000000000000000707000000000000000000000000000000000000000000000
000f0ff0f000f0ff0f000f0ff0f0000005dd5dd5dd05dd5dd5dd0000000070007770777077700000707000000000000000000000000000000000000000000000
00ffffffff0ffffffff0ffffffff0000055555555505555555550000000070007700770007000000777000000000000000000000000000000000000000000000
00ffffffff0ffffffff0ffffffff000005dd5dd5dd05dd5dd5dd0000000070007000700007000000007000000000000000000000000000000000000000000000
000ffffff000ffffff000ffffff00000055dd5dd5d055dd5dd5d0000000077707770700007000000007000000000000000000000000000000000000000000000
0000fff000000fff000000fff0000000055555555505555555550000000000000000000000000000000000000000000000000000000000000000000000000000
00000f00000000f00000000f00000000055555555505555555550000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000055555555505555555550000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
000000000000000000000000000000000000000000000000000000000000000000000000000000000000aaa000a0a00000000000000000000000000000000000
0000000000000000000000000000000000000000000000000000000000000aa0aaa0a0a0aaa0aa000000a0a00a00a00000000000000000000000000000000000
000000000000000000000000000000000000000000000000000000000000a000a0a0a0a0aa00a0a00000a0a00a00aaa000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000a0aaa0aaa0a000a0a00000a0a00a00a0a000000000000000000000000000000000
000000000000000000000000000000000000000000000000000000000000aa00a0a00a00aaa0aa000000aaa0a000aaa000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000066600000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000006606660066066606660000060600000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000060006000606060606600000060600000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000606000606066006000000060600000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000066006660660060606660000066600000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
