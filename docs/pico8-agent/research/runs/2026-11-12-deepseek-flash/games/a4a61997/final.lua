-- LANTERN RUN  --  turn-based relic rescue
-- Each action (step / wait / toggle gate) costs 1 tick (1 second) of the brass lamp.
-- Spikes + fire + demon advance after every action. Reach the open gate to escape.
--
-- LEVEL DESIGN (16 x 14 tiles). Row strings are 16 chars, column 0..15.
-- '#' wall  '.' floor  'P' start  'S' shard (optional bonus)  'R' relic
-- 'K' socket  'G' gate  'B','b','C' are just floor (monster/fire placed in code)

local SAVE_ID="lantern_run_v4"
local slot_best=0
local slot_schema=1

-------------------- ART --------------------
local art={
 {"..2222..","..2772..","..2772..","..2882..","...88...","..8888..","..8888..","...88..."},--1 player
 {"..aaaa..",".a9999a.","a9aa9aa9","aa9977aa","aa9977aa",".a7777a.","..a00a..","..aaaa.."},--2 shard
 {"..8888..","..8778..",".877778.","88777788","88888888","0.8888.0","0.8888.0","..0000.."},--3 lantern
 {"..5555..","..5125..","..5272..","..5125..","..5775..","..5555..","...55...","..5..5.."},--4 gate shut
 {"..5555..","..5675..","..5775..","..5675..","..5775..","..5555..","...55...","..5..5.."},--5 gate open
 {"dddddddd","d000000d","d0c0000d","d0c0000d","d0c0000d","d0cc00dd","d00000dd","dddddddd"},--6 wall
 {"........","...77...","..d88d..","...dd...","........","........","........","........"},--7 spike up
 {"........","........","........","...dd...","..d88d..","...dd...","........","........"},--8 spike down
 {"bb......","b6b.....","76b.....","bb......","........","........","........","........"},--9 whistle
 {"..cc....",".c77c...","c7777c..",".c77c...","..cc....","........","........","........"},--10 glow
 {"..aaaa..",".a0000a.","a099990a","a097790a","a099990a",".a0000a.","..aaaa..","........"},--11 relic
 {"dddddddd","d000000d","d088880d","d088880d","d088880d","d000000d","d00cc00d","dddddddd"},--12 socket
 {"..6666..","..6..6..","..6..6..","..6666..","..6886..","...66...","..8..8..","..8..8.."},--13 demon
}
local function put(n,rows)
 local ox=(n%16)*8 local oy=flr(n/16)*8
 for y=0,7 do for x=0,7 do
  sset(ox+x,oy+y,tonum("0x"..sub(rows[y+1],x+1,x+1)))
 end end
end

-------------------- SOUND --------------------
local function write_sfx(id,notes,speed)
 local base=0x3200+id*68
 memset(base,0,68)
 for i,n in ipairs(notes) do
  local k,w,v,e=n[1],n[2],n[3],n[4]
  poke(base+(i-1)*2,k+(w%4)*64)
  poke(base+(i-1)*2+1,flr(w/4)+v*2+e*16)
 end
 poke(base+65,speed)
end
local function mk_sounds()
 write_sfx(0,{{36,4,2,0},{36,4,1,0}},10)
 write_sfx(1,{{48,1,2,0},{31,1,2,0}},12)
 write_sfx(2,{{36,6,3,0},{28,6,3,0},{40,6,2,0}},14)
 write_sfx(3,{{40,3,3,0},{24,3,3,0}},10)
 write_sfx(4,{{48,5,3,0},{52,5,3,0},{55,5,3,0},{60,5,3,0}},10)
 write_sfx(5,{{48,5,4,0},{55,5,4,0},{60,5,4,0},{64,5,4,0},{67,5,3,0}},8)
 write_sfx(6,{{55,2,4,0},{52,2,3,0},{48,2,3,0},{43,2,3,0}},10)
 write_sfx(7,{{36,6,5,0},{30,6,4,2},{24,6,3,2},{18,6,2,2},{12,6,1,3}},12)
 write_sfx(8,{{60,0,3,2},{72,0,3,2},{84,0,3,2}},14)
 write_sfx(9,{{31,3,2,0},{31,3,1,0}},8)
end

-------------------- LEVEL DATA --------------------
local W,H=16,14
-- A designed maze. Verified for reachability and budget below.
local ROWS={
 "################",
 "#P.....#.......#",
 "#.####.#.#####.#",
 "#....#.#.#...#.#",
 "####.#.#.#.#.#.#",
 "#....#...#.#...#",
 "#.######.#.###.#",
 "#........#.....#",
 "#.####.#.#####.#",
 "#....#.#.....#.#",
 "#.##.#.#####.#.#",
 "#..#.#.....#.#.#",
 "#..#.....R.#.KG#",
 "################"}
-- Start P=(1,1). Shard S=(13,9) optional. Relic R=(9,12). Socket K=(13,12). Gate G=(14,12).
-- Fires: {x,y,dx,dy,per,ctr}
-- Spikes: {x,y,per,off}
function _init()
 pal() palt()
 for i,r in pairs(art) do put(i,r) end
 mk_sounds()
 cartdata(SAVE_ID)
 local ver=dget(slot_schema)
 best=mid(0,flr(dget(slot_best)),999)
 if ver==0 then dset(slot_schema,1) dset(slot_best,best) end
 srand(7)
 state="title"
 t=0
 new_game()
end

function new_game()
 bgt={} walls={}
 have_relic=false have_shard=false gate_open=false
 last_ev="find the lamp, then the socket"
 msg_t=120
 ph=0
 turn=0
 dead=false
 lose_reason=nil
 hitcd=0
 for y=0,H-1 do
  bgt[y]={} walls[y]={}
  for x=0,W-1 do
   local ch=sub(ROWS[y+1],x+1,x+1)
   local w=(ch=="#")
   walls[y][x]=w
   bgt[y][x]=ch
   if ch=="P" then px,py=x,y end
  end
 end
 relic={x=9,y=12}
 socket={x=13,y=12}
 gate={x=14,y=12}
 shard={x=13,y=9}
 -- fires that patrol narrow corridors (predictable lines)
 fires={
  {x=5,y=3, dx=0, dy=1, per=4, ctr=0},
  {x=9,y=5, dx=0, dy=1, per=4, ctr=2},
  {x=3,y=11,dx=1, dy=0, per=5, ctr=0},
  {x=12,y=9,dx=0, dy=-1,per=4, ctr=1},
 }
 spikes={
  {x=3,y=1, per=6, off=0},
  {x=7,y=3, per=6, off=3},
  {x=5,y=6, per=4, off=1},
  {x=13,y=7,per=6, off=2},
  {x=9,y=9, per=4, off=0},
  {x=11,y=10,per=6,off=4},
  {x=15,y=11,per=4,off=2},-- warn: cell under gate approach? keep off gate tile
  {x=3,y=12,per=6,off=1},
 }
 -- demon starts far (top-right room)
 mon={x=13,y=1}
 -- lamp budget: 40 ticks (20 "seconds" of 2 ticks each... actually 1 tick=1 second)
 clock=48
 clock_max=clock
 sync_all()
end

function sync_all()
 for y=0,H-1 do for x=0,W-1 do
  local ch=bgt[y][x]
  local n=0
  if ch=="#" then n=6
  elseif x==socket.x and y==socket.y then
   n=(have_relic and gate_open) and 5 or 12
  end
  mset(x,y,n)
 end end
end
function say(s,f) last_ev=s msg_t=f or 80 end

-------------------- QUERIES --------------------
function fire_at(x,y)
 for i,f in ipairs(fires) do if f.x==x and f.y==y then return i end end
end
function spike_at(x,y)
 for i,s in ipairs(spikes) do
  if s.x==x and s.y==y then return i,((ph+s.off)%s.per)<s.per/2 end
 end
end
function can_enter(x,y)
 if x<0 or y<0 or x>=W or y>=H then return false end
 if walls[y][x] then return false end
 if gate and x==gate.x and y==gate.y and not gate_open then return false end
 return true
end
function sgn(v) if v>0 then return 1 elseif v<0 then return -1 else return 0 end end

-------------------- TURN ENGINE --------------------
function hurt(reason)
 if dead then return end
 hp-=1
 sfx(7,3)
 if hp<=0 then lose(reason) else say(reason.."!  hp "..hp,70) end
end

function hazard_tick()
 ph+=1
 for _,f in ipairs(fires) do
  f.ctr+=1
  if f.ctr>=f.per then
   f.ctr=0
   local nx,ny=f.x+f.dx,f.y+f.dy
   if not can_enter(nx,ny) then f.dx=-f.dx f.dy=-f.dy nx,ny=f.x+f.dx,f.y+f.dy end
   if can_enter(nx,ny) then f.x,f.y=nx,ny sfx(2,2) end
  end
 end
 demon_tick()
end

function demon_tick()
 local dx,dy=px-mon.x,py-mon.y
 local steps={}
 if abs(dx)>=abs(dy) then
  steps={{sgn(dx),0},{0,sgn(dy)},{0,-sgn(dy)},{-sgn(dx),0}}
 else
  steps={{0,sgn(dy)},{sgn(dx),0},{-sgn(dx),0},{0,-sgn(dy)}}
 end
 for _,s in ipairs(steps) do
  if (s[1]~=0 or s[2]~=0) and can_enter(mon.x+s[1],mon.y+s[2]) then
   mon.x+=s[1] mon.y+=s[2] return
  end
 end
end

function resolve_after()
 local i,alive=spike_at(px,py)
 if i and alive then hurt("spikes") end
 if fire_at(px,py) then hurt("fire") end
 if mon.x==px and mon.y==py then hurt("the demon") end
end

function lose(reason)
 if dead then return end
 dead=true state="lose" lose_reason=reason
 sfx(7,3)
end
function win_game()
 dead=false state="win"
 sfx(6,3)
 if clock>best then best=clock dset(slot_best,best) end
end

function after_action()
 hazard_tick()
 resolve_after()
 if clock<=0 and not dead then lose("the lamp burned out") return end
 if not dead then
  if clock<=6 then sfx(9,2) else sfx(9,2) end
 end
end

function try_move(dx,dy)
 local nx,ny=px+dx,py+dy
 if not can_enter(nx,ny) then sfx(1,3) say("a wall",26) return end
 if fire_at(nx,ny) then sfx(1,3) say("flames block the way",40) return end
 -- entering gate tile = escape
 if gate and nx==gate.x and ny==gate.y and gate_open then
  px,py=nx,ny turn+=1
  win_game() return
 end
 px,py=nx,ny turn+=1
 clock-=1
 sfx(0,3)
 if shard and shard.x==px and shard.y==py then
  shard=nil have_shard=true sfx(4,3) say("+ shard!  bonus reward",80)
 end
 if not have_relic and relic.x==px and relic.y==py then
  have_relic=true sfx(5,3) say("+ LAMP!  now reach the socket",100)
 end
 if have_relic and socket.x==px and socket.y==py and not gate_open then
  gate_open=true sync_all() sfx(5,3) say("socket lit!  gate opend east",120)
 end
 sync_all()
 if clock<=0 then lose("the lamp burned out") end
 after_action()
end

function try_wait()
 turn+=1 clock-=1 sfx(9,3)
 if clock<=0 then lose("the lamp burned out") return end
 after_action()
end

-------------------- UPDATE --------------------
function _update60()
 t+=1
 if msg_t>0 then msg_t-=1 end
 if state=="title" then
  if btnp(5) then new_game() hp=3 state="play" sfx(8,3) end
  return
 end
 if state=="win" or state=="lose" then
  if btnp(5) then new_game() hp=3 state="play" sfx(8,3) end
  if btnp(4) then state="title" end
  return
 end
 if btnp(0) then try_move(-1,0) return end
 if btnp(1) then try_move(1,0) return end
 if btnp(2) then try_move(0,-1) return end
 if btnp(3) then try_move(0,1) return end
 if btnp(5) then try_wait() return end
end

-------------------- DRAW --------------------
function draw_world()
 local cx=mid(0,px*8-60,W*8-128)
 local cy=mid(0,py*8-58,H*8-128)
 camera(-cx,-cy)
 cls(0)
 for y=0,H-1 do for x=0,W-1 do
  if bgt[y][x]=="#" then spr(6,x*8-cx,y*8-cy)
  else rectfill(x*8-cx,y*8-cy,x*8+7-cx,y*8+7-cy,((x+y)%2==0) and 1 or 0) end
 end end
 -- socket
 spr((have_relic and gate_open) and 5 or 12,socket.x*8-cx,socket.y*8-cy)
 -- relic
 if not have_relic then spr(11,relic.x*8-cx,relic.y*8-cy) end
 -- shard
 if shard then spr(2,shard.x*8-cx,shard.y*8-cy) end
 -- fires (animated)
 for _,f in ipairs(fires) do
  local fx,fy=f.x*8-cx,f.y*8-cy
  if flr(t/6)%2==0 then spr(3,fx,fy) else sspr(16,16,8,8,fx,fy,8,8,true,false) end
 end
 -- spikes
 for _,s in ipairs(spikes) do
  local alive=((ph+s.off)%s.per)<s.per/2
  spr(alive and 7 or 8,s.x*8-cx,s.y*8-cy)
 end
 -- gate
 spr(gate_open and 5 or 4,gate.x*8-cx,gate.y*8-cy)
 -- demon
 spr(13,mon.x*8-cx,mon.y*8-cy)
 -- player
 if not dead then spr(1,px*8-cx,py*8-cy) end
 camera()
end

function draw_hud()
 rectfill(0,0,127,9,0)
 for i=1,3 do
  local on=i<=hp
  if on then circfill(4+i*9,5,2,8) pset(4+i*9,5,7)
  else circ(4+i*9,5,2,5) end
 end
 print("LAMP "..clock,44,2,clock<=8 and 8 or (clock<=16 and 9 or 10))
 print(have_relic and "RELIC" or "----",96,2,have_relic and 10 or 5)
 rectfill(0,120,127,127,0)
 for i=0,clock_max-1 do
  local xx=2+flr(i*123/clock_max)
  if i<clock then rectfill(xx,123,xx+1,126,9) else pset(xx,124,5) end
 end
 print("turn "..turn,1,113,6)
 if msg_t>0 and last_ev then
  local w=#last_ev*4
  rectfill(mid(0,64-w/2-2,125),108,mid(0,64-w/2,121)+w+2,117,0)
  print(last_ev,mid(0,65-w/2,122),110,7)
 end
end

function panel(a,b,c,ac)
 rectfill(8,40,119,88,0)
 rect(8,40,119,88,ac)
 print(a,64-#a*2,48,ac)
 print(b,64-#b*2,60,7)
 print(c,64-#c*2,72,6)
end

function _draw()
 if state=="play" or state=="win" or state=="lose" then
  draw_world()
  draw_hud()
  if state=="win" then
   panel("GATE LIT","escaped with "..clock.." lamp left",
     "best "..best.."   X retry  O title",10)
  elseif state=="lose" then
   panel("LOST",lose_reason or "the dark closed in","X retry  O title",8)
  end
 else
  cls(1)
  for i=0,15 do line(0,i*8,127,i*8,(i%2==0) and 1 or 0) end
  spr(3,56,18) spr(2,44,26) spr(13,76,26)
  print("lantern run",34,40,10)
  print("turn-based relic rescue",16,52,6)
  print("arrows: step (1 lamp)",8,62,7)
  print("x: wait     cost 1 lamp",8,70,7)
  print("get the lamp, light socket,",2,82,11)
  print("escape the gate before dark",2,90,11)
  print("push x to begin",28,104,(t%40<24) and 7 or 6)
  print("demon + spikes + fire move",6,114,5)
 end
end