import { STORE_HOSTS } from "../../config/urls.js";

const PREVIEW_PREFIX = "/vitrina";

function hostName() {
  return window.location.hostname.replace(/^www\./i, "").toLowerCase();
}

function isStoreHost() {
  return STORE_HOSTS.has(hostName());
}

/** Превью до переноса DNS: /vitrina на любом хосте (в т.ч. clover-order.ru). */
export function isStorefrontPreviewPath(pathname = window.location.pathname) {
  const path = String(pathname || "/");
  return path === PREVIEW_PREFIX || path.startsWith(`${PREVIEW_PREFIX}/`);
}

/**
 * Витрина:
 * - clover-spb.ru — всегда
 * - путь /vitrina… — только превью (ЛК на / и остальных URL не трогаем)
 */
export function shouldRenderStorefront() {
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
  const path = normalizeStorefrontPath(pathname);
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "catalog") {
    return {
      name: "catalog",
      category: parts[1] ? decodeURIComponent(parts[1]) : "",
      subcategory: parts[2] ? decodeURIComponent(parts[2]) : "",
      facet: parts[3] ? decodeURIComponent(parts[3]) : "",
    };
  }
  if (parts[0] === "product" && parts[1]) {
    return { name: "product", code: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "cart") return { name: "cart" };
  if (parts[0] === "checkout") return { name: "checkout" };
  return { name: "home" };
}

export function storefrontHref(route) {
  const prefix = isStoreHost() ? "" : PREVIEW_PREFIX;

  if (!route || route === "home" || route.name === "home") {
    return prefix || "/";
  }
  if (typeof route === "string") {
    const path = route.startsWith("/") ? route : `/${route}`;
    return `${prefix}${path}`;
  }
  if (route.name === "catalog") {
    if (!route.category) return `${prefix}/catalog`;
    let path = `${prefix}/catalog/${encodeURIComponent(route.category)}`;
    if (route.subcategory) {
      path += `/${encodeURIComponent(route.subcategory)}`;
      if (route.facet) path += `/${encodeURIComponent(route.facet)}`;
    }
    return path;
  }
  if (route.name === "product") {
    return `${prefix}/product/${encodeURIComponent(route.code)}`;
  }
  if (route.name === "cart") return `${prefix}/cart`;
  if (route.name === "checkout") return `${prefix}/checkout`;
  return prefix || "/";
}
