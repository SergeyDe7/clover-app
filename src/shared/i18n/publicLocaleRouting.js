import {
  DEFAULT_LOCALE,
  PUBLIC_LOCALE_CODES,
  getEnabledLocales,
  isExactPublicLocaleCode,
  toPublicLocaleCode,
} from "./languageRegistry.js";
import { PUBLIC_CANONICAL_ORIGIN } from "../publicSiteContract.js";

export const PUBLIC_LOCALE_INFRASTRUCTURE_META =
  "clover-public-locale-routes";
export const PUBLIC_LOCALE_INFRASTRUCTURE_ENABLED = "enabled";
export { PUBLIC_CANONICAL_ORIGIN };

const OPERATIONAL_PREFIXES = new Set([
  "api",
  "assets",
  "auth",
  "fonts",
  "lk",
  "manager",
  "admin",
  "uploads",
  // Bundled storefront static assets (hero slides under public/storefront/).
  "storefront",
]);
const OPERATIONAL_PATHS = new Set([
  "apple-touch-icon.png",
  "clover-logo.png",
  "favicon.png",
  "favicon-32.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-192.png",
  "icon-maskable-512.png",
  "index.html",
  "manifest.webmanifest",
  "offline.html",
  "robots.txt",
  "sitemap.xml",
  "sw.js",
]);

export function isPublicLocaleInfrastructureEnabled(value) {
  return value === true || String(value || "").trim().toLowerCase() === "enabled";
}

export function publicLocaleInfrastructureEnabledFromDocument(documentLike) {
  const value = documentLike
    ?.querySelector?.(`meta[name="${PUBLIC_LOCALE_INFRASTRUCTURE_META}"]`)
    ?.getAttribute?.("content");
  return isPublicLocaleInfrastructureEnabled(value);
}

export function publishedPublicLocales(enabledLanguages, infrastructureEnabled) {
  if (!isPublicLocaleInfrastructureEnabled(infrastructureEnabled)) {
    return Object.freeze([DEFAULT_LOCALE]);
  }
  return Object.freeze(getEnabledLocales(enabledLanguages));
}

export function isOperationalPublicPath(pathname) {
  const path = String(pathname || "/");
  const first = path.split("/").filter(Boolean)[0] || "";
  return OPERATIONAL_PREFIXES.has(first) || OPERATIONAL_PATHS.has(first);
}

export function isIndexablePublicSearch(search = "") {
  const raw = String(search || "");
  if (!raw || raw === "?") return true;
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  return [...params.keys()].every(
    (key) =>
      key.startsWith("utm_") ||
      ["gclid", "yclid", "ymclid"].includes(key)
  );
}

function safelyDecodeSegment(segment) {
  if (/%2f|%5c/i.test(segment)) {
    return { ok: false, value: "", reason: "encoded-separator" };
  }
  try {
    const value = decodeURIComponent(segment);
    if (!value || value.includes("/") || value.includes("\\") || value.includes("\0")) {
      return { ok: false, value: "", reason: "malformed-segment" };
    }
    return { ok: true, value, reason: "" };
  } catch {
    return { ok: false, value: "", reason: "malformed-encoding" };
  }
}

function splitSafePath(pathname) {
  const raw = String(pathname || "/");
  if (!raw.startsWith("/") || raw.includes("\\") || raw.includes("\0")) {
    return { ok: false, segments: [], reason: "malformed-path" };
  }
  if (raw.includes("//")) {
    return { ok: false, segments: [], reason: "duplicate-separator" };
  }
  const encoded = raw.split("/").filter(Boolean);
  const segments = [];
  for (const segment of encoded) {
    const decoded = safelyDecodeSegment(segment);
    if (!decoded.ok) return { ok: false, segments: [], reason: decoded.reason };
    segments.push(decoded.value);
  }
  return { ok: true, segments, reason: "" };
}

function localePrefixFromSegment(segment) {
  const raw = String(segment || "");
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return PUBLIC_LOCALE_CODES.includes(lower) ? lower : null;
}

export function stripPublicLocalePrefix(
  pathname,
  { infrastructureEnabled = false } = {}
) {
  const original = String(pathname || "/");
  if (!isPublicLocaleInfrastructureEnabled(infrastructureEnabled)) {
    return {
      ok: true,
      locale: null,
      pathname: original,
      canonicalSpelling: true,
      reason: "infrastructure-disabled",
    };
  }

  const parsed = splitSafePath(original);
  if (!parsed.ok) {
    return {
      ok: false,
      locale: null,
      pathname: original,
      canonicalSpelling: false,
      reason: parsed.reason,
    };
  }
  const [first, second] = parsed.segments;
  const locale = localePrefixFromSegment(first);
  if (!locale) {
    return {
      ok: true,
      locale: null,
      pathname: original,
      canonicalSpelling: true,
      reason: "",
    };
  }
  if (localePrefixFromSegment(second)) {
    return {
      ok: false,
      locale,
      pathname: original,
      canonicalSpelling: false,
      reason: "repeated-locale-prefix",
    };
  }

  const pathSegments = parsed.segments.slice(1);
  const stripped = pathSegments.length
    ? `/${pathSegments.map((part) => encodeURIComponent(part)).join("/")}`
    : "/";
  return {
    ok: true,
    locale,
    pathname: stripped,
    canonicalSpelling: first === locale,
    reason: "",
  };
}

function encodePathSegment(segment) {
  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    return encodeURIComponent(segment);
  }
}

export function normalizePublicPathname(pathname) {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  if (!parts.length) return "/";
  return `/${parts.map(encodePathSegment).join("/")}`;
}

export function publicPathForLocale(pathname, locale) {
  const publicCode = toPublicLocaleCode(locale);
  const normalized = normalizePublicPathname(pathname);
  return normalized === "/" ? `/${publicCode}/` : `/${publicCode}${normalized}`;
}

export function publicDocumentPath({
  pathname,
  locale,
  infrastructureEnabled = false,
  localeEligible = true,
} = {}) {
  const normalized = normalizePublicPathname(pathname);
  if (
    isPublicLocaleInfrastructureEnabled(infrastructureEnabled) &&
    localeEligible
  ) {
    return publicPathForLocale(normalized, locale);
  }
  return normalized;
}

export function unprefixedPublicPath(pathname, { infrastructureEnabled = false } = {}) {
  const parsed = stripPublicLocalePrefix(pathname, { infrastructureEnabled });
  return parsed.ok ? parsed.pathname : normalizePublicPathname(pathname);
}

export function publicAbsoluteUrl(pathname, locale) {
  return `${PUBLIC_CANONICAL_ORIGIN}${publicPathForLocale(pathname, locale)}`;
}

export function equivalentPublicLocaleHref({
  pathname,
  search = "",
  hash = "",
  locale,
  enabledLanguages = [DEFAULT_LOCALE],
  infrastructureEnabled = false,
} = {}) {
  if (!isPublicLocaleInfrastructureEnabled(infrastructureEnabled)) return "";
  const target = toPublicLocaleCode(locale);
  if (!getEnabledLocales(enabledLanguages).includes(target)) return "";
  const stripped = stripPublicLocalePrefix(pathname, {
    infrastructureEnabled: true,
  });
  if (!stripped.ok || isOperationalPublicPath(stripped.pathname)) return "";
  const nextPath = publicPathForLocale(stripped.pathname, target);
  const safeSearch = String(search || "").startsWith("?") ? String(search) : "";
  const safeHash = String(hash || "").startsWith("#") ? String(hash) : "";
  return `${nextPath}${safeSearch}${safeHash}`;
}

export function resolvePublicUrlLocale({
  pathname,
  enabledLanguages = [DEFAULT_LOCALE],
  infrastructureEnabled = false,
} = {}) {
  if (!isPublicLocaleInfrastructureEnabled(infrastructureEnabled)) {
    return {
      ok: true,
      locale: null,
      effectiveLocale: null,
      pathname: String(pathname || "/"),
      reason: "infrastructure-disabled",
    };
  }
  const parsed = stripPublicLocalePrefix(pathname, {
    infrastructureEnabled: true,
  });
  if (!parsed.ok) return { ...parsed, effectiveLocale: DEFAULT_LOCALE };
  const requested = parsed.locale || DEFAULT_LOCALE;
  const published = getEnabledLocales(enabledLanguages);
  if (parsed.locale && !published.includes(requested)) {
    return {
      ...parsed,
      ok: false,
      effectiveLocale: DEFAULT_LOCALE,
      reason: "locale-unpublished",
    };
  }
  if (parsed.locale && !isExactPublicLocaleCode(requested)) {
    return {
      ...parsed,
      ok: false,
      effectiveLocale: DEFAULT_LOCALE,
      reason: "locale-unsupported",
    };
  }
  return {
    ...parsed,
    effectiveLocale: requested,
    reason: "",
  };
}

export function describeNoindexPublicRoute(pathname, locale = null) {
  const path = normalizePublicPathname(pathname);
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 1 && ["cart", "checkout", "install-app"].includes(parts[0])) {
    return locale
      ? { ok: false, reason: "locale-prefix-not-allowed" }
      : { ok: true, name: parts[0], pathname: path };
  }
  if (parts[0] === "catalog" && parts.length === 4) {
    return { ok: true, name: "catalog", facet: parts[3], pathname: path };
  }
  return null;
}

export function publicAlternateLinks(pathname, locales) {
  const list = getEnabledLocales(locales);
  const links = list.map((locale) => ({
    hreflang: locale === "zh" ? "zh-CN" : locale,
    href: publicAbsoluteUrl(pathname, locale),
  }));
  if (list.includes(DEFAULT_LOCALE)) {
    links.push({
      hreflang: "x-default",
      href: publicAbsoluteUrl(pathname, DEFAULT_LOCALE),
    });
  }
  return links;
}
