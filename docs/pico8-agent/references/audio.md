# SFX and music without an editor

Optional examples: recipe/sfx-from-notes and recipe/music-from-patterns are complete Lua programs with encoding helpers. The layouts below are sufficient when you do not need a full example.

## Workflow and API

Define readable notes, write SFX RAM, then trigger playback. Music adds patterns assigning SFX tracks to channels. Initialize once in _init and include all data in source. Writing notes does not start sound; calling sfx on an empty slot does not compose sound.

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

## SFX byte layout

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

## Music patterns

base=0x3100+pattern*4. Each byte corresponds to channel 0–3. Low six bits select SFX; bit 6 disables a channel. Empty channels must use 0x40, because SFX 0 is valid.

Bit 7 of channel byte 0 marks loop start; byte 1 marks loop end; byte 2 marks stop-after-pattern. Keep byte 3's high bit clear in basic patterns. Pattern loops differ from SFX loops.

The recipe uses pattern 0 with SFX 0/1 and pattern 1 with SFX 2/3. Both music channels use 32-note, equal-speed, non-looping SFX for predictable pattern duration. The last pattern loops to the first. SFX 4 plays on channel 3 independently. Different SFX lengths/loops influence pattern progression; nonzero note count alone does not define pattern length.

## Verification

Check RAM encoding, non-silent PCM, pattern progression 0→1→0 and channel independence after input. The supplied recipes have passed these local runtime checks. This is synthesis/behavior evidence, not subjective listening approval. Current model tools do not return audio; do not claim to have heard it.

Optional API details: api/audio.
