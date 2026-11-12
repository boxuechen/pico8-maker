import { ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { CHAR_LIMIT, TOKEN_LIMIT } from "./pico8/tokens.js";

const BASE = import.meta.env.BASE_URL;
const links = [
  ["Carts", "https://www.lexaloffle.com/bbs/?cat=7#sub=2"],
  ["PICO-8 Manual", "https://www.lexaloffle.com/dl/docs/pico-8_manual.html"],
  ["Lexaloffle", "https://www.lexaloffle.com/pico-8.php"],
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

export function HomeHeader({ busy, onResume, canResume }) {
  return (
    <header className="topbar home-header">
      <span className="site-name">PICO-8 MAKER</span>
      <nav className="home-nav" aria-label="PICO-8 links">
        {canResume && (
          <button className="resume-link" disabled={busy} onClick={onResume}>
            Continue <ChevronRight size={14} />
          </button>
        )}
        {links.map(([label, href]) => (
          <a key={label} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        ))}
      </nav>
    </header>
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

export function WorkbenchHeader({
  busy,
  ready,
  onHome,
  title,
  revision,
  saveFailed,
  tokens,
  chars,
  view,
  onView,
  canUndo,
  onUndo,
  onSaveCart,
}) {
  return (
    <header className="topbar workbench-header">
      <div className="wb-project">
        <button
          className="home-button"
          disabled={busy}
          onClick={onHome}
          aria-label="Back to home"
          title="Back to home"
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
        <h1 className="conversation-title" title={title}>
          {title}
        </h1>
        <span className={`version-badge ${saveFailed ? "unsaved" : ""}`}>
          v{revision} · {saveFailed ? "Not saved" : "Saved locally"}
        </span>
      </div>
      <div className="wb-actions">
        <div
          className="cart-usage"
          title="Approximate PICO-8 token count and code characters"
        >
          <Meter label="TOKENS" value={tokens} limit={TOKEN_LIMIT} />
          <Meter label="CHARS" value={chars} limit={CHAR_LIMIT} format={kilo} />
        </div>
        <div className="view-switch" role="tablist" aria-label="Workspace view">
          {["preview", "code"].map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? "active" : ""}
              onClick={() => onView(v)}
            >
              {v === "preview" ? "Preview" : "Code"}
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          disabled={!ready || busy || !canUndo}
          onClick={onUndo}
          aria-label="Undo last change"
          title="Undo last change"
        >
          <Undo2 size={16} />
        </button>
        <button
          className="save-cart"
          disabled={!ready}
          onClick={onSaveCart}
          title="Download a .p8 cartridge labelled with the latest playtest frame"
        >
          <FloppyIcon />
          <span>SAVE CART</span>
        </button>
      </div>
    </header>
  );
}
