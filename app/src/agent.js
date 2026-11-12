import { defaultKnowledgeFiles } from "./pico8/knowledge-files.js";
import { createPico8Extension } from "./pico8/extension.js";
import { groupAssistantTurns } from "./workbench-state.js";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { compactTranscript, recoverTranscript } from "./project-store.js";
import { createConnection, readableError } from "./model-config.js";
import {
  Harness,
  MemoryStorage,
  createRegistry,
  section,
} from "@earendil-works/pi-durable";

export function projectView(view) {
  const live = view.docs?.["pi.live"] ?? {};
  const entries = view.entries ?? [];
  const results = new Map();
  for (const e of entries)
    for (const m of e.model ?? [])
      if (m.role === "toolResult") results.set(m.toolCallId, m);
  const messages = [];
  function add(m, id, streaming = false) {
    if (m.role !== "user" && m.role !== "assistant") return;
    const parts =
      typeof m.content === "string"
        ? [{ type: "text", text: m.content }]
        : (m.content ?? []);
    const content = parts.flatMap((p) => {
      if (p.type === "text") return [{ type: "text", text: p.text }];
      if (p.type === "toolCall") {
        const result = results.get(p.id);
        return [
          {
            type: "tool-call",
            toolCallId: p.id,
            toolName: p.name,
            args: p.arguments ?? {},
            argsText: JSON.stringify(p.arguments ?? {}),
            ...(result
              ? {
                  result: result.content
                    .filter((c) => c.type === "text")
                    .map((c) => c.text)
                    .join("\n"),
                  isError: result.isError,
                }
              : {}),
          },
        ];
      }
      return [];
    });
    if (content.length)
      messages.push({
        id,
        role: m.role,
        content,
        ...(m.role === "assistant"
          ? {
              status: streaming
                ? { type: "running" }
                : { type: "complete", reason: "stop" },
            }
          : {}),
      });
  }
  for (const e of entries)
    (e.model ?? []).forEach((m, i) => add(m, `${e.id}-${i}`));
  if (live.generation?.message) add(live.generation.message, "streaming", true);
  return {
    messages: groupAssistantTurns(messages),
    isRunning: !!live.run,
    error:
      live.runFailure && live.runFailure.reason !== "aborted"
        ? live.runFailure.detail || live.runFailure.reason
        : null,
  };
}

export class Agent {
  constructor(
    game,
    onUpdate,
    { knowledge = defaultKnowledgeFiles, projectContext } = {},
  ) {
    this.knowledge = knowledge;
    this.projectContext = projectContext;
    this.game = game;
    this.onUpdate = onUpdate;
    this.models = createModels();
    this.transcriptEntries = new Map();
  }
  async open(transcript = []) {
    await this.knowledge.prepare();
    const registry = createRegistry();
    const pico8 = createPico8Extension({
      game: this.game,
      knowledge: this.knowledge,
    });
    if (this.projectContext)
      pico8.sections.push(section("pico8_project", this.projectContext));
    registry.install(pico8);
    this.harness = await Harness.open(
      new MemoryStorage(),
      {
        models: this.models,
        registry,
        settings: () => ({
          retry: { maxRetries: 0 },
          compaction: { enabled: false },
          toolExecution: "sequential",
        }),
      },
      context,
    );
    this.root = await this.harness.root(context, {
      agent: { extensions: [pico8], maxTurns: 24, thinkingLevel: "off" },
    });
    const recovered = recoverTranscript(transcript);
    if (recovered.length) {
      const imported = await this.root.submit(
        { type: "write", entry: { kind: "restored", model: recovered } },
        context,
      );
      await imported.wait(context);
    }
    this.watch = await this.root.watch(context, { min: 100, max: 200 });
    this.publish(this.watch.value);
    this.watch.start((call) => {
      if (call.kind === "value") this.publish(call.value);
    });
  }
  publish(value) {
    const view = projectView(value);
    const failure = value.docs?.["pi.live"]?.runFailure;
    if (failure?.reason === "turn_limit")
      view.error = "已达到本次工具调用上限，可发送“继续测试”接着验证。";
    else if (view.error) view.error = readableError(view.error, this.apiKey);
    for (const entry of value.entries ?? [])
      this.transcriptEntries.set(entry.id, entry);
    this.onUpdate(
      view,
      compactTranscript([...this.transcriptEntries.values()]),
    );
  }
  async configure(value) {
    const { config, model, provider } = createConnection(value);
    this.models.setProvider(provider);
    await this.root.configure(
      {
        model: { provider: model.provider, modelId: model.id },
        thinkingLevel: "off",
      },
      context,
    );
    if (this.providerId && this.providerId !== model.provider)
      this.models.deleteProvider(this.providerId);
    this.providerId = model.provider;
    this.apiKey = config.apiKey;
    this.configured = true;
  }
  clearConnection() {
    if (this.providerId) this.models.deleteProvider(this.providerId);
    this.providerId = null;
    this.apiKey = "";
    this.configured = false;
  }
  async send(text) {
    if (!this.configured) throw new Error("Please connect a model first.");
    const submission = await this.root.submit(
      { type: "input", content: text },
      context,
    );
    return submission.wait(context);
  }
  async abort() {
    this.game.cancelTests();
    await this.root?.abort(context);
  }
  async dispose({ preserveGame = false } = {}) {
    if (preserveGame) await this.root?.abort(context);
    else await this.abort();
    await this.watch?.stop();
    await this.harness?.close(context);
  }
}
