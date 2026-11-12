# Prototype Instructions

Keep the demo minimal: dark assistant-ui chat and pico8-web-player inside the pixel console shell. Preserve screenshot-based game observation for now; ASCII/palette-grid observation is deferred to a future iteration.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Accepted UI direction (2026-11-12)

The user approved a PICO-8 official-site-inspired home screen: navy-black background, original community cartridge images with source/author links, pixel console, Proggy-style English labels, pink MAKE action, and readable Chinese body text. The large chat input stays visible in the first desktop viewport. First submission prompts for model credentials only when needed, preserves the draft on cancel, and automatically submits after “保存并开始制作”. The hero disappears on submission, revealing a resizable left-chat/right-live-preview workspace with the same theme. Preserve the real Agent/Pi/WASM chain, screenshot observation, cancellation, undo and export. Persist the current project's transcript, draft and game versions locally; restore model context without replaying interrupted tools. API keys remain memory-only unless the user explicitly opts to remember them. Community cartridges play in the local player from embedded HTML data; author attribution links open official pages. They are not AI remix templates.

Homepage refinement: use the exact official p8tv_header background and pixel play button, reproduce the observed power-on coloured vertical/horizontal scan sequence, and keep a dense 6-left / 8-right cartridge layout plus More Carts. Prefer English homepage copy and Proggy typography. Embed original cartridge bytes in HTML at build/dev time, load them in the real local WASM runtime, and restore the user project before entering the workspace or sending to the agent. Never save gallery cartridges over the user's source/version history.
