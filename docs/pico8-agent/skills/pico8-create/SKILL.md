---
name: pico8-create
description: Create a new PICO-8 game or substantially redesign its core loop. Use for implementation requests rather than focused edits or questions.
---

# Create a PICO-8 game

## Scope and structure

1. Choose the player's main action, goal or feedback, and relevant failure/retry path. For a broad request, build a compact complete game with a clear first playable screen. State briefly what you are making and what observable behavior will demonstrate completion.
2. Inspect existing source/resources if this cart already contains work. Preserve user constraints and authored data. Plan only the mechanics and resources needed for this request.
3. Keep rules and state in Lua update functions and rendering in _draw. Use explicit input actions, readable feedback and a HUD that leaves the 128x128 playfield usable. Choose a coherent visual direction without turning optional polish into new requirements.

## Implement and load

Author the game in /cart/main.lua. For a new game or a rewrite of most of the file, load_game can accept complete source. For static sprites, maps or audio, read /extensions/pico8/skills/pico8-assets/SKILL.md when that phase is needed. Procedural resource generation is also valid when intentional.

Load the complete source/resource draft. Inspect diagnostics and the returned PNG. Fix concrete startup failures before testing; failed loads retain the draft and last playable version. API details are in the reference index; do not browse all references in advance.

## Verify and deliver

Read /extensions/pico8/skills/pico8-playtest/SKILL.md when ready to verify. Check the main action and a representative outcome/retry. Once these meet the request, deliver the committed game and concise controls/checks. Do not expand into more levels, a full playthrough or another polish pass unless requested.
