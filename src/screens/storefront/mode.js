import { STORE_HOSTS, CABINET_PATH, isCabinetPath } from "../../config/urls.js";
import { STOREFRONT_INFO_SLUGS } from "./pages/infoPages.js";
import {
  isOperationalPublicPath,
  publicLocaleInfrastructureEnabledFromDocument,
  publicPathForLocale,
  stripPublicLocalePrefix,
} from "../../shared/i18n/publicLocaleRouting.js";

const PREVIEW_PREFIX = "/vitrina";

function hostName() {
  return window.location.hostname.replace(/^www\./i, "").toLowerCase();
}

function isStoreHost() {
  return STORE_HOSTS.has(hostName());
}

/** Превью витрины по пути /vitrina… (на любом хосте, в т.ч. localhost). */
export function isStorefrontPreviewPath(pathname = window.location.pathname) {
  const path = String(pathname || "/");
  return path === PREVIEW_PREFIX || path.startsWith(`${PREVIEW_PREFIX}/`);
}

/**
 * Витрина:
 * - хост витрины (clover-spb.ru) — да, кроме пути ЛК (/lk)
 * - путь /vitrina… — превью
 * Иначе — ЛК (App).
 */
export function shouldRenderStorefront() {
  if (isCabinetPath(window.location.pathname)) return false;
  if (isStoreHost()) return true;
  if (isStorefrontPreviewPath()) return true;
  return false;
}

export function normalizeStorefrontPath(pathname = window.location.pathname) {
  const raw = String(pathname || "/");
  if (raw === PREVIEW_PREFIX || raw === `${PREVIEW_PREFIX}/`) return "/";
  if (raw.startsWith(`${PREVIEW_PREFIX}/`)) {
    return raw.slice(PREVIEW_PREFIX.length) || "/";
  }
  return raw || "/";
}

export function isPublicLocaleRoutingEnabled() {
  return (
    typeof document !== "undefined" &&
    publicLocaleInfrastructureEnabledFromDocument(document)
  );
}

function decodeRoutePart(part) {
  if (/%2f|%5c/i.test(part)) throw new Error("encoded separator");
  return decodeURIComponent(part);
}

export function parseStorefrontRoute(
  pathname = window.location.pathname,
  { infrastructureEnabled = isPublicLocaleRoutingEnabled() } = {}
) {
  const normalized = normalizeStorefrontPath(pathname);
  const prefixed = stripPublicLocalePrefix(normalized, {
    infrastructureEnabled,
  });
  if (!prefixed.ok) {
    return {
      name: "notFound",
      locale: prefixed.locale || "ru",
      reason: prefixed.reason,
    };
  }
  if (prefixed.locale && isOperationalPublicPath(prefixed.pathname)) {
    return {
      name: "notFound",
      locale: prefixed.locale,
      reason: "locale-prefix-not-allowed",
    };
  }

  const path = prefixed.pathname;
  let parts;
  try {
    parts = path.split("/").filter(Boolean).map(decodeRoutePart);
  } catch {
    return {
      name: "notFound",
      locale: prefixed.locale || "ru",
      reason: "malformed-encoding",
    };
  }
  const locale = infrastructureEnabled ? prefixed.locale || "ru" : null;
  const withLocale = (route) => ({ ...route, locale });

  if (parts.length === 0) return withLocale({ name: "home" });
  if (parts[0] === "catalog" && parts.length <= 4) {
    return withLocale({
      name: "catalog",
      category: parts[1] || "",
      subcategory: parts[2] || "",
      facet: parts[3] || "",
    });
  }
  if (parts[0] === "product" && parts.length === 2 && parts[1]) {
    return withLocale({ name: "product", code: parts[1] });
  }
  if (parts.length === 1 && parts[0] === "cart" && !prefixed.locale) {
    return withLocale({ name: "cart" });
  }
  if (parts.length === 1 && parts[0] === "checkout" && !prefixed.locale) {
    return withLocale({ name: "checkout" });
  }
  if (parts.length === 1 && parts[0] === "contacts") {
    return withLocale({ name: "contacts" });
  }
  if (parts.length === 1 && parts[0] === "aktsii") {
    return withLocale({ name: "aktsii" });
  }
  // Locale-prefixed and bare /install-app both resolve (PWA guide must keep UI language).
  if (parts.length === 1 && parts[0] === "install-app") {
    return withLocale({ name: "install-app" });
  }
  if (parts.length === 1 && STOREFRONT_INFO_SLUGS.includes(parts[0])) {
    return withLocale({ name: "info", slug: parts[0] });
  }
  if (infrastructureEnabled) {
    return withLocale({ name: "notFound", reason: "unknown-public-route" });
  }
  return { name: "home" };
}

export function storefrontRoutePath(route) {
  if (!route || route === "home" || route.name === "home") return "/";
  if (typeof route === "string") {
    return route.startsWith("/") ? route : `/${route}`;
  }
  if (route.name === "catalog") {
    if (!route.category) return "/catalog";
    let path = `/catalog/${encodeURIComponent(route.category)}`;
    if (route.subcategory) {
      path += `/${encodeURIComponent(route.subcategory)}`;
      if (route.facet) path += `/${encodeURIComponent(route.facet)}`;
    }
    return path;
  }
  if (route.name === "product") return `/product/${encodeURIComponent(route.code)}`;
  if (route.name === "cart") return "/cart";
  if (route.name === "checkout") return "/checkout";
  if (route.name === "contacts") return "/contacts";
  if (route.name === "aktsii") return "/aktsii";
  if (route.name === "install-app") return "/install-app";
  if (route.name === "info" && STOREFRONT_INFO_SLUGS.includes(route.slug)) {
    return `/${route.slug}`;
  }
  return "/";
}

export function storefrontHref(
  route,
  {
    locale,
    infrastructureEnabled = isPublicLocaleRoutingEnabled(),
  } = {}
) {
  const prefix = isStoreHost() ? "" : PREVIEW_PREFIX;
  const path = storefrontRoutePath(route);
  const routeName = typeof route === "object" ? route?.name : String(route || "home");
  const localeEligible = !["cart", "checkout"].includes(routeName);

  if (infrastructureEnabled && localeEligible) {
    const current =
      locale ||
      parseStorefrontRoute(window.location.pathname, {
        infrastructureEnabled: true,
      }).locale ||
      "ru";
    return `${prefix}${publicPathForLocale(path, current)}`;
  }
  return path === "/" ? prefix || "/" : `${prefix}${path}`;
}

export { CABINET_PATH, isCabinetPath };
