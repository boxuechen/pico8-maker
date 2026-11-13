# PICO-8 Maker

**Turn a conversation into a playable PICO-8 game.**

Describe an idea, let the agent write and playtest it in a real WebAssembly runtime, then keep shaping the game in your browser. Export the result as a `.p8` cartridge.

[![CI](https://github.com/boxuechen/pico8-maker/actions/workflows/ci.yml/badge.svg)](https://github.com/boxuechen/pico8-maker/actions/workflows/ci.yml)
[![Code license: MIT](https://img.shields.io/badge/code_license-MIT-blue.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/Node.js-24-43853d.svg)](.node-version)

[**Live demo**](https://boxuechen.github.io/pico8-maker/) · [简体中文](README.zh-CN.md) · [Quick start](#quick-start) · [Contributing](CONTRIBUTING.md) · [Development guide](docs/development.md)

![PICO-8 Maker home screen with a game composer and community cartridge gallery](docs/images/home.png)

*Current development preview. Community games and branding shown in the interface have separate attribution and licensing; see [third-party notices](THIRD_PARTY_NOTICES.md).*

## What you can do

- **Create through conversation.** Describe a game, request changes, and inspect the agent's tool activity and captured frames.
- **Playtest while you build.** The agent can run the game, send controller input, inspect bounded state, and read logs in a separate test session.
- **Inspect the whole cart.** View Lua source and read-only sprite, map, sound and music resources alongside the playable version.
- **Iterate without losing a working version.** Keep draft and committed states, undo changes, compare before/after versions, and resume saved conversations.
- **Take the game with you.** Export the latest committed version as a `.p8` file.

Maker combines React and assistant-ui, Pi Durable Agent, and [pico8-player](https://github.com/boxuechen/pico8-player). It is an independent project, not an official Lexaloffle product.

## Try it online

Open [PICO-8 Maker](https://boxuechen.github.io/pico8-maker/) in Chrome/Chromium. Community carts can be played without a model key; creating games requires your own model endpoint and API key. Carts and settings stay in that browser's storage, and model requests go directly to the provider you choose.

## Quick start

Use **Node.js 24.22.2**, npm, and Chrome/Chromium. The first start needs internet access to download the pinned player; no player source checkout or Emscripten installation is needed.

```sh
git clone https://github.com/boxuechen/pico8-maker.git
cd pico8-maker
npm --prefix app ci
npm --prefix app run dev -- --host 127.0.0.1 --port 5175
```

Open [http://127.0.0.1:5175](http://127.0.0.1:5175).

1. Enter a game idea on the home screen to create a cart.
2. Select a model and provide your own API key. For a custom endpoint, set its Base URL and model ID.
3. Use **Test connection** to check tool calling and image input, then send your request.
4. Play the result, ask for changes, and use **SAVE CART** to export it. **STOP** cancels an active request.

The model endpoint must accept browser requests from your origin (CORS). The current workflow requires tool calling and image input; a dedicated text-only mode is not implemented. Model calls use your provider account and may incur charges. Built-in tests use scripted responses and real WASM, so they do not require a paid API key.

## Your data and model connection

Carts, versions and conversations are stored in your browser's IndexedDB. Model settings, including the API key, are saved in localStorage by default; you can disable remembering them or clear the configuration. Keep the same hostname and port to return to the same browser storage.

Model requests go directly from the browser to the selected provider. Conversation context, game code and tool results—including screenshots—may be sent as part of those requests. Maker does not require an application backend or a shared server-side API key. Export carts you want to keep before clearing browser data.

## Build and test

```sh
npm --prefix app test
npm --prefix app run build
npm --prefix app run test:sites
```

Deploy `app/dist/client/` with a static HTTP(S) server. The build also preserves the Sites hosting outputs. Development and production builds include the player locally; playing a game does not fetch runtime modules from GitHub Pages.

See the [development guide](docs/development.md) for local mock models, player updates and build outputs, and the [evaluation guide](app/scripts/evaluation/README.md) for explicit real-model runs.

## Project layout

| Path | Purpose |
| --- | --- |
| `app/src/` | Workbench, agent integration, cart tools and browser storage |
| `app/tests/` | Regression tests, including real WASM execution |
| `app/player.lock.json` | Pinned static player URL, source revision and manifest checksum |
| `docs/pico8-agent/` | Versioned model instructions, references and runnable examples |
| `app/scripts/evaluation/` | Reproducible model evaluations and independent game checks |

The maintained public projects are **Maker** and [**Player**](https://github.com/boxuechen/pico8-player). Maker consumes a pinned Player static build. Player contains its own TypeScript runtime and vendored C/C++ WASM sources; no separate runtime repository is required. Compatibility fixes belong in Player, while authoring and agent workflows belong in Maker.

## Status

This is an early development preview. Chrome/Chromium is the verified browser target; universal PICO-8 cartridge compatibility is not promised. Retained game examples and bounded evaluations demonstrate specific behaviors, not a general guarantee of game quality or model success.

Current evidence, known limitations and planned work live in [development status](docs/development-status.md). Contributions in English or Chinese are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md), then [open an issue](https://github.com/boxuechen/pico8-maker/issues) or submit a pull request.

## License and credits

Project-owned code and documentation are licensed under [MIT](LICENSE), copyright © 2026 boxuechen. Third-party software, community cartridges, fonts and brand artwork retain their own terms and are **not relicensed** by Maker's MIT license. The license does not change rights in carts created or imported by users.

Thanks to the authors of Pi, assistant-ui, React, the player and its upstream runtime components, Proggy Vector, and the community games shown in the gallery. Sources and license details are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The community gallery is retained with author/source attribution and its original license labels. See [open-source preparation](docs/open-source-preparation.md) for the release plan and recorded asset decisions.
