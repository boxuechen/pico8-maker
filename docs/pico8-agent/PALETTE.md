# Color palette

English labels describe colors; they do not identify objects. Data source: palette.json.

| Code | Slot character | Color | RGB |
| --- | --- | --- | --- |
| 0 | 0 | black | #000000 |
| 1 | 1 | dark blue | #1d2b53 |
| 2 | 2 | dark purple | #7e2553 |
| 3 | 3 | dark green | #008751 |
| 4 | 4 | brown | #ab5236 |
| 5 | 5 | dark gray | #5f574f |
| 6 | 6 | light gray | #c2c3c7 |
| 7 | 7 | off white | #fff1e8 |
| 8 | 8 | red | #ff004d |
| 9 | 9 | orange | #ffa300 |
| 10 | a | yellow | #ffec27 |
| 11 | b | bright green | #00e436 |
| 12 | c | blue | #29adff |
| 13 | d | gray purple | #83769c |
| 14 | e | pink | #ff77a8 |
| 15 | f | light peach | #ffccaa |
| 128 | display target | dark brown black | #291814 |
| 129 | display target | midnight blue | #111d35 |
| 130 | display target | dark plum | #422136 |
| 131 | display target | dark teal | #125359 |
| 132 | display target | brick red | #742f29 |
| 133 | display target | gray mauve | #49333b |
| 134 | display target | warm taupe | #a28879 |
| 135 | display target | pale yellow green | #f3ef7d |
| 136 | display target | deep rose | #be1250 |
| 137 | display target | red orange | #ff6c24 |
| 138 | display target | yellow green | #a8e72e |
| 139 | display target | emerald green | #00b543 |
| 140 | display target | extended dark blue | #065ab5 |
| 141 | display target | muted plum | #754665 |
| 142 | display target | coral red | #ff6e59 |
| 143 | display target | salmon peach | #ff9d81 |

Use numeric IDs in Lua. Extended codes 128–143 are display targets selected with pal(slot,code,1); the screen still has 16 slots. Draw remapping changes subsequent writes; display remapping changes the final color. Transparency is controlled separately by palt. ASCII observations report the actual frame display palette rather than assuming default colors. Each character 0-f represents a screen slot after draw remapping and before display remapping. The legend applies even when multiple slots share a display color. Slot 0 is not an empty or transparent screen pixel.
