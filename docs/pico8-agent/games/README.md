# Original design microgames

Three standalone examples combine rules, newly authored pixel rows, packed notes, music, event feedback and complete title/play/result/retry loops:

- Spring Courier: held jump, input forgiveness, parcel delivery and an optional high gem.
- Signal Arena: locked lane warnings, dodge, recovery opening and three-hit victory.
- Lantern Vault: turn costs, visible resource pressure, a relic route and optional gems.

All code, pixel data and note sequences in these examples were newly authored for this project. The classics studied in ../cases supply design questions, not copied assets. Model-facing controls, tuning and limitations are in ../references/microgames.md. Every Lua file can be submitted directly through load_game or wrapped in a .p8 cartridge with a __lua__ section.

Run `node docs/pico8-agent/games/verify.mjs` from the repository root after preparing the existing player. It verifies unmodified source and exported cartridges in the public player, then uses the actual WASM runtime with read-only scratch-RAM state probes for behavioral checks. It writes validation-results.json with source hashes and ignored PNG snapshots under .cache/microgames. Audio checks measure generated PCM and channel separation, not listening quality. A failed run does not produce a new receipt; source/hash changes invalidate compilation of the knowledge pack until verification passes again.

Run `npm --prefix app run prepare:knowledge` after verification. The compiler checks these receipts separately from the five asset-recipe receipts. App tests read all references through the real extension, with simulated provider responses for Pi history tests.

For manual play, preview.html can be served from the repository root together with app/public/player. It is a developer-only comparison page, outside the application bundle. Choose a game, use the player's play control, then press X to begin. Browser audio may require a user gesture. No human enjoyment or subjective listening result is recorded by the automated verifier.
