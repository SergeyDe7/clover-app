import { useEffect, useState } from "react";
import {
  formatRussianPhone,
  getManagerPhoneLinks,
} from "../../../shared/appHelpers";
import {
  parseYandexMapsPoint,
  yandexEmbedSrc,
  yandexStaticMapSrc,
} from "../../../shared/yandexMaps.js";
import { storefrontApi } from "../publicApi.js";

const MAP_ZOOM_MIN = 1;
const MAP_ZOOM_MAX = 2.5;
const MAP_ZOOM_STEP = 0.25;

function mailtoHref(email) {
  const value = String(email || "").trim();
  // javascript: and other non-email values never become a mailto link.
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) return "";
  return `mailto:${value}`;
}

function ContactsMap({ image, embedSrc, mapsUrl }) {
  const [zoom, setZoom] = useState(MAP_ZOOM_MIN);
  if (!image && !embedSrc) return null;

  return (
    <div className="sf-contacts-map">
      <div className="sf-contacts-map-view">
        <div
          className="sf-contacts-map-inner"
          style={{ transform: `scale(${zoom})` }}
        >
          {image ? (
            <img src={image} alt="Карта с адресом" width="650" height="450" />
          ) : (
            <iframe
              title="Яндекс.Карты"
              src={embedSrc}
              width="650"
              height="450"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allow="fullscreen"
            />
          )}
        </div>
      </div>
      <div className="sf-contacts-map-zoom">
        <button
          type="button"
          aria-label="Уменьшить карту"
          disabled={zoom <= MAP_ZOOM_MIN}
          onClick={() =>
            setZoom((value) => Math.max(MAP_ZOOM_MIN, value - MAP_ZOOM_STEP))
          }
        >
          −
        </button>
        <button
          type="button"
          aria-label="Увеличить карту"
          disabled={zoom >= MAP_ZOOM_MAX}
          onClick={() =>
            setZoom((value) => Math.min(MAP_ZOOM_MAX, value + MAP_ZOOM_STEP))
          }
        >
          +
        </button>
      </div>
      {mapsUrl ? (
        <a
          className="sf-contacts-map-link"
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
        >
          Открыть в Яндекс.Картах
        </a>
      ) : null}
    </div>
  );
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
  const embedSrc = yandexEmbedSrc(mapsUrl);
  const mapImage = site.contactMapImageUrl || staticMap;
  const hasMap = Boolean(mapImage || embedSrc);
  const hasAny =
    Boolean(phoneLinks.phone) ||
    Boolean(mailHref) ||
    Boolean(site.contactAddress) ||
    Boolean(site.contactHours) ||
    Boolean(site.contactNote) ||
    Boolean(mapsUrl) ||
    hasMap;

  return (
    <div className="sf-contacts-page">
      <h1>Контакты</h1>
      {error ? <p className="sf-error">{error}</p> : null}
      {!ready && !error ? <p className="sf-muted">Загружаем контакты…</p> : null}
      {ready && !error && !hasAny ? (
        <p className="sf-muted">Контакты пока не указаны.</p>
      ) : null}
      {ready && hasAny ? (
        <div className="sf-contacts-sheet">
          <div className="sf-contacts-facts">
            {phoneLinks.phone ? (
              <p className="sf-contacts-fact">
                <a href={phoneLinks.phone}>{phoneValue}</a>
              </p>
            ) : null}
            {mailHref ? (
              <p className="sf-contacts-fact">
                <a href={mailHref}>{site.contactEmail}</a>
              </p>
            ) : null}
            {site.contactHours ? (
              <p className="sf-contacts-fact">
                <span>Режим работы</span>
                <strong className="sf-contacts-pre">{site.contactHours}</strong>
              </p>
            ) : null}
            {site.contactNote ? (
              <p className="sf-contacts-fact">
                <span>Как проехать</span>
                <strong className="sf-contacts-pre">{site.contactNote}</strong>
              </p>
            ) : null}
          </div>
          <div className="sf-contacts-place">
            {site.contactAddress ? (
              <p className="sf-contacts-fact sf-contacts-address">
                {site.contactAddress}
              </p>
            ) : null}
            <ContactsMap image={mapImage} embedSrc={embedSrc} mapsUrl={mapsUrl} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
