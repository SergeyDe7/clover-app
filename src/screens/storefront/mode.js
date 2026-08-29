import { STORE_HOSTS, CABINET_PATH, isCabinetPath } from "../../config/urls.js";
import {
  categorySlug,
  facetSlug,
  legacyCatalogPathRedirect,
  legacyPathRedirect,
  parseStorefrontPathname,
  subcategorySlug,
} from "./storefrontSlugs.js";

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

export function parseStorefrontRoute(pathname = window.location.pathname) {
  return parseStorefrontPathname(normalizeStorefrontPath(pathname));
}

export function storefrontHref(route) {
  const prefix = isStoreHost() ? "" : PREVIEW_PREFIX;

  if (!route || route === "home" || route.name === "home") {
    return prefix || "/";
  }
  if (route.name === "not-found") {
    return prefix || "/";
  }
  if (typeof route === "string") {
    const path = route.startsWith("/") ? route : `/${route}`;
    return `${prefix}${path}`;
  }
  if (route.name === "catalog") {
    if (!route.category) return `${prefix}/catalog`;
    let path = `${prefix}/catalog/${categorySlug(route.category)}`;
    if (route.subcategory) {
      path += `/${subcategorySlug(route.subcategory)}`;
      if (route.facet) path += `/${facetSlug(route.facet)}`;
    }
    return path;
  }
  if (route.name === "product") {
    if (!route.code) return `${prefix}/product`;
    return `${prefix}/product/${encodeURIComponent(route.code)}`;
  }
  if (route.name === "cart") return `${prefix}/cart`;
  if (route.name === "checkout") return `${prefix}/checkout`;
  if (route.name === "contacts") return `${prefix}/contacts`;
  if (route.name === "install-app") return `${prefix}/install-app`;
  return prefix || "/";
}

/** Клиентский fallback к серверным 301 (legacy / кириллица). */
export function clientLegacyRedirectTarget(pathname = window.location.pathname) {
  const path = String(pathname || "/");
  const legacy = legacyPathRedirect(path);
  let candidate = legacy || path;
  const cyr = legacyCatalogPathRedirect(candidate);
  if (cyr) candidate = cyr;
  if (candidate && candidate !== path) return candidate;
  return null;
}

export { CABINET_PATH, isCabinetPath, PREVIEW_PREFIX };
