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

function toneCardClass(tone) {
  if (tone === "danger") return "app-modal-tone-danger";
  if (tone === "warn") return "app-modal-tone-warn";
  if (tone === "success") return "app-modal-tone-success";
  return "";
}

export function AppModalHost() {
  const [dialog, setDialog] = useState(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(max-width: 900px)").matches;
  });

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

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    if (media.addEventListener) {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        const { resolve, mode } = dialog;
        setDialog(null);
        resolve(mode === "confirm" ? false : undefined);
      }
    };
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
      bodyTop: body.style.top,
    };
    html.classList.add("clover-thankyou-open");
    body.classList.add("clover-thankyou-open");
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.top = "0";
    window.addEventListener("keydown", onKey);
    return () => {
      html.classList.remove("clover-thankyou-open");
      body.classList.remove("clover-thankyou-open");
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.width = previous.bodyWidth;
      body.style.height = previous.bodyHeight;
      body.style.top = previous.bodyTop;
      window.removeEventListener("keydown", onKey);
    };
  }, [dialog]);

  if (!dialog || typeof document === "undefined") return null;

  const isConfirm = dialog.mode === "confirm";
  const confirmClass =
    dialog.tone === "danger"
      ? "danger-button order-thankyou-button"
      : "primary-button order-thankyou-button";

  const close = (value) => {
    const { resolve } = dialog;
    setDialog(null);
    resolve(value);
  };

  const overlayStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    minHeight: "100dvh",
    zIndex: 2147483000,
    margin: 0,
    padding: 0,
    boxSizing: "border-box",
    display: "grid",
    placeItems: "center",
    background:
      "radial-gradient(circle at 20% 18%, rgba(126, 196, 108, 0.45), transparent 42%), radial-gradient(circle at 82% 78%, rgba(74, 148, 78, 0.38), transparent 48%), linear-gradient(160deg, #eef7ea 0%, #d9ecd4 45%, #c7e0c2 100%)",
    cursor: "pointer",
    overflow: "hidden",
    touchAction: "none",
  };

  const cardStyle = isMobile
    ? {
        width: "100%",
        height: "100%",
        minHeight: "100%",
        maxWidth: "none",
        borderRadius: 0,
        border: "none",
        boxShadow: "none",
        background: "transparent",
        padding:
          "max(28px, env(safe-area-inset-top, 0px)) 24px max(28px, env(safe-area-inset-bottom, 0px))",
        display: "grid",
        alignContent: "center",
        justifyItems: "center",
        gap: "14px",
      }
    : {
        width: "min(420px, calc(100% - 32px))",
        maxWidth: "100%",
      };

  return createPortal(
    <div
      className={`order-thankyou app-modal-shell${isMobile ? " order-thankyou-mobile" : ""}`}
      role="presentation"
      style={overlayStyle}
      onClick={() => close(isConfirm ? false : undefined)}
    >
      <div className="order-thankyou-glow" aria-hidden="true" />
      <span className="order-thankyou-spark order-thankyou-spark-1" aria-hidden="true" />
      <span className="order-thankyou-spark order-thankyou-spark-2" aria-hidden="true" />
      <span className="order-thankyou-spark order-thankyou-spark-3" aria-hidden="true" />
      <span className="order-thankyou-spark order-thankyou-spark-4" aria-hidden="true" />
      <span className="order-thankyou-spark order-thankyou-spark-5" aria-hidden="true" />
      <span className="order-thankyou-spark order-thankyou-spark-6" aria-hidden="true" />
      <span className="order-thankyou-spark order-thankyou-spark-7" aria-hidden="true" />
      <span className="order-thankyou-spark order-thankyou-spark-8" aria-hidden="true" />
      <div
        className={`order-thankyou-card ${toneCardClass(dialog.tone)}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        style={cardStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-thankyou-logo-wrap" aria-hidden="true">
          <img
            className="order-thankyou-logo"
            src={cloverLogo}
            alt=""
            width="220"
            height="148"
          />
        </div>
        <h2 id="app-modal-title" className="order-thankyou-title">
          {dialog.title}
        </h2>
        {dialog.message ? (
          <p className="order-thankyou-text">{dialog.message}</p>
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
              className="secondary-button order-thankyou-button"
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
