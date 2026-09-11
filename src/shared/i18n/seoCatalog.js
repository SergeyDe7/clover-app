/**
 * Code-owned Stage 5.2-B SEO metadata localization corpus.
 * Canonical RU source for the 10 SEO-specific route strings/templates.
 * Browser-safe: no Node builtins / sourceHash / DB / filesystem.
 */

export const SEO_NAMESPACE = "seo";
export const SEO_ENTITY_TYPE = "route";

/**
 * Tiny browser-safe template formatter for `{label}` / `{code}` only.
 * Unknown `{tokens}` are left unchanged.
 */
export function formatSeoTemplate(template, vars = {}) {
  const source = String(template || "");
  const bag = vars && typeof vars === "object" ? vars : {};
  return source.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(bag, key)) return match;
    const value = bag[key];
    return value == null ? "" : String(value);
  });
}

function freezeEntry(entry) {
  return Object.freeze({ ...entry, critical: true });
}

/** Exact Stage 5.2-B SEO identities (10). */
const RAW_ENTRIES = Object.freeze([
  Object.freeze({
    entityId: "catalog",
    fieldKey: "descriptionTemplate",
    sourceRu:
      "Каталог «{label}»: хозтовары, упаковка и расходники для HoReCa. Заказ без регистрации на сайте КЛЕВЕР.",
  }),
  Object.freeze({
    entityId: "product",
    fieldKey: "titleTemplate",
    sourceRu: "Товар {code} | КЛЕВЕР",
  }),
  Object.freeze({
    entityId: "cart",
    fieldKey: "title",
    sourceRu: "Корзина | КЛЕВЕР",
  }),
  Object.freeze({
    entityId: "cart",
    fieldKey: "description",
    sourceRu: "Корзина заказа на сайте компании КЛЕВЕР.",
  }),
  Object.freeze({
    entityId: "checkout",
    fieldKey: "title",
    sourceRu: "Оформление заказа | КЛЕВЕР",
  }),
  Object.freeze({
    entityId: "checkout",
    fieldKey: "description",
    sourceRu: "Оформление заказа хозтоваров и упаковки для HoReCa.",
  }),
  Object.freeze({
    entityId: "contacts",
    fieldKey: "title",
    sourceRu: "Контакты | КЛЕВЕР",
  }),
  Object.freeze({
    entityId: "contacts",
    fieldKey: "description",
    sourceRu: "Контакты компании КЛЕВЕР: адрес, телефон и карта проезда.",
  }),
  Object.freeze({
    entityId: "aktsii",
    fieldKey: "title",
    sourceRu: "Акции | КЛЕВЕР",
  }),
  Object.freeze({
    entityId: "aktsii",
    fieldKey: "description",
    sourceRu:
      "Акции и специальные предложения компании КЛЕВЕР для HoReCa. Актуальные информационные материалы на сайте clover-spb.ru.",
  }),
]);

function buildCatalog() {
  const entries = [];
  const byEntityField = new Map();

  for (const raw of RAW_ENTRIES) {
    const entry = freezeEntry({
      namespace: SEO_NAMESPACE,
      entityType: SEO_ENTITY_TYPE,
      entityId: raw.entityId,
      fieldKey: raw.fieldKey,
      sourceRu: raw.sourceRu,
      critical: true,
    });
    entries.push(entry);
    byEntityField.set(seoEntityFieldKey(raw.entityId, raw.fieldKey), entry);
  }

  if (entries.length !== 10) {
    throw new Error(`SEO catalog size mismatch: expected 10, got ${entries.length}`);
  }

  return {
    entries: Object.freeze(entries.slice()),
    byEntityField,
  };
}

export function seoEntityFieldKey(entityId, fieldKey) {
  return `${String(entityId || "")}\0${String(fieldKey || "")}`;
}

const CATALOG = buildCatalog();

export function listSeoCatalogEntries() {
  return CATALOG.entries;
}

export function getSeoCatalogEntry(entityId, fieldKey) {
  return CATALOG.byEntityField.get(seoEntityFieldKey(entityId, fieldKey)) || null;
}

export function getSeoCanonicalField(entityId, fieldKey) {
  const entry = getSeoCatalogEntry(entityId, fieldKey);
  return entry ? String(entry.sourceRu || "") : "";
}

export function isCurrentSeoCatalogEntry(entry) {
  if (!entry) return false;
  if (String(entry.namespace || "") !== SEO_NAMESPACE) return false;
  if (String(entry.entityType || "") !== SEO_ENTITY_TYPE) return false;
  const entityId = String(entry.entityId || "");
  const fieldKey = String(entry.fieldKey || "");
  if (!entityId || !fieldKey) return false;
  return Boolean(getSeoCatalogEntry(entityId, fieldKey));
}

/** O(1) membership for store filtering. */
export const CURRENT_SEO_ENTITY_FIELD_KEYS = Object.freeze(
  new Set(CATALOG.entries.map((entry) => seoEntityFieldKey(entry.entityId, entry.fieldKey)))
);
