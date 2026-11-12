import { useState } from "react";
import { FloppyIcon, PixelArrow } from "./PageHeaders.jsx";
import { saveStatus } from "./cart-store.js";

export function ago(time) {
  if (!time) return "";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
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

const statusText = {
  saved: "SAVED",
  unsaved: "NOT SAVED YET",
};

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
function PixelWarn() {
  return (
    <svg className="pixel-icon" width="14" height="14" viewBox="0 0 7 7" aria-hidden="true">
      <path d="M3 0h1v1h1v2h1v2h1v2H0V5h1V3h1V1h1z" fill="#ffa300" />
      <path d="M3 2h1v2H3zM3 5h1v1H3z" fill="#0a1020" />
    </svg>
  );
}

function ShelfCart({ cart, current, disabled, onOpen, onSave, onDuplicate, onDelete }) {
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
          <div className="shelf-actions confirm" role="group" aria-label="Confirm delete">
            <strong>DELETE?</strong>
            <small>{status === "saved" ? "You have a saved copy." : "Not saved to a file yet."}</small>
            <button className="danger" disabled={disabled} onClick={() => onDelete(cart)}>
              DELETE
            </button>
            <button onClick={() => setConfirming(false)}>KEEP</button>
          </div>
        ) : (
          <div className="shelf-actions" role="group" aria-label={`${cart.title} actions`}>
            <button className="shelf-continue" disabled={disabled} onClick={() => onOpen(cart)}>
              CONTINUE <PixelArrow />
            </button>
            <span className="shelf-icons">
              <button
                aria-label={`Save ${cart.title} as a file`}
                title="Save cart"
                disabled={disabled || !cart.versions.length}
                onClick={() => onSave(cart)}
              >
                <FloppyIcon size={14} />
              </button>
              <button
                aria-label={`Duplicate ${cart.title}`}
                title="Duplicate"
                disabled={disabled}
                onClick={() => onDuplicate(cart)}
              >
                <PixelCopy />
              </button>
              <button
                className="danger"
                aria-label={`Delete ${cart.title}`}
                title="Delete"
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
      <small className="shelf-meta">
        {cart.versions.length ? `v${cart.revision}` : "Empty cart"} · {ago(cart.updatedAt)}
      </small>
      <span className={`shelf-status ${status}`}>
        <i />
        {statusText[status]}
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
  onSave,
  onDuplicate,
  onDelete,
}) {
  if (!carts.length) return null;
  const unsaved = carts.filter((c) => saveStatus(c) === "unsaved").length;
  return (
    <section className="my-carts" aria-labelledby="my-carts-title">
      <div className="my-carts-head">
        <h2 id="my-carts-title">My carts</h2>
        <span>
          {carts.length} {carts.length === 1 ? "cart" : "carts"} · kept in this browser
          {unsaved ? ` · ${unsaved} not saved to a file` : ""}
        </span>
      </div>
      <p className={`local-notice ${persistent ? "" : "volatile"}`} role="note">
        <PixelWarn />
        {persistent
          ? "There is no server. Carts live in this browser only — clearing site data, a private window or another device won't have them. Save a file of anything you want to keep."
          : "This browser isn't letting PICO-8 Maker store data, so these carts disappear when the tab closes. Save a file of anything you want to keep."}
      </p>
      <div className="shelf">
        {carts.map((cart) => (
          <ShelfCart
            key={cart.id}
            cart={cart}
            current={cart.id === currentId}
            disabled={disabled}
            onOpen={onOpen}
            onSave={onSave}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ))}
        <button className="shelf-new" disabled={disabled} onClick={onNew}>
          <svg className="pixel-icon" width="20" height="20" viewBox="0 0 5 5" aria-hidden="true">
            <path d="M2 0h1v5H2zM0 2h5v1H0z" fill="currentColor" />
          </svg>
          NEW
          <br />
          CART
        </button>
      </div>
    </section>
  );
}
