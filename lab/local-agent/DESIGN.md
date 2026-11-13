# Local Agent Prototype — MiniCPM5-2B

A headless PICO-8 game agent built for one model: **MiniCPM5-2B** (`openbmb/minicpm5-2b:q4_K_M`,
1.6 GB, text only, Apache-2.0). It runs in Node against a local Ollama today; the final target
is in-browser inference. It owns its workflow, tools, prompts and model protocol, and shares
only the player runtime and evaluation oracles with Maker. Maker itself is not changed.

## Design constraints

| Constraint | Consequence |
| --- | --- |
| 2B parameters | The model writes small, local game logic. The host owns structure, verification and every decision it can make deterministically. |
| Text only | No screenshots. The model sees host reports: lint issues, faults, state values, mode changes, and an on-demand 32×32 ASCII thumbnail. |
| Browser target (≈8K-token requests in the reference WebGPU Space) | Every request is assembled to fit **8K tokens** (prompt + reply). No conversation grows without bound. |
| XML tool calls with CDATA (`<function name="…"><param name="…"><![CDATA[…]]></param></function>`) | Tool parameters are flat strings. Lua source travels in CDATA, never as escaped JSON. No nested arrays or objects in tool arguments. |
| Ollama does not run the GGUF Jinja template; the browser engine will produce raw text too | The lab renders the chat template and parses tool calls itself. Engines only complete raw text, so local and browser runs see byte-identical prompts. |

Lessons carried over from larger local models: a fixed template plus host lint and smoke makes
building reliable; free-form self-testing does not converge; letting a verification phase edit
code breaks correct fixes. Hence: **the model builds, the host verifies.**

## Boundaries

```
lab/local-agent/
  bin/        eval.mjs (tasks × repeats), probe.mjs (protocol and speed check)
  prompts/    core.md, api.md, phase files, templates/*.lua (+ checks)
  src/
    engine/ollama.mjs   raw completion: complete(prompt, {stop, maxTokens, temperature, signal})
    protocol.mjs        MiniCPM5 chat template, tool definitions, <function> parser, thinking prefill
    budget.mjs          token estimate and 8K request assembly (truncation rules)
    loop.mjs            tool loop over engine + protocol; PICO-8-agnostic
    maker.mjs           the only import path into app/: player runtime, cart codec, tokens, S4 tasks/oracle
    runtime.mjs         one inspection session: load, advance, read, ASCII thumbnail
    lint.mjs            static checks before loading
    verify.mjs          host verification: smoke + template checks + task checks → text report
    tools.mjs           model-facing tools
    phases.mjs          plan → build → verify/fix → report
    sounds.mjs          fixed sfx 0–7 bank preloaded into new carts
  tests/      node --test with a scripted engine; no model requests
```

Rules:

- `app/` never imports `lab/`; `lab/` imports `app/` only through `src/maker.mjs`.
- `engine/*` knows nothing about prompts; `protocol.mjs` knows nothing about PICO-8;
  `phases.mjs` is the only module that knows the workflow; tools never call the model.
- No provider SDK dependency. A future `engine/webgpu.mjs` implements the same `complete`.
- Results go to `.cache/lab/` (ignored).

## Protocol

- Prompt: `<|im_start|>system … # Tools <tools>{json}</tools> …<|im_end|>`, user turns,
  assistant turns with `<function>` calls, tool results as a user turn of
  `<tool_response>…</tool_response>` blocks — exactly the official template.
- Thinking: off by default (`<think>\n\n</think>\n\n` prefilled); on = `<think>\n` prefilled.
  Both are evaluated; the default follows the data.
- Parsing: every `<function name>` block with `<param>` values (CDATA or plain). A reply with
  malformed XML gets one corrective tool response quoting the expected form.
- Sampling: official `temperature 1.0, top_p 0.95`; `repetition_penalty 1.05` if loops appear.
- Stop strings: `<|im_end|>`, `</s>`.

## Tasks the model is asked to do

| Tier | Example | Model output | Host verification |
| --- | --- | --- | --- |
| T1 tweak | "make the player faster", "lose after 5 misses" on a working cart | 1–3 `edit_game` calls | lint, smoke, task check (state read) |
| T2 repair | S4 `shooter-repair` | `edit_game` calls | smoke, S4 oracle (evaluation only) |
| T3 create from template | "catch falling fruit" | choose a template, fill its marked slots | smoke + the template's own checks |
| Stretch | S4 `shooter-create` | as T3 | S4 oracle |

New games never start from an empty file: the host loads a genre template (catch, dodge,
shooter, collect first) whose structure, `g`, `new_game()`, modes, retry and HUD are fixed.
The model edits only regions marked `-- SLOT: …`.

## Workflow

Every phase request is assembled from host state (task, plan, numbered source, last report)
and stays within the 8K budget; inside a phase, older tool responses shrink to one line.

| Phase | Model sees | Tools | Ends when |
| --- | --- | --- | --- |
| plan (T3 only) | task, template list | none | a short form: `TEMPLATE / NAME / GOAL / CONTROLS` |
| build | core + api + phase, task, plan, numbered source | `write_game`, `edit_game`, `look`, `done` | `done` accepted: clean load and smoke |
| verify | — (host) | — | host runs smoke + template/task checks |
| fix (≤ 2 rounds) | failing checks with actual values, numbered source | `edit_game`, `look`, `done` | `done` accepted and checks re-run |
| report | — | — | host writes the four-part reply from host results |

Caps per task: 15 minutes, 30 tool calls, 8 turns per phase.

## Tools

| Tool | Params (strings) | Host behaviour |
| --- | --- | --- |
| `write_game` | `source` | Replace main.lua → lint → load → smoke. T1/T2 do not offer it. |
| `edit_game` | `find`, `replace` | One exact, unique replacement, then the same pipeline. Errors quote nearby numbered lines. |
| `look` | — | 32×32 ASCII thumbnail of the current frame (`0–f`, one char per 4×4 block) plus `g` summary. |
| `done` | `summary` | Accepted only when the phase condition holds; otherwise the reason. |

## Host checks

**Lint** (blocks loading): non-ASCII, foreign APIs (`love.`, `math.*`, `string.*`,
`table.insert/remove`, `os.`, `io.`, `require`), top-level `local g`, missing `_draw` or
`_update`/`_update60`, over 8192 tokens, edits outside template slots (T3).

**Smoke**: boots 30 frames without fault; `g.mode` set; frame uses more than one colour;
input changes `g` or the frame.

**Template checks**: each template ships cases on its own `g` fields (idle loses, scoring
increases `g.score`, win reachable with setup, X retry restores the initial state).

**Task checks** (T1): a state read per task, e.g. `g.speed > 1.5`.

## Evaluation

`bin/probe.mjs`: protocol round-trips (tool call with CDATA Lua, tool response, final text)
and speed (prefill and decode tokens/s at 2K/4K/8K).

`bin/eval.mjs`: T1 ×5 tasks, T2 `shooter-repair`, T3 catch/dodge, stretch `shooter-create`;
3 repeats; thinking on/off. Metrics: oracle/check pass, finished within caps, tool and parse
errors, largest request in tokens, decode tokens, wall time.

## Milestones

1. **M0 protocol and speed.** Engine, protocol, probe. Exit: valid CDATA tool calls in
   ≥ 9/10 probe turns; measured tokens/s.
2. **M1 tweak and repair.** Flat tools, 8K assembly, host verification, text reports. Exit:
   T1 ≥ 4/5, T2 ≥ 2/3.
3. **M2 create from templates.** Templates with slots and checks, plan form. Exit: T3 ≥ 2/3.
4. **M3 browser.** WebGPU engine behind the same `complete`.
