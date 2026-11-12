import {
  HomeHeader,
  WorkbenchHeader,
  PixelPlay,
  PixelArrow,
} from "./PageHeaders.jsx";
import {
  UserMessage,
  AssistantMessage,
  ActivityContext,
} from "./WorkbenchMessages.jsx";
import { BootScreen } from "./BootScreen.jsx";
import { HowItWorks, HomeFooter } from "./HomeSections.jsx";
import { cartridgeImage } from "./cartridges.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ThreadPrimitive,
  ComposerPrimitive,
} from "@assistant-ui/react";
import {
  ArrowUp,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  X,
  ChevronDown,
  LoaderCircle,
  Copy,
  PanelLeftOpen,
} from "lucide-react";
import {
  openCartStore,
  memoryBackend,
  newCart,
  isOnShelf,
  sortCarts,
  duplicateCart,
  requestPersistence,
} from "./cart-store.js";
import {
  activeSession,
  addSession,
  updateSession,
  sessionContext,
} from "./sessions.js";
import { SessionSidebar } from "./SessionSidebar.jsx";
import { NameDialog } from "./NameDialog.jsx";
import { CartShelf, CartBody, ago } from "./CartShelf.jsx";
import { downloadCart } from "./pico8/cart.js";
import { currentTool, describeTool, formatButtons } from "./workbench-state.js";
import { countTokens } from "./pico8/tokens.js";
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

const BASE = import.meta.env.BASE_URL;
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

const nextIdeas = [
  "Make it a little harder",
  "Add sound effects",
  "Add a title screen",
];
const homeIdeas = [
  ["Platformer", "#00e436", "Make a platformer with coins and a double jump."],
  [
    "Space shooter",
    "#29adff",
    "Make a space shooter with upgradeable weapons.",
  ],
  ["Moon fishing", "#ffa300", "Make a tiny fishing game set on the moon."],
];
function rgbaToUrl(rgba) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  canvas
    .getContext("2d")
    .putImageData(new ImageData(new Uint8ClampedArray(rgba), 128, 128), 0, 0);
  return canvas.toDataURL("image/png");
}
function urlToRgba(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0, 128, 128);
      resolve(ctx.getImageData(0, 0, 128, 128).data);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

// Opens the browser-only cart shelf first; the studio renders once it is ready.
export function App() {
  const [store, setStore] = useState(null);
  useEffect(() => {
    let cancelled = false;
    openCartStore()
      .catch(() => openCartStore({ backend: memoryBackend() }))
      .then((s) => !cancelled && setStore(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return store ? <Studio store={store} /> : <div className="app home-mode" />;
}

const contentKeys = ["versions", "revision", "sourceDraft", "label", "title"];
const upsert = (list, cart) =>
  sortCarts([{ ...cart }, ...list.filter((c) => c.id !== cart.id)]);

function Studio({ store }) {
  const [saved] = useState(
    () => store.carts.find((c) => c.id === store.navigation.currentId) ?? null,
  );
  const project = useRef(saved ?? newCart());
  const [shelf, setShelf] = useState(() => store.carts.filter(isOnShelf));
  const [switching, setSwitching] = useState(false);
  const [inWorkbench, setInWorkbench] = useState(
    !!(saved && store.navigation.active),
  );
  const transitionLock = useRef(false);
  const homeDraft = useRef(store.navigation.homeDraft ?? "");
  const [, refreshSessions] = useState(0);
  const [pending, setPending] = useState("");
  const pendingRef = useRef("");
  const sendLock = useRef(false);
  const [storageError, setStorageError] = useState(false);
  const [split, setSplit] = useState(58);
  const [collapsed, setCollapsed] = useState(
    () => store.navigation.sidebarCollapsed ?? window.innerWidth < 1100,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [creation, setCreation] = useState(null);
  function toggleSidebar() {
    setCollapsed((value) => {
      void store
        .setNavigation({ sidebarCollapsed: !value })
        .catch(() => setStorageError(true));
      return !value;
    });
  }
  const [view, setView] = useState("preview");
  const [frames, setFrames] = useState([]);
  const [label, setLabel] = useState(project.current.label ?? null);
  const [showRestore, setShowRestore] = useState(
    !!activeSession(project.current).interrupted,
  );
  const saveTimer = useRef(null);
  function persist(patch) {
    if ("active" in patch)
      void store
        .setNavigation({ currentId: project.current.id, active: patch.active })
        .catch(() => {});
    // Only real content changes reorder the shelf; opening or typing does not.
    const touched = contentKeys.some(
      (k) =>
        k in patch &&
        JSON.stringify(patch[k]) !== JSON.stringify(project.current[k]),
    );
    if (
      ("sourceDraft" in patch &&
        patch.sourceDraft !== project.current.sourceDraft) ||
      ("revision" in patch && patch.revision !== project.current.revision)
    )
      project.current.sourceVersion++;
    const { active: _pageMode, ...content } = patch;
    Object.assign(project.current, content);
    if (touched) project.current.updatedAt = Date.now();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 180);
  }
  function persistSession(
    patch,
    cartId = project.current.id,
    sessionId = project.current.activeSessionId,
  ) {
    if (!updateSession(project.current, cartId, sessionId, patch)) return;
    refreshSessions((v) => v + 1);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 180);
  }
  function saveComposerDraft(text) {
    if (inWorkbench) persistSession({ draft: text });
    else {
      homeDraft.current = text;
      void store
        .setNavigation({ homeDraft: text })
        .catch(() => setStorageError(true));
    }
  }
  // Write the current cart; it joins the shelf once it has real content.
  async function flush() {
    clearTimeout(saveTimer.current);
    const cart = project.current;
    if (cart.deleted) return;
    if (isOnShelf(cart)) setShelf((list) => upsert(list, cart));
    try {
      await store.put(cart);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      clearTimeout(saveTimer.current);
      onHide();
      window.removeEventListener("pagehide", onHide);
    };
  }, []);
  const mount = useRef(null),
    stage = useRef(null),
    testCanvas = useRef(null),
    gameRef = useRef(null),
    agentRef = useRef(null),
    agentGeneration = useRef(0);
  const [game, setGame] = useState({
    state: "loading",
    source: project.current.versions.at(-1),
    canUndo: false,
    revision: project.current.revision ?? project.current.versions.length,
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
    [config, setConfig] = useState(readModelConfig);
  const [sending, setSending] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);
  const cartLock = useRef(false);
  const running = chat.isRunning || sending;
  const busy = running || cartLoading || game.booting || switching;
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
        revision: project.current.revision,
        draft: project.current.sourceDraft,
        onSave: (versions, revision) => persist({ versions, revision }),
        onDraft: (text) => persist({ sourceDraft: text }),
      },
    );
    g.workspace.id = project.current.id;
    gameRef.current = g;
    Promise.all([
      g.mount(mount.current),
      connectAgent(activeSession(project.current)),
    ])
      .then(() => {
        if (!disposed) setReady(true);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      agentGeneration.current++;
      void agentRef.current?.dispose().catch(() => {});
      void g.dispose().catch(() => {});
    };
  }, []);
  const configRef = useRef(config);
  configRef.current = config;
  // Only one session has a live Agent. The player/file environment belongs to
  // the cart and remains mounted when conversations change.
  async function connectAgent(session) {
    const cart = project.current;
    const generation = ++agentGeneration.current;
    const previous = agentRef.current;
    agentRef.current = null;
    setReady(false);
    setConfigured(false);
    if (previous)
      await previous.dispose({ preserveGame: true }).catch(() => {});
    const a = new Agent(
      gameRef.current,
      (state, transcript) => {
        if (
          generation !== agentGeneration.current ||
          project.current.id !== cart.id ||
          cart.activeSessionId !== session.id
        )
          return;
        setChat(state);
        persistSession(
          { transcript, interrupted: state.isRunning },
          cart.id,
          session.id,
        );
      },
      { projectContext: () => sessionContext(cart, session) },
    );
    agentRef.current = a;
    try {
      await a.open(session.transcript);
      if (generation !== agentGeneration.current) {
        await a.dispose();
        return;
      }
      const c = configRef.current;
      if (c.apiKey && c.model && c.baseUrl) {
        await a.configure(c);
        setConfigured(true);
      }
      setReady(true);
    } catch (error) {
      await a.dispose().catch(() => {});
      throw error;
    }
  }
  async function selectSession(id) {
    if (busy || sendLock.current || transitionLock.current) return;
    if (id === project.current.activeSessionId) return;
    transitionLock.current = true;
    setSwitching(true);
    const cart = project.current;
    const previousId = cart.activeSessionId;
    try {
      persistSession({ draft: runtime.thread.composer.getState().text });
      await flush();
      const next =
        id == null ? addSession(cart) : cart.sessions.find((s) => s.id === id);
      if (!next) throw new Error("Session not found");
      cart.activeSessionId = next.id;
      setError("");
      setShowRestore(!!next.interrupted);
      runtime.thread.composer.setText(next.draft);
      await connectAgent(next);
      await flush();
      refreshSessions((v) => v + 1);
      setMobileOpen(false);
    } catch (error) {
      cart.activeSessionId = previousId;
      const previous = activeSession(cart);
      runtime.thread.composer.setText(previous.draft);
      await connectAgent(previous).catch(() => {});
      setError(error.message);
    } finally {
      transitionLock.current = false;
      setSwitching(false);
    }
  }
  // Each AI observation: draw it on the TV, add it to the timeline, keep it as the cart label.
  useEffect(() => {
    const frame = game.testFrame;
    if (!frame) return;
    testCanvas.current
      ?.getContext("2d")
      .putImageData(
        new ImageData(new Uint8ClampedArray(frame.rgba), 128, 128),
        0,
        0,
      );
    if (game.activeCart) return;
    const url = rgbaToUrl(frame.rgba);
    setFrames((list) =>
      [
        ...list,
        {
          key: `${Date.now()}-${list.length}`,
          url,
          rgba: frame.rgba,
          frameId: frame.frameId,
          revision: game.revision,
        },
      ].slice(-18),
    );
    setLabel(url);
    persist({ label: url });
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
    adapters: {
      threadList: {
        threadId: project.current.activeSessionId,
        threads: project.current.sessions.map((session) => ({
          id: session.id,
          title: session.title,
          status: "regular",
        })),
        onSwitchToThread: selectSession,
        onSwitchToNewThread: () => selectSession(null),
        onRename: async (id, title) => {
          if (busy || transitionLock.current) return;
          const session = project.current.sessions.find((s) => s.id === id);
          if (!session || !title.trim()) return;
          session.title = title.trim().slice(0, 120);
          session.titleEdited = true;
          session.updatedAt = project.current.updatedAt = Date.now();
          refreshSessions((v) => v + 1);
          await flush();
        },
      },
    },
    messages: chat.messages,
    isRunning: running,
    isSendDisabled: !ready || cartLoading || game.booting || switching,
    onNew: async (m) => {
      const text = m.content
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      if (!inWorkbench) {
        saveComposerDraft(text);
        setCreation({ text });
        return;
      }
      await submitMessage(text);
    },
    onCancel: async () => {
      await agentRef.current.abort();
      setSending(false);
    },
  });
  useEffect(() => {
    runtime.thread.composer.setText(
      inWorkbench ? activeSession(project.current).draft : homeDraft.current,
    );
  }, [project.current.activeSessionId, inWorkbench]);
  async function selectCart(cart) {
    if (cartLock.current || !ready || running) return;
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
    if (!inWorkbench && !game.activeCart) return selectCart(carts[5]);
    return gameRef.current.play();
  }
  async function sendMessage(text) {
    if (sendLock.current || transitionLock.current || !ready || !text.trim())
      return;
    sendLock.current = true;
    setError("");
    setSending(true);
    setShowRestore(false);
    setInWorkbench(true);
    setView("preview");
    const session = activeSession(project.current);
    const title = text.trim().replace(/\s+/g, " ").slice(0, 120);
    persist({ active: true });
    persistSession({
      draft: "",
      title:
        session.transcript.length || session.titleEdited
          ? session.title
          : title,
    });
    runtime.thread.composer.setText("");
    try {
      await gameRef.current.restoreProject();
      await agentRef.current.send(text);
    } catch (e) {
      setError(readableError(e, config.apiKey));
    } finally {
      persistSession({
        lastSourceVersion: project.current.sourceVersion,
        interrupted: false,
      });
      await flush();
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
  /** Load another cart into the player and chat, optionally entering the workbench. */
  async function openCart(next, { enter = true } = {}) {
    if (transitionLock.current) throw new Error("A session is still opening");
    transitionLock.current = true;
    try {
      if (next.id === project.current.id) {
        await gameRef.current.restoreProject();
        runtime.thread.composer.setText(
          enter ? activeSession(next).draft : homeDraft.current,
        );
        setInWorkbench(enter);
        persist({ active: enter });
        return;
      }
      setSwitching(true);
      try {
        await flush();
        const previous = project.current;
        // A cart that never got content is not worth keeping.
        if (!previous.deleted && !isOnShelf(previous))
          void store.remove(previous.id).catch(() => {});
        project.current = next;
        gameRef.current.workspace.id = next.id;
        setFrames([]);
        setLabel(next.label ?? null);
        setShowRestore(!!activeSession(next).interrupted);
        setView("preview");
        setError("");
        runtime.thread.composer.setText(
          enter ? activeSession(next).draft : homeDraft.current,
        );
        await gameRef.current.switchProject(
          next.versions,
          next.revision,
          next.sourceDraft,
        );
        await connectAgent(activeSession(next));
        setInWorkbench(enter);
        persist({ active: enter });
      } finally {
        setSwitching(false);
      }
    } finally {
      transitionLock.current = false;
    }
  }
  async function resume(cart = shelf[0]) {
    if (cart) await openCart(cart, { enter: true });
  }
  function newBlankCart() {
    setCreation({ text: "" });
  }
  async function submitMessage(text) {
    if (!configured) {
      pendingRef.current = text;
      setPending(text);
      persistSession({ draft: text });
      runtime.thread.composer.setText(text);
      setSettings(true);
      return;
    }
    await sendMessage(text);
  }
  async function createNamedCart(name) {
    const text = creation.text;
    const cart = await store.createCart(name);
    activeSession(cart).draft = text;
    void requestPersistence();
    await openCart(cart);
    await flush();
    setCreation(null);
    if (text) {
      homeDraft.current = "";
      void store
        .setNavigation({ homeDraft: "" })
        .catch(() => setStorageError(true));
      await submitMessage(text);
    }
  }
  function markSaved(cart) {
    const savedAt = Date.now();
    if (cart.id === project.current.id) {
      Object.assign(project.current, { savedRevision: cart.revision, savedAt });
      void flush();
    } else {
      const next = { ...cart, savedRevision: cart.revision, savedAt };
      setShelf((list) => list.map((c) => (c.id === next.id ? next : c)));
      void store.put(next).catch(() => setStorageError(true));
    }
  }
  async function saveCart() {
    const rgba = frames.at(-1)?.rgba ?? (label ? await urlToRgba(label) : null);
    gameRef.current.export({ title: cartTitle, label: rgba });
    markSaved({ ...project.current, revision: game.revision });
  }
  async function saveShelfCart(cart) {
    const live = cart.id === project.current.id ? project.current : cart;
    downloadCart(live.versions.at(-1), {
      title: live.title,
      label: live.label ? await urlToRgba(live.label) : null,
    });
    markSaved(live);
  }
  async function duplicateShelfCart(cart) {
    const live = cart.id === project.current.id ? project.current : cart;
    const copy = duplicateCart(live);
    try {
      await store.put(copy);
      setShelf((list) => upsert(list, copy));
    } catch {
      setStorageError(true);
    }
  }
  async function deleteShelfCart(cart) {
    setShelf((list) => list.filter((c) => c.id !== cart.id));
    await store.remove(cart.id).catch(() => setStorageError(true));
    if (cart.id === project.current.id) {
      // Keep the player valid: fall back to a fresh, unsaved cart.
      const blank = newCart();
      project.current.deleted = true;
      await openCart(blank, { enter: false });
    }
  }
  function setPrompt(text) {
    runtime.thread.composer.setText(text);
    saveComposerDraft(text);
    document.getElementById("game-prompt")?.focus();
  }
  const playing = game.state === "running" && !game.testFrame;
  const cartTitle = project.current.title;
  const currentSession = activeSession(project.current);
  const hasConversation = chat.messages.length > 0;
  const lastCart = shelf[0] ?? null;
  const tokens = useMemo(() => countTokens(game.source ?? ""), [game.source]);
  const modelName =
    providers
      .find((p) => p.id === config.provider)
      ?.models.find((m) => m.id === config.model)?.name ?? config.model;
  const tool = currentTool(chat.messages, running);
  const pressing = tool?.toolName === "press_buttons" ? tool.args : null;
  const status = game.booting
    ? ["info", "POWERING ON"]
    : cartLoading
      ? ["info", "LOADING CART"]
      : running
        ? ["accent", "AI PLAYTESTING"]
        : game.testFrame
          ? ["success", "READY TO PLAY"]
          : playing
            ? ["info", "PLAYING"]
            : ["neutral", "PRESS PLAY"];
  const readout = running
    ? pressing
      ? `input ${formatButtons(pressing.buttons)} · ${pressing.frames ?? "?"} frames`
      : tool
        ? describeTool(tool).label.toLowerCase()
        : "thinking…"
    : `v${game.revision}${game.testFrame ? " · latest AI test frame" : ""}`;
  const hint = running
    ? "Your controls unlock when testing ends"
    : game.testFrame
      ? "Press play to take control"
      : "";
  const lastMessage = chat.messages.at(-1);
  const groups = [];
  for (const frame of frames) {
    if (groups.at(-1)?.revision === frame.revision)
      groups.at(-1).frames.push(frame);
    else groups.push({ revision: frame.revision, frames: [frame] });
  }
  const cartTile = (cart, i) => (
    <Cart
      key={cart.id}
      cart={cart}
      onSelect={selectCart}
      disabled={busy || !ready}
      active={game.activeCart?.id === cart.id}
      below={i < 3}
    />
  );
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ActivityContext.Provider
        value={{
          running,
          busy,
          canUndo: ready && game.canUndo,
          onUndo: safe(() => gameRef.current.undo()),
          onViewCode: () => setView("code"),
        }}
      >
        <div
          className={`app ${inWorkbench ? "studio-mode" : "home-mode"}`}
          style={{
            "--chat-fr": `${split}fr`,
            "--preview-fr": `${100 - split}fr`,
            "--sidebar-width": collapsed ? "48px" : "220px",
          }}
        >
          {inWorkbench ? (
            <WorkbenchHeader
              busy={busy}
              ready={ready}
              title={cartTitle}
              revision={game.revision}
              saveFailed={storageError}
              tokens={tokens}
              chars={game.source?.length ?? 0}
              view={view}
              onView={setView}
              canUndo={game.canUndo}
              onUndo={safe(() => gameRef.current.undo())}
              onSaveCart={safe(saveCart)}
              onHome={() => {
                persistSession({
                  draft: runtime.thread.composer.getState().text,
                });
                runtime.thread.composer.setText(homeDraft.current);
                setInWorkbench(false);
                persist({ active: false });
              }}
            />
          ) : (
            <HomeHeader
              busy={busy}
              canResume={!!lastCart}
              onResume={safe(resume)}
            />
          )}
          <main className="workspace">
            {inWorkbench && (
              <SessionSidebar
                collapsed={collapsed}
                onToggle={toggleSidebar}
                activeId={currentSession.id}
                disabled={busy || !ready}
                running={running}
                mobileOpen={mobileOpen}
                onMobileClose={() => setMobileOpen(false)}
              />
            )}
            {!inWorkbench && (
              <>
                <section className="home-intro">
                  <div className="hero-brand">
                    <span className="hero-logo">
                      <img src={`${BASE}assets/pico8-logo.png`} alt="PICO-8" />
                    </span>
                    <span className="maker-word">MAKER</span>
                    {game.activeCart ? (
                      <p className="now-playing">
                        <span>NOW PLAYING</span>
                        <strong>{game.activeCart.title}</strong>
                        <a
                          href={game.activeCart.page}
                          target="_blank"
                          rel="noreferrer"
                        >
                          by {game.activeCart.author} ↗
                        </a>
                      </p>
                    ) : (
                      <p className="tagline">
                        Describe a tiny game. AI writes the cart, playtests it,
                        and hands you the controls.
                      </p>
                    )}
                  </div>
                  <div className="cart-grid left-carts">
                    {carts.slice(0, 6).map(cartTile)}
                  </div>
                </section>
                <section
                  className="home-gallery"
                  aria-label="Community cartridges"
                >
                  <div className="your-cart">
                    <button
                      className="your-cart-art"
                      aria-label={
                        lastCart
                          ? `Continue ${lastCart.title}`
                          : "Make your own cart"
                      }
                      disabled={busy}
                      onClick={
                        lastCart
                          ? safe(resume)
                          : () =>
                              document.getElementById("game-prompt")?.focus()
                      }
                    >
                      <CartBody label={lastCart?.label} />
                    </button>
                    <div className="your-cart-text">
                      <span className="kicker">
                        {lastCart ? "LAST CART" : "YOUR CART"}
                      </span>
                      {lastCart ? (
                        <>
                          <strong title={lastCart.title}>
                            {lastCart.title}
                          </strong>
                          <small>
                            v{lastCart.revision} · {ago(lastCart.updatedAt)}
                          </small>
                          <button
                            className="continue-button"
                            disabled={busy}
                            onClick={safe(resume)}
                          >
                            CONTINUE <PixelArrow />
                          </button>
                        </>
                      ) : (
                        <>
                          <strong>Empty slot</strong>
                          <small>
                            Describe an idea below and it becomes your cart.
                          </small>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="cart-grid right-carts">
                    <div className="mobile-only-carts">
                      {carts.slice(0, 6).map(cartTile)}
                    </div>
                    {carts.slice(6, 11).map((cart, i) => cartTile(cart, i))}
                    <a
                      className="more-carts"
                      href="https://www.lexaloffle.com/bbs/?cat=7&carts_tab=1#mode=carts&sub=2"
                      target="_blank"
                      rel="noreferrer"
                    >
                      MORE
                      <br />
                      CARTS
                      <PixelArrow />
                    </a>
                  </div>
                </section>
              </>
            )}
            <ThreadPrimitive.Root className="chat-panel">
              {inWorkbench && (
                <div className="conversation-heading">
                  <button
                    className="mobile-conversations"
                    aria-label="Open conversations"
                    onClick={() => setMobileOpen(true)}
                  >
                    <PanelLeftOpen size={18} />
                  </button>
                  <span title={currentSession.title}>
                    {currentSession.title}
                  </span>
                </div>
              )}

              <ThreadPrimitive.Viewport
                key={currentSession.id}
                className="chat-viewport"
              >
                <ThreadPrimitive.Empty>
                  <div className="welcome">
                    <span className="kicker">
                      {inWorkbench ? "NEW SESSION" : "LET’S MAKE A LITTLE GAME"}
                    </span>
                    <h1>
                      {inWorkbench
                        ? "Keep building this cart."
                        : "Your idea. Your cartridge."}
                    </h1>
                    <p>
                      {inWorkbench
                        ? "This session has its own conversation. Your game and source are shared across sessions."
                        : "Describe a game, or play the preview and tell PICO-8 Maker what to change."}
                    </p>
                  </div>
                </ThreadPrimitive.Empty>
                <ThreadPrimitive.Messages
                  components={{ UserMessage, AssistantMessage }}
                />
                {running && lastMessage?.role !== "assistant" && (
                  <div className="working" role="status">
                    <i className="spinner" /> Thinking…
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
                {inWorkbench && showRestore && !running && (
                  <div className="restore-note" role="status">
                    <span>
                      The previous run was interrupted. Your conversation and
                      game were restored — send a message to continue.
                    </span>
                    <button
                      aria-label="Dismiss"
                      onClick={() => setShowRestore(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                {inWorkbench && hasConversation && !busy && (
                  <div className="next-ideas">
                    {nextIdeas.map((idea) => (
                      <button key={idea} onClick={() => setPrompt(idea)}>
                        {idea}
                      </button>
                    ))}
                  </div>
                )}
                <ComposerPrimitive.Root className="composer">
                  <ComposerPrimitive.Input
                    id="game-prompt"
                    placeholder={
                      inWorkbench
                        ? running
                          ? "AI is playtesting — press Stop to interrupt"
                          : "Describe a change…"
                        : "A frog hops across lily pads to catch flies before the sun sets…"
                    }
                    onChange={(e) => saveComposerDraft(e.target.value)}
                    aria-label="Message"
                    rows={2}
                  />
                  <div className="composer-footer">
                    <button
                      type="button"
                      className={`composer-model-button ${configured ? "" : "unconfigured"}`}
                      aria-label="Model settings"
                      title={
                        configured
                          ? `${providers.find((p) => p.id === config.provider)?.name ?? "Custom API"} · ${config.model}`
                          : "Choose a model and API key"
                      }
                      disabled={!ready || busy}
                      onClick={() => setSettings(true)}
                    >
                      {configured ? <i /> : <Settings size={14} />}
                      <span>{configured ? modelName : "Connect model"}</span>
                      <ChevronDown size={14} />
                    </button>
                    {running ? (
                      <ComposerPrimitive.Cancel
                        aria-label="Stop generation"
                        className="send stop"
                      >
                        <i />
                        STOP
                      </ComposerPrimitive.Cancel>
                    ) : (
                      <ComposerPrimitive.Send
                        aria-label="Send message"
                        className="send"
                      >
                        {inWorkbench ? (
                          <>
                            SEND <ArrowUp size={15} />
                          </>
                        ) : (
                          <>
                            {lastCart ? "MAKE NEW CART" : "MAKE"} <PixelPlay />
                          </>
                        )}
                      </ComposerPrimitive.Send>
                    )}
                  </div>
                </ComposerPrimitive.Root>
                {storageError && (
                  <div className="composer-note">
                    Local save failed. Save your cart to keep a copy.
                  </div>
                )}
              </div>
              {!inWorkbench && (
                <div className="prompt-examples">
                  <span className="kicker">TRY</span>
                  {homeIdeas.map(([labelText, color, text]) => (
                    <button key={labelText} onClick={() => setPrompt(text)}>
                      <i style={{ background: color }} />
                      {labelText}
                    </button>
                  ))}
                </div>
              )}
              {!inWorkbench && lastCart && (
                <p className="new-cart-hint">
                  A new idea always starts a new cart — your carts stay on the
                  shelf below.
                </p>
              )}
            </ThreadPrimitive.Root>
            {inWorkbench && (
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
                    const sidebarWidth =
                      e.currentTarget.parentElement
                        .querySelector(".session-sidebar")
                        ?.getBoundingClientRect().width ?? 0;
                    setSplit(
                      Math.max(
                        35,
                        Math.min(
                          72,
                          ((e.clientX - box.left - sidebarWidth) /
                            (box.width - sidebarWidth - 5)) *
                            100,
                        ),
                      ),
                    );
                  }
                }}
              />
            )}
            <section
              className={`player-panel ${inWorkbench ? "has-timeline" : ""}`}
              aria-label="Game preview"
            >
              {inWorkbench && (
                <div className="preview-header">
                  <span className={`status-badge status-${status[0]}`}>
                    <i />
                    {status[1]}
                  </span>
                  <span className="readout">{readout}</span>
                  {hint && <span className="preview-hint">{hint}</span>}
                </div>
              )}
              <div
                className={`stage ${inWorkbench && view === "code" ? "show-code" : ""}`}
              >
                <div className="console-group" ref={stage}>
                  <div className="console">
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
                      {inWorkbench && pressing && (
                        <span className="ai-input-tag">
                          {formatButtons(pressing.buttons)}
                        </span>
                      )}
                      {!playing && !busy && (
                        <button
                          disabled={!ready}
                          className={`play-overlay ${game.testFrame ? "over-frame" : ""}`}
                          aria-label="Start playing"
                          onClick={safe(playCurrent)}
                        >
                          {ready ? (
                            <img src={`${BASE}assets/pico8-play.png`} alt="" />
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
                      {game.booting
                        ? "POWERING ON…"
                        : cartLoading
                          ? "LOADING CARTRIDGE…"
                          : running
                            ? "AI IS PLAYTESTING"
                            : "ARROWS TO MOVE · Z / X TO PLAY"}
                    </p>
                  </div>
                  {inWorkbench && running && (
                    <div className="test-progress" aria-hidden="true" />
                  )}
                </div>
                {inWorkbench && view === "code" && (
                  <CodeView source={game.source ?? ""} tokens={tokens} />
                )}
              </div>
              {inWorkbench && (
                <section className="timeline" aria-label="Playtest frames">
                  <div className="timeline-head">
                    <h2>Playtest frames</h2>
                    <span>
                      {frames.length
                        ? `What the AI saw · ${frames.length} frames`
                        : "What the AI sees"}
                    </span>
                  </div>
                  {!groups.length && (
                    <p className="timeline-empty">
                      {running
                        ? "Waiting for the first test frame…"
                        : "Each time the AI presses buttons or looks at the screen, the real frame lands here."}
                    </p>
                  )}
                  <div className="timeline-strip">
                    {groups.map((group, i) => {
                      const last = i === groups.length - 1;
                      return (
                        <div className="run" key={group.frames[0].key}>
                          <span
                            className={`run-label ${last ? (running ? "live" : "latest") : ""}`}
                          >
                            V{group.revision}
                            {last ? (running ? " · LIVE" : " · LATEST") : ""}
                          </span>
                          <div className="run-frames">
                            {group.frames.map((frame) => (
                              <figure
                                key={frame.key}
                                className={
                                  frame === frames.at(-1) ? "current" : ""
                                }
                              >
                                <img src={frame.url} alt="AI playtest frame" />
                                <figcaption>
                                  f {frame.frameId ?? "–"}
                                </figcaption>
                              </figure>
                            ))}
                            {last && running && (
                              <figure className="pending">
                                <span>
                                  <i className="spinner" />
                                </span>
                                <figcaption>next</figcaption>
                              </figure>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </section>
          </main>
          {!inWorkbench && (
            <CartShelf
              carts={shelf}
              currentId={project.current.id}
              persistent={store.persistent}
              disabled={busy || !ready || switching}
              onOpen={(cart) => safe(() => openCart(cart, { enter: true }))()}
              onNew={safe(newBlankCart)}
              onSave={(cart) => safe(() => saveShelfCart(cart))()}
              onDuplicate={(cart) => safe(() => duplicateShelfCart(cart))()}
              onDelete={(cart) => safe(() => deleteShelfCart(cart))()}
            />
          )}
          {!inWorkbench && <HowItWorks />}
          {!inWorkbench && <HomeFooter />}
        </div>
        {creation && (
          <NameDialog
            title="Create a cart"
            label="Cart name"
            placeholder={store.defaultCartName()}
            hint={`Give your game a name. Leave blank to use ${store.defaultCartName()}.`}
            action="Create cart"
            onClose={() => {
              runtime.thread.composer.setText(homeDraft.current);
              setCreation(null);
            }}
            onSave={createNamedCart}
          />
        )}
        {settings && (
          <ModelSettings
            initial={config}
            onClose={closeSettings}
            pending={!!pending}
            onSave={saveConfig}
            onClear={clearConfig}
          />
        )}
      </ActivityContext.Provider>
    </AssistantRuntimeProvider>
  );
}
function CodeView({ source, tokens }) {
  const lines = source.split("\n");
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-view">
      <div className="code-head">
        <span>
          main.lua · {lines.length} lines · ≈{tokens} tokens
        </span>
        <button
          onClick={async () => {
            await navigator.clipboard?.writeText(source);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          <Copy size={13} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>
          {lines.map((line, i) => (
            <span key={i} className="code-line">
              {line || " "}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function Cart({ cart, onSelect, disabled, active, below }) {
  return (
    <button
      className={`cart ${active ? "selected" : ""} ${below ? "tip-below" : ""}`}
      onClick={() => onSelect(cart)}
      disabled={disabled}
      aria-label={`Play ${cart.title} by ${cart.author}`}
      aria-pressed={active}
    >
      <img src={cartridgeImage(cart.id)} alt="" draggable="false" />
      <span className="cart-credit" aria-hidden="true">
        <strong>{cart.title}</strong>
        <small>by {cart.author}</small>
        <em>Click to play here</em>
      </span>
    </button>
  );
}
