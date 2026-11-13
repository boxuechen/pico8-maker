import { useState } from "react";
import { FloppyIcon, PixelArrow } from "./PageHeaders.jsx";
import { saveStatus } from "./cart-store.js";
import { t, useLang } from "./i18n.js";

export function ago(time) {
  if (!time) return "";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minAgo", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("hoursAgo", { n: hours });
  const days = Math.round(hours / 24);
  return days === 1 ? t("yesterday") : t("daysAgo", { n: days });
}

/** The pixel cartridge body used for the user's own carts. */
export function CartBody({ label }) {
  return (
    <span className="cart-body">
      <span className="cart-window">
        {label ? <img src={label} alt="" /> : <span className="cart-empty">?</span>}
      </span>
      <span className="cart-strip" />
    </span>
  );
}

const statusKey = { saved: "saved", unsaved: "notSaved", empty: "empty" };

function PixelCopy() {
  return (
    <svg className="pixel-icon" width="14" height="14" viewBox="0 0 7 7" aria-hidden="true">
      <path d="M0 0h5v1H1v4H0zM2 2h5v5H2zM3 3v3h3V3z" fill="currentColor" />
    </svg>
  );
}
function PixelTrash() {
  return (
    <svg className="pixel-icon" width="14" height="14" viewBox="0 0 7 7" aria-hidden="true">
      <path d="M2 0h3v1h2v1H0V1h2zM1 2h5v5H1zM2 3v3h1V3zM4 3v3h1V3z" fill="currentColor" />
    </svg>
  );
}
function PixelPencil() {
  return (
    <svg className="pixel-icon" width="14" height="14" viewBox="0 0 7 7" aria-hidden="true">
      <path d="M5 0h1v1h1v1H6v1H5v1H4v1H3v1H2v1H0V5h1V4h1V3h1V2h1V1h1zM1 5v1h1V5z" fill="currentColor" />
    </svg>
  );
}
function PixelWarn() {
  return (
    <svg className="pixel-icon" width="14" height="14" viewBox="0 0 7 7" aria-hidden="true">
      <path d="M3 0h1v1h1v2h1v2h1v2H0V5h1V3h1V1h1z" fill="#ffa300" />
      <path d="M3 2h1v2H3zM3 5h1v1H3z" fill="#0a1020" />
    </svg>
  );
}

function ShelfCart({ cart, current, disabled, onOpen, onSave, onRename, onDuplicate, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const status = saveStatus(cart);
  return (
    <article
      className={`shelf-cart ${current ? "current" : ""} ${confirming ? "confirming" : ""}`}
      aria-label={cart.title}
    >
      <div className="shelf-art">
        <CartBody label={cart.label} />
        {confirming ? (
          <div className="shelf-actions confirm" role="group" aria-label={t("confirmDelete")}>
            <strong>{t("deleteQ")}</strong>
            <small>{status === "saved" ? t("hasCopy") : t("noCopy")}</small>
            <button className="danger" disabled={disabled} onClick={() => onDelete(cart)}>
              {t("delete")}
            </button>
            <button onClick={() => setConfirming(false)}>{t("keep")}</button>
          </div>
        ) : (
          <div className="shelf-actions" role="group" aria-label={t("cartActions", { title: cart.title })}>
            <button className="shelf-continue" disabled={disabled} onClick={() => onOpen(cart)}>
              {t("continue")} <PixelArrow />
            </button>
            <span className="shelf-icons">
              <button
                aria-label={t("saveAsFile", { title: cart.title })}
                title={t("saveCartShort")}
                disabled={disabled || !cart.versions.length}
                onClick={() => onSave(cart)}
              >
                <FloppyIcon size={14} />
              </button>
              <button
                aria-label={t("renameAria", { title: cart.title })}
                title={t("renameShort")}
                disabled={disabled}
                onClick={() => onRename(cart)}
              >
                <PixelPencil />
              </button>
              <button
                aria-label={t("duplicateAria", { title: cart.title })}
                title={t("duplicate")}
                disabled={disabled}
                onClick={() => onDuplicate(cart)}
              >
                <PixelCopy />
              </button>
              <button
                className="danger"
                aria-label={t("deleteAria", { title: cart.title })}
                title={t("deleteShort")}
                disabled={disabled}
                onClick={() => setConfirming(true)}
              >
                <PixelTrash />
              </button>
            </span>
          </div>
        )}
      </div>
      <strong className="shelf-title" title={cart.title}>
        {cart.title}
      </strong>
      {cart.origin?.title && (
        <small className="shelf-origin" title={`${cart.origin.title} · ${cart.origin.author}`}>
          {t("remixOf", { title: cart.origin.title })}
        </small>
      )}
      <small className="shelf-meta">
        {cart.versions.length ? `v${cart.revision}` : t("emptyCart")} · {ago(cart.updatedAt)}
      </small>
      <span className={`shelf-status ${status}`}>
        <i />
        {t(statusKey[status])}
      </span>
    </article>
  );
}

export function CartShelf({
  carts,
  currentId,
  persistent,
  disabled,
  onOpen,
  onNew,
  onImport,
  onSave,
  onSaveAll,
  onRename,
  onDuplicate,
  onDelete,
}) {
  useLang();
  if (!carts.length) return null;
  const unsaved = carts.filter((c) => saveStatus(c) === "unsaved").length;
  const showNotice = !persistent || unsaved > 0;
  return (
    <section className="my-carts" id="my-carts" aria-labelledby="my-carts-title">
      <div className="my-carts-head">
        <h2 id="my-carts-title">{t("myCarts")}</h2>
        <span>
          {t("nCarts", { n: carts.length })} · {t("keptInBrowser")}
        </span>
      </div>
      {showNotice && (
        <div className={`local-notice ${persistent ? "" : "volatile"}`} role="note">
          <PixelWarn />
          <span>{persistent ? t("noticePersistent", { n: unsaved }) : t("noticeVolatile")}</span>
          {unsaved > 0 && (
            <button disabled={disabled} title={t("saveAllTitle")} onClick={onSaveAll}>
              <FloppyIcon size={12} /> {t("saveAll")}
            </button>
          )}
        </div>
      )}
      <div className="shelf">
        {carts.map((cart) => (
          <ShelfCart
            key={cart.id}
            cart={cart}
            current={cart.id === currentId}
            disabled={disabled}
            onOpen={onOpen}
            onSave={onSave}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ))}
        <div className="shelf-slots">
          <button className="shelf-new" disabled={disabled} onClick={onNew}>
            <svg className="pixel-icon" width="20" height="20" viewBox="0 0 5 5" aria-hidden="true">
              <path d="M2 0h1v5H2zM0 2h5v1H0z" fill="currentColor" />
            </svg>
            <span>{t("newCart")}</span>
          </button>
          <button className="shelf-new shelf-import" disabled={disabled} title={t("importTitle")} onClick={onImport}>
            <svg className="pixel-icon" width="20" height="20" viewBox="0 0 5 5" aria-hidden="true">
              <path d="M2 0h1v3H2zM1 2h1v1H1zM3 2h1v1H3zM0 4h5v1H0z" fill="currentColor" />
            </svg>
            <span>{t("importCart")}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
