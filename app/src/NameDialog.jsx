import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLang } from "./i18n.js";

export function NameDialog({
  title,
  label,
  initial = "",
  placeholder,
  hint,
  action,
  busyLabel,
  onSave,
  onClose,
}) {
  const { t } = useLang();
  const dialog = useRef(null);
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current.showModal();
    const input = dialog.current.querySelector("input");
    input?.focus();
    input?.select();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="name-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current && !busy) onClose();
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
            aria-label={t("closeDialog")}
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {hint && <p>{hint}</p>}
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
            {t("cancel")}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? (busyLabel ?? t("saving")) : action}
          </button>
        </div>
      </form>
    </dialog>
  );
}
