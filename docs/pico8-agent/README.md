# PICO-8 authoring knowledge

English documentation for the pico8 extension. Conversations follow the user's language. The model uses its own design and programming knowledge; bundled references supply optional implementation details and examples.

## Context organization

- [AGENT.md](AGENT.md) contains the compact authoring and evidence rules. It does not prescribe a reading sequence or game structure.
- [MACHINE.md](MACHINE.md) contains the machine conventions most likely to affect ordinary code. Detailed memory layouts, cartridge budgets and button tables live in the existing on-demand guides.
- The host section and tool descriptions own workspace operations, schemas, button masks, observation formats and persistence limits. [HOST.md](HOST.md) documents that boundary for maintainers; it is not another model section to inject.
- [REFERENCE_INDEX.md](REFERENCE_INDEX.md) provides a compact set of optional topic entry points. [REFERENCE_CATALOG.md](REFERENCE_CATALOG.md) retains the complete 44-reference inventory for maintainers. Topic guides link to virtual file paths for optional reading.
- [Palette data](palette.json) and [full palette documentation](PALETTE.md) retain color IDs, English names, RGB values and extended colors. The current compiler supplies the default legend; observations report the actual frame palette.

The five standalone [asset recipes](recipes/README.md), three original [playable microgames](games/README.md), four cases, eight patterns and all API categories remain available. Recipe source and validation hashes are unchanged. Raw classic-game originals remain outside the distributed model library; see [research provenance](research/README.md).

## File loading

`npm --prefix app run prepare:knowledge` validates the sources and publishes original model-facing Markdown and Lua under `app/public/extensions/pico8/<version>/`. Only the manifest-listed sources are published, plus the compact index and generated palette/file directory. Research and maintainer documents are excluded.

The browser imports `pico8-files.js`, which contains only paths, sizes, hashes and section mappings. `knowledge-files.js` fetches files on demand, verifies hashes, caches successful reads across carts, and retries failed reads. The versioned URL prevents mixed deployments from silently returning different instructions.

AGENT.md, MACHINE.md, PALETTE_DEFAULT.md and REFERENCE_INDEX.md load before an Agent opens; a failure prevents opening without its required rules. Pi sections read these files through the same store. Detailed guides and executable examples are available through the built-in `read` tool at `/extensions/pico8/`; long files support `offset` and `limit`. The cart's writable source is `/cart/main.lua`. Documentation is shared and read-only; editing remains cart-only. There is no shell, packed document module or read_reference compatibility tool.

## Validation

Development, build and npm test prepare static documentation automatically. The compiler validates English model content, source headings and recipe receipts. Tests verify direct file delivery through actual Pi requests, restore without replay, lazy loading, caching, HTTP/hash failures, pagination, readonly isolation and original-file equality. No real model requests are required.

The [first paired pilot](research/runs/2026-11-12-deepseek-flash/README.md) is an unchanged historical record. It predates file loading and does not establish its effect; human enjoyment review remains pending.
