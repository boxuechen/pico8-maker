# Native resource authoring

Resources (sprites, flags, map, sfx, music) are not files: read them with `read_assets` and change them with `edit_assets`. Use this reference for field formats and concrete examples.

Use these tools for static resources. Draft edits become playable when a p8 command commits main.lua (p8 check, run or look).

## Sprite and map example

Call edit_assets with:

```json
{"edits":[{"kind":"sprite","id":1,"rows":["00088000","00888800","08888880","08800880","08888880","00888800","00800800","08000080"],"flags":1},{"kind":"map","x":0,"y":0,"rows":[[1,1,1],[0,1,0]]}]}
```

Each sprite is 8×8; ids are 0–255. Pixels are lowercase hex palette slots 0–f, not RGB. Color 0 is normally transparent. Flags are an 8-bit mask for fget; omit flags to preserve them. You can change flags without rows, or rows without flags. Reading a sprite returns both.

Map patches contain tile ids in equal-width rows. The authored map is 128×32, patches at most 32 columns wide; read rectangles at most 32×32. Tile 0 is empty when drawn by map(). All 256 sprites are available. Map rows 32–63 alias the bottom half of the sprite sheet; the resource tools deliberately do not author those rows. Lua can still access shared memory, so intentional runtime writes may change sprites. The resource inspector shows authored data, not live RAM.

## Audio example

```json
{"edits":[{"kind":"sfx","id":0,"speed":8,"notes":[{"pitch":24,"waveform":0,"volume":5,"effect":0},{"pitch":28,"waveform":0,"volume":5,"effect":0},{"pitch":31,"waveform":0,"volume":4,"effect":3}]},{"kind":"music","id":0,"channels":[0,null,null,null],"loopStart":true,"loopEnd":true}]}
```

SFX ids: 0–63; up to 32 notes. Pitch 0–63, waveform/volume/effect 0–7, speed 1–255. SFX edits replace the slot; missing tail notes are silent. loopStart defaults to 0; loopEnd defaults to 0 (disabled), otherwise it must exceed loopStart and be at most 32. Custom instruments and SFX filter flags are outside this first authoring interface.

Music ids: 0–63, exactly four channels containing an SFX id or null (disabled). loopStart, loopEnd and stop default false. Editing a pattern replaces it. Game code calls sfx(0) or music(0) directly; data already exists before _init. Music and event sounds share four channels. No sound is returned to the agent; input results list sfx()/music() starts and the channels used, which verify triggers and channel sharing but not listening quality.

## Reads and persistence

read_assets({kind:"sprite",id:1,count:2}) reads consecutive sprites. SFX reads allow at most 4 slots per call, other slot reads at most 16. read_assets({kind:"map",x:0,y:0,width:16,height:16}) reads a room. Reads default to the shared working draft; version:"committed" selects the last playable resources and fails if none exist. Asset changes also invalidate other conversations' historical context. Undo restores code and resources together.

format defaults to "data". For sprite/map reads, format:"png" returns a visual preview with metadata; "both" adds the original data. For example read_assets({kind:"sprite",id:1,count:4,format:"both"}) returns a numbered sprite atlas with flags and image-region metadata. Map PNGs have a one-pixel grid and report the tile origin/extent. A resourceView identifies draft/committed and committed cartRevision. These previews use base palette colors, show color 0 as black, and treat map tile 0 as empty; they do not apply runtime palette, transparency, camera or flag filtering. Reading a preview does not start a Worker, pause playback, advance frames or commit edits. Test integration separately when needed. SFX/music have data reads only.

edit_assets reports changed slots/fields and changed map regions/cell counts based on the final batch result, plus draft/committed status. Overlapping map regions can report the same cell; their counts should not be added as a unique-cell total. A net no-op has changed:false and an empty changes list. Invalid batches still apply nothing.

Standalone Lua recipes demonstrate procedural initialization for portable examples. In this workbench, prefer read_assets/edit_assets for static data instead of copying their initialization helpers into every game. Do not automatically extract resources from arbitrary running Lua: it may generate or modify them dynamically.
