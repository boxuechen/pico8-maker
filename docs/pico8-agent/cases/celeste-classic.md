# Celeste Classic: forgiveness and optional challenge

Evidence: the original BBS cartridge #15133, decoded locally; source and asset hashes are recorded in research/inventory.json. Its first 120 frames run in our player. This is static analysis and startup verification, not a completed playthrough.

## Observed implementation

The player update stores a short jump-input buffer and a grounded grace timer. Their source assignments are 4 and 6 update ticks respectively; these are properties of this particular version, not universal tuning defaults. Landing replenishes the dash allowance. Movement uses different acceleration on ground, in air and on ice. Near the jump apex the gravity calculation changes. Landing, jumping and dash replenishment trigger distinct feedback. Source anchors: player update, jbuffer, grace, maxrun, psfx and music calls. Do not transplant tick counts into a 60 Hz game without converting duration.

## Design interpretation

Input forgiveness can make an intended jump succeed despite a small timing mismatch. Optional collectibles can offer a harder route while the exit preserves forward progress. Our hypothesis is that a short retry loop makes this challenge easier to practice; test retry friction rather than assuming difficulty alone creates engagement.

## Art and audio study

The inspected draw path remaps hair slot 8: red with one dash, blue with none, and alternating white/bright green with two; it restores the mapping afterward. Hair is a five-part chain of filled circles following the player, so the sprite sheet alone does not capture the complete character. The psfx wrapper gates event sounds with sfx_timer. This links a resource state to both procedural art and event timing. Compare the silhouette against solid tiles and hazards at native resolution. Decode SFX notes and music patterns to study resource organization; a decoded note table is not a listening review. Examine feedback timing together with the relevant action, not as an isolated asset.

## Transfer experiment

Use /extensions/pico8/games/spring-courier.lua and /extensions/pico8/patterns/forgiving-controls.md. Compare identical edge-jump and early-landing input traces with grace/buffering enabled and disabled. Record successful intended actions, accidental jumps, and time until the next attempt. Keep level geometry and speed fixed. Avoid copying the original character, levels or soundtrack.

Sources: https://www.lexaloffle.com/bbs/?tid=2145 and https://github.com/NoelFB/Celeste/blob/master/Source/PICO-8/Readme.md . The GitHub example is a C# port; the inspected artifact is the original PICO-8 cart. The BBS currently displays No License; this package distributes analysis and newly authored examples, not original assets.
