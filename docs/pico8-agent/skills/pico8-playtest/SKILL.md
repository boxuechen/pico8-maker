---
name: pico8-playtest
description: Verify a PICO-8 game or a focused change through actual inputs, screenshots and diagnostics. Use after implementation or for a standalone testing request.
---

# Playtest a PICO-8 game

## Establish the check

Define the unresolved behavior, expected visible result and a reproducible start. Inspect the latest load/input frame and diagnostics. After restore or Worker recreation, establish a new baseline before testing; never replay interrupted input with an unknown outcome.

## Exercise representative states

- Check the first actionable screen and main player action. Sample an outcome or retry relevant to the request. For a focused edit, test the changed behavior and nearby effects.
- Use returned PNGs to judge gameplay, sprite alignment, feedback and HUD readability. Read /extensions/pico8/references/playtest.md only when observation formats, pixel crops, frame identity or persistence details need clarification.
- Choose input sequences from the source's controls, timing and geometry. Use short batches near collisions/transitions, longer batches for predictable waiting/movement, and release buttons between distinct presses.
- When the next inputs are already known, send one press_buttons steps array and inspect its checkpoints. Use captureFrames for an intermediate movement/collision sample; offsets are relative to the call, and the final frame is included. Keep adaptive decisions as separate calls. Check execution.completedFrames and outcome before claiming all steps ran; an early stop/fault skips later steps. Each capture identifies its step and actual frame offset.
- Frame cpuInstructions and slowFrame describe only the latest completed frame in this WASM implementation. They are diagnostic hints, not a whole-sequence performance profile or official PICO-8 CPU measurement.
- When relevant to the requested core loop, check goal reachability, resource accounting, and whether doing nothing or repeatedly pressing one button bypasses the challenge. Select the checks that apply; a focused edit does not require restarting every passed gameplay check.
- Associate evidence with cart.observed.cartRevision and the runtime sessionId/generation/revision/frameId. cart.draftSourceBudget describes the working draft; a failed-draft observation is not evidence of a committed playable update.
- load_game, reset_game and press_buttons already return PNG. observe_game does not advance time; repeating it cannot verify waiting or landing. Request a crop or alternate format only for a specific unresolved visual question.

## Repair or finish

Investigate concrete failures using current source and evidence. If a repair is in scope, use /extensions/pico8/skills/pico8-edit/SKILL.md and retest the affected sequence. A testing-only request should report findings with reproduction steps rather than silently edit the game. These skill references do not restart the task or require rereading instructions already available.

Once the requested checks pass, stop and report. Do not collect every item, beat every level, or retest passed behavior unless requested. Repeated attempts without useful evidence call for source inspection or a changed test setup. If the available tools cannot resolve a blocker, end with an honest partial-result report. Separate observed behavior, source-based reasoning and untested areas; never claim audio listening or hidden-variable measurements this host cannot supply.
