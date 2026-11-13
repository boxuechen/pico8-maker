// Re-run the current independent and Agent-route verifiers on archived S4
// final carts without new provider requests. Writes reverify.json next to the
// original report, which is left unchanged.
//
//   node scripts/evaluation/reverify-s4.mjs <archive-dir>...
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyShooter, verifyAgentRoutes } from "./shooter-oracle.mjs";
import { transcriptEvidence } from "./s4-metrics.mjs";

for (const dir of process.argv.slice(2)) {
  const report = JSON.parse(
    await readFile(resolve(dir, "report.json"), "utf8"),
  );
  const out = [];
  for (const model of report.models)
    for (const run of model.runs) {
      const independent = await verifyShooter(run.after);
      const agent = await verifyAgentRoutes(
        run.after,
        run.runs,
        transcriptEvidence(run.entries).ledger,
      );
      const row = {
        model: model.configuration.id,
        task: run.task,
        status: run.status,
        independent: {
          passed: independent.passed,
          coverage: independent.coverage,
          checks: independent.checks,
        },
        agent: {
          coverage: agent.coverage,
          firstVerifiedCoreLoopCall: agent.firstVerifiedCoreLoopCall,
        },
        original: {
          independent: run.metrics.independentCoverage,
          agent: run.metrics.agentCoverage,
        },
      };
      out.push(row);
      console.log(
        JSON.stringify({
          dir: dir.split("/").at(-1),
          task: row.task,
          status: row.status,
          independent: row.independent.coverage,
          agent: row.agent.coverage,
        }),
      );
    }
  await writeFile(
    resolve(dir, "reverify.json"),
    JSON.stringify(
      { verifiedAt: new Date().toISOString(), runs: out },
      null,
      2,
    ),
  );
}
process.exit(0);
