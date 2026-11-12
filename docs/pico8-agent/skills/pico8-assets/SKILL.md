---
name: pico8-assets
description: Author or update native sprites, sprite flags, maps, SFX or music in a PICO-8 cart. Use when the request needs static resource data.
---

# Author PICO-8 resources

Read /extensions/pico8/references/asset-authoring.md for exact formats and slot limits before editing resources; reuse it if already loaded. This workflow uses native resource tools rather than an external image generator or editor.

1. Read existing source and use read_assets with no arguments to find occupied slots. Inspect the slots or map region you will change. Preserve unrelated resources and their ids.
2. Choose the small set of assets needed for the current request. Author static data with edit_assets; invalid batches apply nothing. Do not put .p8 section markers in Lua.
3. Update Lua references only as needed. Call load_game to commit source and resource drafts together. A resource-only change also needs loading; unchanged source does not imply unchanged resources.
4. Inspect the returned frame for visual changes. Use /extensions/pico8/skills/pico8-playtest/SKILL.md when gameplay integration needs verification. For SFX/music, inspect authored data and source triggers; this host returns no audio, so listening remains unverified.
5. Finish when the requested assets and affected integration are checked. Do not redesign the rest of the game or keep generating alternatives without a request.
