# Gameplay observation reference

Observation formats, frame identity and evidence limits for the PICO-8 host. The pico8-playtest skill owns the task workflow; consult this reference for a specific observation question. A completed operation or successful compile is not gameplay verification.

## Input sequences and execution evidence

press_buttons({steps:[{frames:30,buttons:2}]}) holds one mask. Batch up to 8 logical steps and 600 total frames. tap:true adds one release frame before and after a step; both count toward the limit. Otherwise no releases are inserted. For two separate picks use {steps:[{frames:1,buttons:16,tap:true,capture:true},{frames:1,buttons:16,tap:true}]}. This executes 6 frames and returns checkpoints at 3 and 6. Execution reports actual completed frames; expanded steps are included only when execution stops early.

By default only the final frame returns a PNG. capture:true samples a step end, including its tap release. For an intermediate moment, split the held input into steps and mark the desired step capture:true; repeating a button mask does not release it. At most 8 distinct frames including the final frame are returned. A sequence stops on runtime stop/fault/session replacement/interruption. The first header includes execution with requestedFrames/completedFrames/outcome; an incomplete execution also lists executed steps. Each PNG has checkpoint {step,afterFrames}; step is the 1-based expanded input step. Later steps after a stop did not run. A fault may leave the last successful frame, not the faulting draw.

## Recorded routes

Load/reset starts a recorded run tied to the complete cart's SHA-256 and revision. reset_game({purpose:"normal"}) or {purpose:"debug"} declares the starting assumptions; the host cannot infer whether authored rules are normal. Read /cart/playtests.json for the compact index, then its run path for inputs and frame hashes. PNGs remain in the transcript. The last 12 runs retain up to 128 calls each; truncation is explicit. Load/reset creates a fresh test session and clears test memory saves. The purpose defaults to normal; use debug for altered rules or progress. Version 3 records contain steps and up to 32 debug events; old record formats are not loaded. Restoring a chat does not restore the test runtime.

To recheck an earlier route, reset_game({purpose:"normal"}), read its recorded steps, and submit those steps as ordinary press_buttons calls. Inspect each result before continuing. The current committed cart may differ from the recorded source.

cpuInstructions and optional slowFrame are the current WASM runtime's measurements for that completed frame. They are not aggregate batch statistics or official PICO-8 CPU percentages. Load/reset also report their startup advance progress. Observation alone never executes another frame. Batch only inputs known in advance; use separate calls when the next action depends on what happens.

| Feature | Useful evidence |
| --- | --- |
| Sprite | Correct pixels, transparency, animation and movement alignment |
| Map | Wall blocking, reachability, collectible removal and count |
| SFX | Authored slot data from read_assets and trigger/channel logic from source; audio output is unverified by this host |
| Music | Authored patterns and source playback/loop logic; audible progression and mixing are unverified by this host |
| Save | Visible saved value after the specific tested restart/reload lifecycle, when the game exposes it |

PNG is the default for overall appearance and layout. observe_game accepts format "png", "ascii" or "both" and an optional region {x,y,width,height}. Load/reset/input also return PNG; inspect_game returns state text. Prefer a small ASCII crop for exact pixel inspection; full-screen ASCII is available but is not automatically cheaper or easier for the model than PNG.

Examples:

```json
{"format":"ascii","region":{"x":40,"y":56,"width":16,"height":16}}
```

```json
{"format":"both","region":{"x":0,"y":112,"width":128,"height":16}}
```

An empty argument object returns the full PNG. Omitting region returns the full 128x128 screen for any format. Coordinates are absolute screen pixels: origin at the top left, x increases right, y increases down. All region fields are required integers; width/height must be positive. Regions are clipped to their intersection with the screen; the result reports the actual region. Non-integer fields, non-positive sizes and regions entirely outside the screen are rejected before execution.

ASCII uses encoding pico8-slots-v1: exactly width characters per row and height rows, with one character per pixel, from top to bottom and left to right. Characters 0-f are framebuffer slots after draw remapping, before display remapping; they need not match the original drawing arguments. Each result includes all 16 actual frame display colors, with English names, RGB values and display codes. pal(slot,code,1) can change these colors, including extended colors 128-143. Slot 0 is a visible color, not blank/transparent space. Distinct slots can have identical display colors. Color alone does not label game objects or prove collision behavior.

both derives PNG and ASCII from one snapshot and the same native crop. Model PNGs use 4x nearest-neighbor enlargement (512x512 for a full frame); ASCII and all coordinates stay at native resolution. Match evidence using committedRevision, run, frameId and stateSeq in the result header. A multi-image result carries shared metadata once and then per-image checkpoints. stateSeq advances with completed frames and debug attempts; frameStateSeq identifies an older frame after a debug attempt; observing alone keeps it unchanged. A new Worker can have no completed frame: explicitly reset_game or press_buttons to establish one. Repeated observation does not run another frame. The host may initialize the Worker and pause live playback, so observation remains an unsafe-to-replay tool.

Full-screen pixel text is bounded separately from read. A diagnostic overflow is marked diagnosticsTruncated; a pixel matrix is never silently shortened. Historical ASCII is saved as past evidence, not restored machine state. After refresh, cancellation or reload, establish a new baseline before combining observations.

Separate observed pixels from source inference. Do not claim a hidden velocity or variable was measured without a tool/diagnostic exposing it. Manual test and live player instances have separate state.

Current model tools do not return audio. Local PCM checks do not prove subjective listening quality. Report only the persistence lifecycles actually tested. After cancellation or worker recreation, establish a new baseline rather than replaying unknown-outcome inputs.

## Console logs

Use printh(value) for concise game-state diagnostics. Load/reset/input/observe return newly available logs in a separate text block, without repeating already delivered entries. Each entry has sequence, attempted frameId (null during boot), text and truncated; dropped counts entries evicted before delivery. The buffer keeps at most 64 entries / 8 KiB of raw text, with 1 KiB per entry. Non-ASCII P8 bytes are escaped as \xNN. A logged frame may fail before committing; inspect runtime diagnostics separately. Load/reset starts a new buffer. Filename arguments do not write files.


## State queries and debug checks

Read key state before choosing the next input: inspect_game({mode:"read",paths:[["g","board"],["g","moves"]]}). Paths start with a global name and continue through raw string or integer table keys. Query existing global names when a cart uses a different structure. Local variables and closure upvalues are unavailable. Reading does not execute Lua or trigger metatables. It does not advance time, input or random numbers.

Use inspect_game({mode:"debug",code:"g.moves=1; return g.moves"}) to set up a failure or boundary test without editing source. Every debug request marks the whole run debug before execution, even syntax failures. It never changes authored source/resources or the live player. The returned frameId still describes the old image; use press_buttons to render the next frame. Errors after execution begins can leave partial writes: reset_game before continuing. STOP and timeout also require a fresh baseline. After debug checks, use a fresh normal reset to verify the final core loop, completion and retry through ordinary input.

Values preserve booleans, numbers and strings. Nil and non-data values use type tags. Tables use {type:"table",entries:[{key:1,value:false}]} so sparse/numeric keys stay distinct from strings. Cycles and depth/entry/byte limits return explicit tags or truncated. Narrow the requested paths when a whole table is too large. At most 16 paths with 16 segments each, depth 4 and 512 total entries fit within 16 KiB. Keys are byte strings up to 128 bytes or signed 16-bit integers. Debug takes 1–4096 Lua bytes and at most 50,000 VM instructions; strings/code use code points 0–255, not Unicode glyph names. Lifecycle calls, flip/yield, external I/O and persistence writes are unavailable during debug. printh remains available for bounded diagnostics.
