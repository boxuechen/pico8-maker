# Contributing

Thanks for helping improve PICO-8 Maker. Issues and pull requests in English or Chinese are welcome.

## Start locally

Follow the [quick start](README.md#quick-start). Node.js 24 is sufficient for Maker development: the pinned player downloads automatically. You do not need the player source tree, Emscripten, or a real model API key to run the regression tests.

```sh
npm --prefix app test
npm --prefix app run build
npm --prefix app run test:sites
```

Run focused tests while iterating. The CI workflow runs these checks from a fresh checkout. For UI changes, also check the app in Chrome/Chromium. Include what you tested and any known limitations in the pull request.

## Where changes belong

- React UI, cart storage, model connections and host tools: `app/src/`.
- Model-facing documentation and examples: `docs/pico8-agent/`.
- Regression tests: `app/tests/`; model evaluations: `app/scripts/evaluation/`.
- Player execution, VM and compatibility fixes: [pico8-player](https://github.com/boxuechen/pico8-player). See the [dependency guide](docs/development.md#player-updates).

Read [app/AGENTS.md](app/AGENTS.md) for product and development constraints. The Agent workflow is currently frozen: changes to its tools, schemas and startup contract need evidence of a defect and a before/after rerun recorded in [development status](docs/development-status.md). UI work, documentation and evaluation improvements can proceed independently.

## Useful bug reports

Include steps to reproduce, expected and actual behavior, browser/OS, the Maker commit and the player commit from `app/player.lock.json`. For model issues, include the provider, model ID and relevant error text. A small cart or prompt is more useful than a large transcript.

Remove API keys and private content from logs and screenshots. Do not submit third-party cartridges unless you have permission to redistribute them. Never include `.cache/evaluations/`, local model credentials or generated build directories in a pull request.

## Licensing contributions

Submit original code and documentation under this project's [MIT license](LICENSE). Identify any third-party material and include its source and applicable license; do not assume the project license covers it. Existing exceptions and unresolved asset permissions are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
