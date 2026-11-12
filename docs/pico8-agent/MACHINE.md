# PICO-8 machine

Target: PICO-8 v0.2.7. Host and tool descriptions define the available submission, input and observation operations.

- Screen: 128 by 128 pixels, origin at the top left, x right and y down; 16 color slots per frame. Use numeric color IDs in Lua. The default color legend describes the base palette; remapped observations carry the actual frame palette.
- Runtime: _init initializes; _update targets 30 updates/second or _update60 targets 60; _draw renders. Initialize assets once and keep simulation in update. Avoid unbounded work per frame.
- P8 Lua numbers use signed 16.16 fixed point, approximately -32768 to 32767.99998; intermediate arithmetic can overflow. PICO-8 functions such as max, flr and rnd are globals, not math.* functions.
- Angles use turns: cos(0)=1, sin(0.25)=-1; atan2 takes (dx,dy). Arrays conventionally start at 1; sprite, sound and button IDs start at 0.
- Graphics state persists. Restore camera/clip for screen-space HUDs. Sprite color 0 is transparent by default; shape color 0 still draws black. Lower sprite-sheet and lower map storage overlap.
- Audio slots require initialized note/pattern data before sfx/music playback. Music and event SFX share four channels.
- cartdata selects a save namespace; dget/dset access numeric slots 0–63. Preserve existing progress during repairs. Reset and persistence lifetime depend on the host.

Detailed APIs, memory layouts and resource examples are available on demand through the reference library.
