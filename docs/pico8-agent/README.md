# PICO-8 knowledge and host contract

This document describes the current implementation. The [agent tooling plan](../agent-tooling-plan.md) specifies the pending state/debug tools, unified startup workflow and outcome-based evaluation. Apply those contract changes together with their implementation; the plan is maintainer documentation and is not published to the model.

[AGENT.md](AGENT.md) routes requests to the create, edit, assets or playtest skill. [MACHINE.md](MACHINE.md) defines the PICO-8 target. The base palette, project state and skill metadata are available at startup. The [reference index](REFERENCE_INDEX.md), skill bodies and references load through `read` when needed.

## Host tools

| Tool | Behavior |
| --- | --- |
| `read`, `edit` | Read source, on-demand playtest records or mounted documentation. Follow the returned continuation. Only `/cart/main.lua` is writable. |
| `load_game` | Start the draft in the test runtime and commit source and resources together after a successful load. Failed loads retain both the draft and last playable cart. |
| `reset_game`, `press_buttons` | Operate the committed cart in a separate test Worker. Eight logical steps, 600 frames including tap releases, eight PNG checkpoints. Step-end captures and sequential recorded-call replay are supported. |
| `observe_game` | Read the completed frame as PNG, ASCII or both with optional pixel cropping. |
| `read_assets`, `edit_assets` | Read authored draft or committed data, preview sprites and maps, and apply atomic draft edits with actual changes reported. |

Runtime observations include frame identity, cart revision, draft status and approximate source budgets. Instruction counts describe the local WASM runtime. The playback and test Workers have separate state. Test saves use memory, so restored conversations should establish a fresh observation baseline. Detailed contracts are in [playtest](references/playtest.md) and [asset authoring](references/asset-authoring.md).

Playtest routes persist with the cart and are read on demand through `/cart/playtests.json` and its run paths. The last 12 runs retain up to 128 calls, cart hashes and frame hashes; PNGs remain in the transcript. Normal/debug purpose is author-declared. Replay returns fresh evidence on the current cart, never an automatic gameplay pass. No extra tool or startup history payload is added.

## Creation and repair guidance

Create starts with a repeated action, a player choice/skill or expressive payoff, and a small playable loop. Inspect its actual frame and input feedback before expanding content, then finish the requested scope. The normal start, completion and retry must be verified for a short finite game; seeded-progress checks are separate evidence. Focused edits retain their narrower verification scope. The optional design guide contains compact patterns and failure signs, not mandatory features or an automated fun score.

Feedback edits start from an observable problem and compare the affected moment. The app retains one snapshot from before the latest modifying request for preview comparison; internal commits and read-only requests do not replace it. Comparison playback leaves the draft, export and test Worker on the current cart.

Source reads and runtime observations carry advisory warnings for decimal literal magnitudes greater than 32768, including likely oversized distance sentinels. The shared token scanner excludes comments, strings, identifiers and hex/binary bit patterns. Advice is bounded to four locations plus an omitted count; it does not rewrite or reject the cart. This is a lexical check, not a parser or overflow proof: it does not evaluate expressions, infer material types, or resolve the +/-32768 boundary.

Input validation names invalid fields and cumulative checkpoint bounds before any input executes. Native edit matching remains atomic; a missing or ambiguous block explains that the batch was not applied and asks for a fresh source read. The edit tool retains its upstream same-original-source and non-overlap contract.

Validation: 110 automated tests, the production build and four Sites checks passed. Coverage includes numeric advice, atomic edits, input validation before side effects, actual tap timing, persisted/sequential replay, cancellation, changed-cart evidence and feedback-preview isolation. The two existing case routes replayed through the new Game tools with all 78 recorded-call frame comparisons matching. These are implementation checks; they do not establish improved autonomous game quality. Detailed local evidence is in `.cache/p0-p2/`.

Two short optional references cover collection/construction and adjacent-swap matching. Their index entries name the applicable genres and problems. They are not included at startup; the shared author/machine instructions and skill catalog remain unchanged.

## Publication and validation

`manifest.json` is the publication allowlist. The compiler publishes Markdown and Lua under `app/public/extensions/pico8/<version>/` and emits only paths, sizes, hashes and section mappings in the browser index. Files are verified and cached on demand. The `/extensions/pico8/` mount is read-only. The app owns the static skill catalog and registers capabilities through the [Pi Durable extension](../../app/src/pico8/extension.js).

Keep full skill instructions out of startup context and use virtual paths in model-facing links. The compiler checks language, skill metadata, links and recipe source hashes against successful receipts. When Lua examples change, run the appropriate [recipe verifier](recipes/README.md) or [microgame verifier](games/README.md) before regenerating the bundle.

[Sources](SOURCES.md) records the PICO-8 manual and runtime evidence. Maintainers can consult the full [API inventory](runtime-api-inventory.md). The model reads a short [browser compatibility guide](references/runtime-compatibility.md). [Research provenance](research/README.md) records the sources behind the consolidated [design guide](references/game-design.md).
