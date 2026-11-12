---
name: pico8-playtest
description: Verify behavior with actual input and frames, including after creation or edits.
---

# Playtest

- Define the expected result and establish a reproducible start. Inspect the latest frame and diagnostics before sending more input.
- Pick inputs from the controls and timing. Batch predictable steps and include a release when needed. Set captureFrames:[] for a final-only check. Request intermediate frames only when they prove a transition, collision or separate outcome. If the next action depends on the result, use a separate call.
- Check execution.completedFrames and outcome. Match evidence to the current cart revision and runtime frame. Load, reset and input already return PNG. Use observe_game for a specific unresolved view.
- Exercise the requested action and a representative outcome or retry. A focused edit needs a focused regression check. Use /extensions/pico8/references/playtest.md for input and observation details.
- If a repair is in scope, read the edit skill and retest the affected sequence. For a test-only request, report findings and reproduction steps. Separate observed results from inference and untested behavior.
