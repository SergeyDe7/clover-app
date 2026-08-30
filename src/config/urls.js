/**
 * Публичные URL витрины и ЛК.
 * Канонический домен задаётся через VITE_PUBLIC_BASE_URL (или относительные пути).
 * ЛК на том же хосте: /lk (не отдельный clover-order.ru).
 */

export const PUBLIC_BASE_URL = String(
  import.meta.env.VITE_PUBLIC_BASE_URL ||
    import.meta.env.VITE_APP_PUBLIC_URL ||
    ""
).replace(/\/$/, "");

/** Путь ЛК на каноническом хосте (витрина занимает `/` на clover-spb.ru). */
export const CABINET_PATH = String(
  import.meta.env.VITE_CABINET_PATH || "/lk"
)
  .trim()
  .replace(/\/$/, "");

/**
 * База ЛК: явный VITE_CABINET_URL, иначе PUBLIC_BASE + /lk, иначе относительный /lk.
 */
export const CABINET_URL = String(
  import.meta.env.VITE_CABINET_URL ||
    (PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}${CABINET_PATH || "/lk"}` : CABINET_PATH || "/lk")
).replace(/\/$/, "");

export const STORE_HOSTS = new Set(
  String(import.meta.env.VITE_STORE_HOSTS || "clover-spb.ru")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
);

export function cabinetLoginUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") return `${CABINET_URL}/`;
  return `${CABINET_URL}${normalized}`;
}

export function isCabinetPath(pathname = "") {
  const path = String(pathname || "/");
  const prefix = CABINET_PATH || "/lk";
  return path === prefix || path.startsWith(`${prefix}/`);
}

const LK_SHELL_COLOR = "#f4f8f2";

/**
 * Storefront → ЛК: same-origin SPA switch (no document reload / no boot splash).
 * Cross-origin: full navigation with skip-splash flag for the next load.
 */
export function navigateToCabinetLogin(event) {
  const href = cabinetLoginUrl("/");
  let url;
  try {
    url = new URL(href, window.location.href);
  } catch {
    window.location.assign(href);
    return;
  }

  if (url.origin !== window.location.origin) {
    try {
      sessionStorage.setItem("clover-skip-boot-splash", "1");
    } catch {
      /* ignore */
    }
    if (event?.type === "click" && !event.defaultPrevented) {
      // allow <a href> default
      return;
    }
    window.location.assign(url.href);
    return;
  }

  if (event) event.preventDefault();
  const next = `${url.pathname}${url.search}${url.hash}` || `${CABINET_PATH || "/lk"}/`;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", LK_SHELL_COLOR);
  document.documentElement.style.backgroundColor = LK_SHELL_COLOR;
  document.body.style.backgroundColor = LK_SHELL_COLOR;
  window.history.pushState({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
