/**
 * In-memory search index for 1C product catalog.
 * Rebuilds when catalog identity (length + sample ids + updated markers) changes.
 *
 * Search is token-based with text normalization (×/x→х, punctuation→spaces),
 * so Clover names like "300×400 мм" match 1C "300 х 400мм".
 */

const STOP_WORDS = new Set([
  "для",
  "и",
  "в",
  "во",
  "на",
  "из",
  "с",
  "со",
  "по",
  "шт",
  "штук",
  "штука",
  "штуки",
  "уп",
  "упак",
  "упаковка",
  "мм",
  "мкм",
  "л",
  "мл",
  "см",
]);

function clean(value) {
  return String(value ?? "").trim();
}

/** Normalize for fuzzy catalog search: case, sizes, digit/letter split. */
export function normalizeSearchText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    // размеры: 300×400 / 300x400 / 300х400 → 300 400
    .replace(/(\d)\s*[×xх✕✖]\s*(\d)/gi, "$1 $2")
    .replace(/[×x✕✖]/g, " ")
    .replace(/[–—−]/g, "-")
    // 400мм / 70мкм → 400 мм / 70 мкм
    .replace(/(\d)([a-zа-я]+)/gi, "$1 $2")
    .replace(/([a-zа-я]+)(\d)/gi, "$1 $2")
    .replace(/[^0-9a-zа-яё-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchQuery(value) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function searchBlob(item) {
  return normalizeSearchText(
    `${item.name || ""} ${item.code || ""} ${item.id || ""}`
  );
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

function rankRowAnd(blob, tokens, rawNeedle) {
  if (!tokens.length) return 1;
  let score = 0;
  for (const token of tokens) {
    if (!blob.includes(token)) return 0;
    score += 1;
    if (blob.startsWith(token)) score += 0.25;
  }
  if (rawNeedle && blob.includes(rawNeedle)) score += 2;
  return score;
}

/** Хотя бы один токен — чтобы длинный запрос из Clover всё же находил позиции 1С. */
function rankRowOr(blob, tokens, rawNeedle) {
  if (!tokens.length) return 0;
  let hit = 0;
  for (const token of tokens) {
    if (!blob.includes(token)) continue;
    hit += 1;
    if (blob.startsWith(token)) hit += 0.25;
  }
  if (!hit) return 0;
  if (rawNeedle && blob.includes(rawNeedle)) hit += 2;
  // Штраф относительно полного AND, чтобы OR не перебивал точные совпадения.
  return hit * 0.5;
}

function scoreCatalog(rows, tokens, needle) {
  const queryTokens = tokens.length ? tokens : needle ? [needle] : [];
  const scored = [];
  for (const row of rows) {
    const score = rankRowAnd(row.blob, queryTokens, needle);
    if (score > 0) scored.push({ item: row.item, score, name: row.item.name || "" });
  }
  // Если AND ничего не дал (типично при вставке названия из Clover) — OR по токенам.
  if (!scored.length && queryTokens.length > 1) {
    for (const row of rows) {
      const score = rankRowOr(row.blob, queryTokens, needle);
      if (score > 0) scored.push({ item: row.item, score, name: row.item.name || "" });
    }
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      String(a.name).localeCompare(String(b.name), "ru")
  );
  return scored.map((entry) => entry.item);
}

/**
 * @returns {{ items: object[], total: number }}
 */
export function searchOneCProductsIndexed(items, { search = "", limit = 50, offset = 0 } = {}) {
  const rows = ensureOneCProductSearchIndex(items);
  const raw = String(search || "").trim();
  const needle = normalizeSearchText(raw);
  const tokens = tokenizeSearchQuery(raw);

  const matched = !needle
    ? rows.map((row) => row.item)
    : scoreCatalog(rows, tokens, needle);

  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  return {
    items: matched.slice(safeOffset, safeOffset + safeLimit),
    total: matched.length,
  };
}
