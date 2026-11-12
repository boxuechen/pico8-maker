---
name: pico8-edit
description: Change existing Lua behavior, visuals or mechanics, or repair a bug.
---

# Edit a PICO-8 game

1. Read the current source and inspect the affected moment. Turn feedback such as "too easy", "hard to see" or "awkward" into one observable target: a meaningful choice, distinguishable objects, or reliable input response. Use the existing game and a reasonable interpretation; ask only when different interpretations would materially change it. Preserve unrelated rules, resources and progress.
2. Use edit with unique oldText blocks from the current read; all blocks in a batch refer to the same original source. If matching fails, reread the relevant lines before retrying. Then load_game without source. Repair failed loads in the draft. Read /extensions/pico8/skills/pico8-assets/SKILL.md for native asset edits.
3. Read /extensions/pico8/skills/pico8-playtest/SKILL.md. Compare the affected moment before and after, reuse a recorded route when useful, and check nearby effects. For difficulty feedback, compare plausible strategies or starts rather than judging one lucky run. For visual feedback, compare the same scene at 128x128. Audio data cannot establish listening quality. Summarize the visible change and relevant checks; the preview preserves the version before this request for user comparison.
