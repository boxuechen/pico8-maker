---
name: pico8-edit
description: Change existing Lua behavior, visuals or mechanics, or repair a bug.
---

# Edit a PICO-8 game

1. Read the current source and follow any needed continuation. Identify the smallest change and reproduce a reported bug where practical. Inspect only the resources involved.
2. Use edit with unique oldText blocks from the current read; all blocks in a batch refer to the same original source. If matching fails, reread the relevant lines before retrying. Then load_game without source. Repair failed loads in the draft. Read /extensions/pico8/skills/pico8-assets/SKILL.md for native asset edits.
3. Read /extensions/pico8/skills/pico8-playtest/SKILL.md and verify the affected behavior and nearby effects. Pick inputs that demonstrate this change.
