# Classic-game research archive

Selection: https://nerdyteachers.com/PICO-8/Games/Top200/ . Source metadata lives in sources.json; immutable byte hashes and local startup results live in inventory.json. The four originals are downloaded and decoded into ignored .cache/classic-study. They are not bundled into the app or used as the new examples' assets.

Run `node docs/pico8-agent/research/collect.mjs --fetch` to acquire the listed public artifacts and decode them using the existing cartridge codec. Without --fetch, it reads the existing cache. Acquisition fails on HTTP errors; it does not fall back to a different version. Compare artifact hashes before treating a repeat collection as the same evidence.

For each game the cache contains the original cartridge, source.p8lua (P8SCII code bytes), sprites.txt (128 rows of palette slots), map.json (including the aliased lower map half), flags.json and audio.json (64 SFX and 64 music patterns). Raw ROM contents describe authored resources, not necessarily all resources used or generated at runtime. Nonzero-volume note slots and enabled pattern slots are not necessarily reachable during play. The 120-frame idle smoke only proves startup, often at a title screen.

The [design guide](../references/game-design.md) distills the studies into practical design checks and links to original microgames. The longer cases and pattern notes are available in commit `212d162`. The 120-frame startup results and source observations support specific design hypotheses.

Two optional patterns also draw on the local [Lodge Podge study](../../lodge-podge-case-study.md) and [Sweet Garden study](../../sweet-garden-case-study.md): [collect/build](../references/collect-build.md) and [adjacent-swap matching](../references/match-puzzle.md). They retain decisions, presentation roles, observed failure signs and verification questions. They include no original game code or art, and are not claims of measured fun or universal balance.

## ModRetro study: retained decisions

The 2026-11-13 study inspected the installed `modretro-chromatic` plugin version `1.0.34+codex.distribution.5efb7a8c2b1207f93f2a673a`: authoring, pixel-art and ROM-debugging skills, annotation bridge code, and sample design notes. It did not generate or play a new game or validate the native annotation UI. The full source-path inventory and analysis are recoverable with `git show b25cc9b:docs/modretro-agent-study.md`.

- Prefer an early playable loop and feedback tied to an actual frame and source version. User playback frames and Agent test frames have different provenance.
- Use small, optional mechanism and visual references when observed failures justify them. Review contrast, silhouettes and animation at native size in the game.
- Preserve failed inputs and replay from comparable starts after edits; technical checks do not establish visual quality or enjoyment.
- GB Studio's built-in scene behavior differs from authoring complete Lua rules here. Sample design goals and source inspection do not establish autonomous generation quality.
- Audio resources and screenshots do not establish listening quality. Human listening and any future audio observation need separate evidence.

Current guidance lives in [WORKFLOW](../WORKFLOW.md) and the [host contract](../README.md); deferred work is tracked in [development status](../../development-status.md).
