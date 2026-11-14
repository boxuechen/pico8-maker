-- TOY TITLE: replace with the toy's name
-- A toy has no winning or losing. State lives in global g.
function new_game()
 g={t=0,player={x=64,y=64},trail={}}
end

function _init() new_game() end

function _update()
 g.t+=1
 if btn(0) then g.player.x-=1 end
 if btn(1) then g.player.x+=1 end
 if btn(2) then g.player.y-=1 end
 if btn(3) then g.player.y+=1 end
 g.player.x=mid(0,g.player.x,127)
 g.player.y=mid(0,g.player.y,127)
 if btnp(4) then add(g.trail,{x=g.player.x,y=g.player.y,c=8+g.t%8}) end
 if btnp(5) then g.trail={} end
end

function _draw()
 cls(1)
 for d in all(g.trail) do circfill(d.x,d.y,2,d.c) end
 circ(g.player.x,g.player.y,3,7)
end
