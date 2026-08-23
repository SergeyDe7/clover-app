import { useEffect, useRef, useState } from "react";
import {
  formatRussianPhone,
  getManagerPhoneLinks,
} from "../../../shared/appHelpers";

function mailtoHref(email) {
  const value = String(email || "").trim();
  // javascript: and other non-email values never become a mailto link.
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) return "";
  return `mailto:${value}`;
}

export function StorefrontContacts({ phone = "", email = "" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const phoneValue = formatRussianPhone(phone);
  const phoneLinks = getManagerPhoneLinks(phone);
  const emailValue = String(email || "").trim();
  const mailHref = mailtoHref(emailValue);
  const hasPhone = Boolean(phoneLinks.phone);
  const hasEmail = Boolean(mailHref);
  const hasAny = hasPhone || hasEmail;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`sf-contacts${open ? " is-open" : ""}`}
    >
      <button
        className="sf-btn sf-btn-ghost sf-contacts-btn"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        Контакты
      </button>
      {open ? (
        <div className="sf-contacts-panel" role="dialog" aria-label="Контакты">
          <p className="sf-contacts-kicker">Компания КЛЕВЕР</p>
          {hasPhone ? (
            <a className="sf-contacts-line" href={phoneLinks.phone}>
              {phoneValue}
            </a>
          ) : null}
          {hasEmail ? (
            <a className="sf-contacts-line" href={mailHref}>
              {emailValue}
            </a>
          ) : null}
          {hasAny ? (
            <div className="sf-contacts-actions">
              {phoneLinks.phone ? (
                <a className="sf-btn sf-btn-primary sf-btn-sm" href={phoneLinks.phone}>
                  Позвонить
                </a>
              ) : null}
              {mailHref ? (
                <a className="sf-btn sf-btn-ghost sf-btn-sm" href={mailHref}>
                  Написать
                </a>
              ) : null}
            </div>
          ) : (
            <p className="sf-contacts-empty">
              Телефон и почта пока не указаны.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
