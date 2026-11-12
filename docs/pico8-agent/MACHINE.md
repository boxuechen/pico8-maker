# PICO-8 machine

Target PICO-8 v0.2.7. The screen is 128×128 with 16 palette slots and a top-left origin. Use numeric colors. Sprite slot 0 is transparent by default. Restore camera and clip for screen-space HUDs.

Use _init for setup, _update (30 Hz) or _update60 (60 Hz) for simulation, and _draw for rendering. Keep frame work bounded. Numbers use signed 16.16 fixed point (-32768 to just below 32768); large decimal sentinels such as 99999 wrap. Use nil for an unset nearest-target distance or a bounded value, and keep squared-distance intermediates in range. Angles use turns and atan2 takes (dx,dy). Functions such as flr, max and rnd are globals.

Aim for 8192 code tokens and 65535 source characters. Tool budgets are approximate. Native resources load before _init. The lower sprite sheet overlaps the lower map. Audio uses four shared channels. cartdata selects a save namespace with numeric dget/dset slots 0–63.
