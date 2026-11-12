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

Optional lookups: /extensions/pico8/PALETTE.md for RGB values and extended colors; /extensions/pico8/references/sprites-maps.md for sprite/map resources; /extensions/pico8/references/api-catalog.md for the local API coverage.
