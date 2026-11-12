import { ChevronRight } from "lucide-react";

function HomeButton({ compact = false, disabled, onClick }) {
  return (
    <button
      className="app-title"
      disabled={disabled}
      onClick={onClick}
      aria-label="Back to home"
      title="Back to home"
    >
      <span className="pixel-spark" aria-hidden="true">
        ✦
      </span>
      {!compact && (
        <>
          PICO<span className="brand-slash">/</span>MAKER{" "}
          <span className="brand-caption">FANTASY GAME MAKER</span>
        </>
      )}
    </button>
  );
}

export function HomeHeader({
  busy,
  onHome,
  onResume,
  hasConversation,
  children,
}) {
  return (
    <header className="topbar home-header">
      <HomeButton disabled={busy} onClick={onHome} />
      <div className="top-actions">
        {hasConversation && (
          <button className="resume-button" disabled={busy} onClick={onResume}>
            Continue making <ChevronRight size={14} />
          </button>
        )}
        {children}
      </div>
    </header>
  );
}

export function WorkbenchHeader({ busy, onHome, title, children }) {
  return (
    <header className="topbar workbench-header">
      <HomeButton compact disabled={busy} onClick={onHome} />
      <h1 className="conversation-title" title={title}>
        {title}
      </h1>
      <div className="top-actions">{children}</div>
    </header>
  );
}
