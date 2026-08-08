/** URL витрины и ЛК. После переезда CABINET_URL можно сменить на путь на clover-spb.ru. */

export const CABINET_URL = String(
  import.meta.env.VITE_CABINET_URL || "https://clover-order.ru"
).replace(/\/$/, "");

export const STORE_HOSTS = new Set(["clover-spb.ru"]);

export function cabinetLoginUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${CABINET_URL}${normalized}`;
}
