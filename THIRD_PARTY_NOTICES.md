# Third-party notices

The root MIT license applies to project-owned Maker code and documentation. It does not replace third-party licenses, grant rights to community cartridges, or license third-party trademarks and artwork. This inventory records the material currently included; unresolved permissions are not resolved merely by listing an attribution.

## Player runtime

Maker downloads the build pinned in `app/player.lock.json` from [pico8-web-player](https://github.com/boxuechen/pico8-web-player). Its complete `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `licenses/` directory are preserved under `app/public/player/` and in the deployed `player/` directory.

The currently pinned `0.2.0-alpha.2` build at `eec7b417fd71c1ec03642ac403a5c26dbc6ccca9` licenses player-owned source and compiled components under **MIT**. Its own MIT notice is shipped separately from Maker's, alongside the upstream third-party notices. Older static build directories retain the license files with which they were published.

The player's own notices cover z8lua/Lua, Emscripten, and graphics/audio material derived from fake-08, tac08 and zepto8. Consult those files for the exact upstream revisions and terms.

## Proggy Vector font

- File: `app/src/assets/proggyvec.woff` (ProggyVector 1.1.5).
- Source project: [Proggy Fonts](https://github.com/bluescan/proggyfonts).
- Copyright: Tristan Grimmer (2019), Source Foundry Authors (2018), and Bitstream Inc. (2003).
- Terms: MIT for Proggy Vector/Hack contributions; Bitstream Vera terms for inherited font material; DejaVu contributions are identified as public domain in the embedded notice.
- Full notice: [`app/public/licenses/ProggyVector.txt`](https://github.com/boxuechen/pico8-maker/blob/main/app/public/licenses/ProggyVector.txt), extracted verbatim from the bundled font's name-table license record, with line endings normalized. Builds include it at `licenses/ProggyVector.txt`.
- Bundled file SHA-256: `86b6979ad3c8ee5f90fab2facec34106114201b5b8b73c9c418bc37ca45e7215`.

## Community cartridges

The files in `app/src/assets/carts/` are third-party games. The app embeds their cartridge bytes and records author/source links in `app/src/assets/carts.json`. They are not Maker examples licensed under MIT, and their appearance in the README screenshot does not change their ownership.

The following license labels were checked on the linked BBS pages on **2026-11-13**. “No License” is the page's label, not permission to redistribute. CC BY-NC-SA 4.0 includes attribution, noncommercial and share-alike conditions; see the [license text](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en). Preserve any additional credits provided on the source pages. No additional author permissions are recorded in this repository.

| Bundled cart | Author credited by Maker | Source | Page license label |
| --- | --- | --- | --- |
| `molemole-1.p8.png` — Mole Mole | Adam Atomic | [BBS](https://www.lexaloffle.com/bbs/?pid=molemole-1#p) | No License |
| `death_of_kairos-0.p8.png` — Death of Kairos | voidgazerBon | [BBS](https://www.lexaloffle.com/bbs/?pid=death_of_kairos-0#p) | No License |
| `peakofempires-6.p8.png` — Peak of Empires | taxicomics & dnek | [BBS](https://www.lexaloffle.com/bbs/?pid=peakofempires-6#p) | No License |
| `pico_backrooms-1.p8.png` — Pico Backrooms | electricgryphon | [BBS](https://www.lexaloffle.com/bbs/?pid=pico_backrooms-1#p) | No License |
| `petal_to_the_metal-0.p8.png` — Petal to the Metal | Edson James | [BBS](https://www.lexaloffle.com/bbs/?pid=petal_to_the_metal-0#p) | CC BY-NC-SA 4.0 |
| `petal_quest-12.p8.png` — Petal Quest | Noel Cody | [BBS](https://www.lexaloffle.com/bbs/?pid=petal_quest-12#p) | CC BY-NC-SA 4.0 |
| `53862.p8.png` — 20 Line Game | jajoosam | [BBS](https://www.lexaloffle.com/bbs/?pid=53862#p) | No License |
| `snowball_showdown-4.p8.png` — Snowball Showdown | bridgs | [BBS](https://www.lexaloffle.com/bbs/?pid=snowball_showdown-4#p) | CC BY-NC-SA 4.0 |
| `goldenknight_cart1-1.p8.png` — Golden Knight | pollenstudio | [BBS](https://www.lexaloffle.com/bbs/?pid=goldenknight_cart1-1#p) | CC BY-NC-SA 4.0 |
| `picotrouble2-0.p8.png` — Pico Trouble | leoocast | [BBS](https://www.lexaloffle.com/bbs/?pid=picotrouble2-0#p) | No License |
| `30745.p8.png` — 9HOLE | paloblancogames | [BBS](https://www.lexaloffle.com/bbs/?pid=30745#p) | CC BY-NC-SA 4.0 |

The maintainer has chosen to retain these community cartridges in the nonprofit project with their existing attribution and source links. This decision does not change the source-page license labels or apply Maker's MIT license to the carts. Additional permission records, if supplied, should be added to this inventory. See `docs/open-source-preparation.md` for the recorded decision.

## Brand and interface images

`app/public/assets/pico8-logo.png`, `pico8-tv.png` and `pico8-play.png` depict PICO-8 branding/interface artwork. Their exact acquisition sources and redistribution permissions are not documented in the current repository. These files are excluded from Maker's MIT grant pending verification or replacement. The README screenshot includes this artwork and third-party cartridge thumbnails.

PICO-8 is a product of [Lexaloffle Games](https://www.lexaloffle.com/pico-8.php). PICO-8 Maker is an independent project and does not claim official affiliation or endorsement.

## JavaScript dependencies

npm dependencies remain under their respective licenses. Exact versions and package license metadata are recorded in `app/package-lock.json`; installed packages include their own notices. Major components include React, assistant-ui, Pi Durable/Pi AI, Vite and Lucide. The application license does not replace those terms.

This file is a focused inventory of bundled assets and the player, not a claim that every transitive dependency has received a separate license audit.
