/**
 * In-memory search index for 1C product catalog.
 * Rebuilds when catalog identity (length + sample ids + updated markers) changes.
 */

function clean(value) {
  return String(value ?? "").trim();
}

function searchBlob(item) {
  return `${item.name || ""} ${item.code || ""} ${item.id || ""}`.toLocaleLowerCase("ru-RU");
}

function catalogFingerprint(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return "0";
  const first = list[0];
  const mid = list[Math.floor(list.length / 2)];
  const last = list[list.length - 1];
  return [
    list.length,
    clean(first?.id),
    clean(mid?.id),
    clean(last?.id),
    clean(first?.purchasePriceUpdatedAt || first?.name),
    clean(last?.purchasePriceUpdatedAt || last?.name),
  ].join("|");
}

let cachedFingerprint = "";
/** @type {{ id: string, blob: string, item: object }[]} */
let cachedRows = [];

export function resetOneCProductSearchIndex() {
  cachedFingerprint = "";
  cachedRows = [];
}

export function ensureOneCProductSearchIndex(items) {
  const list = Array.isArray(items) ? items : [];
  const fingerprint = catalogFingerprint(list);
  if (fingerprint === cachedFingerprint && cachedRows.length === list.length) {
    return cachedRows;
  }
  cachedFingerprint = fingerprint;
  cachedRows = list.map((item) => ({
    id: clean(item.id),
    blob: searchBlob(item),
    item,
  }));
  return cachedRows;
}

/**
 * @returns {{ items: object[], total: number }}
 */
export function searchOneCProductsIndexed(items, { search = "", limit = 50, offset = 0 } = {}) {
  const rows = ensureOneCProductSearchIndex(items);
  const needle = String(search || "").trim().toLocaleLowerCase("ru-RU");
  const matched = needle
    ? rows.filter((row) => row.blob.includes(needle)).map((row) => row.item)
    : rows.map((row) => row.item);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  return {
    items: matched.slice(safeOffset, safeOffset + safeLimit),
    total: matched.length,
  };
}
