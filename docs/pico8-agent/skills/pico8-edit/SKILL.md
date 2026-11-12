---
name: pico8-edit
description: Modify or repair an existing PICO-8 game while preserving unrelated code and assets. Use for targeted behavior, visual changes or concrete bugs.
---

# Edit or repair a PICO-8 game

## Diagnose the requested change

Read the current source with read_game or read({path:"/cart/main.lua"}), even when an older version appears in the conversation. Follow returned offset or byteOffset continuations for any missing source needed by the edit; repeating read_game only rereads the first page. Inspect only resources relevant to this change. Identify the expected behavior and the smallest affected part of the code. For a bug, use a reproducible input sequence and current diagnostics/frames where possible; an inconclusive automated attempt alone is not evidence of a code defect.

## Make a focused change

Use edit on /cart/main.lua with exact unique oldText blocks, then load_game without source. Replace the complete source only when most of the file is intentionally being rewritten. For resource changes, read /extensions/pico8/skills/pico8-assets/SKILL.md. Preserve unrelated mechanics, style, resource ids and saved progress.

A failed load leaves edits in the draft and preserves the last committed cart. Inspect the error and repair that draft; do not describe it as a playable update until loading succeeds.

## Verify the affected behavior

Read /extensions/pico8/skills/pico8-playtest/SKILL.md for verification if it is not already available. Reproduce the original trigger after the repair and check nearby behavior affected by the change. A static coin edit needs a comparison across advanced frames, not a new attempt to beat the entire platformer. If checks pass, report the change and evidence and finish. If the same test remains inconclusive, inspect timing/geometry or change the test setup rather than rewriting working mechanics by guesswork.
