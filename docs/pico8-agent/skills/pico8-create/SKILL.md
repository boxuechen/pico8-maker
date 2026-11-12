---
name: pico8-create
description: Build a new game or substantially redesign its main loop.
---

# Create a PICO-8 game

1. Choose the repeated action, goal, player choice or skill, and what changes after a short round. For a relaxing toy, the payoff may be expression or discovery; do not force danger or loss. Use reasonable defaults for a vague request and briefly state the direction rather than asking the user to design the game. Consult /extensions/pico8/references/game-design.md when the loop or tradeoff is unclear. Preserve explicit user constraints.
2. Build a small playable loop first: action, visible response, reward or consequence, and a reason for the next action. Include enough character, environment and event feedback to judge that loop. Keep mechanics in update and rendering in draw. Before any edit_assets call, including SFX or music, read /extensions/pico8/skills/pico8-assets/SKILL.md.
3. Prepare Lua and native resource drafts together, then pass complete Lua to load_game for a new game or a rewrite. Inspect startup diagnostics, source warnings and PNG. Read /extensions/pico8/skills/pico8-playtest/SKILL.md and play the short loop before multiplying levels, resource types or systems.
4. Inspect the actual 128x128 frame and try a plausible first action. Can a new player identify the target, control and result? For a challenge, compare an ordinary approach with an obvious shortcut or repeated input; for a relaxing game, check that actions produce worthwhile visible variation. Fix the clearest observed problem and replay that moment. Finish the requested scope after this small loop works.
5. Before delivery, use the playtest skill's final-version checks and briefly reassess the complete experience: readable action, responsive feedback, and a payoff suited to the request. Change only a demonstrated problem; stop when relevant checks pass. Report observed checks and gaps without equating functionality with fun.
6. For repairs within this creation task, use edit with unique oldText blocks, then load_game without source. If matching fails, reread the current block instead of retrying a guessed replacement. Reuse successful input sequences from the transcript after relevant changes. The edit skill is not needed for these repairs.
