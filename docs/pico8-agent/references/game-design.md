# Designing a small PICO-8 game

Make the objective and first action visible. Teach a mechanic in a forgiving situation, then vary and combine it. Use distinct visuals for warning, damage, reward and recovery. Keep essential cues readable with audio muted.

For an open-ended request, choose one clear experience before expanding content. What action repeats? What does the player decide, learn or express? What changes after a short round? A choice needs an observable consequence; three collectible colors with the same action do not by themselves create three mechanics. Respect games whose appeal is relaxed exploration, rhythm or expression instead of adding compulsory hazards.

| Design problem | Try this | Verify |
| --- | --- | --- |
| Precision movement | Give edge jumps a short grace period and buffer a jump just before landing. Teach on a safe platform before adding risk. | Replay edge and landing inputs. Check intended jumps and accidental triggers. |
| Telegraphing attacks | Lock the threatened region during a visible warning. Leave enough time to reach safety and expose a recovery opening. | Compare the cue and hit area. Try escape, staying in danger and using the opening. |
| Turn decisions | Resolve hazards and resource costs once per valid action. Show the next danger and which actions consume a turn. | Test movement, waits, blocked moves and idle. Confirm exhaustion and success precedence. |
| Optional risk | Provide an affordable direct route and a detour with a visible cost and reward. Define when the reward is banked. | Compare completion, remaining resources and banked reward across routes. |
| Collect and build | Make one collection trip visibly change the construction. If route planning fits the request, a shared carrying limit or differently located resources can create a choice. Add one such constraint at a time. | From empty inventory, collect, return, deposit and see the result. Compare the proposed routes: does the constraint actually change the player's decision? Check pickup range and source-to-inventory type mapping. |
| Feedback | Keep the player, goal and current state distinguishable at 128×128. Make restart clear. | Check a representative success, failure and retry using actual inputs. |

## Inspect the first playable loop

Use a small representative scene and actual input before making a large map or many variants. Check these concrete signs:

- The character silhouette, usable target and goal stand out from the background at the native resolution. Quiet the background or separate shapes before adding decoration.
- The first screen explains the immediate action. A useful prompt appears before the player has already discovered the action.
- An action has a visible response, and its result is legible: pickup disappears, inventory changes, delivery changes the construction, or a hazard resolves as signaled.
- The next action follows from the new state. If every trip is identical, either embrace a brief relaxing loop or introduce one relevant choice; do not lengthen the task by adding counters.
- Event sounds have a role and share the four channels deliberately. Inspect authored audio and triggers; ask for listening feedback rather than claiming a musical result from slot data.

Fix an observed problem, replay that moment, then finish the requested scope. These are design hypotheses and checks, not a fun score or a requirement to add every pattern.

/extensions/pico8/references/microgames.md links to Spring Courier, Signal Arena and Lantern Vault. Use a matching example when a runnable implementation helps. Try ordinary input and any obvious idle or spam strategy that might bypass the main challenge. Player feedback is needed to judge whether a successful run is enjoyable.
