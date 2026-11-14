# PICO-8 Maker

## Development

- Run the local server and open the preview in the available browser. Validate changed behavior with focused tests first. Run the production build once after integration; run Sites checks when hosting or packaging changes. Expand to `npm test` for shared-state regressions or failures whose impact cannot be bounded.
- Production uses GitHub Pages at `/pico8-maker/`; keep player and public asset URLs compatible with `VITE_BASE_PATH`. CI verifies the build before deployment.
- Keep the Sites hosting files and packaging checks. A build produces `dist/client/index.html`, `dist/server/index.js` and `dist/.openai/hosting.json`.
- Implement UI in `src/`. Record durable product decisions here; the agent's plan and open work are in [the shell roadmap](../docs/shell-roadmap.md).

## Product and UI

- Keep the PICO-8 Maker name, original PICO-8 television silhouette, power-on scan, play icon and controls. Keep Proggy for display labels with readable Chinese body text and monospace code. Preserve the existing dark surfaces and pink accent. Before substantial visual changes, use Product Design context when the visual source is unclear. Follow an approved mock when supplied.
- Home project navigation links to Player, the Maker GitHub repository and the maintainer’s X profile, plus a My carts anchor (hidden on phones) and the language switch; keep the project links available on narrow screens.
- Localise visible UI through `src/i18n.js` (English and Simplified Chinese, saved in localStorage, defaulting to the browser language). Keep model-facing text, tool results and stored transcripts unchanged; Node tests run in English.
- The homepage shows six community carts on the left and five on the right, plus the latest user cart and More Carts. Keep the composer in the initial desktop viewport. Embed the displayed community cartridges byte-for-byte and link to their authors. Restore the user cart before sending to the Agent after gallery playback.
- The workbench has a collapsible conversation list, assistant-ui chat and shared preview. Keep IME-safe sending, visible STOP, the adjustable 58/42 chat and preview split, crisp pixel scaling and the existing narrow-screen layout. Group tool activity by assistant turn and show keyframes in the timeline. The final test frame supplies the cart label.
- Use “cart”, “My carts” and “conversation” in the UI. Home MAKE connects a model first, then creates a cart titled from the prompt and sends it; NEW CART creates sequential `New Cart 1` (`新卡带 1`) names. Rename carts in the workbench header or My carts. Empty carts show EMPTY rather than an unsaved warning. Delete offers Undo; the local-storage notice appears only for unsaved or non-persistent carts.
- Community carts and the bundled Lodge Podge showcase can be remixed into My carts with their origin credited; dropped or opened `.p8` / `.p8.png` files play on the home TV before import. `src/pico8/import.js` decodes PXA/legacy code and native resources. New carts have an empty draft and no playable version until the first commit. Keep Preview, Code and read-only Resources views. Code and Resources share a draft/committed selection, defaulting to draft for each opened cart; their content and budgets must match that selection. Preview and export continue to use the committed cart.

## Storage and execution

- Each cart owns shared source, resources, versions and the change counter. Sessions own history, composer drafts and titles. Keep schema version 4 and readable flat transcript recovery. Version 3 carts load with their game and versions but a fresh conversation (their transcripts used the earlier agent tools). IndexedDB stores carts, with a visible memory fallback. Preserve transcript heads and thinking signatures on restore, with interrupted tool results represented explicitly.
- Keep only one live Agent for the active session. Block cart and session switches during runs, reject stale callbacks and keep the cart runtime across conversation switches. Restore context without replaying tools. Freeze the shared project baseline per user request and detect intervening changes on the next request.
- Keep model settings at the composer. Save them in the browser by default with opt-out and clear controls. Send requests directly to the selected provider, keep keys out of transcripts and exports, and preserve Pi native protocol and model capability checks.
- Preserve one comparison snapshot from before the user's latest modifying request, not an intermediate tool commit. Preview can switch between that snapshot and the current cart without changing source, export or test state. Restore current preview before the next Agent request; retain the comparison across read-only requests.
- Pi Durable owns retry and compaction. Use provider output/timeout defaults and medium thinking clamped to model support. Preserve sequential tools, STOP, bounded WASM execution and model-led completion without a tool-round cap or automatic continuation.

## Agent

- One agent, built the way Pi's coding agent works: pi-durable's read/write/edit/bash over a just-bash shell, the pico8 skill and the `p8` command. Code lives in `src/pico8/shell/`; the skill source is `src/pico8/shell/skill/` (bundled by `scripts/prepare-shell-skill.mjs`) and is shared with `lab/local-agent`, which runs the same p8 code. Try agent changes in the lab first, then here.
- The shell: `/cart/main.lua` is the cart draft (synchronised before and after every file operation and command); other files in `/cart` and `/tmp` last for the conversation; `/skill/pico8` is read-only. `p8 check/run/look/new/export` run the player runtime in a separate Worker, one message per command.
- Startup text, in order: the coding-agent prompt (`shell/prompt.js`), the skill block, Maker host rules, then dynamic project state. Reply in the user's language; game work and playtest reports use four items (Gameplay / Controls / Verified / Unverified), separating presses-only paths from `--setup`/`checks.json` checks.
- Commits: a p8 command that runs `main.lua` commits a changed draft with its resources (`Game.commit`: compile, run a frame, commit on success) and says so on a `Maker:` line with the revision's coverage facts. Failed commits keep the draft and the last playable version. The sound bank goes only into a new cart's first version. Undo and export operate on complete cart snapshots.
- Resources (sprites, flags, map, sfx, music) are edited through `read_assets`/`edit_assets` until they become files (roadmap P2-8). Resource previews read authored data without running the game.
- Routes: the last successful `p8 run` of a bash command is replayed on the committed cart (`Game.replayRoute`) and recorded as a normal-input route when it is the first on the revision or changes `g.mode`; the same press is not recorded twice on a revision. Routes stay bounded per cart (12) and outside contentVersion. Coverage facts are evidence for the model, never an automatic continuation or pass verdict.
- Outgoing requests omit tool images from earlier user requests and keep the newest 16–31 in the current one; never alter stored transcripts.
- Change agent-facing behaviour (startup text, skill, p8 output, tools) only with evaluation evidence, recording before/after results in docs/development-status.md.

## Evaluation

- Layers: lab T1–T7 (`lab/local-agent`, about 2 min) for every skill or p8 change; S4 ×5 (`npm run eval:s4 -- --run --matrix <file>`, about 6 min) for agent-facing changes; case reruns (`run-case.mjs --case garden|lodge`) plus manual play for large changes; `app-smoke.mjs` for UI or environment changes.
- Run real-model checks with disposable carts and keep detailed runs in the ignored evaluation cache. Keep model credentials in per-endpoint environment variables; archive unavailable configurations as not_run and failed generations as errors. Preserve failures and distinguish scoped checks from gameplay quality. Keep Agent normal-route coverage separate from the fresh-session state/pixel oracle. Scripted providers (`npm run test:s4`, `tests/mock-model.mjs`) do not establish real-model quality.
