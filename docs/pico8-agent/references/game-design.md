# Designing a small game worth replaying

Start with one sentence: the player does ACTION to reach GOAL, while choosing between TRADEOFFS. Name the source of pressure and the feedback that makes progress visible. A functioning input loop is not enough; identify the decision a player will repeat.

## Build and critique loop

1. Pick a small scope: one main action, one challenge family and an explicit ending/retry. State what should be enjoyable as a hypothesis, not a proven fact.
2. Read one relevant case and one or two patterns. Use cases to understand tradeoffs, not to clone characters, maps or music. Read an original microgame recipe when a runnable starting point is useful.
3. Build a short complete loop with a visible objective, coherent art, event sounds, success/failure and immediate retry. Encode all assets in Lua initialization for this host.
4. Test a sensible policy, a deliberately poor policy, the failure path and restart. If waiting or holding one button always wins, determine whether that matches the intended game.
5. Identify the largest obstacle to the intended experience: unclear objective, unresponsive controls, unavoidable damage, trivial choice, long downtime or unreadable feedback. Change one relevant parameter, rerun the same test, then explore a fresh case.
6. Report what actually improved and what still needs human playtesting. Never convert successful compilation, screenshots, star rankings or model self-ratings into a claim that a game is fun.

## Select a reference

- Platforming precision: case/celeste-classic, pattern/forgiving-controls, recipe/spring-courier.
- Timing and attacks: case/just-one-boss, pattern/telegraph-attack-recovery, recipe/signal-arena.
- Turn decisions and routes: case/porklike, pattern/turn-economy, recipe/lantern-vault.
- Optional risk and information: case/high-stakes, pattern/risk-reward, pattern/information-before-commitment.
- Teaching and feedback: pattern/teach-vary-combine, pattern/event-feedback, pattern/resource-pressure.
- Example controls, parameters and design limits: guide/microgames.

## Assess the experience

Can a new player identify the objective and act within the first few seconds? Can they describe why they failed? Does a second attempt allow a different choice or better execution? Are relevant objects distinguishable at 128x128? Does sound confirm events without being required to understand them? Does retry return to meaningful play quickly?

Use PNG for overall visual readability, cropped ASCII for exact pixels, and reproducible input traces for behavior. Audio data and PCM tests cannot replace listening. Record human feedback separately from automated checks and from the author's design hypothesis.

For a comparison, keep model/version, prompt, budget and tools fixed; use matched tasks, several runs and blinded human preferences. Log failures and unfinished games as well as attractive successes. The research package has not yet demonstrated a measured improvement in model-generated game quality.
