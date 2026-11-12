---
name: pico8-playtest
description: Verify behavior with actual input and frames, including after creation or edits.
---

# Playtest

- Define the expected result and establish a reproducible start. Inspect the latest frame and diagnostics before sending more input.
- Pick inputs from the controls and timing. Batch up to 8 predictable steps, at most 600 total frames, and include a release when needed. Input returns only the final frame by default. Optional captureFrames accepts up to 7 strictly increasing cumulative offsets within that call; the final frame is always included. Request checkpoints only when they prove a transition, collision or separate outcome. If the next action depends on the result, use a separate call.
- Check execution.completedFrames and outcome. Match evidence to the current cart revision and runtime frame. Load, reset and input already return PNG. Use observe_game for a specific unresolved view.
- Exercise each requested main mechanic and the applicable success, failure and retry paths. Verify that retry restores the playable state, including relevant counters or collectibles. A focused edit only needs checks for the changed behavior and nearby effects. Use /extensions/pico8/references/playtest.md for input and observation details.
- For a newly created short finite game, verify the final committed version from its normal start through completion and retry. A temporary invulnerability, teleported player or prefilled inventory can isolate a bug, but restoring the source invalidates that evidence as a full normal playthrough. Reuse a known successful input route when appropriate, with its start assumptions and cart revision; stop and inspect if it diverges. Report a coverage gap if the full route was not verified.
- During a visual or gameplay check, inspect whether the player, usable targets, goal and feedback are distinguishable in the actual frame. Try a plausible first action without relying on hidden source knowledge. Identify a concrete problem before changing art or adding mechanics. Functional checks do not establish enjoyment, art quality or audible mixing.
- If a repair is in scope, follow the active create skill or read the edit skill, then retest the affected sequence. For a test-only request, report findings and reproduction steps. Separate observed results from inference and untested behavior.
