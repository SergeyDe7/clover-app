import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import cloverLogo from "../assets/clover-logo.png";

let pushDialog = null;
let hostGeneration = 0;
const hostWaiters = [];

function notifyHostReady(host) {
  while (hostWaiters.length) {
    const resolve = hostWaiters.shift();
    resolve(host);
  }
}

function ensureHost() {
  return new Promise((resolve) => {
    if (pushDialog) {
      resolve(pushDialog);
      return;
    }
    hostWaiters.push(resolve);
    window.setTimeout(() => {
      const index = hostWaiters.indexOf(resolve);
      if (index >= 0) hostWaiters.splice(index, 1);
      resolve(pushDialog);
    }, 3000);
  });
}

/**
 * Confirm в стиле Clover вместо window.confirm.
 * @param {object} [options]
 * @param {{ summary?: string, lines?: string[] }} [options.expandable] — раскрываемый блок (например состав заказа)
 * @returns {Promise<boolean>}
 */
export async function appConfirm({
  title = "Подтвердите действие",
  message = "",
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  tone = "default",
  expandable = null,
} = {}) {
  const host = await ensureHost();
  if (!host) {
    const expandText = expandable?.lines?.length
      ? `\n\n${expandable.summary || "Состав"}:\n${expandable.lines.join("\n")}`
      : "";
    return window.confirm([title, message].filter(Boolean).join("\n\n") + expandText);
  }
  return host({
    mode: "confirm",
    title,
    message,
    confirmLabel,
    cancelLabel,
    tone,
    expandable,
  });
}

/**
 * Alert в стиле Clover вместо window.alert.
 * @returns {Promise<void>}
 */
export async function appAlert({
  title = "Внимание",
  message = "",
  confirmLabel = "Понятно",
  tone = "default",
} = {}) {
  const host = await ensureHost();
  if (!host) {
    window.alert([title, message].filter(Boolean).join("\n\n"));
    return;
  }
  await host({
    mode: "alert",
    title,
    message,
    confirmLabel,
    cancelLabel: "",
    tone,
  });
}

function toneMeta(tone) {
  if (tone === "danger") return { className: "app-modal-tone-danger" };
  if (tone === "warn") return { className: "app-modal-tone-warn" };
  return { className: "app-modal-tone-default" };
}

export function AppModalHost() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const generation = ++hostGeneration;
    const host = (options) =>
      new Promise((resolve) => {
        setDialog({ ...options, resolve });
      });
    pushDialog = host;
    notifyHostReady(host);
    return () => {
      if (hostGeneration === generation) {
        pushDialog = null;
      }
    };
  }, []);

  if (!dialog) return null;

  const isConfirm = dialog.mode === "confirm";
  const tone = toneMeta(dialog.tone);
  const confirmClass =
    dialog.tone === "danger"
      ? "danger-button app-modal-btn app-modal-btn-main"
      : "primary-button app-modal-btn app-modal-btn-main";

  const close = (value) => {
    const { resolve } = dialog;
    setDialog(null);
    resolve(value);
  };

  return createPortal(
    <div
      className="app-modal-overlay"
      role="presentation"
      onClick={() => close(isConfirm ? false : undefined)}
    >
      <div className="app-modal-glow" aria-hidden="true" />
      <div
        className={`app-modal-card ${tone.className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          className="app-modal-logo"
          src={cloverLogo}
          alt=""
          width="140"
          height="60"
        />
        <h2 id="app-modal-title" className="app-modal-title">
          {dialog.title}
        </h2>
        {dialog.message ? (
          <p className="app-modal-message">{dialog.message}</p>
        ) : null}
        {Array.isArray(dialog.expandable?.lines) && dialog.expandable.lines.length > 0 ? (
          <details className="app-modal-expandable">
            <summary>{dialog.expandable.summary || "Состав заказа"}</summary>
            <ul className="app-modal-expandable-list">
              {dialog.expandable.lines.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className={`app-modal-actions${isConfirm ? "" : " app-modal-actions-single"}`}>
          {isConfirm ? (
            <button
              className="secondary-button app-modal-btn"
              type="button"
              onClick={() => close(false)}
            >
              {dialog.cancelLabel || "Отмена"}
            </button>
          ) : null}
          <button
            className={confirmClass}
            type="button"
            autoFocus
            onClick={() => close(isConfirm ? true : undefined)}
          >
            {dialog.confirmLabel || (isConfirm ? "Подтвердить" : "Понятно")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
