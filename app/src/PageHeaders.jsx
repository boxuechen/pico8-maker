import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Pencil, Undo2 } from "lucide-react";
import { useLang } from "./i18n.js";
import { CHAR_LIMIT, TOKEN_LIMIT } from "./pico8/tokens.js";

const BASE = import.meta.env.BASE_URL;
const links = [
  ["Player", "https://boxuechen.github.io/pico8-player/"],
  ["GitHub", "https://github.com/boxuechen/pico8-maker"],
  ["X", "https://x.com/boxuechen"],
];

export function FloppyIcon({ size = 16 }) {
  return (
    <svg
      className="pixel-icon"
      width={size}
      height={size}
      viewBox="0 0 10 10"
      aria-hidden="true"
    >
      <path d="M0 0h9l1 1v9H0z" fill="currentColor" />
      <path d="M2 0h5v3H2zM2 5h6v5H2z" fill="var(--icon-cut, #0a1020)" />
      <path d="M5 1h1v1H5zM3 6h4v1H3zM3 8h4v1H3z" fill="currentColor" />
    </svg>
  );
}
export function PixelPlay({ size = 14 }) {
  return (
    <svg
      className="pixel-icon"
      width={size}
      height={size}
      viewBox="0 0 7 7"
      aria-hidden="true"
    >
      <path
        d="M1 0h1v7H1zM2 1h1v5H2zM3 2h1v3H3zM4 3h1v1H4z"
        fill="currentColor"
      />
    </svg>
  );
}
export function PixelArrow() {
  return (
    <svg
      className="pixel-icon"
      width="15"
      height="9"
      viewBox="0 0 10 6"
      aria-hidden="true"
    >
      <path
        d="M0 2h7v2H0zM6 0h1v6H6zM7 1h1v4H7zM8 2h1v2H8z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LangToggle() {
  const { lang, t, setLang } = useLang();
  return (
    <button
      className="lang-toggle"
      aria-label={t("langSwitchLabel")}
      title={t("langSwitchLabel")}
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
    >
      {t("langSwitch")}
    </button>
  );
}

export function HomeHeader({ hasCarts }) {
  const { t } = useLang();
  return (
    <header className="topbar home-header">
      <span className="site-name">PICO-8 MAKER</span>
      <nav className="home-nav" aria-label="Project links">
        {hasCarts && (
          <a className="resume-link" href="#my-carts">
            {t("navMyCarts")} <ChevronDown size={14} />
          </a>
        )}
        {links.map(([label, href]) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label === "X" ? t("followX") : undefined}
          >
            {label}
          </a>
        ))}
        <LangToggle />
      </nav>
    </header>
  );
}

/** The cart name in the workbench header; click to rename in place. */
function CartTitle({ title, onRename }) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const input = useRef(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  function commit() {
    const next = value.trim();
    setEditing(false);
    if (next && next !== title) onRename(next);
    else setValue(title);
  }
  if (editing)
    return (
      <input
        ref={input}
        className="cart-title-input"
        aria-label={t("renameCartLabel")}
        value={value}
        maxLength={120}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) commit();
          if (e.key === "Escape") {
            setValue(title);
            setEditing(false);
          }
        }}
      />
    );
  return (
    <h1 className="conversation-title">
      <button
        className="cart-title-button"
        title={`${title} · ${t("renameCartTitle")}`}
        onClick={() => {
          setValue(title);
          setEditing(true);
        }}
      >
        <span>{title}</span>
        <Pencil size={13} aria-hidden="true" />
      </button>
    </h1>
  );
}

function Meter({ label, value, limit, format = String }) {
  const ratio = Math.min(1, value / limit);
  const tone = ratio > 0.9 ? "danger" : ratio > 0.7 ? "warning" : "ok";
  return (
    <div className={`meter meter-${tone}`}>
      <span>
        {label} {format(value)} / {format(limit)}
      </span>
      <i style={{ "--fill": `${Math.max(2, ratio * 100)}%` }} />
    </div>
  );
}
const kilo = (n) =>
  n >= 1024 ? `${(n / 1024).toFixed(n >= 10240 ? 0 : 1)}K` : String(n);

export function WorkspaceViewSwitch({ view, onView, className = "" }) {
  const { t } = useLang();
  return (
    <div
      className={`view-switch ${className}`}
      role="tablist"
      aria-label={t("workspaceView")}
    >
      {["preview", "code", "resources"].map((v) => (
        <button
          key={v}
          role="tab"
          aria-selected={view === v}
          className={view === v ? "active" : ""}
          onClick={() => onView(v)}
        >
          {v === "preview"
            ? t("viewPreview")
            : v === "code"
              ? t("viewCode")
              : t("viewResources")}
        </button>
      ))}
    </div>
  );
}

export function WorkbenchHeader({
  busy,
  ready,
  onHome,
  title,
  revision,
  hasGame,
  saveFailed,
  tokens,
  chars,
  view,
  onView,
  canUndo,
  onUndo,
  onSaveCart,
  onRename,
}) {
  const { t } = useLang();
  return (
    <header className="topbar workbench-header">
      <div className="wb-project">
        <button
          className="home-button"
          disabled={busy}
          onClick={onHome}
          aria-label={t("backHome")}
          title={t("backHome")}
        >
          <ChevronLeft size={14} />
          <span
            className="mini-logo"
            role="img"
            aria-label="PICO-8"
            style={{ backgroundImage: `url(${BASE}assets/pico8-logo.png)` }}
          />
        </button>
        <span className="wb-divider" />
        <CartTitle key={title} title={title} onRename={onRename} />
        <span className={`version-badge ${saveFailed ? "unsaved" : ""}`}>
          {hasGame ? `v${revision}` : t("emptyCart")} ·{" "}
          {saveFailed ? t("versionNotSaved") : t("versionSaved")}
        </span>
      </div>
      <div className="wb-actions">
        <div className="cart-usage" title={t("meterTitle")}>
          <Meter label="TOKENS" value={tokens} limit={TOKEN_LIMIT} />
          <Meter label="CHARS" value={chars} limit={CHAR_LIMIT} format={kilo} />
        </div>
        <WorkspaceViewSwitch view={view} onView={onView} />
        <button
          className="icon-button"
          disabled={!ready || busy || !canUndo}
          onClick={onUndo}
          aria-label={t("undoLast")}
          title={t("undoLast")}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="save-cart"
          disabled={!ready || !hasGame}
          onClick={onSaveCart}
          title={t("saveCartTitle")}
        >
          <FloppyIcon />
          <span>{t("saveCart")}</span>
        </button>
        <LangToggle />
      </div>
    </header>
  );
}
