// Виджет контакта менеджера в шапке кабинета клиента и на экране входа.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const SHEET_MQ = "(max-width: 700px)";

export function ManagerContact({ settings, variant = "popover" }) {
  const [open, setOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(SHEET_MQ).matches
      : false
  );
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const fullName = String(settings.managerFullName || "").trim();
  const phoneValue = formatRussianPhone(settings.managerPhone || "");
  const phoneLinks = getManagerPhoneLinks(settings.managerPhone);
  const maxLink = getMaxLink(settings.managerMax);
  const telegramLink = getTelegramLink(settings.managerTelegram);
  const hasAnyContact = Boolean(fullName || phoneLinks.phone || maxLink || telegramLink);
  const inline = variant === "inline";
  // Mobile: always a viewport sheet (login inline panel was clipped by login-lock overflow).
  const usePortalSheet = sheetMode;

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(SHEET_MQ);
    const sync = () => setSheetMode(mq.matches);
    sync();
    if (mq.addEventListener) {
      mq.addEventListener("change", sync);
      return () => mq.removeEventListener("change", sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  useEffect(() => {
    if (!open || usePortalSheet) return;
    if (!inline) return;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, inline, usePortalSheet]);

  // Lock background scroll while any mobile sheet / desktop popover is open.
  useEffect(() => {
    if (!open) return;
    if (inline && !usePortalSheet) return;
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("manager-contact-sheet-open");
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.classList.remove("manager-contact-sheet-open");
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [open, inline, usePortalSheet]);

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

  const portalSheet =
    open && usePortalSheet && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              className="manager-contact-backdrop"
              aria-label="Закрыть"
              onClick={() => setOpen(false)}
            />
            <div
              className="manager-contact-popover manager-contact-popover--portal-open"
              role="dialog"
              aria-modal="true"
              aria-label="Связаться с менеджером"
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
          </>,
          document.body
        )
      : null;

  if (inline) {
    return (
      <div
        ref={rootRef}
        className={
          open
            ? "manager-contact manager-contact--inline open"
            : "manager-contact manager-contact--inline"
        }
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
        {/* Desktop inline: expand in place. Mobile: portaled sheet above. */}
        {!usePortalSheet && open ? (
          <div className="manager-contact-panel" data-manager-contact-scroll="1">
            {body}
          </div>
        ) : null}
        {portalSheet}
      </div>
    );
  }

  const canHover =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const desktopPopover = !usePortalSheet ? (
    <>
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
    </>
  ) : null;

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
      {desktopPopover}
      {portalSheet}
    </div>
  );
}
