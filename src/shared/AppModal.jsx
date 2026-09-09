import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import cloverLogo from "../assets/clover-logo.png";
import { useLocalization } from "./i18n/LocalizationProvider";

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
const HOST_UNAVAILABLE_RU = Object.freeze({
  confirmTitle: "Подтвердите действие",
  confirm: "Подтвердить",
  cancel: "Отмена",
  alertTitle: "Внимание",
  ok: "Понятно",
  details: "Подробности",
  orderContents: "Состав заказа",
});

function isOmitted(value) {
  if (value == null) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "null") return true;
  }
  return false;
}

function nonEmptyText(value, fallback) {
  const text = value == null ? "" : String(value);
  return text.trim() ? text : fallback;
}

export async function appConfirm({
  title,
  message = "",
  confirmLabel,
  cancelLabel,
  tone = "default",
  expandable = null,
} = {}) {
  const host = await ensureHost();
  if (!host) {
    const resolvedTitle = isOmitted(title) ? HOST_UNAVAILABLE_RU.confirmTitle : title;
    const expandText = expandable?.lines?.length
      ? `\n\n${expandable.summary || HOST_UNAVAILABLE_RU.orderContents}:\n${expandable.lines.join("\n")}`
      : "";
    return window.confirm([resolvedTitle, message].filter(Boolean).join("\n\n") + expandText);
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
 * @param {{ summary?: string, lines?: string[] }} [options.expandable] — длинный список по запросу
 * @returns {Promise<void>}
 */
export async function appAlert({
  title,
  message = "",
  confirmLabel,
  tone = "default",
  expandable = null,
} = {}) {
  const host = await ensureHost();
  if (!host) {
    const resolvedTitle = isOmitted(title) ? HOST_UNAVAILABLE_RU.alertTitle : title;
    const expandText = expandable?.lines?.length
      ? `\n\n${expandable.summary || HOST_UNAVAILABLE_RU.details}:\n${expandable.lines.join("\n")}`
      : "";
    window.alert([resolvedTitle, message].filter(Boolean).join("\n\n") + expandText);
    return;
  }
  await host({
    mode: "alert",
    title,
    message,
    confirmLabel,
    cancelLabel: "",
    tone,
    expandable,
  });
}

function toneCardClass(tone) {
  if (tone === "danger") return "app-modal-tone-danger";
  if (tone === "warn") return "app-modal-tone-warn";
  if (tone === "success") return "app-modal-tone-success";
  return "";
}

export function AppModalHost() {
  const { t } = useLocalization();
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
    const scrollY = window.scrollY;
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
    body.style.top = `-${scrollY}px`;
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
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", onKey);
    };
  }, [dialog]);

  if (!dialog || typeof document === "undefined") return null;

  const isConfirm = dialog.mode === "confirm";
  const resolvedTitle = nonEmptyText(
    isOmitted(dialog.title)
      ? isConfirm
        ? t("shared.modal.confirmTitle")
        : t("shared.modal.alertTitle")
      : dialog.title,
    isConfirm ? HOST_UNAVAILABLE_RU.confirmTitle : HOST_UNAVAILABLE_RU.alertTitle
  );
  const resolvedConfirmLabel = nonEmptyText(
    isOmitted(dialog.confirmLabel)
      ? isConfirm
        ? t("shared.modal.confirm")
        : t("shared.modal.ok")
      : dialog.confirmLabel,
    isConfirm ? HOST_UNAVAILABLE_RU.confirm : HOST_UNAVAILABLE_RU.ok
  );
  const resolvedCancelLabel = nonEmptyText(
    isOmitted(dialog.cancelLabel) ? t("shared.modal.cancel") : dialog.cancelLabel,
    HOST_UNAVAILABLE_RU.cancel
  );
  const resolvedExpandableSummary = nonEmptyText(
    isOmitted(dialog.expandable?.summary)
      ? isConfirm
        ? t("shared.modal.orderContents")
        : t("shared.modal.details")
      : dialog.expandable.summary,
    isConfirm ? HOST_UNAVAILABLE_RU.orderContents : HOST_UNAVAILABLE_RU.details
  );
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
        border: "none",
        borderRadius: 0,
        boxShadow: "none",
        background: "transparent",
      };

  return createPortal(
    <div
      className={`order-thankyou app-modal-shell${isMobile ? " order-thankyou-mobile" : ""}`}
      role="presentation"
      style={overlayStyle}
      onClick={() => close(isConfirm ? false : undefined)}
    >
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
          {resolvedTitle}
        </h2>
        {dialog.message ? (
          <p className="order-thankyou-text">{dialog.message}</p>
        ) : null}
        {Array.isArray(dialog.expandable?.lines) && dialog.expandable.lines.length > 0 ? (
          <details className="app-modal-expandable">
            <summary>{resolvedExpandableSummary}</summary>
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
              {resolvedCancelLabel}
            </button>
          ) : null}
          <button
            className={confirmClass}
            type="button"
            autoFocus
            onClick={() => close(isConfirm ? true : undefined)}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.documentElement
  );
}
