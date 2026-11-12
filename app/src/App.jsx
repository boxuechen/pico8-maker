import { HomeHeader, WorkbenchHeader } from "./PageHeaders.jsx";
import {
  UserMessage,
  AssistantMessage,
  ActivityContext,
} from "./WorkbenchMessages.jsx";
import { BootScreen } from "./BootScreen.jsx";
import { cartridgeImage } from "./cartridges.js";
import { useEffect, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ThreadPrimitive,
  ComposerPrimitive,
} from "@assistant-ui/react";
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
  ChevronRight,
  LoaderCircle,
  MoreHorizontal,
  Download,
  Undo2,
  Code2,
} from "lucide-react";
import {
  readProject,
  writeProject,
  readLegacyVersions,
} from "./project-store.js";
import { sampleSource } from "./sample.js";
import carts from "./assets/carts.json";
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

import {
  readModelConfig,
  writeModelConfig,
  clearModelConfig,
} from "./model-store.js";

const convertMessage = (message) => message;
function ModelSettings({ initial, onSave, onClear, onClose, pending }) {
  const dialog = useRef(null);
  const [form, setForm] = useState(() => normalizeConfig(initial));
  const [remember, setRemember] = useState(initial.remember ?? true);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const probeAbort = useRef(null);
  useEffect(() => () => probeAbort.current?.abort(), []);
  const [modelSearch, setModelSearch] = useState("");
  const preset = providers.find((p) => p.id === form.provider);
  const filteredModels = preset?.models.filter(
    (m) =>
      m.id === form.model ||
      `${m.name} ${m.id}`
        .toLowerCase()
        .includes(modelSearch.toLowerCase().trim()),
  );
  function selectProvider(id) {
    setModelSearch("");
    const model = providers.find((p) => p.id === id)?.defaultModel;
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
          <h2>Connect your model</h2>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        <p>Choose a model and enter your provider’s API key.</p>
        <label>
          Provider
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
            <option value="custom">Custom compatible API</option>
          </select>
        </label>
        {preset?.models.length > 12 && (
          <label>
            Find a model
            <input
              type="search"
              placeholder="Search model names…"
              value={modelSearch}
              disabled={busy}
              onChange={(e) => setModelSearch(e.target.value)}
            />
          </label>
        )}
        {preset && (
          <label>
            Model
            <select
              value={form.model}
              disabled={busy}
              onChange={(e) => {
                const model = preset.models.find(
                  (m) => m.id === e.target.value,
                );
                setForm({
                  ...form,
                  model: model.id,
                  baseUrl: model.baseUrl,
                  apiKey:
                    new URL(model.baseUrl).origin ===
                    new URL(form.baseUrl).origin
                      ? form.apiKey
                      : "",
                });
                setNotice("");
              }}
            >
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {preset && (
          <p className="model-detail">
            {preset.models.length} image-capable{" "}
            {preset.models.length === 1 ? "model" : "models"} · Test to verify
            tool support
          </p>
        )}
        {!preset && (
          <label>
            Base URL
            <input
              required
              type="url"
              disabled={busy}
              placeholder="https://your-provider.com/v1"
              value={form.baseUrl}
              onChange={(e) =>
                setForm({ ...form, baseUrl: e.target.value, apiKey: "" })
              }
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
            placeholder="Enter your API key"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />
        </label>
        {!preset && (
          <label>
            Model ID
            <input
              required
              placeholder="Model ID from your provider"
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
            disabled={busy}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember settings on this device (including key)
        </label>
        <p className="fine-print">
          Saved in this browser by default. Requests go directly to{" "}
          {preset ? form.baseUrl : "your endpoint"}. Connection test: two small
          requests for images and tools.
        </p>
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        <button
          type="button"
          className="clear-model-settings"
          disabled={busy || !initial.apiKey}
          onClick={() => {
            try {
              onClear();
              setForm({ ...defaultConfig });
              setRemember(true);
              setModelSearch("");
              setNotice(
                "Local model settings cleared. Your game and chat are kept.",
              );
            } catch {
              setNotice("Could not clear browser storage. Please try again.");
            }
          }}
        >
          Clear saved settings
        </button>
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            onClick={test}
            disabled={busy}
          >
            {busy ? <LoaderCircle className="spin" size={16} /> : null}Test
            connection
          </button>
          <button className="primary" disabled={busy}>
            {pending ? "Save & start making" : "Save settings"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function App() {
  const [saved] = useState(readProject);
  const project = useRef(
    saved ?? {
      schema: 1,
      id: crypto.randomUUID(),
      title: "Untitled cartridge",
      transcript: [],
      versions: readLegacyVersions() ?? [sampleSource],
      active: false,
      draft: "",
    },
  );
  const [workspace, setWorkspace] = useState(!!saved?.active);
  const [pending, setPending] = useState("");
  const pendingRef = useRef("");
  const sendLock = useRef(false);
  const [storageError, setStorageError] = useState(false);
  const [split, setSplit] = useState(58);
  const saveTimer = useRef(null);
  function persist(patch) {
    Object.assign(project.current, patch, { updatedAt: Date.now() });
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => setStorageError(!writeProject(project.current)),
      180,
    );
  }
  useEffect(() => {
    const flush = () => writeProject(project.current);
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(saveTimer.current);
      flush();
      window.removeEventListener("pagehide", flush);
    };
  }, []);
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
    [config, setConfig] = useState(readModelConfig),
    [code, setCode] = useState(false);
  const [sending, setSending] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);
  const cartLock = useRef(false);
  const busy = chat.isRunning || sending || cartLoading || game.booting;
  useEffect(() => {
    let disposed = false;
    const g = new Game(
      (s) => {
        if (!disposed) {
          setGame(s);
          if (s.error) setError(s.error);
        }
      },
      {
        versions: project.current.versions,
        onSave: (versions) => persist({ versions }),
      },
    );
    gameRef.current = g;
    const a = new Agent(g, (s, transcript) => {
      if (!disposed) {
        setChat(s);
        persist({ transcript, interrupted: s.isRunning });
      }
    });
    agentRef.current = a;
    Promise.all([g.mount(mount.current), a.open(project.current.transcript)])
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
    isRunning: chat.isRunning || sending,
    isSendDisabled: !ready || cartLoading || game.booting,
    onNew: async (m) => {
      const text = m.content
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      if (!configured) {
        pendingRef.current = text;
        setPending(text);
        persist({ draft: text });
        setSettings(true);
        return;
      }
      await sendMessage(text);
    },
    onCancel: async () => {
      await agentRef.current.abort();
      setSending(false);
    },
  });
  useEffect(() => {
    if (project.current.draft)
      runtime.thread.composer.setText(project.current.draft);
  }, []);
  async function selectCart(cart) {
    if (cartLock.current || !ready || chat.isRunning || sending) return;
    cartLock.current = true;
    setCartLoading(true);
    setError("");
    try {
      await gameRef.current.previewCart(cart);
    } catch (e) {
      setError(`Could not play ${cart.title}: ${e.message}`);
    } finally {
      cartLock.current = false;
      setCartLoading(false);
    }
  }
  async function playCurrent() {
    if (!workspace && !game.activeCart) return selectCart(carts[5]);
    return gameRef.current.play();
  }
  async function sendMessage(text) {
    if (sendLock.current || !text.trim()) return;
    sendLock.current = true;
    setError("");
    setSending(true);
    setWorkspace(true);
    persist({
      active: true,
      draft: "",
      title: project.current.transcript.length
        ? project.current.title
        : text.trim().replace(/\s+/g, " ").slice(0, 120),
    });
    runtime.thread.composer.setText("");
    try {
      await gameRef.current.restoreProject();
      await agentRef.current.send(text);
    } catch (e) {
      setError(readableError(e, config.apiKey));
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }
  function closeSettings() {
    setSettings(false);
    if (pendingRef.current) runtime.thread.composer.setText(pendingRef.current);
    pendingRef.current = "";
    setPending("");
  }
  async function saveConfig(next) {
    await agentRef.current.configure(next);
    try {
      writeModelConfig(next);
    } catch {
      // A failed save must not leave a hidden, newly selected connection active.
      if (configured) await agentRef.current.configure(config);
      else agentRef.current.clearConnection();
      throw new Error(
        "Could not save settings in this browser. Allow local storage or turn off Remember settings.",
      );
    }
    setConfig(next);
    setConfigured(true);
    setSettings(false);
    const text = pendingRef.current;
    pendingRef.current = "";
    setPending("");
    if (text) void sendMessage(text);
  }
  function clearConfig() {
    clearModelConfig();
    agentRef.current.clearConnection();
    setConfig({ ...defaultConfig });
    setConfigured(false);
  }
  const PageHeader = workspace ? WorkbenchHeader : HomeHeader;
  const playing = game.state === "running" && !game.testFrame;
  const conversationTitle =
    chat.messages
      .find((message) => message.role === "user")
      ?.content.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || project.current.title;
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ActivityContext.Provider
        value={{
          running: chat.isRunning || sending,
        }}
      >
        <div
          className={`app ${workspace ? "studio-mode" : "home-mode"}`}
          style={{ "--chat-width": `${split}%` }}
        >
          <PageHeader
            busy={busy}
            title={conversationTitle}
            previewStatus={
              busy
                ? "AI playtesting"
                : game.testFrame
                  ? "Ready to play"
                  : playing
                    ? "Playing"
                    : "Press play to try"
            }
            hasConversation={chat.messages.length > 0}
            onHome={() => {
              setWorkspace(false);
              persist({ active: false });
            }}
            onResume={async () => {
              await gameRef.current.restoreProject();
              setWorkspace(true);
              persist({ active: true });
            }}
          >
            <details className="more">
              <summary aria-label="Project actions">
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
                  Undo last change
                </button>
                <button disabled={!ready || busy} onClick={() => setCode(true)}>
                  <Code2 size={16} />
                  View source
                </button>
                <button
                  disabled={!ready}
                  onClick={() => gameRef.current.export()}
                >
                  <Download size={16} />
                  Export .p8
                </button>
              </div>
            </details>
          </PageHeader>
          <main className="workspace">
            {!workspace && (
              <>
                <section className="home-intro">
                  <div className="hero-brand">
                    <img
                      src={`${import.meta.env.BASE_URL}assets/pico8-logo.png`}
                      alt="PICO-8"
                    />
                    <button
                      className="make-badge"
                      onClick={() => {
                        const input = document.getElementById("game-prompt");
                        input?.scrollIntoView({ block: "nearest" });
                        input?.focus();
                      }}
                    >
                      ✦ MAKE A GAME
                    </button>
                  </div>
                  <div className="hero-copy">
                    {game.activeCart ? (
                      <>
                        <span>NOW PLAYING</span>
                        <strong>{game.activeCart.title}</strong>
                        <a
                          href={game.activeCart.page}
                          target="_blank"
                          rel="noreferrer"
                        >
                          by {game.activeCart.author} ↗
                        </a>
                      </>
                    ) : (
                      <>
                        Play a tiny game.
                        <br />
                        Make your own with AI.
                        <small>
                          Pick a cartridge or describe your idea below.
                        </small>
                      </>
                    )}
                  </div>
                  <div className="cart-grid left-carts">
                    {carts.slice(0, 6).map((cart) => (
                      <Cart
                        key={cart.id}
                        cart={cart}
                        onSelect={selectCart}
                        disabled={busy || !ready}
                        active={game.activeCart?.id === cart.id}
                      />
                    ))}
                  </div>
                  <p className="gallery-caption">
                    CLICK A CARTRIDGE TO PLAY <span>↑</span>
                  </p>
                </section>
                <section
                  className="home-gallery"
                  aria-label="Community cartridges"
                >
                  <div className="cart-grid right-carts">
                    <div className="mobile-only-carts">
                      {carts.slice(0, 6).map((cart) => (
                        <Cart
                          key={cart.id}
                          cart={cart}
                          onSelect={selectCart}
                          disabled={busy || !ready}
                          active={game.activeCart?.id === cart.id}
                        />
                      ))}
                    </div>
                    {carts.slice(6).map((cart) => (
                      <Cart
                        key={cart.id}
                        cart={cart}
                        onSelect={selectCart}
                        disabled={busy || !ready}
                        active={game.activeCart?.id === cart.id}
                      />
                    ))}
                    <a
                      className="more-carts"
                      href="https://www.lexaloffle.com/bbs/?cat=7&carts_tab=1#mode=carts&sub=2"
                      target="_blank"
                      rel="noreferrer"
                    >
                      MORE
                      <br />
                      CARTS<span>→</span>
                    </a>
                  </div>
                </section>
              </>
            )}
            <ThreadPrimitive.Root className="chat-panel">
              {!workspace && (
                <div className="make-heading">
                  <h1>What will you make?</h1>
                  <p>A little idea. A tiny game. A whole world of your own.</p>
                </div>
              )}
              <ThreadPrimitive.Viewport className="chat-viewport">
                <ThreadPrimitive.Empty>
                  <div className="welcome">
                    <span className="eyebrow">LET’S MAKE A LITTLE GAME</span>
                    <h1>Your idea. Your cartridge.</h1>
                    <p>
                      Describe a game, or play the preview and tell PICO Maker
                      what to change.
                    </p>
                    <button
                      className="prompt-chip"
                      onClick={() =>
                        runtime.thread.composer.setText(
                          "The character cannot jump over the wall. Help me fix it.",
                        )
                      }
                    >
                      The character cannot jump over the wall. Help me fix it.
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
                    Making your cartridge…
                  </div>
                )}
              </ThreadPrimitive.Viewport>
              <div className="composer-area">
                {(error || chat.error) && (
                  <div role="alert" className="error">
                    {error || chat.error}
                    <button
                      aria-label="Dismiss error"
                      onClick={() => {
                        setError("");
                        setChat((s) => ({ ...s, error: null }));
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <ComposerPrimitive.Root className="composer">
                  <ComposerPrimitive.Input
                    id="game-prompt"
                    placeholder={
                      workspace
                        ? "What would you like to change?"
                        : "A fishing game on the moon, where every fish glows…"
                    }
                    onChange={(e) => persist({ draft: e.target.value })}
                    aria-label="Message"
                    rows={2}
                  />
                  <div className="composer-footer">
                    <button
                      type="button"
                      className="composer-model-button"
                      aria-label="Model settings"
                      title={
                        configured
                          ? `${providers.find((p) => p.id === config.provider)?.name ?? "Custom API"} · ${config.model}`
                          : "Choose a model and API key"
                      }
                      disabled={!ready || busy}
                      onClick={() => setSettings(true)}
                    >
                      <Settings size={14} />
                      <span>{configured ? config.model : "Connect model"}</span>
                      <ChevronRight size={13} />
                    </button>
                    {chat.isRunning || sending ? (
                      <ComposerPrimitive.Cancel
                        aria-label="Stop generation"
                        className="send"
                      >
                        <Square size={12} />
                        <span>STOP</span>
                      </ComposerPrimitive.Cancel>
                    ) : (
                      <ComposerPrimitive.Send
                        aria-label="Send message"
                        className="send"
                      >
                        {workspace ? (
                          <>
                            SEND <ArrowUp size={15} />
                          </>
                        ) : (
                          <>
                            MAKE <Play size={14} fill="currentColor" />
                          </>
                        )}
                      </ComposerPrimitive.Send>
                    )}
                  </div>
                </ComposerPrimitive.Root>
                <div className="composer-note">
                  {storageError
                    ? "Local save failed. Export your cartridge to keep a copy."
                    : workspace
                      ? "Enter to send · Shift + Enter for a new line"
                      : "Play for free. Connect your model when you’re ready to create."}
                </div>
              </div>
              {!workspace && (
                <div className="prompt-examples">
                  {["Platformer", "Space shooter", "Moon fishing"].map(
                    (label, i) => (
                      <button
                        key={label}
                        onClick={() => {
                          const text = [
                            "Make a platformer with coins and a double jump.",
                            "Make a space shooter with upgradeable weapons.",
                            "Make a tiny fishing game set on the moon.",
                          ][i];
                          runtime.thread.composer.setText(text);
                          persist({ draft: text });
                        }}
                      >
                        ＋ {label}
                      </button>
                    ),
                  )}
                </div>
              )}
              {workspace && saved?.interrupted && (
                <p className="restore-note">
                  The previous run was interrupted. Your conversation and game
                  have been restored. Send a message to continue.
                </p>
              )}
            </ThreadPrimitive.Root>
            {workspace && (
              <div
                className="panel-divider"
                role="separator"
                aria-label="Resize chat panel"
                aria-orientation="vertical"
                aria-valuemin={35}
                aria-valuemax={72}
                aria-valuenow={split}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    setSplit((v) =>
                      Math.max(
                        35,
                        Math.min(72, v + (e.key === "ArrowRight" ? 2 : -2)),
                      ),
                    );
                  }
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    const box =
                      e.currentTarget.parentElement.getBoundingClientRect();
                    setSplit(
                      Math.max(
                        35,
                        Math.min(
                          72,
                          ((e.clientX - box.left) / box.width) * 100,
                        ),
                      ),
                    );
                  }
                }}
              />
            )}
            <section className="player-panel" aria-label="Game preview">
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
                        aria-label="Actual AI playtest frame"
                      />
                    )}
                    {game.booting && <BootScreen />}
                    {!playing && !busy && (
                      <button
                        disabled={!ready}
                        className={`play-overlay ${game.testFrame ? "over-frame" : ""}`}
                        aria-label="Start playing"
                        onClick={safe(playCurrent)}
                      >
                        {ready ? (
                          <img
                            src={`${import.meta.env.BASE_URL}assets/pico8-play.png`}
                            alt=""
                          />
                        ) : (
                          <LoaderCircle className="spin" size={28} />
                        )}
                      </button>
                    )}
                  </div>
                  <div
                    className="shell official-shell"
                    role="img"
                    aria-label="Original PICO-8 pixel television"
                  />
                  <div className="player-controls">
                    <button
                      aria-label={playing ? "Pause game" : "Play game"}
                      disabled={!ready || busy}
                      onClick={safe(playCurrent)}
                    >
                      {playing ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                    <button
                      aria-label="Restart game"
                      disabled={!ready || busy}
                      onClick={safe(() => gameRef.current.restart())}
                    >
                      <RotateCcw size={19} />
                    </button>
                    <span className="control-divider" />
                    <button
                      aria-label={game.muted ? "Enable sound" : "Mute"}
                      disabled={!ready || busy}
                      onClick={() => gameRef.current.mute()}
                    >
                      {game.muted ? (
                        <VolumeX size={20} />
                      ) : (
                        <Volume2 size={20} />
                      )}
                    </button>
                    <button
                      aria-label="Fullscreen"
                      onClick={safe(async () => {
                        try {
                          if (document.fullscreenElement)
                            await document.exitFullscreen();
                          else await stage.current.requestFullscreen();
                        } catch {
                          throw new Error(
                            "Fullscreen is unavailable in this browser. Try opening the game in Chrome.",
                          );
                        }
                      })}
                    >
                      <Maximize size={20} />
                    </button>
                  </div>
                  <p className="player-help">
                    {busy
                      ? game.booting
                        ? "POWERING ON…"
                        : cartLoading
                          ? "LOADING CARTRIDGE…"
                          : "AI IS PLAYTESTING"
                      : game.testFrame
                        ? "AI TEST FRAME · PRESS PLAY TO TRY"
                        : "ARROWS TO MOVE · Z / X TO PLAY"}
                  </p>
                </div>
              </div>
            </section>
          </main>
          {!workspace && (
            <footer className="home-footer">
              <span>128 × 128 PIXELS. A WORLD OF YOUR OWN.</span>
              <span>
                Community games by their original creators · An independent
                maker
              </span>
            </footer>
          )}
        </div>
        {settings && (
          <ModelSettings
            initial={config}
            onClose={closeSettings}
            pending={!!pending}
            onSave={saveConfig}
            onClear={clearConfig}
          />
        )}{" "}
        {code && (
          <SourceDialog source={game.source} onClose={() => setCode(false)} />
        )}
      </ActivityContext.Provider>
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
        <h2>Current cartridge · Lua</h2>
        <button onClick={onClose} aria-label="Close source">
          <X size={20} />
        </button>
      </div>
      <pre>{source}</pre>
    </dialog>
  );
}

function Cart({ cart, onSelect, disabled, active }) {
  return (
    <button
      className={`cart ${active ? "selected" : ""}`}
      onClick={() => onSelect(cart)}
      disabled={disabled}
      aria-label={`Play ${cart.title}`}
      aria-pressed={active}
      title={`${cart.title} · ${cart.author}`}
    >
      <img
        src={cartridgeImage(cart.id)}
        alt={`${cart.title} — ${cart.author}`}
        draggable="false"
      />
      <span className="cart-credit">
        {cart.title}
        <small>{cart.author}</small>
      </span>
    </button>
  );
}
