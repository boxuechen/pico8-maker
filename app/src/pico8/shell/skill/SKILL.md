---
name: pico8
description: Make, change and fix PICO-8 games in main.lua and check them with the p8 command. Use for any PICO-8, pico8, cart or small retro game task.
---

# PICO-8 games

## Workflow (always follow)

1. Read the task, `main.lua`, and `checks.json` if it exists.
2. For a **new game** whose task states exact rules (numbers, sizes, colours, positions, timings, how to win, lose or restart), first write the rules most likely to break as short cases in `checks.json` (at most 8): optional `setup` Lua, `press`, then `expect` values on `g` or screen pixels; rules that must hold on every frame (what is drawn where the state says, timer ranges) get `"always": true`, lists use `"each"` (format in reference/playtest.md). Never delete or weaken a case to make it pass. For edits and fixes, keep using an existing `checks.json` and add no cases unless asked.
3. Make the smallest change that does the task; keep existing variable names. Edit one place per `edit` call: copy a short `oldText` (one or two lines) exactly from the file, including its leading spaces. If an edit fails, read those lines again with `read` and retry. Never rewrite the whole game to make a small change.
4. After **every** change run `p8 check` with bash. Read each `FAIL` line: it gives the line number, the code on that line (`code:`) and what to change. Change only what the task and the FAIL ask; do not add extra conditions. Running `p8 check` again without editing gives the same result.
5. Repeat until `p8 check` prints `ALL PASSED` (lint, boot, input and every case). Never finish while something fails.
6. Reply briefly with what you changed and what you checked (a host may ask for a specific format).

Other commands:

- `p8 run --press "right*30 wait*60" --read g.score,g.mode` plays the game and prints mode changes, sounds and values.
- `--setup "g.score=9 g.lives=1"` on `p8 run` or `p8 look` runs Lua after boot and before the presses. Use it to test a win, a loss, a late level or a rare event quickly. Never edit `main.lua` just to test something: such edits end up in the game the user gets.
- `p8 look --press "right*30"` prints the screen as 32x32 characters (colours 0-f). Add `--crop 56,96,16,16` (x,y,w,h, at most 64x64) for exact pixels, or `--png screen.png` to also write a 512x512 image, then open it with `read` to see the screen.
- Sprites, flags, map, sound effects and music are the files `gfx.txt`, `gff.txt`, `map.txt`, `sfx.txt` and `music.txt` next to `main.lua` (formats in reference/asset-authoring.md). `p8 sheet --png sheet.png`, `p8 map 0,0,16,16 --png map.png` and `p8 sfx 3` show them.
- `p8 new skeleton` starts an empty `main.lua` from a working game skeleton with win/lose; `p8 new toy` from a toy without a result.

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
| p8 presses, `--read`, `--setup`, `checks.json` format, what to verify | reference/playtest.md |
| Every common function | reference/api.md |
| Lua differences, numbers, tables | reference/lua.md |
| Drawing, palette, sprites, maps | reference/graphics.md, reference/palette.md, reference/sprites-maps.md |
| Resource files gfx.txt, gff.txt, map.txt, sfx.txt, music.txt; sound and music | reference/asset-authoring.md, reference/audio.md |
| Saves, memory, input, menus | reference/memory-storage.md, reference/input-system.md |
| Browser runtime limits | reference/runtime-compatibility.md |
| Collect/build loops, match puzzles | reference/collect-build.md, reference/match-puzzle.md |
| Complete small games | examples/star-catch.lua; examples/spring-courier.lua, signal-arena.lua, lantern-vault.lua (described in reference/microgames.md) |
| Snippets that build sprites, maps, sfx, music or a high-score save in code (not complete games) | examples/recipes/*.lua |
