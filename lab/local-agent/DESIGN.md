# Local Agent Prototype — MiniCPM5-2B

A headless PICO-8 game agent built for one model, **MiniCPM5-2B**, running on a local Ollama.
Browser inference is out of scope for now; no agent framework is required. The lab owns its
workflow, prompts and model protocol, and shares only the player runtime and evaluation
oracles with Maker. Maker is not changed.

## Goal and division of labour

**From one sentence, MiniCPM5-2B reliably produces a working, themed PICO-8 game in seconds.**

| Who | Responsible for |
| --- | --- |
| **Templates (host)** | Game code, polish and quality: title and controls, HUD, result screen with retry lock, particles and shake, difficulty ramp, sound on every event, readable palette. Written and reviewed by a person. |
| **Model** | Understanding the request: choose the template, name and theme the game, pick sprites and palette, set tunables; for small rule changes, pick and parameterise prepared rule options. |
| **Host checks** | Everything verifiable: the game boots, plays, can be lost/won and retried, and the request was applied. |

Game quality is set by the templates; the model is judged on whether its game matches the
request. Free-form code writing and repair are tracked as stretch tasks without targets.

## Measured capability (2026-11-13 probe)

Published scores (vendor, mostly thinking mode, Python-centric): LiveCodeBench v6 69.1,
SWE-bench Verified 46.4, BFCL v4 66.6, IFEval 86.7, IFBench 66.3, τ²-Telecom 97.1,
Terminal-Bench 8.6. Long multi-step execution is the documented weak spot.

Local probe, `q4_K_M`, official template, raw generation, `temperature 1.0 / top_p 0.95`:

| Task | Result |
| --- | --- |
| Spec form (9 keys, closed choices + ranges) | 3/3 chose the right template, roles, palette and in-range numbers; 2/3 broke the TITLE format (mixed case) — fixable by host normalisation |
| Write a whole catch game from the template, no thinking (×3) | 0/3 runnable: `math.abs`/`math.floor`, invented syntax (`g.fish{i}`, `x:rnd(…)`), incoherent rules; 2/3 answered in plain text instead of a tool call |
| Same with thinking (×2) | 0/2: one missing `_update`; one ran away to 56K characters of thinking and hit the 12K-token cap |
| S4 shooter repair, find/replace edits (×5, 3 no-think, 2 think) | 0/5: no-op edits, wrong location, line-number prefixes copied into `find`; thinking used 15–34K characters without finding the bug |
| Speed (M4 Pro) | decode ≈ 110–125 tok/s (≈ 95 with long thinking); prompt prefill ≈ 1.3–2K tok/s cold, near-instant with a cached prefix |

Conclusions: closed-choice forms are reliable; PICO-8 code generation and debugging are not,
in either thinking mode, despite the coding benchmarks. Thinking is unstable in length and
does not help these tasks. The design keeps the model on choices and parameters.

## Model and protocol facts

| Item | Value |
| --- | --- |
| Model | `openbmb/minicpm5-2b:q4_K_M` (Ollama, 1.56 GB), Apache-2.0; `LlamaForCausalLM`, 2.5B, 131K context, text only |
| BOS | The GGUF sets `add_bos_token = false`, but the official template starts with `<s>`. Raw prompts **must** start with `<s>`; without it the model answers incoherently. |
| Chat format | `<s><|im_start|>system\n…<|im_end|>\n<|im_start|>user\n…<|im_end|>\n<|im_start|>assistant\n` |
| Thinking | Off: prefill `<think>\n\n</think>\n\n`. On: prefill `<think>\n`. Default **off**. |
| Native tool calls | `<function name="f"><param name="p">…</param></function>`. `<function`, `</function>`, `<param`, `</param>` are control tokens (type 3) that Ollama strips from returned text, leaving only ` name="f"> name="p">…`. |
| Ollama tag template | No tool section, missing newline before `<think>`, 4096-token default context, stop list stored as one string. Not used. |

Therefore: the lab renders the prompt itself, calls `POST /api/generate` with `raw: true`,
`stop: ["<|im_end|>", "</s>"]` and an explicit `num_ctx`, and **does not use native tool
calls**. Every reply is a plain-text format defined below, parsed by the host. This avoids the
stripped control tokens and is the format a 2B model follows best (IFEval-style constraints).

## Levels and targets

| Level | Example request | Model reply | Host verification | Target |
| --- | --- | --- | --- | --- |
| **L1 configure** (core) | "a cat catches falling fish, avoid the bones" | spec form | spec valid; build boots; template checks; theme fit reviewed | valid ≥ 9/10 (after normalisation and ≤ 1 correction); functional 10/10 of valid specs; theme fit ≥ 8/10; ≤ 10 s end to end |
| **L2 tweak** | "faster, and lose after 3 misses" on an L1 game | `SET` lines and `RULE` lines | spec + rule validation, template checks, task check | ≥ 4/5 per task set |
| L3 code (stretch) | "add a power-up that slows the fish"; S4 repair | a Lua block for one slot, or `FIND`/`REPLACE` blocks | lint, smoke, checks; S4 oracle | tracked only |
| Free create | S4 `shooter-create` | — | — | out of scope |

Theme fit is a person's yes/no per game: do title, sprites, palette and texts match the request?

## Reply formats

All formats are `KEY: value` lines; unknown lines are ignored, missing or invalid keys get one
correction round that lists the allowed values.

**L1 spec form**

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

Host normalisation before validation: trim, upper-case TITLE and TEXT_*, clamp numbers to
range, map close synonyms of choice values (e.g. `kitty` → `cat`) from a per-key alias list.

**L2 tweak**

```
SET SPEED: 2
SET LIVES: 3
RULE: miss_loses_life
RULE: speed_up_every 10
```

`SET` changes a spec key or tunable. `RULE` enables one of the template's prepared rule
options (each a reviewed code snippet with parameters), so rule changes stay choices rather
than code.

**L3 code (stretch)**: one fenced ```` ```lua ```` block preceded by `SLOT: <name>`, or
`FIND:`/`REPLACE:` fenced block pairs for repair.

## Where quality comes from

1. **Templates.** Each genre template (first: catch, dodge; later: shooter, collect) is a
   complete, polished game with fixed structure (`g`, `new_game()`, modes, locked X retry).
   A template is admitted after a person rates its default build ≥ 4/5 on readability,
   feedback and fun, and its host checks pass.
2. **Choose, don't draw.** Sprites come from a curated 8×8 library (`sprites.json`, ids per
   role and theme) and colours from named presets (`palettes.json`).
3. **Tunables** with documented ranges; the host clamps.
4. **Rule options.** Each template ships a short list of prepared, reviewed rule variants
   (e.g. `miss_loses_life`, `speed_up_every N`, `bonus_item`, `time_limit N`) that L2 enables.
5. **Slots** exist only for L3.

## Boundaries

```
lab/local-agent/
  bin/        probe.mjs (format validity and speed), eval.mjs (levels × repeats)
  prompts/    spec.md, tweak.md, code.md (L3), api.md (L3)
  templates/  <genre>.lua, <genre>.json (keys, aliases, ranges, rule options, slots, checks)
  assets/     sprites.json, palettes.json
  src/
    ollama.mjs     raw completion: complete(prompt, {stop, maxTokens, temperature, numCtx, signal})
    prompt.mjs     MiniCPM5 chat rendering (<s>, roles, thinking prefill)
    replies.mjs    parse and normalise spec / tweak / code replies
    maker.mjs      the only import path into app/: player runtime, cart codec, tokens, S4 tasks/oracle
    runtime.mjs    one inspection session: load, advance, read
    build.mjs      template + spec + rules → cart (sprites, palette, tunables, texts, sounds)
    lint.mjs       static checks (L3 code)
    verify.mjs     smoke + template checks + task checks → report
    flow.mjs       L1, L2, L3 flows with correction rounds
    sounds.mjs     fixed sfx 0–7 bank
  tests/      node --test with a scripted completion; no model requests
```

Rules: `app/` never imports `lab/`; `lab/` imports `app/` only through `src/maker.mjs`.
`ollama.mjs` knows nothing about prompts; `prompt.mjs` and `replies.mjs` know nothing about
PICO-8 runtime; `flow.mjs` is the only module that knows the workflow; the builder and
checks never call the model. No provider SDK dependency. Results go to `.cache/lab/`.

## Flows

**L1** (≤ 2 model calls): request + template catalogue (genres with one-line descriptions,
roles, palettes, ranges) → spec form → normalise and validate (≤ 1 correction) → build →
smoke and template checks → report. A build or check failure is a template/builder bug.

**L2** (≤ 2 model calls): request + current spec + tunables + rule options → tweak lines →
validate → rebuild → template checks + task check → report.

**L3** (stretch, ≤ 4 model calls): request + numbered slot or source + API sheet → code
reply → lint, load, checks; failures with actual values go back once per call.

Requests stay small: ≤ 2K tokens for L1/L2, ≤ 6K for L3; `num_ctx` 8K.

## Host checks

**Spec/tweak**: every key known; values in allowed sets or ranges after normalisation; rule
options exist and their parameters are in range.

**Smoke**: boots 30 frames without fault; `g.mode` set; more than one colour on screen;
input changes `g` or the frame.

**Template checks** (from `<genre>.json`): idle loses within a set time, scoring raises
`g.score`, win reachable (with setup), X retry restores the initial state, every event plays
its sound, plus one check per enabled rule option.

**Task checks** (L2): state reads per task, e.g. `g.lives == 3`.

**Lint** (L3 only): non-ASCII, foreign APIs (`love.`, `math.*`, `string.*`,
`table.insert/remove`, `os.`, `io.`, `require`), `local g`, missing callbacks, token limit,
edits outside the slot.

## Evaluation

`bin/probe.mjs`: format validity (spec and tweak replies, ×10 each) and speed.

`bin/eval.mjs`: L1 10 fixed requests × 3 repeats; L2 5 tweak tasks × 3; L3 S4 repair and
3 slot tasks, tracked. Metrics: validity (first try / after correction), functional pass,
task-check pass, theme fit (reviewed), model calls, wall time. Final games are replayed to
capture title, play and result frames for review.

## Milestones

1. **M0 protocol** — `ollama.mjs`, `prompt.mjs`, `replies.mjs`, `probe.mjs`. Exit: spec and
   tweak replies valid ≥ 9/10 after normalisation (thinking off); speed recorded.
2. **M1 configure** — catch template with manifest, aliases and checks (reviewed ≥ 4/5),
   sprite and palette libraries, builder, L1 flow. Exit: L1 targets on catch requests.
3. **M2 tweak** — rule options and task checks for catch; dodge template. Exit: L2 ≥ 4/5;
   L1 targets hold across two templates.
4. **M3 stretch** — L3 slot code and repair tracked.

## Current code and migration

Kept and adapted: `maker.mjs`, `runtime.mjs` (no images), `lint.mjs` (L3), `smoke.mjs`
(into `verify.mjs`), `sounds.mjs`; `prompts/template.lua` and `prompts/example.lua` seed the
catch template. Removed: `model.mjs` (pi-ai) and the pi-ai dependency, `loop.mjs`,
`tools.mjs`, `phases.mjs`, `prompts/{core,build,plan,test}.md`, image handling and the old
tests. Probe scripts from the capability check live in `.cache/minicpm-probe/` (not committed).

## Running

```sh
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 \
  ~/.local/ollama-0.40.16/ollama serve
~/.local/ollama-0.40.16/ollama pull openbmb/minicpm5-2b:q4_K_M
```
