---
name: pico8
description: Make, change and fix PICO-8 games in main.lua and check them with the p8 command. Use for any PICO-8, pico8, cart or small retro game task.
---

# PICO-8 games

## Workflow (always follow)

1. Read the task, `main.lua`, and `checks.json` if it exists.
2. For a **new game** whose task states exact rules (numbers, sizes, colours, positions, timings, how to win, lose or restart), first write the rules most likely to break as short cases in `checks.json` (at most 8; format below). For edits and fixes, keep using an existing `checks.json` and add no cases unless asked. When the request changes a rule a case checks (a new score to win, a new speed), update that case to the new rule in the same change. Never delete or weaken a case for any other reason, and never to make it pass.
3. Make the smallest change that does the task; keep existing variable names. Edit one place per `edit` call: copy a short `oldText` (one or two lines) exactly from the file, including its leading spaces. If an edit fails, read those lines again with `read` and retry. Never rewrite the whole game to make a small change.
4. After **every** change run `p8 check` with bash. Read each `FAIL` line: it gives the line number, the code on that line (`code:`) and what to change. Change only what the task and the FAIL ask; do not add extra conditions. Running `p8 check` again without editing gives the same result.
5. Repeat until `p8 check` prints `ALL PASSED` (lint, boot, input and every case). Never finish while something fails.
6. Reply briefly with what you changed and what you checked (a host may ask for a specific format).

## p8 commands

Every command loads `main.lua` in a fresh session with a fixed random seed, so the same command gives the same result.

- Presses: `--press "right*30 o wait*10 left+x*5"` runs tokens in order; `name*n` holds n frames (default 1), `a+b` holds together, `wait` holds nothing. Names: left, right, up, down, o (button 4), x (button 5). `x x` is one two-frame hold (`btnp(5)` fires once); write `x wait x` for two presses.
- `p8 run --press "..." --read g.score,g.mode,#g.enemies` prints frames run, each `g.mode` change with its frame, sounds (`sfx 2@41`), printh output, then the values (dotted paths, `#path` for a length; without `--read` all of `g`).
- `--setup "g.score=9 g.lives=1"` on `run` or `look` runs Lua after boot, before the presses: a quick way to reach a late state. It is not normal play. Never edit `main.lua` just to test something: such edits end up in the game the user gets.
- `p8 run --bot "lua" --until "g.mode=='win'"` runs a Lua function body every frame that returns the buttons to hold (left=1 right=2 up=4 down=8 o=16 x=32, added; nil = none) until the condition holds, then replays those presses as normal play. Use a simple greedy rule for long routes (move toward the target, fire when aligned); do not search for press strings by hand or write simulators.
- `p8 look --press "..."` prints the screen as 32x32 characters (colours 0-f); `--crop x,y,w,h` (at most 64x64) prints exact pixels; `--png screen.png` also writes a 512x512 image to open with `read`.
- Sprites, flags, map, sound effects and music are the files `gfx.txt`, `gff.txt`, `map.txt`, `sfx.txt` and `music.txt` next to `main.lua` (formats in reference/asset-authoring.md). `p8 sheet --png sheet.png`, `p8 map 0,0,16,16 --png map.png` and `p8 sfx 3` show them.
- `p8 new skeleton` starts an empty `main.lua` from a working game with win/lose; `p8 new toy` from a toy without a result.

## checks.json

```json
{"cases":[
 {"name":"last life lost loses","setup":"g.lives=1 g.fish={{x=10,y=126,vy=1}}","press":"wait*3","expect":[{"path":"g.mode","equals":"lose"}]},
 {"name":"right moves","press":"right*10","expect":[{"path":"g.player.x","changes":true}]},
 {"name":"player green when hit","setup":"g.inv=30","press":"wait*7","expect":[{"pixel":["g.player.x","g.player.y"],"equals":11}]},
 {"name":"enemies red every frame","press":"left+o*90","expect":[{"each":"g.enemies","pixel":["x","y"],"equals":8,"always":true}]}
]}
```

Each case boots fresh, runs `setup`, then `press`, then compares. Expectations: `equals` (`null` = nil), `notEquals`, `atLeast`, `atMost`, `changes` (true/false against the value after setup). `pixel: [x, y]` is the screen colour 0-15 at a point (numbers or paths). `"always": true` judges every pressed frame and reports the first one that breaks (one-frame faults: a shot drawn over an enemy, a timer one too high). `"each": "g.enemies"` applies to every element; `path`/`pixel` names are its fields. Keep cases a few frames long so they stay exact.

## What to verify

- The core action and its visible response, with presses only.
- Games with a result: the win and the loss reached with presses only (by hand for a short game, `--bot` for a long one), and X restarting with every counter, entity and timer back to its start value. `--setup` runs only support these.
- Toys and endless games: the requested behaviour, and that nothing ends it unexpectedly. Do not invent a win.
- Every number, size, colour, position and timing the request states, in every state where it applies.
- After a change, rerun the routes it can affect. More detail: reference/playtest.md.

## PICO-8 Lua is not standard Lua

| Do not write | Write instead |
| --- | --- |
| `math.floor(x)` | `flr(x)` |
| `math.random(n)` | `rnd(n)` (0 to below n, fractional); `flr(rnd(n))` for 0..n-1 |
| `math.abs/min/max/sqrt(x)` | `abs/min/max/sqrt(x)` |
| `table.insert(t,v)` | `add(t,v)` |
| `table.remove(t,i)` | `deli(t,i)`, or `del(t,v)` to remove a value |
| `for i,v in ipairs(t)` while deleting | `for v in all(t) do ... del(t,v) ... end` |
| `string.sub(s,i,j)`, `string.format` | `sub(s,i,j)`, join with `..` |
| `love.*`, `pygame`, `require`, `os.*` | nothing: one file, PICO-8 functions only |
| `print(x)` for debugging | `printh(x)` |

Write code, comments and on-screen text in plain ASCII English.

## How games are written

- Keep game state in a global table `g` (never `local g`): `new_game()` builds `g`, `_init()` calls `new_game()`. Then `p8 run --read g.x,g.score` can show any value.
- Games with a result use `g.mode`: `"play"`, `"win"` or `"lose"`. After a result, count `g.wait` and restart only when `g.wait>15 and btnp(5)`. `p8 run` reports every change of `g.mode`.
- Toys, sandboxes and other games without winning or losing need no `g.mode`; do not add a result the task does not ask for.
- `_update()` runs 30 times per second and changes state; `_draw()` starts with `cls(c)` and draws everything.
- Screen 128x128, coordinates 0-127, y grows downward. Buttons: `btn(0)` left, `1` right, `2` up, `3` down, `4` O, `5` X; `btnp(b)` is true on the frame of a press.
- Drawing: `rectfill(x0,y0,x1,y1,c)`, `circfill(x,y,r,c)`, `line(...)`, `print(str,x,y,c)`. Colours: 0 black, 1 dark blue, 7 white, 8 red, 9 orange, 10 yellow, 11 green, 12 blue.
- Sounds: `sfx(0)` pickup, `1` shoot, `2` hit, `3` win, `4` lose, `5` jump, `6` blip, `7` explode.

## References (read only what the task needs)

| Topic | File (under /skill/pico8) |
| --- | --- |
| Designing, editing, readability, colours, machine limits | reference/workflow.md, reference/game-design.md |
| More on p8 output, `--bot`, `--crop` and checks | reference/playtest.md |
| Every common function; input, time, system and menus | reference/api.md |
| Lua differences, numbers, tables; browser runtime limits | reference/lua.md |
| Drawing, palette, sprites, maps | reference/graphics.md, reference/sprites-maps.md |
| Resource files gfx.txt, gff.txt, map.txt, sfx.txt, music.txt; sound and music | reference/asset-authoring.md, reference/audio.md |
| Saves, memory, cart budgets | reference/memory-storage.md |
| Collect/build loops, match puzzles | reference/collect-build.md, reference/match-puzzle.md |
| Complete small games | examples/star-catch.lua; examples/spring-courier.lua, signal-arena.lua, lantern-vault.lua (described in reference/microgames.md) |
| Snippets that generate sprites, maps, sfx or music in code while the game runs (fixed data goes in the resource files), or save a high score | examples/recipes/*.lua |
