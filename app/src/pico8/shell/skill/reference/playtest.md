# Playtesting with p8

Every p8 command loads `main.lua` in a fresh session with a fixed random seed (`srand(1)` before `_init`), so the same command gives the same result.

## Presses

`--press "right*30 o wait*10 left+x*5"`: tokens run in order; `name*n` holds for n frames (default 1); `a+b` holds buttons together; `wait` holds nothing. Names: left, right, up, down, o (Z key, Lua button 4), x (Lua button 5). A token is one hold: `x x` keeps X down for two frames, so `btnp(5)` fires once; write `x wait x` for two presses. At most 3600 frames per token.

## p8 run

```sh
p8 run --press "right*30 x wait*20" --read g.score,g.mode,#g.enemies,g.player.x
```

Prints the frames run, every change of `g.mode` with its frame, sounds started (`sfx 2@41` = sfx 2 at frame 41), printh output (last 20 lines), then the `--read` values. Paths are dotted (`g.player.x`, `g.enemies.1.x`); `#path` gives a length. Without `--read` it prints all of `g`. Only globals can be read; for locals use printh.

## p8 run/look --setup

```sh
p8 run --setup "g.lives=1 g.enemies={{x=60,y=100,vx=0}}" --press "wait*5" --read g.mode
```

Runs Lua after boot (after `_init`) and before the presses. Use it to reach a win, a loss, a late level or a rare event quickly, without editing `main.lua`. Setup runs are not normal play: before reporting a path as played, also play it once with presses only: by hand for a short game, with `--bot` for a long one.

## p8 run --bot

```sh
p8 run --bot "local f=g.fruits[1] if f then return f.x<g.basket.x and 1 or 2 end" --until "g.mode=='win'" --read g.score
p8 run --press "x" --bot "return 16" --until "g.mode~='play'" --frames 3600
```

A function body run every frame after `--press` (optional prefix, such as leaving a title screen): it reads the state and returns the buttons to hold that frame (left=1 right=2 up=4 down=8 o=16 x=32, added; nil holds nothing). It stops when the `--until` expression is true or after `--frames` (default 1800, at most 3600). Only the buttons are kept: they are printed as a press string and replayed in a fresh session with presses only, and that replay is the result (it counts as normal play). A bot that changes state proves nothing, because the replay does not include it. Use it for long routes (winning a scoring game, losing every life); write a simple greedy rule (move toward the target, fire when aligned, step away from danger), not a search.

## p8 look

`p8 look --press "right*30"` prints the screen as 32x32 characters (one per 4x4 block, the most common colour 0-f). `--png s.png` also writes a 512x512 image (4x); open it with `read`. Positions in the image divide by 4 to give screen pixels. `--crop x,y,w,h` prints the exact pixels of a rectangle instead (one character 0-f per pixel, at most 64x64), e.g. `p8 look --setup "g.inv=30" --press wait*7 --crop 56,96,16,16` to see whether the player is drawn on that frame.

## checks.json

`p8 check` runs every case in `/cart/checks.json` after lint, boot and input:

```json
{"cases":[
 {"name":"starts with 3 lives","press":"wait","expect":[{"path":"g.lives","equals":3}]},
 {"name":"last life lost loses","setup":"g.lives=1 g.fish={{x=10,y=126,vy=1}}","press":"wait*3","expect":[{"path":"g.mode","equals":"lose"}]},
 {"name":"x restarts","setup":"g.mode='lose' g.wait=20","press":"x wait","expect":[{"path":"g.mode","equals":"play"},{"path":"g.lives","equals":3}]},
 {"name":"right moves","press":"right*10","expect":[{"path":"g.player.x","changes":true}]},
 {"name":"player stays green when hit","setup":"g.inv=30","press":"wait*7","expect":[{"pixel":["g.player.x","g.player.y"],"equals":11}]},
 {"name":"enemies drawn red on every frame","press":"left+o*90","expect":[{"each":"g.enemies","pixel":["x","y"],"equals":8,"always":true}]},
 {"name":"invincibility never exceeds 20","setup":"g.player.hp=1","press":"wait*200","expect":[{"path":"g.player.inv","atMost":20,"always":true}]}
]}
```

Each case boots fresh, runs `setup` (optional), then `press`, then compares. Expectations: `equals`, `notEquals`, `atLeast`, `atMost`, `changes` (true/false compared with the value right after setup). `equals: null` means the value is nil. `pixel: [x, y]` checks the screen colour (0-15) at a point of the last frame instead of a path; x and y are numbers or paths such as `"g.player.x"`. Use pixel cases for rules about what is drawn (a colour that must not change, an object that must stay visible); check a few different frames (`wait*6`, `wait*7`) when something could flicker. Keep cases short (a few frames after setup) so they stay exact.

`"always": true` judges the expectation after every pressed frame and reports the first frame that breaks it — use it for rules that must hold all the time (an object drawn in its colour, a timer within its range), since a one-frame fault (a shot drawn over an enemy as it fires, a timer one too high on the frame it is set) is easy to miss at the end of a press. `"each": "g.enemies"` applies the expectation to every element of a list; its `path` and `pixel` names are fields of the element (`"pixel":["x","y"]`, `"path":"y"`).

## What to check

- The core action and its visible response, with presses only.
- For a game with a result: reaching the win and the loss, and restarting with X (counters, entities, timers and progress back to their start values).
- For a toy or endless game: the requested behaviour and that nothing ends it unexpectedly. Do not invent a win.
- Every number, size, colour, position and timing the request states exactly, in every state where it applies (after a hit, during invincibility, on the result screen).
- After a change, rerun the routes it can affect.
