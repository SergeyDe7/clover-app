import { useEffect, useState } from "react";
import {
  formatRussianPhone,
  getManagerPhoneLinks,
} from "../../../shared/appHelpers";
import {
  parseYandexMapsPoint,
  yandexStaticMapSrc,
} from "../../../shared/yandexMaps.js";
import { storefrontApi } from "../publicApi.js";

function mailtoHref(email) {
  const value = String(email || "").trim();
  // javascript: and other non-email values never become a mailto link.
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) return "";
  return `mailto:${value}`;
}

export function ContactsPage() {
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [site, setSite] = useState({
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
    contactHours: "",
    contactNote: "",
    contactMapsUrl: "",
    contactMapImageUrl: "",
  });

  useEffect(() => {
    let cancelled = false;
    storefrontApi
      .site()
      .then((payload) => {
        if (cancelled) return;
        setSite({
          contactPhone: payload?.site?.contactPhone || "",
          contactEmail: payload?.site?.contactEmail || "",
          contactAddress: payload?.site?.contactAddress || "",
          contactHours: payload?.site?.contactHours || "",
          contactNote: payload?.site?.contactNote || "",
          contactMapsUrl: payload?.site?.contactMapsUrl || "",
          contactMapImageUrl: payload?.site?.contactMapImageUrl || "",
        });
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Не удалось загрузить контакты.");
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const phoneValue = formatRussianPhone(site.contactPhone);
  const phoneLinks = getManagerPhoneLinks(site.contactPhone);
  const mailHref = mailtoHref(site.contactEmail);
  const mapsUrl = site.contactMapsUrl || "";
  const point = parseYandexMapsPoint(mapsUrl);
  const staticMap = yandexStaticMapSrc(point);
  const mapImage = site.contactMapImageUrl || staticMap;
  const hasAny =
    Boolean(phoneLinks.phone) ||
    Boolean(mailHref) ||
    Boolean(site.contactAddress) ||
    Boolean(site.contactHours) ||
    Boolean(site.contactNote) ||
    Boolean(mapsUrl) ||
    Boolean(mapImage);

  return (
    <div className="sf-contacts-page">
      <div className="sf-section-head">
        <h1>Контакты</h1>
        <p>Компания КЛЕВЕР — телефон, почта, адрес и как нас найти.</p>
      </div>
      {error ? <p className="sf-error">{error}</p> : null}
      {!ready && !error ? <p className="sf-muted">Загружаем контакты…</p> : null}
      {ready && !error && !hasAny ? (
        <p className="sf-muted">Контакты пока не указаны.</p>
      ) : null}
      {ready && hasAny ? (
        <div className="sf-contacts-layout">
          <div className="sf-contacts-card">
            {phoneLinks.phone ? (
              <p className="sf-contacts-item">
                <span>Телефон</span>
                <a href={phoneLinks.phone}>{phoneValue}</a>
              </p>
            ) : null}
            {mailHref ? (
              <p className="sf-contacts-item">
                <span>Почта</span>
                <a href={mailHref}>{site.contactEmail}</a>
              </p>
            ) : null}
            {site.contactAddress ? (
              <p className="sf-contacts-item">
                <span>Адрес</span>
                <strong>{site.contactAddress}</strong>
              </p>
            ) : null}
            {site.contactHours ? (
              <p className="sf-contacts-item">
                <span>Режим работы</span>
                <strong className="sf-contacts-pre">{site.contactHours}</strong>
              </p>
            ) : null}
            {site.contactNote ? (
              <p className="sf-contacts-item">
                <span>Как проехать</span>
                <strong className="sf-contacts-pre">{site.contactNote}</strong>
              </p>
            ) : null}
            <div className="sf-contacts-actions">
              {phoneLinks.phone ? (
                <a className="sf-btn sf-btn-primary" href={phoneLinks.phone}>
                  Позвонить
                </a>
              ) : null}
              {mailHref ? (
                <a className="sf-btn sf-btn-ghost" href={mailHref}>
                  Написать
                </a>
              ) : null}
              {mapsUrl ? (
                <a
                  className="sf-btn sf-btn-ghost"
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть в Яндекс.Картах
                </a>
              ) : null}
            </div>
          </div>
          {mapImage ? (
            <div className="sf-contacts-map">
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noreferrer">
                  <img
                    src={mapImage}
                    alt="Точка на карте"
                    width="650"
                    height="450"
                  />
                </a>
              ) : (
                <img
                  src={mapImage}
                  alt="Точка на карте"
                  width="650"
                  height="450"
                />
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
