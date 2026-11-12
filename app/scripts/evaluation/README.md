# Fixed-task knowledge-pack pilot

This is a research harness, separate from the production UI. The recorded first run and interpretation are in `docs/pico8-agent/research/runs/2026-11-12-deepseek-flash/README.md`.

- `packs.mjs` freezes A/B from the declared Git revisions and compiles each model-facing bundle.
- `core.mjs` runs the application's actual Game tools against the real WASM session and accounts for budgets.
- `run.mjs` creates isolated Pi Durable conversations, makes real DeepSeek requests, and archives provider/tool evidence without credentials. It refuses to overwrite an existing plan.
- `probe.mjs` and `assess.mjs` independently audit the frozen first batch. State observations use scratch RAM; inputs are replayed on unmodified carts to check final pixels or the same runtime fault. These checks do not call the model or repair its outputs.
- `summarize.mjs` writes a compact result/evidence bundle and an index of local raw artifacts. Cost rates are explicit catalog estimates for this pilot, not billing data.
- `serve.mjs` and `review.html` provide a local-only random left/right review page. Treatment mappings and generation logs are not served. No ratings are synthesized.

Run `node --test app/tests/evaluation.test.mjs` from the repository root. The recorded report includes preparation, generation, audit and review commands. Real generation requires a provider credential through the environment or non-echoing stdin, never in command arguments, source or artifact files.

Known limitations: one run per prompt/condition; a mutable provider model alias; no human ratings yet; cumulative-token admission can overshoot because usage arrives after provider acceptance. The first batch is immutable. Do not silently repair, selectively retry or reinterpret missing outputs as successes. Future comparisons should archive the whole execution checkout, improve budget admission, reserve actual playtest capacity, and use held-out tasks after tuning.
