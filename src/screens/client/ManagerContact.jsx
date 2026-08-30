// Виджет контакта менеджера в шапке кабинета клиента и на экране входа.
import { useEffect, useRef, useState } from "react";
import {
  formatRussianPhone,
  getManagerPhoneLinks,
  getMaxLink,
  getTelegramLink,
} from "../../shared/appHelpers";

function ContactBody({ fullName, phoneLinks, phoneValue, hasAnyContact, maxLink, telegramLink }) {
  return (
    <>
      <p className="eyebrow">Ваш менеджер</p>
      <h3>{fullName || "Менеджер Clover"}</h3>
      {phoneLinks.phone ? (
        <a className="manager-contact-phone" href={phoneLinks.phone}>{phoneValue}</a>
      ) : (
        <p className="manager-contact-note">Телефон пока не указан.</p>
      )}
      {hasAnyContact && (phoneLinks.phone || maxLink || telegramLink) ? (
        <div className="manager-contact-actions">
          {phoneLinks.phone && <a className="primary" href={phoneLinks.phone}>Позвонить</a>}
          {maxLink && (
            <a className={phoneLinks.phone ? "" : "primary"} href={maxLink} target="_blank" rel="noreferrer">
              Открыть MAX
            </a>
          )}
          {telegramLink && (
            <a
              className={phoneLinks.phone || maxLink ? "wide" : "primary wide"}
              href={telegramLink}
              target="_blank"
              rel="noreferrer"
            >
              Открыть Telegram
            </a>
          )}
        </div>
      ) : (
        <div className="manager-contact-empty">Контакты менеджера ещё не заполнены.</div>
      )}
    </>
  );
}

export function ManagerContact({ settings, variant = "popover" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const fullName = String(settings.managerFullName || "").trim();
  const phoneValue = formatRussianPhone(settings.managerPhone || "");
  const phoneLinks = getManagerPhoneLinks(settings.managerPhone);
  const maxLink = getMaxLink(settings.managerMax);
  const telegramLink = getTelegramLink(settings.managerTelegram);
  const hasAnyContact = Boolean(fullName || phoneLinks.phone || maxLink || telegramLink);
  const inline = variant === "inline";

  useEffect(() => {
    if (!open || !inline) return;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, inline]);

  // Prevent body from eating touch while sheet is open (keeps pan-y on scroll body).
  useEffect(() => {
    if (!open || inline) return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [open, inline]);

  const body = (
    <ContactBody
      fullName={fullName}
      phoneLinks={phoneLinks}
      phoneValue={phoneValue}
      hasAnyContact={hasAnyContact}
      maxLink={maxLink}
      telegramLink={telegramLink}
    />
  );

  if (inline) {
    return (
      <div
        ref={rootRef}
        className={open ? "manager-contact manager-contact--inline open" : "manager-contact manager-contact--inline"}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <button
          className="manager-contact-trigger"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="manager-contact-label-full">Связаться с менеджером</span>
          <span className="manager-contact-label-short">Менеджер</span>
        </button>
        {open ? <div className="manager-contact-panel">{body}</div> : null}
      </div>
    );
  }

  const canHover =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  return (
    <div
      ref={rootRef}
      className={open ? "manager-contact open" : "manager-contact"}
      onMouseEnter={() => {
        if (canHover) setOpen(true);
      }}
      onMouseLeave={() => {
        if (canHover) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        className="manager-contact-trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="manager-contact-label-full">Связаться с менеджером</span>
        <span className="manager-contact-label-short">Менеджер</span>
      </button>
      {open ? (
        <button
          type="button"
          className="manager-contact-backdrop"
          aria-label="Закрыть"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div
        className="manager-contact-popover"
        role="dialog"
        aria-label="Связаться с менеджером"
        aria-hidden={!open}
      >
        <div className="manager-contact-popover-head">
          <button
            type="button"
            className="manager-contact-close"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <div
          className="manager-contact-popover-scroll"
          data-manager-contact-scroll="1"
          ref={scrollRef}
        >
          {body}
        </div>
      </div>
    </div>
  );
}
