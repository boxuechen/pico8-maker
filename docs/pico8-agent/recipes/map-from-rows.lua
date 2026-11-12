-- Standalone recipe: grid movement, wall collision, collect one coin.
local rows={
 "################",
 "#..............#",
 "#....*.........#",
 "#..............#",
 "#...####.......#",
 "#..............#",
 "#..............#",
 "################"
}
function _init()
 pal() palt()
 -- Only sprites 1 and 2, and map rows 0..7: no shared-area conflict.
 for y=0,7 do
  for x=0,7 do
   sset(8+x,y,9)
   sset(16+x,y,0)
   if x>=2 and x<=5 and y>=2 and y<=5 then
    sset(16+x,y,10)
   end
  end
 end
 fset(1,1) -- bit 0: solid
 fset(2,2) -- bit 1: collectible
 for y=0,7 do
  assert(#rows[y+1]==16)
  for x=0,15 do
   local ch=sub(rows[y+1],x+1,x+1)
   local tile=0
   if ch=="#" then tile=1 end
   if ch=="*" then tile=2 end
   mset(x,y,tile)
  end
 end
 tx=2 ty=2 coins=0
end
function try_move(dx,dy)
 local nx=tx+dx local ny=ty+dy
 if nx<0 or nx>15 or ny<0 or ny>7 then return end
 local tile=mget(nx,ny)
 if fget(tile,0) then return end
 tx=nx ty=ny
 if fget(tile,1) then
  coins+=1 mset(tx,ty,0)
 end
end
function _update60()
 if btnp(0) then try_move(-1,0)
 elseif btnp(1) then try_move(1,0)
 elseif btnp(2) then try_move(0,-1)
 elseif btnp(3) then try_move(0,1) end
end
function _draw()
 cls(1)
 print("coins: "..coins,4,4,7)
 map(0,0,0,16,16,8)
 rectfill(tx*8+1,ty*8+17,tx*8+6,ty*8+22,11)
end
