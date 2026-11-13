# Input, state and observation examples

Follow the startup Workflow for test order and delivery. Use this reference for a specific tool question.

## Input and routes

```json
{"steps":[{"frames":1,"buttons":16,"tap":true,"capture":true},{"frames":20,"buttons":2}]}
```

press_buttons accepts only steps. Button masks: left 1, right 2, up 4, down 8, O/Z 16, X 32; add masks for combinations, use 0 to release. tap adds one release frame before and after its step. Without tap, consecutive identical masks remain held. Up to 8 steps and 600 total frames including releases; capture samples a step end, and the final frame always returns. Split a long hold to capture a transition without releasing. Execution reports completedFrames and outcome; partial execution includes executed steps. Stop/fault ends the sequence, so later steps may not run.

reset_game({purpose:"normal"}) starts a fresh route and clears test memory saves; normal is the default. Read /cart/playtests.json, then the selected run file to reuse earlier steps as ordinary input calls. Check the current revision before using old inputs. A declared debug purpose is useful for a cart with altered rules; inspect_game debug also marks the whole route automatically. Only fresh load/reset begins a new normal route.

## State and debug

```json
{"mode":"read","paths":[["g","mode"],["g","board"],["g","moves"]]}
```

inspect_game read follows raw global/table paths without executing Lua or metatables. Use the cart's actual global names. It cannot read local variables or closure upvalues. Values preserve booleans, numbers and byte strings; nil and non-data values have type tags such as {type:"nil"}. A complete 1..n sequence returns an array ([[1,2],[3,4]] for a 2x2 board) and a string-keyed table returns an object ({x:40,y:24}). Sparse, mixed or truncated tables return {type:"table",entries:[{key:1,value:false}]} to preserve their keys. Narrow paths if cycle/depth/entry/byte truncation obscures needed values. At most 16 paths, 16 segments per path, depth 4, 512 entries and 16 KiB output. String keys have at most 128 bytes; integer keys use signed 16-bit range.

```json
{"mode":"debug","code":"g.moves=1; return g.moves"}
```

Use debug to set up a failure or boundary case without editing source. Code and keys use Lua byte strings (code points 0–255); debug accepts at most 4096 bytes and 50,000 VM instructions. Lifecycle calls, flip/yield, external I/O and persistence writes are unavailable. printh remains available for concise diagnostics. Debug code that runs marks the route debug, even if it then errors; a compile error leaves the route and state unchanged. Executed errors may leave partial writes: read state to see them, then reset before more input or debug. STOP and timeouts also require reset.

Debug does not update or draw. After a debug write, results show staleFrame:true until press_buttons produces the next frame. Match evidence using revision, run and frameId, then use normal input to verify the final core loop, completion and retry independently of injection.

## Pictures and exact pixels

```json
{"format":"both","region":{"x":40,"y":56,"width":16,"height":16}}
```

observe_game reads the last completed frame without advancing. PNG is the default; ascii returns exact pixels, both returns matching text and image. Region coordinates remain native screen pixels with a top-left origin. Positive integer sizes are clipped to the screen intersection; the result reports the actual region. Fully outside or invalid rectangles are rejected. Model PNGs use nearest-neighbor ×4 (imageScale:4, 512x512 for the full screen); region coordinates and ASCII stay native, so divide positions seen in the image by 4. Load/reset/input already return PNGs; inspect_game returns state text.

ASCII encoding pico8-slots-v1 uses one character 0–f per framebuffer slot, with exactly width columns and height rows. Read the accompanying actual display palette: pal(slot,code,1) can change colors, including extended codes 128–143. Slot 0 is a visible screen color. Use small crops for pixel questions and raw state for board contents. After cancellation or conversation restore, establish a fresh baseline before combining evidence.

## Logs and limits

Use printh(value) for concise diagnostics. Tools return new logs separately, with sequence/frameId/text, truncated and dropped indicators. Load/reset clears the buffer; repeated observations do not repeat delivered logs. A logged frame may fault before committing: check runtime diagnostics and completedFrames too. Current tools return no audio; inspect authored sound data and code triggers, then list listening as unverified. Verify any required save lifecycle explicitly: test saves are separate from live play, and load/reset clears them.
