# Classic-game research archive

Selection: https://nerdyteachers.com/PICO-8/Games/Top200/ . Source metadata lives in sources.json; immutable byte hashes and local startup results live in inventory.json. The four originals are downloaded and decoded into ignored .cache/classic-study. They are not bundled into the app or used as the new examples' assets.

Run `node docs/pico8-agent/research/collect.mjs --fetch` to acquire the listed public artifacts and decode them using the existing cartridge codec. Without --fetch, it reads the existing cache. Acquisition fails on HTTP errors; it does not fall back to a different version. Compare artifact hashes before treating a repeat collection as the same evidence.

For each game the cache contains the original cartridge, source.p8lua (P8SCII code bytes), sprites.txt (128 rows of palette slots), map.json (including the aliased lower map half), flags.json and audio.json (64 SFX and 64 music patterns). Raw ROM contents describe authored resources, not necessarily all resources used or generated at runtime. Nonzero-volume note slots and enabled pattern slots are not necessarily reachable during play. The 120-frame idle smoke only proves startup, often at a title screen.

Cases distinguish inspected source facts, author rules, design interpretation and proposed transfer experiments. No complete original playthrough or audio listening review is claimed. Follow the author/source usage notes when redistributing any original material. The model pack includes only the case analysis, patterns and newly authored Lua microgames.
