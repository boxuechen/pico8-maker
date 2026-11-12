import { useEffect, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  ActionBarPrimitive,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import {
  ArrowUp,
  Square,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  X,
  Copy,
  ChevronRight,
  Check,
  LoaderCircle,
  MoreHorizontal,
  Download,
  Undo2,
  Code2,
} from "lucide-react";
import { Game } from "./game.js";
import { Agent } from "./agent.js";
import {
  providers,
  defaultConfig,
  normalizeConfig,
  validateConfig,
  probeConnection,
  readableError,
} from "./model-config.js";

const convertMessage = (message) => message;
const names = {
  read_game: "读取游戏代码",
  load_game: "更新并运行游戏",
  press_buttons: "操作游戏",
  observe_game: "观察游戏画面",
  reset_game: "重置测试",
};
function Tool({ toolName, args, result, isError }) {
  return (
    <details className="tool">
      <summary>
        {result === undefined ? (
          <LoaderCircle className="spin" size={15} />
        ) : (
          <Check size={15} />
        )}
        <span>
          {names[toolName] ?? toolName}
          {isError ? " · 未通过" : ""}
        </span>
        <ChevronRight size={14} />
      </summary>
      <pre>{JSON.stringify(args, null, 2)}</pre>
      {result !== undefined && (
        <pre>
          {typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </details>
  );
}
function UserMessage() {
  return (
    <MessagePrimitive.Root className="message user">
      <div className="user-bubble">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="message assistant">
      <MessagePrimitive.Parts
        components={{ Text: MarkdownTextPrimitive, tools: { Fallback: Tool } }}
      />
      <ActionBarPrimitive.Root className="message-actions">
        <ActionBarPrimitive.Copy title="复制回复" aria-label="复制回复">
          <Copy size={15} />
        </ActionBarPrimitive.Copy>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function ModelSettings({ initial, onSave, onClose }) {
  const dialog = useRef(null);
  const [form, setForm] = useState(() => normalizeConfig(initial));
  const [remember, setRemember] = useState(initial.remember ?? false);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const probeAbort = useRef(null);
  useEffect(() => () => probeAbort.current?.abort(), []);
  const preset = providers.find((p) => p.id === form.provider);
  function selectProvider(id) {
    const model = providers.find((p) => p.id === id)?.models[0];
    // Credentials never follow the user across service origins.
    setForm({
      provider: id,
      model: model?.id ?? "",
      baseUrl: model?.baseUrl ?? "",
      apiKey: "",
    });
    setNotice("");
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await onSave({ ...validateConfig(form), remember });
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setNotice("");
    probeAbort.current = new AbortController();
    try {
      const config = validateConfig(form);
      const colors = ["red", "green", "blue"];
      const color = colors[crypto.getRandomValues(new Uint8Array(1))[0] % 3];
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 128, 128);
      const image = {
        type: "image",
        mimeType: "image/png",
        data: canvas.toDataURL("image/png").split(",")[1],
      };
      const result = await probeConnection(
        config,
        image,
        color,
        setNotice,
        AbortSignal.any([
          probeAbort.current.signal,
          AbortSignal.timeout(60000),
        ]),
      );
      setNotice(result);
    } catch (e) {
      setNotice(readableError(e, form.apiKey));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={() => {
        probeAbort.current?.abort();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current && !busy) onClose();
      }}
    >
      <form onSubmit={save} className="settings-form">
        <div className="dialog-heading">
          <h2>连接你的模型</h2>
          <button
            type="button"
            aria-label="关闭设置"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        <p>从 Pi 模型目录选择，填入对应服务的 API Key。</p>
        <label>
          模型服务
          <select
            value={form.provider}
            disabled={busy}
            onChange={(e) => selectProvider(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="custom">自定义兼容接口</option>
          </select>
        </label>
        {preset && (
          <label>
            模型
            <select
              value={form.model}
              disabled={busy}
              onChange={(e) => {
                const model = preset.models.find(
                  (m) => m.id === e.target.value,
                );
                setForm({ ...form, model: model.id, baseUrl: model.baseUrl });
                setNotice("");
              }}
            >
              {preset.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {preset && <p className="model-detail">{form.model} · 支持图片输入</p>}
        {!preset && (
          <label>
            接口地址
            <input
              required
              type="url"
              disabled={busy}
              placeholder="https://你的服务地址/v1"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
          </label>
        )}
        <label>
          API Key
          <input
            required
            type="password"
            disabled={busy}
            autoComplete="off"
            placeholder="输入你的 API Key"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />
        </label>
        {!preset && (
          <label>
            模型名称
            <input
              required
              placeholder="服务提供的模型 ID"
              disabled={busy}
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </label>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          在这台设备记住配置（含 Key）
        </label>
        <p className="fine-print">
          请求直连 {preset ? form.baseUrl : "你的接口"}，默认不保存
          Key。测试会发送两次小型请求，验证图片与工具能力。
        </p>
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            onClick={test}
            disabled={busy}
          >
            {busy ? <LoaderCircle className="spin" size={16} /> : null}测试连接
          </button>
          <button className="primary" disabled={busy}>
            保存配置
          </button>
        </div>
      </form>
    </dialog>
  );
}
function readConfig() {
  try {
    return normalizeConfig(
      JSON.parse(localStorage.getItem("pico-demo-model") ?? "null"),
    );
  } catch {
    return { ...defaultConfig };
  }
}

export function App() {
  const mount = useRef(null),
    stage = useRef(null),
    testCanvas = useRef(null),
    gameRef = useRef(null),
    agentRef = useRef(null);
  const [game, setGame] = useState({
    state: "loading",
    source: "",
    canUndo: false,
    testFrame: null,
    muted: false,
  });
  const [chat, setChat] = useState({
    messages: [],
    isRunning: false,
    error: null,
  });
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [configured, setConfigured] = useState(false);
  const [settings, setSettings] = useState(false),
    [config, setConfig] = useState(readConfig),
    [code, setCode] = useState(false);
  const [sending, setSending] = useState(false);
  const busy = chat.isRunning || sending;
  useEffect(() => {
    let disposed = false;
    const g = new Game((s) => {
      if (!disposed) {
        setGame(s);
        if (s.error) setError(s.error);
      }
    });
    gameRef.current = g;
    const a = new Agent(g, (s) => {
      if (!disposed) setChat(s);
    });
    agentRef.current = a;
    Promise.all([g.mount(mount.current), a.open()])
      .then(async () => {
        if (disposed) return;
        setReady(true);
        if (config.apiKey && config.model && config.baseUrl) {
          await a.configure(config);
          setConfigured(true);
        }
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      void a.dispose().catch(() => {});
      void g.dispose().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (game.testFrame && testCanvas.current) {
      const c = testCanvas.current;
      c.getContext("2d").putImageData(
        new ImageData(new Uint8ClampedArray(game.testFrame.rgba), 128, 128),
        0,
        0,
      );
    }
  }, [game.testFrame]);
  const safe = (fn) => async () => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  };
  const runtime = useExternalStoreRuntime({
    convertMessage,
    messages: chat.messages,
    isRunning: busy,
    isSendDisabled: !ready || !configured,
    onNew: async (m) => {
      setError("");
      setSending(true);
      try {
        await agentRef.current.send(
          m.content
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("\n"),
        );
      } catch (e) {
        setError(readableError(e, config.apiKey));
      } finally {
        setSending(false);
      }
    },
    onCancel: async () => {
      await agentRef.current.abort();
      setSending(false);
    },
  });
  async function saveConfig(next) {
    await agentRef.current.configure(next);
    if (next.remember)
      localStorage.setItem("pico-demo-model", JSON.stringify(next));
    else localStorage.removeItem("pico-demo-model");
    setConfig(next);
    setConfigured(true);
    setSettings(false);
  }
  const playing = game.state === "running" && !game.testFrame;
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="app">
        <header className="topbar">
          <span className="app-title">
            PICO-8 <span>Demo</span>
          </span>
          <div className="top-actions">
            <button
              className="settings-button"
              disabled={!ready || busy}
              onClick={() => setSettings(true)}
            >
              <Settings size={16} />
              <span>{configured ? "模型已配置" : "模型设置"}</span>
              {configured && <i />}
            </button>
            <details className="more">
              <summary aria-label="更多操作">
                <MoreHorizontal size={20} />
              </summary>
              <div
                className="more-menu"
                onClick={(event) => {
                  if (event.target.closest("button"))
                    event.currentTarget.parentElement.open = false;
                }}
              >
                <button
                  disabled={!ready || busy || !game.canUndo}
                  onClick={safe(() => gameRef.current.undo())}
                >
                  <Undo2 size={16} />
                  撤销上次修改
                </button>
                <button disabled={!ready || busy} onClick={() => setCode(true)}>
                  <Code2 size={16} />
                  查看源码
                </button>
                <button
                  disabled={!ready}
                  onClick={() => gameRef.current.export()}
                >
                  <Download size={16} />
                  导出 .p8
                </button>
              </div>
            </details>
          </div>
        </header>
        <main className="workspace">
          <ThreadPrimitive.Root className="chat-panel">
            <ThreadPrimitive.Viewport className="chat-viewport">
              <ThreadPrimitive.Empty>
                <div className="welcome">
                  <span className="eyebrow">LET’S MAKE A LITTLE GAME</span>
                  <h1>
                    你的想法，
                    <br />
                    一张游戏卡带。
                  </h1>
                  <p>
                    描述一个游戏，或者试玩右侧的小关卡，
                    <br />
                    告诉 AI 你想改什么。
                  </p>
                  <button
                    className="prompt-chip"
                    onClick={() =>
                      runtime.thread.composer.setText(
                        "角色跳不过这堵墙，帮我修复。",
                      )
                    }
                  >
                    角色跳不过这堵墙，帮我修复。
                    <ArrowUp size={14} />
                  </button>
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages
                components={{ UserMessage, AssistantMessage }}
              />
              {busy && (
                <div className="working" role="status">
                  <LoaderCircle className="spin" size={14} />
                  AI 正在处理…
                </div>
              )}
            </ThreadPrimitive.Viewport>
            <div className="composer-area">
              {(error || chat.error) && (
                <div role="alert" className="error">
                  {error || chat.error}
                  <button
                    aria-label="关闭错误"
                    onClick={() => {
                      setError("");
                      setChat((s) => ({ ...s, error: null }));
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {!configured && (
                <button
                  className="connect-hint"
                  disabled={!ready}
                  onClick={() => setSettings(true)}
                >
                  {ready ? "连接模型后开始创作" : "正在加载游戏运行时…"}
                  <ChevronRight size={13} />
                </button>
              )}
              <ComposerPrimitive.Root className="composer">
                <ComposerPrimitive.Input
                  placeholder="描述游戏，或告诉 AI 想改什么…"
                  aria-label="消息"
                  rows={2}
                />
                <div className="composer-footer">
                  <span>
                    {configured ? config.model : "使用你自己的 API Key"}
                  </span>
                  {busy ? (
                    <ComposerPrimitive.Cancel
                      aria-label="停止生成"
                      className="send"
                    >
                      <Square size={16} />
                    </ComposerPrimitive.Cancel>
                  ) : (
                    <ComposerPrimitive.Send
                      aria-label="发送消息"
                      className="send"
                    >
                      <ArrowUp size={20} />
                    </ComposerPrimitive.Send>
                  )}
                </div>
              </ComposerPrimitive.Root>
              <div className="composer-note">
                Enter 发送 · Shift + Enter 换行
              </div>
            </div>
          </ThreadPrimitive.Root>
          <section className="player-panel" aria-label="游戏试玩">
            <div className="console-group" ref={stage}>
              <div className="console">
                <div className="screen-backdrop" />
                <div className="screen">
                  <div ref={mount} className="player-mount" />
                  {game.testFrame && (
                    <canvas
                      ref={testCanvas}
                      width={128}
                      height={128}
                      className="test-screen"
                      aria-label="AI 实际测试画面"
                    />
                  )}
                  {!playing && !busy && (
                    <button
                      disabled={!ready}
                      className={`play-overlay ${game.testFrame ? "over-frame" : ""}`}
                      aria-label="开始试玩"
                      onClick={safe(() => gameRef.current.play())}
                    >
                      {ready ? (
                        <Play size={55} fill="currentColor" />
                      ) : (
                        <LoaderCircle className="spin" size={28} />
                      )}
                    </button>
                  )}
                </div>
                <img
                  className="shell"
                  src={`${import.meta.env.BASE_URL}assets/pico8-shell.png`}
                  alt="PICO-8 像素游戏机外壳"
                  draggable="false"
                />
              </div>
              <div className="player-controls">
                <button
                  aria-label={playing ? "暂停游戏" : "播放游戏"}
                  disabled={!ready || busy}
                  onClick={safe(() => gameRef.current.play())}
                >
                  {playing ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button
                  aria-label="重新开始"
                  disabled={!ready || busy}
                  onClick={safe(() => gameRef.current.restart())}
                >
                  <RotateCcw size={19} />
                </button>
                <span className="control-divider" />
                <button
                  aria-label={game.muted ? "打开声音" : "静音"}
                  disabled={!ready || busy}
                  onClick={() => gameRef.current.mute()}
                >
                  {game.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <button
                  aria-label="全屏"
                  onClick={safe(async () => {
                    try {
                      if (document.fullscreenElement)
                        await document.exitFullscreen();
                      else await stage.current.requestFullscreen();
                    } catch {
                      throw new Error(
                        "当前浏览器未允许全屏，可在 Chrome 中打开试玩。",
                      );
                    }
                  })}
                >
                  <Maximize size={20} />
                </button>
              </div>
              <p className="player-help">
                {busy
                  ? "AI 正在操作游戏"
                  : game.testFrame
                    ? "AI 测试画面 · 点击播放亲自试玩"
                    : "方向键移动 · X / Z 跳跃"}
              </p>
            </div>
          </section>
        </main>
      </div>
      {settings && (
        <ModelSettings
          initial={config}
          onClose={() => setSettings(false)}
          onSave={saveConfig}
        />
      )}{" "}
      {code && (
        <SourceDialog source={game.source} onClose={() => setCode(false)} />
      )}
    </AssistantRuntimeProvider>
  );
}
function SourceDialog({ source, onClose }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog ref={ref} className="source-dialog" onCancel={onClose}>
      <div className="dialog-heading">
        <h2>当前卡带 · Lua</h2>
        <button onClick={onClose} aria-label="关闭源码">
          <X size={20} />
        </button>
      </div>
      <pre>{source}</pre>
    </dialog>
  );
}
