# PICO-8 Agent evaluation

## Layers

`DEEPSEEK_API_KEY=... npm run eval:tier -- --tier quick|agent|turns|full [--model deepseek-flash] [--repeat 5] [--parallel N] [--s4-time-ms N]` runs the layers in parallel and prints one summary (logs under `.cache/evaluations/tier-*`):

| Tier | Runs | When |
| --- | --- | --- |
| quick | lab T1–T9 (`lab/local-agent`, about 2–3 min) | every skill or p8 change |
| agent | quick + S4 ×N (create and repair, about 6–10 min) | every agent-facing change (startup text, skill, p8 output, tools) |
| turns | multi-turn suites only (about 5–10 min): `edits` ×N and `snake`, `meteor`, `paint` once | changes to editing, versions, routes or checks |
| full | agent + turns + Garden and Lodge reruns + app smoke (about 30 min) | large changes; then play the case results by hand |

## Multi-turn suites

`node scripts/evaluation/run-turns.mjs --case edits|snake|meteor|paint [--model ...]` runs one conversation with the production Agent (`conversation.mjs`, shared with `run-case.mjs`; `TURN_TIME_LIMIT_MS`, default 10 min per turn). Cases are in `turn-cases.mjs`:

- `edits` starts from a fixed fruit-catch game (version 1) and asks for four follow-ups: a streak bonus, double fall speed, new colours, a pause on X. After every turn the cart is scored with hidden `checks.json` cases for that request, every earlier one and the base rules, using only names the base game has. `tests/turn-cases.test.mjs` keeps the checks honest: each turn's reference solution passes them, the previous turn's cart fails the new ones (`guard` cases catch wrong changes, such as a streak that never resets).
- `snake`, `meteor`, `paint` are one-line requests plus one follow-up, scored generically (lint, boot, input), with a result replay of the Agent's normal routes and a screenshot per turn (`turn-N.png`, after 90 idle frames) for review.

Each turn also reports the versions it made (one per request is expected). Archives: `.cache/evaluations/turns-<case>-<id>/`.

Record results, failures included, in docs/development-status.md.

## Open-ended case study

Open `/scripts/evaluation/case-study.html` locally for the Lodge Podge experiment. This uses the same Agent, p8 Worker and saved provider configuration with a disposable cart. Send the initial request, then follow-up feedback in the same session. Each turn has a 15-minute timeout and no tool-call limit. It archives the original prompts, transcript, committed revisions, draft and separate evaluator inputs through the loopback recorder. It does not write to the user's cart library or score fun automatically. The page is a local research tool, not a production entry point.

Use `/scripts/evaluation/case-study.html?case=garden` for the Sweet Garden prompt inspired by OpenAI's Seedy's Sweet Garden. The model and workflow are unchanged between these case presets. The preview buttons operate the live player; independent test inputs remain in the separate test Worker.

The completed two-turn Sweet Garden sample is at `/case-studies/sweet-garden/index.html`. See [its report](../../../docs/sweet-garden-case-study.md) for the actual Agent output, retained tool errors, normal-play verification and remaining gaps. Its final route can be replayed from `app/`:

```sh
mkdir -p ../.cache/sweet-garden-replay
node scripts/evaluation/replay-case.mjs public/case-studies/sweet-garden/final.p8 public/case-studies/sweet-garden/replay-inputs.json ../.cache/sweet-garden-replay/game
```

Four retained `baseline-*-inputs.json` routes show differing early wins on one initial board. They are not random-player samples or a difficulty rating. Normal loss, dead-board shuffle and listening remain unverified.

The finished two-version sample is at `/case-studies/lodge-podge/index.html`. See [the case study](../../../docs/lodge-podge-case-study.md) for scope, failures and actual verification. Full provider transcripts remain in the ignored cache.

To replay its final successful route from `app/`, create an output directory and run:

```sh
mkdir -p ../.cache/lodge-podge-replay
node scripts/evaluation/replay-case.mjs public/case-studies/lodge-podge/final.p8 public/case-studies/lodge-podge/replay-inputs.json ../.cache/lodge-podge-replay/game
```

This loads the unchanged cart in the bundled WASM runtime and writes actual PNG frames plus input/diagnostic evidence. Compare the victory and restart frames with the retained sample images; absence of runtime faults alone is not a gameplay pass.

## Headless case rerun

`DEEPSEEK_API_KEY=... node scripts/evaluation/run-case.mjs --case garden|lodge` reruns a retained two-turn case with the production Agent, tools, p8 Worker and test Worker protocol in Node, using the baseline prompts, `deepseek-flash` high, 15 minutes per turn and no tool cap. The key comes only from the environment and is redacted from the archive. It writes `.cache/evaluations/case-<slug>-<id>/` with `report.json` (per-turn transcript, metrics, coverage), `turn-N.p8`, `final.p8`, and PNG frames from replaying the longest final-revision normal route in a fresh session. Results of the 2026-11-13 rerun are in [development status](../../../docs/development-status.md).

Each rerun also writes `resultReplay` into `report.json`: every normal-input route the Agent recorded on the final revision is replayed in a fresh seeded session (the runtime p8 uses) with `g.mode` read after every frame, reporting whether normal play reached a win, a loss and a restart after a result. `node scripts/evaluation/result-replay.mjs <case-archive-dir>...` rechecks older archives. Carts without a string `g.mode` are reported as not machine-checkable; this is evidence about the recorded routes, not about fun.

`node scripts/evaluation/reverify-s4.mjs <archive-dir>...` reruns the current independent and Agent-route verifiers on archived S4 final carts without provider requests and writes `reverify.json` beside the untouched report. The independent oracle waits 30 idle frames after a result before pressing X (a short result lock is valid) and Agent-route evidence replays the recorded normal-input routes.

`SMOKE_DEEPSEEK_KEY=... node scripts/evaluation/app-smoke.mjs` drives the product entry instead (home composer → MAKE → workbench, temporary Chrome profile) and saves `summary.json` and a workbench screenshot under `.cache/evaluations/app-smoke-*`.

`SMOKE_DEEPSEEK_KEY=... node scripts/evaluation/browser-smoke.mjs` is a real-browser end-to-end smoke: it starts the dev server, opens the case-study page in headless Chrome with a temporary profile, sends one short creation prompt through the production browser Game/Worker/Agent and prints the archive, final reply and any console errors. Set `SMOKE_CHROME_NO_SANDBOX=1` where Chrome's renderer sandbox crashes inside an outer sandbox.

## Fixed suites

Open `/evaluation.html` on the same local development origin as the app. The evaluator uses the browser's saved model configuration and makes normal provider requests with disposable carts. Select Workflow for the original six tasks twice, or Small mechanics for three small repair tasks twice. It records tool use, state/debug calls, scope preservation and independent pixel checks. Workflow is present at startup; document reads are not pass criteria. Review creation gameplay with the returned frames. Compaction tests use declared synthetic history and real provider summarization.

The evaluator has a 180-second and 40-tool budget per attempt. Its loopback recorder saves reports and execution snapshots through `/__evaluation` under `.cache/evaluations/evaluation-<id>/`. Preserve failed attempts and report the scope of each check. Deterministic evaluator tests are part of `npm test`.

## Small mechanics suite

These are short, deliberately broken fixtures, not unrestricted game generation benchmarks. Each task asks the model to preserve the small game's existing layout, resources and unrelated behavior. The independent verifier runs only after capturing the model transcript, so its inputs do not count as model playtesting.

| Task | Independent checks |
| --- | --- |
| Jump | Grounded jump, rejection of a second airborne jump, landing, jumping again and horizontal movement. |
| Enemy | One HP lost on contact, 19 further frames protected, damage on the 20th frame, loss, win and HP/position restoration after both retries. |
| Map | Wall blocking, coin removal, no repeat scoring, victory after collecting both distinct coins, and map/score/position restoration on retry. |

Checks inspect actual WASM frame pixels, not source substrings or the model's final claims. Regression tests first reject each runnable broken fixture, then accept a known repair. Passing proves these named behaviors in the fixtures, not fun, art quality or correctness of arbitrary generated games. Full-input evidence remains available for review.

For manual version-view QA, run `npm run test:model`, use an isolated browser origin with custom model `fixture-draft`, Base URL `http://127.0.0.1:8788/v1` and a dummy key. This creates a green-sprite committed cart and a pink-sprite draft with invalid Lua. Confirm that Code and Resources share their version selection, display the matching source/resources, and keep the failed draft inspectable while Preview/export retain the committed cart. The fixture is a local scripted response, not a real model test.

For feedback-preview QA use `fixture-comparison` on an isolated origin with the same local mock endpoint. The first request makes a green BEFORE scene; the second makes an intermediate blue scene and a final pink AFTER scene. Confirm the selector compares green to pink, export remains current, reload retains the comparison, and a third explanation-only request restores the current preview without replacing the baseline. This is UI integration coverage, not a real-model quality result.

## Historical evidence

[Development status](../../../docs/development-status.md) records the evaluation evidence and remaining work. The earlier structured-tool agent and its evaluators were removed on 2026-11-14 (last state at tag `agent-flow-freeze-2026-11-13`); its results are kept in docs/shell-flow-migration.md. Failed and interrupted attempts remain in `.cache/evaluations/`; they must not be counted as successful evaluations.

Finish builds before starting the browser evaluator: generated-file changes can reload an active run.

## S4 result matrix

See [S4 implementation, commands and evidence](../../../docs/s4-evaluation.md) for the shooter tasks, matrix configuration, metrics and same-board 128/512 experiment. `npm run test:s4` runs deterministic checks; `npm run eval:s4 -- --run --matrix scripts/evaluation/s4-matrix.example.json` explicitly makes real provider requests. Use exact model IDs/endpoints and independent credential environment variables. Unconfigured rows are `not_run`; provider failures remain errors.

Real-model gameplay, cross-provider comparison and image recognition effects have not been validated. The initial Kimi configuration returned a subscription 403 and further comparisons were skipped. Scripted integration providers establish pipeline behavior only.
