// Model connection over pi-ai. The rest of the lab only sees complete(request).
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";

/**
 * @param {{baseUrl:string, model:string, apiKey:string, api?:"openai-responses"|"openai-completions",
 *   contextWindow?:number, maxTokens?:number, input?:string[]}} config
 */
export function connect(config) {
  const api = config.api ?? "openai-responses";
  const model = {
    id: config.model,
    name: config.model,
    api,
    provider: "lab",
    baseUrl: config.baseUrl.replace(/\/+$/, ""),
    reasoning: true,
    input: config.input ?? ["text", "image"],
    contextWindow: config.contextWindow ?? 65536,
    maxTokens: config.maxTokens ?? 16384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsStore: false, supportsStrictMode: false, supportsUsageInStreaming: false, maxTokensField: "max_tokens" },
  };
  const adapter = (api === "openai-responses" ? openAIResponsesApi : openAICompletionsApi)();
  // Responses endpoints such as Ollama get no prompt-cache session header
  // (rejected by Ollama's browser CORS preflight); local servers cache prefixes.
  const options = (o) => (api === "openai-responses" ? { ...o, cacheRetention: "none" } : o);
  const models = createModels();
  models.setProvider(
    createProvider({
      id: "lab",
      name: "lab",
      baseUrl: model.baseUrl,
      models: [model],
      auth: { apiKey: { name: "key", resolve: async () => ({ auth: { apiKey: config.apiKey } }) } },
      api: {
        stream: (m, c, o) => adapter.stream(m, c, options(o)),
        streamSimple: (m, c, o) => adapter.streamSimple(m, c, options(o)),
      },
    }),
  );
  return {
    id: config.model,
    /** One model call. thinking: "off" | "low" | "medium" | "high". */
    complete({ system, messages, tools = [], thinking = "off", maxTokens = 8192, signal }) {
      return models
        .streamSimple(
          model,
          { systemPrompt: system, messages, tools: tools.map(({ name, description, parameters }) => ({ name, description, parameters })) },
          { maxTokens, signal, timeoutMs: 600000, maxRetries: 0, ...(thinking === "off" ? {} : { reasoning: thinking }) },
        )
        .result();
    },
  };
}
