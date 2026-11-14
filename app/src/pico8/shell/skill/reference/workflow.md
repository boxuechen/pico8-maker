# Making and changing games

## Create

Choose the repeated action, the goal, the player's choice and how a round progresses. Expression or discovery can be the payoff of a relaxing toy; do not force danger or loss. Use reasonable defaults for vague requests and say briefly which direction you took. Read game-design.md if the loop or its trade-off is unclear.

Build a small complete loop first: action, visible response, reward or consequence, and a reason for the next action. Start from `p8 new skeleton` (win/lose) or `p8 new toy` (no result). Separate update from draw; keep round state in `g`, rebuilt by `new_game()`.

Then play it: can a new player see the target, the control and the result? For a challenge, compare ordinary play with an obvious shortcut; for a relaxing toy, check visible variation. Fix the clearest problem you saw, check again, then finish the requested scope.

## Edit

Read the current `main.lua` and look at the affected moment. Turn feedback into something observable: a meaningful choice, objects that are easy to tell apart, reliable input. Pick a reasonable interpretation; ask only when the alternatives would change the result a lot. Keep unrelated rules, resources and progress.

Compare the affected moment before and after with the same presses, and check nearby effects. For difficulty, compare plausible strategies or starts rather than one lucky run. For visuals, compare the same scene.

## Resources

Look at the target sprites or map area first (`p8 sheet --png`, `p8 map x,y,w,h --png`, `p8 sfx id`) and check which ids are free before using new ones. Change only the lines and characters you need in `gfx.txt`, `gff.txt`, `map.txt`, `sfx.txt` or `music.txt`, keeping unrelated data. Formats: asset-authoring.md, audio.md, sprites-maps.md.

## Readability

Judge the 128x128 composition. Use calm backgrounds, clear silhouettes, outlines on small objects, and shape or animation as well as colour. Keep HUD text apart from scenery and save bright accents for useful information. Check the start screen and a crowded or result moment.

Separate important objects from the background by brightness, not only hue: dark on light ground or light on dark ground.

| Role | Dark scene | Light or warm scene |
| --- | --- | --- |
| Background | 0 black, 1 dark blue | 15 light peach, 6 light gray |
| Environment | 5 dark gray, 2 dark purple | 13 gray purple, 3 dark green |
| Player | 7 off white | 1 dark blue, 0 black |
| Interactive targets | 10 yellow, 11 bright green | 8 red, 12 blue |
| Outline / HUD text | 0 black / 7 off white | 0 black / 1 dark blue |

These are starting points; choose colours that suit the theme and check contrast with `p8 look --png`. Avoid dark purple on dark scenery or busy bright grass behind small pickups.

## Machine facts

PICO-8 v0.2.7: 128x128 screen, 16 colours, top-left origin. `_update` runs at 30 Hz (`_update60` at 60 Hz). Numbers are 16.16 fixed point (-32768 to just under 32768): large sentinels like 99999 wrap; keep squared distances small. Angles are in turns and `atan2(dx,dy)`. About 8192 tokens of code. The lower half of the sprite sheet shares memory with the lower half of the map. Four sound channels are shared by sfx and music. `cartdata` + `dget/dset` (slots 0-63) save between runs. Retry with X only after a short result lock, and never on the button held for the main action.
