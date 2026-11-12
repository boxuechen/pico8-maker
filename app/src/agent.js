import { defaultKnowledgeFiles } from "./pico8/knowledge-files.js";
import { createPico8Extension } from "./pico8/extension.js";
import { groupAssistantTurns } from "./workbench-state.js";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { compactTranscript, recoverEntries } from "./project-store.js";
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
    if (e.kind !== "pi.compaction")
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
          // Pi Durable owns retry/backoff; avoid nested transport retries.
          stream: { maxRetries: 0 },
          toolExecution: "sequential",
        }),
      },
      context,
    );
    this.root = await this.harness.root(context, {
      agent: { extensions: [pico8], thinkingLevel: "high" },
    });
    const recovered = recoverEntries(transcript);
    if (recovered.length) {
      const restored = await this.root.commit(async (tx) => {
        const ids = new Map();
        const imported = [];
        const remap = (id) => {
          if (!ids.has(id))
            throw new Error(
              "Saved conversation has an invalid context boundary",
            );
          return ids.get(id);
        };
        for (const { id, head, edits, ...entry } of recovered) {
          const saved = await tx.appendEntry(this.root.id, {
            ...entry,
            ...(head === undefined
              ? {}
              : { head: head === id ? "self" : remap(head) }),
            ...(edits
              ? {
                  edits: edits.map((edit) => ({
                    ...edit,
                    target: remap(edit.target),
                  })),
                }
              : {}),
          });
          ids.set(id, saved.id);
          imported.push(saved);
        }
        return imported;
      }, context);
      for (const entry of restored) this.transcriptEntries.set(entry.id, entry);
    }
    this.watch = await this.root.watch(context, { min: 100, max: 200 });
    this.publish(this.watch.value);
    this.watch.start((call) => {
      if (call.kind === "value") this.publish(call.value);
    });
  }
  publish(value) {
    for (const entry of value.entries ?? [])
      this.transcriptEntries.set(entry.id, entry);
    const entries = [...this.transcriptEntries.values()];
    const view = projectView({ ...value, entries });
    if (view.error) view.error = readableError(view.error, this.apiKey);
    this.onUpdate(view, compactTranscript(entries));
  }
  async configure(value) {
    const { config, model, provider, thinkingLevel } = createConnection(value);
    this.models.setProvider(provider);
    await this.root.configure(
      {
        model: { provider: model.provider, modelId: model.id },
        thinkingLevel,
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
