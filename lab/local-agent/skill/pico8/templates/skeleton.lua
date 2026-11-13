-- GAME TITLE: replace with the game's name
-- Round state lives in global g. new_game() rebuilds all of it.
function new_game()
 g={mode="play",t=0,wait=0,score=0,
  player={x=64,y=100}}
end

function _init() new_game() end

function _update()
 if g.mode!="play" then
  -- result lock: ignore x for 15 frames so a held button cannot skip it
  g.wait+=1
  if g.wait>15 and btnp(5) then new_game() end
  return
 end
 g.t+=1
 if btn(0) then g.player.x-=2 end
 if btn(1) then g.player.x+=2 end
 g.player.x=mid(4,g.player.x,123)
end

function _draw()
 cls(1)
 rectfill(g.player.x-3,g.player.y-3,g.player.x+3,g.player.y+3,11)
 print("score "..g.score,2,2,7)
 if g.mode!="play" then
  rectfill(0,56,127,72,g.mode=="win" and 11 or 8)
  print(g.mode=="win" and "you win" or "game over",40,59,7)
  print("x: retry",44,66,7)
 end
end
