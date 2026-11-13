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

Serve the static site through HTTP(S); do not open `index.html` through `file://`. For a subdirectory deployment, set `VITE_BASE_PATH` when building; Vite rewrites CSS/public asset paths and the app uses the same base for player and knowledge files.

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

## GitHub Pages deployment

The CI workflow builds with `VITE_BASE_PATH=/pico8-maker/`, verifies the app and packaged notices, then deploys `app/dist/client/` through GitHub Pages on successful `main` pushes. Pull requests run checks without deploying. The workflow can also be started manually. Repository Pages settings use **GitHub Actions** as the source. Existing Sites outputs remain available.

To check the production subdirectory locally:

```sh
VITE_BASE_PATH=/pico8-maker/ npm --prefix app run build
npm --prefix app run preview -- --host 127.0.0.1 --port 5177 --base /pico8-maker/
```

In separate terminals, start the scripted model and smoke check:

```sh
MOCK_MODEL_PORT=8791 node app/tests/mock-model.mjs
node app/scripts/evaluation/deployment-smoke.mjs http://127.0.0.1:5177/pico8-maker/
```

The same smoke check accepts the deployed URL. It uses a temporary Chrome profile and intercepts only `https://model-fixture.invalid/` requests, forwarding them to the local mock. It checks model configuration and image/tool probing, cart creation, real WASM keyboard input, `.p8` download and reload recovery. This is integration coverage with scripted responses, not a real-model quality evaluation. It does not require or persist real credentials.
