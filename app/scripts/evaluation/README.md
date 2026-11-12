# PICO-8 Agent evaluation

Open `/evaluation.html` on the same local development origin as the app. The evaluator uses the browser's saved model configuration, makes normal provider requests, and tests six fixed tasks twice with disposable carts. It records tool use, skill selection, scope preservation and fixture movement. Review creation gameplay with the returned frames. Compaction tests use declared synthetic history and real provider summarization.

The evaluator has a 180-second and 40-tool budget per attempt. Its loopback recorder saves reports and execution snapshots under `.cache/evaluations/skills-<id>/`. Preserve failed attempts and report the scope of each check. Deterministic evaluator tests are part of `npm test`.

## Recorded results

| Batch | Saved configuration | Result |
| --- | --- | --- |
| Initial skill routing | DeepSeek Flash, high | 7/12 checks passed. Five action attempts missed a required skill. |
| Revised skill routing | DeepSeek Flash, high | 12/12 checks passed. All ten action attempts read the required skills. |
| Tool improvements | DeepSeek Flash, high | 12/12 checks passed. 28 input calls ran 54 steps, with four resource PNG previews. |

The samples use the same fixed prompts and one provider. Tool call counts reflect the generated games and the model's decisions. Human gameplay quality and cross-model reliability require separate evaluation.

Detailed historical reports, raw screenshots and the retired comparison scripts remain at commit `5d7bb30`. For example, retrieve the most recent report with the following command.

```sh
git show 5d7bb30:docs/pico8-agent/research/runs/2026-11-13-tools/README.md
```
