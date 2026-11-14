// Multi-turn evaluation (cases in turn-cases.mjs), one conversation per run:
//
//   DEEPSEEK_API_KEY=... node scripts/evaluation/run-turns.mjs --case edits|assets|snake|meteor|paint [--model deepseek-v4-pro]
//
// After every turn: hidden checks (edits) or generic checks (vague), versions
// made by the turn, and a result replay of the Agent's normal routes. The last
// stdout line is a JSON summary; the archive keeps report.json, turn-N.p8 and a
// screenshot per turn (turn-N.png, after 90 idle frames).
import { mkdir, writeFile } from "node:fs/promises";
import { createPico8Session } from "../../public/player/main/player.mjs";
import { cartText } from "../../src/pico8/cart.js";
import { defaultConfig } from "../../src/model-config.js";
import { withSoundBank } from "../../src/pico8/shell/sounds.js";
import { emptySnapshot } from "../../src/pico8/assets.js";
import { Runtime, setSessionFactory } from "../../src/pico8/shell/runtime.js";
import { checkSource } from "../../src/pico8/shell/checks.js";
import { runConversation } from "./conversation.mjs";
import { png } from "./png.mjs";
import { resultReplay } from "./result-replay.mjs";
import { assetTurns, catchBase, catchChecks, editTurns, ownChecks, vagueCases } from "./turn-cases.mjs";

setSessionFactory(createPico8Session);
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const name = arg("case");
// Scripted suites start from the base game and have per-turn checks (and scores).
const scripted = { edits: editTurns, assets: assetTurns }[name];
if (!scripted && !vagueCases[name]) throw Error(`--case edits|assets|${Object.keys(vagueCases).join("|")}`);
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw Error("DEEPSEEK_API_KEY is required");
const config = { ...defaultConfig, ...(arg("model") ? { model: arg("model") } : {}) };
const millisecondsPerTurn = Number(process.env.TURN_TIME_LIMIT_MS) || 600000;
const prompts = scripted ? scripted.map((t) => t.prompt) : vagueCases[name];
const start = scripted ? { ...emptySnapshot(), source: catchBase, assets: withSoundBank(emptySnapshot().assets) } : null;

const id = crypto.randomUUID();
const out = new URL(`../../../.cache/evaluations/turns-${name}-${id}/`, import.meta.url);
await mkdir(out, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const redact = (v) => JSON.stringify(v, (_, x) => (typeof x === "string" ? x.replaceAll(apiKey, "[REDACTED]") : x), 2);

async function screenshot(snapshot, file) {
  const rt = new Runtime(snapshot.assets);
  try {
    if (!(await rt.load(snapshot.source)).ok) return null;
    await rt.advance(0, 90);
    if (!rt.frame) return null;
    await writeFile(new URL(file, out), png(rt.frame.rgba));
    return file;
  } finally {
    await rt.dispose();
  }
}

const report = { schemaVersion: 1, suite: `turns-${name}`, id, startedAt: new Date().toISOString(), model: { provider: config.provider, model: config.model, thinkingLevel: config.thinkingLevel }, limits: { millisecondsPerTurn }, runs: [] };
const result = await runConversation({
  title: `turns ${name}`,
  start,
  // The scripted suites start like a cart the Agent made: with its checks.json.
  files: scripted ? { "checks.json": catchChecks + "\n" } : {},
  prompts,
  config,
  apiKey,
  millisecondsPerTurn,
  log,
  afterTurn: async (run, game) => {
    const i = report.runs.length;
    const snap = run.after;
    const items = await checkSource(snap.source, scripted ? scripted[i].checks : [], { assets: snap.assets });
    const scored = scripted?.[i].score ? await scripted[i].score(snap) : { items: [] };
    items.push(...scored.items);
    if (scripted) items.push(...(await ownChecks(snap, run.files, checkSource, scripted[i].changes)));
    for (const [label, rgba] of Object.entries(scored.frames ?? {})) await writeFile(new URL(`${run.id}-${label}.png`, out), png(rgba));
    const failed = items.filter((x) => !x.pass);
    run.score = {
      checks: `${items.length - failed.length}/${items.length}`,
      pass: !failed.length,
      failedNames: failed.map((x) => x.name),
      failed: failed.map((x) => `${x.name}: ${x.detail}`.slice(0, 300)),
      replay: (await resultReplay(snap, game.playtests.runs, run.revision)).summary,
      screenshot: await screenshot(snap, `${run.id}.png`),
    };
    log(`${run.id} checks ${run.score.checks}${failed.length ? ` failed: ${failed.map((x) => x.name).join(", ")}` : ""} · ${run.score.replay}`);
    report.runs.push(run);
    await writeFile(new URL(`${run.id}.p8`, out), cartText(snap));
    await writeFile(new URL("report.json", out), redact({ ...report, playtests: game.playtests.runs }));
  },
});
report.playtests = result.playtests;
report.revisions = result.revisions;
await writeFile(new URL("report.json", out), redact(report));
log(`archive ${out.pathname}`);
const summary = {
  case: name,
  model: config.model,
  turns: report.runs.map((r) => ({
    status: r.status,
    seconds: Math.round(r.elapsedMs / 1000),
    tools: r.metrics.toolCalls,
    newVersions: r.newVersions,
    checks: r.score.checks,
    pass: r.score.pass,
    failed: r.score.failedNames,
    replay: r.score.replay,
  })),
  archive: out.pathname,
};
console.log(JSON.stringify(summary));
process.exit(0);
