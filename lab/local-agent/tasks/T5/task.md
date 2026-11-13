main.lua is empty. Write a complete PICO-8 game in it: a basket catches falling apples.
- the basket is g.player {x=..,y=..} near the bottom and moves left and right;
- apples are tables {x=..,y=..} in g.apples; a new apple appears every 30 frames at the top and falls;
- an apple within 8 pixels of the basket in x and 4 in y is caught: g.score goes up by 1;
- an apple that falls below the screen is missed: g.missed goes up by 1;
- g.score reaching 10 wins; g.missed reaching 3 loses;
- show score and misses on screen.
