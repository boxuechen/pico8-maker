import { groupAssistantTurns } from "./workbench-state.js";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { compactTranscript, recoverTranscript } from "./project-store.js";
import { createConnection, readableError } from "./model-config.js";
import {
  Harness,
  MemoryStorage,
  createRegistry,
  defineExtension,
  defineTool,
} from "@earendil-works/pi-durable";

const descriptions = {
  read_game: "读取当前完整 PICO-8 Lua 源码。修改前先调用。",
  load_game:
    "用完整 Lua 源码替换游戏。先编译并执行一帧，成功才更新用户的游戏；返回画面与错误。只支持 Lua，图像用 PICO-8 绘图函数生成。",
  press_buttons:
    "在独立测试会话中按住按键推进逻辑帧，返回实际 PNG 画面。buttons 位掩码：左=1，右=2，上=4，下=8，O/Z=16，X=32；0释放按键。多键相加。每次最多120帧。",
  observe_game: "观察测试会话最近完成的一帧与运行错误，不推进时间。",
  reset_game: "从当前源码新建测试状态，然后执行一帧。测试前调用，以便复现。",
};
const schema = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const parameters = {
  load_game: schema({ source: { type: "string" } }, ["source"]),
  press_buttons: schema(
    {
      frames: { type: "integer", minimum: 1, maximum: 120 },
      buttons: { type: "integer", minimum: 0, maximum: 63 },
    },
    ["frames", "buttons"],
  ),
};
const instructions = `你是 PICO-8 游戏创作助手，用简洁中文与用户交流。你有真实的 Lua/WASM 游戏工具。所有游戏操作必须实际调用工具，禁止虚构测试结果。
用户请求创作或修改游戏时，先 read_game，修改后 load_game，再 reset_game、press_buttons、observe_game 测试。图片是真实 128x128 PNG，可依据连续画面观察运动。没有游戏变量查询接口，不能声称知道未观察到的状态。角色实际越过障碍并落地才算跳跃验证成功，仅编译成功不够。无法判断时明确说明，不要谎报。
每次修改提交完整 Lua 源码。支持 _init、_update60、_draw、btn/btnp、rectfill、circfill、line、print 等 PICO-8 函数；暂不提供外部 sprite/map/audio 素材编辑。使用绘图函数创作。避免无限循环，使用 _update60 回调。用 srand(1) 固定随机种子便于复现。
初始示例是方向键移动，X/Z 跳跃的小关卡。修复跳跃时保持墙体与关卡不变。最多尝试三次修改，仍失败就说明证据和限制。
工具运行后用户在右侧点击播放即可亲自试玩。不要输出大段代码到对话，代码通过 load_game 修改。简要解释做了什么以及实际验证到什么。只使用提供的工具。`;

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
  constructor(game, onUpdate) {
    this.game = game;
    this.onUpdate = onUpdate;
    this.models = createModels();
    this.transcriptEntries = new Map();
  }
  async open(transcript = []) {
    const registry = createRegistry();
    registry.install(
      defineExtension({
        name: "pico8",
        tools: Object.entries(descriptions).map(([name, description]) =>
          defineTool({
            name,
            description,
            parameters: parameters[name] ?? schema(),
            replay: "unsafe",
            execute: async (args, api, ctx) =>
              this.game.execute(name, args, ctx.abortSignal),
          }),
        ),
      }),
    );
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
      agent: { instructions, maxTurns: 24, thinkingLevel: "off" },
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
  async dispose() {
    await this.abort();
    await this.watch?.stop();
    await this.harness?.close(context);
  }
}
