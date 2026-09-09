import { useLocalization } from "../../../shared/i18n/LocalizationProvider";
import { useEffect, useState } from "react";
import {
  formatRussianPhone,
  getManagerPhoneLinks,
} from "../../../shared/appHelpers";
import {
  clampYandexZoom,
  parseYandexMapsPoint,
  yandexEmbedSrc,
  yandexMapWidgetSrc,
  yandexStaticMapSrc,
} from "../../../shared/yandexMaps.js";
import { storefrontApi } from "../publicApi.js";

const MAP_Z_MIN = 4;
const MAP_Z_MAX = 21;
const CSS_ZOOM_MIN = 0.75;
const CSS_ZOOM_MAX = 2.5;
const CSS_ZOOM_STEP = 0.25;

function mailtoHref(email) {
  const value = String(email || "").trim();
  // javascript: and other non-email values never become a mailto link.
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) return "";
  return `mailto:${value}`;
}

function ContactsMap({ point, customImage, embedSrc, mapsUrl }) {
  const { t } = useLocalization();
    const geoZoom = Boolean(point) && !customImage;
  const [zoom, setZoom] = useState(() =>
    geoZoom ? clampYandexZoom(point.zoom) : 1
  );
  const min = geoZoom ? MAP_Z_MIN : CSS_ZOOM_MIN;
  const max = geoZoom ? MAP_Z_MAX : CSS_ZOOM_MAX;
  const step = geoZoom ? 1 : CSS_ZOOM_STEP;
  const livePoint = point ? { ...point, zoom } : null;
  const image =
    customImage || (livePoint ? yandexStaticMapSrc(livePoint) : "");
  const frameSrc = livePoint ? yandexMapWidgetSrc(livePoint) : embedSrc;
  if (!image && !frameSrc) return null;

  return (
    <div className="sf-contacts-map" data-map-zoom={zoom} data-map-geo={geoZoom ? "1" : "0"}>
      <div className="sf-contacts-map-view">
        <div
          className="sf-contacts-map-inner"
          style={geoZoom ? undefined : { transform: `scale(${zoom})` }}
        >
          {image ? (
            <img src={image} alt={t("storefront.mapWithAddress")} width="650" height="450" />
          ) : (
            <iframe
              title={t("storefront.yandexMaps")}
              src={frameSrc}
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
          aria-label={t("storefront.zoomInMap")}
          disabled={zoom >= max}
          onClick={() =>
            setZoom((value) => Math.min(max, value + step))
          }
        >
          +
        </button>
        <button
          type="button"
          aria-label={t("storefront.zoomOutMap")}
          disabled={zoom <= min}
          onClick={() =>
            setZoom((value) => Math.max(min, value - step))
          }
        >
          −
        </button>
      </div>
      {mapsUrl ? (
        <a
          className="sf-btn sf-btn-ghost sf-btn-sm sf-contacts-map-link"
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
        >{
          t("storefront.openInYandexMaps")
        }</a>
      ) : null}
    </div>
  );
}

function Fact({ label, children }) {
  return (
    <div className="sf-contacts-fact">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function ContactsPage() {
  const { t } = useLocalization();
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
  const hasReach = Boolean(phoneLinks.phone) || Boolean(mailHref);
  const hasPlace =
    Boolean(site.contactAddress) ||
    Boolean(site.contactHours) ||
    Boolean(site.contactNote) ||
    Boolean(mapsUrl) ||
    hasMap;
  const hasAny = hasReach || hasPlace;

  return (
    <div className="sf-contacts-page">
      <header className="sf-section-head">
        <h1>{t("storefront.nav.contacts")}</h1>
      </header>
      {error ? <p className="sf-error">{error}</p> : null}
      {!ready && !error ? <p className="sf-muted">{t("storefront.loadingContacts")}</p> : null}
      {ready && !error && !hasAny ? (
        <p className="sf-muted">{t("storefront.contactsAreNotSetYet")}</p>
      ) : null}
      {ready && hasAny ? (
        <div className="sf-contacts-sheet">
          {hasReach ? (
            <section
              className="sf-contacts-col"
              aria-labelledby="sf-contacts-reach-title"
            >
              <h2 id="sf-contacts-reach-title">{t("storefront.contact")}</h2>
              {phoneLinks.phone ? (
                <Fact label={t("auth.register.phone")}>
                  <a href={phoneLinks.phone}>{phoneValue}</a>
                  <a className="sf-btn sf-btn-primary sf-btn-sm" href={phoneLinks.phone}>{
                    t("storefront.call")
                  }</a>
                </Fact>
              ) : null}
              {mailHref ? (
                <Fact label={t("shared.field.emailShort")}>
                  <a href={mailHref}>{site.contactEmail}</a>
                  <a className="sf-btn sf-btn-ghost sf-btn-sm" href={mailHref}>{
                    t("storefront.write")
                  }</a>
                </Fact>
              ) : null}
            </section>
          ) : null}
          {hasPlace ? (
            <section
              className="sf-contacts-col sf-contacts-place"
              aria-labelledby="sf-contacts-place-title"
            >
              <h2 id="sf-contacts-place-title">{t("storefront.howToFindUs")}</h2>
              {site.contactAddress ? (
                <Fact label={t("shared.field.address")}>
                  <strong>{site.contactAddress}</strong>
                </Fact>
              ) : null}
              {site.contactHours ? (
                <Fact label={t("storefront.workingHours")}>
                  <strong className="sf-contacts-pre">{site.contactHours}</strong>
                </Fact>
              ) : null}
              {site.contactNote ? (
                <Fact label={t("storefront.howToGetThere")}>
                  <strong className="sf-contacts-pre">{site.contactNote}</strong>
                </Fact>
              ) : null}
              <ContactsMap
                point={point}
                customImage={site.contactMapImageUrl}
                embedSrc={embedSrc}
                mapsUrl={mapsUrl}
              />
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
