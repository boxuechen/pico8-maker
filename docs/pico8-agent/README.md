# PICO-8 authoring knowledge

English documentation for the pico8 extension. Conversations follow the user's language. The model uses its own design and programming knowledge; bundled references supply optional implementation details and examples.

## Context organization

- [AGENT.md](AGENT.md) contains the compact authoring and evidence rules. It does not prescribe a reading sequence or game structure.
- [MACHINE.md](MACHINE.md) contains the machine conventions most likely to affect ordinary code. Detailed memory layouts, cartridge budgets and button tables live in the existing on-demand guides.
- The host section and tool descriptions own workspace operations, schemas, button masks, observation formats and persistence limits. [HOST.md](HOST.md) documents that boundary for maintainers; it is not another model section to inject.
- [REFERENCE_INDEX.md](REFERENCE_INDEX.md) provides a compact set of optional topic entry points. [REFERENCE_CATALOG.md](REFERENCE_CATALOG.md) retains the complete 44-reference inventory for maintainers. Topic guides expose more specific IDs as optional lookups.
- [Palette data](palette.json) and [full palette documentation](PALETTE.md) retain color IDs, English names, RGB values and extended colors. The current compiler supplies the default legend; observations report the actual frame palette.

The five standalone [asset recipes](recipes/README.md), three original [playable microgames](games/README.md), four cases, eight patterns and all API categories remain available. Recipe source and validation hashes are unchanged. Raw classic-game originals remain outside the distributed model library; see [research provenance](research/README.md).

## Markdown-only simplification status

This pass changes local Markdown only. It removes required-reading language, consolidates persistent guidance and prepares the compact reference index. It does not modify the manifest, extension, compiler, tests, recipes, evaluation outputs or the workspace's generated modules, and it does not rerun model evaluation.

The current compiler still constructs pico8_references from every manifest entry, and the tool schema still enumerates all IDs. It does **not** consume REFERENCE_INDEX.md. Therefore the full runtime directory is not yet hidden by this documentation change. A later code change should:

- Use the compact index for the persistent reference section while retaining all registered IDs for direct lookup and history compatibility.
- Remove the duplicated full ID list from the tool schema while retaining execution-time ID validation.
- Keep host/tool-specific details in their existing owners rather than reinserting them into AGENT.md.

Changing generated files alone would not implement these changes. The shorter AGENT.md and MACHINE.md will be used on the next normal knowledge compilation; applying the compact directory requires the later code work above.

## Build and validation

Normally, `npm --prefix app run prepare:knowledge` regenerates the ignored ESM bundle and English runtime palette module. Development, build and npm test also prepare these automatically. During a documentation-only pass, compile and run checks in a temporary copy to leave the workspace's generated files unchanged.

The compiler validates English model content, recipe receipts and output limits. Existing app integration tests use a simulated model endpoint to check sections, reference delivery and history recovery without external credentials. Source-level checks should also confirm every referenced ID exists and each retained reference can be found from the compact topic entry points.

Local checks on 2026-11-12: the edited sources compiled successfully in a temporary copy; all four existing extension integration tests passed, including reference delivery and history/ASCII recovery. All 44 references are reachable from the compact entry points, the complete catalog matches the registry, and edited file links resolve. Workspace code, generated modules, recipe sources, manifest and palette data were unchanged. These checks used no real model requests.

The [paired evaluation protocol](research/evaluation.md) separates gameplay correctness from human judgments of quality. No new model comparison is part of this documentation pass.
