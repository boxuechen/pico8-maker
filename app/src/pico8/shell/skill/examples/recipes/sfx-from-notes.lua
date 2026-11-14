-- Standalone recipe: sound at startup; X replays it on channel 3.
-- Each note: {pitch 0..63, waveform 0..7, volume 0..7, effect 0..7}.
function write_sfx(id,notes,speed)
 assert(id>=0 and id<64 and id==flr(id))
 assert(#notes<=32 and speed>=1 and speed<=255 and speed==flr(speed))
 local base=0x3200+id*68
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
 -- Offset 64 filters=0; 66/67 loop start/end=0 (no loop).
end
function _init()
 write_sfx(0,{{24,0,5,0},{28,0,5,0},{31,0,5,0},{36,0,4,3}},8)
 sfx(0,3,0,4)
 plays=1
end
function _update60()
 if btnp(5) then sfx(0,3,0,4) plays+=1 end
end
function _draw()
 cls(1)
 print("x: play chime",4,4,7)
 print("plays: "..plays,4,16,10)
 circfill(64,64,12,10)
end
