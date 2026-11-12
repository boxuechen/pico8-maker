import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { mistralConversationsApi } from "@earendil-works/pi-ai/api/mistral-conversations.lazy";
import { providers } from "./model-catalog.js";
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
};
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
    throw new Error("请输入有效的 HTTP(S) 接口地址");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("接口地址不能包含账号、密码、查询参数或片段");
  if (/\/chat\/completions\/?$/.test(url.pathname))
    throw new Error("请填写 Base URL，不要包含 /chat/completions");
  if (!config.model || !config.apiKey)
    throw new Error("请填写 API Key 和模型名称");
  if (config.provider !== "custom") {
    const model = providers
      .find((p) => p.id === config.provider)
      ?.models.find((m) => m.id === config.model);
    if (!model || config.baseUrl !== model.baseUrl)
      throw new Error("请选择目录中的模型；修改接口地址请使用自定义服务");
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
    api: "openai-completions",
    provider: "byok",
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128000,
    maxTokens: 12000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: {
      supportsStore: false,
      supportsStrictMode: false,
      supportsUsageInStreaming: false,
      maxTokensField: "max_tokens",
    },
  };
  const api = adapters[model.api]();
  const options = (o) => ({
    ...o,
    maxTokens: Math.min(o?.maxTokens ?? 12000, model.maxTokens),
    timeoutMs: o?.timeoutMs ?? 120000,
    maxRetries: 0,
  });
  const provider = createProvider({
    id: model.provider,
    name: config.provider,
    baseUrl: model.baseUrl,
    models: [model],
    auth: {
      apiKey: {
        name: "用户密钥",
        resolve: async () => ({ auth: { apiKey: config.apiKey } }),
      },
    },
    api: {
      stream: (m, t, o) => api.stream(m, t, options(o)),
      streamSimple: (m, t, o) => api.streamSimple(m, t, options(o)),
    },
  });
  return { config, model, provider };
}
export function readableError(error, apiKey = "") {
  let text = String(error?.message ?? error ?? "请求失败");
  if (apiKey) text = text.replaceAll(apiKey, "[密钥已隐藏]");
  if (/401|authentication|invalid.*key/i.test(text))
    return "认证失败：请检查所选服务的 API Key。";
  if (/402|insufficient.*(balance|quota)|balance.*insufficient/i.test(text))
    return "账户余额或额度不足，请在模型服务中检查。";
  if (/429|rate.?limit/i.test(text))
    return "请求限流或额度不足，请稍后重试或检查服务配额。";
  if (/timeout|timed out/i.test(text))
    return "模型响应超时，请重试；也可先测试连接。";
  if (/fetch|connection error|network/i.test(text))
    return "无法连接模型服务，请检查网络、接口地址和 CORS 设置。";
  return text;
}

// Uses the SAME Pi streaming adapter as the game agent: image input, a real
// model-selected tool call, then a tool result containing an image and final reply.
export async function probeConnection(
  config,
  image,
  expectedColor,
  onProgress = () => {},
  signal,
) {
  const { model, provider } = createConnection(config);
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
          text: "Inspect this image and report its dominant color using report_screen.",
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
        result.errorMessage || "测试未完成：响应中断或超出长度限制",
      );
    return result;
  };
  onProgress("正在验证流式连接、图片输入和工具调用…");
  const first = await run();
  const calls = first.content.filter((p) => p.type === "toolCall");
  if (calls.length !== 1 || calls[0].name !== tool.name)
    throw new Error("模型未按要求调用测试工具，请确认支持工具调用。");
  if (calls[0].arguments?.color !== expectedColor)
    throw new Error("图片验证未通过：模型未识别测试图片的颜色。");
  onProgress("图片与工具调用通过，正在验证工具结果回传…");
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
    throw new Error("工具结果回传后，模型未正常结束回复。");
  return "连接通过：流式回复、图片识别、工具调用及结果回传均正常。";
}
