main.lua is empty. Make a small paint toy for PICO-8:
- a cursor starts at the centre of the screen, at g.x=64 and g.y=64;
- holding an arrow key moves the cursor one pixel per frame; it never leaves the screen (0 to 127);
- holding O paints the pixel under the cursor in the current colour, and painted pixels stay;
- pressing X switches to the next colour (g.colour, from 8 upwards, wrapping back to 1 after 15).
It is a toy: there is no score, no winning, no losing and no game over.
