# PICO-8 knowledge and host contract

The static prefix is AGENT / MACHINE / WORKFLOW / base palette / host contract, in that order. Dynamic project state follows it. [WORKFLOW.md](WORKFLOW.md) covers creation, editing, resources, playtesting, readability and delivery at startup, including after compaction. The [reference index](REFERENCE_INDEX.md) and detailed references remain on-demand through read. There is no skill catalog or skill-reading prerequisite. Stable ordering permits provider caching where supported; this host does not assume every provider caches it.

[The plan](../agent-tooling-plan.md) and [implementation record](../tooling-progress.md) track completed phases and remaining evaluation/text-mode work. They are maintainer documents and are not published to the model.

## Host tools

| Tool | Behavior |
| --- | --- |
| `read`, `edit` | Read source, on-demand playtest records or mounted documentation. Follow the returned continuation. Only `/cart/main.lua` is writable. |
| `load_game` | Start the draft in the test runtime and commit source and resources together after a successful load. Failed loads retain both the draft and last playable cart. |
| `reset_game`, `press_buttons` | Operate the committed cart in a separate test Worker. Eight logical steps, 600 frames including tap releases, eight PNG checkpoints. Only steps are accepted, with optional step-end captures. Load/reset creates a fresh test session and memory saves. |
| `observe_game` | Read the completed frame as PNG, ASCII or both. Regions clip to the screen; model PNGs use 4x nearest-neighbor enlargement while coordinates and ASCII remain native. |
| `inspect_game` | Read raw global/table paths without running Lua, or execute bounded debug Lua in the test Worker. Debug marks the entire run before dispatch. It returns state text without a PNG. |
| `read_assets`, `edit_assets` | Read authored draft or committed data, preview sprites and maps, and apply atomic draft edits with actual changes reported. |

Runtime observations include run/frame/state identity, committed revision and draft status. Only source reads and load_game include approximate source budgets. Successful inputs omit expanded step details; partial inputs retain them. Internal session/generation identifiers remain in the host, and multi-image results share one common header. Instruction counts describe the local WASM runtime. New printh logs are returned in a separate bounded text block; repeated observations do not repeat delivered entries. The playback and test Workers have separate state. Test saves use memory, so restored conversations should establish a fresh observation baseline. Detailed contracts are in [playtest](references/playtest.md) and [asset authoring](references/asset-authoring.md).

Playtest routes persist with the cart and are read on demand through `/cart/playtests.json` and its run paths. The last 12 runs retain up to 128 calls, cart hashes and frame hashes; PNGs remain in the transcript. Normal/debug purpose defaults to normal and describes the test setup. Version 3 records retain steps and at most 32 debug events, each with code, stateSeq and status. Debug marking survives errors, timeout and STOP; only fresh load/reset starts a normal run. Old formats are dropped. Reusing those steps produces fresh evidence on the current cart. Records load on demand rather than being injected into startup.

## Creation and repair guidance

Create starts with a repeated action, a player choice/skill or expressive payoff, and a small playable loop. Inspect its actual frame and input feedback before expanding content, then finish the requested scope. The normal start, completion and retry must be verified for a short finite game; seeded-progress checks are separate evidence. Focused edits retain their narrower verification scope. The optional design guide contains compact patterns and failure signs, not mandatory features or an automated fun score.

Feedback edits start from an observable problem and compare the affected moment. The app retains one snapshot from before the latest modifying request for preview comparison; internal commits and read-only requests do not replace it. Comparison playback leaves the draft, export and test Worker on the current cart.

Source reads and runtime observations carry advisory warnings for decimal literal magnitudes greater than 32768, including likely oversized distance sentinels. The shared token scanner excludes comments, strings, identifiers and hex/binary bit patterns. Advice is bounded to four locations plus an omitted count; it does not rewrite or reject the cart. This is a lexical check, not a parser or overflow proof: it does not evaluate expressions, infer material types, or resolve the +/-32768 boundary.

Input validation names invalid fields and cumulative checkpoint bounds before any input executes. Native edit matching remains atomic; a missing or ambiguous block explains that the batch was not applied and asks for a fresh source read. The edit tool retains its upstream same-original-source and non-overlap contract.

Historical validation before the tooling refactor: 110 automated tests, the production build and four Sites checks passed. Coverage includes numeric advice, atomic edits, input validation before side effects, actual tap timing, persisted/sequential replay, cancellation, changed-cart evidence and feedback-preview isolation. The two existing case routes replayed through the new Game tools with all 78 recorded-call frame comparisons matching. These are implementation checks; they do not establish improved autonomous game quality. Detailed local evidence is in `.cache/p0-p2/`.

Two short optional references cover collection/construction and adjacent-swap matching. Their index entries name the applicable genres and problems. They are not included at startup; they remain optional under the shared startup Workflow.

## Publication and validation

`manifest.json` is the publication allowlist. The compiler publishes Markdown and Lua under `app/public/extensions/pico8/<version>/` and emits only paths, sizes, hashes and section mappings in the browser index. Files are verified and cached on demand. The `/extensions/pico8/` mount is read-only. The app owns the static skill catalog and registers capabilities through the [Pi Durable extension](../../app/src/pico8/extension.js).

Use virtual paths in model-facing links. The compiler enforces the ordered startup sections and required Workflow headings, document allowlist, English text, links, and recipe source hashes against successful receipts. Startup rules are mandatory; a failed fetch or hash check prevents Agent preparation. When Lua examples change, run the appropriate [recipe verifier](recipes/README.md) or [microgame verifier](games/README.md) before regenerating the bundle.

[Sources](SOURCES.md) records the PICO-8 manual and runtime evidence. Maintainers can consult the full [API inventory](runtime-api-inventory.md). The model reads a short [browser compatibility guide](references/runtime-compatibility.md). [Research provenance](research/README.md) records the sources behind the consolidated [design guide](references/game-design.md).


## Evidence and host details

The host reports measured state, execution and frames; a label, successful compile or model declaration is not a gameplay verdict. Frame instruction counts describe the local VM rather than official PICO-8 CPU percentages. A multi-step call reports actual progress; a fault can retain the last successful image. Normal routes prove only the paths actually exercised on that committed cart. Existing authored shortcuts cannot be detected from a normal purpose label. Data checks cannot establish subjective enjoyment, art quality or audible mixing.

Manual tests and live playback use separate Workers and saves. Restoring a conversation restores historical evidence rather than VM state; load/reset creates a new test session. Logs retain at most 64 entries / 8 KiB raw bytes / 1 KiB per entry; non-ASCII bytes use \xNN escapes. Log frame IDs refer to attempted frames, with null during boot; faulted frames need not have committed. Resource previews do not execute a cart and use base colors; runtime screenshots reflect actual remapping. Diagnostic overflow is explicit, and pixel matrices are bounded separately from diagnostics.

The MACHINE Lua block is extracted and exercised by `app/tests/workflow.test.mjs` against the real WASM for startup, normal collection/victory, failure, retry, and complete round-state replacement. It is illustrative; preserve existing structures on focused edits. The four-line delivery structure belongs to game work, not explanation-only replies.
