# Porklike: turns as a decision budget

Evidence: original BBS porklike-2 cartridge decoded locally. Startup passes 120 frames; gameplay conclusions here are hypotheses grounded in source and author descriptions, not a completed run. See research/inventory.json for exact hashes.

## Observed implementation

The author describes a turn-based roguelike with nine floors, traps and enemies. Source passturn distinguishes player, AI and weeds phases. A noturn path can return to player handling without resolving the normal sequence. Animation update functions are separate from game-state updates. A step threshold triggers an additional threat. These are useful places to inspect which actions consume time, which are free, and how pressure limits indefinite waiting.

## Design interpretation

In turn-based games, consistent action costs are part of the controls. The player should understand whether movement, waiting, inventory actions and blocked moves give enemies a turn. An interesting route balances safety, resources and reward. A short deterministic authored map is a better first experiment than unverified procedural generation: establish meaningful choices before multiplying layouts.

## Art and audio study

The decoded sprite sheet uses nine slots: 0, 5, 6, 7, 8, 10, 11, 13 and 14. That is an asset statistic, not a limit on the runtime screen palette. The source indexes tile positions, visibility and animation separately. Pickup handling combines a floating text label with an event sound; a full inventory instead shows a rejection label and sound. A narrow resource palette still supports distinct item and action roles. Study whether known hazards, unexplored space and traversable floor remain distinct. Author credits identify Sebastian Hassler for music and separately permissioned inspirations for art. Trace event-triggered SFX and visibility feedback; do not treat every nonempty sprite or sound slot as an active game resource.

## Transfer experiment

Use recipe/lantern-vault, pattern/turn-economy and pattern/resource-pressure. It is an original fixed-map extraction puzzle. Test a direct escape route, optional detour, blocked movement, waiting and exhaustion. Compare success with remaining fuel, damage and optional reward. Confirm that leaving the game idle consumes no turns.

Sources: https://krystman.itch.io/porklike and https://www.lexaloffle.com/bbs/?pid=76877&tid=37045 . The author links a making-of tutorial; the release differs from the tutorial. The BBS displays No License. Original source/art/audio are local research material, not a reusable asset library.
