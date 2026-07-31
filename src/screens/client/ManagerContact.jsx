// Виджет контакта менеджера в шапке кабинета клиента.
import { useState } from "react";
import {
  formatRussianPhone,
  getManagerPhoneLinks,
  getMaxLink,
  getTelegramLink,
} from "../../shared/appHelpers";

export function ManagerContact({ settings, profile = {}, orders = [] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const fullName = String(settings.managerFullName || "").trim();
  const phoneValue = formatRussianPhone(settings.managerPhone || "");
  const phoneLinks = getManagerPhoneLinks(settings.managerPhone);
  const maxLink = getMaxLink(settings.managerMax);
  const baseTelegramLink = getTelegramLink(settings.managerTelegram);
  const latestOrder = [...orders].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
  const message = `Здравствуйте! Компания «${profile.companyName || "клиент Clover"}». ${latestOrder?.number ? `Вопрос по заказу №${latestOrder.number}.` : "У меня вопрос по работе с Clover."}`;
  const telegramLink = baseTelegramLink
    ? `${baseTelegramLink}${baseTelegramLink.includes("?") ? "&" : "?"}text=${encodeURIComponent(message)}`
    : "";
  const hasAnyContact = Boolean(fullName || phoneLinks.phone || maxLink || telegramLink);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Скопируйте текст обращения:", message);
    }
  };

  return (
    <div
      className={open ? "manager-contact open" : "manager-contact"}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
    >
      <button className="manager-contact-trigger" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        Связаться с менеджером
      </button>
      <div className="manager-contact-popover">
        <p className="eyebrow">Ваш менеджер</p>
        <h3>{fullName || "Менеджер Clover"}</h3>
        {phoneLinks.phone ? <a className="manager-contact-phone" href={phoneLinks.phone}>{phoneValue}</a> : <p className="manager-contact-note">Телефон пока не указан.</p>}
        <div className="manager-message-template">
          <strong>Шаблон обращения</strong>
          <p>{message}</p>
          <button className="secondary-button" type="button" onClick={copyMessage}>{copied ? "Скопировано" : "Скопировать текст"}</button>
        </div>
        {hasAnyContact && (phoneLinks.phone || maxLink || telegramLink) ? (
          <div className="manager-contact-actions">
            {phoneLinks.phone && <a className="primary" href={phoneLinks.phone}>Позвонить</a>}
            {maxLink && <a className={phoneLinks.phone ? "" : "primary"} href={maxLink} target="_blank" rel="noreferrer" onClick={copyMessage}>Открыть MAX</a>}
            {telegramLink && <a className={phoneLinks.phone || maxLink ? "wide" : "primary wide"} href={telegramLink} target="_blank" rel="noreferrer">Открыть Telegram</a>}
          </div>
        ) : <div className="manager-contact-empty">Контакты менеджера ещё не заполнены.</div>}
      </div>
    </div>
  );
}
