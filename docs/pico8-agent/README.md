# PICO-8 authoring knowledge

The English knowledge pack is now integrated into the application's pico8 extension. Conversations follow the user's language.

- [Agent rules](AGENT.md), [machine](MACHINE.md) and default English color labels are persistent sections.
- [Reference index](REFERENCE_INDEX.md) lists 27 guides, recipes and API categories available through read_reference.
- [Palette data](palette.json) retains multilingual labels as metadata; model output uses English names.
- Five standalone [recipes](recipes/README.md) remain byte-for-byte matched to their validation hashes.

Run `npm --prefix app run prepare:knowledge` to regenerate the ignored ESM bundle. Development, build and npm test prepare it automatically. Edit Markdown/JSON sources, not generated JavaScript.

The compiler validates English model content, recipe receipts and output limits. App integration tests capture real Pi adapter request bodies using a clearly simulated model endpoint, checking sections, tool calls and history recovery without external model credentials.

PNG observation remains unchanged. ASCII/cropping, audio return and browser save lifecycle expansion remain future work. Developer design and validation records may remain in Chinese; they are excluded from model context.
