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
