# Local Agent Prototype — MiniCPM5-2B

A headless PICO-8 game agent built for one model, **MiniCPM5-2B**, running on a local Ollama.

Goal: **MiniCPM5-2B makes PICO-8 games, and game quality is the primary measure.** A game
that passes every check but looks bare or feels flat is not the target. First get the whole
flow working end to end, then raise quality. Browser inference is out of scope for now; no
agent framework (pi or other) is required. The lab owns its workflow, tools, prompts and model
protocol, and shares only the player runtime and evaluation oracles with Maker. Maker is not
changed.

## Model facts

| Item | Value |
| --- | --- |
| Model | `openbmb/minicpm5-2b:q4_K_M` (Ollama, 1.56 GB), Apache-2.0 |
| Architecture | `LlamaForCausalLM`, 2.5B parameters, 42 layers, GQA 16/2, 131K context |
| Input | Text only |
| Tool calls | `<function name="f"><param name="p">value</param></function>`; values containing `<`, `&` or newlines are wrapped in `<![CDATA[…]]>` |
| Tool results | A user turn of `<tool_response>…</tool_response>` blocks |
| Thinking | Prefill `<think>\n` (on) or `<think>\n\n</think>\n\n` (off) after `<|im_start|>assistant\n` |
| Sampling | Official: `temperature 1.0, top_p 0.95`; `repetition_penalty 1.05` if output repeats |

The Ollama tag's own template has no tool section, no newline before `<think>`, a 4096-token
default context, and a stop list stored as a single string. The lab therefore does not use it:
it renders the official chat template itself and calls `POST /api/generate` with `raw: true`,
explicit `stop: ["<|im_end|>", "</s>"]` and `num_ctx`.

## Design constraints

| Constraint | Consequence |
| --- | --- |
| 2B parameters | The model writes small, local game logic. The host owns structure, verification and every decision it can make deterministically. |
| Text only | No images. The model sees host reports: lint issues, faults, state values, mode changes and an on-demand 32×32 ASCII thumbnail. |
| Small models degrade on long, noisy context | Each request is rebuilt from host state and targets ≤ 8K tokens; older tool responses shrink to one line. `num_ctx` 16K as a hard ceiling. |
| XML tool calls with CDATA | Tool parameters are flat strings. Lua source travels in CDATA, never as escaped JSON. No nested arrays or objects. |

Carried-over lessons from larger local models: a fixed template plus host lint and smoke makes
building reliable; free-form self-testing does not converge; letting a verification phase edit
code breaks correct fixes. Hence: **the model builds, the host verifies.**

## Quality strategy

A 2B model will not invent polish on its own, so quality is built into what it starts from
and into how the host chooses among its outputs:

1. **Polish lives in the templates.** Every genre template already has a title screen with
   controls, a readable HUD, a result screen with the X-retry lock, screen shake and particles
   on hits, a difficulty ramp, sound on every event (sfx 0–7 bank) and a contrast-checked
   palette. The model customises theme and rules inside slots and inherits all of it.
2. **Choose, don't draw.** Sprites come from a curated 8×8 library (player, enemies, items,
   tiles in several themes) and palettes from named presets. The model picks ids and preset
   names; it never writes pixel data.
3. **Tunables, not rewrites.** Each template exposes named parameters (speed, spawn rate,
   lives, goal, ramp) at the top of the file. Most "make it harder / faster / longer"
   requests become parameter edits, which a 2B model does reliably.
4. **Best of N.** The model is small and fast: for creation the host builds N candidates
   (default 3) and keeps the one with the best host quality score among those that pass
   every functional check.
5. **Host quality score.** Measurable proxies, reported with each game: title and result
   screens present, controls text shown, sound on score/hit/win/lose, visual change while
   idle (animation), contrast of player and targets against their background, idle loss
   time within a set range (not instant, not endless), difficulty ramp observed over 60 s,
   source within the token budget.

## Boundaries

```
lab/local-agent/
  bin/        probe.mjs (protocol and speed), eval.mjs (tasks × repeats)
  prompts/    core.md, api.md, phase files, templates/<genre>.lua + checks,
              sprites.json (curated 8×8 library), palettes.json (named presets)
  src/
    ollama.mjs     raw completion: complete(prompt, {stop, maxTokens, temperature, numCtx, signal})
    protocol.mjs   MiniCPM5 chat template, tool definitions, <function> parser, thinking prefill
    context.mjs    token estimate and request assembly within the budget
    loop.mjs       tool loop over ollama + protocol; PICO-8-agnostic
    maker.mjs      the only import path into app/: player runtime, cart codec, tokens, S4 tasks/oracle
    runtime.mjs    one inspection session: load, advance, read, ASCII thumbnail
    lint.mjs       static checks before loading
    verify.mjs     host verification: smoke + template checks + task checks → text report
    quality.mjs    host quality score from replays (screens, sound, animation, contrast, pacing)
    tools.mjs      model-facing tools
    phases.mjs     plan → build → verify/fix → (best of N) → report
    sounds.mjs     fixed sfx 0–7 bank preloaded into new carts
  tests/      node --test with a scripted completion; no model requests
```

Rules:

- `app/` never imports `lab/`; `lab/` imports `app/` only through `src/maker.mjs`.
- `ollama.mjs` knows nothing about prompts; `protocol.mjs` knows nothing about PICO-8;
  `phases.mjs` is the only module that knows the workflow; tools never call the model.
- No provider SDK dependency (pi-ai is removed).
- Results go to `.cache/lab/` (ignored).

## Tasks

| Tier | Example | Model output | Host verification |
| --- | --- | --- | --- |
| T1 tweak | "make the player faster", "lose after 5 misses" on a working cart | 1–3 `edit_game` calls | lint, smoke, task check (state read) |
| T2 repair | S4 `shooter-repair` | `edit_game` calls | smoke; S4 oracle in evaluation |
| T3 create from template | "catch falling fruit" | pick a template, fill its marked slots | smoke + the template's checks |
| Stretch | S4 `shooter-create` | as T3 | S4 oracle |

New games never start from an empty file. The host loads a genre template (catch, dodge,
shooter, collect first) whose structure, `g`, `new_game()`, modes, retry and HUD are fixed;
the model edits only regions marked `-- SLOT: …`.

## Workflow

| Phase | Model sees | Tools | Ends when |
| --- | --- | --- | --- |
| plan (T3 only) | task, template list | none | a short form: `TEMPLATE / NAME / GOAL / CONTROLS` |
| build | core + api + phase, task, plan, numbered source | `write_game`, `edit_game`, `look`, `done` | `done` accepted: clean load and smoke |
| verify | — (host) | — | host runs smoke + template/task checks |
| fix (≤ 2 rounds) | failing checks with actual values, numbered source | `edit_game`, `look`, `done` | `done` accepted, checks re-run |
| report | — | — | host writes the four-part reply from host results |

Caps per task: 15 minutes, 30 tool calls, 8 turns per phase.

## Tools

| Tool | Params (strings) | Host behaviour |
| --- | --- | --- |
| `write_game` | `source` | Replace main.lua → lint → load → smoke. Not offered in T1/T2. |
| `edit_game` | `find`, `replace` | One exact, unique replacement, then the same pipeline. Errors quote nearby numbered lines. |
| `look` | — | 32×32 ASCII thumbnail of the current frame (`0–f`, one char per 4×4 block) plus a `g` summary. |
| `done` | `summary` | Accepted only when the phase condition holds; otherwise returns the reason. |

A reply with malformed XML gets one corrective tool response quoting the expected form.

## Host checks

**Lint** (blocks loading): non-ASCII, foreign APIs (`love.`, `math.*`, `string.*`,
`table.insert/remove`, `os.`, `io.`, `require`), top-level `local g`, missing `_draw` or
`_update`/`_update60`, over 8192 tokens, edits outside template slots (T3).

**Smoke**: boots 30 frames without fault; `g.mode` set; frame uses more than one colour;
input changes `g` or the frame.

**Template checks**: each template ships cases on its own `g` fields — idle loses, scoring
raises `g.score`, win reachable with setup, X retry restores the initial state.

**Task checks** (T1): a state read per task, e.g. `g.speed > 1.5`.

## Evaluation

`bin/probe.mjs`: protocol round trips (a tool call carrying Lua in CDATA, a tool response, a
final text reply) and speed (prefill and decode tokens/s at 2K/4K/8K prompts).

`bin/eval.mjs`: T1 ×5 tasks, T2 `shooter-repair`, T3 catch/dodge, stretch `shooter-create`;
3 repeats; thinking on and off. Metrics: oracle/check pass, host quality score, finished
within caps, tool and parse errors, largest request in tokens, decode tokens, wall time.

Quality review (evaluation only, never in the loop): each final game is replayed to capture
its title, play and result frames; a person, optionally assisted by a vision model as judge,
rates readability, feedback, theme fit and fun on a 1–5 rubric. The rubric score is the
headline number once functional pass rates are stable.

## Milestones

1. **M0 protocol and speed** — `ollama.mjs`, `protocol.mjs`, `probe.mjs`. Exit: valid tool
   calls with CDATA Lua in ≥ 9/10 probe turns; measured tokens/s; thinking on/off compared.
2. **M1 tweak and repair** — flat tools, request assembly, host verification, text reports.
   Exit: T1 ≥ 4/5, T2 ≥ 2/3.
3. **M2 create from templates** — polished genre templates with slots, tunables and checks,
   sprite library and palette presets, plan form. Exit: T3 ≥ 2/3.
4. **M3 quality** — host quality score, best-of-N, frame capture and rubric review. Exit:
   median rubric ≥ 3.5 on T3 games; iterate on templates and prompts by rubric findings.

## Current code and migration

The existing lab code was written for a larger multimodal model. Kept and adapted:
`maker.mjs`, `runtime.mjs` (images replaced by ASCII), `lint.mjs`, `smoke.mjs` (folded into
`verify.mjs`), `sounds.mjs`, `prompts/template.lua`, `prompts/api.md`. Removed: `model.mjs`
(pi-ai), the `play` and `check` tools, image handling, the old phase controller and its tests.

## Running

```sh
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 \
  ~/.local/ollama-0.40.16/ollama serve
~/.local/ollama-0.40.16/ollama pull openbmb/minicpm5-2b:q4_K_M
```
