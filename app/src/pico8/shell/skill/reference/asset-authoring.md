# Resource files

The cart's resources are five text files next to `main.lua`, in the same formats as the sections of a `.p8` cart. Edit them with `read`/`edit`/`write` (or `sed`) like any file; every p8 command loads them with `main.lua`, and a p8 command that commits `main.lua` commits them too. A file with the wrong number of lines, a short line or a non-hex character stops p8 with the file and line; nothing is applied until it is fixed. Deleting a file restores it from the cart.

| File | Lines | Each line |
| --- | --- | --- |
| `gfx.txt` | 128 | 128 hex digits: one pixel each, colour 0-f (0 is transparent for `spr`) |
| `gff.txt` | 2 | 256 hex digits: two per sprite flag byte (line 1 sprites 0-127, line 2 sprites 128-255) |
| `map.txt` | 32 | 256 hex digits: two per cell, the sprite id drawn there (00 is empty) |
| `sfx.txt` | 64 | 168 hex digits: sfx 0-63 (line 1 is sfx 0) |
| `music.txt` | 64 | `ff 41424344`: pattern 0-63 |

## Sprites and flags

Sprite n (0-255) is the 8x8 block at x=(n%16)*8, y=flr(n/16)*8 of `gfx.txt`: lines y+1 to y+8, characters x+1 to x+8. Example, sprite 1 (x 8-15, lines 1-8) as a red heart:

```
line 1: 00000000 08800880 ...    (first 8 digits are sprite 0, next 8 sprite 1)
line 2: 00000000 88888888 ...
line 3: 00000000 88888888 ...
line 4: 00000000 08888880 ...
line 5: 00000000 00888800 ...
line 6: 00000000 00088000 ...
lines 7-8: 00000000 00000000 ...
```

(No spaces in the file; they only mark sprite boundaries here.) To change one sprite, replace those 8 characters on its 8 lines, e.g. `sed -i '1s/^\(.\{8\}\).\{8\}/\108800880/' gfx.txt` for line 1 of sprite 1, or rewrite the lines with `edit`. Sprites 128-255 (lines 65-128) share memory with map rows 32-63; leave them empty if the game uses the full map.

Flags: sprite n's flag byte is the two digits at position 2*(n%128) on line 1 (n<128) or line 2. Bit 0 is `fget(n,0)` (value 01), bit 1 is 02, ... bit 7 is 80. Sprite 1 solid for a collision check: line 1, characters 3-4 = `01`.

`p8 sheet --png sheet.png` writes the whole sheet at 4x with a grid; open it with `read`.

## Map

Cell (x,y) of the map (128x32 cells) is the two digits at characters 2x+1 and 2x+2 of line y+1 of `map.txt`, a hex sprite id: `01` draws sprite 1, `00` nothing. `map(0,0,0,0,16,16)` draws cells 0-15 x 0-15 at the top-left of the screen. `p8 map 0,0,16,16 --png map.png` shows a 16x16-cell area drawn with its sprites.

## Sound effects

A `sfx.txt` line is 8 header digits then 32 notes of 5 digits:

- header: `00` editor mode, speed (2 hex digits, ticks per note, 1 = fastest; 08-10 is typical), loop start, loop end (2 digits each; `0000` for no loop)
- note: pitch (2 hex digits, 00-3f; 0c = C1, 18 = C2, 24 = C3, 30 = C4), waveform (0 triangle, 1 tilted saw, 2 saw, 3 square, 4 pulse, 5 organ, 6 noise, 7 phaser), volume (0-7; 0 is silent), effect (0 none, 1 slide, 2 vibrato, 3 drop, 4 fade in, 5 fade out, 6 fast arpeggio, 7 slow arpeggio)

Example, sfx 8 as a short rising pickup at speed 6 (three notes, then silence):

```
0006000024350283502b355 ...   (no space in the file; 168 digits in total: pad with 00000 notes)
```

Here `24350` = pitch 24 (C3), square, volume 5, no effect; `28350` (E3) and `2b355` (G3, fade out) follow. Write all 32 notes; unused ones are `00000`. `p8 sfx 8` prints the sound in words to check it. Game code plays it with `sfx(8)`.

## Music

A `music.txt` line is pattern n: two flag digits (add 1 for loop start, 2 for loop end, 4 to stop after this pattern), a space, then four channel bytes. Each channel byte is an sfx id (00-3f), or 41-7f with bit 0x40 set for a silent channel; the empty line is `00 41424344`. Example: pattern 0 loops sfx 10 and 11 on two channels: `03 0a0b4344`. Game code starts it with `music(0)`.

Music and sound effects share four channels; `p8 run` lists the sfx and music each run starts. No sound is heard by you: these prove triggers, not how it sounds.

## Lua recipes

The recipes in examples/recipes build sprites, maps and sounds in Lua at startup. Prefer the resource files for static data; use code only for data the game generates.
