# Original playable microgames

These complete, deliberately small Lua games are learning material for this host. Code, sprite rows and note sequences were newly authored for the knowledge pack. They do not contain the studied classics' code, maps, sprites or music. Use a recipe when a runnable example would help, and adapt it to the request. These examples are optional; their mechanics and features are not requirements for new games.

Each recipe rebuilds assets in _init, keeps round state in global g rebuilt by new_game() (the skeleton convention, readable with `p8 run --read g...`), runs at 60 updates per second, and has a title, a visible objective, success/failure and an X-button restart after a short result lock. Write it to main.lua and run `p8 check`. The player's keyboard maps arrows to movement, Z (the O button) to Lua button 4, and X to Lua button 5; in `p8 --press` they are left, right, up, down, o and x (press syntax in SKILL.md).

## Spring Courier — /skill/pico8/examples/spring-courier.lua

Collect the yellow parcel and reach the right-hand exit. Arrows move; hold O to jump higher. The pink high gem is optional. Falling loses; X restarts. The main challenge is choosing launch position and jump duration, with a safer delivery route and an optional collectible.

- speed=1.2 pixels/tick, jump_v=-3.5, gravity=0.18; tune these together against gap widths.
- grace_ticks=5 and buffer_ticks=4 give short late/early input forgiveness; these are initial values, not universal defaults.
- Sprite and collision widths differ intentionally; platforms collide on downward crossings and permit upward passage.
- Test held versus released jumps, stepping off an edge, collecting the parcel, crossing the last gap, falling and retrying.
- Limits: one screen, no moving hazards, no full platformer level progression. Optional reward is only a result-screen distinction.

## Signal Arena — /skill/pico8/examples/signal-arena.lua

Move on a 5x5 grid. Leave the marked row or column before the attack; approach the yellow center during recovery and press X to hit. Three hits win; three injuries lose. X starts/retries outside play. The attack lane is locked during its warning, so the player can act on the cue.

- Warning starts at 48 ticks, shortened by 8 per successful hit; active attack lasts 12 and recovery 60 ticks.
- Held movement takes a step every 8 ticks; damage grants 30 ticks of invulnerability.
- Keep warning duration longer than the required escape movement. Shorten only after testing reachable safe cells.
- Test leaving both row and column warnings, striking only during recovery, a no-input loss and a clean retry.
- Limits: deterministic alternating attacks and one enemy; this is a phase-design exercise, not a complete boss game.

## Lantern Vault — /skill/pico8/examples/lantern-vault.lua

Retrieve the relic at the upper right and return to the lower-left exit. Arrow presses move; O waits. A valid move or wait consumes one of 24 fuel units and resolves the currently marked danger row. Standing still or bumping a wall consumes no turn. Two pink gems are optional, each costing two extra fuel on collection; this cost is displayed above the board. Damage and fuel exhaustion can end the run.

- The board is 5x5; the center wall forces a route around it. The danger row advances on resolved turns.
- There are three health points. A living player arriving at the exit with the relic wins even on the final fuel unit.
- Tune fuel against measured affordable routes, including waiting needed to avoid danger and the extra gem costs. Do not assume Manhattan distance is a valid route budget.
- Test direct and optional-reward routes, wall bumps, idle frames, deliberate poor waiting, exhaustion and retry.
- Limits: fixed board, no enemies/inventory/procedural generation. Future extensions need fresh route and fairness checks.

## Art and audio construction

Each recipe contains two original 8x8 pixel-row sprites, drawn with sset during initialization: green courier and yellow collectible. Geometry handles platforms, grids, markers and overlays. Contrast and symbols distinguish the warning, active attack, goal and player; sound is not the only event cue. Persistent resources are sprite IDs 1 and 2, SFX slots 0..4, music pattern 0, music channel 0 and feedback channel 3. Adapt these allocations before combining recipes.

The original music uses an eight-note loop in SFX 0. SFX 1..4 are three-note event contours for action/collection, damage, success and warning/rejection. The recipes write packed notes and pattern bytes before playing them. Optional details: /skill/pico8/reference/audio.md covers bit layout and /skill/pico8/reference/sprites-maps.md covers pixel-row conventions. These compact sounds demonstrate resource authoring and channel separation; PCM checks do not establish musical quality.

## Validation and scope

The developer verifier loads unmodified Lua and exported cartridges in the actual player, then exercises controls using the same WASM runtime with read-only state probes in scratch RAM. Successful and poor policies, restart, optional rewards and channel separation are checked. Probes are test instrumentation; here `p8 run --read` reads the same g fields directly. These examples do not save progress; use /skill/pico8/examples/recipes/save-high-score.lua if the requested design needs persistence.

Automated checks establish executable behavior, not enjoyment or sound quality. Review the visible frame, listen in a browser and ask human players about clarity, control and replay interest before making those claims.
