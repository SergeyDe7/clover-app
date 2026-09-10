import { randomUUID } from "node:crypto";
import {
  getGlobalState,
  runInTransaction,
  listTranslationEntryRows,
  listTranslationValueRows,
  listTranslationValueRowsForLanguage,
  listTranslationEntryRowsByNamespace,
  listTranslationValueRowsForEntryIds,
  getTranslationEntryRow,
  findTranslationEntryByIdentity,
  findTranslationEntryByEntityIdentity,
  insertTranslationEntryRow,
  updateTranslationEntryRow,
  getTranslationValueRow,
  upsertTranslationValueRow,
} from "./db.js";
import {
  PUBLIC_LOCALE_CODES,
  TARGET_INTERNAL_LOCALES,
  exactTranslationTargetInternal,
  isExactPublicLocaleCode,
  isExactPublicTargetLocale,
  isExactTranslationTargetLocale,
  toPublicLocaleCode,
} from "../../src/shared/i18n/languageRegistry.js";
import { sourceHash } from "../../src/shared/i18n/sourceHash.js";
import { placeholdersMatch, isNonEmptyText } from "../../src/shared/i18n/placeholderValidation.js";
import { UI_CATALOG, hasCatalogKey } from "../../src/shared/i18n/uiCatalog.js";
import {
  CATEGORY_NAMESPACE,
  listCategoryCatalogEntries,
  isCurrentCategoryCatalogEntry,
} from "../../src/shared/i18n/categoryCatalog.js";
import { getSeedTranslation } from "./i18n/uiTranslationSeed.js";
import {
  getCategorySeedTranslation,
  hasCategorySeed,
} from "./i18n/categoryTranslationSeed.js";
import {
  LOCALIZATION_SETTINGS_KEY,
  applyEnabledLanguages,
  buildTranslationRows,
  computeLanguageCompleteness,
  emptyLocalizationSettings,
  filterTranslationRows,
  namespaceToCompletenessDomain,
  normalizeLocalizationSettings,
} from "../../src/shared/i18n/localizationSettings.js";
import { bumpLocalizationCatalogVersion } from "./localizationVersion.js";
import {
  buildProductWorkspaceRows,
  computeProductCompletenessSnapshot,
} from "./productLocalizationStore.js";
import {
  parseWorkspaceLimit,
  parseWorkspaceOffset,
  STAGE4_QUERY_MAX_CHARS,
  assertBoundedString,
} from "./productInputLimits.js";

function nowIso() {
  return new Date().toISOString();
}

/** Built once from static UI_CATALOG — O(1) membership for current-catalog filtering. */
let currentCatalogKeySetInitCount = 0;
const CURRENT_CATALOG_KEYS = (() => {
  currentCatalogKeySetInitCount += 1;
  return new Set(UI_CATALOG.map((entry) => `${entry.namespace}\0${entry.key}`));
})();

export function getCurrentCatalogKeySetInitCount() {
  return currentCatalogKeySetInitCount;
}

/** Safe immutable copy for tests — never expose the mutable module Set. */
export function getCurrentCatalogKeys() {
  return Object.freeze(Array.from(CURRENT_CATALOG_KEYS));
}

export function isCurrentCatalogEntry(entry) {
  if (!entry) return false;
  if (String(entry.entityType || "") !== "" || String(entry.entityId || "") !== "") return false;
  return CURRENT_CATALOG_KEYS.has(`${entry.namespace}\0${entry.fieldKey}`);
}

/** UI catalog OR current category entity catalog. */
export function isCurrentEditableTranslationEntry(entry) {
  return isCurrentCatalogEntry(entry) || isCurrentCategoryCatalogEntry(entry);
}

function mapStore(entries, values) {
  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      namespace: entry.namespace,
      entityType: entry.entityType || "",
      entityId: entry.entityId || "",
      fieldKey: entry.fieldKey,
      sourceRu: entry.sourceRu,
      sourceHash: entry.sourceHash,
      critical: Number(entry.critical) === 1 || entry.critical === true,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })),
    values: values.map((value) => ({
      entryId: value.entryId,
      languageCode: value.languageCode,
      value: value.value,
      state: value.state,
      sourceHash: value.sourceHash,
      updatedAt: value.updatedAt,
      updatedBy: value.updatedBy || "",
    })),
  };
}

export function readLocalizationSettings() {
  return normalizeLocalizationSettings(
    getGlobalState(LOCALIZATION_SETTINGS_KEY, emptyLocalizationSettings())
  );
}

export function readTranslationStore(options = {}) {
  const entries = listTranslationEntryRows();
  const languageInternal = options.languageInternal
    ? String(options.languageInternal)
    : "";
  const values = languageInternal
    ? listTranslationValueRowsForLanguage(languageInternal)
    : listTranslationValueRows();
  return mapStore(entries, values);
}

/**
 * Category-namespace store only: current code-owned category entities + optional
 * selected-language values. Does not scan UI/generic translation_entries.
 */
export function readCategoryTranslationStore(options = {}) {
  const namespaceRows = listTranslationEntryRowsByNamespace(CATEGORY_NAMESPACE);
  const current = namespaceRows.filter(isCurrentCategoryCatalogEntry);
  const entryIds = current.map((entry) => entry.id);
  const languageInternal = options.languageInternal
    ? String(options.languageInternal)
    : "";
  const values = listTranslationValueRowsForEntryIds(entryIds, languageInternal);
  return {
    store: mapStore(current, values),
    stats: {
      categoryNamespaceEntriesRead: namespaceRows.length,
      categoryCurrentEntries: current.length,
      categoryValuesRead: values.length,
      valueLanguageInternal: languageInternal || "all",
      genericEntriesRead: 0,
      genericValuesRead: 0,
    },
  };
}

function currentCatalogItems(store) {
  const current = store.entries.filter(isCurrentCatalogEntry);
  const currentIds = new Set(current.map((entry) => entry.id));
  return {
    entries: current,
    values: store.values.filter((value) => currentIds.has(value.entryId)),
  };
}

function currentCategoryCatalogItems(store) {
  const current = store.entries.filter(isCurrentCategoryCatalogEntry);
  const currentIds = new Set(current.map((entry) => entry.id));
  return {
    entries: current,
    values: store.values.filter((value) => currentIds.has(value.entryId)),
  };
}

function completenessItems(store, productItems = null) {
  const ui = currentCatalogItems(store);
  const categories = currentCategoryCatalogItems(store);
  const current = {
    entries: [...ui.entries, ...categories.entries],
    values: [...ui.values, ...categories.values],
  };
  const rows = buildTranslationRows(current);
  const items = [];
  for (const row of rows) {
    const domain = namespaceToCompletenessDomain(row.namespace);
    if (!domain) continue;
    for (const [language, cell] of Object.entries(row.languages || {})) {
      items.push({
        domain,
        language,
        state: cell.stale ? "STALE" : cell.state,
        stale: cell.stale,
        critical: row.critical,
        value: cell.value,
      });
    }
  }
  const products =
    productItems || computeProductCompletenessSnapshot().items;
  items.push(...products);
  return items;
}

export function completenessByLanguage(store = readTranslationStore()) {
  const productSnap = computeProductCompletenessSnapshot();
  const items = completenessItems(store, productSnap.items);
  const productFields = productSnap.fieldReports;
  const reports = {};
  for (const code of PUBLIC_LOCALE_CODES) {
    reports[code] = {
      ...computeLanguageCompleteness(code, items),
      productFields: productFields[code] || null,
    };
  }
  return reports;
}

function bumpCatalogVersion(current, actor) {
  return bumpLocalizationCatalogVersion(actor, current);
}

function invalidLocaleError(message = "Unsupported localization language.") {
  const error = new Error(message);
  error.status = 400;
  error.code = "UNSUPPORTED_LOCALE";
  return error;
}

function requirePublicEnabledLanguages(value) {
  if (!Array.isArray(value)) {
    throw invalidLocaleError("enabledLanguages must be an array of public locale codes.");
  }
  for (const code of value) {
    if (typeof code !== "string" || !code.trim()) {
      throw invalidLocaleError("enabledLanguages must contain non-empty public locale codes.");
    }
    if (!isExactPublicLocaleCode(code)) {
      throw invalidLocaleError("Unsupported localization language.");
    }
  }
}

export function writeLocalizationSettings(patch = {}, actor = "") {
  return runInTransaction(() => {
    const current = readLocalizationSettings();
    const translations = readTranslationStore();
    const reports = completenessByLanguage(translations);
    if (Object.prototype.hasOwnProperty.call(patch, "enabledLanguages")) {
      requirePublicEnabledLanguages(patch.enabledLanguages);
    }
    const applied = applyEnabledLanguages(
      current.enabledLanguages,
      patch.enabledLanguages ?? current.enabledLanguages,
      reports
    );
    const requested = normalizeLocalizationSettings({
      ...current,
      enabledLanguages: applied.enabledLanguages,
      updatedBy: actor,
    });
    if (requested.enabledLanguages.join("\0") === current.enabledLanguages.join("\0")) {
      return {
        settings: current,
        rejected: applied.rejected,
        completeness: reports,
      };
    }
    const saved = bumpCatalogVersion(
      {
        ...current,
        enabledLanguages: requested.enabledLanguages,
      },
      actor
    );
    return {
      settings: saved,
      rejected: applied.rejected,
      completeness: completenessByLanguage(),
    };
  });
}

function syncCatalogBatch() {
  const stamp = nowIso();
  let dirty = false;
  const settings = readLocalizationSettings();

  for (const entry of UI_CATALOG) {
    const hash = sourceHash(entry.sourceRu);
    const existing = findTranslationEntryByIdentity(entry.namespace, entry.key);
    if (!existing) {
      const id = randomUUID();
      insertTranslationEntryRow({
        id,
        namespace: entry.namespace,
        entityType: "",
        entityId: "",
        fieldKey: entry.key,
        sourceRu: entry.sourceRu,
        sourceHash: hash,
        critical: entry.critical,
        createdAt: stamp,
        updatedAt: stamp,
      });
      for (const locale of TARGET_INTERNAL_LOCALES) {
        upsertTranslationValueRow({
          entryId: id,
          languageCode: locale,
          value: getSeedTranslation(entry.key, locale),
          state: "AUTO",
          sourceHash: hash,
          updatedAt: stamp,
          updatedBy: "catalog-seed",
        });
      }
      dirty = true;
      continue;
    }

    const sourceChanged = existing.sourceHash !== hash || existing.sourceRu !== entry.sourceRu;
    const criticalChanged = Boolean(existing.critical) !== Boolean(entry.critical);
    if (sourceChanged || criticalChanged) {
      updateTranslationEntryRow({
        id: existing.id,
        sourceRu: entry.sourceRu,
        sourceHash: hash,
        critical: entry.critical,
        updatedAt: stamp,
      });
      dirty = true;
    }

    const entryHash = sourceChanged ? hash : existing.sourceHash;
    for (const locale of TARGET_INTERNAL_LOCALES) {
      const seed = getSeedTranslation(entry.key, locale);
      const value = getTranslationValueRow(existing.id, locale);
      if (!value) {
        upsertTranslationValueRow({
          entryId: existing.id,
          languageCode: locale,
          value: seed,
          state: "AUTO",
          sourceHash: entryHash,
          updatedAt: stamp,
          updatedBy: "catalog-seed",
        });
        dirty = true;
        continue;
      }
      if (value.state === "MANUAL") {
        continue;
      }
      const seedChanged = value.value !== seed || value.sourceHash !== entryHash;
      if (sourceChanged || seedChanged) {
        upsertTranslationValueRow({
          entryId: existing.id,
          languageCode: locale,
          value: seed,
          state: "AUTO",
          sourceHash: entryHash,
          updatedAt: stamp,
          updatedBy: "catalog-seed",
        });
        dirty = true;
      }
    }
  }

  if (syncCategoryCatalogBatch(stamp)) {
    dirty = true;
  }

  if (dirty) {
    bumpCatalogVersion(settings, "catalog-sync");
  }
  return { dirty };
}

/** Sync code-owned category corpus into translation_entries (entity-aware). */
function syncCategoryCatalogBatch(stamp = nowIso()) {
  let dirty = false;
  for (const entry of listCategoryCatalogEntries()) {
    const hash = sourceHash(entry.sourceRu);
    const existing = findTranslationEntryByEntityIdentity(
      entry.namespace,
      entry.entityType,
      entry.entityId,
      entry.fieldKey
    );
    if (!existing) {
      const id = randomUUID();
      insertTranslationEntryRow({
        id,
        namespace: entry.namespace,
        entityType: entry.entityType,
        entityId: entry.entityId,
        fieldKey: entry.fieldKey,
        sourceRu: entry.sourceRu,
        sourceHash: hash,
        critical: true,
        createdAt: stamp,
        updatedAt: stamp,
      });
      for (const locale of TARGET_INTERNAL_LOCALES) {
        upsertTranslationValueRow({
          entryId: id,
          languageCode: locale,
          value: getCategorySeedTranslation(entry.entityType, entry.entityId, locale),
          state: "AUTO",
          sourceHash: hash,
          updatedAt: stamp,
          updatedBy: "category-catalog-seed",
        });
      }
      dirty = true;
      continue;
    }

    const sourceChanged = existing.sourceHash !== hash || existing.sourceRu !== entry.sourceRu;
    const criticalChanged = Boolean(existing.critical) !== true;
    if (sourceChanged || criticalChanged) {
      updateTranslationEntryRow({
        id: existing.id,
        sourceRu: entry.sourceRu,
        sourceHash: hash,
        critical: true,
        updatedAt: stamp,
      });
      dirty = true;
    }

    const entryHash = sourceChanged ? hash : existing.sourceHash;
    for (const locale of TARGET_INTERNAL_LOCALES) {
      const seed = getCategorySeedTranslation(entry.entityType, entry.entityId, locale);
      const value = getTranslationValueRow(existing.id, locale);
      if (!value) {
        upsertTranslationValueRow({
          entryId: existing.id,
          languageCode: locale,
          value: seed,
          state: "AUTO",
          sourceHash: entryHash,
          updatedAt: stamp,
          updatedBy: "category-catalog-seed",
        });
        dirty = true;
        continue;
      }
      if (value.state === "MANUAL") {
        continue;
      }
      const seedChanged = value.value !== seed || value.sourceHash !== entryHash;
      if (sourceChanged || seedChanged) {
        upsertTranslationValueRow({
          entryId: existing.id,
          languageCode: locale,
          value: seed,
          state: "AUTO",
          sourceHash: entryHash,
          updatedAt: stamp,
          updatedBy: "category-catalog-seed",
        });
        dirty = true;
      }
    }
  }
  return dirty;
}

let initialized = false;

export function initializeLocalizationCatalog() {
  const result = runInTransaction(() => syncCatalogBatch());
  initialized = true;
  return result;
}

function projectSelectedLanguageRows(rows, languageRaw) {
  if (!languageRaw) return rows;
  const code = toPublicLocaleCode(languageRaw);
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const langs = row?.languages && typeof row.languages === "object" ? row.languages : {};
    const selected = langs[code];
    return {
      ...row,
      languages: selected ? { [code]: selected } : {},
    };
  });
}

function isPageableWorkspaceView(view) {
  return (
    view === "interface" ||
    view === "products" ||
    view === "untranslated" ||
    view === "categories" ||
    view === "seo"
  );
}

/**
 * Full filtered workspace rows (no paging).
 * view=categories uses namespace-scoped DB reads (not full UI catalog scan).
 * view=products never reads generic translation_entries/values.
 * view=interface preserves Stage 3/4 UI path.
 */
export function collectFilteredWorkspaceRows(filters = {}, options = {}) {
  if (Object.prototype.hasOwnProperty.call(filters, "language") && filters.language !== undefined) {
    const languageRaw = filters.language;
    if (!isExactPublicTargetLocale(languageRaw)) {
      throw invalidLocaleError();
    }
  }
  if (Object.prototype.hasOwnProperty.call(filters, "query") && filters.query) {
    assertBoundedString(filters.query, STAGE4_QUERY_MAX_CHARS, { query: true, label: "query" });
  }
  const languageRaw = filters.language;
  const view = String(filters.view || "interface");
  if (view === "glossary") {
    if (options.__stats && typeof options.__stats === "object") {
      options.__stats.genericEntriesRead = 0;
      options.__stats.genericValuesRead = 0;
      options.__stats.valueLanguageInternal = "";
      options.__stats.uiRowsBuilt = 0;
      options.__stats.productRowsBuilt = 0;
      options.__stats.categoryRowsBuilt = 0;
    }
    return [];
  }
  const buildStats = options.__stats || null;
  const needUi = view === "interface" || view === "seo" || view === "untranslated";
  const needCategories = view === "categories" || view === "untranslated";
  const needProducts = view === "products" || view === "untranslated";
  const internal = languageRaw ? exactTranslationTargetInternal(languageRaw) : "";

  // Stage 5.1: categories-only path — no generic UI entry scan, no products.
  if (view === "categories") {
    const { store: categoryStore, stats: readStats } = readCategoryTranslationStore({
      languageInternal: internal || undefined,
    });
    if (buildStats && typeof buildStats === "object") {
      Object.assign(buildStats, readStats);
      buildStats.namespace = CATEGORY_NAMESPACE;
      buildStats.uiRowsBuilt = 0;
      buildStats.productRowsBuilt = 0;
    }
    const categoryRows = buildTranslationRows(categoryStore, {
      language: languageRaw,
      ...(buildStats ? { __stats: buildStats } : {}),
    });
    if (buildStats && typeof buildStats === "object") {
      buildStats.categoryRowsBuilt = categoryRows.length;
      buildStats.categoryRowCount = categoryRows.length;
    }
    let filtered = filterTranslationRows(categoryRows, {
      ...filters,
      language: languageRaw,
    });
    filtered = projectSelectedLanguageRows(filtered, languageRaw);
    return filtered;
  }

  const store =
    needUi || needCategories
      ? internal
        ? readTranslationStore({ languageInternal: internal })
        : readTranslationStore()
      : null;

  let uiRows = [];
  if (needUi) {
    if (buildStats && typeof buildStats === "object") {
      buildStats.genericEntriesRead = 1;
      buildStats.genericValuesRead = 1;
      buildStats.valueLanguageInternal = internal || "all";
    }
    const uiStore = currentCatalogItems(store);
    uiRows = buildTranslationRows(uiStore, {
      language: languageRaw,
      ...(buildStats ? { __stats: buildStats } : {}),
    });
  } else if (buildStats && typeof buildStats === "object") {
    buildStats.genericEntriesRead = 0;
    buildStats.genericValuesRead = 0;
    buildStats.valueLanguageInternal = "";
  }

  let categoryRows = [];
  if (needCategories) {
    const categoryStore = currentCategoryCatalogItems(store);
    categoryRows = buildTranslationRows(categoryStore, {
      language: languageRaw,
    });
  }

  const productRows = needProducts
    ? buildProductWorkspaceRows(undefined, { language: languageRaw })
    : [];

  if (buildStats && typeof buildStats === "object") {
    buildStats.uiRowsBuilt = uiRows.length;
    buildStats.categoryRowsBuilt = categoryRows.length;
    buildStats.productRowsBuilt = productRows.length;
  }

  let combined;
  if (view === "products") combined = productRows;
  else combined = [...uiRows, ...categoryRows, ...productRows];

  let filtered = filterTranslationRows(combined, {
    ...filters,
    language: languageRaw,
  });
  filtered = projectSelectedLanguageRows(filtered, languageRaw);
  return filtered;
}

export function listWorkspacePage(filters = {}) {
  const view = String(filters.view || "interface");
  if (view === "glossary") {
    return { rows: [], total: 0, offset: 0, limit: 0, hasMore: false };
  }
  const filtered = collectFilteredWorkspaceRows(filters);
  if (!isPageableWorkspaceView(view)) {
    return {
      rows: filtered,
      total: filtered.length,
      offset: 0,
      limit: filtered.length,
      hasMore: false,
    };
  }
  const total = filtered.length;
  const limit = parseWorkspaceLimit(filters.limit);
  const offset = parseWorkspaceOffset(filters.offset);
  const rows = filtered.slice(offset, offset + limit);
  return { rows, total, offset, limit, hasMore: offset + rows.length < total };
}

/** Explicit all-rows accessor for internal/test callers. Never unbounded via listWorkspacePage. */
export function listWorkspaceRows(filters = {}) {
  return collectFilteredWorkspaceRows(filters);
}

/** Validates UI or category current entries. */
function requireCurrentEditableEntry(entryId) {
  const entry = getTranslationEntryRow(entryId);
  if (!entry) {
    const error = new Error("Translation entry not found.");
    error.status = 404;
    error.code = "UNKNOWN_ENTRY";
    throw error;
  }
  if (!isCurrentEditableTranslationEntry(entry)) {
    const error = new Error("Orphan translation entry cannot be edited from the current catalog.");
    error.status = 409;
    error.code = "ORPHAN_ENTRY";
    throw error;
  }
  return entry;
}

function resolveAutoSeedForEntry(entry, internalLocale) {
  if (isCurrentCategoryCatalogEntry(entry)) {
    if (!hasCategorySeed(entry.entityType, entry.entityId)) {
      const error = new Error("Unknown category seed cannot be reset.");
      error.status = 409;
      error.code = "NO_SEED";
      throw error;
    }
    return getCategorySeedTranslation(entry.entityType, entry.entityId, internalLocale);
  }
  if (!hasCatalogKey(entry.fieldKey)) {
    const error = new Error("Unknown catalog key cannot be reset from seed.");
    error.status = 409;
    error.code = "NO_SEED";
    throw error;
  }
  return getSeedTranslation(entry.fieldKey, internalLocale);
}

function requireTargetLocale(language) {
  if (!isExactTranslationTargetLocale(language)) {
    const error = new Error("Unsupported translation language.");
    error.status = 400;
    error.code = "UNSUPPORTED_LOCALE";
    throw error;
  }
  const internal = exactTranslationTargetInternal(language);
  if (!internal) {
    const error = new Error("Unsupported translation language.");
    error.status = 400;
    error.code = "UNSUPPORTED_LOCALE";
    throw error;
  }
  return internal;
}

export function saveManualTranslation(entryId, language, value, actor = "") {
  const internal = requireTargetLocale(language);
  const text = typeof value === "string" ? value : "";
  if (!isNonEmptyText(text)) {
    const error = new Error("Translation value cannot be empty.");
    error.status = 400;
    error.code = "EMPTY_VALUE";
    throw error;
  }
  return runInTransaction(() => {
    const entry = requireCurrentEditableEntry(entryId);
    if (!placeholdersMatch(entry.sourceRu, text)) {
      const error = new Error("Translation placeholders do not match the Russian source.");
      error.status = 400;
      error.code = "PLACEHOLDER_MISMATCH";
      throw error;
    }
    const existing = getTranslationValueRow(entry.id, internal);
    const unchanged =
      existing &&
      existing.value === text &&
      existing.state === "MANUAL" &&
      existing.sourceHash === entry.sourceHash &&
      String(existing.updatedBy || "") === String(actor || "");
    if (unchanged) {
      return { changed: false, entry, value: existing };
    }
    const stamp = nowIso();
    upsertTranslationValueRow({
      entryId: entry.id,
      languageCode: internal,
      value: text,
      state: "MANUAL",
      sourceHash: entry.sourceHash,
      updatedAt: stamp,
      updatedBy: String(actor || ""),
    });
    bumpCatalogVersion(readLocalizationSettings(), actor);
    return { changed: true, entry, value: getTranslationValueRow(entry.id, internal) };
  });
}

export function resetTranslationToAuto(entryId, language, actor = "") {
  const internal = requireTargetLocale(language);
  return runInTransaction(() => {
    const entry = requireCurrentEditableEntry(entryId);
    const seed = resolveAutoSeedForEntry(entry, internal);
    const existing = getTranslationValueRow(entry.id, internal);
    const unchanged =
      existing &&
      existing.value === seed &&
      existing.state === "AUTO" &&
      existing.sourceHash === entry.sourceHash;
    if (unchanged) {
      return { changed: false, entry, value: existing };
    }
    const stamp = nowIso();
    upsertTranslationValueRow({
      entryId: entry.id,
      languageCode: internal,
      value: seed,
      state: "AUTO",
      sourceHash: entry.sourceHash,
      updatedAt: stamp,
      updatedBy: String(actor || "auto-reset"),
    });
    bumpCatalogVersion(readLocalizationSettings(), actor || "auto-reset");
    return { changed: true, entry, value: getTranslationValueRow(entry.id, internal) };
  });
}

void initialized;
