import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fingerprint } from "../../src/pico8/playtests.js";
import { cartBytes } from "../../src/pico8/cart.js";
import { shooterCases } from "./shooter-case.mjs";
import { resolveMatrix } from "./s4-matrix.mjs";
import { runS4Case, limits } from "./s4-runner.mjs";
import { compareImages, boardImage } from "./image-comparison.mjs";
import { png } from "./png.mjs";

const args = process.argv.slice(2);
if (args.length !== 3 || args[0] !== "--run" || args[1] !== "--matrix")
  throw Error(
    "Usage: node scripts/evaluation/run-s4.mjs --run --matrix <matrix.json> (makes provider requests)",
  );
const matrix = resolveMatrix(
  JSON.parse(await readFile(resolve(args[2]), "utf8")),
);
const secrets = matrix.flatMap((m) => (m.config ? [m.config.apiKey] : []));
const safeJSON = (value) =>
  JSON.stringify(
    value,
    (_, v) =>
      typeof v === "string"
        ? secrets.reduce((s, key) => s.replaceAll(key, "[REDACTED]"), v)
        : v,
    2,
  );
const root = fileURLToPath(new URL("../../../", import.meta.url));
const dir = resolve(root, ".cache/evaluations", `s4-${randomUUID()}`);
await mkdir(dir, { recursive: true });
async function filesUnder(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const p = resolve(path, entry.name);
    if (entry.isDirectory()) result.push(...(await filesUnder(p)));
    else if (entry.isFile()) result.push(p);
  }
  return result.sort();
}
const frozen = [];
for (const path of [
  "app/src",
  "app/scripts/evaluation",
  "app/public/player",
]) {
  for (const file of await filesUnder(resolve(root, path))) {
    const name = relative(root, file),
      target = resolve(dir, "snapshot", name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file, target);
    frozen.push({
      path: name,
      sha256: await fingerprint(await readFile(file)),
    });
  }
}
for (const name of ["app/package.json", "app/package-lock.json"]) {
  const bytes = await readFile(resolve(root, name));
  await writeFile(resolve(dir, "snapshot", name), bytes);
  frozen.push({ path: name, sha256: await fingerprint(bytes) });
}
const report = {
  schemaVersion: 2,
  suite: "s4-two-wave-shooter",
  id: dir.split("/").at(-1),
  started: new Date().toISOString(),
  freeze: {
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    limits,
    tasks: process.env.S4_TASKS?.split(",") ?? "all",
    files: frozen,
    prompts: await Promise.all(
      shooterCases.map(async (t) => ({
        id: t.id,
        sha256: await fingerprint(new TextEncoder().encode(t.prompt)),
      })),
    ),
  },
  models: matrix.map((m) => ({
    configuration: m.metadata,
    status: m.status,
    reason: m.reason,
    runs: [],
  })),
};
const save = () => writeFile(resolve(dir, "report.json"), safeJSON(report));
await save();
console.log(`Archive: ${dir}`);
for (const size of [128, 512]) {
  const im = boardImage(size);
  await writeFile(
    resolve(dir, `board-${size}.png`),
    png(im.rgba, im.width, im.height),
  );
}
for (const [i, profile] of matrix.entries()) {
  if (profile.status !== "ready") continue;
  const record = report.models[i];
  record.status = "running";
  await save();
  try {
    // S4_TASKS=shooter-create limits a rerun to selected tasks (recorded below).
    const only = process.env.S4_TASKS?.split(",");
    for (const task of shooterCases.filter(
      (c) => !only || only.includes(c.id),
    )) {
      record.activeTask = task.id;
      await save();
      console.log(`${profile.metadata.id}: ${task.id}`);
      const run = await runS4Case(
        task,
        profile.config,
        (p) => console.log(`${p.task}: ${p.toolCalls} tools`),
      );
      record.runs.push(run);
      await save();
      await writeFile(
        resolve(dir, `${profile.metadata.id}-${task.id}.p8`),
        cartBytes(run.after),
      );
      console.log(
        JSON.stringify({
          task: task.id,
          status: run.status,
          checks: run.checks,
          metrics: run.metrics,
        }),
      );
    }
    delete record.activeTask;
    record.images = await compareImages(profile.config);
    record.status = "completed";
  } catch (e) {
    record.status = "error";
    record.error = String(e.message);
  }
  await save();
}
report.finished = new Date().toISOString();
await save();
console.log(`Saved: ${dir}/report.json`);
