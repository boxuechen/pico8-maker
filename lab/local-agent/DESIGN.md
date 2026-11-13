# Local Agent Prototype

A headless prototype of a PICO-8 game agent designed around small local models
(target: Qwen3.5-9B Q4_K_M with image input, 64K context). It runs in Node
against any OpenAI-compatible endpoint and owns its workflow, tools and
prompts. It is not compatible with the Maker agent and does not try to be.

## Why

The Maker agent assumes a strong cloud model: one long conversation, ten fine-grained
tools, a large resident workflow and a model that designs its own verification.
Qwen3.5-9B on that flow (2026-11-13, shooter suite, 15 min / 40 calls per task):

| | Repair ×3 | Create ×3 |
| --- | --- | --- |
| Independent oracle | 3/3 | 0/3 |
| Finished on its own | 1/3 | 0/3 |
| Tool errors | 3–6 | 6–23 |

Observed failure classes:

1. Tool misuse: `edit` on an empty file, malformed sprite rows, guessed document paths.
2. Missing PICO-8 knowledge: LÖVE (`love.*`) code, non-ASCII comments, no main loop, `local g`.
3. Speed: the context grows every turn; every request re-reads it and thinks at length.

Principle: **the host does what it can decide deterministically; the model writes
game logic and judges gameplay.**

## Boundaries

```
lab/local-agent/
  bin/        run.mjs (one task), eval.mjs (task × repeat matrix)
  prompts/    core.md, api.md, plan.md, build.md, test.md, template.lua, example.lua
  src/
    maker.mjs     the only import path into app/: player runtime, cart codec,
                  token counter, PNG encoder, shooter tasks and oracle
    model.mjs     pi-ai connection; exposes complete(request) only
    loop.mjs      generic tool loop over complete(); knows nothing about PICO-8
    runtime.mjs   one inspection session: load, play, read, frame images
    lint.mjs      static source checks before loading
    smoke.mjs     host-run checks after every successful load
    tools.mjs     model-facing tools built on runtime/lint/smoke
    phases.mjs    plan → build → test → report controller
    prompts.mjs   prompt assembly from prompts/
  tests/      node --test, scripted model; no provider requests
```

Rules:

- Nothing under `app/` imports from `lab/`. The lab imports `app/` only through
  `src/maker.mjs`, and only pure modules, the player build and evaluation oracles —
  never `game.js`, `agent.js`, the Maker tools or the knowledge package.
- `loop.mjs` and `model.mjs` are PICO-8-agnostic; `phases.mjs` is the only module
  that knows the workflow; tools never call the model.
- Results live in `.cache/lab/` (ignored). Keys come only from the environment.

## Workflow

Each phase starts a **fresh conversation**. The host carries state between phases
as text: task, plan, current numbered source, latest host report. Inside a phase
only the newest image is sent; older images become a one-line note.

| Phase | Model sees | Tools | Ends when | Caps |
| --- | --- | --- | --- | --- |
| plan (create only) | task | none | text reply | 1 call |
| build | core + api + example + build, task, plan, source | `write_game`, `edit_game`, `done` | `done` accepted: last load clean and smoke boots | 12 turns |
| test | core + api + test, task, plan checks, source, smoke | `play`, `edit_game`, `done` | `done` with verified/unverified lists | 16 turns |
| report | — | — | host writes the four-part reply | — |

Global caps match S4: 15 minutes and 40 tool calls per task. Thinking defaults to
`low`; plan may use the configured level.

Repairs skip plan: build starts from the existing cart with the task as the plan.
New games start from `prompts/template.lua`, already loaded, so a model never
writes into an empty file and always has a main loop, global `g`, `new_game()`
and a locked X retry.

## Tools

| Tool | Arguments | Host behaviour |
| --- | --- | --- |
| `write_game` | `source` | Replace main.lua → lint → load → smoke. Returns issues or the smoke report and one frame. |
| `edit_game` | `edits: [{find, replace}]` | Exact, unique replacements applied atomically, then the same pipeline. Failures quote nearby numbered lines. |
| `play` | `reset?`, `setup?` (Lua), `steps: [{press: ["left","o",…], frames}]`, `read?: ["g.mode",…]` | Runs input on the loaded cart. Returns mode changes with frames, read values (default: `g`), audio starts and the final frame. `setup` marks the result as setup evidence. |
| `done` | build: `summary`; test: `verified[]`, `unverified[]` | Accepted only when the phase condition holds; otherwise the reason is returned. |

Buttons are names (`left right up down o x`), not bit masks. Every error says what
to do next.

## Host checks

**Lint** (blocks loading): non-ASCII characters (line and character), foreign APIs
(`love.`, `math.*`, `string.*`, `table.insert/remove`, `os.`, `io.`, `require`),
top-level `local g`, missing `_draw` or `_update`/`_update60`, over 8192 tokens.
Warnings: missing `new_game`.

**Smoke** (fresh session each time): boots 30 frames without fault; `g` exists and
`g.mode` is set; the frame uses more than one colour; holding `left`, `right`, `o`
for 10 frames changes `g` or the frame compared with idle (reports the first
changed fields).

## Prompts

`core.md` (rules, ≈350 tokens), `api.md` (the 45 most used PICO-8 functions with
signatures, ≈700 tokens), `example.lua` (a complete small game built on the
template, ≈600 tokens), and one short file per phase. Everything is resident for
its phase; there is no document lookup tool.

## Evaluation

`bin/eval.mjs` runs `shooter-repair`, `shooter-create` (contract and independent
oracle from Maker's S4 suite) and `catch` (the browser smoke prompt, no oracle),
3 repeats each, and writes per-run `report.json`, `final.p8` and a summary table.
Baseline: the Maker flow numbers above.

Targets for Qwen3.5-9B: create ≥ 2/3 oracle passes, repair 3/3 within 5 minutes,
tool errors ≤ 3 per task. A DeepSeek run checks that the simpler flow does not
hurt a strong model.

## Next

If the targets hold, the workflow moves into Maker as an opt-in "local model"
agent profile (default off), and browser WebGPU inference follows.
