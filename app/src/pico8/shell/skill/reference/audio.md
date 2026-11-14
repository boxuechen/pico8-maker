# SFX and music without an editor

Write sound effects as lines of `sfx.txt` and music patterns as lines of `music.txt` next to `main.lua` (formats and examples in reference/asset-authoring.md); game code only calls `sfx(n)` and `music(n)`. Check a sound with `p8 sfx n`; `p8 run` lists the sfx and music each run starts. Do not poke audio RAM from code for fixed sounds or music: data written by code is missing from the files the user sees and edits, so the cart's resources show no music. Poke RAM (layout below, recipes in examples/recipes) only for sound the game generates while it runs.

## API

Calling sfx on an empty slot does not compose sound; give the slot notes in `sfx.txt` first.

| Call | Meaning |
| --- | --- |
| sfx(n[,channel,offset,length]) | Play slot 0–63 on channel 0–3; offset/length count notes, not seconds |
| sfx(n) | Automatic channel allocation |
| sfx(n,-2) | Stop that SFX on any channel |
| sfx(-1,channel), sfx(-1) | Stop SFX on one/all channels |
| sfx(-2,channel) | Release a loop rather than immediately cutting it |
| music(n[,fade_ms,channel_mask]) | Start pattern 0–63; fade in milliseconds; mask reserves channels |
| music(-1[,fade_ms]) | Stop/fade music |

Mask 3 reserves channels 0 and 1 (1+2), not channel 3. An explicitly selected SFX channel may still interrupt music. Reserve e.g. 0/1 for music and 3 for feedback. music(-1) and sfx(-1) control different playback objects.

## Generated audio: SFX byte layout

base=0x3200+id*68. There are 32 two-byte notes plus four metadata bytes.

| Offset | Bits / meaning |
| --- | --- |
| 2*i, i=0–31 | Bits 0–5 pitch; bits 6–7 low two waveform bits |
| 2*i+1 | Bit 0 high waveform bit; bits 1–3 volume; bits 4–6 effect; bit 7 custom instrument |
| 64 | Filters; basic recipes use 0 |
| 65 | Speed; recipes require integer 1–255 |
| 66 | Loop start note |
| 67 | Loop end; end>start loops [start,end) |

A basic note is {pitch,wave,volume,effect}. Pitch 0–63 counts semitones from C0 (24=C2), wave/volume/effect 0–7. Volume 0 is a rest. Encode:

```lua
local lo=pitch+(wave%4)*64
local hi=flr(wave/4)+volume*2+effect*16
poke(base+note_index*2,lo)
poke(base+note_index*2+1,hi)
```

Waveforms: 0 triangle, 1 tilted saw, 2 saw, 3 square, 4 pulse, 5 organ-like, 6 noise, 7 phaser-like. Effects: 0 none, 1 slide, 2 vibrato, 3 pitch drop, 4 fade in, 5 fade out, 6/7 two arpeggio subdivisions influenced by speed.

Clear all 68 bytes first, write notes, then speed. Remaining notes are silent. sfx(0,3,0,4) limits playback to four notes. Basic helpers leave filters/custom-instrument bits and loop metadata zero. Advanced modes require explicit data and verification.

The local synth uses 22050 Hz and roughly 183 samples per speed unit per note. Speed 8 is about 66 ms per note. This is not one note per game frame; verify timing by advancing the runtime.

## Generated audio: music pattern layout

base=0x3100+pattern*4. Each byte corresponds to channel 0–3. Low six bits select SFX; bit 6 disables a channel. Empty channels must use 0x40, because SFX 0 is valid.

Bit 7 of channel byte 0 marks loop start; byte 1 marks loop end; byte 2 marks stop-after-pattern. Keep byte 3's high bit clear in basic patterns. Pattern loops differ from SFX loops.

A simple loop: pattern 0 with two 32-note sfx of equal speed (in `music.txt`: `01 08094243`), pattern 1 with two more (`02 0a0b4243`), so 1 marks the loop start and 2 the loop end; feedback sfx play on channel 3 (`music(0,0,3)` reserves channels 0 and 1). Different SFX lengths or loops change how long a pattern lasts; the note count alone does not.

## Verification

Check each sound with `p8 sfx n`, and that `p8 run` lists the music starting (`music 0@1`) and the sfx your events trigger (`sfx 3@41`). This proves triggers and data, not how it sounds. The tools do not return audio; do not claim to have heard it.
