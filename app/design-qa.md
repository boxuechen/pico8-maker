# Minimal demo design QA

final result: passed

## Evidence and state

- Source visual truth: `../design/simple-demo/mockup.png` (1536 × 1024).
- Browser implementation: `qa/desktop.png` (1536 × 1024), `qa/playable.png`, `qa/tool-flow.png`; URL http://127.0.0.1:5174/ is the production build.
- Desktop CSS viewport: 1536 × 1024, DPR 1; captures use the browser screenshot API, no density rescaling.
- Narrow viewport: 390 × 844; `qa/mobile.png` is a full-page capture (375 px content width after the scrollbar), with no horizontal overflow.
- Source shows a light conversation; implementation intentionally uses the user's approved dark theme. The empty state is real, with no seeded assistant claims. `qa/tool-flow.png` shows the equivalent populated conversation, explicitly labeled as a local test fixture.
- Full-view comparison: source and `qa/desktop.png` opened together in the same comparison input. The shell, header, chat/game split, composer placement and controls were inspected at full resolution; a separate region crop was unnecessary because all primary controls and shell edges were legible.

## Findings and fidelity surfaces

No outstanding P0/P1/P2 visual findings for the agreed minimal scope.

- Typography: system sans with PingFang fallback for Chinese; chat labels use compact, readable UI sizes. The reference has larger chat content; this is an intentional adaptation to assistant-ui and the real conversation density. No truncated primary labels or broken Chinese wrapping.
- Spacing/layout: 56/44 split matches the reference. Header and bottom composer remain anchored. The shell stays large and centered in the right panel. On narrow screens, game and chat stack with accessible input below.
- Colors/tokens: charcoal chat and navy player implement the requested dark theme. Purple/brown shell, pink/lavender play accent and black screen retain the reference identity.
- Image fidelity: actual transparent raster shell asset, with stepped edges and no rectangular image backdrop. The 128 × 128 WASM canvas is square, pixelated and contained within the screen opening. The shell is not recreated with CSS shapes.
- Copy/content: concise Chinese instructions; model configuration, errors and actual tool records are visible when needed. No fake generated game or inference result is displayed.
- P3 follow-up: the library play icon has rounded edges rather than the source's sharp pixel triangle; nonblocking for this demo. Secondary hint text could be enlarged for projection during a live presentation.

## Verification and history

The full-view design comparison above had no actionable P0/P1/P2 differences. Earlier implementation troubleshooting fixed an inherited centered-root layout, assistant-ui message conversion, menu auto-close and asynchronous mute-state mirroring; these were implementation debugging, not additional visual-comparison passes.

Browser checks exercised real WASM startup/play, keyboard movement, chat focus, restart, mute/unmute, model settings, tool details, source view, undo, export, cancellation and failed model requests. Production-build local fixture executed all ten tool calls, including before/after input sequences; the screenshot shows the player beyond the unchanged wall and `YOU MADE IT!`. This validates tool plumbing, not real model intelligence.

Console checked: development HMR detach/recreate produced upstream ResizeObserver zero-size errors. No new errors were logged during the production-build startup, tool-flow, undo and reload checks. The embedded browser rejects native fullscreen; the app catches this and shows a Chinese explanation. Native full-screen behavior in desktop Chrome remains unverified.

Initial handoff had no real BYOK inference validation; the follow-up below supersedes that gap. Narrow layout is checked, but touch game controls are outside this keyboard-first demo.

## Implementation checklist

- [x] Dark assistant-ui chat and compact settings.
- [x] Real pico8-web-player inside the pixel shell.
- [x] Actual tool execution and frame capture.
- [x] Build and WASM tests pass.
- [x] Desktop/narrow screenshots saved and temporary viewport override reset.

## Model connection follow-up — 2026-11-12

The settings now reuse Pi catalog presets (DeepSeek and image-capable OpenRouter Chat Completions models), with a custom endpoint fallback. The same compact dark dialog remains; provider/model selects replace manual endpoint/model entry for presets. Browser inspection confirmed labels, dropdowns and buttons fit without clipping. No broader visual redesign.

Actual DeepSeek `deepseek-flash` completed 13 game tool calls using all five tools. The displayed result was independently checked by exporting the real model-edited cart and replaying identical input through WASM: before `(58,100)`, after `(109,100)`, unchanged wall `(66,80,12,28)`. Evidence: `qa/deepseek-live.png`, `qa/deepseek-fixed.p8`, `qa/deepseek-live-result.json`. The user entered the key in the page; it was not read or saved to project files.

The real service also passed the two-request image/tool connection probe. No credential values were inspected.

Additional adapter tests cover model metadata, fragmented streamed arguments, tool result images, no-retry authentication failures and rejecting a text-only capability response. All seven runtime/adapter tests and four static packaging tests pass. Production build passes.

final result: passed
