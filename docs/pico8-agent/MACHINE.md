# PICO-8 machine

Target: PICO-8 v0.2.7. Use the host section for current submission and observation capabilities.

## Screen and execution

- Logical display: 128 by 128 pixels, origin (0,0) at top left; x increases right, y down. Each pixel selects one of 16 slots. The screen is 8192 packed bytes, low nibble left and high nibble right.
- Numbers are signed 16.16 fixed point, approximately -32768 to 32767.99998, with 1/65536 increments. Intermediate arithmetic can overflow; do not assume JavaScript doubles.
- _init initializes; _update targets 30 updates/second, _update60 targets 60; _draw renders. Put required state changes in update rather than draw. Under load, update and draw need not be one-to-one.
- Angles use turns: 1 is a circle, cos(0)=1, sin(0.25)=-1. atan2 takes (dx,dy), unlike common (y,x) libraries.
- Set srand(seed) during initialization for reproducibility, not repeatedly every frame.
- camera(cx,cy) offsets world drawing. Restore camera() and clip() before screen-space HUD drawing. An 8 by 8 filled box is rectfill(x,y,x+7,y+7,c).

## Controls

| Action | Lua button | Tool bit mask |
| --- | --- | --- |
| Left | 0 | 1 |
| Right | 1 | 2 |
| Up | 2 | 4 |
| Down | 3 | 8 |
| O / Z | 4 | 16 |
| X | 5 | 32 |

btn tests held state; btnp includes new presses and automatic repeats. Right plus X is tool mask 34, not btn(34). Player defaults to 0; current tools supply only player 0.

## Art and audio

The default sprite sheet is 128 by 128 pixels, split into 256 tiles of 8 by 8. Sprite n starts at ((n%16)*8,flr(n/16)*8). spr width/height use tiles; sspr uses pixels. Map source dimensions use tiles, destination coordinates use screen pixels.

The default map is 128 tiles wide: 32 independent rows plus 32 rows sharing the lower sprite sheet. Map rows 32–63 conflict with sprites 128–255. Eight flags per sprite are user-defined data, not automatic physics. Map tile 0 is normally empty. Sprite color 0 is transparent by default; shape drawing with color 0 still draws black.

There are four audio channels, 64 SFX slots with 32 notes each, and 64 music patterns selecting four SFX tracks. Initialize sound data before playback. SFX loops and music-pattern loops are different mechanisms.

## Default Base RAM layout

| Inclusive range | Use |
| --- | --- |
| 0x0000–0x0fff | Upper sprite sheet |
| 0x1000–0x1fff | Lower sprite sheet / lower map, shared |
| 0x2000–0x2fff | Upper map |
| 0x3000–0x30ff | Sprite flags |
| 0x3100–0x31ff | Music: 64 patterns of 4 bytes |
| 0x3200–0x42ff | SFX: 64 slots of 68 bytes |
| 0x4300–0x55ff | User data |
| 0x5600–0x5dff | User data / custom font when defined |
| 0x5e00–0x5eff | Persistent cart data: 64 fixed-point values |
| 0x5f00–0x5f3f | Draw state |
| 0x5f40–0x5f7f | Hardware state |
| 0x5f80–0x5fff | GPIO; external meaning depends on host |
| 0x6000–0x7fff | Screen |
| 0x8000–0xffff | Extended user data |

Advanced remapping can change graphics/map/screen addresses. RAM, cart data and Lua variables are separate. RAM edits do not automatically enter exported source. Include asset tables and initialization in Lua. reload restores cart data and may overwrite generated assets.

cartdata(id) selects a save namespace; dget/dset access slots 0–63. Keep IDs stable and version the slot schema. Reset is not necessarily save erasure. Persistence lifetime is host-specific.

## Budgets

Official cartridge design targets include 8192 code tokens, a 32 KiB cart data model and roughly 4M VM instructions/second. Lua heap is separate from Base RAM. PNG/ROM export also constrains compressed code size. Source character count is not a substitute for token or compressed-size measurement; the host does not necessarily enforce every export constraint.

Avoid rebuilding assets each frame, large temporary tables, unbounded loops and unnecessary full-map scans. Measure actual runtime diagnostics rather than inferring correctness from a visible frame.
