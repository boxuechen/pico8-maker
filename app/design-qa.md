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

Real BYOK provider inference is unverified because no user key was supplied. Narrow layout is checked, but touch game controls are outside this keyboard-first demo.

## Implementation checklist

- [x] Dark assistant-ui chat and compact settings.
- [x] Real pico8-web-player inside the pixel shell.
- [x] Actual tool execution and frame capture.
- [x] Build and WASM tests pass.
- [x] Desktop/narrow screenshots saved and temporary viewport override reset.
