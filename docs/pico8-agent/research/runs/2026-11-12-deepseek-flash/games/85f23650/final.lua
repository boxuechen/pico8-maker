-- THIRSTY SEASON  (turn-based garden puzzle)
-- 12 days, 10 water, 3 seedbeds.
--  O = pour 1 water into the chosen bed (a grown plant also ages the night)
--  X = pick a ripe plant
--  < > = choose bed,   UP (hold) + X = help
--  Ripe plants never shrink. Unwatered nights dry the whole garden.

local SAVE="thirsty_season_garden_v1"
local SL_SCHEMA,SL_BESTH,SL_RUNS=0,1,3

NAMES={[1]="SPROUT",[2]="PETAL",[3]="SUNFRUIT"}
NEED={[1]=2,[2]=3,[3]=3}
MAXH=6

-- ---------------- art ----------------
local spr_stage={}
local next_spr=1
local function put_sprite(n,rows)
 local ox=(n%16)*8 local oy=flr(n/16)*8
 for y=0,7 do
  for x=0,7 do
   sset(ox+x,oy+y,tonum("0x"..sub(rows[y+1],x+1,x+1)))
  end
 end
end
local function add_sprite(rows)
 local id=next_spr
 next_spr+=1
 if next_spr>16 then next_spr=1 end
 put_sprite(id,rows)
 return id
end
local function plant_art(kind,stage)
 local r={}
 for y=0,7 do r[y+1]="00000000" end
 local function put(x,y,col)
  r[y+1]=sub(r[y+1],1,x)..col..sub(r[y+1],x+2)
 end
 local stem=3
 local leaf=11
 if kind==1 then leaf=11
 elseif kind==2 then leaf=14
 else leaf=9 end
 if stage>=1 then put(4,6,stem) end
 if stage>=2 then put(4,5,stem) put(3,5,leaf) put(5,5,leaf) end
 if stage>=3 then
  put(4,4,stem) put(4,3,leaf)
  put(2,4,leaf) put(6,4,leaf) put(3,4,stem) put(5,4,stem)
 end
 if stage==4 then
  put(4,2,leaf) put(3,2,leaf) put(5,2,leaf)
  put(5,1,7) put(4,1,leaf)
 end
 -- roots
 if stage>=3 then put(3,6,4) put(4,7,4) put(5,6,4) end
 return r
end
for kind=1,3 do
 spr_stage[kind]={}
 for stage=1,4 do spr_stage[kind][stage]=add_sprite(plant_art(kind,stage)) end
end

-- ---------------- sound ----------------
function write_sfx(id,notes,speed)
 local base=0x3200+id*68
 memset(base,0,68)
 for i,n in ipairs(notes) do
  local k,w,v,e=n[1],n[2],n[3],n[4]
  poke(base+(i-1)*2,k+(w%4)*64)
  poke(base+(i-1)*2+1,flr(w/4)+v*2+e*16)
 end
 poke(base+65,speed)
end

local function init_sound()
 write_sfx(10,{{48,3,3,0},{52,3,3,0}},10)           -- cursor
 write_sfx(11,{{44,5,2,4},{48,4,2,4},{52,3,2,4}},7) -- water pour
 write_sfx(12,{{52,0,5,0},{55,0,5,0},{60,0,4,5}},8) -- harvest
 write_sfx(13,{{60,3,4,2}},10)                      -- pluck/nope
 write_sfx(14,{{24,6,2,6},{22,6,2,6}},10)           -- dry crackle
 write_sfx(15,{{24,1,4,0},{25,1,4,0},{26,1,4,0},{27,1,4,0},{28,1,4,0},{27,1,4,0}},
  12)                                               -- night drip
 write_sfx(16,{{48,0,4,0},{52,0,4,0},{55,0,4,0},{60,0,4,0},
  {55,0,4,0},{52,0,4,0},{48,0,4,0},{43,0,4,0}},10)  -- start
 write_sfx(17,{{36,0,3,0},{43,0,3,0},{48,0,3,0},{55,0,3,0},{60,0,4,2}},8)
end

-- ---------------- boot ----------------
function _init()
 init_sound()
 cartdata(SAVE)
 local v=dget(SL_SCHEMA)
 save_ok=(v==0 or v==1)
 best_h=mid(0,flr(dget(SL_BESTH)),600)
 runs_seen=mid(0,flr(dget(SL_RUNS)),30000)
 if v~=1 then
  dset(SL_BESTH,best_h) dset(SL_RUNS,runs_seen) dset(SL_SCHEMA,1)
 end
 srand(7)
 state="title" sel=1 frame=0
 end

-- ---------------- rules ----------------
function new_game()
 day=1 water=10 seeds=1
 beds={}
 for i=1,3 do beds[i]={kind=nil,age=0,thirst=0} end
 sel=1 log="A NEW SEASON. O POURS WATER." logcol=6
 outcome=nil score=0
 state="play"
end

function night()
 local dried=false
 local ripe_count=0
 for i=1,3 do
  local b=beds[i]
  if b.kind~=nil then
   if b.age>=4 then
    ripe_count+=1          -- ripe plants hold for the picker
   elseif b.thirst>0 then
    b.thirst-=1            -- a watered plant is fed by yesterday's water
   else
    b.age-=1               -- an unwatered night shrinks it
    dried=true
   end
  end
 end
 if ripe_count>=2 then sfx(14,3,0,2) end
 if dried then
  log="DRY NIGHT! PLANTS WILTED." logcol=8
 else
  log="NIGHT FALLS. DRY BEDS WAIT." logcol=6
 end
 day+=1
 if day>12 then finish() end
end

function do_water()
 local b=beds[sel]
 if b.kind==nil then
  log="BARE SOIL. PLANT OR PICK ELSEWHERE." logcol=5 sfx(13,3) return
 elseif b.age>=4 then
  log="ALREADY RIPE. PRESS X." logcol=10 sfx(13,3) return
 elseif water<=0 then
  log="NO WATER LEFT. THE SEASON ENDS SOON." logcol=8 sfx(13,3) return
 end
 water-=1
 b.age+=1
 b.thirst=NEED[b.kind]
 sfx(11,3,0,3)
 if b.age>=4 then
  log="IT IS RIPE! PRESS X TO PICK." logcol=10
 else
  log="DRANK 1 WATER. GREW A STAGE." logcol=12
 end
 night()
end

local YIELD={[1]=2,[2]=1,[3]=3}
function do_harvest()
 local b=beds[sel]
 if b.kind==nil then log="NOTHING TO PICK HERE." logcol=5 sfx(13,3) return end
 if b.age<4 then log="TOO YOUNG TO PICK." logcol=5 sfx(13,3) return end
 local k=b.kind
 local y=YIELD[k]
 if k==1 then water+=2 elseif k==2 then seeds+=1 else water+=3 end
 score+=y
 sfx(12,3,0,3)
 log=NAMES[k].." PICKED: +"..y.." "..({[1]="WATER",[2]="SEED",[3]="WATER"})[k]
 logcol=11
 beds[sel]={kind=nil,age=0,thirst=0}
 night()
end

function do_plant()
 local b=beds[sel]
 if b.kind~=nil then log="BED IS OCCUPIED." logcol=5 sfx(13,3) return end
 if seeds<=0 then log="NO SEEDS. PICK A PETAL." logcol=5 sfx(13,3) return end
 seeds-=1
 b.kind=1 b.age=1 b.thirst=NEED[1]
 sfx(13,3)
 log="SPROUT PLANTED." logcol=11
end

function yield_score()
 local s=0
 for i=1,3 do
  local b=beds[i]
  if b.kind then
   if b.age>=4 then s+=3
   elseif b.age==3 then s+=1 end
  end
 end
 return s
end

function finish()
 local s=score
 for i=1,3 do
  local b=beds[i]
  if b.kind then
   if b.age>=4 then s+=3 elseif b.age==3 then s+=1 end
  end
 end
 score=s
 local rank="BARE PATCH"
 if s>=MAXH then rank="MASTER GARDENER"
 elseif s>=5 then rank="STEADY HAND"
 elseif s>=3 then rank="LUCKY PATCH" end
 outcome={score=s,rank=rank}
 if s>best_h then
  best_h=s
  if save_ok then dset(SL_BESTH,best_h) dset(SL_RUNS,runs_seen+1) end
 end
 runs_seen+=1
 state="over"
 sfx(17,3,0,4)
end

-- ---------------- update ----------------
function _update()
 frame+=1
 if state=="title" then
  if btnp(4) or btnp(5) then
   new_game() sfx(16,3,0,4)
  end
  return
 elseif state=="over" then
  if btnp(4) or btnp(5) then new_game() end
  return
 end
 if btnp(0) then sel=max(1,sel-1) sfx(10,3,0,1) end
 if btnp(1) then sel=min(3,sel+1) sfx(10,3,0,1) end
 if btnp(4) then do_water() end
 if btnp(5) then do_harvest() end
end

-- ---------------- drawing ----------------
function draw_sky()
 rectfill(0,0,127,30,12)
 rectfill(0,30,127,45,13)
 circfill(110,9,7,9)
 circfill(110,9,4,10)
 local cx=lambda or 0
end

function draw_bed(i)
 local bx=5+(i-1)*41
 local by=50
 local b=beds[i]
 rectfill(bx,by,bx+38,by+58,4)
 rectfill(bx+2,by+2,bx+36,by+56,2)
 for r=0,8 do
  local yy=by+3+r*6
  local c=3
  if b.thirst>0 then c=3+(r%2) else c=1 end
  rectfill(bx+3,yy,bx+35,yy+4,c)
 end
 if sel==i then
  rect(bx-1,by-1,bx+39,by+59,10)
  rect(bx-2,by-2,bx+40,by+60,9)
 end
 if b.kind then
  local spr=spr_stage[b.kind][min(b.age,4)]
  spr(spr,bx+8,by+6)
  -- age bar
  for t=0,3 do
   local c=5
   if t<(b.thirst) then c=12 end
   if b.age>=4 then c=10 end
   rectfill(bx+22+t*3, by+46, bx+23+t*3, by+48, c)
  end
  if b.age>=4 then
   pset(bx+24,by+3,7) pset(bx+25,by+4,7) pset(bx+4,by+2,7)
  end
 else
  print("PLANT",bx+15,by+26,6)
 end
end

function draw_hud()
 rectfill(0,118,127,127,1)
 print("WATER "..water,2,120,12)
 print("SEED "..seeds,52,120,11)
 local r=0 for i=1,3 do local b=beds[i] if b.kind and b.age>=4 then r+=1 end end
 print("RIPE "..r,92,120,10)
 rectfill(0,108,127,117,1)
 print(log or "",2,110,logcol)
end

function draw_garden()
 rectfill(0,0,127,127,3)
 rectfill(0,0,127,29,12)
 rectfill(0,29,127,45,13)
 -- sun and clouds
 circfill(112,8,7,9) circfill(112,8,4,10)
 local t=frame/6
 circfill(20+sin(t)*4,16,5,7) circfill(26+sin(t)*4,15,6,7) circfill(32+sin(t)*4,17,4,7)
 print("DAY "..day.."/12",3,3,1)
 print("WATER "..water,88,3,1)
 -- soil band
 rectfill(0,46,127,127,3)
 for i=0,3 do draw_bed(i+1) end
 draw_hud()
end

function _draw()
 cls(1)
 if state=="title" then
  rectfill(0,0,127,127,12)
  rectfill(0,54,127,127,3)
  circfill(102,20,8,10)
  rectfill(0,90,127,127,4)
  for i=0,2 do
   spr(spr_stage[1][i+1],20+i*20,40+sin(frame/20+i)*2)
   spr(spr_stage[2][i+1],30+i*20,36+cos(frame/20+i)*2)
  end
  print("thirsty",26,60,7)
  print("season",20,72,10)
  print("a garden of twelve days",6,98,7)
  if sin(frame/10)>0 then print("press o to garden",14,112,10) end
  print("best "..best_h,2,2,7)
  return
 elseif state=="over" then
  draw_garden()
  rectfill(8,34,119,102,1)
  rect(7,33,120,103,10)
  print("THE SEASON ENDS",14,38,10)
  print("HARVEST "..((outcome and outcome.score) or 0),18,52,7)
  print((outcome and outcome.rank) or "",18,64,11)
  print("BEST "..best_h,18,76,9)
  if sin(frame/10)>0 then print("o: new season",26,88,6) end
  return
 end
 draw_garden()
end