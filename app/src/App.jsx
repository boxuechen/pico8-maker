import { ResourcesView } from "./ResourcesView.jsx";
import { CartVersion } from "./CartVersion.jsx";
import {
  HomeHeader,
  WorkbenchHeader,
  WorkspaceViewSwitch,
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
import { cartridgeImage, cartridgeBytes } from "./cartridges.js";
import { t, useLang } from "./i18n.js";
import { readCartBytes } from "./pico8/import.js";
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
  Upload,
} from "lucide-react";
import {
  openCartStore,
  memoryBackend,
  newCart,
  isOnShelf,
  sortCarts,
  duplicateCart,
  requestPersistence,
  saveStatus,
  titleFromPrompt,
  importedCart,
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
import { emptySnapshot, sameSnapshot } from "./pico8/assets.js";
import { Game } from "./game.js";
import { Agent } from "./agent.js";
import {
  providers,
  defaultConfig,
  normalizeConfig,
  validateConfig,
  probeConnection,
  readableError,
  thinkingOptions,
} from "./model-config.js";

import {
  readModelConfig,
  writeModelConfig,
  clearModelConfig,
} from "./model-store.js";

const BASE = import.meta.env.BASE_URL;
const convertMessage = (message) => message;
function ModelSettings({ initial, onSave, onClear, onClose, pending }) {
  const { t } = useLang();
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
  const thinking = thinkingOptions(form);
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
      thinkingLevel: form.thinkingLevel ?? defaultConfig.thinkingLevel,
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
          <h2>{t("connectYourModel")}</h2>
          <button
            type="button"
            aria-label={t("closeSettings")}
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        <p>{t("connectIntro")}</p>
        <label>
          {t("provider")}
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
            <option value="custom">{t("customApi")}</option>
          </select>
        </label>
        {preset?.models.length > 12 && (
          <label>
            {t("findModel")}
            <input
              type="search"
              placeholder={t("searchModels")}
              value={modelSearch}
              disabled={busy}
              onChange={(e) => setModelSearch(e.target.value)}
            />
          </label>
        )}
        {preset && (
          <label>
            {t("model")}
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
            {t("modelCount", { n: preset.models.length })}
          </p>
        )}
        {!preset && (
          <label>
            {t("baseUrl")}
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
          {t("apiKey")}
          <input
            required
            type="password"
            disabled={busy}
            autoComplete="off"
            placeholder={t("enterApiKey")}
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />
        </label>
        {!preset && (
          <label>
            {t("modelId")}
            <input
              required
              placeholder={t("modelIdPlaceholder")}
              disabled={busy}
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </label>
        )}
        {!preset && (
          <>
            <label>
              {t("contextWindow")}
              <input
                type="number"
                min="1"
                step="1"
                required
                disabled={busy}
                value={form.contextWindow ?? 128000}
                onChange={(e) =>
                  setForm({ ...form, contextWindow: e.target.value })
                }
              />
            </label>
            <label>
              {t("maxOutput")}
              <input
                type="number"
                min="1"
                step="1"
                required
                disabled={busy}
                value={form.maxTokens ?? 32768}
                onChange={(e) =>
                  setForm({ ...form, maxTokens: e.target.value })
                }
              />
            </label>
            <p className="model-detail">{t("customLimits")}</p>
          </>
        )}
        <label>
          {t("thinkingLevel")}
          <select
            value={thinking.level}
            disabled={busy || thinking.levels.length === 1}
            onChange={(e) =>
              setForm({ ...form, thinkingLevel: e.target.value })
            }
          >
            {thinking.levels.map((level) => (
              <option key={level} value={level}>
                {t("levels")[level]}
              </option>
            ))}
          </select>
        </label>
        <p className="model-detail">
          {thinking.levels.length === 1 && thinking.level === "off"
            ? t("noThinking")
            : t("thinkingHint")}
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={remember}
            disabled={busy}
            onChange={(e) => setRemember(e.target.checked)}
          />
          {t("remember")}
        </label>
        <p className="fine-print">
          {t("finePrint", { url: preset ? form.baseUrl : t("yourEndpoint") })}
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
              setNotice(t("cleared"));
            } catch {
              setNotice(t("clearFailed"));
            }
          }}
        >
          {t("clearSaved")}
        </button>
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            onClick={test}
            disabled={busy}
          >
            {busy ? <LoaderCircle className="spin" size={16} /> : null}
            {t("testConnection")}
          </button>
          <button className="primary" disabled={busy}>
            {pending ? t("saveAndStart") : t("saveSettings")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// The bundled Maker-built example: playable on the home TV and remixable.
const showcase = {
  id: "showcase-lodge-podge",
  title: "Lodge Podge",
  fileName: "lodge-podge.p8",
  fileUrl: `${BASE}case-studies/lodge-podge/final.p8`,
  label: `${BASE}case-studies/lodge-podge/start.png`,
  page: "https://github.com/boxuechen/pico8-maker/blob/main/docs/lodge-podge-case-study.md",
  showcase: true,
};
const isCartFile = (name) =>
  /\.p8(\.png)?$/i.test(name) || /\.png$/i.test(name);
const defaultSessionTitles = new Set(["New session", "New conversation"]);
const sessionTitle = (session) =>
  !session.titleEdited && defaultSessionTitles.has(session.title)
    ? t("newConversation")
    : session.title;
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

const contentKeys = ["versions", "revision", "workingDraft", "label", "title"];
const upsert = (list, cart) =>
  sortCarts([{ ...cart }, ...list.filter((c) => c.id !== cart.id)]);

function Studio({ store }) {
  useLang();
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
  // Home prompt waiting for a model connection before its cart is created.
  const pendingCreate = useRef(null);
  const [renamingCart, setRenamingCart] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [dragging, setDragging] = useState(false);
  const filePicker = useRef(null);
  const importMode = useRef("preview");
  function showToast(message, action = null) {
    clearTimeout(toastTimer.current);
    setToast({ message, action, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), action ? 7000 : 4000);
  }
  function toggleSidebar() {
    setCollapsed((value) => {
      void store
        .setNavigation({ sidebarCollapsed: !value })
        .catch(() => setStorageError(true));
      return !value;
    });
  }
  const [view, setView] = useState("preview");
  const [inspectionVersion, setInspectionVersion] = useState("draft");
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
      ("workingDraft" in patch &&
        JSON.stringify(patch.workingDraft) !==
          JSON.stringify(project.current.workingDraft)) ||
      ("revision" in patch && patch.revision !== project.current.revision)
    )
      project.current.contentVersion++;
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
    source: project.current.versions.at(-1)?.source ?? "",
    draft:
      project.current.workingDraft ??
      project.current.versions.at(-1) ??
      emptySnapshot(),
    snapshot: project.current.versions.at(-1) ?? emptySnapshot(),
    hasGame: project.current.versions.length > 0,
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
  const busy =
    running || cartLoading || game.booting || game.previewLoading || switching;
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
        draft: project.current.workingDraft,
        playtests: project.current.playtests,
        onPlaytests: (playtests) => persist({ playtests }),
        comparison: project.current.comparison,
        onComparison: (comparison) => persist({ comparison }),
        onSave: (versions, revision) =>
          persist({ versions, revision, savedRevision: null }),
        onDraft: (text) => persist({ workingDraft: text }),
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
    const captured = game.testFrames?.length ? game.testFrames : [frame];
    setFrames((list) =>
      [
        ...list,
        ...captured.map((sample, i) => ({
          key: `${Date.now()}-${list.length}-${i}`,
          url: sample === frame ? url : rgbaToUrl(sample.rgba),
          rgba: sample.rgba,
          frameId: sample.frameId,
          revision: game.revision,
        })),
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
          title: sessionTitle(session),
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
        await startFromHome(text);
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
      setError(t("couldNotPlay", { title: cart.title, message: e.message }));
    } finally {
      cartLock.current = false;
      setCartLoading(false);
    }
  }
  async function playCurrent() {
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
      await agentRef.current.send(text);
    } catch (e) {
      setError(readableError(e, config.apiKey));
    } finally {
      persistSession({
        lastContentVersion: project.current.contentVersion,
        interrupted: false,
      });
      await flush();
      sendLock.current = false;
      setSending(false);
    }
  }
  function closeSettings() {
    setSettings(false);
    pendingCreate.current = null;
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
      throw new Error(t("settingsSaveFailed"));
    }
    configRef.current = next;
    setConfig(next);
    setConfigured(true);
    setSettings(false);
    const text = pendingRef.current;
    const create = pendingCreate.current;
    pendingRef.current = "";
    pendingCreate.current = null;
    setPending("");
    if (create != null) void safe(() => createCart(create))();
    else if (text) void sendMessage(text);
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
        setInspectionVersion("draft");
        setError("");
        runtime.thread.composer.setText(
          enter ? activeSession(next).draft : homeDraft.current,
        );
        await gameRef.current.switchProject(
          next.versions,
          next.revision,
          next.workingDraft,
          next.playtests,
          next.comparison,
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
    return createCart("");
  }
  /** Home MAKE: connect a model first, then create a cart named after the idea. */
  async function startFromHome(text) {
    if (!text.trim()) return;
    if (!configured) {
      pendingCreate.current = text;
      pendingRef.current = text;
      setPending(text);
      runtime.thread.composer.setText(text);
      setSettings(true);
      return;
    }
    await createCart(text);
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
  async function createCart(text) {
    const cart = await store.createCart(
      titleFromPrompt(text),
      t("defaultCartName"),
    );
    activeSession(cart).draft = text;
    void requestPersistence();
    await openCart(cart);
    await flush();
    if (text.trim()) {
      homeDraft.current = "";
      void store
        .setNavigation({ homeDraft: "" })
        .catch(() => setStorageError(true));
      // The model is connected by now: startFromHome and saveConfig check first.
      await sendMessage(text);
    }
  }
  async function renameCart(cart, name) {
    const title = name.trim().slice(0, 120);
    if (!title) throw new Error(t("enterCartName"));
    if (cart.id === project.current.id) {
      persist({ title, named: true });
      await flush();
      refreshSessions((v) => v + 1);
      return;
    }
    const next = { ...cart, title, named: true, updatedAt: Date.now() };
    setShelf((list) => upsert(list, next));
    await store.put(next).catch(() => setStorageError(true));
  }
  async function saveAllCarts() {
    for (const cart of shelf.filter((c) => saveStatus(c) === "unsaved")) {
      await saveShelfCart(cart);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  /** Read a dropped or picked file and play it on the home TV. */
  async function openCartFile(file, mode = importMode.current) {
    if (!file) return;
    if (!isCartFile(file.name)) throw new Error(t("unsupportedFile"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    let parsed;
    try {
      parsed = await readCartBytes(bytes);
    } catch (e) {
      throw new Error(t("importFailed", { message: e.message }));
    }
    const title =
      parsed.title.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) ||
      file.name.replace(/\.p8(\.png)?$|\.png$/i, "").trim() ||
      "Untitled cartridge";
    if (mode === "import") {
      await addToShelf(parsed, { title, origin: null });
      showToast(t("imported", { title }));
      return;
    }
    await selectCart({
      id: `file-${Date.now()}`,
      title,
      author: t("localFile"),
      bytes,
      fileName: file.name,
      local: true,
      parsed,
    });
  }
  async function addToShelf(parsed, { title, origin, label }) {
    const cart = importedCart({
      title,
      snapshot: parsed.snapshot,
      label: parsed.label ? rgbaToUrl(parsed.label) : (label ?? null),
      origin,
    });
    await store.put(cart);
    setShelf((list) => upsert(list, cart));
    return cart;
  }
  /** Copy the cart playing on the TV into My carts and open it in the workbench. */
  async function remixCart(source) {
    if (!source) return;
    const bytes =
      source.bytes ??
      (source.fileUrl
        ? new Uint8Array(await (await fetch(source.fileUrl)).arrayBuffer())
        : cartridgeBytes(source.id));
    const parsed = source.parsed ?? (await readCartBytes(bytes));
    const cart = await addToShelf(parsed, {
      title: source.local
        ? source.title
        : t("remixName", { title: source.title }),
      origin: source.local
        ? null
        : {
            title: source.title,
            author: source.author,
            page: source.page ?? null,
          },
      label: source.label,
    });
    await openCart(cart);
    showToast(
      source.local || source.showcase
        ? t("imported", { title: cart.title })
        : t("remixed", { title: source.title, author: source.author }),
    );
  }
  async function playShowcase() {
    const bytes = new Uint8Array(
      await (await fetch(showcase.fileUrl)).arrayBuffer(),
    );
    await selectCart({ ...showcase, author: t("showcaseAuthor"), bytes });
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
    if (!gameRef.current.hasGame) return;
    const rgba = frames.at(-1)?.rgba ?? (label ? await urlToRgba(label) : null);
    gameRef.current.export({ title: cartTitle, label: rgba });
    markSaved({ ...project.current, revision: game.revision });
  }
  async function saveShelfCart(cart) {
    const live = cart.id === project.current.id ? project.current : cart;
    if (!live.versions.length) return;
    downloadCart(live.versions.at(-1), {
      title: live.title,
      label: live.label ? await urlToRgba(live.label) : null,
    });
    markSaved(live);
  }
  async function duplicateShelfCart(cart) {
    const live = cart.id === project.current.id ? project.current : cart;
    const copy = duplicateCart(live, t("copySuffix"));
    try {
      await store.put(copy);
      setShelf((list) => upsert(list, copy));
      showToast(t("duplicated", { title: copy.title }));
    } catch {
      setStorageError(true);
    }
  }
  async function deleteShelfCart(cart) {
    const live = cart.id === project.current.id ? project.current : cart;
    // A plain copy restores the cart exactly if the user undoes the delete.
    const backup = JSON.parse(JSON.stringify({ ...live, deleted: undefined }));
    setShelf((list) => list.filter((c) => c.id !== cart.id));
    await store.remove(cart.id).catch(() => setStorageError(true));
    if (cart.id === project.current.id) {
      // Keep the player valid: fall back to a fresh, unsaved cart.
      const blank = newCart();
      project.current.deleted = true;
      await openCart(blank, { enter: false });
    }
    showToast(t("deleted", { title: cart.title }), {
      label: t("undo"),
      run: async () => {
        await store.put(backup);
        setShelf((list) => upsert(list, backup));
      },
    });
  }
  function setPrompt(text) {
    runtime.thread.composer.setText(text);
    saveComposerDraft(text);
    document.getElementById("game-prompt")?.focus();
  }
  const hasPlayable = game.hasGame || !!game.activeCart;
  const playing = hasPlayable && game.state === "running" && !game.testFrame;
  const cartTitle = project.current.title;
  const currentSession = activeSession(project.current);
  const hasConversation = chat.messages.length > 0;
  const lastCart = shelf[0] ?? null;
  const version = game.hasGame ? inspectionVersion : "draft";
  const inspected = version === "committed" ? game.snapshot : game.draft;
  const meterSource =
    view === "preview"
      ? (game.previewSource ?? game.source ?? "")
      : inspected.source;
  const tokens = useMemo(() => countTokens(meterSource), [meterSource]);
  const versionProps = {
    value: version,
    onChange: setInspectionVersion,
    hasGame: game.hasGame,
    revision: game.revision,
    dirty: !sameSnapshot(game.draft, game.snapshot),
  };
  const modelName =
    providers
      .find((p) => p.id === config.provider)
      ?.models.find((m) => m.id === config.model)?.name ?? config.model;
  const tool = currentTool(chat.messages, running);
  const pressing = tool?.toolName === "press_buttons" ? tool.args : null;
  const status = game.booting
    ? ["info", t("stPoweringOn")]
    : cartLoading
      ? ["info", t("stLoadingCart")]
      : running
        ? ["accent", game.hasGame ? t("stPlaytesting") : t("stCreating")]
        : !hasPlayable
          ? ["neutral", t("stNoGame")]
          : game.testFrame
            ? ["success", t("stReady")]
            : playing
              ? ["info", t("stPlaying")]
              : ["neutral", t("stPressPlay")];
  const readout = running
    ? pressing
      ? (() => {
          const detail = describeTool({
            toolName: "press_buttons",
            args: pressing,
          });
          return `${detail.label.toLowerCase()} · ${detail.meta}`;
        })()
      : tool
        ? describeTool(tool).label.toLowerCase()
        : t("thinking").toLowerCase()
    : game.hasGame
      ? `v${game.previewVersion === "before" ? game.comparisonRevision : game.revision}${game.testFrame ? ` · ${t("latestFrame")}` : ""}`
      : "";
  const hint = running
    ? t("hintRunning")
    : game.testFrame
      ? t("hintTestFrame")
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
          onDragOver={(e) => {
            if (inWorkbench || !e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.relatedTarget) setDragging(false);
          }}
          onDrop={(e) => {
            if (inWorkbench) return;
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            void safe(() => openCartFile(file, "preview"))();
          }}
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
              hasGame={game.hasGame}
              saveFailed={storageError}
              tokens={tokens}
              chars={meterSource.length}
              view={view}
              onView={setView}
              canUndo={game.canUndo}
              onUndo={safe(() => gameRef.current.undo())}
              onSaveCart={safe(saveCart)}
              onRename={(name) =>
                safe(() => renameCart(project.current, name))()
              }
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
            <HomeHeader hasCarts={shelf.length > 0} />
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
                      <div className="now-playing">
                        <span>{t("nowPlaying")}</span>
                        <strong>{game.activeCart.title}</strong>
                        <span className="now-playing-meta">
                          {game.activeCart.page ? (
                            <a
                              href={game.activeCart.page}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("byAuthor", {
                                author: game.activeCart.author,
                              })}{" "}
                              ↗
                            </a>
                          ) : (
                            <small>
                              {game.activeCart.local
                                ? t("localFile")
                                : t("byAuthor", {
                                    author: game.activeCart.author,
                                  })}
                            </small>
                          )}
                          <button
                            className="remix-button"
                            disabled={busy || !ready}
                            title={t("remixTitle")}
                            onClick={safe(() => remixCart(game.activeCart))}
                          >
                            {game.activeCart.local ? (
                              <Upload size={13} />
                            ) : (
                              <PixelPlay size={11} />
                            )}
                            {game.activeCart.local
                              ? t("importShort")
                              : t("remix")}
                          </button>
                        </span>
                      </div>
                    ) : (
                      <p className="tagline">{t("tagline")}</p>
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
                          ? t("continueCart", { title: lastCart.title })
                          : t("makeOwnCart")
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
                        {lastCart ? t("lastCart") : t("yourCart")}
                      </span>
                      {lastCart ? (
                        <>
                          <strong title={lastCart.title}>
                            {lastCart.title}
                          </strong>
                          <small>
                            {lastCart.versions.length
                              ? `v${lastCart.revision}`
                              : t("emptyCart")}{" "}
                            · {ago(lastCart.updatedAt)}
                          </small>
                          <button
                            className="continue-button"
                            disabled={busy}
                            onClick={safe(resume)}
                          >
                            {t("continue")} <PixelArrow />
                          </button>
                        </>
                      ) : (
                        <>
                          <strong>{t("emptySlot")}</strong>
                          <small>{t("emptySlotHint")}</small>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="cart-grid right-carts">
                    <div className="mobile-only-carts">
                      {carts.slice(0, 6).map(cartTile)}
                    </div>
                    {carts.slice(6).map((cart, i) => cartTile(cart, i))}
                    <a
                      className="more-carts"
                      href="https://www.lexaloffle.com/bbs/?cat=7&carts_tab=1#mode=carts&sub=2"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>{t("moreCarts")}</span>
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
                    aria-label={t("openConversations")}
                    onClick={() => setMobileOpen(true)}
                  >
                    <PanelLeftOpen size={18} />
                  </button>
                  <span title={sessionTitle(currentSession)}>
                    {sessionTitle(currentSession)}
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
                      {inWorkbench
                        ? t("welcomeNewKicker")
                        : t("welcomeHomeKicker")}
                    </span>
                    <h1>
                      {inWorkbench
                        ? game.hasGame
                          ? t("welcomeKeep")
                          : t("welcomeFirst")
                        : t("welcomeHome")}
                    </h1>
                    <p>
                      {inWorkbench
                        ? game.hasGame
                          ? t("welcomeKeepBody")
                          : t("welcomeFirstBody")
                        : t("welcomeHomeBody")}
                    </p>
                  </div>
                </ThreadPrimitive.Empty>
                <ThreadPrimitive.Messages
                  components={{ UserMessage, AssistantMessage }}
                />
                {running && lastMessage?.role !== "assistant" && (
                  <div className="working" role="status">
                    <i className="spinner" /> {t("thinking")}
                  </div>
                )}
              </ThreadPrimitive.Viewport>
              <div className="composer-area">
                {(error || chat.error) && (
                  <div role="alert" className="error">
                    {error || chat.error}
                    <button
                      aria-label={t("dismissError")}
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
                    <span>{t("restored")}</span>
                    <button
                      aria-label={t("dismiss")}
                      onClick={() => setShowRestore(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                {inWorkbench && hasConversation && !busy && (
                  <div className="next-ideas">
                    {t("nextIdeas").map((idea) => (
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
                          ? t("placeholderRunning")
                          : t("placeholderChange")
                        : t("placeholderHome")
                    }
                    onChange={(e) => saveComposerDraft(e.target.value)}
                    aria-label={t("message")}
                    rows={2}
                  />
                  <div className="composer-footer">
                    <button
                      type="button"
                      className={`composer-model-button ${configured ? "" : "unconfigured"}`}
                      aria-label={t("modelSettings")}
                      title={
                        configured
                          ? `${providers.find((p) => p.id === config.provider)?.name ?? "Custom API"} · ${config.model}`
                          : t("connectModelTitle")
                      }
                      disabled={!ready || busy}
                      onClick={() => setSettings(true)}
                    >
                      {configured ? <i /> : <Settings size={14} />}
                      <span>{configured ? modelName : t("connectModel")}</span>
                      <ChevronDown size={14} />
                    </button>
                    {running ? (
                      <ComposerPrimitive.Cancel
                        aria-label={t("stopGeneration")}
                        className="send stop"
                      >
                        <i />
                        {t("stop")}
                      </ComposerPrimitive.Cancel>
                    ) : (
                      <ComposerPrimitive.Send
                        aria-label={t("sendMessage")}
                        className="send"
                      >
                        {inWorkbench ? (
                          <>
                            {t("send")} <ArrowUp size={15} />
                          </>
                        ) : (
                          <>
                            {lastCart ? t("makeNew") : t("make")} <PixelPlay />
                          </>
                        )}
                      </ComposerPrimitive.Send>
                    )}
                  </div>
                </ComposerPrimitive.Root>
                {storageError && (
                  <div className="composer-note">{t("localSaveFailed")}</div>
                )}
              </div>
              {!inWorkbench && (
                <div className="prompt-examples">
                  <span className="kicker">{t("tryLabel")}</span>
                  {t("ideas").map(([labelText, color, text]) => (
                    <button key={labelText} onClick={() => setPrompt(text)}>
                      <i style={{ background: color }} />
                      {labelText}
                    </button>
                  ))}
                </div>
              )}
              {!inWorkbench && (
                <p className="new-cart-hint">
                  {lastCart && <>{t("newCartHint")} </>}
                  {t("dropHint")}{" "}
                  <button
                    className="link-button"
                    disabled={busy || !ready}
                    onClick={() => {
                      importMode.current = "preview";
                      filePicker.current?.click();
                    }}
                  >
                    {t("openFile")}
                  </button>
                  .
                </p>
              )}
              {!inWorkbench && (
                <section className="showcase" aria-label={t("showcaseKicker")}>
                  <img
                    className="showcase-art"
                    src={showcase.label}
                    alt=""
                    width="72"
                    height="72"
                  />
                  <div className="showcase-text">
                    <span className="kicker">{t("showcaseKicker")}</span>
                    <strong>{t("showcaseTitle")}</strong>
                    <p>{t("showcaseBody")}</p>
                  </div>
                  <div className="showcase-actions">
                    <button
                      className="continue-button"
                      disabled={busy || !ready}
                      onClick={safe(playShowcase)}
                    >
                      <PixelPlay size={11} /> {t("showcasePlay")}
                    </button>
                    <button
                      className="continue-button"
                      disabled={busy || !ready}
                      title={t("remixTitle")}
                      onClick={safe(() =>
                        remixCart({
                          ...showcase,
                          author: t("showcaseAuthor"),
                        }),
                      )}
                    >
                      {t("remix")}
                    </button>
                    <a href={showcase.page} target="_blank" rel="noreferrer">
                      {t("showcaseHow")} ↗
                    </a>
                  </div>
                </section>
              )}
            </ThreadPrimitive.Root>
            {inWorkbench && (
              <div
                className="panel-divider"
                role="separator"
                aria-label={t("resizeChat")}
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
              aria-label={t("gamePreview")}
            >
              {inWorkbench && (
                <div className="preview-header">
                  <span className={`status-badge status-${status[0]}`}>
                    <i />
                    {status[1]}
                  </span>
                  <span className="readout">{readout}</span>
                  {hint && <span className="preview-hint">{hint}</span>}
                  {view === "preview" && game.comparisonRevision != null && (
                    <select
                      className="preview-version"
                      aria-label={t("previewVersion")}
                      title={t("previewVersionTitle")}
                      value={game.previewVersion ?? "current"}
                      disabled={busy}
                      onChange={(e) =>
                        safe(() =>
                          gameRef.current.previewComparison(e.target.value),
                        )()
                      }
                    >
                      <option value="current">
                        {t("currentV", { n: game.revision })}
                      </option>
                      <option value="before">
                        {t("beforeV", { n: game.comparisonRevision })}
                      </option>
                    </select>
                  )}
                  <WorkspaceViewSwitch
                    view={view}
                    onView={setView}
                    className="mobile-view-switch"
                  />
                </div>
              )}
              <div
                className={`stage ${inWorkbench && view !== "preview" ? "show-code" : ""}`}
              >
                <div className="console-group" ref={stage}>
                  <div className="console">
                    <div className="screen">
                      <div ref={mount} className="player-mount" />
                      {!hasPlayable && !game.booting && (
                        <div className="empty-preview" role="status">
                          <span>{t("gameGoesHere")}</span>
                          <small>
                            {running
                              ? t("creatingFirst")
                              : t("describeToStart")}
                          </small>
                        </div>
                      )}
                      {game.testFrame && (
                        <canvas
                          ref={testCanvas}
                          width={128}
                          height={128}
                          className="test-screen"
                          aria-label={t("actualFrame")}
                        />
                      )}
                      {game.booting && <BootScreen />}
                      {inWorkbench && pressing && (
                        <span className="ai-input-tag">
                          {formatButtons(pressing.buttons)}
                        </span>
                      )}
                      {hasPlayable && !playing && !busy && (
                        <button
                          disabled={!ready}
                          className={`play-overlay ${game.testFrame ? "over-frame" : ""}`}
                          aria-label={t("startPlaying")}
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
                      aria-label={t("shell")}
                    />
                    <div className="player-controls">
                      <button
                        aria-label={playing ? t("pause") : t("play")}
                        disabled={!ready || busy || !hasPlayable}
                        onClick={safe(playCurrent)}
                      >
                        {playing ? <Pause size={20} /> : <Play size={20} />}
                      </button>
                      <button
                        aria-label={t("restart")}
                        disabled={!ready || busy || !hasPlayable}
                        onClick={safe(() => gameRef.current.restart())}
                      >
                        <RotateCcw size={19} />
                      </button>
                      <span className="control-divider" />
                      <button
                        aria-label={game.muted ? t("unmute") : t("mute")}
                        disabled={!ready || busy || !hasPlayable}
                        onClick={() => gameRef.current.mute()}
                      >
                        {game.muted ? (
                          <VolumeX size={20} />
                        ) : (
                          <Volume2 size={20} />
                        )}
                      </button>
                      <button
                        aria-label={t("fullscreen")}
                        onClick={safe(async () => {
                          try {
                            if (document.fullscreenElement)
                              await document.exitFullscreen();
                            else await stage.current.requestFullscreen();
                          } catch {
                            throw new Error(t("fullscreenFailed"));
                          }
                        })}
                      >
                        <Maximize size={20} />
                      </button>
                    </div>
                    <p className="player-help">
                      {game.booting
                        ? t("helpPowering")
                        : cartLoading
                          ? t("helpLoading")
                          : !hasPlayable
                            ? t("helpWaiting")
                            : running
                              ? t("helpTesting")
                              : t("helpControls")}
                    </p>
                  </div>
                  {inWorkbench && running && (
                    <div className="test-progress" aria-hidden="true" />
                  )}
                </div>
                {inWorkbench && view === "code" && (
                  <CodeView
                    source={inspected.source}
                    versionProps={versionProps}
                  />
                )}
                {inWorkbench && view === "resources" && (
                  <ResourcesView
                    key={project.current.id}
                    current={inspected}
                    versionProps={versionProps}
                  />
                )}
              </div>
              {inWorkbench && (
                <section
                  className={`timeline ${groups.length ? "" : "empty"}`}
                  aria-label={t("playtestFrames")}
                >
                  <div className="timeline-head">
                    <h2>{t("playtestFrames")}</h2>
                    <span>
                      {frames.length
                        ? t("framesSeen", { n: frames.length })
                        : t("framesEmpty")}
                    </span>
                  </div>
                  {!groups.length && (
                    <p className="timeline-empty">
                      {running ? t("framesWaiting") : t("framesHint")}
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
                            {last
                              ? ` · ${running ? t("live") : t("latest")}`
                              : ""}
                          </span>
                          <div className="run-frames">
                            {group.frames.map((frame) => (
                              <figure
                                key={frame.key}
                                className={
                                  frame === frames.at(-1) ? "current" : ""
                                }
                              >
                                <img src={frame.url} alt={t("frameAlt")} />
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
                                <figcaption>{t("next")}</figcaption>
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
              onImport={() => {
                importMode.current = "import";
                filePicker.current?.click();
              }}
              onSaveAll={safe(saveAllCarts)}
              onRename={setRenamingCart}
              onSave={(cart) => safe(() => saveShelfCart(cart))()}
              onDuplicate={(cart) => safe(() => duplicateShelfCart(cart))()}
              onDelete={(cart) => safe(() => deleteShelfCart(cart))()}
            />
          )}
          {!inWorkbench && <HowItWorks />}
          {!inWorkbench && <HomeFooter />}
        </div>
        {!inWorkbench && dragging && (
          <div className="drop-overlay" aria-hidden="true">
            <div>
              <Upload size={28} />
              <strong>{t("dropTitle")}</strong>
              <span>{t("dropBody")}</span>
            </div>
          </div>
        )}
        <input
          ref={filePicker}
          className="cart-file-input"
          type="file"
          accept=".p8,.png"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void safe(() => openCartFile(file))();
          }}
        />
        {toast && (
          <div className="toast" role="status" key={toast.key}>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  const { run } = toast.action;
                  setToast(null);
                  void safe(run)();
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              className="toast-close"
              aria-label={t("dismiss")}
              onClick={() => setToast(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {renamingCart && (
          <NameDialog
            title={t("renameCart")}
            label={t("renameCartLabel")}
            initial={renamingCart.title}
            hint={t("renameCartHint")}
            action={t("saveName")}
            onClose={() => setRenamingCart(null)}
            onSave={async (name) => {
              await renameCart(renamingCart, name);
              setRenamingCart(null);
            }}
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
function CodeView({ source, versionProps }) {
  const lines = source.split("\n");
  const tokens = useMemo(() => countTokens(source), [source]);
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-view">
      <CartVersion title={t("viewCode")} {...versionProps} />
      <div className="code-head">
        <span>{t("codeHead", { lines: lines.length, tokens })}</span>
        <button
          onClick={async () => {
            await navigator.clipboard?.writeText(source);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          <Copy size={13} /> {copied ? t("copied") : t("copy")}
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

function Cart({ cart, onSelect, disabled, active }) {
  return (
    <button
      className={`cart ${active ? "selected" : ""}`}
      onClick={() => onSelect(cart)}
      disabled={disabled}
      aria-label={t("playCart", { title: cart.title, author: cart.author })}
      aria-pressed={active}
    >
      <span className="cart-frame">
        <img src={cartridgeImage(cart.id)} alt="" draggable="false" />
        <span className="cart-credit" aria-hidden="true">
          <strong>{cart.title}</strong>
          <small>{t("byAuthor", { author: cart.author })}</small>
        </span>
      </span>
    </button>
  );
}
