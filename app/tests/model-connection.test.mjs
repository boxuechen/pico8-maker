import test from "node:test";
import assert from "node:assert/strict";
import {
  createConnection,
  defaultConfig,
  normalizeConfig,
  providers,
  probeConnection,
  readableError,
  thinkingOptions,
} from "../src/model-config.js";

const config = { ...defaultConfig, apiKey: "fixture-not-a-real-secret" };
const image = {
  type: "image",
  mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=",
};
const streamResponse = (deltas) =>
  new Response(
    deltas
      .map(
        ([delta, finish_reason = null]) =>
          `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "deepseek-flash", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
      )
      .join("") + "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } },
  );

test("Pi presets retain DeepSeek vision, reasoning compatibility and provider endpoint", () => {
  const { model } = createConnection(config);
  assert.equal(model.provider, "deepseek");
  assert.equal(model.reasoning, true);
  assert.equal(model.compat.maxTokensField, "max_tokens");
  assert.equal(model.compat.requiresReasoningContentOnAssistantMessages, true);
  assert.equal(model.contextWindow, 1000000);
  assert.ok(providers[0].models.every((m) => m.input.includes("image")));
  assert.ok(!providers[0].models.some((m) => m.id === "deepseek-v4-pro"));
  assert.ok(providers[1].models.length > 1);
  assert.throws(
    () => createConnection({ ...config, baseUrl: "https://other.invalid" }),
    /目录/,
  );
  assert.throws(
    () =>
      createConnection({
        ...config,
        provider: "custom",
        baseUrl: "https://example.invalid/chat/completions",
      }),
    /Base URL/,
  );
  assert.equal(
    normalizeConfig({
      model: "deepseek-flash",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test",
    }).provider,
    "deepseek",
  );
});

test("thinking follows model capabilities and custom limits are explicit", () => {
  assert.equal(createConnection(config).thinkingLevel, "high");
  assert.equal(
    createConnection({ ...config, thinkingLevel: "low" }).thinkingLevel,
    "low",
  );
  const preset = providers
    .find((p) => p.id === "openai")
    .models.find((m) => m.id === "gpt-4.1");
  const plain = {
    ...config,
    provider: "openai",
    model: preset.id,
    baseUrl: preset.baseUrl,
  };
  assert.deepEqual(thinkingOptions(plain), { levels: ["off"], level: "off" });
  assert.equal(createConnection(plain).thinkingLevel, "off");
  const custom = {
    ...config,
    provider: "custom",
    contextWindow: 200000,
    maxTokens: 64000,
  };
  assert.equal(createConnection(custom).model.maxTokens, 64000);
  assert.throws(
    () => createConnection({ ...custom, maxTokens: 300000 }),
    /token/,
  );
});

test("real Pi adapter streams fragmented tool arguments and returns images through a second request", async (t) => {
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(String(url), "https://api.deepseek.com/chat/completions");
    assert.equal(
      new Headers(init.headers).get("Authorization"),
      `Bearer ${config.apiKey}`,
    );
    const body = JSON.parse(init.body);
    bodies.push(body);
    assert.equal(body.model, "deepseek-flash");
    assert.equal(body.max_tokens, 2048);
    assert.ok(!("max_completion_tokens" in body));
    assert.equal(body.thinking.type, "disabled");
    assert.equal(body.stream, true);
    if (bodies.length === 1) {
      assert.equal(body.tools[0].function.name, "report_screen");
      assert.ok(
        body.messages.some(
          (m) =>
            Array.isArray(m.content) &&
            m.content.some((p) => p.type === "image_url"),
        ),
      );
      return streamResponse([
        [{ role: "assistant", content: "" }],
        [
          {
            tool_calls: [
              {
                index: 0,
                id: "call_probe",
                type: "function",
                function: { name: "report_screen", arguments: '{"col' },
              },
            ],
          },
        ],
        [{ tool_calls: [{ index: 0, function: { arguments: 'or":"red"}' } }] }],
        [{}, "tool_calls"],
      ]);
    }
    const assistant = body.messages.find((m) => m.role === "assistant");
    assert.equal(assistant.tool_calls[0].id, "call_probe");
    assert.ok("reasoning_content" in assistant);
    const toolIndex = body.messages.findIndex((m) => m.role === "tool");
    assert.equal(body.messages[toolIndex].tool_call_id, "call_probe");
    assert.equal(body.messages[toolIndex + 1].role, "user");
    assert.ok(
      body.messages[toolIndex + 1].content.some(
        (p) =>
          p.type === "image_url" &&
          p.image_url.url.startsWith("data:image/png;base64,"),
      ),
    );
    return streamResponse([[{ role: "assistant", content: "OK" }, "stop"]]);
  });
  assert.match(await probeConnection(config, image, "red"), /连接通过/);
  assert.equal(bodies.length, 2);
});

test("failed auth is not retried and provider error cannot expose the configured key", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response(
      JSON.stringify({ error: { message: `invalid key ${config.apiKey}` } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  });
  await assert.rejects(probeConnection(config, image, "red"), (e) => {
    assert.match(readableError(e, config.apiKey), /认证失败/);
    assert.ok(!readableError(e, config.apiKey).includes(config.apiKey));
    return true;
  });
  assert.equal(requests, 1);
});

test("a text-only response cannot pass the capability probe", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    streamResponse([[{ role: "assistant", content: "OK" }, "stop"]]),
  );
  await assert.rejects(probeConnection(config, image, "red"), /工具/);
});

test("mainstream catalogs preserve Pi protocols and distinguish Qwen regional keys", () => {
  const apis = new Set();
  for (const p of providers) {
    assert.ok(p.models.length > 0, p.id);
    for (const model of p.models) {
      assert.ok(model.input.includes("image"));
      const connection = createConnection({
        provider: p.id,
        model: model.id,
        baseUrl: model.baseUrl,
        apiKey: config.apiKey,
      });
      assert.equal(connection.model, model);
      apis.add(model.api);
    }
  }
  assert.equal(apis.size, 5);
  for (const id of [
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "qwen-cn",
    "qwen",
    "openrouter",
    "moonshotai-cn",
    "minimax-cn",
    "mistral",
    "xai",
  ])
    assert.ok(
      providers.some((p) => p.id === id),
      id,
    );
  const qwen = providers.find((p) => p.id === "qwen-cn");
  assert.ok(
    qwen.models.every(
      (m) =>
        m.baseUrl === "https://dashscope.aliyuncs.com/compatible-mode/v1" &&
        m.id.startsWith("qwen"),
    ),
  );
  assert.notEqual(
    qwen.models[0].baseUrl,
    providers.find((p) => p.id === "qwen-token-plan-cn").models[0].baseUrl,
  );
});

// Exercise real lazy adapters, not just their names in the selector. A controlled
// 401 avoids real provider traffic while validating URL, auth, image and tools.
for (const [id, modelId, path, authHeader] of [
  ["openai", "gpt-4.1", "/v1/responses", "authorization"],
  ["anthropic", "claude-sonnet-4-5", "/v1/messages", "x-api-key"],
  [
    "google",
    "gemini-2.5-flash",
    "/v1beta/models/gemini-2.5-flash:streamGenerateContent",
    "x-goog-api-key",
  ],
  ["mistral", "mistral-small-latest", "/v1/chat/completions", "authorization"],
  [
    "qwen-cn",
    "qwen3.6-flash",
    "/compatible-mode/v1/chat/completions",
    "authorization",
  ],
]) {
  test(`${id} uses its native adapter with image and tool payloads`, async (t) => {
    const preset = providers
      .find((p) => p.id === id)
      .models.find((m) => m.id === modelId);
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
      const request = new Request(input, init);
      requests++;
      assert.equal(new URL(request.url).pathname, path);
      assert.equal(
        request.headers.get(authHeader),
        authHeader === "authorization"
          ? `Bearer ${config.apiKey}`
          : config.apiKey,
      );
      const body = await request.json();
      assert.ok(
        JSON.stringify(body).includes(image.data),
        "request contains screenshot",
      );
      assert.ok(
        JSON.stringify(body.tools).includes("report_screen"),
        "request contains tool schema",
      );
      return Response.json(
        {
          error: {
            message: "Invalid API key",
            type: "authentication_error",
            code: 401,
            status: "UNAUTHENTICATED",
          },
        },
        { status: 401 },
      );
    });
    await assert.rejects(
      probeConnection(
        {
          provider: id,
          model: modelId,
          baseUrl: preset.baseUrl,
          apiKey: config.apiKey,
        },
        image,
        "red",
      ),
      /401|Invalid API key/i,
    );
    assert.equal(requests, 1);
  });
}
