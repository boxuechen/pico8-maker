# Local Agent Prototype — MiniCPM5-2B

A headless PICO-8 game agent built for one model, **MiniCPM5-2B**, running on a local Ollama.
Browser inference is out of scope for now; no agent framework (pi or other) is required. The
lab owns its workflow, prompts and model protocol, and shares only the player runtime and
evaluation oracles with Maker. Maker is not changed.

## Goal and realistic division of labour

What a 2B model does reliably: understand a one-sentence request, fill a short structured
form, choose from named options, change named parameters and write a few lines inside a
clearly marked spot. What it does not do reliably: write or debug a whole game, invent polish,
or run a long multi-step tool session.

So the work is split:

| Who | Responsible for |
| --- | --- |
| **Templates (host)** | Game code, polish and quality: title and controls, HUD, result screen with retry lock, particles and shake, difficulty ramp, sound on every event, readable palette. Each template is written and reviewed by a person. |
| **Model** | Understanding the request: choose the template, name and theme the game, pick sprites and palette, set tunables, and for small rule changes edit a marked slot. |
| **Host checks** | Everything verifiable: the game boots, plays, can be lost/won and retried, and the request was applied. |

**Goal of this stage: from one sentence, MiniCPM5-2B reliably produces a working, themed
PICO-8 game in under a minute.** Game quality is set by the templates; the model is judged
on whether its game matches the request. Writing new mechanics and repairing arbitrary code
are tracked as stretch tasks without targets.

## Model facts

| Item | Value |
| --- | --- |
| Model | `openbmb/minicpm5-2b:q4_K_M` (Ollama, 1.56 GB), Apache-2.0 |
| Architecture | `LlamaForCausalLM`, 2.5B parameters, 42 layers, GQA 16/2, 131K context |
| Input | Text only |
| Tool calls | `<function name="f"><param name="p">value</param></function>`; values containing `<`, `&` or newlines are wrapped in `<![CDATA[…]]>` |
| Tool results | A user turn of `<tool_response>…</tool_response>` blocks |
| Thinking | Prefill `<think>\n` (on) or `<think>\n\n</think>\n\n` (off) after `<|im_start|>assistant\n` |
| Sampling | Official: `temperature 1.0, top_p 0.95`; `repetition_penalty 1.05` if output repeats. Form filling may use a lower temperature. |

The Ollama tag's own template has no tool section, no newline before `<think>`, a 4096-token
default context, and a stop list stored as a single string. The lab therefore renders the
official chat template itself and calls `POST /api/generate` with `raw: true`, explicit
`stop: ["<|im_end|>", "</s>"]` and `num_ctx`.

## Levels and targets

| Level | Example request | Model output | Host verification | Target |
| --- | --- | --- | --- | --- |
| **L1 configure** (core) | "a game where a cat catches falling fish" | a spec form (below) | spec valid; build boots; template checks pass; theme fit reviewed | spec valid ≥ 9/10; functional 10/10 of valid specs; theme fit ≥ 8/10; ≤ 60 s |
| **L2 tweak** | "faster, and lose after 3 misses" on an L1 game | tunable changes, or one slot edit | lint, smoke, template checks, a task check (state read) | ≥ 4/5 per task set |
| L3 extend (stretch) | "add a power-up that slows the fish" | slot edits | as L2 | tracked only |
| L3 repair (stretch) | S4 `shooter-repair` | `edit_game` calls | S4 oracle | tracked only |
| Free create | S4 `shooter-create` | — | — | out of scope |

Theme fit is a person's yes/no per game: do title, sprites, palette and texts match the request?

## Where quality comes from

1. **Templates.** Each genre template (first: catch, dodge; later: shooter, collect) is a
   complete, polished game with fixed structure (`g`, `new_game()`, modes, locked X retry)
   and three customisation surfaces. A template is admitted after a person rates its default
   build ≥ 4/5 on readability, feedback and fun, and its host checks pass.
2. **Choose, don't draw.** Sprites come from a curated 8×8 library (`sprites.json`, ids per
   theme role: player, enemy, item, tile) and colours from named presets (`palettes.json`).
3. **Tunables.** Named parameters at the top of each template (speed, spawn rate, lives,
   goal, ramp) with documented safe ranges; the host clamps out-of-range values.
4. **Slots.** For L2/L3 only: regions marked `-- SLOT: …` where a few lines of rule code go.
   Edits outside slots are rejected.

## Spec form (L1)

The model answers with plain `KEY: value` lines; no tool call is needed, which removes the
most fragile step for a small model. The host validates every key against the template and
returns at most one correction round listing the invalid keys and their allowed values.

```
TEMPLATE: catch
TITLE: FISH CATCH
PLAYER: cat
CATCH: fish
AVOID: bone
PALETTE: ocean
SPEED: 1.2
GOAL: 15
LIVES: 3
TEXT_WIN: FULL BELLY!
TEXT_LOSE: TOO MANY MISSES
```

The host then builds the cart deterministically: template + sprites + palette + tunables +
texts + sound bank, loads it and runs the template checks.

## Design constraints

| Constraint | Consequence |
| --- | --- |
| 2B parameters | The model chooses and configures; the host owns code structure and verification. |
| Text only | No images. The model sees host reports as text: invalid keys, lint issues, faults, failing checks with actual values, and on request a 32×32 ASCII thumbnail. |
| Small models degrade on long, noisy context | Each request is rebuilt from host state and targets ≤ 4K tokens for L1 and ≤ 8K for L2/L3; `num_ctx` 16K as a hard ceiling. |
| XML tool calls with CDATA | Where tools are used (L2/L3), parameters are flat strings; Lua travels in CDATA. |

## Boundaries

```
lab/local-agent/
  bin/        probe.mjs (protocol and speed), eval.mjs (levels × repeats)
  prompts/    core.md, spec.md, tweak.md, api.md
  templates/  <genre>.lua, <genre>.json (spec keys, tunable ranges, slots, checks)
  assets/     sprites.json, palettes.json
  src/
    ollama.mjs     raw completion: complete(prompt, {stop, maxTokens, temperature, numCtx, signal})
    protocol.mjs   MiniCPM5 chat template, tool definitions, <function> parser, thinking prefill
    context.mjs    token estimate and request assembly within the budget
    loop.mjs       tool loop over ollama + protocol (L2/L3); PICO-8-agnostic
    maker.mjs      the only import path into app/: player runtime, cart codec, tokens, S4 tasks/oracle
    runtime.mjs    one inspection session: load, advance, read, ASCII thumbnail
    spec.mjs       parse and validate spec forms against a template manifest
    build.mjs      template + spec → cart (sprites, palette, tunables, texts, sounds)
    lint.mjs       static checks before loading
    verify.mjs     smoke + template checks + task checks → text report
    tools.mjs      L2/L3 tools
    flow.mjs       L1: request → spec → build → verify → report; L2/L3: tweak loop
    sounds.mjs     fixed sfx 0–7 bank
  tests/      node --test with a scripted completion; no model requests
```

Rules:

- `app/` never imports `lab/`; `lab/` imports `app/` only through `src/maker.mjs`.
- `ollama.mjs` knows nothing about prompts; `protocol.mjs` knows nothing about PICO-8;
  `flow.mjs` is the only module that knows the workflow; tools and the builder never call
  the model.
- No provider SDK dependency (pi-ai is removed).
- Results go to `.cache/lab/` (ignored).

## Flows

**L1 configure** (target ≤ 3 model calls):

1. Model: request + template catalogue (genres, roles, palettes, tunable ranges) → spec form.
2. Host: validate; on errors, one correction round.
3. Host: build, load, smoke, template checks. A failure here is a template or builder bug,
   not a model error.
4. Host: report (game, controls, what was applied, checks passed).

**L2 tweak / L3 extend** (caps: 8 turns, 20 tool calls, 10 minutes):

1. Model: request + current spec + tunable table + numbered slots → tools.
2. Host after each change: clamp tunables, lint, load, smoke, template checks, task check;
   failures return actual values.
3. Model calls `done`; accepted only when all checks pass.

## Tools (L2/L3)

| Tool | Params (strings) | Host behaviour |
| --- | --- | --- |
| `set` | `name`, `value` | Change one tunable or spec key; clamped and validated. |
| `edit_slot` | `slot`, `code` | Replace one slot's body (CDATA Lua) → lint → load → checks. |
| `edit_game` | `find`, `replace` | L3 repair only: one exact, unique replacement. |
| `look` | — | 32×32 ASCII thumbnail (`0–f`) plus a `g` summary. |
| `done` | `summary` | Accepted only when every check passes; otherwise the reason. |

## Host checks

**Spec**: every key known, values in allowed sets or ranges, texts ASCII and within length.

**Lint** (blocks loading): non-ASCII, foreign APIs (`love.`, `math.*`, `string.*`,
`table.insert/remove`, `os.`, `io.`, `require`), top-level `local g`, missing `_draw` or
`_update`/`_update60`, over 8192 tokens, edits outside slots.

**Smoke**: boots 30 frames without fault; `g.mode` set; more than one colour on screen;
input changes `g` or the frame.

**Template checks** (from `<genre>.json`): idle loses within a set time, scoring raises
`g.score`, win reachable (with setup), X retry restores the initial state, every event plays
its sound.

**Task checks** (L2): a state read per task, e.g. `g.lives == 3`.

## Evaluation

`bin/probe.mjs`: protocol round trips (form reply; a tool call carrying Lua in CDATA; tool
response; final text) and speed (prefill and decode tokens/s at 1K/4K/8K prompts).

`bin/eval.mjs`:

- L1: 10 fixed requests across the available templates × 3 repeats; thinking on/off.
- L2: 5 tweak tasks on fixed L1 games × 3 repeats.
- L3: `shooter-repair` and 3 extend tasks, tracked.

Metrics: spec validity (first try / after correction), functional pass, task-check pass,
theme fit (reviewed), model calls, parse/tool errors, largest request, decode tokens, wall time.
Each final game is replayed to capture title, play and result frames for review.

## Milestones

1. **M0 protocol and speed** — `ollama.mjs`, `protocol.mjs`, `probe.mjs`. Exit: valid spec
   forms and valid CDATA tool calls in ≥ 9/10 probe turns each; tokens/s measured; thinking
   on/off compared.
2. **M1 configure** — catch template with manifest and checks (reviewed ≥ 4/5), sprite and
   palette libraries, spec parser, builder, L1 flow. Exit: L1 targets on catch requests.
3. **M2 tweak** — tunables/slots tools, task checks, dodge template. Exit: L2 ≥ 4/5; L1
   targets hold across two templates.
4. **M3 stretch** — L3 extend and repair tracked; more templates as needed.

## Current code and migration

The existing lab code was written for a larger multimodal model that writes whole games.
Kept and adapted: `maker.mjs`, `runtime.mjs` (images replaced by ASCII), `lint.mjs`,
`smoke.mjs` (folded into `verify.mjs`), `sounds.mjs`, `prompts/api.md`; `prompts/template.lua`
and `prompts/example.lua` become the starting point of the catch template. Removed:
`model.mjs` (pi-ai), the `write_game`, `play` and `check` tools, image handling, the old phase
controller and its tests.

## Running

```sh
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 \
  ~/.local/ollama-0.40.16/ollama serve
~/.local/ollama-0.40.16/ollama pull openbmb/minicpm5-2b:q4_K_M
```
