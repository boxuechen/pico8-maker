# Designing a small PICO-8 game

Make the objective and first action visible. Teach a mechanic in a forgiving situation, then vary and combine it. Use distinct visuals for warning, damage, reward and recovery. Keep essential cues readable with audio muted.

| Design problem | Try this | Verify |
| --- | --- | --- |
| Precision movement | Give edge jumps a short grace period and buffer a jump just before landing. Teach on a safe platform before adding risk. | Replay edge and landing inputs. Check intended jumps and accidental triggers. |
| Telegraphing attacks | Lock the threatened region during a visible warning. Leave enough time to reach safety and expose a recovery opening. | Compare the cue and hit area. Try escape, staying in danger and using the opening. |
| Turn decisions | Resolve hazards and resource costs once per valid action. Show the next danger and which actions consume a turn. | Test movement, waits, blocked moves and idle. Confirm exhaustion and success precedence. |
| Optional risk | Provide an affordable direct route and a detour with a visible cost and reward. Define when the reward is banked. | Compare completion, remaining resources and banked reward across routes. |
| Feedback | Keep the player, goal and current state distinguishable at 128×128. Make restart clear. | Check a representative success, failure and retry using actual inputs. |

/extensions/pico8/references/microgames.md links to Spring Courier, Signal Arena and Lantern Vault. Use a matching example when a runnable implementation helps. Try ordinary input and any obvious idle or spam strategy that might bypass the main challenge. Player feedback is needed to judge whether a successful run is enjoyable.
