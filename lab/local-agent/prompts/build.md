Phase: BUILD. Make main.lua implement the plan.

- The current main.lua is already loaded and runs. Change it step by step with edit_game, or replace it once with write_game when the plan differs a lot from it.
- After each change read the host check: it reports crashes with line numbers and what holding left, right and O changes in g.
- Fix every reported problem before adding more.
- When the game implements the whole plan and the host check passes, call done with a one-line summary. Do not test win and lose here; the next phase plays the game.
