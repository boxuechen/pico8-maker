// One agent run on pi-durable, the harness Maker uses: a memory-backed Harness,
// pi-durable's own coding tools (read/write/edit/bash) over the agent
// environment (durable-env.mjs), and as the only system prompt section the
// exact prompt a Pi coding-agent session builds for those tools. Everything else
// (retry, compaction, transcript) is pi-durable's default behaviour.
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createRegistry, defineExtension, Harness, MemoryStorage, section } from "@earendil-works/pi-durable";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { connect } from "./browser-agent.mjs";
import { durableEnv } from "./maker.mjs";

/**
 * @param env from createEnvironment()
 * @param systemPrompt text placed untagged as the whole system prompt (e.g. piSystemPrompt())
 * @returns { status: "done" | "timeout" | "error", events, seconds, error? }
 */
export async function runDurableAgent({ env, prompt, systemPrompt, model, thinking = "high", timeMs = 600000 }) {
  const { model: resolved, models } = connect(model);
  const lab = defineExtension({ name: "lab", sections: [section("pi_prompt", () => systemPrompt, { tag: false })] });
  const registry = createRegistry();
  registry.install(lab);
  registry.install(CodingTools);
  const executionEnv = durableEnv(env);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry, env: () => executionEnv, settings: () => ({ toolExecution: "sequential" }) },
    context,
  );
  const root = await harness.root(context, {
    agent: {
      model: { provider: resolved.provider, modelId: resolved.id },
      thinkingLevel: thinking,
      extensions: [lab, CodingTools],
      cwd: env.cwd,
    },
  });
  const t0 = Date.now();
  const seconds = () => Math.round((Date.now() - t0) / 1000);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    root.abort(context).catch(() => {});
  }, timeMs);
  try {
    const submission = await root.submit({ type: "input", content: prompt }, context);
    const settled = await submission.wait(context);
    const view = await root.context(context);
    const events = view.messages.map((message) => ({ type: "message_end", message }));
    if (timedOut) return { status: "timeout", events, seconds: seconds() };
    if (settled.status !== "done") return { status: "error", error: JSON.stringify(settled).slice(0, 600), events, seconds: seconds() };
    return { status: "done", events, seconds: seconds() };
  } catch (error) {
    return { status: timedOut ? "timeout" : "error", error: String(error?.stack ?? error).slice(0, 800), events: [], seconds: seconds() };
  } finally {
    clearTimeout(timer);
    await harness.close(context).catch(() => {});
  }
}
