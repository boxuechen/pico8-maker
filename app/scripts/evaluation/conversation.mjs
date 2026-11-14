// One Maker conversation driven headlessly: the production Agent, tools, p8
// Worker and test Worker protocol on a disposable cart (EvaluationGame replaces
// only the browser transport and PNG encoding). Used by run-case.mjs (retained
// case studies) and run-turns.mjs (multi-turn suites).
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { Agent } from "../../src/agent.js";
import { newCart } from "../../src/cart-store.js";
import { activeSession, sessionContext } from "../../src/sessions.js";
import { emptySnapshot } from "../../src/pico8/assets.js";
import { revisionCoverage } from "../../src/pico8/playtests.js";
import { EvaluationGame } from "./node-game.mjs";
import { startNodeP8Worker } from "./p8-worker-node.mjs";
import { outcomeMetrics } from "./outcome-metrics.mjs";

/**
 * @param start snapshot of an existing game (version 1), or null for a blank cart
 * @param files cart working files to start with, such as { "checks.json": text }
 * @param afterTurn async (run, game) => void, called after every turn (scoring, archiving)
 * @returns { runs, playtests, revisions }
 */
export async function runConversation({ title, start = null, files = {}, prompts, config, apiKey, millisecondsPerTurn, log = () => {}, afterTurn = async () => {} }) {
  const cart = newCart({
    title,
    versions: start ? [start] : [],
    workingDraft: start ?? emptySnapshot(),
    revision: start ? 1 : 0,
    files: { ...files },
  });
  const session = activeSession(cart);
  let firstPlayableMs, turnStarted;
  const revisions = [];
  const game = new EvaluationGame({
    versions: cart.versions,
    draft: cart.workingDraft,
    files: cart.files,
    onFiles: (f) => {
      cart.files = f;
    },
    onDraft: (d) => {
      cart.workingDraft = d;
      cart.contentVersion++;
    },
    onSave: (versions, revision) => {
      cart.versions = versions;
      cart.revision = revision;
      cart.contentVersion++;
      firstPlayableMs ??= Math.round(performance.now() - turnStarted);
      revisions.push({ revision, at: new Date().toISOString() });
      log(`commit r${revision}`);
    },
  });
  game.playtests.onChange = (runs) => {
    cart.playtests = runs;
  };
  let lastCount = 0;
  const agent = new Agent(
    game,
    (_view, all) => {
      const n = outcomeMetrics(all).toolCalls;
      if (n !== lastCount && n % 10 === 0) log(`${n} tool calls`);
      lastCount = n;
    },
    { projectContext: () => sessionContext(cart, session), startP8: startNodeP8Worker },
  );
  const entries = async () => (await agent.root.entries({ order: "ascending" }, 5000, undefined, context)).items;
  const runs = [];
  let playtests = [];
  try {
    await agent.open();
    await agent.configure({ ...config, apiKey });
    for (const [i, prompt] of prompts.entries()) {
      const before = (await entries()).length;
      const revisionBefore = game.revision;
      turnStarted = performance.now();
      firstPlayableMs = undefined;
      log(`turn ${i + 1} start`);
      let timedOut = false,
        settled,
        error;
      const timer = setTimeout(() => {
        timedOut = true;
        void agent.abort();
      }, millisecondsPerTurn);
      try {
        settled = await agent.send(prompt);
      } catch (e) {
        error = String(e.message).replaceAll(apiKey, "[REDACTED]");
      } finally {
        clearTimeout(timer);
      }
      const turn = (await entries()).slice(before);
      const metrics = outcomeMetrics(turn);
      const finalText = turn
        .flatMap((e) => e.model ?? [])
        .filter((m) => m.role === "assistant")
        .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .at(-1);
      const run = {
        id: `turn-${i + 1}`,
        prompt,
        status: timedOut ? "time_limit" : error ? "error" : settled?.status,
        error,
        elapsedMs: Math.round(performance.now() - turnStarted),
        firstPlayableMs: firstPlayableMs ?? null,
        revisionBefore,
        revision: game.revision,
        // One user request makes one version (later commits replace it).
        newVersions: game.revision - revisionBefore,
        draftDirty: game.cartStatus().draftDirty,
        coverage: revisionCoverage(game.playtests.runs, game.revision),
        metrics,
        finalText,
        after: structuredClone(game.snapshot),
        files: structuredClone(game.files),
        entries: turn,
      };
      runs.push(run);
      session.lastContentVersion = cart.contentVersion;
      log(`turn ${i + 1} ${run.status} ${Math.round(run.elapsedMs / 1000)}s ${metrics.toolCalls} tools r${run.revision}`);
      await afterTurn(run, game);
    }
  } finally {
    playtests = structuredClone(game.playtests.runs);
    await agent.dispose({ preserveGame: true });
    await game.dispose();
  }
  return { runs, playtests, revisions };
}
