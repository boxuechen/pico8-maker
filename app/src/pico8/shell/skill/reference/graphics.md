# Drawing, camera and palettes

| Call | Parameters and behavior |
| --- | --- |
| cls([c]) | Clear screen, default 0 |
| pset(x,y[,c]), pget(x,y) | Write/read a color slot, not RGB |
| color([c]) | Set pen color; return previous color |
| line(x0,y0[,x1,y1,c]) | Line, also supports stateful continuation; explicit endpoints are clearest |
| rect/rectfill(x0,y0,x1,y1[,c]) | Outline/filled rectangle, inclusive endpoints |
| circ/circfill(x,y[,r,c]) | Circle centered at x,y |
| oval/ovalfill(x0,y0,x1,y1[,c]) | Ellipse in bounding box |
| rrect/rrectfill(x,y,w,h,r[,c]) | Rounded rectangle using width/height, unlike rect |
| print(text[,x,y,c]) | Draw P8SCII, return next horizontal position; control codes may change state |
| cursor(x,y[,c]) | Set text cursor; return previous cursor coordinates |
| camera([x,y]) | Set camera offset; return old x/y; no arguments resets |
| clip([x,y,w,h[,intersect]]) | Clip drawing; no arguments restores full screen |
| fillp([pattern]) | Set 4 by 4 fill pattern and return previous pattern; fractional bits control extra modes |

Drawing state persists. Reset camera and clip before HUD; restore temporary fillp/pal/palt changes deliberately. An 8-pixel-wide box ends at x+7.

## Color remapping

pal(c0,c1[,p]) or pal(table[,p]): p=0 draw mapping, p=1 display mapping, p=2 secondary mapping used with fillp. pal() resets palettes and transparency; pal(p) resets the selected palette.

Draw remapping affects subsequent writes, not previously drawn pixels. Display remapping affects the final whole screen. pal(11,8); spr(1,60,60); pal() draws green sprite pixels as red. pal(11,8,1) makes screen slot 11 display red while the slot value remains 11.

palt(c,transparent) changes sprite/map transparency; palt() restores the default (slot 0 transparent). A single mask argument is also available. Shape drawing with color 0 is black, not transparent.

Use shapes for particles/HUD, sprites for fixed pixel artwork, maps for repeated tiles. Mix these as appropriate. Choose clear foreground/background contrast and silhouettes; using all 16 colors is unnecessary. Hitboxes are gameplay data, not automatically derived from transparent pixels. CSS scaling does not change the 128 by 128 logical screen.

RGB values and extended colours are in the palette section below; sprite and map resources are in /skill/pico8/reference/sprites-maps.md.

## Color palette

English labels describe colors; they do not identify objects. Data source: palette.json.

| Code | Slot character | Color | RGB |
| --- | --- | --- | --- |
| 0 | 0 | black | #000000 |
| 1 | 1 | dark blue | #1d2b53 |
| 2 | 2 | dark purple | #7e2553 |
| 3 | 3 | dark green | #008751 |
| 4 | 4 | brown | #ab5236 |
| 5 | 5 | dark gray | #5f574f |
| 6 | 6 | light gray | #c2c3c7 |
| 7 | 7 | off white | #fff1e8 |
| 8 | 8 | red | #ff004d |
| 9 | 9 | orange | #ffa300 |
| 10 | a | yellow | #ffec27 |
| 11 | b | bright green | #00e436 |
| 12 | c | blue | #29adff |
| 13 | d | gray purple | #83769c |
| 14 | e | pink | #ff77a8 |
| 15 | f | light peach | #ffccaa |
| 128 | display target | dark brown black | #291814 |
| 129 | display target | midnight blue | #111d35 |
| 130 | display target | dark plum | #422136 |
| 131 | display target | dark teal | #125359 |
| 132 | display target | brick red | #742f29 |
| 133 | display target | gray mauve | #49333b |
| 134 | display target | warm taupe | #a28879 |
| 135 | display target | pale yellow green | #f3ef7d |
| 136 | display target | deep rose | #be1250 |
| 137 | display target | red orange | #ff6c24 |
| 138 | display target | yellow green | #a8e72e |
| 139 | display target | emerald green | #00b543 |
| 140 | display target | extended dark blue | #065ab5 |
| 141 | display target | muted plum | #754665 |
| 142 | display target | coral red | #ff6e59 |
| 143 | display target | salmon peach | #ff9d81 |

Use numeric IDs in Lua. Extended codes 128–143 are display targets selected with pal(slot,code,1); the screen still has 16 slots. Draw remapping changes subsequent writes; display remapping changes the final color. Transparency is controlled separately by palt. ASCII observations report the actual frame display palette rather than assuming default colors. Each character 0-f represents a screen slot after draw remapping and before display remapping. The legend applies even when multiple slots share a display color. Slot 0 is not an empty or transparent screen pixel.
