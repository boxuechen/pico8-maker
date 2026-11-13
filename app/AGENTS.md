# PICO-8 Maker

## Development

- Run the local server and open the preview in the available browser. Validate changed behavior with focused tests first. Run the production build once after integration; run Sites checks when hosting or packaging changes. Expand to `npm test` for shared-state regressions or failures whose impact cannot be bounded.
- Keep the Sites hosting files and packaging checks. A build produces `dist/client/index.html`, `dist/server/index.js` and `dist/.openai/hosting.json`.
- Implement UI in `src/`. Record durable product decisions here and use [the knowledge guide](../docs/pico8-agent/README.md) for the current host contract.

## Product and UI

- Keep the PICO-8 Maker name, original PICO-8 television silhouette, power-on scan, play icon and controls. Keep Proggy for display labels with readable Chinese body text and monospace code. Preserve the existing dark surfaces and pink accent. Before substantial visual changes, use Product Design context when the visual source is unclear. Follow an approved mock when supplied.
- The homepage shows six community carts on the left and five on the right, plus the latest user cart and More Carts. Keep the composer in the initial desktop viewport. Embed the displayed community cartridges byte-for-byte and link to their authors. Restore the user cart before sending to the Agent after gallery playback.
- The workbench has a collapsible conversation list, assistant-ui chat and shared preview. Keep IME-safe sending, visible STOP, the adjustable 58/42 chat and preview split, crisp pixel scaling and the existing narrow-screen layout. Group tool activity by assistant turn and show keyframes in the timeline. The final test frame supplies the cart label.
- Use “cart” and “My carts” in the UI. Home creates named carts and opens existing ones. Blank names receive sequential `New Cart1` names. New carts have an empty draft and no playable version until the first successful load. Keep Preview, Code and read-only Resources views. Code and Resources share a draft/committed selection, defaulting to draft for each opened cart; their content and budgets must match that selection. Preview and export continue to use the committed cart.

## Storage and execution

- Each cart owns shared source, resources, versions and the change counter. Sessions own history, composer drafts and titles. Keep schema version 3 and readable flat transcript recovery. IndexedDB stores carts, with a visible memory fallback. Preserve transcript heads and thinking signatures on restore, with interrupted tool results represented explicitly.
- Keep only one live Agent for the active session. Block cart and session switches during runs, reject stale callbacks and keep the cart runtime across conversation switches. Restore context without replaying tools. Freeze the shared project baseline per user request and detect intervening changes on the next request.
- Keep model settings at the composer. Save them in the browser by default with opt-out and clear controls. Send requests directly to the selected provider, keep keys out of transcripts and exports, and preserve Pi native protocol and model capability checks.
- Preserve one comparison snapshot from before the user's latest modifying request, not an intermediate tool commit. Preview can switch between that snapshot and the current cart without changing source, export or test state. Restore current preview before the next Agent request; retain the comparison across read-only requests.
- Pi Durable owns retry and compaction. Use provider output/timeout defaults and high thinking clamped to model support. Preserve sequential tools, STOP, bounded WASM execution and model-led completion without a tool-round cap or automatic continuation.

## Knowledge and tools

- Keep one writable source file, `/cart/main.lua`, read through `read` with draft status and budget, and native draft resources edited through structured tools. The source and resources commit together after a successful load. Failed loads retain the draft and last playable version. Undo and export operate on complete cart snapshots.
- Publish English model rules, skill metadata, and versioned read-only documents under `/extensions/pico8/`. Load the matching skill on demand, preserve compiler validation and keep the extension focused on capabilities. Reply in the user's language.
- For new games, establish and play a small complete action/feedback loop before expanding content, then finish the requested scope. Keep design patterns optional and preserve relaxed or expressive games. Verify short finite games from normal start through completion and retry on the final version; label seeded-progress checks separately. Keep numeric source advice nonblocking and bounded, and preserve native atomic editing and input validation before execution.
- Keep PNG as the default and preserve exact cropped ASCII pixels with the actual frame palette. Observations do not advance time. Keep bounded source pagination, advisory budgets and evidence tied to its frame and cart revision. Validate input sequences before execution and report actual progress. Return only the final input frame by default; intermediate checkpoints are explicit. Resource previews read authored data without running the game.
- Record bounded playtest routes per cart, exposed through read-only `/cart/playtests.json` and run files. Keep frame images in the existing transcript. Normal/debug labels are declarations, not pass verdicts. Accept only steps for input; records use format version 2 with no legacy adapters or replay tool route. Load/reset creates a new test session with fresh memory saves. Keep recording updates outside contentVersion. Tap releases count toward the existing frame limit.
- Run real-model checks through the local evaluator with disposable carts. Keep detailed runs in the ignored evaluation cache. Preserve failures when reporting results and distinguish scoped checks from gameplay quality. Evaluation tools and notes belong outside the model's published knowledge.
