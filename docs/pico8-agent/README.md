# PICO-8 authoring knowledge

The English knowledge pack is now integrated into the application's pico8 extension. Conversations follow the user's language.

- [Agent rules](AGENT.md), [machine](MACHINE.md) and default English color labels are persistent sections.
- [Reference index](REFERENCE_INDEX.md) lists 44 guides, cases, design patterns, recipes and API categories available through read_reference.
- [Palette data](palette.json) retains multilingual labels as metadata; model output uses English names.
- Five standalone [asset recipes](recipes/README.md) and three original [playable microgames](games/README.md) remain byte-for-byte matched to their validation hashes.
- Four classic-game cases and eight reusable design patterns guide creative decisions. Raw originals live only in an ignored research cache; see [research provenance](research/README.md).
- A [paired evaluation protocol](research/evaluation.md) separates gameplay correctness from human judgments of quality; the model comparison has not yet been run.

Run `npm --prefix app run prepare:knowledge` to regenerate the ignored ESM knowledge bundle and English runtime palette module from the same palette.json. Development, build and npm test prepare it automatically. Edit Markdown/JSON sources, not generated JavaScript.

The compiler validates English model content, recipe receipts and output limits. App integration tests capture real Pi adapter request bodies using a clearly simulated model endpoint, checking sections, tool calls and history recovery without external model credentials.

PNG remains the default observation. observe_game also supports cropped ASCII or both formats from one frame, with its actual English palette legend. See guide/playtest for usage. Audio return and browser save lifecycle expansion remain future work. Developer design and validation records may remain in Chinese; they are excluded from model context.
