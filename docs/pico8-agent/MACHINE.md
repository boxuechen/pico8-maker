# PICO-8 machine

Target PICO-8 v0.2.7. The screen is 128×128 with 16 palette slots and a top-left origin. Use numeric colors. Sprite slot 0 is transparent by default. Restore camera and clip for screen-space HUDs.

Use _init for setup, _update (30 Hz) or _update60 (60 Hz) for simulation, and _draw for rendering. Keep frame work bounded. Numbers use signed 16.16 fixed point (-32768 to just below 32768); large decimal sentinels such as 99999 wrap. Use nil for an unset nearest-target distance or a bounded value, and keep squared-distance intermediates in range. Angles use turns and atan2 takes (dx,dy). Functions such as flr, max and rnd are globals.

Aim for 8192 code tokens and 65535 source characters. Tool budgets are approximate. Native resources load before _init. The lower sprite sheet overlaps the lower map. Audio uses four shared channels. cartdata selects a save namespace with numeric dget/dset slots 0–63.

## Reset skeleton

Collect three targets, lose at the left edge, retry with X. Adapt these rules for new games; preserve existing structures in focused edits. Keep round state in global g for inspection. new_game() recreates counters, entities, mode and progress; add any cooldowns, selection or timers there too. _init and retry share it. Keep persistent best scores outside g and load them separately with cartdata/dget.

Retry uses X after a short result lock. btnp repeats while a button stays held, so never restart on the button held for the main action, or the result screen is skipped.

```lua
function new_game()
 g={mode="play",player={x=8},entities={{x=40},{x=72},{x=104}},score=0,progress=0,wait=0}
end
function _init() new_game() end
function _update()
 if g.mode!="play" then
  g.wait+=1
  if g.wait>15 and btnp(5) then new_game() end
  return
 end
 if btn(0) then g.player.x-=2 end
 if btn(1) then g.player.x+=2 end
 for e in all(g.entities) do
  if abs(g.player.x-e.x)<3 then del(g.entities,e) g.score+=1 end
 end
 g.progress=g.score/3
 if g.score==3 then g.mode="win" elseif g.player.x<0 then g.mode="lose" end
end
function _draw()
 cls(1) print("arrows: move x: retry",1,1,7)
 for e in all(g.entities) do circfill(e.x,64,3,0) circfill(e.x,64,2,10) end
 rectfill(g.player.x-3,60,g.player.x+3,68,0) rectfill(g.player.x-2,61,g.player.x+2,67,7)
 print(g.mode.." "..g.score.."/3",1,114,7)
end
```
