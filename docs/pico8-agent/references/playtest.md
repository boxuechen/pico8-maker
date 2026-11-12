# Gameplay observation reference

Observation formats, frame identity and evidence limits for the PICO-8 host. The pico8-playtest skill owns the task workflow; consult this reference for a specific observation question. A completed operation or successful compile is not gameplay verification.

## Input sequences and execution evidence

press_buttons({frames:30,buttons:2}) holds one mask. Batch up to 8 logical steps and 600 total frames. tap:true adds one release frame before and after a step; both count toward the limit. Otherwise no releases are inserted. For two separate picks use {steps:[{frames:1,buttons:16,tap:true,capture:true},{frames:1,buttons:16,tap:true}]}. This executes 6 frames and returns checkpoints at 3 and 6. Execution lists the expanded held/released steps.

By default only the final frame returns a PNG. capture:true samples a step end, including its tap release. For a specific intermediate moment, captureFrames:[3,8] uses cumulative offsets including releases. At most 8 distinct frames including the final frame are returned. A sequence stops on runtime stop/fault/session replacement/interruption. The first header includes execution with requestedFrames/completedFrames/outcome and executed steps. Each PNG has checkpoint {step,afterFrames}; step is the 1-based expanded input step. Later steps after a stop did not run. A fault may leave the last successful frame, not the faulting draw.

## Recorded routes

Load/reset starts a recorded run tied to the complete cart's SHA-256 and revision. reset_game({purpose:"normal"}) or {purpose:"debug"} declares the starting assumptions; the host cannot infer whether authored rules are normal. Read /cart/playtests.json for the compact index, then its run path for inputs and frame hashes. PNGs remain in the transcript. The last 12 runs retain up to 128 calls each; truncation is explicit. Restoring a chat does not restore the test runtime.

To recheck an earlier route: reset_game({purpose:"normal"}), then press_buttons({replay:{run:"r1",call:0}}), followed by call 1, etc. Each call remains within ordinary input bounds and returns fresh evidence. Ordinary input breaks this sequence. Replay uses the current committed cart, not the old source. sameCart and matchesRecordedFrame report exact comparisons, not win/loss, completeness or quality. Inspect changes before continuing; random timing or retained cartdata can also cause divergence. Faulted or partial calls are not replayed automatically.

Frame cpuInstructions and slowFrame are the current WASM runtime's measurements for that completed frame. They are not aggregate batch statistics or official PICO-8 CPU percentages. Load/reset also report their startup advance progress. Observation alone never executes another frame. Batch only inputs known in advance; use separate calls when the next action depends on what happens.

| Feature | Useful evidence |
| --- | --- |
| Sprite | Correct pixels, transparency, animation and movement alignment |
| Map | Wall blocking, reachability, collectible removal and count |
| SFX | Authored slot data from read_assets and trigger/channel logic from source; audio output is unverified by this host |
| Music | Authored patterns and source playback/loop logic; audible progression and mixing are unverified by this host |
| Save | Visible saved value after the specific tested restart/reload lifecycle, when the game exposes it |

PNG is the default for overall appearance and layout. observe_game accepts format "png", "ascii" or "both" and an optional region {x,y,width,height}. Other game tools still return PNG. Prefer a small ASCII crop for exact pixel inspection; full-screen ASCII is available but is not automatically cheaper or easier for the model than PNG.

Examples:

```json
{"format":"ascii","region":{"x":40,"y":56,"width":16,"height":16}}
```

```json
{"format":"both","region":{"x":0,"y":112,"width":128,"height":16}}
```

An empty argument object returns the full PNG. Omitting region returns the full 128x128 screen for any format. Coordinates are absolute screen pixels: origin at the top left, x increases right, y increases down. All region fields are required integers; width/height must be positive and the complete rectangle must fit on screen. Invalid crops are rejected rather than clipped.

ASCII uses encoding pico8-slots-v1: exactly width characters per row and height rows, with one character per pixel, from top to bottom and left to right. Characters 0-f are framebuffer slots after draw remapping, before display remapping; they need not match the original drawing arguments. Each result includes all 16 actual frame display colors, with English names, RGB values and display codes. pal(slot,code,1) can change these colors, including extended colors 128-143. Slot 0 is a visible color, not blank/transparent space. Distinct slots can have identical display colors. Color alone does not label game objects or prove collision behavior.

both derives PNG and ASCII from one snapshot and the same crop, without resampling. Compare the sessionId, generation, revision and frameId in the result header. A new Worker can have no completed frame: explicitly reset_game or press_buttons to establish one. Repeated observation does not run another frame. The host may initialize the Worker and pause live playback, so observation remains an unsafe-to-replay tool.

Full-screen pixel text is bounded separately from read. A diagnostic overflow is marked diagnosticsTruncated; a pixel matrix is never silently shortened. Historical ASCII is saved as past evidence, not restored machine state. After refresh, cancellation or reload, establish a new baseline before combining observations.

Separate observed pixels from source inference. Do not claim a hidden velocity or variable was measured without a tool/diagnostic exposing it. Manual test and live player instances have separate state.

Current model tools do not return audio. Local PCM checks do not prove subjective listening quality. Report only the persistence lifecycles actually tested. After cancellation or worker recreation, establish a new baseline rather than replaying unknown-outcome inputs.
