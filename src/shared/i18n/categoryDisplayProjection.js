/**
 * Pure display projection for taxonomy navigation labels.
 * Never mutates canonical `name` identity used by routes/filters/assignment.
 */
import {
  categoryEntityKey,
  findCategoryCatalogBySource,
} from "./categoryCatalog.js";
import {
  exactTranslationTargetInternal,
  toPublicLocaleCode,
} from "./languageRegistry.js";

function isEnabledForeign(language, enabledLanguages) {
  const requested = String(language || "").trim();
  if (!requested || requested === "ru") return false;
  const internal = exactTranslationTargetInternal(requested);
  if (!internal) return false;
  const publicCode = toPublicLocaleCode(internal);
  const enabled = Array.isArray(enabledLanguages) ? enabledLanguages : ["ru"];
  return enabled.includes(publicCode);
}

/**
 * Resolve visible label. Missing/disabled → RU source.
 */
export function resolveCategoryDisplayName({
  sourceRu,
  entityType,
  entityId,
  language = "ru",
  enabledLanguages = ["ru"],
  translations = {},
} = {}) {
  const ru = String(sourceRu || "");
  if (!isEnabledForeign(language, enabledLanguages)) return ru;
  const key = categoryEntityKey(entityType, entityId);
  const bag = translations && typeof translations === "object" ? translations : {};
  const translated = bag[key];
  if (typeof translated === "string" && translated.trim()) return translated;
  return ru;
}

function projectNode(node, parentSourceRu, options) {
  const sourceRu = String(node?.name || "");
  const meta = findCategoryCatalogBySource({
    entityType: parentSourceRu ? "subcategory" : "category",
    sourceRu,
    parentSourceRu: parentSourceRu || "",
  });
  const displayName = resolveCategoryDisplayName({
    sourceRu,
    entityType: meta?.entityType || (parentSourceRu ? "subcategory" : "category"),
    entityId: meta?.entityId || "",
    language: options.language,
    enabledLanguages: options.enabledLanguages,
    translations: options.translations,
  });
  const children = Array.isArray(node?.children)
    ? node.children.map((child) => projectNode(child, sourceRu, options))
    : [];
  return {
    ...node,
    name: sourceRu,
    displayName,
    children,
  };
}

/**
 * Overlay displayName onto buildGroupNav() output. Canonical `name` stays RU.
 */
export function projectLocalizedGroupNav(groups, options = {}) {
  const list = Array.isArray(groups) ? groups : [];
  return list.map((group) => projectNode(group, "", options));
}

/**
 * Convenience for React screens: resolve label from canonical RU (+ optional parent).
 * Does not import LocalizationProvider — callers pass locale from useLocalization().
 */
export function categoryDisplayNameFromCanonical(
  sourceRu,
  parentSourceRu = "",
  { language = "ru", enabledLanguages = ["ru"], translations = {} } = {}
) {
  const ru = String(sourceRu || "");
  const parent = String(parentSourceRu || "");
  const meta = findCategoryCatalogBySource({
    entityType: parent ? "subcategory" : "category",
    sourceRu: ru,
    parentSourceRu: parent,
  });
  return resolveCategoryDisplayName({
    sourceRu: ru,
    entityType: meta?.entityType || (parent ? "subcategory" : "category"),
    entityId: meta?.entityId || "",
    language,
    enabledLanguages,
    translations,
  });
}

/** Build translation lookup map from seed/DB values: entityKey → text */
export function categoryTranslationLookupFromEntries(entries, getValue) {
  const map = Object.create(null);
  for (const entry of Array.isArray(entries) ? entries : []) {
    const text = getValue(entry);
    if (typeof text !== "string" || !text.trim()) continue;
    map[categoryEntityKey(entry.entityType, entry.entityId)] = text;
  }
  return map;
}
