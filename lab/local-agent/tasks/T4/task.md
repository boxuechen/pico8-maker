main.lua holds a PICO-8 game skeleton. Turn it into a dodge game:
- rocks fall from the top of the screen; keep them in g.rocks as tables {x=..,y=..};
- a new rock appears every 20 frames at a random x and falls 2 pixels per frame;
- the player (g.player) moves left and right; a rock within 6 pixels of the player in both x and y makes you lose;
- count survived frames in g.time; reaching 900 frames (30 seconds) wins;
- show the time on screen. Keep the skeleton structure (g, new_game, g.mode, X retry).
