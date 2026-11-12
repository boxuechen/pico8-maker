# Pixel art, animation and maps without an editor

Optional examples: /extensions/pico8/recipes/sprite-from-rows.lua and /extensions/pico8/recipes/map-from-rows.lua are complete verified Lua programs.

## Resource planning

The default sprite sheet is 128 by 128 pixels: 256 tiles of 8 by 8. The default map is 128 tiles wide, with 32 independent rows and 32 rows sharing the lower sprite sheet.

Assign sprite ranges and flags explicitly: e.g. 1–15 actors, 16–31 terrain, bit 0 solid, bit 1 collectible. Flags are data, not physics. Reserve tile 0 for empty map cells.

Keep pixel rows/tile grids in Lua source and write them once in _init. Reload/export then reconstructs assets without depending on previous RAM contents.

| Call | Units, result or effect |
| --- | --- |
| sset(x,y,c), sget(x,y) | Sprite-sheet pixel coordinates 0–127, color slot |
| spr(n,x,y[,w,h,flip_x,flip_y]) | Sprite n; width/height in tiles, default 1 |
| sspr(sx,sy,sw,sh,dx,dy[,dw,dh,flip_x,flip_y]) | Source and destination in pixels, scaling/flipping |
| fset(n,flags) | Set full flag byte |
| fset(n,flag,bool) | Set/clear bit 0–7 |
| fget(n), fget(n,flag) | Full byte / boolean bit |
| mset(tx,ty,n), mget(tx,ty) | Map tile coordinates, sprite ID |
| map(tx,ty,x,y,tw,th[,layers]) | Source tile rectangle to destination pixels; layers is a mask |
| tline(x0,y0,x1,y1,mx,my[,mdx,mdy,layers]) | Textured line sampling map coordinates, normally in tiles |

## Pixel rows and animation

An 8-character row such as "0bb77bb0" uses hexadecimal color slots: b=bright green, 7=off white, 0=transparent by default. Parse each character with tonum("0x"..ch), then sset at the sprite's sheet origin. Validate exactly eight rows of eight valid digits; explicitly write zero pixels to remove old artwork.

Sprite n begins at ((n%16)*8,flr(n/16)*8). Two frames in slots 1/2 can use spr(1+flr(ticks/20)%2,x,y). Keep canvas size and foot/center anchors consistent. Define collision boxes separately.

## Tile maps and collision

Map characters are semantic symbols, not pixel colors: # wall, . empty, * coin map to sprite IDs 1/0/2. The map recipe uses a 16 by 8 grid drawn at screen (0,16); tx/ty are tile coordinates. Check bounds, mget the candidate tile and fget(tile,0) before moving. Collect by clearing the tile with mset and increasing a counter.

For continuous movement, test the hitbox's candidate tile range, not just its center, and resolve horizontal/vertical collisions. Rendering a wall does not implement collision.

Map rows 32–63 share RAM 0x1000–0x1fff with sprite-sheet rows 64–127 (sprites 128–255). Do not initialize both as independent resources. The recipes only use the upper sheet and upper eight map rows.

mset changes this run's RAM. Reset reconstructs the original level. To preserve collected items, store progress separately with cartdata and apply it after rebuilding the map.

Verify actual transparent pixels, frame changes, wall blocking, coin disappearance/count, and resource reconstruction after source reload.

Optional API details: /extensions/pico8/references/api-catalog.md; sprite drawing signatures are also in /extensions/pico8/references/api-catalog.md.
