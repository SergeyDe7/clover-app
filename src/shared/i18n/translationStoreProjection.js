import { TARGET_INTERNAL_LOCALES, canonicalizeTargetLocale } from "./languageRegistry.js";
import { UI_CATALOG_BY_KEY } from "./uiCatalog.js";
import { isNonEmptyText, placeholdersMatch } from "./placeholderValidation.js";

function copyFreeze(map) {
  const copy = Object.create(null);
  for (const [key, value] of Object.entries(map)) {
    copy[key] = value;
  }
  return Object.freeze(copy);
}

/**
 * Project persisted translation rows into immutable runtime dictionaries.
 * Orphans, RU DB values, stale AUTO, empty and placeholder-invalid values are excluded.
 */
export function translationStoreToDictionaries(store) {
  const entries = Array.isArray(store?.entries) ? store.entries : [];
  const values = Array.isArray(store?.values) ? store.values : [];
  const byId = new Map(entries.map((entry) => [String(entry.id || ""), entry]));
  const dictionaries = Object.create(null);
  for (const locale of TARGET_INTERNAL_LOCALES) {
    dictionaries[locale] = Object.create(null);
  }

  for (const value of values) {
    const entry = byId.get(String(value.entryId || ""));
    if (!entry) continue;
    const catalog = UI_CATALOG_BY_KEY.get(entry.fieldKey);
    if (!catalog) continue;
    if (catalog.namespace !== entry.namespace) continue;
    if (String(entry.entityType || "") !== "" || String(entry.entityId || "") !== "") continue;
    const locale = canonicalizeTargetLocale(value.languageCode);
    if (!locale) continue;
    if (!isNonEmptyText(value.value)) continue;
    if (!placeholdersMatch(entry.sourceRu || catalog.sourceRu, value.value)) continue;
    if (value.state === "AUTO" && value.sourceHash !== entry.sourceHash) continue;
    if (value.state !== "AUTO" && value.state !== "MANUAL") continue;
    dictionaries[locale][entry.fieldKey] = value.value;
  }

  const frozen = Object.create(null);
  for (const locale of TARGET_INTERNAL_LOCALES) {
    frozen[locale] = copyFreeze(dictionaries[locale]);
  }
  return Object.freeze(frozen);
}
