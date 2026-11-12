---
name: pico8-create
description: Build a new game or substantially redesign its main loop.
---

# Create a PICO-8 game

1. Choose the repeated action, goal, player choice or skill, and what changes after a short round. For a relaxing toy, the payoff may be expression or discovery; do not force danger or loss. Use reasonable defaults for a vague request and briefly state the direction rather than asking the user to design the game. Consult /extensions/pico8/references/game-design.md when the loop or tradeoff is unclear. Preserve explicit user constraints.
2. Build a small playable loop first: action, visible response, reward or consequence, and a reason for the next action. Include enough character, environment and event feedback to judge that loop. Keep mechanics in update and rendering in draw. Before any edit_assets call, including SFX or music, read /extensions/pico8/skills/pico8-assets/SKILL.md.
3. Prepare Lua and native resource drafts together, then pass complete Lua to load_game for a new game or a rewrite. Inspect startup diagnostics, source warnings and PNG. Read /extensions/pico8/skills/pico8-playtest/SKILL.md and play the short loop before multiplying levels, resource types or systems.
4. Inspect the actual 128x128 frame: can a new player find the character, next target, controls and result of the last action? Fix the most visible problem in readability, input response or feedback, then replay the affected action. Extra material types or enemies should change a choice, timing or outcome, not just add counters. Finish the requested scope after this first loop works; the small loop is an intermediate build, not the final delivery.
5. Exercise each requested main mechanic and the applicable success, failure and retry paths on the final committed version. For a short finite game, play from the normal start to the outcome and retry. Label any seeded-progress checks separately; they do not establish a normal full playthrough. Do not add outcomes the game does not need or claim that functional success proves fun.
6. For repairs within this creation task, use edit with unique oldText blocks, then load_game without source. If matching fails, reread the current block instead of retrying a guessed replacement. Reuse successful input sequences from the transcript after relevant changes. The edit skill is not needed for these repairs.
