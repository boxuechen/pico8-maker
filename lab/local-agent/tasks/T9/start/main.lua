-- coin demo: sprite 1 drawn in the middle of the screen
function _init() g={flag=false,x=60} end
function _update()
 g.flag=fget(1,0)
 if btn(0) then g.x-=1 end
 if btn(1) then g.x+=1 end
end
function _draw()
 cls(1)
 spr(1,g.x,60)
 if g.flag then print("solid",50,80,7) end
end
