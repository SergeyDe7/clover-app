/**
 * Yandex Metrica v1 — technical constants only.
 * Production sending stays OFF until a production UI *build* has
 * VITE_YANDEX_METRIKA_ENABLED=1 AND versioned analytics consent is granted.
 *
 * VITE_YANDEX_METRIKA_ENABLED is a Vite build-time flag. Changing server/.env
 * or the shell after `vite build` does not rewrite already shipped JS.
 * Already-open tabs keep the old bundle until reload. See
 * docs/technical/yandex-metrika-safe-init.md.
 *
 * This file does not claim legal readiness.
 */

export const YANDEX_METRIKA_COUNTER_ID = 112814607;
export const YANDEX_METRIKA_TAG_SRC = "https://mc.yandex.ru/metrika/tag.js";
export const YANDEX_METRIKA_ENABLED_ENV = "VITE_YANDEX_METRIKA_ENABLED";
export const YANDEX_METRIKA_ID_ENV = "VITE_YANDEX_METRIKA_ID";
export const YANDEX_METRIKA_TEST_MODE_ENV = "VITE_YANDEX_METRIKA_TEST_MODE";
export const YANDEX_METRIKA_TAG_SRC_ENV = "VITE_YANDEX_METRIKA_TAG_SRC";
export const YANDEX_METRIKA_TEST_TAG_SRC = "/__clover_metrika_mock.js";

export const PRODUCTION_ANALYTICS_HOSTS = Object.freeze(["clover-spb.ru"]);
export const PRODUCTION_ANALYTICS_ORIGIN = "https://clover-spb.ru";

/** Exact JavaScript-event identifiers to create in the Metrica cabinet. */
export const METRIKA_GOALS = Object.freeze({
  ORDER_SUBMITTED: "order_submitted",
  CONTACT_PHONE_CLICK: "contact_phone_click",
  CONTACT_MESSAGE_CLICK: "contact_message_click",
});

export const METRIKA_GOAL_IDS = Object.freeze(Object.values(METRIKA_GOALS));

/**
 * Official SPA init uses defer:true + manual hit.
 * Example snippet also enables clickmap/trackLinks/webvisor/ecommerce —
 * those stay explicitly off here.
 * @see https://yandex.ru/support/metrica/ru/code/counter-spa-setup
 * @see https://yandex.ru/support/metrica/ru/code/counter-initialize
 */
export const METRIKA_INIT_OPTIONS = Object.freeze({
  defer: true,
  clickmap: false,
  trackLinks: false,
  accurateTrackBounce: true,
  webvisor: false,
  ecommerce: false,
  trackHash: false,
  sendTitle: false,
  childIframe: false,
});

/**
 * Same advertising keys already treated as safe on public SEO URLs,
 * plus ysclid (Yandex Search click id, same class as yclid).
 * @see isIndexablePublicSearch in publicLocaleRouting.js
 */
export const ANALYTICS_ALLOWED_QUERY_KEYS = Object.freeze([
  "yclid",
  "ymclid",
  "ysclid",
  "gclid",
]);

export const ANALYTICS_ALLOWED_QUERY_PREFIXES = Object.freeze(["utm_"]);

export const ANALYTICS_CONSENT_STORAGE_KEY = "clover-analytics-consent-v1";
export const ANALYTICS_CONSENT_SCHEMA_VERSION = 1;
export const ANALYTICS_CONSENT_GRANTED = "granted";
export const ANALYTICS_CONSENT_DENIED = "denied";
export const ANALYTICS_CONSENT_UNSET = "unset";
export const ANALYTICS_CONSENT_CHANGED_EVENT = "clover-analytics-consent-changed";
export const ANALYTICS_SETTINGS_OPEN_EVENT = "clover-analytics-settings-open";
export const ANALYTICS_ORDER_DEDUPE_STORAGE_KEY = "clover-metrika-order-goals-v1";

export const LOCAL_DEV_HOSTS = Object.freeze([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

export function readMetrikaEnvFlag(env = {}) {
  return String(env?.[YANDEX_METRIKA_ENABLED_ENV] || "").trim() === "1";
}

export function isMetrikaTestMode(env = {}) {
  return String(env?.[YANDEX_METRIKA_TEST_MODE_ENV] || "").trim() === "1";
}

export function resolveMetrikaTagSrc(env = {}) {
  if (!isMetrikaTestMode(env)) return YANDEX_METRIKA_TAG_SRC;
  const src = String(env?.[YANDEX_METRIKA_TAG_SRC_ENV] || "").trim();
  if (!src || /mc\.yandex\./i.test(src) || /yandex\.ru\/metrika/i.test(src)) {
    return YANDEX_METRIKA_TEST_TAG_SRC;
  }
  return src;
}

export function readMetrikaCounterId(env = {}) {
  const raw = String(env?.[YANDEX_METRIKA_ID_ENV] || "").trim();
  if (!raw) return YANDEX_METRIKA_COUNTER_ID;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : YANDEX_METRIKA_COUNTER_ID;
}
