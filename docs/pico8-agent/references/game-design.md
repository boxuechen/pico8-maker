# Optional game-design references

Use these references for a specific design question or when you want an example. Your own design can stand on its own; there is no prerequisite case, pattern or recipe to read. Adapt any useful ideas to the requested game.

## Find a relevant example

| Question | Optional references |
| --- | --- |
| How can a precision platformer feel forgiving? | /extensions/pico8/cases/celeste-classic.md; /extensions/pico8/patterns/forgiving-controls.md |
| How can attacks communicate their timing? | /extensions/pico8/cases/just-one-boss.md; /extensions/pico8/patterns/telegraph-attack-recovery.md |
| How can turn costs and routes create decisions? | /extensions/pico8/cases/porklike.md; /extensions/pico8/patterns/turn-economy.md; /extensions/pico8/patterns/resource-pressure.md |
| How can players understand and choose optional risk? | /extensions/pico8/cases/high-stakes.md; /extensions/pico8/patterns/risk-reward.md; /extensions/pico8/patterns/information-before-commitment.md |
| How can a game introduce and communicate its mechanics? | /extensions/pico8/patterns/teach-vary-combine.md; /extensions/pico8/patterns/event-feedback.md |
| Would a runnable implementation help? | /extensions/pico8/references/microgames.md describes three original examples and their recipe IDs. |

Cases discuss classic games; patterns suggest reusable techniques; microgames provide small working implementations. They are alternatives to consult as needed, not successive steps. Original classic-game code and assets are not included in the model library.

## Questions for an iteration

When reviewing an unclear or unsatisfying interaction, consider what the player can understand, decide and improve: is the objective visible, is feedback readable, is the result connected to an action, and does another attempt offer something worthwhile? Relevant checks might include a normal strategy, a risky alternative, or simply waiting or repeating one button. Choose checks that fit the intended rules.

A title screen, fixed number of phases, loss condition, persistent score or particular art style is not a universal requirement. Judge the implementation against the request and the experience it is meant to create. Observed behavior can support that judgment; compilation, screenshots and model self-ratings alone do not establish human enjoyment.
