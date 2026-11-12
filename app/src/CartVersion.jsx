export function CartVersion({
  title,
  value,
  onChange,
  hasGame,
  revision,
  dirty,
}) {
  return (
    <div className="cart-version">
      <div className="resources-heading">
        <h2>{title}</h2>
        <label>
          Version{" "}
          <select
            aria-label="Cart version"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="draft">Working draft</option>
            {hasGame && (
              <option value="committed">Committed v{revision}</option>
            )}
          </select>
        </label>
      </div>
      <p className="resource-note">
        {!hasGame
          ? "Working draft · no playable version yet."
          : dirty
            ? value === "draft"
              ? "Uncommitted changes · preview and export use the committed cart."
              : `Showing committed v${revision} · the working draft has uncommitted changes.`
            : "Source and resources are saved together."}
      </p>
    </div>
  );
}
