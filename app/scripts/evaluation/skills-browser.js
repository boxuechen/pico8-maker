import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { Agent } from "../../src/agent.js";
import { Game } from "../../src/game.js";
import { emptySnapshot } from "../../src/pico8/assets.js";
import { compactTranscript } from "../../src/project-store.js";
import { readModelConfig } from "../../src/model-store.js";
import { readableError } from "../../src/model-config.js";
import { newCart } from "../../src/cart-store.js";
import { activeSession, sessionContext } from "../../src/sessions.js";
import { defaultKnowledgeFiles } from "../../src/pico8/knowledge-files.js";
import { mechanicsCases, verifyMechanics } from "./mechanics-cases.mjs";
import {
  skillCases,
  fixtureSnapshot,
  transcriptMetrics,
  assessScope,
} from "./skills-cases.mjs";

const $ = (id) => document.getElementById(id);
let active,
  stopped = false,
  report;
const limits = { milliseconds: 180000, tools: 40 };
const safeJSON = (value, key) =>
  JSON.stringify(
    value,
    (_, v) =>
      typeof v === "string" && key ? v.replaceAll(key, "[REDACTED]") : v,
    2,
  );
const allEntries = async (agent) =>
  (await agent.root.entries({ order: "ascending" }, 1000, undefined, context))
    .items;
async function saveReport(config) {
  const json = safeJSON(report, config.apiKey);
  $("result").textContent = json;
  const saved = await fetch("/__skills-evaluation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
  });
  if (!saved.ok)
    throw new Error("Could not archive evaluation: " + saved.status);
  $("archive").textContent = (await saved.json()).path;
}
function progress(text) {
  $("status").textContent = text;
}

async function compactAndRestore(agent, game, projectContext, config) {
  // A declared synthetic long history tests the real compaction/restore path.
  for (let i = 0; i < 12; i++) {
    await (
      await agent.root.submit(
        {
          type: "write",
          entry: {
            kind: "pi.user",
            model: [
              {
                role: "user",
                timestamp: i,
                content:
                  `Earlier request ${i}: preserve SKILL FIXTURE and existing assets. ` +
                  "The tiny horizontal game uses arrows and O to retry. ".repeat(
                    30,
                  ),
              },
            ],
          },
        },
        context,
      )
    ).wait(context);
  }
  await agent.root.configure({ compaction: { keepRecentTokens: 1 } }, context);
  const task = await agent.root.compact(
    "Preserve current scope, controls, credit and resource constraints. Do not claim test evidence from this synthetic setup.",
    context,
  );
  const { outcome } = (await agent.harness.waitForTask(task, context)).state;
  if (
    outcome.status !== "completed" ||
    (await agent.root.context(context)).head?.kind !== "pi.compaction"
  )
    throw new Error(
      "Compaction setup did not produce a real context checkpoint",
    );
  const entries = await allEntries(agent);
  await agent.dispose({ preserveGame: true });
  const restored = new Agent(game, () => {}, { projectContext });
  active = restored;
  await restored.open(compactTranscript(entries));
  await restored.configure(config);
  return { agent: restored, setupEntries: entries };
}

async function runCase(task, repetition, config) {
  const started = performance.now();
  const before =
    task.snapshot?.() ??
    (task.id === "create" ? emptySnapshot() : fixtureSnapshot());
  const cart = newCart({
    title: "Disposable skills evaluation",
    versions: task.id === "create" ? [] : [before],
    workingDraft: before,
    revision: task.id === "create" ? 0 : 1,
  });
  const session = activeSession(cart);
  const projectContext = () => sessionContext(cart, session);
  let firstPlayableMs = null,
    toolLimit = false,
    timedOut = false,
    setupEntries = [];
  const game = new Game(() => {}, {
    versions: cart.versions,
    draft: before,
    onDraft: (draft) => {
      cart.workingDraft = draft;
      cart.contentVersion++;
    },
    onSave: (versions, revision) => {
      cart.versions = versions;
      cart.revision = revision;
      cart.contentVersion++;
      firstPlayableMs ??= performance.now() - started;
    },
  });
  let agent;
  const publish = (_view, entries) => {
    if (!toolLimit && transcriptMetrics(entries).tools >= limits.tools) {
      toolLimit = true;
      void active?.abort();
    }
  };
  let timer, settled, error;
  try {
    $("stage").replaceChildren();
    await game.mount($("stage"));
    agent = new Agent(game, publish, { projectContext });
    active = agent;
    await agent.open();
    await agent.configure(config);
    timer = setTimeout(() => {
      timedOut = true;
      void active?.abort();
    }, limits.milliseconds);
    if (task.compact) {
      const prepared = await compactAndRestore(
        agent,
        game,
        projectContext,
        config,
      );
      agent = prepared.agent;
      agent.onUpdate = publish;
      setupEntries = prepared.setupEntries;
    }
    settled = await agent.send(task.prompt);
  } catch (e) {
    error = readableError(e, config.apiKey);
  } finally {
    clearTimeout(timer);
  }
  let entries = [];
  try {
    if (agent?.root) entries = await allEntries(agent);
  } catch {
    /* retain failure outcome */
  }
  const metrics = transcriptMetrics(entries);
  const after = { ...game.snapshot };
  const checks = assessScope(task, before, after, metrics, settled);
  checks.committedDraft = game.hasGame && !game.cartStatus().draftDirty;
  if (task.id === "explain") delete checks.committedDraft;
  let evaluatorEvidence = [];
  // Run after capturing agent calls so independent verification cannot inflate
  // the agent's own playtesting metrics. Scope-specific pixel checks, not guesses.
  try {
    if (task.mechanic && game.hasGame) {
      const verified = await verifyMechanics(task.id, game);
      Object.assign(checks, verified.checks);
      evaluatorEvidence = verified.evidence;
    }
    if (["edit", "compact"].includes(task.id) && game.hasGame) {
      const baseline = await game.execute("reset_game", {});
      const moved = await game.execute("press_buttons", {
        frames: 10,
        buttons: 2,
      });
      const f = game.testFrame;
      const pixel = (x, y) => [
        ...f.rgba.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 3),
      ];
      checks.speedTwoPixels =
        JSON.stringify(pixel(28, 64)) === "[0,228,54]" &&
        JSON.stringify(pixel(27, 64)) === "[29,43,83]";
      checks.noRuntimeFault = !baseline.isError && !moved.isError;
      evaluatorEvidence = [
        { action: "reset_game", result: baseline },
        {
          action: "press_buttons",
          args: { frames: 10, buttons: 2 },
          result: moved,
        },
      ];
    }
  } catch (e) {
    checks.independentVerification = false;
    evaluatorEvidence.push({ error: readableError(e, config.apiKey) });
  }
  await agent?.dispose().catch(() => {});
  if (active && active !== agent) await active.dispose().catch(() => {});
  await game.dispose();
  active = null;
  return {
    id: `${task.id}-${repetition}`,
    task: task.id,
    repetition,
    prompt: task.prompt,
    status: stopped
      ? "stopped"
      : timedOut
        ? "time_limit"
        : toolLimit
          ? "tool_limit"
          : error
            ? "error"
            : (settled?.status ?? "unanswered"),
    error,
    elapsedMs: Math.round(performance.now() - started),
    firstPlayableMs:
      firstPlayableMs === null ? null : Math.round(firstPlayableMs),
    metrics,
    checks,
    automaticChecksPass: Object.values(checks).every(Boolean),
    gameplayReview:
      task.id === "create"
        ? "Human review required: automated completion/input checks do not establish all requested mechanics or enjoyment."
        : "Only the listed scope/pixel checks were evaluated.",
    before,
    after,
    draft: game.draft,
    setupEntries,
    entries,
    evaluatorEvidence,
  };
}

const suites = { skills: skillCases, mechanics: mechanicsCases };
$("suite").onchange = () => {
  $("start").textContent =
    `Run ${suites[$("suite").value].length * 2} evaluations`;
};
$("start").onclick = async () => {
  const config = readModelConfig();
  if (!config.apiKey) {
    progress(
      "No saved model credentials on this origin. Configure the main app first.",
    );
    return;
  }
  stopped = false;
  const suite = $("suite").value;
  const tasks = suites[suite];
  $("runs").replaceChildren();
  $("start").disabled = true;
  $("suite").disabled = true;
  $("stop").disabled = false;
  report = {
    schemaVersion: 1,
    suite,
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    model: {
      provider: config.provider,
      model: config.model,
      thinkingLevel: config.thinkingLevel,
    },
    knowledgeVersion: defaultKnowledgeFiles.version,
    limits,
    repetitions: 2,
    limitations: [
      "One saved model configuration, two repetitions per fixed case; no broad cross-model or human quality claim.",
      "Wall time and tool budgets apply only to this evaluator; production completion remains uncapped.",
      "Compaction cases use explicitly synthetic history and real provider summarization.",
    ],
    runs: [],
  };
  try {
    await saveReport(config);
    for (let repetition = 1; repetition <= 2; repetition++) {
      for (const task of tasks) {
        if (stopped) break;
        progress(
          `Running ${task.id}, repetition ${repetition}/2 — ${config.provider}/${config.model}`,
        );
        const row = document.createElement("li");
        row.textContent = `${task.id}-${repetition}: running`;
        $("runs").append(row);
        const result = await runCase(task, repetition, config);
        report.runs.push(result);
        row.textContent = `${result.id}: ${result.status}; checks ${result.automaticChecksPass ? "PASS" : "FAIL"}; ${result.metrics.tools} tools; skills ${result.metrics.skillReads.join(", ") || "none"}`;
        await saveReport(config);
      }
      if (stopped) break;
    }
    report.finishedAt = new Date().toISOString();
    report.status = stopped ? "stopped" : "complete";
    await saveReport(config);
    progress(
      `${report.status}: ${report.runs.length} attempts archived. Inspect failed checks and gameplay evidence separately.`,
    );
  } catch (e) {
    progress(readableError(e, config.apiKey));
  } finally {
    $("start").disabled = false;
    $("suite").disabled = false;
    $("stop").disabled = true;
  }
};
$("stop").onclick = () => {
  stopped = true;
  void active?.abort();
  progress("Stopping evaluation…");
};
const initial = readModelConfig();
$("model").textContent = initial.apiKey
  ? `${initial.provider} / ${initial.model} / thinking ${initial.thinkingLevel}`
  : "No saved model configuration";
