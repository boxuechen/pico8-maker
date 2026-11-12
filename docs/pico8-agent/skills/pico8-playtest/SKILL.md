---
name: pico8-playtest
description: Verify behavior with actual input and frames, including after creation or edits.
---

# Playtest

- Define the expected result and establish a reproducible start. Inspect the latest frame and diagnostics before sending more input.
- Pick inputs from the controls and timing. Batch predictable steps and include a release when needed. Input returns only the final frame by default. Request intermediate captureFrames only when they prove a transition, collision or separate outcome. If the next action depends on the result, use a separate call.
- Check execution.completedFrames and outcome. Match evidence to the current cart revision and runtime frame. Load, reset and input already return PNG. Use observe_game for a specific unresolved view.
- Exercise each requested main mechanic and the applicable success, failure and retry paths. Verify that retry restores the playable state, including relevant counters or collectibles. A focused edit only needs checks for the changed behavior and nearby effects. Use /extensions/pico8/references/playtest.md for input and observation details.
- If a repair is in scope, follow the active create skill or read the edit skill, then retest the affected sequence. For a test-only request, report findings and reproduction steps. Separate observed results from inference and untested behavior.
