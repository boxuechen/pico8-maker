# Maker development

Start with the [README](../README.md) and [contribution guide](../CONTRIBUTING.md). Node.js 24 is recorded in `.node-version`. Use the npm lockfile in `app/`.

## Local development

```sh
npm --prefix app ci
npm --prefix app run dev -- --host 127.0.0.1 --port 5175
```

Use the same browser origin to retain existing IndexedDB carts and saved model settings. `predev`, `pretest` and `prebuild` prepare the versioned knowledge files and pinned player automatically.

For UI integration without a model account, run `npm --prefix app run test:model`. Select a custom model with Base URL `http://127.0.0.1:8788/v1`, model ID `fixture-tools`, and any nonempty dummy key. This is a scripted test server, not an AI service or a production fallback. More fixtures and real-model runs are documented in the [evaluation guide](../app/scripts/evaluation/README.md).

## Build outputs

```sh
npm --prefix app test
npm --prefix app run build
npm --prefix app run test:sites
```

- `app/dist/client/`: static site, including the player, application license, third-party notices and font license.
- `app/dist/server/index.js` and `app/dist/.openai/hosting.json`: Sites hosting files.

Serve the static site through HTTP(S); do not open `index.html` through `file://`. Current shell artwork uses root-relative `/assets/` URLs: use a root-mounted deployment or adjust and validate those paths before deploying the app under a subdirectory.

## Player updates

[pico8-web-player](https://github.com/boxuechen/pico8-web-player) owns the runtime and publishes complete static files to its [GitHub Pages site](https://boxuechen.github.io/pico8-web-player/). Maker downloads the directory pinned in `app/player.lock.json`; it does not check out or compile player source.

1. In the player repository, commit source changes, run its required checks, and run `pnpm run publish:pages`.
2. Wait for the new `<source-commit>/` directory to be available on Pages.
3. Update Maker's `app/player.lock.json`: `baseUrl`, `sourceCommit`, and the SHA-256 of the downloaded `manifest.json` bytes.
4. Run Maker tests, build and Sites checks. The preparation script verifies the manifest and every file; a valid cache works without network access.

Keep previously published directories available for older Maker checkouts. The normal distribution path does not use GitHub Releases. The independent C++ `pico8-runtime` is not a dependency.

To work on both repositories locally, explicitly select a built player directory:

```sh
PICO8_PLAYER_DIR=/absolute/path/to/pico8-web-player/apps/web-player/dist/release npm --prefix app run dev
```

The override verifies that build's manifest, without requiring its hash to match Maker's lock. Removing the environment variable restores the pinned build on the next preparation run.

## Tracked and generated files

Track source, knowledge documents, example verification receipts and reproducible cases. `app/node_modules/`, `app/dist/`, `app/public/player/`, `app/public/extensions/pico8/` and `app/src/generated/` are generated and ignored.

`ref/` and `.cache/emsdk/` are optional maintainer tools. `.cache/evaluations/` contains untracked evaluation evidence, including failures; do not clear it as disposable build output. Historical implementation notes remain in Git history.
