import {
  createModels,
  createProvider,
  clampThinkingLevel,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { mistralConversationsApi } from "@earendil-works/pi-ai/api/mistral-conversations.lazy";
import { providers } from "./model-catalog.js";
import { t } from "./i18n.js";
export { providers } from "./model-catalog.js";

const adapters = {
  "openai-completions": openAICompletionsApi,
  "openai-responses": openAIResponsesApi,
  "anthropic-messages": anthropicMessagesApi,
  "google-generative-ai": googleGenerativeAIApi,
  "mistral-conversations": mistralConversationsApi,
};
export const defaultConfig = {
  provider: "deepseek",
  model: "deepseek-flash",
  baseUrl: providers[0].models.find((m) => m.id === "deepseek-flash").baseUrl,
  apiKey: "",
  remember: true,
  thinkingLevel: "medium",
};
const thinkingLevels = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
export function thinkingOptions(config) {
  const model = providers
    .find((p) => p.id === config.provider)
    ?.models.find((m) => m.id === config.model) ?? { reasoning: true };
  // Custom endpoints have no capability catalog; the user selects their level.
  return {
    levels: getSupportedThinkingLevels(model),
    level: clampThinkingLevel(
      model,
      config.thinkingLevel ?? defaultConfig.thinkingLevel,
    ),
  };
}
export function normalizeConfig(value = {}) {
  if (!value || typeof value !== "object") return { ...defaultConfig };
  if (!value.model && !value.baseUrl) return { ...defaultConfig };
  const known = providers.find((p) =>
    p.models.some(
      (m) =>
        m.id === value.model &&
        m.baseUrl === value.baseUrl?.replace(/\/+$/, ""),
    ),
  );
  return {
    remember: true,
    ...value,
    provider: value.provider ?? known?.id ?? "custom",
    apiKey: value.apiKey ?? "",
    thinkingLevel: thinkingLevels.includes(value.thinkingLevel)
      ? value.thinkingLevel
      : defaultConfig.thinkingLevel,
  };
}
export function validateConfig(value) {
  const config = normalizeConfig(value);
  config.baseUrl = String(config.baseUrl ?? "")
    .trim()
    .replace(/\/+$/, "");
  config.model = String(config.model ?? "").trim();
  config.apiKey = String(config.apiKey ?? "").trim();
  let url;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new Error(t("errUrl"));
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(t("errUrlParts"));
  if (/\/chat\/completions\/?$/.test(url.pathname))
    throw new Error(t("errBaseUrl"));
  if (!config.model || !config.apiKey)
    throw new Error(t("errKeyModel"));
  if (config.provider === "custom") {
    // Off by default. Local servers such as Ollama keep tool-result images
    // inside function_call_output only on the Responses API; Chat Completions
    // moves them into an extra user message that some models treat as a new request.
    config.api =
      config.api === "openai-responses" ? "openai-responses" : "openai-completions";
    config.contextWindow = Number(config.contextWindow ?? 128000);
    config.maxTokens = Number(config.maxTokens ?? 32768);
    if (
      !Number.isSafeInteger(config.contextWindow) ||
      config.contextWindow < 1 ||
      !Number.isSafeInteger(config.maxTokens) ||
      config.maxTokens < 1 ||
      config.maxTokens > config.contextWindow
    )
      throw new Error(
        t("errLimits"),
      );
  }
  if (config.provider !== "custom") {
    const model = providers
      .find((p) => p.id === config.provider)
      ?.models.find((m) => m.id === config.model);
    if (!model || config.baseUrl !== model.baseUrl)
      throw new Error(t("errCatalog"));
  }
  return config;
}
export function createConnection(value) {
  const config = validateConfig(value);
  const preset = providers
    .find((p) => p.id === config.provider)
    ?.models.find((m) => m.id === config.model);
  const model = preset ?? {
    id: config.model,
    name: config.model,
    api: config.api,
    provider: "byok",
    baseUrl: config.baseUrl,
    reasoning: config.thinkingLevel !== "off",
    input: ["text", "image"],
    contextWindow: config.contextWindow,
    maxTokens: config.maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: {
      supportsStore: false,
      supportsStrictMode: false,
      supportsUsageInStreaming: false,
      maxTokensField: "max_tokens",
    },
  };
  const api = adapters[model.api]();
  // A custom Responses endpoint (e.g. Ollama) gets no prompt-cache session:
  // the adapter would send x-client-request-id, which Ollama's CORS preflight
  // rejects in browsers. Local servers cache prefixes on their own.
  const local = (o) =>
    !preset && model.api === "openai-responses"
      ? { ...o, cacheRetention: "none" }
      : o;
  const provider = createProvider({
    id: model.provider,
    name: config.provider,
    baseUrl: model.baseUrl,
    models: [model],
    auth: {
      apiKey: {
        name: "user key",
        resolve: async () => ({ auth: { apiKey: config.apiKey } }),
      },
    },
    api: {
      stream: (m, t, o) => api.stream(m, t, local(o)),
      streamSimple: (m, t, o) => api.streamSimple(m, t, local(o)),
    },
  });
  return {
    config,
    model,
    provider,
    thinkingLevel: clampThinkingLevel(model, config.thinkingLevel),
  };
}
export function readableError(error, apiKey = "") {
  let text = String(error?.message ?? error ?? t("errRequest"));
  if (apiKey) text = text.replaceAll(apiKey, t("keyHidden"));
  if (/401|authentication|invalid.*key/i.test(text))
    return t("errAuth");
  if (/402|insufficient.*(balance|quota)|balance.*insufficient/i.test(text))
    return t("errBalance");
  if (/429|rate.?limit/i.test(text))
    return t("errRate");
  if (/timeout|timed out/i.test(text))
    return t("errTimeout");
  if (/fetch|connection error|network/i.test(text))
    return t("errNetwork");
  return text;
}

// Uses the SAME Pi streaming adapter as the game agent: image input (text for
// text-only models), a real model-selected tool call, then a tool result
// containing an image and final reply.
export async function probeConnection(
  config,
  image,
  expectedColor,
  onProgress = () => {},
  signal,
) {
  const { model, provider } = createConnection(config);
  // Text-only models get the colour in words; the tool call and result round trip is the same.
  const vision = model.input.includes("image");
  if (!vision) image = { type: "text", text: `(This model reads text only. The test screen is filled with ${expectedColor}.)` };
  const models = createModels();
  models.setProvider(provider);
  const tool = {
    name: "report_screen",
    description: "Report the dominant color seen in the provided image.",
    parameters: {
      type: "object",
      properties: { color: { type: "string", enum: ["red", "green", "blue"] } },
      required: ["color"],
      additionalProperties: false,
    },
  };
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: vision
            ? "Inspect this image and report its dominant color using report_screen."
            : "Report the test screen's dominant color using report_screen.",
        },
        image,
      ],
      timestamp: Date.now(),
    },
  ];
  const systemPrompt =
    "This is a connection test. First call report_screen exactly once based on the image. After receiving its tool result, reply with OK and do not call tools again.";
  const options = {
    maxTokens: 2048,
    signal: signal ?? AbortSignal.timeout(60000),
    timeoutMs: 60000,
    maxRetries: 0,
  };
  const run = async () => {
    const result = await models
      .streamSimple(model, { systemPrompt, messages, tools: [tool] }, options)
      .result();
    if (["error", "aborted", "length"].includes(result.stopReason))
      throw new Error(
        result.errorMessage || t("probeIncomplete"),
      );
    return result;
  };
  onProgress(t("probeStart"));
  const first = await run();
  const calls = first.content.filter((p) => p.type === "toolCall");
  if (calls.length !== 1 || calls[0].name !== tool.name)
    throw new Error(t("probeNoTool"));
  if (calls[0].arguments?.color !== expectedColor)
    throw new Error(t("probeImage"));
  onProgress(t("probeResult"));
  messages.push(first, {
    role: "toolResult",
    toolCallId: calls[0].id,
    toolName: tool.name,
    content: [
      { type: "text", text: "The tool executed successfully. Finish with OK." },
      image,
    ],
    isError: false,
    timestamp: Date.now(),
  });
  const last = await run();
  if (
    last.stopReason !== "stop" ||
    !last.content.some((p) => p.type === "text" && p.text.trim())
  )
    throw new Error(t("probeNoFinish"));
  return t("probeOk");
}
