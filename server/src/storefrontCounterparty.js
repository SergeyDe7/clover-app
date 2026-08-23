export const STOREFRONT_DEFAULT_COUNTERPARTY_NAME = "Интернет магазин Clover";

function normName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
}

export function isStorefrontOrder(order) {
  return order?.source === "storefront" || order?.guest === true;
}

/**
 * Контрагент 1С для заказов витрины: выбранный в настройках ID
 * или точное имя «Интернет магазин Clover».
 */
export function resolveStorefrontOneCClient({
  settings = {},
  oneCClients = [],
} = {}) {
  const wantedId = String(settings.storefrontOneCClientId || "").trim();
  const wantedName =
    String(settings.storefrontOneCClientName || "").trim() ||
    STOREFRONT_DEFAULT_COUNTERPARTY_NAME;
  const catalog = Array.isArray(oneCClients) ? oneCClients : [];

  if (wantedId) {
    const byId = catalog.find(
      (item) => String(item?.id || "").trim() === wantedId
    );
    return {
      id: wantedId,
      code: String(byId?.code || "").trim(),
      name: String(byId?.name || wantedName).trim() || wantedName,
    };
  }

  const needle = normName(wantedName);
  const byName = catalog.find((item) => normName(item?.name) === needle);
  if (byName) {
    return {
      id: String(byName.id || "").trim(),
      code: String(byName.code || "").trim(),
      name: String(byName.name || wantedName).trim() || wantedName,
    };
  }

  return { id: "", code: "", name: wantedName };
}

export function overlayStorefrontClientLink(order, link, counterpart) {
  const current = link && typeof link === "object" ? { ...link } : {};
  if (!isStorefrontOrder(order) || !counterpart) return current;
  const oneCId = String(counterpart.id || current.oneCId || "").trim();
  const oneCCode = String(counterpart.code || current.oneCCode || "").trim();
  const oneCName = String(counterpart.name || current.oneCName || "").trim();
  return {
    ...current,
    matched1C: Boolean(oneCId),
    oneCId,
    oneCCode,
    oneCName,
  };
}
