# Open-source preparation

Reviewed on 2026-11-13. Maker remains private while the project prepares its public release. The README and root license describe project-owned code; they do not imply that all bundled material has already been cleared for redistribution.

## Prepared

- English README and Chinese counterpart, with an actual application screenshot, setup instructions, model/data behavior and current limitations.
- MIT license for Maker-owned code and documentation; npm package metadata agrees.
- Contribution guide, bug-report and pull-request templates, and a fresh-checkout CI workflow.
- A third-party inventory, including all 11 community carts and the exact license embedded in the bundled Proggy Vector font.
- Build packaging that retains Maker's license/notices, the font notice and the player's separate license files.

## Remaining distribution decisions

| Material | Current evidence | Required follow-up |
| --- | --- | --- |
| Pinned Web Player build | Its project license is `UNLICENSED`, despite the repository being public | License player-owned code in its repository; update relevant manifests/package metadata, publish new static files and update Maker's lock |
| Six community carts | BBS pages display “No License” | Record redistribution permission from the rights holders or replace the bundled carts |
| Five community carts | BBS pages display CC BY-NC-SA 4.0 | Retain attribution and applicable terms; replace or obtain additional permission if the intended distribution cannot meet those terms |
| PICO-8 logo, television and play-button images | Exact sources and permissions are not recorded | Verify and document permission or replace them with original artwork; refresh the README screenshot if changed |

Exact filenames, authors, source links and the reviewed terms are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). The font's own notice has already been recovered and is shipped with the application.

The current UI intentionally retains the community gallery and artwork. This documentation change does not remove those files or alter the interface. The inventory is not permission to distribute material with unresolved rights.

Before changing Maker's visibility, address the items above for the chosen distribution, check the Git history for retained third-party files as well as the current tree, and update the README's release-preparation note. A live Maker demo URL should only be added to GitHub's Website field after an actual deployment is available; the player's demo is not the Maker app.

The separate `pico8-runtime` repository can choose its own license and release schedule. It is not required to build or publish Maker.
