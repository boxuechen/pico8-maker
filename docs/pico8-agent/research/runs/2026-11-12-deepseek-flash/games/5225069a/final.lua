-- EMBER CROWN: arena boss in three phases.
-- Read the warning, slide out of the strike, then hit the crown in its opening.
-- All art, notes and state are authored in this file and rebuilt by _init.
-- SFX: 1/2 music (ch0/ch1), 10..17 feedback on channel 3.

--------------- assets ---------------
function wsfx(id,notes,speed,loop)
 local b=0x3200+id*68
 memset(b,0,68)
 for i,n in ipairs(notes) do
  poke(b+(i-1)*2,n[1]+(n[2]%4)*64)
  poke(b+(i-1)*2+1,flr(n[2]/4)+n[3]*2+n[4]*16)
 end
 poke(b+65,speed)
 if loop then poke(b+66,0) poke(b+67,#notes) end
end
function wpat(id,a,b,c,d) poke(0x3100+id*4,a,b,c,d) end
function art()
 local rows={
 -- 1 player courier (hooded kite)
 {"000aa000","00a77a00","0a7777a0","0a7777a0","00a55a00","0aa55aa0","0a0aa0a0","000aa000"},
 -- 2 crown core
 {"000a0000","00a9a000","0a9779a0","a977779a","a9777797","0a7777a0","00a77a00","000aa000"},
 -- 3 obsidian shard
 {"00070000","00077000","00077000","00077000","00077000","00070700","00070000","00000000"},
 -- 4 warning mote
 {"0000a000","000a9a00","00a79a00","0a7777a0","0a7777a0","00a55a00","000a0a00","000a0000"}}
 for n,rs in ipairs(rows) do
  for y=0,7 do for x=0,7 do
   sset(n*8+x,y,tonum("0x"..sub(rs[y+1],x+1,x+1)))
  end end
 end
 -- music: bass (sfx 1) + arp (sfx 2), 32 notes each, looped internally
 local bag={24,31,27,31} local bat={36,43,39,43}
 local bass,arp={},{}
 for i=1,32 do
  add(bass,{bag[1+flr((i-1)/4)%4],2,3,0})
  add(arp,{bat[1+flr((i-1)/2)%4],0,2,0})
 end
 wsfx(1,bass,14,true)
 wsfx(2,arp,14,true)
 wpat(0,1,2,0x40,0x40)
 -- feedback
 wsfx(10,{{48,2,3,3},{36,2,2,3}},8)                      -- warn beep
 wsfx(11,{{36,6,6,0},{24,6,5,3}},6)                      -- strike slam
 wsfx(12,{{60,0,4,0},{67,0,3,3}},10)                     -- player hurt
 wsfx(13,{{24,1,5,5},{31,1,4,5},{36,1,4,5},{43,1,4,5}},8)-- opening
 wsfx(14,{{43,0,5,0},{50,0,5,0},{55,0,5,0},{62,0,4,3}},7)-- counter hit
 wsfx(15,{{35,2,5,3},{43,0,5,3},{47,1,5,3},{50,0,4,3}},5)-- phase break
 wsfx(16,{{24,2,5,3},{31,0,5,3},{24,2,5,3},{19,0,5,3}},7)-- death
 wsfx(17,{{48,0,4,0},{55,3,3,0},{60,0,3,0},{62,1,3,0},{67,0,2,3}},6) -- victory
end
function snd(id) sfx(id,3,0,4) end

--------------- layout ---------------
CX,CY=64,42                 -- crown core center
GY,Y0,CELL=24,26,20         -- grid left x, grid top, cell size
ROWS=5
function cell_cx(i) return GY+8+i*CELL end
function cell_cy(j) return Y0+8+j*CELL end

--------------- state ---------------
local save_id="ember_crown_v1"
function newrun()
 px,py=16,104 hp=3 hits=0 phase=1 beat=1
 mode="title" t=0 inv=0 shake=0 flash=0 cflash=0
 shards={} orbs={} zone=nil hits_left=0
end
function _init()
 art()
 cartdata(save_id)
 best=mid(0,flr(dget(0)),999)
 newrun()
 state="title"
 music(0,300,3)
end
function start_run()
 px,py=16,104 hp=3 hits=0 phase=1 beat=1
 inv=0 shake=0 cflash=0 shards={} orbs={}
 state="play"
 begin_beat()
end
function warn_ticks()
 if phase==1 then return 46 elseif phase==2 then return 38 else return 30 end
end
function open_ticks()
 if phase==3 then return 66 else return 78 end
end
function hits_needed() return 4-phase end

function begin_beat()
 mode="warn" t=warn_ticks() warned=false
 shards={} orbs={}
 hits_left=hits_needed()
 local pcol=mid(0,flr((px-GY)/CELL),4)
 local prow=mid(0,flr((py-Y0)/CELL),4)
 local kind=flr(rnd(3)) -- 0 col, 1 row, 2 cross
 if phase==1 then kind=(beat%2==0) and 1 or 0 end
 if phase==2 and kind==2 then kind=flr(rnd(2)) end
 if phase==1 and beat==1 then kind=1 prow=1 end
 local index
 if kind==0 then index=pcol else index=prow end
 zone={kind=kind,index=index}
end
function next_beat() beat+=1 begin_beat() end

function hit_zone()
 if zone==nil then return false end
 local pcol=mid(0,flr((px-GY)/CELL),4)
 local prow=mid(0,flr((py-Y0)/CELL),4)
 if zone.kind==0 then return pcol==zone.index end
 if zone.kind==1 then return prow==zone.index end
 return pcol==zone.index or prow==zone.index
end

function hurt()
 if inv>0 then return end
 hp-=1 inv=50 shake=8 flash=8 snd(12)
 if hp<=0 then
  if hits>best then best=hits dset(0,hits) end
  state="dead" snd(16) music(-1,500)
 end
end

function _update60()
 shake=max(0,shake-1) inv=max(0,inv-1)
 cflash=max(0,cflash-1) flash=max(0,flash-1)
 if state=="title" or state=="dead" or state=="won" then
  if btnp(5) or btnp(4) then
   music(0,300,3)
   start_run()
  end
  return
 end
 -- movement
 local sp=1.7
 local dx=(btn(1) and 1 or 0)-(btn(0) and 1 or 0)
 local dy=(btn(3) and 1 or 0)-(btn(2) and 1 or 0)
 if dx!=0 and dy!=0 then dx*=0.71 dy*=0.71 end
 px=mid(8,px+dx*sp,120) py=mid(20,py+dy*sp,118)

 t-=1
 if mode=="warn" then
  if t==8 and not warned then warned=true snd(10) end
  if t<=0 then
   mode="attack" t=18 shake=6 snd(11)
   if zone.kind==0 or zone.kind==2 then
    add(orbs,{x=cell_cx(zone.index),y=-6,yl=CY})
   end
   if zone.kind==1 or zone.kind==2 then
    add(shards,{x=GY-10,y=cell_cy(zone.index),xl=CX})
    add(shards,{x=128+10,y=cell_cy(zone.index),xl=CX})
   end
  end
 elseif mode=="attack" then
  for o in all(orbs) do o.y=min(o.yl,o.y+7) end
  for s in all(shards) do
   local v=(s.x<CX) and 8 or -8
   s.x=mid(s.xl-40,s.x+v,s.xl+40)
  end
  if t>9 and hit_zone() then hurt() end
  if t<=0 then
   mode="open" t=open_ticks()
   shards={} orbs={}
   snd(13)
  end
 elseif mode=="open" then
  if btnp(5) then
   if (px-CX)^2+(py-CY)^2<26*26 then
    hits+=1 hits_left-=1 cflash=12 shake=3 snd(14)
    if hits_left<=0 then
     phase+=1
     shards={} orbs={}
     if phase>3 then
      if hits>best then best=hits dset(0,hits) end
      state="won" snd(17) music(-1,800)
     else
      snd(15) beat=1 begin_beat()
     end
    end
   end
  elseif t<=0 then
   next_beat()
  end
 end
end

--------------- draw ---------------
function draw_grid()
 local zc=zone and zone.index
 local pi=mid(0,flr((px-GY)/CELL),4)
 local pj=mid(0,flr((py-Y0)/CELL),4)
 for j=0,ROWS-1 do
  for i=0,ROWS-1 do
   local x=GY+i*CELL y=Y0+j*CELL
   local inzone=zone~=nil and ((zone.kind==0 and i==zc) or (zone.kind==1 and j==zc) or (zone.kind==2 and (i==zc or j==zc)))
   if inzone and mode=="warn" then
    local p=flr(t/5)%2
    rectfill(x,y,x+CELL-1,y+CELL-1,p==0 and 4 or 1)
    rect(x,y,x+CELL-1,y+CELL-1,9)
    if p==1 then sspr(24,0,8,8,x+6,y+6,8,8) end
   elseif inzone and mode=="attack" then
    rectfill(x,y,x+CELL-1,y+CELL-1,8)
    rect(x,y,x+CELL-1,y+CELL-1,7)
   else
    rect(x,y,x+CELL-1,y+CELL-1,5)
    if i==pi and j==pj then rect(x+1,y+1,x+CELL-2,y+CELL-2,1) end
   end
  end
 end
end
function draw_crown(cx,cy)
 local open=(mode=="open")
 if open then
  for r=26,18,-4 do circ(cx,cy,r,(t%12<6) and 10 or 2) end
 elseif mode=="warn" then
  circ(cx,cy,24+flr(sin(time()*4)*2),5)
 end
 if cflash>0 then
  circfill(cx,cy,12,cflash>6 and 7 or 10) spr(2,cx-4,cy-4) return
 end
 spr(2,cx-4,cy-4)
 if phase==2 then
  sspr(16,0,8,8,cx-9,cy-3,6,6)
  sspr(16,0,8,8,cx+3,cy-3,6,6)
 elseif phase==3 then
  for a=0,2 do
   local ang=time()*0.7+a/3
   sspr(16,0,8,8,cx-4+cos(ang)*11,cy-4+sin(ang)*11,6,6)
  end
 end
end
function draw_player()
 if inv>0 and flr(inv/4)%2==0 then return end
 if mode=="open" and (px-CX)^2+(py-CY)^2<26*26 then circ(px,py,7,10) end
 spr(1,px-4,py-4)
end
function banner(title,sub,sub2)
 rectfill(4,44,124,92,0) rect(4,44,124,92,6)
 rectfill(4,44,124,47,9)
 print(title,8,50,10)
 print(sub,8,60,7)
 print(sub2 or "",8,70,11)
end
function _draw()
 cls(0)
 for j=0,ROWS-1 do
  for i=0,ROWS-1 do
   if (i+j)%2==0 then
    rectfill(GY+i*CELL,Y0+j*CELL,GY+(i+1)*CELL-1,Y0+(j+1)*CELL-1,0)
   end
  end
 end
 rect(4,18,124,122,5)
 print("ember crown",2,2,9)
 print("goal:"..hits.."/3",2,10,7)
 for i=1,3 do rectfill(62+i*12,2,70+i*12,10,(i<=phase) and 8 or 5) end
 for i=1,3 do circfill(6+i*7,16,2,(i<=hp) and 11 or 5) end
 print("best:"..best,92,16,6)
 if shake>0 then camera(rnd(3)-1.5,rnd(3)-1.5) end
 draw_grid()
 local cx,cy=CX,CY
 draw_crown(cx,cy)
 for s in all(shards) do spr(3,s.x-4,s.y-4) end
 for o in all(orbs) do spr(4,o.x-4,o.y-4) end
 draw_player()
 camera()
 if flash>0 and flr(flash/2)%2==0 then rectfill(0,0,127,127,8) end
 if mode=="warn" then print("warning! leave the amber lane",4,111,9)
 elseif mode=="attack" then print("strike! stay out",4,111,8)
 else print("open! x on the crown",4,111,10) end
 if state=="title" then
  banner("ember crown","3 phases, 3 warnings each","arrows move  x counter  o retry")
 elseif state=="dead" then
  banner("crown flares","hits:"..hits.."  best:"..best,"x or o: retry")
 elseif state=="won" then
  banner("crown quenched!","hits:"..hits.." in one run","x or o: again")
 end
end
