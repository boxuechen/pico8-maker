---
name: pico8-assets
description: Author or edit native sprites, flags, maps, SFX or music, including asset-only changes.
---

# Edit native resources

1. Inspect the target slots or map region. Check occupied slots when allocating IDs. Consult /extensions/pico8/references/asset-authoring.md for formats and examples as needed.
2. Batch scoped changes with edit_assets. Use hexadecimal rows with 0 for transparent sprite pixels. Preserve unrelated flags, resources and Lua. Use a PNG preview when judging authored sprites or maps.
3. Commit with load_game and inspect the startup frame. Read the playtest skill for gameplay integration. For audio, inspect slot data and triggers and report that listening remains unverified.
