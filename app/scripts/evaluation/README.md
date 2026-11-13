# PICO-8 Agent evaluation

## Open-ended case study

Open `/scripts/evaluation/case-study.html` locally for the Lodge Podge experiment. This uses the same Agent, knowledge and saved provider configuration with a disposable cart. Send the initial request, then follow-up feedback in the same session. Each turn has a 15-minute timeout and no tool-call limit. It archives the original prompts, transcript, committed revisions, draft and separate evaluator inputs through the loopback recorder. It does not write to the user's cart library or score fun automatically. The page is a local research tool, not a production entry point.

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

P0–P2 integration evidence lives in `.cache/p0-p2/`: the unmodified Sweet Garden and Lodge Podge carts were recorded and replayed through `Game.execute`, with all 44 and 34 call-end frame hashes matching respectively. Browser QA used the explicit local fixture to check before/current preview, persistence and restoration before read-only feedback. This batch did not rerun unrestricted real-model creation or human enjoyment tests.

## Historical results before S3

These batches used the former skill-routing implementation and its checks. They are preserved historical evidence, not results for the current startup Workflow.

| Batch | Saved configuration | Result |
| --- | --- | --- |
| Initial skill routing | DeepSeek Flash, high | 7/12 checks passed. Five action attempts missed a required skill. |
| Revised skill routing | DeepSeek Flash, high | 12/12 checks passed. All ten action attempts read the required skills. |
| Tool improvements | DeepSeek Flash, high | 12/12 checks passed. 28 input calls ran 54 steps, with four resource PNG previews. |
| Leaner knowledge | DeepSeek Flash, high | 12/12 checks passed. Resource inventory reads fell from 11 to zero. |
| Unified workflow, first pass | DeepSeek Flash, high | 12/12 original checks passed; 11/12 with the added resource-skill check. One creation edited audio without reading assets. |
| Unified workflow, explicit resource routing | DeepSeek Flash, high | 12/12 checks passed, including reading assets before resource edits. No tool errors. |
| Small mechanics | DeepSeek Flash, high | 6/6 checks passed across jump, enemy and map, twice each. 80 tool calls, no tool errors. |

The samples use the same fixed prompts and one provider. Tool call counts reflect the generated games and the model's decisions. Human gameplay quality and cross-model reliability require separate evaluation.

## Small-game improvements validation

Completion guidance now covers each requested main mechanic and applicable success, failure and retry paths, with focused checks for focused edits. It does not require a separate planning document.

The small mechanics batch passed all named pixel and scope checks in six attempts using DeepSeek Flash with high thinking. Each attempt read edit and playtest, used actual input, and preserved authored resources. Report: `.cache/evaluations/skills-f8d907bf-4afd-4e3e-8311-84ecb4be487e/report.json`. These are small repair fixtures and one model configuration, not an unrestricted creation-quality benchmark or a Codex comparison.

Validation: 98 automated tests, production build and four Sites checks passed. Browser QA with `fixture-draft` confirmed shared Code/Resources selection, corresponding source/resource content and code budgets, inspectable failed drafts, and continued playback of the committed green-sprite cart. Switching from committed inspection to a new empty cart restored draft selection with no committed option. The local fixture's deliberate Lua load failure is expected and separate from the real-model batch's zero tool errors.

## Unified workflow validation

Source reads now use `read` with draft status, budget and pagination; the model has eight tools instead of nine. Input sequences return only the final PNG unless checkpoints are requested. Create covers its own repair loop, and nested asset work shares the main task's load/commit.

| Batch | Tool calls | Returned images | Tool errors |
| --- | ---: | ---: | ---: |
| Leaner knowledge baseline | 116 | 90 | 1 |
| Unified workflow, first pass | 107 | 85 | 2 |
| Unified workflow, explicit resource routing | 101 | 76 | 0 |

The final batch reduced calls by 12.9% and images by 15.6% against the baseline in these twelve samples. This is an observed batch comparison, not a controlled estimate of general savings: generated games, repairs and selected checkpoints vary. A deterministic WASM regression separately confirms that the same three-step input returns one default image instead of three while preserving final pixels, input timing and execution progress. Explicit checkpoints and early-stop evidence remain covered.

The first pass exposed an existing evaluator gap: fixed create checks did not require assets when a generated game called `edit_assets`. That historical evaluator checked for a successful assets skill read before the first resource edit, including within create tasks; missing, failed and late reads fail. Rechecking the baseline also finds this violation in `create-2`, so its historical 12/12 result is not a pass under the expanded checks. The final batch's second creation read assets before editing sprites, loaded source and resources together, and repaired the game without loading edit.

Archived reports:

- First pass: `.cache/evaluations/skills-880087ab-b7b8-4260-b6fd-39bd3035b67c/report.json`. Preserve its two recovered tool errors and resource-routing failure.
- Interrupted attempt: `.cache/evaluations/skills-7c825e50-81bf-4951-bbd8-14bdbf31aa8d/report.json`. Build-time file generation triggered a development-page reload before any case completed; this is not a completed evaluation. The original partial report is retained.
- Final batch: `.cache/evaluations/skills-b888f494-1a89-46f6-b6f5-2ebc61a0a0ce/report.json`.

Validation: 95 automated tests, production build and four Sites checks passed. The browser preview loaded without reported console errors. Finish builds before starting the browser evaluator so generated-file changes cannot reload an active run.

## Earlier knowledge-size comparison

The leaner pack publishes 29 files and 63,713 bytes, down from 42 files and 113,294 bytes. For the same sample cart with stale evidence, startup sections total 3,366 bytes, down from 9,621. Serialized tool definitions total 8,530 bytes, down from 11,247. These are UTF-8 measurements before provider formatting.

Against the tool-improvements batch, total tool calls rose from 100 to 116 and returned images from 81 to 90. The creation attempts used more load and playtest iterations. The smaller startup payload and fewer inventory reads did not lower aggregate image traffic in this batch. The local transcript is in `.cache/evaluations/skills-1e46413e-94f3-45ae-aaa1-9af2214b015c/report.json`.

Detailed historical reports, raw screenshots and the retired comparison scripts remain at commit `5d7bb30`. For example, retrieve the most recent report with the following command.

```sh
git show 5d7bb30:docs/pico8-agent/research/runs/2026-11-13-tools/README.md
```

## Tooling baseline and outcome metrics

See [the frozen baseline](../../../docs/tooling-progress.md). `transcriptMetrics().outcomes` counts unique tool-call IDs, UTF-8 result bytes, PNG dimensions, errors and first successful load. Gameplay coverage remains unknown without verifier evidence. Current scope checks use `workflow-scope`; obsolete skill-read requirements and catalog metrics have been removed. Historical archives remain unchanged. Recheck archived metrics with `node scripts/evaluation/freeze-tooling-baseline.mjs --check` from `app/`.


## S3 targeted checks

`tests/workflow.test.mjs` runs the published MACHINE skeleton in real WASM, then a scripted provider through the real Agent/tool loop. It checks authoring as the first operation, normal victory/retry, complete ordered startup bodies, real Pi compaction and restored context, and a changing project suffix. This is an integration fixture, not a paid model result or a measure of autonomous gameplay quality. Compiler tests reject missing Workflow sections, broken links, wrong language, incorrect startup order and stale Lua receipts. The wider S4 result/model matrix remains pending.
