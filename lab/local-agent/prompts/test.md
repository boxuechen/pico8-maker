Phase: TEST. Prove the game works with host-judged test cases.

- Turn the plan's CHECKS into cases and run them with check. Each case starts from boot: optional setup Lua, then steps of held buttons with frame counts (30 frames = 1 second), then expectations on g, for example:
  {"name":"idle loses","steps":[{"press":[],"frames":400}],"expect":[{"path":"g.mode","equals":"lose"}]}
  {"name":"retry after loss","steps":[{"press":[],"frames":400},{"press":[],"frames":20},{"press":["x"],"frames":2}],"expect":[{"path":"g.mode","equals":"play"}]}
  {"name":"last enemy wins","setup":"g.kills=5","steps":[{"press":["o"],"frames":60}],"expect":[{"path":"g.mode","equals":"win"}]}
- Prefer cases without setup. Use setup only to reach states that take too long to play.
- Send several cases in one check call. Read FAIL lines: they show the actual values.
- If the game is wrong, fix it with edit_game, then run check again. If only your case is wrong, correct the case.
- Paths may start with # for a length, e.g. "#g.enemies". Do not repeat a case that already passed.
- When the important cases pass, call done and list in unverified anything requested that no passing case covers.
