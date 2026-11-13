---
name: pico8-playtest
description: Verify behavior with actual input and frames, including after creation or edits.
---

# Playtest

- Define the expected result. Use reset_game with purpose "normal" for a normal-start check or "debug" for modified progress/rules. This label is a declaration, not proof. Inspect the returned frame and diagnostics.
- Use inspect_game in read mode for counters, boards and other global state before choosing inputs. Use debug mode to inject boundary conditions without changing source; it marks the whole run debug. After an executed error or cancellation, reset before continuing. The next input renders changes; the previous image remains old evidence.
- Batch predictable inputs within the tool limits. Use tap:true for a distinct press (one release frame before and after), and capture:true on a step whose end proves a transition. The final frame is always returned. Use separate calls when the next action depends on the result; reuse the returned PNG before requesting another observation.
- Check execution.completedFrames and outcome. Match evidence to the current cart revision and runtime frame. Load, reset and input already return PNG. Use observe_game for a specific unresolved view.
- Exercise each requested main mechanic and the applicable success, failure and retry paths. Verify that retry restores the playable state, including relevant counters or collectibles. A focused edit only needs checks for the changed behavior and nearby effects. Use /extensions/pico8/references/playtest.md for input and observation details.
- For a newly created short finite game, verify the final committed version from normal start through completion and retry. Temporary invulnerability, teleports or prefilled progress isolate bugs but do not prove this route. Read /cart/playtests.json when reusing earlier inputs; reset, then submit recorded steps as ordinary input calls and inspect each frame. The current cart may differ. Report a coverage gap if the normal route remains unverified.
- During a visual or gameplay check, inspect whether the player, usable targets, goal and feedback are distinguishable in the actual frame. Try a plausible first action without relying on hidden source knowledge. Identify a concrete problem before changing art or adding mechanics. Functional checks do not establish enjoyment, art quality or audible mixing.
- If a repair is in scope, follow the active create skill or read the edit skill, then retest the affected sequence. For a test-only request, report findings and reproduction steps. Separate observed results from inference and untested behavior.
