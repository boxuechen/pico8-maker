-- Only for sound the game generates while it runs. Fixed sounds and music
-- belong in sfx.txt and music.txt (reference/asset-authoring.md).
-- Standalone recipe: two-pattern loop on channels 0/1; X plays SFX on 3.
-- Helpers intentionally included: this file needs no imports or editor data.
function write_sfx(id,notes,speed)
 local base=0x3200+id*68
 assert(id>=0 and id<64 and id==flr(id))
 assert(#notes<=32 and speed>=1 and speed<=255 and speed==flr(speed))
 memset(base,0,68)
 for i,n in ipairs(notes) do
  local k,w,v,e=n[1],n[2],n[3],n[4]
  assert(k>=0 and k<=63 and k==flr(k))
  assert(w>=0 and w<=7 and w==flr(w))
  assert(v>=0 and v<=7 and v==flr(v))
  assert(e>=0 and e<=7 and e==flr(e))
  poke(base+(i-1)*2,k+(w%4)*64)
  poke(base+(i-1)*2+1,flr(w/4)+v*2+e*16)
 end
 poke(base+65,speed)
end
function write_pattern(id,channels,start_loop,end_loop,stop_after)
 assert(id>=0 and id<64 and id==flr(id) and #channels==4)
 local base=0x3100+id*4
 for i=1,4 do
  local c=channels[i]
  assert(c>=-1 and c<=63 and c==flr(c))
  local b=c<0 and 64 or c -- bit 6 disables this channel
  if i==1 and start_loop then b+=128 end
  if i==2 and end_loop then b+=128 end
  if i==3 and stop_after then b+=128 end
  poke(base+i-1,b)
 end
end
function melody(keys,wave,volume)
 local notes={}
 for i=1,32 do
  add(notes,{keys[1+flr((i-1)/4)%#keys],wave,volume,0})
 end
 return notes
end
function _init()
 write_sfx(0,melody({24,28,31,28},0,4),4)
 write_sfx(1,melody({12,12,19,19},2,2),4)
 write_sfx(2,melody({29,33,36,33},0,4),4)
 write_sfx(3,melody({17,17,24,24},2,2),4)
 write_sfx(4,{{48,0,5,0},{55,0,4,3}},8)
 write_pattern(0,{0,1,-1,-1},true,false,false)
 write_pattern(1,{2,3,-1,-1},false,true,false)
 music(0,0,3) -- reserve channels 0/1; mask 1+2, not channel number 3
end
function _update60()
 if btnp(5) then sfx(4,3,0,2) end
end
function _draw()
 cls(1)
 print("music + x: chime",4,4,7)
 print("pattern: "..stat(54),4,16,10)
end
