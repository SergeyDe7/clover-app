import {
  ANALYTICS_ALLOWED_QUERY_KEYS,
  ANALYTICS_ALLOWED_QUERY_PREFIXES,
  PRODUCTION_ANALYTICS_ORIGIN,
} from "./metrikaConfig.js";
import { isExcludedAnalyticsPath } from "./metrikaScope.js";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE =
  /(?:\+7|8)[\s().-]*\d{3}[\s().-]*\d{3}[\s().-]*\d{2}[\s().-]*\d{2}/g;
const CLICK_ID_VALUE_RE = /^[A-Za-z0-9]{1,128}$/;
const UTM_VALUE_RE = /^[A-Za-z0-9._~-]{1,80}$/;

export function isAllowedAnalyticsQueryKey(key) {
  const name = String(key || "").trim().toLowerCase();
  if (!name) return false;
  if (ANALYTICS_ALLOWED_QUERY_KEYS.includes(name)) return true;
  return ANALYTICS_ALLOWED_QUERY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function looksLikeEmail(value) {
  EMAIL_RE.lastIndex = 0;
  return EMAIL_RE.test(value);
}

function looksLikePhone(value) {
  PHONE_RE.lastIndex = 0;
  return PHONE_RE.test(value);
}

function looksLikeBareRuMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 && /^9\d{9}$/.test(digits)) return true;
  if (digits.length === 11 && /^[78]\d{10}$/.test(digits)) return true;
  return false;
}

/**
 * Click IDs and UTM use separate rules.
 * A click-id charset match is not a claim that the value cannot be personal
 * data; it only means the token passed the advertising-id allowlist.
 * UTM values are still scanned for email / phone / phone-like digits.
 */
export function sanitizeAnalyticsQueryValue(key, value) {
  const name = String(key || "").trim().toLowerCase();
  const clean = String(value || "").trim();
  if (!name || !isAllowedAnalyticsQueryKey(name)) {
    return { ok: false, reason: "key-not-allowlisted" };
  }
  if (!clean) return { ok: false, reason: "empty" };
  if (ANALYTICS_ALLOWED_QUERY_KEYS.includes(name)) {
    if (!CLICK_ID_VALUE_RE.test(clean)) return { ok: false, reason: "click-id-charset" };
    return { ok: true, value: clean };
  }
  if (looksLikeEmail(clean)) return { ok: false, reason: "email" };
  if (looksLikePhone(clean)) return { ok: false, reason: "phone" };
  if (looksLikeBareRuMobile(clean)) return { ok: false, reason: "phone-digits" };
  if (!UTM_VALUE_RE.test(clean)) return { ok: false, reason: "utm-charset" };
  return { ok: true, value: clean };
}

export function sanitizeAnalyticsTitle(title) {
  let value = String(title || "").replace(/\s+/g, " ").trim();
  if (!value) return "КЛЕВЕР";
  EMAIL_RE.lastIndex = 0;
  PHONE_RE.lastIndex = 0;
  value = value.replace(EMAIL_RE, "[redacted]").replace(PHONE_RE, "[redacted]");
  if (value.length > 180) value = value.slice(0, 180);
  return value;
}

function safeUrl(href, origin = PRODUCTION_ANALYTICS_ORIGIN) {
  try {
    return new URL(String(href || ""), `${origin}/`);
  } catch {
    return null;
  }
}

export function sanitizeAnalyticsUrl(href, origin = PRODUCTION_ANALYTICS_ORIGIN) {
  return sanitizeAnalyticsUrlDetails(href, origin).url;
}

export function sanitizeAnalyticsUrlDetails(href, origin = PRODUCTION_ANALYTICS_ORIGIN) {
  const url = safeUrl(href, origin);
  if (!url) {
    return {
      url: `${PRODUCTION_ANALYTICS_ORIGIN}/`,
      kept: [],
      dropped: [{ key: "", reason: "invalid-url" }],
    };
  }
  const kept = [];
  const dropped = [];
  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    const result = sanitizeAnalyticsQueryValue(key, value);
    if (!result.ok) {
      dropped.push({ key, reason: result.reason });
      continue;
    }
    kept.push({ key, value: result.value });
    params.append(key, result.value);
  }
  const path = url.pathname || "/";
  const search = params.toString();
  return {
    url: `${PRODUCTION_ANALYTICS_ORIGIN}${path}${search ? `?${search}` : ""}`,
    kept,
    dropped,
  };
}

export function sanitizeAnalyticsReferrer(referrer, origin = PRODUCTION_ANALYTICS_ORIGIN) {
  const raw = String(referrer || "").trim();
  if (!raw) return "";
  const url = safeUrl(raw, origin);
  if (!url) return "";
  if (isExcludedAnalyticsPath(url.pathname)) return "";
  return sanitizeAnalyticsUrl(url.href, origin);
}

export function buildAnalyticsHit(locationLike = {}, title = "") {
  const pathname = locationLike.pathname || "/";
  const search = locationLike.search || "";
  const href = `${pathname}${search}${locationLike.hash || ""}`;
  const details = sanitizeAnalyticsUrlDetails(href);
  return {
    url: details.url,
    title: sanitizeAnalyticsTitle(title),
    referer: sanitizeAnalyticsReferrer(locationLike.referrer || ""),
    key: details.url,
    kept: details.kept,
    dropped: details.dropped,
  };
}

function withoutAllowlistedClickIds(urlValue) {
  try {
    const url = new URL(String(urlValue || ""), `${PRODUCTION_ANALYTICS_ORIGIN}/`);
    for (const key of ANALYTICS_ALLOWED_QUERY_KEYS) url.searchParams.delete(key);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return String(urlValue || "");
  }
}

export function payloadContainsSensitiveLeak(payload, extras = []) {
  const clone = { ...(payload || {}) };
  if (typeof clone.url === "string") {
    clone.url = withoutAllowlistedClickIds(clone.url);
  }
  const blob = `${JSON.stringify(clone)}\n${extras.join("\n")}`.toLowerCase();
  const needles = [
    "password",
    "authorization",
    "bearer ",
    "localstorage",
    "contactname",
    "customerphone",
    "deliveryaddress",
    "clientcomment",
  ];
  if (needles.some((item) => blob.includes(item))) return true;
  return looksLikeEmail(blob) || looksLikePhone(blob);
}
