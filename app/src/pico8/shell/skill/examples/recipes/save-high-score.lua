-- Standalone recipe: X scores; O restarts a round, preserving best score.
-- Replace this ID once when adopting the recipe; keep it stable thereafter.
local save_id="pico_maker_recipe_high_score_v1"
local schema_slot=0
local best_slot=1
function _init()
 cartdata(save_id)
 local version=dget(schema_slot)
 save_writable=version==0 or version==1
 best=mid(0,flr(dget(best_slot)),30000)
 if version==0 then
  -- Version 0 -> 1: preserve any existing best; do not clear all slots.
  dset(best_slot,best)
  dset(schema_slot,1)
 end
 score=0
end
function _update60()
 if btnp(4) then score=0 end
 if btnp(5) then
  score=min(score+1,30000)
  if score>best then
   best=score
   if save_writable then dset(best_slot,best) end
  end
 end
end
function _draw()
 cls(1)
 print("x: score  o: new round",2,4,7)
 print("score: "..score,4,20,11)
 print("best: "..best,4,32,10)
 if not save_writable then print("newer save: read only",2,48,8) end
 -- A visible 0..15 progress strip also makes restart testing observable.
 rectfill(4,64,4+min(best,15)*4,68,10)
end
