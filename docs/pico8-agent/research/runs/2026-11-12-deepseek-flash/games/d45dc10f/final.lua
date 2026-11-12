-- RAIN GARDEN: turn-based garden puzzle over a 6-day season.
-- New original code, pixel art and note data.
-- O = pour water, X = sow seed, down = rest a day, arrows = pick plot.
-- Each action spends one day. Next day's weather is shown before it arrives.
SAVEID="rain_garden_v1"
SSCHEMA=0 SBEST=1
COST={0,1,2}
MAXW=3
SKYN={"sunny","cloudy","rainy"}
KINDN={"seed","sprout","bud"}

function write_sfx(id,notes,speed)
 local b=0x3200+id*68
 memset(b,0,68)
 for i,n in ipairs(notes) do
  poke(b+(i-1)*2,n[1]+(n[2]%4)*64)
  poke(b+(i-1)*2+1,flr(n[2]/4)+n[3]*2+n[4]*16)
 end
 poke(b+65,speed) poke(b+67,#notes)
end
function write_pattern(id,ch,sl,el)
 local b=0x3100+id*4
 for i=1,4 do
  local c=ch[i] local v=c<0 and 64 or c
  if i==1 and sl then v+=128 end
  if i==2 and el then v+=128 end
  poke(b+i-1,v)
 end
end
function mel(keys,wave,vol)
 local t={}
 for i=1,32 do add(t,{keys[1+flr((i-1)/4)%#keys],wave,vol,0}) end
 return t
end
function assets()
 write_sfx(0,{{43,5,3,0},{48,5,2,0}},7)
 write_sfx(1,{{43,5,3,0},{38,5,2,0}},7)
 write_sfx(2,{{30,6,3,0},{26,6,2,1},{22,6,1,1}},12)
 write_sfx(3,{{33,0,4,0},{38,0,3,0},{42,0,2,3}},8)
 write_sfx(4,{{48,0,4,0},{43,0,3,0},{36,0,2,0},{43,0,2,0}},7)
 write_sfx(5,{{17,3,3,3},{12,5,2,3},{8,6,1,3}},14)
 write_sfx(6,{{26,5,4,0},{31,5,3,0},{36,5,2,2}},12)
 write_sfx(7,{{20,4,3,3}},10)
 write_sfx(8,{{24,0,4,0},{31,0,4,0},{36,0,4,0},{43,0,3,3}},6)
 write_sfx(10,mel({24,31,29,31},5,3),7)
 write_sfx(11,mel({12,12,19,16},0,2),7)
 write_pattern(0,{10,11,-1,-1},true,false)
 write_pattern(1,{10,11,-1,-1},false,true)

 local art={
 {"00000000","00000000","00011000","00111000","00011100","00001100","00000000","00000000"},
 {"00000000","00001000","00011100","00010100","00011100","00001000","00000000","00000000"},
 {"00000000","00000000","00011000","00022000","00322000","00033000","00003000","00000000"},
 {"00000000","00000000","00011000","00022000","00322000","00033000","00003200","00000000"},
 {"00000000","00440000","04444000","04455400","00044200","00003300","00003000","00000000"},
 {"00000000","00440000","04444400","04455400","00044200","00003300","00003000","00000000"},
 {"00000000","00aa0000","0aaaa000","aa99aa00","0aaaa440","00a44440","00003300","00000000"},
 {"00000000","000aa000","0aaa9a00","0aa99a00","00aa4440","00044440","00003300","00000000"},
 {"00000000","00000000","00400000","00004000","00504000","00055000","00005000","00000000"},
 {"00000000","00040000","00004000","00400000","00055000","00005000","00050000","00000000"},
 {"00000000","00000000","00000000","00000000","00000000","00000000","00000000","00000000"},
 {"00000000","00000000","00000000","00000000","00000000","00000000","00000000","00000000"},
 {"00000000","00000000","00333000","03666300","36666630","36666630","33333330","00000000"},
 {"00000000","000cc000","00cccc00","0cccccc0","0cccccc0","00cccc00","000cc000","00000000"},
 {"00000000","00a000a0","000aaa00","00aaaa00","0aaaaaa0","00aaaa00","000aaa00","00a000a0"},
 {"00000000","00000000","00000000","04400440","00444400","00044000","00000000","00000000"},
 }
 for n=1,#art do
  local sy=flr((n-1)/16)*8 local sx=((n-1)%16)*8
  for y=0,7 do for x=0,7 do
   sset(sx+x,sy+y,tonum("0x"..sub(art[n][y+1],x+1,x+1)))
  end end
 end
 music(0,0,3)
end

scenarios={
 {0,2,0,0,2,0,0},
 {0,0,2,4,4,0,0},
 {0,0,0,2,5,0,2},
 {2,0,4,0,0,5,1},
}

function _init()
 assets()
 cartdata(SAVEID)
 local v=dget(SSCHEMA)
 save_ok=v==0 or v==1
 best=mid(0,flr(dget(SBEST)),999)
 if v==0 then dset(SBEST,best) dset(SSCHEMA,1) end
 state="title" scenario=1 tick=0
 label="" labelt=0 flash=0
 day=1 sky=0 water=7 harvested=0 sel=1 flower={} queue={}
end

function start_game(s)
 sky=s[7] or 0
 queue={}
 for i=1,6 do queue[i]=s[i] or 0 end
 water=7 day=1 harvested=0
 flower={} sel=1
 flash=0 label="" labelt=0
 tick=tick or 0
 state="play"
end

function make_stage(k) return {kind=k,dose=0,dead=false,harv=false} end

function next_day()
 day+=1
 for i=1,4 do
  local f=flower[i]
  if f and not f.dead and not f.harv then
   if sky==2 then
    f.dose+=1
    if f.dose>=MAXW then f.dead=true label="rain drowned plot "..i labelt=45 sfx(5,3)
    elseif f.dose==MAXW-1 then label="plot "..i.." soaked" labelt=40 end
   elseif sky==0 and f.dose>0 then
    f.dose-=1
   end
  end
 end
 local q=queue[day] or 0
 if q==1 then sky=2
 elseif q==2 then sky=0
 elseif q==3 then sky=1 end
end

function pour()
 local f=flower[sel]
 if not f then label="empty plot, sow with x" labelt=30 sfx(7,3) return end
 if f.dead then label="dead soil, sow again" labelt=30 sfx(7,3) return end
 if f.harv then label="already picked" labelt=30 sfx(7,3) return end
 local cost=COST[f.dose+1]
 if water<cost then label="need "..cost.." water" labelt=30 sfx(7,3) return end
 water-=cost
 f.dose+=1
 if f.kind<3 then f.kind+=1 end
 sfx(2,3)
 if f.dose>=MAXW then
  if sky==0 then
   f.kind=4 f.harv=true f.dose=2
   harvested+=1 flash=12
   label="BLOOM! +4" labelt=45 sfx(4,3)
  else
   label="bud waits for sun" labelt=40 sfx(7,3)
  end
 elseif f.dose==2 then label="bud forming" labelt=30
 else label="it sprouts" labelt=30 end
 next_day()
end

function sow()
 if water<1 then label="jug is empty" labelt=30 sfx(7,3) return end
 if sky==2 then label="too wet to sow" labelt=30 sfx(7,3) return end
 local f=flower[sel]
 if f and not f.dead and not f.harv then label="plot is taken" labelt=30 sfx(7,3) return end
 water-=1
 flower[sel]=make_stage(1)
 label="seed in plot "..sel labelt=30
 sfx(3,3) next_day()
end

function rest()
 local gain=sky==2 and 2 or 1
 if water>=9 then label="jug already full" labelt=30
 else water=min(water+gain,9) label="rest, +"..gain.." water" labelt=35 end
 sfx(6,3) next_day()
end

function end_season()
 for i=1,4 do
  local f=flower[i]
  if f then f.dead=f.dead or not f.harv end
 end
 score=harvested*4+water
 state="end"
 if score>best then best=score if save_ok then dset(SBEST,best) end end
 sfx(8,3)
end

function _update60()
 tick+=1
 if flash>0 then flash-=1 end
 if labelt>0 then labelt-=1 end
 if state=="title" then
  if btnp(4) then start_game(scenarios[scenario]) end
  if btnp(5) then state="pick" end
 elseif state=="pick" then
  if btnp(2) then scenario=max(1,scenario-1) sfx(1,3) end
  if btnp(3) then scenario=min(#scenarios,scenario+1) sfx(0,3) end
  if btnp(4) or btnp(5) then start_game(scenarios[scenario]) end
 elseif state=="play" then
  if btnp(0) then sel=max(1,sel-1) sfx(1,3) end
  if btnp(1) then sel=min(4,sel+1) sfx(0,3) end
  if btnp(4) then pour() elseif btnp(5) then sow() end
  if btnp(3) then rest() end
  if state=="play" and day>6 then end_season() end
 elseif state=="end" then
  if btnp(5) then start_game(scenarios[scenario]) end
  if btnp(4) then state="title" end
 end
end

-- ---------------- drawing ----------------
function sky_icon(x,y)
 if sky==0 then spr(16,x,y)
 elseif sky==2 then spr(12,x,y) spr(12,x+4,y+2)
 else spr(12,x,y) end
end

function plot_x(i) return 10+(i-1)*29 end

function draw_plant(i)
 local f=flower[i]
 local x,y=plot_x(i)+5,84
 if not f then return end
 if f.dead then spr(9,x,y) return end
 if f.harv then
  spr(7+flr(tick/8)%2,x,y)
  if flash>0 then circfill(x+4,y+4,7+flash,10) end
  return
 end
 if f.kind==1 then spr(1,x,y)
 elseif f.kind==2 then spr(3+flr(tick/16)%2,x,y)
 else spr(5+flr(tick/16)%2,x,y) end
end

function draw_play()
 rectfill(0,14,127,32,sky==0 and 12 or sky==2 and 1 or 13)
 for i=0,3 do sky_icon(4+i*30,16) end
 print(SKYN[sky+1].." today",2,26,sky==0 and 1 or 7)
 local q=queue[day+1] or 0
 local nm="calm"
 if q==1 then nm="rain" elseif q==2 then nm="sun" elseif q==3 then nm="cloud" end
 print("next:",78,16,7)
 print(day>=6 and "season ends" or nm,104,16,q==1 and 14 or q==2 and 10 or 7)
 print("day "..min(day,6).."/6",2,2,7)
 print("water",40,2,12)
 for w=1,9 do
  rectfill(38+w*5,3,42+w*5,9,water>=w and 12 or 5)
 end
 print("blooms "..harvested,92,2,10)
 for i=1,4 do
  local x=plot_x(i)
  local f=flower[i]
  local soil=3
  if f and f.dead then soil=5 elseif f and f.harv then soil=4 end
  rectfill(x,102,x+26,118,soil)
  rectfill(x,102,x+26,103,11)
  if f and not f.dead and not f.harv then
   for d=1,f.dose do rectfill(x+2+(d-1)*3,94,x+3+(d-1)*3,97,12) end
  end
  if i==sel then
   local c=(tick/10)%2<1 and 10 or 7
   rect(x-1,82,x+27,119,c)
  end
  draw_plant(i)
  print(tostring(i),x+12,107,7)
 end
 rectfill(0,119,127,127,3)
 for g=0,15 do if g%2==0 then rectfill(g*8+2,120,g*8+5,121,11) end end
 if labelt>0 then
  rectfill(2,34,126,44,0)
  print(label,4,36,10)
 else
  print("o pour  x sow  down rest",2,35,6)
 end
 local f=flower[sel]
 print(sel..":",4,47,7)
 if not f then print("empty plot",16,47,6)
 elseif f.dead then print("dead soil",16,47,8)
 elseif f.harv then print("picked +4",16,47,10)
 else print(KINDN[f.kind].."  water "..f.dose.."/3",16,47,6) end
 local nf=queue[day+1] or 0
 if nf==1 then print("rain keeps falling",4,56,14)
 elseif nf==2 then print("sun dries soil",4,56,10) end
end

function _draw()
 cls(0)
 if state=="play" then draw_play() return end
 rectfill(0,0,127,127,1)
 rectfill(0,96,127,127,3)
 for i=1,12 do
  local x=(i*17+tick/2)%128
  if x<120 then spr(3+(i%2),x,100+((i%3)*6)) end
 end
 if state=="title" then
  print("rain garden",20,18,10)
  print("a six day season",26,28,12)
  print("o: play",6,46,7)
  print("x: pick weather",6,56,7)
  print("arrows + o/x in play",6,66,6)
  print("best "..best,6,80,10)
  print("blooms and kept water score",4,112,6)
 elseif state=="pick" then
  print("choose weather",18,16,10)
  for i=1,#scenarios do
   local s=scenarios[i]
   local y=28+(i-1)*16
   local on=i==scenario
   rectfill(10,y,117,y+13,on and 12 or 5)
   local col=on and 0 or 7
   local w=s[7]==2 and "rainy" or s[7]==1 and "cloudy" or "sunny"
   print((on and "> " or "  ")..w,y+3,col)
  end
  print("up/down pick  o start",4,100,7)
  print("x back",4,112,6)
 elseif state=="end" then
  print("season over",28,14,10)
  print("blooms "..harvested,16,32,7)
  print("kept water "..water,16,42,12)
  print("score "..(harvested*4+water),16,56,10)
  print((harvested*4+water)>=best and "new best!" or "best "..best,16,66,11)
  print("x: same weather",12,84,7)
  print("o: title",12,94,6)
 end
end
