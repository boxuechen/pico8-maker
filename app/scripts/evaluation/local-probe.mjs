// Maker connection probe (same four checks as src/model-config.js
// probeConnection) for a local Ollama model, using the openai-responses
// adapter so tool-result images stay inside function_call_output.
// Usage (from app/): node scripts/evaluation/local-probe.mjs <model> [responses|completions] [reasoning]
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { png } from "./png.mjs";

const [id, mode = "responses", reasoning] = process.argv.slice(2);
export function localModel(id, mode = "responses") {
  return {
    id,
    name: id,
    api: mode === "responses" ? "openai-responses" : "openai-completions",
    provider: "byok",
    baseUrl: "http://127.0.0.1:11434/v1",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 65536,
    maxTokens: 16384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: {
      supportsStore: false,
      supportsStrictMode: false,
      supportsUsageInStreaming: false,
      maxTokensField: "max_tokens",
    },
  };
}
export function localProvider(model) {
  const api = (
    model.api === "openai-responses" ? openAIResponsesApi : openAICompletionsApi
  )();
  return createProvider({
    id: model.provider,
    name: "custom",
    baseUrl: model.baseUrl,
    models: [model],
    auth: {
      apiKey: {
        name: "key",
        resolve: async () => ({ auth: { apiKey: "ollama" } }),
      },
    },
    api: {
      stream: (m, t, o) => api.stream(m, t, o),
      streamSimple: (m, t, o) => api.streamSimple(m, t, o),
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const model = localModel(id, mode);
  const models = createModels();
  models.setProvider(localProvider(model));
  const rgb = { red: [255, 0, 0], green: [0, 200, 0], blue: [0, 0, 255] };
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
  const systemPrompt =
    "This is a connection test. First call report_screen exactly once based on the image. After receiving its tool result, reply with OK and do not call tools again.";
  let failures = 0;
  for (const color of ["red", "green", "blue"]) {
    const rgba = new Uint8Array(128 * 128 * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([...rgb[color], 255], i);
    const image = {
      type: "image",
      mimeType: "image/png",
      data: png(rgba).toString("base64"),
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
    const run = () =>
      models
        .streamSimple(
          model,
          { systemPrompt, messages, tools: [tool] },
          {
            maxTokens: 8192,
            timeoutMs: 300000,
            maxRetries: 0,
            ...(reasoning ? { reasoning } : {}),
          },
        )
        .result();
    const started = Date.now();
    let verdict;
    try {
      const first = await run();
      if (["error", "aborted", "length"].includes(first.stopReason))
        throw new Error(
          `first: ${first.stopReason} ${first.errorMessage ?? ""}`,
        );
      const calls = first.content.filter((p) => p.type === "toolCall");
      if (calls.length !== 1 || calls[0].name !== tool.name)
        throw new Error("no single report_screen call");
      if (calls[0].arguments?.color !== color)
        throw new Error(`wrong color ${calls[0].arguments?.color}`);
      messages.push(first, {
        role: "toolResult",
        toolCallId: calls[0].id,
        toolName: tool.name,
        content: [
          {
            type: "text",
            text: "The tool executed successfully. Finish with OK.",
          },
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
        throw new Error(
          `after tool result: stop=${last.stopReason} parts=${last.content.map((p) => p.type).join(",")}`,
        );
      verdict = { ok: true };
    } catch (e) {
      failures++;
      verdict = { ok: false, error: String(e.message ?? e) };
    }
    console.log(
      JSON.stringify({
        model: id,
        mode,
        reasoning: reasoning ?? "default",
        color,
        ms: Date.now() - started,
        ...verdict,
      }),
    );
  }
  process.exit(failures ? 1 : 0);
}
