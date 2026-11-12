# Just One Boss: one input vocabulary, changing demands

Evidence: author-linked repository just_one_boss.p8, decoded locally; hashes and startup smoke are in research/inventory.json. No complete fight or subjective listening review has been performed for this case.

## Observed implementation

The author describes directional movement and collecting glowing tiles to defeat the boss while preserving hearts. The source distinguishes boss phases, sequences actions, and maps separate sounds to tile spawning, collection and player damage. Player injury sets invulnerability and stun durations. A reflection entity copies player motion with a transformed coordinate. Source anchors: decide_next_action, promise_sequence, player_reflection, spawn_magic_tile and get_hurt. These observations describe implementation, not a claim about the optimal strategy.

## Design interpretation

A stable control scheme leaves room for challenge to grow through spatial rules and timing. Moving toward an objective while avoiding attacks can create competing demands. Anticipation cues must make the upcoming danger legible before it becomes damaging; changes of phase should introduce a learnable variation. Avoid increasing speed, area and rule complexity simultaneously.

## Art and audio study

The magic-tile spawn draws expanding rectangle outlines before the collectible appears; the collectible remaps sprite color 7 to a cycling color. Source events assign SFX 8 on channel 3 to spawning, SFX 9 on channel 3 to collection, and SFX 17 on channel 0 to player hurt. These allocations describe this cart, not a channel layout to copy blindly. Compare anticipation, active and recovery poses rather than selecting attractive frames. The explicit spawn/collect/hurt sound triggers are useful event-to-feedback examples. Music changes at tutorial, fight and outcome transitions; extracting patterns alone does not establish that those transitions sound good.

## Transfer experiment

Use recipe/signal-arena and pattern/telegraph-attack-recovery. It is a newly authored lane-warning microgame, not a remake. Hold the warning duration fixed while changing the dangerous axis. Test whether a player can explain the next hit area before it fires. Test deliberately staying in danger, avoiding it and using the recovery opening.

Sources: https://aylanonsense.itch.io/just-one-boss and https://github.com/aylanonsense/just-one-boss . The author page labels the asset license CC BY-NC-SA 4.0. Code and asset permissions must not be conflated. No third-party source or assets enter the model bundle.
