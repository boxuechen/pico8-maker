# Open-source release status

Updated on 2026-11-13. Maker is public and the development preview is hosted at [GitHub Pages](https://boxuechen.github.io/pico8-maker/). The README and root license describe project-owned code; they do not imply that all bundled material has already been cleared for redistribution.

## Prepared

- English README and Chinese counterpart, with an actual application screenshot, setup instructions, model/data behavior and current limitations.
- MIT license for Maker-owned code and documentation; npm package metadata agrees.
- Player `0.2.0-alpha.2` licenses its own code and artifacts under MIT; Maker pins the new static build and preserves its upstream notices.
- Contribution guide, bug-report and pull-request templates, and a fresh-checkout CI workflow.
- A third-party inventory, including all 11 community carts and the exact license embedded in the bundled Proggy Vector font.
- Build packaging that retains Maker's license/notices, the font notice and the player's separate license files.

## Asset provenance follow-up

| Material | Current evidence | Required follow-up |
| --- | --- | --- |
| PICO-8 logo, television and play-button images | Exact sources and permissions are not recorded | Verify and document permission or replace them with original artwork; refresh the README screenshot if changed |

Exact filenames, authors, source links and the reviewed terms are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). The font's own notice has already been recovered and is shipped with the application.

## Community gallery decision

On 2026-11-13 the maintainer chose to keep all 11 community cartridges for the nonprofit project. Keep the existing files, author credits and source links; no replacement or removal is planned in this task. Six source pages currently display “No License” and five display CC BY-NC-SA 4.0. Those recorded labels remain unchanged, and Maker's MIT license does not relicense the carts. The maintainer's distribution decision is recorded separately from any author permission, which is not currently documented in the repository.

## Publication

The current UI and artwork are retained. This change does not alter game behavior or the community gallery.

The maintainer authorized publishing the existing application with its community gallery retained. The repository visibility and Pages deployment are separate from the third-party license records above; public hosting does not change those records.

Successful `main` CI runs deploy the static build. The deployment smoke check uses a temporary browser profile and a scripted local model to verify connection probing, creation, real WASM input, `.p8` export and reload recovery against the production subdirectory. It is integration evidence, not a new real-model quality evaluation. See the [deployment guide](development.md#github-pages-deployment).

The maintained public scope is Maker plus Player. The separate portable-runtime experiment is retained privately with maintenance paused; it is not part of the Maker build, publication or contributor setup. Player continues to maintain its own internal runtime and WASM sources.

## Deployment verification — 2026-11-13

[CI and deployment](https://github.com/boxuechen/pico8-maker/actions/runs/43385041105) passed for `71014e0`: 139 regression tests, production build, packaged-license checks and Pages deployment. The published app passed `deployment-smoke.mjs`: 11 gallery entries, image/tool connection probe, a new resource cart, changed pixels after physical keyboard input, downloaded `deployment-smoke.p8`, and restored cart state after reload; no runtime exceptions or failed app asset requests were observed. Model responses were intercepted to a local scripted fixture with a dummy key. No paid model requests were made.
