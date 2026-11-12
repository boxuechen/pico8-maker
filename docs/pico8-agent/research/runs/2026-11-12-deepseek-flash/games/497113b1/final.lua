-- LAMPWISP DEPTHS
-- Fetch the lamp key in the vault depths and return to the entrance door.
-- Your wick is fuel: every valid step or wait burns 1. The wisp costs 2 extra.
-- A stone sentry fires down its telegraphed row every 3rd resolved turn.
local save_id="lampwisp_depths_v1"
local S_SCHEMA,S_BEST,S_KEY=0,1,2   -- saved only on winning runs

-- ---------- assets ----------
function put_sprite(n,rows)
 local ox=(n%16)*8 local oy=flr(n/16)*8
 for y=0,7 do for x=0,7 do
  sset(ox+x,oy+y,tonum("0x"..sub(rows[y+1],x+1,x+1)))
 end end
end
function write_sfx(id,notes,speed)
 local base=0x3200+id*68
 memset(base,0,68)
 for i,n in ipairs(notes) do
  poke(base+(i-1)*2,n[1]+(n[2]%4)*64)
  poke(base+(i-1)*2+1,flr(n[2]/4)+n[3]*2+n[4]*16)
 end
 poke(base+65,speed)
end
function pat(id,a,b,c,d,loop0,loop1)
 poke(0x3100+id*4,(a<0 and 64 or a)+(loop0 and 128 or 0))
 poke(0x3100+id*4+1,(b<0 and 64 or b)+(loop1 and 128 or 0))
 poke(0x3100+id*4+2,(c<0 and 64 or c))
 poke(0x3100+id*4+3,(d<0 and 64 or d))
end
function assets()
 pal() palt()
 local art={
  -- 1: lampkeeper (player) facing down
  {"000cc000","00c77c00","0c7cc7c0","0c1111c0","00cccc00","0cbbbbc0","0c0bb0c0","000cc000"},
  -- 2: lamp key
  {"0000aa00","000a00a0","00aaaaa0","0a000a00","0aaaaa00","000a0000","000a0000","000aa000"},
  -- 3: wisp (optional gold reward)
  {"00000000","000dd000","0d7777d0","d77777d0","0d7777d0","00dd77d0","0000dd00","00000000"},
  -- 4: sentry statue
  {"0dddddd0","d555555d","d5c555c5","d555555d","0d5555d0","00d55d00","0dddddd0","dd0dd0dd"},
  -- 5: entrance door
  {"0aaaaaa0","a111111a","a1a11a1a","a1a11a1a","a111111a","a11aa11a","a11aa11a","a11aa11a"}}
 for i,rows in pairs(art) do put_sprite(i,rows) end
 -- music bed on channels 0/1 (two short loops)
 write_sfx(0,{{24,0,2,0},{31,0,2,0},{36,0,2,0},{31,0,2,0},
              {29,0,2,0},{36,0,2,0},{41,0,2,0},{36,0,2,0}},6)
 write_sfx(1,{{12,2,1,0},{19,2,1,0},{24,2,1,0},{19,2,1,0}},8)
 write_sfx(2,{{24,0,2,0},{26,0,2,0},{31,0,2,0},{34,0,2,0},
              {26,0,2,0},{29,0,2,0},{33,0,2,0},{29,0,2,0}},6)
 write_sfx(3,{{17,5,1,0},{24,5,1,0},{21,5,1,0},{17,2,1,0}},8)
 pat(0,0,1,-1,-1,false,false)
 pat(1,2,3,-1,-1,true,true)
 -- feedback on channel 3
 write_sfx(4,{{36,1,4,0},{43,1,4,3}},8)          -- key picked up
 write_sfx(5,{{48,3,4,3}},4)                      -- wisp collected
 write_sfx(6,{{30,6,5,3},{24,6,3,3}},8)           -- damaged
 write_sfx(7,{{24,0,4,0},{31,0,4,0},{36,0,4,0},{43,0,5,0},{48,0,5,2}},7) -- win
 write_sfx(8,{{24,6,4,3},{18,6,4,3}},10)          -- out of fuel
 write_sfx(9,{{0,6,2,5},{0,6,1,5}},5)             -- bump
 write_sfx(10,{{43,4,3,0}},2)                     -- sentry fires
 write_sfx(11,{{36,0,4,0},{31,0,4,0},{24,0,4,0},{19,0,4,3}},8) -- round done
 music(0,0,3)
end
function snd(id) sfx(id,3,0,4) end

-- ---------- board ----------
-- # wall, . floor, P start, K key, W wisp, T sentry, D entrance door
local rows={
 "#######",
 "#D....#",
 "#.###.#",
 "#.#W#.#",
 "#.#.#.#",
 "#...#T#",
 "#.##T.#",
 "#..P.K#",
 "#######"}
local WALL,START,KEYC,WISP,SENT,DOOR=0,0,0,0,{},0
local BW,BH=#rows[1],#rows
local tile_at={}
function board_init()
 sentries={}
 taken_wisp=false
 for y=1,BH do
  local r=rows[y]
  for x=1,BW do
   local ch=sub(r,x,x)
   tile_at[(y-1)*BW+x]= (ch=="#") and 1 or 0
   if ch=="P" then sx,sy=x,y end
   if ch=="K" then kx,ky=x,y end
   if ch=="W" then wx,wy=x,y end
   if ch=="D" then dx,dy=x,y end
   if ch=="T" then add(sentries,{x=x,y=y}) end
  end
 end
end
function is_wall(x,y)
 if x<1 or x>BW or y<1 or y>BH then return true end
 return tile_at[(y-1)*BW+x]==1
end

-- ---------- state ----------
local FUEL_START=26
function _init()
 assets()
 cartdata(save_id)
 save_ok=dget(S_SCHEMA+0)==0 or dget(S_SCHEMA+0)==1
 if dget(S_SCHEMA+0)==0 then dset(S_SCHEMA+0,1) end
 best=mid(0,flr(dget(S_BEST)),99)
 keys_found=mid(0,flr(dget(S_KEY)),99)
 board_init()
 new_run()
 state="title"
end
function new_run()
 hp=3 fuel=FUEL_START have_key=false turn=0
 px,py=sx,sy
 taken_wisp=false
 danger=-1  -- row that will be shot on the next resolved turn
 shake=0 pop=0 msgs={}
 recompute_danger()
end
local DIRS={{-1,0},{1,0},{0,-1},{0,1}}
-- Pick the most imminent firing line to warn about, so the cue is honest.
function recompute_danger()
 local best_wait,chosen=99,nil
 for _,s in ipairs(sentries) do
  local w=(s.y-turn-1)%3+1
  if w<best_wait then best_wait,chosen=w,s.y end
 end
 danger=chosen and chosen or -1
 warn_left=chosen and best_wait or 0
end
function toast(t,c) add(msgs,{t=t,c=c,life=60}) end
function score()
 return (have_key and 100 or 0)+ (taken_wisp and 60 or 0) + fuel*2 + hp*10 + turn
end
function end_run(win)
 if win then
  state="won"
  local sc=score()
  if sc>best then best=sc end
  keys_found+=1
  if save_ok then dset(S_BEST,best) dset(S_KEY,keys_found) end
  snd(7)
 else
  state="lost" snd(8)
 end
end

function step(dx,dy)
 local tx,ty=px+dx,py+dy
 if is_wall(tx,ty) then snd(9) return end
 -- block on sentries: they are solid obstacles
 for _,s in ipairs(sentries) do
  if s.x==tx and s.y==ty then snd(9) return end
 end
 px,py=tx,ty
 turn+=1
 fuel-=1
 resolve_turn()
end
function wait()
 turn+=1
 fuel-=1
 resolve_turn()
end
function resolve_turn()
 -- Hazards resolve first: the warned row fires exactly as promised.
 if danger>-1 and danger==py then
  hp-=1 shake=10 snd(6) toast("-1 hp","8")
 else
  if danger>-1 then end
 end
 -- any sentry whose turn is a multiple of 3 fires visually
 if turn%3==0 then snd(10) end
 recompute_danger()
 -- pickups
 if not have_key and px==kx and py==ky then
  have_key=true snd(4) toast("lamp key!","a")
 end
 if not taken_wisp and px==wx and py==wy then
  taken_wisp=true fuel-=2 snd(5) toast("wisp -2 wick","d")
 end
 -- win/lose precedence: arriving home with the key beats the last fuel unit
 if have_key and px==dx and py==dy then end_run(true) return end
 if hp<=0 then end_run(false) return end
 if fuel<=0 then fuel=0 end_run(false) return end
end

-- ---------- update ----------
function _update60()
 if shake>0 then shake-=1 end
 if pop>0 then pop-=1 end
 for i=#msgs,1,-1 do
  msgs[i].life-=1
  if msgs[i].life<=0 then del(msgs,msgs[i]) end
 end
 if state~="play" then
  if btnp(5) or (state=="title" and btnp(4)) then
   new_run() state="play"
  end
  return
 end
 if btnp(0) then step(-1,0)
 elseif btnp(1) then step(1,0)
 elseif btnp(2) then step(0,-1)
 elseif btnp(3) then step(0,1)
 elseif btnp(4) then wait() end
 if state~="play" then return end
 -- escape a soft lock: pressing X mid-run abandons it
 if btnp(5) then state="lost" snd(8) end
end

-- ---------- draw ----------
local CX,CY,CS=4,16,16
function cellpx(x,y) return CX+(x-1)*CS,CY+(y-1)*CS end
function _draw()
 cls(1)
 local ox,oy=0,0
 if shake>0 then ox=(rnd(2)-1)*2 oy=(rnd(2)-1)*2 end
 -- frame
 rectfill(0,0,127,13,2)
 print("lampwisp depths",3,3,10)
 -- key / wisp status icons
 spr(2,88,3) print(have_key and "got" or "---",96,3,have_key and 11 or 5)
 spr(3,110,3) print(taken_wisp and "ok" or "---",118,3,5)
 -- board floor + walls
 for y=1,BH do for x=1,BW do
  local cx,cy=cellpx(x,y)
  if is_wall(x,y) then
   rectfill(cx+ox,cy+oy,cx+CS-1+ox,cy+CS-1+oy,5)
   line(cx+ox,cy+oy,cx+CS-1+ox,cy+oy,6)
  else
   rectfill(cx+ox,cy+oy,cx+CS-1+ox,cy+CS-1+oy,0)
  end
 end end
 -- door
 local dpx,dpy=cellpx(dx,dy)
 rectfill(dpx+2+ox,dpy+1+oy,dpx+CS-3+ox,dpy+CS-1+oy,have_key and 11 or 4)
 -- loot
 if not have_key then
  local kx2,ky2=cellpx(kx,ky)
  spr(2,kx2+4+ox+sin(t()*2)*1,ky2+4+oy)
 end
 if not taken_wisp then
  local wx2,wy2=cellpx(wx,wy)
  spr(3,wx2+4+ox,wy2+4+oy+sin(t()*3)*1)
 end
 -- sentries with their firing turn cue
 for _,s in ipairs(sentries) do
  local cx,cy=cellpx(s.x,s.y)
  spr(4,cx+4+ox,cy+4+oy)
  local nextfire=(s.y-turn-1)%3+1
  local col=nextfire==1 and 8 or (nextfire==2 and 9 or 13)
  print(tostr(nextfire,1).."",cx+CS-6+ox,cy+oy+1,col)
  -- telegraph the warned row
  if s.y==danger then
   local flash=flr(t()*8)%2==0
   local ry=cellpx(1,s.y)
   if flash then
    fillp(0b1010010110100101)
    rectfill(ox+CX-1,ry+oy,CX+BW*CS-2+ox,ry+CS-1+oy,8)
    fillp()
   end
   rect(ox+CX-1,ry+oy,CX+BW*CS-2+ox,ry+CS-1+oy,8)
  end
 end
 -- player
 local ppx,ppy=cellpx(px,py)
 if pop%8<4 and pop>0 then end
 spr(1,ppx+4+ox,ppy+4+oy)
 -- hint line
 if have_key then
  print("return to the door",4,105,11)
 else
  print("find the lamp key",4,105,10)
 end
 -- fuel gauge
 local gw=BW*CS
 print("wick",CX,64,7)
 print(tostr(fuel),CX+20,64,fuel>10 and 11 or (fuel>4 and 9 or 8))
 local fw=flr(fuel/FUEL_START*gw)
 rectfill(CX,72,CX+gw-1,77,5)
 if fw>0 then rectfill(CX,72,CX+fw-1,77,fuel>10 and 11 or (fuel>4 and 9 or 8)) end
 print("hp",CX,80,7)
 for i=1,3 do
  if i<=hp then spr(3,CX+10+(i-1)*10,78) else circfill(CX+14+(i-1)*10,82,3,5) end
 end
 print("turn "..turn,CX+44,80,13)
 -- flashing states
 if state=="play" and danger==py and flr(t()*6)%2==0 then
  print("in line!",CX+80,64,8)
 end
 -- messages
 for i,m in ipairs(msgs) do
  print(m.t,CX+80,64-8*i,tonum(m.c) and tonum(m.c) or 7)
 end
 if state~="play" then
  rectfill(6,44,121,84,1) rect(6,44,121,84,6)
  if state=="title" then
   print("lampwisp depths",12,50,10)
   print("get the key, return home",10,60,7)
   print("the wick burns 1 each step",10,68,14)
   print("x: begin",12,76,11)
  elseif state=="won" then
   print("lamp relit!",12,50,11)
   print("score "..score().."  best "..best,12,60,10)
   print("keys "..keys_found.."   x: again",12,68,7)
  else
   print("the wick went out",12,50,8)
   print((have_key and "you had the key" or "the key stayed lost"),12,60,7)
   print("x: retry",12,76,11)
  end
 end
end
