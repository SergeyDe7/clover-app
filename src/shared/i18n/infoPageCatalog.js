/**
 * Code-owned Stage 5.2-A InfoPage slug-level localization corpus.
 * Canonical RU texts derive from STOREFRONT_INFO_PAGES (single source).
 * Browser-safe: no Node builtins / sourceHash / DB / filesystem.
 */
import {
  STOREFRONT_INFO_PAGES,
  STOREFRONT_INFO_SLUGS,
  findStorefrontInfoPage,
} from "../../screens/storefront/pages/infoPages.js";

export const PAGE_NAMESPACE = "page";
export const INFO_PAGE_ENTITY_TYPE = "info";
export const INFO_PAGE_FIELD_KEYS = Object.freeze(["heading", "title", "description"]);

function freezeEntry(entry) {
  return Object.freeze({ ...entry, critical: true });
}

function buildCatalog() {
  const entries = [];
  const byEntityField = new Map();

  for (const page of STOREFRONT_INFO_PAGES) {
    const slug = String(page.slug || "").trim();
    if (!slug) {
      throw new Error("Info page registry entry missing slug");
    }
    for (const fieldKey of INFO_PAGE_FIELD_KEYS) {
      const sourceRu = String(page[fieldKey] || "");
      if (!sourceRu.trim()) {
        throw new Error(`Info page ${slug} missing canonical ${fieldKey}`);
      }
      const entry = freezeEntry({
        namespace: PAGE_NAMESPACE,
        entityType: INFO_PAGE_ENTITY_TYPE,
        entityId: slug,
        fieldKey,
        sourceRu,
        critical: true,
      });
      entries.push(entry);
      byEntityField.set(infoPageEntityFieldKey(slug, fieldKey), entry);
    }
  }

  if (entries.length !== STOREFRONT_INFO_SLUGS.length * INFO_PAGE_FIELD_KEYS.length) {
    throw new Error("Info page catalog size mismatch");
  }

  return {
    entries: Object.freeze(entries.slice()),
    byEntityField,
  };
}

export function infoPageEntityFieldKey(entityId, fieldKey) {
  return `${String(entityId || "")}\0${String(fieldKey || "")}`;
}

const CATALOG = buildCatalog();

export function listInfoPageCatalogEntries() {
  return CATALOG.entries;
}

export function getInfoPageCatalogEntry(entityId, fieldKey) {
  return CATALOG.byEntityField.get(infoPageEntityFieldKey(entityId, fieldKey)) || null;
}

export function getInfoPageCanonicalField(slug, fieldKey) {
  const key = String(fieldKey || "");
  if (!INFO_PAGE_FIELD_KEYS.includes(key)) return "";
  const page = findStorefrontInfoPage(slug);
  if (!page) return "";
  return String(page[key] || "");
}

export function isInfoPageFieldKey(fieldKey) {
  return INFO_PAGE_FIELD_KEYS.includes(String(fieldKey || ""));
}

export function isCurrentInfoPageCatalogEntry(entry) {
  if (!entry) return false;
  if (String(entry.namespace || "") !== PAGE_NAMESPACE) return false;
  if (String(entry.entityType || "") !== INFO_PAGE_ENTITY_TYPE) return false;
  const entityId = String(entry.entityId || "");
  const fieldKey = String(entry.fieldKey || "");
  if (!entityId || !fieldKey) return false;
  if (!STOREFRONT_INFO_SLUGS.includes(entityId)) return false;
  if (!INFO_PAGE_FIELD_KEYS.includes(fieldKey)) return false;
  return Boolean(getInfoPageCatalogEntry(entityId, fieldKey));
}

/** O(1) membership for store filtering. */
export const CURRENT_INFO_PAGE_ENTITY_FIELD_KEYS = Object.freeze(
  new Set(CATALOG.entries.map((entry) => infoPageEntityFieldKey(entry.entityId, entry.fieldKey)))
);
