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

Runs Lua after boot (after `_init`) and before the presses. Use it to reach a win, a loss, a late level or a rare event quickly, without editing `main.lua`. Setup runs are not normal play: before reporting a path as played, also play it once with presses only when that is practical (for example, win a short game by playing it).

## p8 look

`p8 look --press "right*30"` prints the screen as 32x32 characters (one per 4x4 block, the most common colour 0-f). `--png s.png` also writes a 512x512 image (4x); open it with `read`. Positions in the image divide by 4 to give screen pixels.

## checks.json

`p8 check` runs every case in `/cart/checks.json` after lint, boot and input:

```json
{"cases":[
 {"name":"starts with 3 lives","press":"wait","expect":[{"path":"g.lives","equals":3}]},
 {"name":"last life lost loses","setup":"g.lives=1 g.fish={{x=10,y=126,vy=1}}","press":"wait*3","expect":[{"path":"g.mode","equals":"lose"}]},
 {"name":"x restarts","setup":"g.mode='lose' g.wait=20","press":"x wait","expect":[{"path":"g.mode","equals":"play"},{"path":"g.lives","equals":3}]},
 {"name":"right moves","press":"right*10","expect":[{"path":"g.player.x","changes":true}]}
]}
```

Each case boots fresh, runs `setup` (optional), then `press`, then compares. Expectations: `equals`, `notEquals`, `atLeast`, `atMost`, `changes` (true/false compared with the value right after setup). `equals: null` means the value is nil. Keep cases short (a few frames after setup) so they stay exact.

## What to check

- The core action and its visible response, with presses only.
- For a game with a result: reaching the win and the loss, and restarting with X (counters, entities, timers and progress back to their start values).
- For a toy or endless game: the requested behaviour and that nothing ends it unexpectedly. Do not invent a win.
- Every number, size, colour, position and timing the request states exactly, in every state where it applies (after a hit, during invincibility, on the result screen).
- After a change, rerun the routes it can affect.
