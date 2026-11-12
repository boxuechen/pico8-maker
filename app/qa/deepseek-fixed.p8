pico-8 cartridge // http://www.pico-8.com
version 43
__lua__
-- little wall / pico-8
-- x or z: jump / arrows: move
jump_speed=-4.2
gravity=0.22
walk_speed=1.4
function _init()
 srand(1)
 p={x=16,y=100,vy=0,ground=true}
 wall={x=66,y=80,w=12,h=28}
 won=false
end
function _update60()
 local dx=0
 if btn(0) then dx=-walk_speed end
 if btn(1) then dx=walk_speed end
 if (btnp(4) or btnp(5)) and p.ground then
  p.vy=jump_speed p.ground=false
 end
 local old_y=p.y
 p.ground=false
 p.vy+=gravity
 p.y+=p.vy
 local nx=mid(0,p.x+dx,120)
 -- wall collision: only when player's bottom overlaps wall band
 local bottom=p.y+8
 local oldbottom=old_y+8
 if nx+8>wall.x and nx<wall.x+wall.w then
  if p.y<wall.y+wall.h and bottom>wall.y then
   if oldbottom<=wall.y and p.vy>=0 then
    -- landing on top of wall
    p.y=wall.y-8 p.vy=0 p.ground=true
   else
    -- blocked horizontally by wall side
    if dx>0 then nx=wall.x-8 end
    if dx<0 then nx=wall.x+wall.w end
   end
  end
 end
 p.x=nx
 if p.y>=100 then p.y=100 p.vy=0 p.ground=true end
 if p.x>wall.x+wall.w and p.y==100 then won=true end
end
function _draw()
 cls(1)
 for i=1,12 do pset((i*37)%128,(i*13)%65,13) end
 rectfill(0,108,127,127,2)
 rectfill(0,108,127,110,3)
 for x=0,127,8 do line(x,112,x+4,116,5) end
 rectfill(wall.x,wall.y,wall.x+wall.w-1,107,9)
 for y=wall.y+4,107,5 do line(wall.x,y,wall.x+wall.w-1,y,4) end
 line(112,86,112,107,6)
 rectfill(113,86,121,91,10)
 rectfill(p.x,p.y,p.x+7,p.y+7,11)
 pset(p.x+2,p.y+2,7) pset(p.x+5,p.y+2,7)
 print("little wall",4,4,7)
 if won then print("you made it!",38,22,10) end
end
