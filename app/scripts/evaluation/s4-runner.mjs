import { readFile } from "node:fs/promises";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { Agent } from "../../src/agent.js";
import index from "../../src/generated/pico8-files.js";
import { createKnowledgeFiles } from "../../src/pico8/knowledge-files.js";
import { newCart } from "../../src/cart-store.js";
import { activeSession, sessionContext } from "../../src/sessions.js";
import { EvaluationGame } from "./node-game.mjs";
import { verifyShooter, verifyAgentRoutes } from "./shooter-oracle.mjs";
import { s4Metrics, transcriptEvidence } from "./s4-metrics.mjs";
// S4 budgets; slower local models may raise the time limit (recorded in the archive).
export const limits = Object.freeze({
  milliseconds: Number(process.env.S4_TIME_LIMIT_MS) || 180000,
  tools: 40,
});
const knowledge = createKnowledgeFiles({
  load: (file) =>
    readFile(
      new URL(
        `../../public/extensions/pico8/${index.version}/${file}`,
        import.meta.url,
      ),
      "utf8",
    ),
});

export async function runS4Case(task, config, progress = () => {}) {
  const before = task.snapshot(),
    started = performance.now();
  const cart = newCart({
    title: "Disposable S4 evaluation",
    versions: before.source ? [before] : [],
    workingDraft: before,
    revision: before.source ? 1 : 0,
  });
  const session = activeSession(cart),
    game = new EvaluationGame({
      versions: cart.versions,
      draft: before,
      onDraft: (d) => {
        cart.workingDraft = d;
        cart.contentVersion++;
      },
      onSave: (v, r) => {
        cart.versions = v;
        cart.revision = r;
        cart.contentVersion++;
      },
    });
  let entries = [],
    settled,
    error,
    stopReason,
    firstLoadMs = null,
    lastCount = 0;
  const execute = game.execute.bind(game);
  game.execute = async (action, args, signal) => {
    const r = await execute(action, args, signal);
    if (action === "load_game" && !r.isError)
      firstLoadMs ??= Math.round(performance.now() - started);
    return r;
  };
  const agent = new Agent(
    game,
    (_view, current) => {
      entries = current;
      const count = transcriptEvidence(current).calls.length;
      if (count !== lastCount) {
        lastCount = count;
        progress({ task: task.id, toolCalls: count });
      }
      if (!stopReason && count >= limits.tools) {
        stopReason = "tool_limit";
        void agent.abort();
      }
    },
    { knowledge, projectContext: () => sessionContext(cart, session) },
  );
  const timer = setTimeout(() => {
    stopReason ??= "time_limit";
    void agent.abort();
  }, limits.milliseconds);
  try {
    await agent.open();
    await agent.configure(config);
    settled = await agent.send(task.prompt);
  } catch (e) {
    error = String(e.message);
  } finally {
    clearTimeout(timer);
  }
  try {
    if (agent.root)
      entries = (
        await agent.root.entries(
          { order: "ascending" },
          1000,
          undefined,
          context,
        )
      ).items;
  } catch (e) {
    error ??= String(e.message);
  }
  const evidence = transcriptEvidence(entries);
  const last = evidence.assistant.at(-1);
  if (last?.stopReason === "error")
    error ??= last.errorMessage ?? "Provider generation failed";
  const elapsedMs = Math.round(performance.now() - started),
    after = structuredClone(game.snapshot),
    draft = structuredClone(game.draft),
    runs = structuredClone(game.playtests.runs);
  const checks = {
    naturalCompletion:
      settled?.status === "done" &&
      !stopReason &&
      !error &&
      !!last?.content.some((p) => p.type === "text" && p.text.trim()),
    committedDraft: game.hasGame && !game.cartStatus().draftDirty,
  };
  if (task.id === "shooter-repair")
    checks.preservedAssets =
      JSON.stringify(before.assets) === JSON.stringify(after.assets);
  await agent.dispose().catch((e) => {
    error ??= String(e.message);
  });
  await game.dispose();
  const verificationStarted = performance.now();
  const independent = await verifyShooter(after);
  const agentRoutes = await verifyAgentRoutes(
    after,
    runs,
    transcriptEvidence(entries).ledger,
  );
  checks.independentGameplay = independent.passed;
  checks.agentNormalCoverage = Object.values(agentRoutes.coverage).every(
    (v) => v === "passed",
  );
  return {
    task: task.id,
    prompt: task.prompt,
    status: stopReason ?? (error ? "error" : (settled?.status ?? "unanswered")),
    error,
    before,
    after,
    draft,
    entries,
    runs,
    checks,
    passed: Object.values(checks).every(Boolean),
    metrics: {
      ...s4Metrics(entries, agentRoutes, independent, elapsedMs),
      firstSuccessfulLoadMs: firstLoadMs,
    },
    verificationMs: Math.round(performance.now() - verificationStarted),
    agentRoutes,
    independent,
  };
}
