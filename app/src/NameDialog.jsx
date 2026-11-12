import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function NameDialog({
  title,
  label,
  initial = "",
  placeholder,
  hint,
  action,
  onSave,
  onClose,
}) {
  const dialog = useRef(null);
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current.showModal();
    dialog.current.querySelector("input")?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="name-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(name.trim());
          } catch (error) {
            setError(error.message);
            setBusy(false);
          }
        }}
      >
        <div className="dialog-heading">
          <h2 id="name-dialog-title">{title}</h2>
          <button
            type="button"
            aria-label="Close naming dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p>{hint}</p>
        <label>
          {label}
          <input
            autoFocus
            maxLength={120}
            value={name}
            placeholder={placeholder}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Opening…" : action}
          </button>
        </div>
      </form>
    </dialog>
  );
}
