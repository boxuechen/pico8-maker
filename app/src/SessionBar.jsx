export function SessionBar({ sessions, activeId, disabled, onSelect, onNew }) {
  return (
    <nav className="session-bar" aria-label="Cart sessions">
      <label htmlFor="cart-session">SESSION</label>
      <select
        id="cart-session"
        aria-label="Current session"
        value={activeId}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.value)}
      >
        {sessions.map((session, i) => (
          <option key={session.id} value={session.id}>
            {i + 1}. {session.title}
          </option>
        ))}
      </select>
      <button type="button" disabled={disabled} onClick={onNew}>
        + NEW SESSION
      </button>
    </nav>
  );
}
