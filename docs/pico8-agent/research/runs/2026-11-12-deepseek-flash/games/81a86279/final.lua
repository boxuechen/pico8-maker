-- SKYLINE REPAIR : rooftop antenna repair
-- Fix three antennas on the rooftops. Dodge drones, bolts and steam jets.
-- Route choice (low roof vs high perches) + jump timing.

-- ================= sound =================
function write_sfx(id,notes,speed)
 local base=0x3200+id*68
 memset(base,0,68)
 for i,n in ipairs(notes) do
  poke(base+(i-1)*2,n[1]+(n[2]%4)*64)
  poke(base+(i-1)*2+1,flr(n[2]/4)+n[3]*2+n[4]*16)
 end
 poke(base+65,speed)
end
function write_pattern(id,ch,sl,el,sa)
 local base=0x3100+id*4
 for i=1,4 do
  local c=ch[i]
  local b=c<0 and 64 or c
  if i==1 and sl then b+=128 end
  if i==2 and el then b+=128 end
  if i==3 and sa then b+=128 end
  poke(base+i-1,b)
 end
end

-- ================= sprites =================
local SP={}
SP.hero={"00777700","070ee070","07f77f70","00777700","0722270e","0722270e","00777f00","07000700"}
SP.hero2={"00777700","070ee070","07f77f70","00777700","0e722270","0e722270","00777f00","07000700"}
SP.herojump={"00777700","070ee070","07f77f70","00777700","07222270","00722700","00777f00","07700000"}
SP.tower={"00066600","000ff000","00006000","00f66f00","00003000","0f033f00","00003000","00f33f00"}
SP.antbroken={"00066600","00006000","00060006","00f660f0","00003000","0f033f00","00003000","00f33f00"}
SP.antfix={"00066600","000af000","00006000","00f66f00","000b3000","0ff33ff0","00003000","00f33f00"}
SP.antfix2={"00066600","000af000","00000800","00f66f00","000b3000","0fb33bf0","00003000","00f33f00"}
SP.chimney={"00077700","00666600","06666660","00600600","00600600","06666660","00666600","06666660"}
SP.crate={"00777700","07444470","07455770","07455770","07455770","07455770","07444470","00777700"}
SP.cat={"00000000","0a0aa0a0","0aaaaaaa","0afffffa","0aff0ffa","0aaaaaaa","00a00a00","00000000"}
SP.drone={"00000000","000cc000","0c0cc0c0","0ccccccc","00c66c00","0c0000c0","00000000","00000000"}
SP.vent={"00000000","00000000","00111100","01222210","01211210","01222210","00111100","00000000"}
SP.ball={"00066000","00699600","06999960","69999990","69999990","06999960","00699600","00066000"}
SP.spark={"00000000","00000a00","0000aa00","00aa0a00","000aa000","000aa000","00a00000","00000000"}

function put_sprite(n,rows)
 local ox=(n%16)*8
 local oy=flr(n/16)*8
 for y=0,7 do
  for x=0,7 do
   local ch=sub(rows[y+1],x+1,x+1)
   local c=0
   if ch~=" " then c=tonum("0x"..ch) end
   sset(ox+x,oy+y,c)
  end
 end
end

S_HERO,S_HERO2,S_HEROJ,S_TOWER=1,2,3,4
S_BROKEN,S_FIX1,S_FIX2,S_CHIM=5,6,7,8
S_CRATE,S_CAT,S_DRONE,S_VENT=9,10,11,12
S_BALL,S_SPARK=13,14

-- ================= world =================
-- {x0,x1,ytop}
local PLAT={
 {0,127,112},
 {10,34,84},
 {58,86,80},
 {94,122,88},
 {40,56,60},
 {76,104,52},
 {104,124,64},
}
local ANT={
 {x=46,y=60,px=40,px2=56,py=60,fix=false,armed=false},
 {x=88,y=52,px=76,px2=104,py=52,fix=false,armed=false},
 {x=14,y=44,px=6,px2=26,py=44,fix=false,armed=false},
}
local BLOCK={{32,52,60},{104,124,64}}

local GRAV=0.32
local JUMPV=-3.1
local SPEED=1.3
local MAXFALL=3

-- ================= state =================
function reset_player()
 p={x=64,y=104,vx=0,vy=0,on=true,face=1,coyote=0,anim=0,inv=22}
end

function build_hazards()
 hazards={}
 add(hazards,{t="drone",y=72,x=20,xmin=4,xmax=50,d=1,sp=0.55,r=4})
 add(hazards,{t="drone",y=42,x=44,xmin=34,xmax=72,d=-1,sp=0.62,r=4})
 add(hazards,{t="drone",y=96,x=96,xmin=70,xmax=124,d=-1,sp=0.75,r=4})
 add(hazards,{t="bolt",y=106,x=110,xmin=2,xmax=124,d=-1,sp=0.95,r=4})
 add(hazards,{t="bolt",y=106,x=60,xmin=2,xmax=124,d=1,sp=1.1,r=4})
 add(hazards,{t="vent",y=62,x=70,period=90,ph=0,r=4,active=false,ht=0})
 add(hazards,{t="vent",y=34,x=40,period=80,ph=35,r=4,active=false,ht=0})
end

function start_game()
 build_hazards()
 for i=1,#ANT do ANT[i].fix=false ANT[i].armed=false end
 reset_player()
 state="play"
 fixed=0
 deaths=0
 t=0
 shake=0
 parts={}
 endframe=0
 say("FIX 3 ANTENNAS",90)
 sfx(3,3,0,2)
end

function _init()
 srand(7)
 pal()
 palt()
 put_sprite(S_HERO,SP.hero)
 put_sprite(S_HERO2,SP.hero2)
 put_sprite(S_HEROJ,SP.herojump)
 put_sprite(S_TOWER,SP.tower)
 put_sprite(S_BROKEN,SP.antbroken)
 put_sprite(S_FIX1,SP.antfix)
 put_sprite(S_FIX2,SP.antfix2)
 put_sprite(S_CHIM,SP.chimney)
 put_sprite(S_CRATE,SP.crate)
 put_sprite(S_CAT,SP.cat)
 put_sprite(S_DRONE,SP.drone)
 put_sprite(S_VENT,SP.vent)
 put_sprite(S_BALL,SP.ball)
 put_sprite(S_SPARK,SP.spark)

 write_sfx(0,{{40,0,5,0},{47,0,5,0},{52,1,4,2},{59,1,4,0}},6)
 write_sfx(1,{{36,3,5,3},{31,3,5,3},{24,3,4,6}},5)
 write_sfx(2,{{44,1,3,2},{50,0,2,2}},4)
 write_sfx(3,{{36,0,4,0},{43,0,4,0},{48,0,5,0},{55,0,4,2},{60,1,3,3}},7)
 write_sfx(4,{{24,2,3,1},{22,2,2,1}},6)
 write_sfx(8,{{12,2,2,0},{12,2,2,0},{19,2,1,0},{17,2,2,0}},9)
 write_sfx(9,{{24,5,1,0},{31,5,1,0},{28,5,1,0},{33,5,1,0}},9)
 write_pattern(0,{8,9,-1,-1},true,true,false)

 cartdata("skyline_repair_v1")
 best=mid(0,flr(dget(0)),999999)

 state="title"
 t=0
 endframe=0
 parts={}
 shake=0
 build_hazards()
 for i=1,#ANT do ANT[i].fix=false ANT[i].armed=false end
 reset_player()
 fixed=0
 deaths=0
 msg=""
 msg_t=0
end

-- ================= helpers =================
function addpart(x,y,c,dx,dy,life)
 if #parts<50 then add(parts,{x=x,y=y,c=c,dx=dx,dy=dy,l=life or 20}) end
end
function say(s,n) msg=s msg_t=n or 90 end

function hazard_update()
 for h in all(hazards) do
  if h.t=="vent" then
   h.ht+=1
   local phase=(h.ht+h.ph)%h.period
   local prev=h.active
   h.active= phase<40
   if h.active and not prev then sfx(4,2,0,2) end
  else
   h.x+=h.d*h.sp
   if h.x<=h.xmin then h.x=h.xmin h.d=1 end
   if h.x>=h.xmax then h.x=h.xmax h.d=-1 end
  end
 end
end

function hazard_hit(h)
 if h.t=="vent" then
  if h.active then
   local top=h.y-18
   return p.x+6>h.x-3 and p.x+2<h.x+3 and p.y+7>top and p.y<top+42
  end
  return false
 else
  return p.x+6>h.x-h.r and p.x+2<h.x+h.r and p.y+7>h.y-h.r and p.y+1<h.y+h.r
 end
end

function solid_at(x,y)
 for b in all(BLOCK) do
  if x>=b[1]-1 and x<=b[2]+1 and y>=b[3]-1 and y<=b[3]+9 then return true end
 end
 return false
end

-- ================= update =================
function update_play()
 t+=1
 if msg_t>0 then msg_t-=1 end
 if shake>0 then shake-=1 end

 local dx=0
 if btn(0) then dx=-SPEED p.face=-1 end
 if btn(1) then dx=SPEED p.face=1 end

 local nx=mid(-2,p.x+dx,122)
 if not solid_at(nx+3,p.y+5) then p.x=nx end

 if p.on then p.coyote=7 elseif p.coyote>0 then p.coyote-=1 end

 if btnp(4) or btnp(5) then
  if p.coyote>0 then
   p.vy=JUMPV p.on=false p.coyote=0
   sfx(2,2,0,2)
   addpart(p.x+4,p.y+8,7,rnd(1)-0.5,-0.4,10)
  end
 end
 if not btn(4) and not btn(5) and p.vy<-1 then p.vy=-1 end

 p.vy=min(p.vy+GRAV,MAXFALL)
 p.y+=p.vy
 p.on=false
 for pl in all(PLAT) do
  if p.x+6>=pl[1]-1 and p.x+2<=pl[2]+1 then
   if p.vy>=0 and p.y+8>=pl[3] and p.y+8-p.vy<=pl[3]+1 then
    p.y=pl[3]-8 p.vy=0 p.on=true
   end
  end
 end
 if p.y>136 then hurt() end

 if dx~=0 and p.on then p.anim+=0.2 else p.anim=0 end
 if p.inv>0 then p.inv-=1 end

 hazard_update()

 if p.inv<=0 then
  for h in all(hazards) do
   if hazard_hit(h) then hurt() break end
  end
 end

 if state=="play" and p.on then
  for a in all(ANT) do
   if not a.fix and p.x+6>a.px and p.x+2<a.px2 and abs(p.y+8-a.py)<2 then
    if abs(p.x+4-a.x)<13 then
     if not a.armed then a.armed=true say("PRESS \^ TO REPAIR",70) end
     if btnp(2) then
      a.fix=true fixed+=1
      sfx(0,0,0,2)
      for i=1,10 do addpart(a.x+3,a.y-4,10,rnd(2)-1,-rnd(1.6),25) end
      if fixed>=3 then
       state="won" endframe=t shake=8 sfx(3,3,0,2)
       local sc=max(0,3000-deaths*200)-max(0,flr(t/60))
       if sc<0 then sc=0 end
       if sc>best then best=sc dset(0,best) end
      else
       say(fixed.."/3 ANTENNAS FIXED",80)
      end
     end
    end
   end
  end
 end

 for i=#parts,1,-1 do
  local q=parts[i]
  q.x+=q.dx q.y+=q.dy q.dy+=0.05 q.l-=1
  if q.l<=0 then del(parts,q) end
 end
end

function hurt()
 deaths+=1
 shake=12
 sfx(1,1,0,2)
 for i=1,14 do addpart(p.x+4,p.y+4,8,rnd(3)-1.5,rnd(2)-1.5,25) end
 if state=="play" then
  reset_player()
  say("OUCH! RETRYING",50)
 end
end

function _update60()
 if state=="title" then
  t+=1
  hazard_update()
  if btnp(4) or btnp(5) then start_game() end
 elseif state=="play" then
  update_play()
 elseif state=="won" then
  t+=1
  hazard_update()
  if t-endframe>50 and (btnp(4) or btnp(5)) then start_game() end
 end
end

-- ================= draw =================
function draw_bg(night)
 cls(0)
 for i=0,15 do
  local bx=i*8
  local bh=20+((i*37)%5)*6
  rectfill(bx,102-bh,bx+7,102,1)
  for wy=102-bh+3,98,6 do
   for wx=bx+1,bx+6,3 do
    if (wx+wy+i)%3==0 then pset(wx,wy,2) pset(wx+1,wy,2) end
   end
  end
 end
 for i=0,9 do
  local sx=(i*29+flr(t/4))%124+2
  local sy=4+((i*17)%26)
  pset(sx,sy,6)
 end
 circfill(110,12,6,6)
 circfill(107,10,5,0)
end

function draw_world()
 rectfill(0,112,127,127,5)
 rectfill(0,113,127,114,6)
 for i=1,#PLAT do
  local pl=PLAT[i]
  rectfill(pl[1],pl[3],pl[2],pl[3]+4,4)
  line(pl[1],pl[3]+5,pl[2],pl[3]+5,1)
  line(pl[1],pl[3],pl[2],pl[3],5)
 end
 for b in all(BLOCK) do
  rectfill(b[1],b[3],b[2],b[3]+9,4)
  rectfill(b[1],b[3],b[2],b[3]+1,5)
 end
 spr(S_CRATE,60,72)
 spr(S_CAT,100,104)
 -- ladders made of lines to hint vertical routes
 for i=1,#ANT do
  local a=ANT[i]
  if a.fix then
   spr(((t%40)<8) and S_FIX2 or S_FIX1,a.x,a.y-8)
   local r=((t*0.4)%9)
   circ(a.x+3,a.y-10,r,10)
  else
   spr(S_BROKEN,a.x,a.y-8)
   if (t%30)<15 then spr(S_SPARK,a.x+4,a.y-10) end
  end
 end
 for h in all(hazards) do
  if h.t=="drone" then
   spr(S_DRONE,h.x-4,h.y-4)
   line(h.x-5,h.y-5,h.x+4,h.y-5,6)
  elseif h.t=="bolt" then
   spr(S_BALL,h.x-4,h.y-4)
  elseif h.t=="vent" then
   spr(S_VENT,h.x-4,h.y+2)
   if h.active then
    for k=0,4 do
     local r=3-k*0.5
     circ(h.x+sin(t/4+k)*1,h.y-2-k*8,r,6)
    end
   end
  end
 end
 for q in all(parts) do
  pset(q.x,q.y,q.c)
 end
 if not (p.inv>0 and (t%6)<3) then
  local sp=S_HERO
  if not p.on then sp=S_HEROJ
  elseif (p.anim%1)>=0.5 then sp=S_HERO2 end
  if p.face<0 then
   spr(sp,p.x,p.y,1,1,true)
  else
   spr(sp,p.x,p.y)
  end
 end
end

function draw_hud()
 for i=1,3 do
  local c=5
  if i<=fixed then c=11 end
  rectfill(2+i*7,1,6+i*7,5,1)
  rectfill(3+i*7,2,5+i*7,4,c)
 end
 if state=="play" then
  print("\^FIX",104,1,6)
 end
 if msg_t>0 and msg~="" then
  local w=#msg*4
  rectfill(64-w/2-2,116,64+w/2+2,124,1)
  print(msg,64-w/2,118,7)
 end
end

function draw_title()
 cls(1)
 rectfill(0,100,127,127,5)
 rectfill(10,88,60,127,4)
 rectfill(72,80,120,127,2)
 rectfill(10,88,60,89,5)
 for i=0,20 do
  local sx=(i*23+3)%124+2
  local sy=(i*13)%58
  pset(sx,sy,6)
 end
 circfill(104,20,9,6) circfill(100,17,7,1)
 print("skyline",16,22,10)
 print("repair",44,32,9)
 print("fix 3 antennas fast",10,52,6)
 for i=1,3 do spr(S_BROKEN,26+i*26,64) end
 if (t%50)<30 then
  print("press o/x to climb",16,78,11)
 else
  print("move: arrows  fix: \^",14,78,10)
 end
 print("best "..best,44,116,7)
end

function draw_won()
 draw_world()
 rectfill(0,40,127,96,1)
 rect(0,40,127,96,11)
 print("all antennas fixed!",10,46,11)
 print("signal restored.",28,56,10)
 local sc=max(0,3000-deaths*200-flr(endframe/60))
 print("deaths "..deaths,20,68,7)
 print("score "..sc,20,76,9)
 print("best  "..best,20,84,9)
 if t-endframe>50 then
  if (t%40)<28 then print("o to play again",16,102,6) end
 end
end

function _draw()
 if state=="title" then
  draw_title()
  return
 end
 if shake>0 then camera(rnd(2)-1,rnd(2)-1) end
 draw_bg(false)
 draw_world()
 camera()
 draw_hud()
 if state=="won" then
  draw_won()
 end
end
