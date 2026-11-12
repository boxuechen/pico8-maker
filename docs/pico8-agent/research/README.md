# Classic-game research archive

Selection: https://nerdyteachers.com/PICO-8/Games/Top200/ . Source metadata lives in sources.json; immutable byte hashes and local startup results live in inventory.json. The four originals are downloaded and decoded into ignored .cache/classic-study. They are not bundled into the app or used as the new examples' assets.

Run `node docs/pico8-agent/research/collect.mjs --fetch` to acquire the listed public artifacts and decode them using the existing cartridge codec. Without --fetch, it reads the existing cache. Acquisition fails on HTTP errors; it does not fall back to a different version. Compare artifact hashes before treating a repeat collection as the same evidence.

For each game the cache contains the original cartridge, source.p8lua (P8SCII code bytes), sprites.txt (128 rows of palette slots), map.json (including the aliased lower map half), flags.json and audio.json (64 SFX and 64 music patterns). Raw ROM contents describe authored resources, not necessarily all resources used or generated at runtime. Nonzero-volume note slots and enabled pattern slots are not necessarily reachable during play. The 120-frame idle smoke only proves startup, often at a title screen.

The [design guide](../references/game-design.md) distills the studies into practical design checks and links to original microgames. The longer cases and pattern notes are available in commit `212d162`. The 120-frame startup results and source observations support specific design hypotheses.
