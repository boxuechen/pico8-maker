# PICO-8 skills and runtime extension

Updated 2026-11-13. Scope: this browser app's installed `@earendil-works/pi-durable@1.5.2` and the local `game-studio@0.1.2` plugin.

## Why both skills and an extension

Skills describe how to work. Executable tools implement actions. Packages/plugins distribute related capabilities. These are complementary layers, not competing names for the same mechanism.

| Mechanism | Role | Application here |
| --- | --- | --- |
| Codex plugin | Installable package of skills, tools/MCP and other supported integrations | Reference design; not loaded by this app |
| Pi coding-agent skills | `SKILL.md` instructions, with metadata advertised and bodies read on demand | Adopt the document format and progressive loading pattern |
| Pi packages | Distribute extensions, skills, prompt templates and themes | Not needed for the app's fixed bundled content |
| Pi Durable extension | Register `tools`, `sections`, `hooks`, `wraps`, `tasks` with a Harness registry | Keep for tool registration and minimal host context |

Pi coding-agent and Pi Durable are separate packages. The installed Durable extension interface has no skills field or built-in directory/package scanner. Coding-agent's filesystem skill loader imports Node filesystem/path/OS APIs; adding that CLI layer merely to load fixed browser documents would change the integration boundary. This app instead extends its existing manifest-based static publisher by a small skill catalog. It does not implement arbitrary package installation, filesystem discovery or slash commands.

## Game Studio mapping

The installed Game Studio manifest declares a skills directory. Its entry skill classifies the task and routes to specialists, with shared architecture, authoring, assets and playtesting guidance. We adapt that separation to the fixed PICO-8 runtime:

```text
AGENT.md + generated SKILLS.md catalog
    → read selected skills/pico8-*/SKILL.md
        → read a reference/example for a specific gap
        → call executable tools
        → relevant verification → final reply

extension.js: register stable sections and tools
tools.js: schemas, workspace adapters, output/replay contracts
Game: draft/commit, worker execution, input and observation
Agent/Harness: model loop, retries, compaction and cancellation
```

- `pico8-create`: choose a complete requested scope, implement, load, verify and deliver.
- `pico8-edit`: inspect current code, make a focused change, verify affected behavior.
- `pico8-assets`: preserve resource ids, author native data and verify integration.
- `pico8-playtest`: check main actions and representative states, report concrete evidence.

The entry rules select skills by task meaning, not a hard-coded keyword classifier. Models read the original files through the existing `read` tool. Only names, descriptions and paths are injected at startup; bodies remain lazy and cached. The four skills use the Agent Skills file layout, but rely on this host's tools and virtual paths, so copying them to another host requires adapting those dependencies.

Completion guidance remains partly in the compact shared router so a model cannot miss it by skipping a skill. It is not a hard termination guarantee. There is no tool-round cap, finish tool, automatic continuation hook or forced playthrough. A normal model final reply ends the run; manual STOP remains available.

## Verification

Tests cover skill metadata in the actual provider request, absence of bodies from system sections, delivery of the selected original SKILL.md through `read`, lazy/cached loading without game side effects, invalid metadata and broken-link rejection, restored prompt replacement, natural completion beyond 24 tool rounds, and cancellation. Additional contract tests exercise source continuation through Harness, request-scoped project state, and draft budgets/version attribution through the real WASM runtime.

The [2026-11-13 skills evaluation](pico8-agent/research/runs/2026-11-13-skills/README.md) ran six fixed tasks twice with the browser's saved DeepSeek configuration, then repeated the batch after strengthening the compact routing instructions. Automatic checks improved from 7/12 to 12/12; required skill reads improved from 5/10 to 10/10 action tasks. Both batches and their execution/document snapshots are archived. This is a small, single-model development evaluation, not a cross-model reliability or human gameplay-quality claim. The dev-only evaluator has its own cost/time limits; the interactive Agent remains uncapped.

## Sources

- [Pi skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md) and [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).
- Installed [Pi Durable README](../app/node_modules/@earendil-works/pi-durable/README.md), Extensions and Concepts; the installed `dist/harness/types.d.ts` is the interface authority for this implementation.
- [Codex/ChatGPT plugins](https://learn.chatgpt.com/docs/plugins).
- Local Game Studio 0.1.2: `.codex-plugin/plugin.json`, `skills/game-studio/SKILL.md`, `skills/game-playtest/SKILL.md`, `skills/web-game-foundations/SKILL.md`, `skills/phaser-2d-game/SKILL.md` under the installed plugin cache. We borrow organization and relevant workflows, not the Phaser/Three.js runtime or Codex plugin loader.
