---
name: pico8-create
description: Build a new game or substantially redesign its main loop.
---

# Create a PICO-8 game

1. Choose the main action, goal, feedback and relevant outcome or retry. Make the first actionable screen readable and the objective reachable.
2. Preserve existing work and constraints. Before any edit_assets call, including SFX or music, read /extensions/pico8/skills/pico8-assets/SKILL.md. Keep mechanics in update and rendering in draw.
3. Prepare Lua and any native resource drafts together, then pass complete Lua to load_game for a new game or a rewrite. Inspect startup diagnostics, source budget and PNG before proceeding.
4. Read /extensions/pico8/skills/pico8-playtest/SKILL.md. Exercise each requested main mechanic and the applicable success, failure and retry paths. Do not add outcomes the game does not need.
5. For repairs within this creation task, use edit with unique oldText blocks, then load_game without source and retest the affected behavior. The edit skill is not needed for these repairs.
