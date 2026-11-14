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
  package.json        pins pi-coding-agent, pi-durable, chord and just-bash; scripts: test, eval
  agent/              models.json for local Ollama runs (historical)
  bin/p8              the checker CLI on the real disk
  bin/eval.mjs        runs tasks × repeats (--loop session|durable, --p8 inline|worker), scores them
  browser/            build.mjs (esbuild, Node shims), worker.mjs (agent side in a Worker),
                      page.html, run.mjs (headless Chrome: --probe or --task)
  src/
    maker.mjs         the only import path into app/: player runtime, cart codec, tokens,
                      S4 oracle, and the shell-flow p8 core in app/src/pico8/shell/
    env.mjs           just-bash over MountableFs: /cart writable, /skill/pico8 read-only, p8
    pi-tools.mjs      Pi coding-agent's read/edit/write/bash with operations on env
    agent.mjs         Node: stock Pi AgentSession; piSystemPrompt() for the other loops
    durable-agent.mjs pi-durable Harness (Maker's harness) with its CodingTools, same prompt
    browser-agent.mjs browser: pi-agent-core Agent + pi-ai, same tools and system prompt
    opfs-fs.mjs       /cart on an OPFS directory (write-through InMemoryFs)
    p8-worker*.mjs    Worker entry for p8 (Web Worker semantics) and its Node starter
    tasks.mjs         Node: skill tree, task loading, scoring, run metrics
  tasks/<id>/         task.md, start files, checks.json (visible), hidden.json (eval only)
  tests/              node --test for p8 and checks; no model requests

app/src/pico8/shell/  (moved from the lab for Maker's shell flow; the lab runs this code)
  p8.js checks.js lint.js runtime.js png.js sounds.js posix-path.js
  p8-remote.js        p8 across a message boundary: p8Host, remoteP8, portSender
  durable-env.js      pi-durable ExecutionEnv over a just-bash fs and shell
  skill/              SKILL.md, reference/api.md, examples/*.lua, templates/*.lua
```

Rules: `app/` never imports `lab/`; `lab/` imports `app/` only through `src/maker.mjs`. The p8 core and skill live in `app/src/pico8/shell/` since M2, so lab results measure the code Maker ships; the runtime factory is injected (`setSessionFactory`) and `maker.mjs` sets it for Node. The
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
cd lab/local-agent && npm install
DEEPSEEK_API_KEY=... npm run eval -- --tasks T1,T2,T3,T4,T5,T6,T7 [--loop session|durable] [--p8 inline|worker]
node browser/build.mjs && node browser/run.mjs --probe     # no model
DEEPSEEK_API_KEY=... node browser/run.mjs --task T6
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
unused pi-tui/highlight.js render code that can be trimmed. The follow-ups are in place below.

## Browser run (2026-11-14)

The whole agent side runs in a module Worker (`browser/worker.mjs`, one 4.1 MB bundle):

- `/cart` is an OPFS directory through `src/opfs-fs.mjs`: read into an InMemoryFs on open,
  every mutation (write, append, mkdir, rm, cp, mv) mirrored to OPFS before it resolves.
  The probe checks sed -i, mkdir/cp/mv/rm and a PNG write, then lists OPFS directly and
  reopens it: same files, `main.lua` identical in memory and on OPFS.
- `p8` is unchanged and runs the real player runtime in the Worker: `player.mjs` stays
  external (served from `app/public/player/`) and loads its own wasm. `p8 check` on T1 takes
  260 ms, `p8 run` 16 ms, `p8 look --png` 39 ms. The read-only skill mount rejects writes.
- The loop is pi-agent-core's `Agent` with pi-ai's DeepSeek provider calling the API from
  the Worker (CORS is fine), Pi's four stock tools over the same environment, and the
  system prompt a Node Pi session builds for these tools (`piSystemPrompt`). Left out
  versus the Node AgentSession: session file, compaction (off in the lab anyway), extension
  hooks, its retry wrapper.

DeepSeek Flash, thinking high, one run each, scored on the host as in `bin/eval.mjs`:

| task | browser | Node lab (earlier) |
| --- | --- | --- |
| T1–T5 | 5/5, 4–9 s, 4–6 turns | 5/5, 4–12 s |
| T6 S4 shooter-create | ✓ 126 s, 23 turns, used `p8 look` | 3/4, 38–110 s |
| T7 S4 shooter-repair | ✓ 60 s, 23 turns | 3/3, 53–72 s |

Same tool mix as in Node (p8 check/run/look, read, edit, write). Archives:
`.cache/lab/browser-*`. Conclusion: the lab's agent design (Pi tools + just-bash + p8 +
skill) runs entirely in the browser with no server beyond static files and the model API;
this is the shape a Maker migration would take. Bundle size is dominated by just-bash
(1.2 MB) and Pi render code (pi-tui, highlight.js, photon) that the browser never calls.

## pi-durable loop (M0 of the Maker migration, 2026-11-14)

`--loop durable` runs the same task on pi-durable, the harness Maker uses: a MemoryStorage
Harness, pi-durable's own `CodingTools` extension (read/write/edit/bash) over
`durable-env.mjs` (ExecutionEnv on the just-bash environment, p8 included), and one
untagged section holding the exact prompt `piSystemPrompt()` returns. Retry, compaction
and transcript are pi-durable defaults; tools run sequentially.

The first request was checked field by field: the system prompt is byte-identical to the
coding-agent session's; tool schemas match except key order, tool order (read, write,
edit, bash), "Bash command" vs "Shell command" for `bash.command`, "combined stdout and
stderr" in the bash description and no bmp in read's. `read` returns `p8 look --png`
images as image blocks without an image processor.

DeepSeek Flash, thinking high:

| task | durable | session (earlier) |
| --- | --- | --- |
| T1–T5 | 5/5, 5–16 s | 5/5, 4–12 s |
| T6 S4 shooter-create | 3/4, 56–77 s | 3/4, 38–110 s |
| T7 S4 shooter-repair | 4/4, 37–60 s | 3/3, 53–72 s |

The T6 failure is the model's game (S4 off-axis route: no core loop), not a harness error;
tool errors in all runs are ordinary nonzero exits (`cat checks.json` on a cart without
one, a failing `p8 check`, `read` used as a shell command). Archives:
`.cache/lab/20261114T0027-5p8a`, `.cache/lab/20261114T0032-ve7i`. Conclusion: swapping the
coding-agent session for pi-durable with the same prompt keeps the lab's results; the
loop is not the variable.

## p8 in a Worker (M1, 2026-11-14)

Maker's agent runs on the page's main thread, so `p8` must run the player runtime
elsewhere. The lab's checks read `g.mode` after every frame and keep several sessions
open at once (boot, idle, one per held button), so a frame-level port over Maker's test
Worker would cost a round trip per frame and need more than one session. Instead the whole
command crosses once: `remoteP8(send)` sends argv, cwd and the files under cwd;
`p8Host` runs the unchanged `runP8` on a private InMemoryFs with the skill templates and
returns stdout, exit code, every created or changed file (also outside cwd, e.g.
`--png /tmp/a.png`) and what run/look played (`onPlay`: command, press, frames, last frame
RGBA) for the host to show and record. `createEnvironment({ p8 })` takes the command body.

`tests/checks.test.mjs` runs a script (check twice for the NOTE, run, look --png into a
subdirectory and /tmp, new from template, a bad subcommand) in-process and through a
worker_thread and requires identical stdout, exit codes and files.

That test found a flaky check: Lua table key order differs between sessions, so
`JSON.stringify(g)` in the input check and case expectations could report buttons that do
nothing (T2 "responds to … up, down, x" after T3 had run in the same thread). Comparisons
now use sorted keys.

DeepSeek Flash, durable loop, `--p8 worker`, one run each: T1–T7 7/7 (T1–T5 3–13 s, T6
67 s, T7 40 s). Archive `.cache/lab/20261114T0041-dzcu`.

## Optional g / g.mode (P1-1, 2026-11-14)

`p8 check` no longer requires a global `g` or `g.mode`; boot reports which it found and
still requires more than one colour, and input still requires some button to change `g`
(when present) or the screen. The skill describes `g.mode` as the way to write games with a
result and tells the model not to add results to toys; `p8 new toy` is a template without
one. T8 is a new task (paint toy from an empty cart, hidden case: `g.mode` stays nil).
DeepSeek Flash, durable loop, worker p8: T1–T8 8/8. Archive `.cache/lab/20261114T0405-t68d`.

## p8 --setup (P1-2, 2026-11-14)

`p8 run` and `p8 look` take `--setup "lua"`, run after boot and before the presses
(`Runtime.setup`, the same hook `checks.json` cases use); output says main.lua is unchanged
and the run is not normal play. Maker never replays setup runs. T1–T8 8/8
(`.cache/lab/20261114T0408-7an2`).

## Requirements as checks (P2-4, 2026-11-14)

`checks.json` expectations can name a screen pixel instead of a path:
`{"pixel":["g.player.x","g.player.y"],"equals":11}` (palette colour of the last frame;
coordinates are numbers or paths). The skill now has the model write a new game's exact
rules as at most 8 cases before coding; edits and fixes add none. With that rule S4
create 10/10 and repair 5/5 (median 92 / 66 s); applying it to every task cost more time
(T1 18 s) without a measured gain. T1–T8 8/8.

## Resources as files (P2-8, 2026-11-14)

Carts carry `gfx.txt`, `gff.txt`, `map.txt`, `sfx.txt` and `music.txt` (.p8 section text,
`app/src/pico8/shell/resource-files.js`). p8 applies the files present over the base
resources and stops with file and line on a malformed one; `p8 sheet`, `p8 map` and
`p8 sfx` show them. Lab tasks start with them (sound bank) and scoring uses the final
files. T9: draw a coin in gfx.txt and set its flag in gff.txt without touching main.lua.
T1–T9 9/9.
