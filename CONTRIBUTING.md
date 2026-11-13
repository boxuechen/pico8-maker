# Contributing

Issues and pull requests in English or Chinese are welcome.

1. Follow the [quick start](README.md#quick-start) and use the Node version in `.node-version`.
2. Read [app/AGENTS.md](app/AGENTS.md) for product constraints. The Agent workflow is frozen: changes require evidence of a defect and a before/after rerun recorded in [development status](docs/development-status.md).
3. Run the [checks relevant to your change](docs/development.md#build-and-test); verify UI changes in Chrome/Chromium.
4. Explain the problem, resulting behavior and validation in your PR, including checks not run.

Maker owns authoring, browser storage and model integration. Runtime execution and cartridge compatibility belong in [Player](https://github.com/boxuechen/pico8-player). Model-facing knowledge lives in `docs/pico8-agent/`; evaluation tooling lives in `app/scripts/evaluation/`.

For bugs, include steps, expected/actual behavior, browser/OS, Maker and Player commits, and the provider/model if relevant. Remove keys and private content from reports. Do not commit generated output, credentials or `.cache/evaluations/`; retained failures are evidence, not disposable build files.

Original contributions use the [MIT License](LICENSE). Identify the source and license of third-party material; existing attribution and asset decisions are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
