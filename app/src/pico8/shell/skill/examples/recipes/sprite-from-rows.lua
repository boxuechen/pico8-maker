-- Standalone recipe: two-frame sprite, arrows move.
-- Palette digits are data; Lua drawing functions still use numeric colours.
local poses={
 {"00bbbb00","0bb77bb0","bbbbbbbb","bb0000bb",
  "bbbbbbbb","0bbbbbb0","0bb00bb0","bb0000bb"},
 {"00bbbb00","0bb77bb0","bbbbbbbb","bb0000bb",
  "bbbbbbbb","0bbbbbb0","bb0000bb","0bb00bb0"}
}
function put_sprite(n,rows)
 local ox=(n%16)*8
 local oy=flr(n/16)*8
 assert(#rows==8)
 for y=0,7 do
  assert(#rows[y+1]==8)
  for x=0,7 do
   local c=tonum("0x"..sub(rows[y+1],x+1,x+1))
   assert(c and c>=0 and c<=15)
   sset(ox+x,oy+y,c)
  end
 end
end
function _init()
 pal() palt()
 put_sprite(1,poses[1])
 put_sprite(2,poses[2])
 x=60 y=60 ticks=0
end
function _update60()
 ticks+=1
 if btn(0) then x-=1 end
 if btn(1) then x+=1 end
 if btn(2) then y-=1 end
 if btn(3) then y+=1 end
 x=mid(0,x,120) y=mid(16,y,120)
end
function _draw()
 cls(1)
 print("arrows: move",4,4,7)
 spr(1+flr(ticks/20)%2,x,y)
end
