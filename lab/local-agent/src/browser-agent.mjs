// One agent run in the browser: Pi's agent loop (pi-agent-core) with Pi's stock
// tools over the agent environment and the system prompt a Node Pi session
// builds for the same tools (passed in). What the Node AgentSession adds on top
// (session file, compaction, extension hooks, its retry wrapper) is left out; the
// lab runs disable compaction and load no extensions anyway.
import { Agent } from "@earendil-works/pi-agent-core";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { DEEPSEEK_MODELS } from "@earendil-works/pi-ai/providers/deepseek.models";
import { piTools } from "./pi-tools.mjs";

const CATALOG = { deepseek: DEEPSEEK_MODELS };

function connect({ provider, id, apiKey }) {
  const model = CATALOG[provider]?.[id];
  if (!model) throw new Error(`unknown model ${provider}/${id}`);
  const api = openAICompletionsApi();
  const models = createModels();
  models.setProvider(
    createProvider({
      id: model.provider,
      name: provider,
      baseUrl: model.baseUrl,
      models: [model],
      auth: { apiKey: { name: "lab key", resolve: async () => ({ auth: { apiKey } }) } },
      api: { stream: (m, c, o) => api.stream(m, c, o), streamSimple: (m, c, o) => api.streamSimple(m, c, o) },
    }),
  );
  return { model, models };
}

/**
 * @param env from createEnvironment()
 * @param model { provider, id, apiKey }
 * @returns { status: "done" | "timeout" | "error", events, seconds, error? }
 */
export async function runBrowserAgent({ env, prompt, systemPrompt, model, thinking = "high", timeMs = 600000, onEvent }) {
  const { model: resolved, models } = connect(model);
  const sessionId = crypto.randomUUID();
  const ctx = { cwd: env.cwd, model: resolved, thinkingLevel: thinking, sessionManager: { getSessionId: () => sessionId, getSessionFile: () => undefined } };
  const tools = piTools(env).map((d) => ({
    name: d.name,
    label: d.label,
    description: d.description,
    parameters: d.parameters,
    prepareArguments: d.prepareArguments,
    executionMode: d.executionMode,
    execute: (callId, params, signal, onUpdate) => d.execute(callId, params, signal, onUpdate, ctx),
  }));
  const agent = new Agent({
    initialState: { systemPrompt, model: resolved, thinkingLevel: thinking, tools, messages: [] },
    streamFn: (m, context, options) => models.streamSimple(m, context, options),
    sessionId,
    toolExecution: "sequential",
  });
  const events = [];
  const unsubscribe = agent.subscribe((e) => {
    if (e.type === "message_end") events.push(e);
    onEvent?.(e);
  });
  const t0 = Date.now();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    agent.abort();
  }, timeMs);
  const seconds = () => Math.round((Date.now() - t0) / 1000);
  try {
    await agent.prompt(prompt);
    const err = agent.state.errorMessage;
    if (err && !timedOut) return { status: "error", error: String(err), events, seconds: seconds() };
    return { status: timedOut ? "timeout" : "done", events, seconds: seconds() };
  } catch (error) {
    return { status: timedOut ? "timeout" : "error", error: String(error?.message ?? error), events, seconds: seconds() };
  } finally {
    clearTimeout(timer);
    unsubscribe();
  }
}
