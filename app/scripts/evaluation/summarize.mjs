// Archive a compact, reviewable result bundle. Full provider traces stay local.
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { sha } from "./core.mjs";
const dir = resolve(
  process.argv[2] ?? ".cache/evaluations/deepseek-flash-20261112-round1",
);
const dest = resolve(
  process.argv[3] ?? "docs/pico8-agent/research/runs/2026-11-12-deepseek-flash",
);
await mkdir(dest, { recursive: true });
const results = JSON.parse(await readFile(join(dir, "results.json"), "utf8"));
const rows = [];
for (const r of results) {
  const events = (await readFile(join(dir, r.id, "events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  const calls = events.filter((e) => e.type === "tool_start");
  const counter = Object.fromEntries(
    [...new Set(calls.map((e) => e.name))].map((k) => [
      k,
      calls.filter((e) => e.name === k).length,
    ]),
  );
  const usageByRequest = new Map(
    events
      .filter((e) => e.type === "provider_metadata" && e.usage)
      .map((e) => [e.request, e.usage]),
  );
  const usage = { input: 0, output: 0, cached: 0, total: 0 };
  for (const u of usageByRequest.values()) {
    usage.input += u.prompt_tokens;
    usage.output += u.completion_tokens;
    usage.cached +=
      u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
    usage.total += u.total_tokens;
  }
  if (usage.total !== r.budget.reportedTokens)
    throw Error("Usage mismatch " + r.id);
  const errors = events
    .filter((e) => e.type === "tool_result" && e.result?.isError)
    .map((e) => ({
      number: e.number,
      name: e.name,
      output: e.result.output.filter((o) => o.type === "text"),
    }));
  const readReferences = calls
    .filter((e) => e.name === "read")
    .map((e) => e.args.path);
  const firstLoad = calls.findIndex((e) => e.name === "load_game");
  const metric = {
    ...r,
    toolCounts: counter,
    readReferences,
    readsBeforeFirstLoad: calls
      .slice(0, firstLoad)
      .filter((e) => e.name === "read").length,
    errors,
    providerUsage: usage,
    estimatedUsd:
      ((usage.input - usage.cached) * 0.3 +
        usage.cached * 0.006 +
        usage.output * 1.2) /
      1e6,
  };
  rows.push(metric);
  const gameDir = join(dest, "games", r.id);
  await mkdir(gameDir, { recursive: true });
  await writeFile(
    join(gameDir, "result.json"),
    JSON.stringify(metric, null, 2),
  );
  if (r.checks.createdGame) {
    for (const name of ["final.lua", "final.p8", "idle.png"])
      await copyFile(join(dir, r.id, name), join(gameDir, name));
  } // Never present the empty starter as an authored failed game.
}
const arms = Object.fromEntries(
  ["A", "B"].map((condition) => {
    const runs = rows.filter((r) => r.condition === condition),
      sum = (f) => runs.reduce((a, r) => a + f(r), 0);
    return [
      condition,
      {
        attempts: runs.length,
        created: sum((r) => Number(r.checks.createdGame)),
        idle120: sum((r) => Number(Boolean(r.checks.idle120))),
        tokens: sum((r) => r.providerUsage.total),
        input: sum((r) => r.providerUsage.input),
        output: sum((r) => r.providerUsage.output),
        cached: sum((r) => r.providerUsage.cached),
        estimatedUsd: sum((r) => r.estimatedUsd),
        referenceCalls: sum((r) => r.toolCounts.read ?? 0),
        pressCalls: sum((r) => r.toolCounts.press_buttons ?? 0),
        toolCalls: sum((r) => r.budget.toolCalls),
        meanGenerationSeconds:
          sum((r) => r.budget.elapsedMs) / runs.length / 1000,
      },
    ];
  }),
);
const reviews = [];
await mkdir(join(dest, "evidence"), { recursive: true });
for (const name of await readdir(join(dir, "independent-review"))) {
  if (
    name.startsWith("summary-") ||
    name === "summary.json" ||
    name.includes("planned-route")
  )
    continue;
  await copyFile(
    join(dir, "independent-review", name),
    join(dest, "evidence", name),
  );
  if (name.endsWith(".json"))
    reviews.push(
      JSON.parse(await readFile(join(dir, "independent-review", name), "utf8")),
    );
}
const summary = {
  status: "model_generation_and_agent_audit_complete_human_review_pending",
  humanReviewers: 0,
  model: "deepseek-flash",
  arms,
  runs: rows,
  independentReview: reviews.map(
    ({ id, label, findings, frames, nonSilentPcm, unmodifiedReplay }) => ({
      id,
      label,
      findings,
      frames,
      nonSilentPcm,
      unmodifiedReplay,
    }),
  ),
  costNote:
    "Estimated from the Pi model catalog rates used during this run: uncached input $0.30/M, cached input $0.006/M, output $1.20/M. Not a billing receipt. Includes provider usage from the final budget-aborted response; conversation usage.json can omit that response.",
};
await writeFile(join(dest, "summary.json"), JSON.stringify(summary, null, 2));
const header = [
  "id",
  "task",
  "condition",
  "created",
  "tokens",
  "overshoot",
  "tool_calls",
  "reference_calls",
  "press_calls",
  "seconds",
  "estimated_usd",
];
const csv =
  [
    header.join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.task,
        r.condition,
        r.checks.createdGame,
        r.providerUsage.total,
        r.budget.tokenOvershoot,
        r.budget.toolCalls,
        r.toolCounts.read ?? 0,
        r.toolCounts.press_buttons ?? 0,
        (r.budget.elapsedMs / 1000).toFixed(3),
        r.estimatedUsd.toFixed(6),
      ].join(","),
    ),
  ].join("\n") + "\n";
await writeFile(join(dest, "metrics.csv"), csv);
for (const name of [
  "plan.json",
  "model-list.json",
  "pack-A.json",
  "pack-B.json",
])
  await copyFile(join(dir, name), join(dest, name));
// Hash every local artifact (no secrets are logged by the generation runner).
const index = [];
async function walk(path, prefix = "") {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const rel = prefix + entry.name;
    if (entry.isDirectory()) await walk(join(path, entry.name), rel + "/");
    else {
      const bytes = await readFile(join(path, entry.name));
      index.push({ path: rel, bytes: bytes.length, sha256: sha(bytes) });
    }
  }
}
await walk(dir);
await writeFile(
  join(dest, "local-artifact-index.json"),
  JSON.stringify({ localDirectory: dir, files: index }, null, 2),
);
console.log(JSON.stringify({ dest, arms, reviews: reviews.length }, null, 2));
