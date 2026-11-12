# Paired game-quality evaluation

Status: planned; no model-generation comparison or human enjoyment study has been run. Runtime checks and source analysis are available now. Do not report their pass counts as evidence of increased fun.

## Question and conditions

Does access to the design guide, four cases, eight patterns and three original microgames improve the games produced by the same model and tools?

- A: existing machine/API/palette/asset-recipe pack and pre-design AGENT rules.
- B: current pack including the new design references and routing rule.
- Keep application, player, model snapshot, provider settings, task wording, time/token/tool limits and tool schemas identical. Remove new IDs from A's reference index and tool results, not just its prompt. Preserve the same PNG/ASCII observation tools in both.
- Record both exact pack hashes and source revisions. Generate each game in a fresh conversation with no prior outputs or cached case references. Do not let A read the repository's B documents through another tool.
- Use tasks in evaluation-tasks.json unchanged. Start with three runs per task/condition (36 games), paired by task and run index; record seeds when the provider supports them. This is a pilot, not a statistically powered universal claim.
- Set an identical explicit budget before starting (suggested pilot ceiling: 12 minutes, 20,000 total model input/output tokens and 80 tool calls per game). Stop at the first reached limit and retain unfinished outputs. Actual usage and timeout behavior must be recorded.

## Record and review

Save prompt, model ID/version/settings, pack version, tools, timestamps, token/cost totals, source/export, diagnostics, observation/input traces and generated assets for every attempt. Never store API keys. Freeze each output before review; repairs after the budget are separate runs.

First check startup, main action, reachable success, meaningful failure, restart and export reload. Apply a sensible policy and a deliberately poor policy. Mark untested properties unknown; a scripted failure does not prove all winning paths absent. Keep objective criteria separate from subjective scores.

Then randomize anonymous A/B order. At least three human reviewers play each pair under the same time allowance (suggested 5 minutes per game), with sound available, before discussing it. Do not expose treatment, reference names or generation logs. Use a declared tie option. Each reviewer records:

| Dimension | Question | Score anchors |
| --- | --- | --- |
| Clarity | Can I identify the goal and explain failure? | 1 confused; 3 mostly clear; 5 immediately clear |
| Control | Do actions respond predictably? | 1 unreliable; 3 usable; 5 precise and forgiving as intended |
| Choice | Do my decisions or execution matter? | 1 trivial/arbitrary; 3 some tradeoff; 5 repeated meaningful choices |
| Pacing | Does challenge develop without excessive downtime? | 1 stalled/spiky; 3 uneven but playable; 5 coherent |
| Presentation | Do art and sound communicate the game coherently? | 1 obstructive; 3 readable; 5 clear and consistent |
| Replay interest | Do I want another attempt? | 1 no; 3 perhaps; 5 yes |

Also ask pairwise preference (left/right/tie), one observed frustration and one reason to replay. Primary outcome: preference among playable pairs, with ties reported separately. Report completion rate for all attempts alongside it so failed generations cannot disappear. Show per-task results and reviewer disagreement; do not collapse everything into one unexplained "fun score".

## Interpretation

Compare completion, preference, clarity/control and budget use together. More polished screenshots alone do not establish gameplay improvement. Investigate whether B merely produces the same three examples repeatedly: record overlap in rules, layout and assets, especially on transfer tasks. A reference pack that raises success while reducing variety needs revision.

Publish anonymized outputs and the evaluation protocol with any claim, noting the small sample, task selection and model dependence. Do not tune on these six tasks and then present the same set as unseen validation; add a held-out set for follow-up work.
