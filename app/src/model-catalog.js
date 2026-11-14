import { DEEPSEEK_MODELS } from "@earendil-works/pi-ai/providers/deepseek.models";
import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
import { GOOGLE_MODELS } from "@earendil-works/pi-ai/providers/google.models";
import { OPENROUTER_MODELS } from "@earendil-works/pi-ai/providers/openrouter.models";
import { MOONSHOTAI_CN_MODELS } from "@earendil-works/pi-ai/providers/moonshotai-cn.models";
import { MOONSHOTAI_MODELS } from "@earendil-works/pi-ai/providers/moonshotai.models";
import { KIMI_CODING_MODELS } from "@earendil-works/pi-ai/providers/kimi-coding.models";
import { MINIMAX_CN_MODELS } from "@earendil-works/pi-ai/providers/minimax-cn.models";
import { MINIMAX_MODELS } from "@earendil-works/pi-ai/providers/minimax.models";
import { ZAI_CODING_CN_MODELS } from "@earendil-works/pi-ai/providers/zai-coding-cn.models";
import { ZAI_MODELS } from "@earendil-works/pi-ai/providers/zai.models";
import { XAI_MODELS } from "@earendil-works/pi-ai/providers/xai.models";
import { MISTRAL_MODELS } from "@earendil-works/pi-ai/providers/mistral.models";
import { GROQ_MODELS } from "@earendil-works/pi-ai/providers/groq.models";
import { TOGETHER_MODELS } from "@earendil-works/pi-ai/providers/together.models";
import { FIREWORKS_MODELS } from "@earendil-works/pi-ai/providers/fireworks.models";
import { NVIDIA_MODELS } from "@earendil-works/pi-ai/providers/nvidia.models";
import { HUGGINGFACE_MODELS } from "@earendil-works/pi-ai/providers/huggingface.models";
import { CEREBRAS_MODELS } from "@earendil-works/pi-ai/providers/cerebras.models";
import { BASETEN_MODELS } from "@earendil-works/pi-ai/providers/baseten.models";
import { XIAOMI_MODELS } from "@earendil-works/pi-ai/providers/xiaomi.models";
import { QWEN_TOKEN_PLAN_CN_MODELS } from "@earendil-works/pi-ai/providers/qwen-token-plan-cn.models";
import { QWEN_TOKEN_PLAN_MODELS } from "@earendil-works/pi-ai/providers/qwen-token-plan.models";

// Import only model data: Pi's provider registry also includes server/OAuth auth.
export const supportedApis = new Set([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "mistral-conversations",
]);
function catalog(id, name, models) {
  return {
    id,
    name,
    models: Object.values(models)
      // Text-only models work too: the agent describes screens as text (p8 look, --crop).
      .filter((m) => supportedApis.has(m.api) && m.input.includes("text"))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// Standard DashScope keys are separate from Pi's Token Plan subscriptions.
// These Qwen model IDs/capabilities come from Pi; the standard regional endpoints
// are documented at https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope
function qwen(id, name, baseUrl) {
  return catalog(
    id,
    name,
    Object.fromEntries(
      Object.entries(QWEN_TOKEN_PLAN_CN_MODELS)
        .filter(([key]) => key.startsWith("qwen"))
        .map(([key, model]) => [key, { ...model, provider: id, baseUrl }]),
    ),
  );
}
const preferredModels = {
  openai: "gpt-6.1-sol",
  anthropic: "claude-sonnet-5-5",
  google: "gemini-flash-latest",
  mistral: "mistral-small-latest",
};
export const providers = [
  catalog("deepseek", "DeepSeek", DEEPSEEK_MODELS),
  catalog("openai", "OpenAI", OPENAI_MODELS),
  catalog("anthropic", "Anthropic", ANTHROPIC_MODELS),
  catalog("google", "Google Gemini", GOOGLE_MODELS),
  catalog("openrouter", "OpenRouter", OPENROUTER_MODELS),
  catalog("moonshotai-cn", "Kimi / Moonshot · China", MOONSHOTAI_CN_MODELS),
  catalog("moonshotai", "Kimi / Moonshot · Global", MOONSHOTAI_MODELS),
  catalog("kimi-coding", "Kimi Coding", KIMI_CODING_MODELS),
  catalog("minimax-cn", "MiniMax · China", MINIMAX_CN_MODELS),
  catalog("minimax", "MiniMax · Global", MINIMAX_MODELS),
  catalog("zai-coding-cn", "GLM Coding · China", ZAI_CODING_CN_MODELS),
  catalog("zai", "Z.ai", ZAI_MODELS),
  catalog("xai", "xAI", XAI_MODELS),
  catalog("mistral", "Mistral", MISTRAL_MODELS),
  catalog("groq", "Groq", GROQ_MODELS),
  catalog("together", "Together AI", TOGETHER_MODELS),
  catalog("fireworks", "Fireworks AI", FIREWORKS_MODELS),
  catalog("nvidia", "NVIDIA", NVIDIA_MODELS),
  catalog("huggingface", "Hugging Face", HUGGINGFACE_MODELS),
  catalog("cerebras", "Cerebras", CEREBRAS_MODELS),
  catalog("baseten", "Baseten", BASETEN_MODELS),
  catalog("xiaomi", "Xiaomi MiMo", XIAOMI_MODELS),
  catalog(
    "qwen-token-plan-cn",
    "Qwen Token Plan · China",
    QWEN_TOKEN_PLAN_CN_MODELS,
  ),
  catalog(
    "qwen-token-plan",
    "Qwen Token Plan · Global",
    QWEN_TOKEN_PLAN_MODELS,
  ),
];
providers.splice(
  4,
  0,
  qwen(
    "qwen-cn",
    "Qwen / Alibaba Cloud · China",
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  ),
  qwen(
    "qwen",
    "Qwen / Alibaba Cloud · Global",
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  ),
);

for (const provider of providers) {
  provider.defaultModel =
    provider.models.find((m) => m.id === preferredModels[provider.id]) ??
    provider.models[0];
}
