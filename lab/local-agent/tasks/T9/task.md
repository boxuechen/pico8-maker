main.lua draws sprite 1 at (g.x, 60), but sprite 1 is empty. Draw sprite 1 as a yellow coin (colour 10) in the cart's sprite sheet:
- its four centre pixels (columns 3-4 and rows 3-4 of the 8x8 sprite, counting from 0) are yellow;
- its four corner pixels are transparent (colour 0);
- set flag 0 of sprite 1, so fget(1,0) is true.
Do not change main.lua.
