# Open-source preparation

Reviewed on 2026-11-13. Maker remains private while the project prepares its public release. The README and root license describe project-owned code; they do not imply that all bundled material has already been cleared for redistribution.

## Prepared

- English README and Chinese counterpart, with an actual application screenshot, setup instructions, model/data behavior and current limitations.
- MIT license for Maker-owned code and documentation; npm package metadata agrees.
- Web Player `0.2.0-alpha.2` licenses its own code and artifacts under MIT; Maker pins the new static build and preserves its upstream notices.
- Contribution guide, bug-report and pull-request templates, and a fresh-checkout CI workflow.
- A third-party inventory, including all 11 community carts and the exact license embedded in the bundled Proggy Vector font.
- Build packaging that retains Maker's license/notices, the font notice and the player's separate license files.

## Remaining release work

| Material | Current evidence | Required follow-up |
| --- | --- | --- |
| Maker live demo | No deployed Maker URL is recorded | Deploy and verify the full creation/play/export flow, then add the actual URL to the GitHub homepage |
| PICO-8 logo, television and play-button images | Exact sources and permissions are not recorded | Verify and document permission or replace them with original artwork; refresh the README screenshot if changed |

Exact filenames, authors, source links and the reviewed terms are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). The font's own notice has already been recovered and is shipped with the application.

## Community gallery decision

On 2026-11-13 the maintainer chose to keep all 11 community cartridges for the nonprofit project. Keep the existing files, author credits and source links; no replacement or removal is planned in this task. Six source pages currently display “No License” and five display CC BY-NC-SA 4.0. Those recorded labels remain unchanged, and Maker's MIT license does not relicense the carts. The maintainer's distribution decision is recorded separately from any author permission, which is not currently documented in the repository.

## Publication

The current UI and artwork are retained. This change does not alter game behavior or the community gallery.

Before changing Maker's visibility, address the items above for the chosen distribution, check the Git history for retained third-party files as well as the current tree, and update the README's release-preparation note. A live Maker demo URL should only be added to GitHub's Website field after an actual deployment is available; the player's demo is not the Maker app.

The separate `pico8-runtime` repository can choose its own license and release schedule. It is not required to build or publish Maker.
