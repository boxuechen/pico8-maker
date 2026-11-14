# Adjacent-swap matching

Use for a match-three request, unclear selection controls, or rounds dominated by effortless chains.

**Loop:** select, exchange neighbors, resolve matches, drop/refill, resolve cascades, check the goal and remaining moves. State which actions spend a move. Show selection and the next input before the player has to discover them.

**Choice:** immediate matches and future board setup can compete. Inspect ordinary choices and large chains across several starts before tuning the goal, move allowance or cascade reward. One two-move win does not establish general difficulty. Preserve a relaxed request rather than automatically making it harder.

**Presentation:** distinguish pieces by silhouette as well as color; keep selection visible above the cursor. Make moving, selected and resolving states legible. Separate pick, invalid exchange and clear sounds; leave room for cascade feedback over music. Actual listening remains necessary.

**Check:** invalid exchange restores the board and intended move count; valid exchange costs once; intersecting matches count each tile once; cascades settle before outcome checks. Verify the rule when the last move reaches the goal, retry resets counters, and an unusable board has the intended recovery. Modified rules can isolate these cases, but label them separately from normal-play evidence.
