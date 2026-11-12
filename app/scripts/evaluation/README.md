# PICO-8 Agent evaluation

Open `/evaluation.html` on the same local development origin as the app. The evaluator uses the browser's saved model configuration, makes normal provider requests, and tests six fixed tasks twice with disposable carts. It records tool use, skill selection, scope preservation and fixture movement. Review creation gameplay with the returned frames. Compaction tests use declared synthetic history and real provider summarization.

The evaluator has a 180-second and 40-tool budget per attempt. Its loopback recorder saves reports and execution snapshots under `.cache/evaluations/skills-<id>/`. Preserve failed attempts and report the scope of each check. Deterministic evaluator tests are part of `npm test`.

## Recorded results

| Batch | Saved configuration | Result |
| --- | --- | --- |
| Initial skill routing | DeepSeek Flash, high | 7/12 checks passed. Five action attempts missed a required skill. |
| Revised skill routing | DeepSeek Flash, high | 12/12 checks passed. All ten action attempts read the required skills. |
| Tool improvements | DeepSeek Flash, high | 12/12 checks passed. 28 input calls ran 54 steps, with four resource PNG previews. |
| Leaner knowledge | DeepSeek Flash, high | 12/12 checks passed. Resource inventory reads fell from 11 to zero. |

The samples use the same fixed prompts and one provider. Tool call counts reflect the generated games and the model's decisions. Human gameplay quality and cross-model reliability require separate evaluation.

The leaner pack publishes 29 files and 63,713 bytes, down from 42 files and 113,294 bytes. For the same sample cart with stale evidence, startup sections total 3,366 bytes, down from 9,621. Serialized tool definitions total 8,530 bytes, down from 11,247. These are UTF-8 measurements before provider formatting.

Against the tool-improvements batch, total tool calls rose from 100 to 116 and returned images from 81 to 90. The creation attempts used more load and playtest iterations. The smaller startup payload and fewer inventory reads did not lower aggregate image traffic in this batch. The local transcript is in `.cache/evaluations/skills-1e46413e-94f3-45ae-aaa1-9af2214b015c/report.json`.

Detailed historical reports, raw screenshots and the retired comparison scripts remain at commit `5d7bb30`. For example, retrieve the most recent report with the following command.

```sh
git show 5d7bb30:docs/pico8-agent/research/runs/2026-11-13-tools/README.md
```
