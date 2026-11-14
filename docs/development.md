# Development

Follow the [quick start](../README.md#quick-start). Maker and Player use Node.js 24.22.2, pinned in `.node-version`; Maker uses the npm lockfile in `app/`.

## Local development

`predev`, `pretest` and `prebuild` bundle the agent's pico8 skill and prepare the pinned Player automatically. Keep the same browser origin to retain carts and settings.

For integration without a model account, run `npm --prefix app run test:model`. Configure Base URL `http://127.0.0.1:8788/v1`, model `fixture-tools` and a nonempty dummy key. This is a scripted fixture; real-model runs are covered in the [evaluation guide](../app/scripts/evaluation/README.md).

## Build and test

```sh
npm --prefix app test
npm --prefix app run build
npm --prefix app run test:sites
```

- `app/dist/client/`: static site, including Player and license notices.
- `app/dist/server/index.js` and `app/dist/.openai/hosting.json`: Sites hosting outputs.

Serve through HTTP(S). For a subdirectory, set `VITE_BASE_PATH` at build time; application and Player URLs use that base.

## Player updates

Maker downloads and verifies the complete static component pinned in [`app/player.lock.json`](../app/player.lock.json). It serves the copied files locally, rather than importing runtime modules across origins.

1. In [Player](https://github.com/boxuechen/pico8-player), validate and commit the source, then run `pnpm run publish:pages`.
2. Wait for the new commit directory on [Pages](https://boxuechen.github.io/pico8-player/).
3. Update Maker's lock: `baseUrl`, `sourceCommit` and SHA-256 of the downloaded `manifest.json` bytes.
4. Run the checks above and deploy Maker. Player retains only the current published directory, so coordinate these updates.

For local development across both repositories:

```sh
PICO8_PLAYER_DIR=/absolute/path/to/pico8-player/apps/player/dist/release npm --prefix app run dev
```

This override verifies the local manifest without requiring it to match the lock. Removing the variable restores the pinned build on the next preparation run. A verified cached build works offline.

## GitHub Pages deployment

Successful `main` CI runs build with `VITE_BASE_PATH=/pico8-maker/`, verify the app and packaged notices, and deploy `app/dist/client/`. Pull requests only run checks. Repository Pages settings use **GitHub Actions** as the source.

To check the production path locally, build with `VITE_BASE_PATH=/pico8-maker/`, then run `npm --prefix app run preview -- --host 127.0.0.1 --port 5177 --base /pico8-maker/`.

In separate terminals:

```sh
MOCK_MODEL_PORT=8791 node app/tests/mock-model.mjs
node app/scripts/evaluation/deployment-smoke.mjs http://127.0.0.1:5177/pico8-maker/
```

The smoke check also accepts the deployed URL. It uses a temporary Chrome profile and a local scripted model to check connection probing, cart creation, real WASM keyboard input, `.p8` export and reload recovery. It makes no paid model requests and does not measure model quality.

## Repository layout

| Path | Purpose |
| --- | --- |
| `app/src/`, `app/tests/` | Application and behavioral regressions |
| `app/src/pico8/shell/` | The agent: shell environment, `p8`, startup text and the pico8 skill (`skill/`) |
| `lab/local-agent/` | Agent lab: the same p8 and skill on quick tasks (T1–T7), Node or browser |
| `app/scripts/evaluation/` | Model evaluations and independent game checks |
| `app/public/case-studies/` | Retained examples |

Build outputs, dependencies and generated skill/Player files are ignored. `ref/` is optional local tooling. Preserve `.cache/evaluations/`, including failures; it contains untracked research evidence, not ordinary build output. Historical implementation logs remain in Git history.
