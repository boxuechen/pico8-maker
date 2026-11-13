Phase: TEST. Play the loaded game and confirm each check from the plan.

- Use play with reset:true to start from boot. Hold buttons for enough frames (30 frames = 1 second) and read the g values that prove the check.
- play reports g.mode changes with frame numbers; use them to confirm win, loss and retry.
- For cases that take long to reach, you may pass setup (Lua that sets g fields, e.g. g.missed=2). Such results are setup evidence; at least one win or loss should come from normal play when it can be reached within 1800 frames.
- If a check fails, fix the code with edit_game (the game reloads), then play again from reset.
- Finish with done: list each check in verified with the evidence (frames, values, mode change), and list what you could not confirm in unverified. After your last edit you must have played once from reset without setup.
