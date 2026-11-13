import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { outcomeMetrics } from "./outcome-metrics.mjs";
const root = new URL("../../../", import.meta.url);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const cases = [
  ["sweet-garden", "7de97928-1061-4d21-901d-4ccf03115679"],
  ["lodge-podge", "67a19a0c-0347-4c5a-844d-5950a1077d9b"],
];
const baseline = {
  schemaVersion: 1,
  makerCommit: "65b8098",
  runtimeCommit: "43d3ef70c07f707b2b6bec0823fa08744df0d7f3",
  counting: "Unique tool-call IDs across cumulative archived entries; UTF-8 text bytes exclude images. Coverage is unknown unless separately verified.",
  cases: [],
};
for (const [name, id] of cases) {
  const path = `.cache/evaluations/skills-${id}/report.json`;
  const bytes = await readFile(new URL(path, root));
  const report = JSON.parse(bytes);
  const all = report.runs.flatMap(run => run.entries);
  const finalCart = `app/public/case-studies/${name}/final.p8`;
  const independentEvidence = `app/public/case-studies/${name}/verification.json`;
  baseline.cases.push({
    name, archive: path, archiveSha256: hash(bytes),
    model: { provider: report.model.provider, model: report.model.model, thinkingLevel: report.model.thinkingLevel },
    knowledgeVersion: report.knowledgeVersion,
    finalCart, finalCartSha256: hash(await readFile(new URL(finalCart, root))),
    independentEvidence, independentEvidenceSha256: hash(await readFile(new URL(independentEvidence, root))),
    metrics: outcomeMetrics(all),
  });
}
const text = JSON.stringify(baseline, null, 2) + "\n";
if (process.argv.includes("--check")) {
  const existing = await readFile(new URL("docs/tooling-baseline.json", root), "utf8");
  if (text !== existing) throw new Error("Frozen baseline differs from archived evidence");
  console.log("Frozen baseline matches archived evidence");
} else await writeFile(new URL("docs/tooling-baseline.json", root), text);
