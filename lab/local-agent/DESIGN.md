# Local Agent Lab — Pi coding agent + PICO-8 skill

Can a small local model make and change PICO-8 games when it runs inside a minimal coding
agent? The lab answers this with the stock **Pi coding agent** (`@earendil-works/pi-coding-agent`,
pinned), a **`pico8` skill**, and a text-only **`p8` command** that checks and plays carts.
The lab writes no agent loop of its own. Maker is not changed. Training is out of scope for
this machine.

## Why this shape

- A public test of ten agent harnesses on Qwen3.5-4B Q4_K_M (r/PiCodingAgent, 2026-10) had Pi
  finish five small coding tasks 5/5 in 1m36s; the author's conclusion was that at that
  difficulty the harness, not the model, is the bottleneck.
- Our earlier 4B result in the Maker flow (repair 1/3, create 0/3, 57/64 tool errors) came from
  a heavy harness: ten custom tools, a large resident workflow, an image on every result, and
  38 reads of documents that did not exist.
- The remaining gap is domain knowledge: small models write standard Lua (`math.abs`,
  `table.insert`) and invent syntax. The skill and the checker target exactly that.

So making a game becomes the loop small models handle best: **edit a file → run a check →
read the failure → edit again**, like fixing code until tests pass.

## Components

```
lab/local-agent/
  DESIGN.md
  package.json        pins @earendil-works/pi-coding-agent; scripts: test, eval
  agent/              PI_CODING_AGENT_DIR for runs: models.json (local Ollama), settings.json
  skill/pico8/        SKILL.md, reference/api.md, examples/*.lua, templates/*.lua
  bin/p8              the checker CLI (on PATH during runs)
  bin/eval.mjs        runs tasks × repeats through `pi --mode json`, scores with hidden checks
  src/
    maker.mjs         the only import path into app/: player runtime, cart codec, tokens, S4 oracle
    runtime.mjs       one inspection session: load, advance, read, ASCII thumbnail
    lint.mjs          static checks with fix hints
    checks.mjs        check specs: boot, smoke, scripted cases with expectations
    p8.mjs            command implementations used by bin/p8
    sounds.mjs        fixed sfx 0–7 bank for new carts
  tasks/<id>/         task.md, start files, checks.json (visible), hidden.json (eval only)
  tests/              node --test for p8 and checks; no model requests
```

Rules: `app/` never imports `lab/`; `lab/` imports `app/` only through `src/maker.mjs`. The
agent sees only its workspace, the skill and `p8`. Results go to `.cache/lab/` (ignored).

## `p8` command

Text output only, short, and every failure says what to change.

| Command | Does |
| --- | --- |
| `p8 check [main.lua]` | lint → load → boot 30 frames → smoke → every case in `checks.json`. Prints `PASS`/`FAIL` per item with line numbers and actual values, then `ALL PASSED` or `N FAILED`. Exit code 0 only when all pass. |
| `p8 run [main.lua] --press "right*30 x" --read g.score,g.mode` | Boot, hold buttons for the given frames, print mode changes, sound starts and read values. |
| `p8 look [main.lua] [--press …]` | 32×32 ASCII thumbnail (`0–f`, one character per 4×4 block) of the frame after the presses. |
| `p8 new <template>` | Copy a starting cart into the workspace (new-game tasks). |
| `p8 export [main.lua] [out.p8]` | Write a `.p8` cart with the sound bank. |

Lint hints map the known mistakes: `math.abs → abs`, `math.floor → flr`, `math.random → rnd`,
`table.insert → add`, `local g` at top level, non-ASCII text, missing `_update`/`_draw`, over
8192 tokens.

`checks.json` cases: `{name, setup?, press, expect: [{path, equals|atLeast|atMost|changes}]}`,
run from boot in a fresh session. Tasks ship visible checks; evaluation also runs hidden ones.

## `pico8` skill

`SKILL.md` stays under about 1,500 tokens: what PICO-8 Lua is not (a short table of
standard-Lua habits and their PICO-8 forms), the game skeleton (global `g`, `new_game()`,
`g.mode`, locked X retry), screen and input facts, and the working rule: **after every
change run `p8 check`; you are done only when it prints ALL PASSED.** `reference/api.md` and
complete example games are read on demand.

## Tasks

Each task: 10 minutes, fresh workspace copy, scored only by hidden checks (which include the
visible ones), 3 repeats.

| Level | Task | Start |
| --- | --- | --- |
| T0 | Pi sanity: a small Python fix with a test (as in the public benchmark) | Python files |
| T1 | Change constants: player speed, lives, goal | working catch game |
| T2 | Fix a bug that a visible check reports (e.g. S4 shooter invulnerability) | buggy cart |
| T3 | Add a small feature: missing a fish costs a life; speed up every 5 points | working catch game |
| T4 | New game from a template: "dodge falling rocks, survive 30 s" | `p8 new` available |
| T5 | New game from scratch: catch game from one sentence | empty `main.lua` |

Targets for Qwen3.5-4B: T0 3/3; T1–T3 together ≥ 7/9; T4 ≥ 2/3. T5 is tracked.

## Models and runtime

- Primary: `qwen3.5:4b-q4_K_M` on local Ollama (`OLLAMA_CONTEXT_LENGTH=32768`), OpenAI
  Chat Completions, text only, thinking off (then `low` as a comparison).
- Reference ceiling: `qwen3.5:9b-q4_K_M` on the same tasks.
- MiniCPM5-2B is excluded: Pi needs OpenAI tool calls, and neither Ollama nor llama.cpp parses
  its XML tool format.

Run shape: `PI_CODING_AGENT_DIR=agent pi --mode json --no-session --offline --no-extensions
--no-mcp --no-context-files --no-prompt-templates --no-skills --skill skill/pico8
--model ollama/<id> --thinking off "<task.md>"`, cwd = workspace, `PATH` includes `bin/`.

Metrics per run: hidden-check pass, wall time, model turns, tool calls by name, `p8 check`
runs, tool errors, output tokens, whether the agent stopped on its own.

## Milestones

1. **Harness** — agent dir, Pi run wrapper, T0. Exit: T0 3/3 on 4B.
2. **Checker and skill** — `p8`, lint hints, checks, skill, T1–T3. Exit: T1–T3 ≥ 7/9.
3. **New games** — templates, `p8 new`, T4/T5. Exit: T4 ≥ 2/3.
4. **Comparison** — 9B on all tasks; the Maker-flow 4B numbers as the "heavy harness" baseline.

## Running

```sh
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_CONTEXT_LENGTH=32768 OLLAMA_FLASH_ATTENTION=1 \
  OLLAMA_KV_CACHE_TYPE=q8_0 ~/.local/ollama-0.40.16/ollama serve
~/.local/ollama-0.40.16/ollama pull qwen3.5:4b-q4_K_M
cd lab/local-agent && npm install && npm run eval -- --model qwen3.5:4b-q4_K_M --tasks T0,T1
```

## Results (2026-11-14)

Stock Pi coding agent, `pico8` skill loaded up front (`--force-skill`), thinking off,
Ollama Q4_K_M, hidden checks for scoring.

| Task | Qwen3.5-4B | MiniCPM5-2B (`lab-minicpm5-2b`, 1 run each) |
| --- | --- | --- |
| T0 Python fix | 3/3, 14–21 s | 0/1 (edited the test file, timed out) |
| T1 change constants | 3/3, 9–10 s | 1/1, 84 s |
| T2 fix a bug | 3/3, 15–27 s (after p8 hint fixes; 2/3 before) | 0/1 (20 edits, bug left in, timed out) |
| T3 add a feature | 3/3, 77–220 s (after hint fixes; 1/3 before) | 0/1 (74 edits, 81 tool errors) |
| T4 create from skeleton | 1/3 | not run |
| T5 create from empty | 0/3 | not run |

Conclusions: with this harness Qwen3.5-4B reliably changes and fixes existing carts;
creating a game from a skeleton is unreliable and from scratch fails. MiniCPM5-2B only
manages constant tweaks and is not pursued further. What moved 4B the most was the
checker's feedback (quoting the failing code, naming common slips, flagging unchanged
re-checks), not the model or the agent loop.

## Cloud results on the just-bash environment (2026-11-14)

DeepSeek V4.1 Flash (`deepseek/deepseek-flash`), thinking high, Pi SDK in process with
read/edit/write/bash backed by just-bash (`/cart` in memory, `/skill/pico8` read-only, `p8`
as a shell command), skill expanded into the first message, 3 runs in parallel.

| Task | Result | Time | Tool calls | Tool errors |
| --- | --- | --- | --- | --- |
| T1–T5 (1 run each) | 5/5 | 4–12 s | 3–6 | 0–1 |
| T6 S4 shooter-create (4 runs) | 3/4 | 38–110 s | 14–27 | 1–2 |
| T7 S4 shooter-repair (3 runs) | 3/3 | 53–72 s | 19–23 | 1–2 |

Maker's frozen flow on the same model and S4 prompts (2026-11-13): repair 3/3 in
109–142 s with 21–25 calls; create 2/3 in 84–140 s (one hit the 180 s limit before its
first tool call). The one lab failure drew the player blinking during invulnerability,
which the S4 contract forbids (player centre pixel must stay green). The model also used
`p8 look --png` and read the image to check the screen. Archives: `.cache/lab/20261113T1909-veqn`,
`.cache/lab/20261113T1912-1wmm`.

Browser probe: bundling Pi's four tool files for the browser pulls Node-only modules via
`config.js`, `utils/paths.js`, `utils/output-files.js`, `utils/shell.js`, photon image
resizing and pi-tui (77 unresolved imports); the main entry pulls 397. just-bash ships a
browser entry.

Browser feasibility (follow-up the same night): `browser/build.mjs` bundles Pi's four tool
files plus just-bash's browser entry with esbuild, replacing Node built-ins by small shims
(`browser/shims.mjs`: path/url/os implemented, fs reports ENOENT, child_process and zlib
throw) and injecting `Buffer`. `browser/run.mjs` loads it in headless Chrome: read, edit,
write and bash all work against a just-bash MountableFs (pipes and a custom `p8` command
included), and OPFS reads and writes a file. Bundle 2.8 MB, mostly just-bash (1.2 MB) plus
unused pi-tui/highlight.js render code that can be trimmed. Not yet done: a real `p8` on the
player runtime in a Worker, an OPFS-backed IFileSystem for `/cart`, and the Pi agent loop
itself in the browser (Maker already runs pi-durable there).
