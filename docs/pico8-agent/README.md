# PICO-8 knowledge and host contract

[AGENT.md](AGENT.md) routes requests to the create, edit, assets or playtest skill. [MACHINE.md](MACHINE.md) defines the PICO-8 target. The default palette, [reference index](REFERENCE_INDEX.md), project context and skill metadata are available at startup. Skill bodies and references load through `read` when needed. Tool evidence drives the final response in the user's language.

## Host tools

| Tool | Behavior |
| --- | --- |
| `read`, `edit` | Read source or mounted documentation. Edits target the single Lua draft at `/cart/main.lua`. |
| `read_game` | Read the first source page and draft status. Follow the returned line or UTF-8 byte continuation for large source. |
| `load_game` | Start the draft in the test runtime and commit source and resources together after a successful load. Failed loads retain both the draft and last playable cart. |
| `reset_game`, `press_buttons` | Operate the committed cart in a separate test Worker. Sequences allow up to eight steps, 600 total frames and eight PNG checkpoints. Results report actual progress and early stops. |
| `observe_game` | Read the completed frame as PNG, ASCII or both with optional pixel cropping. |
| `read_assets`, `edit_assets` | Read authored draft or committed data, preview sprites and maps, and apply atomic draft edits with actual changes reported. |

Runtime observations include frame identity, cart revision, draft status and approximate source budgets. Instruction counts describe the local WASM runtime. The playback and test Workers have separate state. Test saves use memory, so restored conversations should establish a fresh observation baseline. Detailed contracts are in [playtest](references/playtest.md) and [asset authoring](references/asset-authoring.md).

## Publication and validation

`manifest.json` is the publication allowlist. The compiler publishes Markdown and Lua under `app/public/extensions/pico8/<version>/` and emits only paths, sizes, hashes and section mappings in the browser index. Files are verified and cached on demand. The `/extensions/pico8/` mount is read-only. The app owns the static skill catalog and registers capabilities through the [Pi Durable extension](../../app/src/pico8/extension.js).

Keep full skill instructions out of startup context and use virtual paths in model-facing links. The compiler checks language, skill metadata, links and recipe source hashes against successful receipts. When Lua examples change, run the appropriate [recipe verifier](recipes/README.md) or [microgame verifier](games/README.md) before regenerating the bundle.

[Sources](SOURCES.md) records the PICO-8 manual and runtime evidence. [Research provenance](research/README.md) describes the classic-game references and the local acquisition script.
