import {
  DEFAULT_LOCALE,
  LANGUAGE_REGISTRY,
  PUBLIC_LOCALE_CODES,
  canonicalizeLocale,
  isSupportedPublicLocale,
  toPublicLocaleCode,
} from "./languageRegistry.js";

export const LOCALIZATION_SETTINGS_KEY = "localizationSettings";

export const TRANSLATION_WORKSPACE_VIEWS = Object.freeze([
  ["interface", "Интерфейс", "ui"],
  ["categories", "Категории и подкатегории", "category"],
  ["seo", "SEO / FAQ / страницы", "seo"],
  ["glossary", "Словарь номенклатуры", "glossary"],
  ["untranslated", "Непереведённое", "untranslated"],
]);

export const COMPLETENESS_DOMAINS = Object.freeze([
  "interface",
  "products",
  "categories",
  "pages",
  "faq",
  "seo",
  "checkout",
]);

const VIEW_NAMESPACES = Object.freeze({
  interface: ["ui"],
  categories: ["category"],
  seo: ["seo", "faq", "page"],
  glossary: ["glossary"],
});

const NAMESPACE_TO_DOMAIN = Object.freeze({
  ui: "interface",
  category: "categories",
  page: "pages",
  faq: "faq",
  seo: "seo",
  checkout: "checkout",
});

export function namespaceToCompletenessDomain(namespace) {
  return NAMESPACE_TO_DOMAIN[String(namespace || "")] || "";
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function uniquePublicCodes(codes) {
  const result = [DEFAULT_LOCALE];
  for (const raw of Array.isArray(codes) ? codes : []) {
    if (!isSupportedPublicLocale(String(raw || ""))) continue;
    const publicCode = toPublicLocaleCode(raw);
    if (!result.includes(publicCode)) result.push(publicCode);
  }
  return result;
}

export function emptyLocalizationSettings() {
  return {
    enabledLanguages: [DEFAULT_LOCALE],
    catalogVersion: 0,
    updatedAt: "",
    updatedBy: "",
  };
}

export function emptyTranslationStore() {
  return { entries: [], values: [] };
}

export function normalizeLocalizationSettings(raw) {
  const source = asObject(raw);
  const defaults = emptyLocalizationSettings();
  const catalogVersion = Number(source.catalogVersion);
  return {
    enabledLanguages: uniquePublicCodes(source.enabledLanguages),
    catalogVersion: Number.isFinite(catalogVersion) ? catalogVersion : defaults.catalogVersion,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : defaults.updatedAt,
    updatedBy: typeof source.updatedBy === "string" ? source.updatedBy : defaults.updatedBy,
  };
}

export function normalizeTranslationStore(raw) {
  const source = asObject(raw);
  return {
    entries: Array.isArray(source.entries) ? source.entries.filter((item) => item && typeof item === "object") : [],
    values: Array.isArray(source.values) ? source.values.filter((item) => item && typeof item === "object") : [],
  };
}

function emptyDomainReport() {
  return Object.fromEntries(
    COMPLETENESS_DOMAINS.map((domain) => [domain, { total: 0, ready: 0, complete: false }])
  );
}

export function computeLanguageCompleteness(language, items = []) {
  const publicCode = isSupportedPublicLocale(language) ? toPublicLocaleCode(language) : canonicalizeLocale(language) === DEFAULT_LOCALE ? DEFAULT_LOCALE : toPublicLocaleCode(language);
  if (publicCode === DEFAULT_LOCALE) {
    const domains = emptyDomainReport();
    for (const domain of COMPLETENESS_DOMAINS) domains[domain].complete = true;
    return { language: DEFAULT_LOCALE, complete: true, domains };
  }

  const domains = emptyDomainReport();
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (!item || item.critical !== true) continue;
    const itemLang = toPublicLocaleCode(item.language || publicCode);
    if (itemLang !== publicCode) continue;
    const domain = COMPLETENESS_DOMAINS.includes(item.domain) ? item.domain : null;
    if (!domain) continue;
    domains[domain].total += 1;
    const ready =
      item.stale !== true &&
      item.state !== "MISSING" &&
      item.state !== "FALLBACK_RU" &&
      Boolean(String(item.value || "").trim());
    if (ready) domains[domain].ready += 1;
  }

  let complete = true;
  let anyCritical = false;
  for (const domain of COMPLETENESS_DOMAINS) {
    const report = domains[domain];
    if (report.total > 0) {
      anyCritical = true;
      report.complete = report.ready === report.total;
      if (!report.complete) complete = false;
    } else {
      report.complete = true;
    }
  }
  if (!anyCritical) complete = false;

  return { language: publicCode, complete, domains };
}

export function applyEnabledLanguages(currentEnabled, requested, completenessByLanguage = {}) {
  const current = uniquePublicCodes(currentEnabled);
  const wanted = Array.isArray(requested) ? requested : [];
  const requestedPublic = wanted
    .map((code) => (isSupportedPublicLocale(String(code || "").trim()) ? toPublicLocaleCode(code) : ""))
    .filter(Boolean);

  if (!requestedPublic.includes(DEFAULT_LOCALE)) {
    return {
      enabledLanguages: [DEFAULT_LOCALE],
      rejected: requestedPublic.filter((code) => code !== DEFAULT_LOCALE),
    };
  }

  const enabledLanguages = [DEFAULT_LOCALE];
  const rejected = [];
  for (const code of requestedPublic) {
    if (code === DEFAULT_LOCALE) continue;
    const report = completenessByLanguage[code] || {};
    if (report.complete === true) {
      if (!enabledLanguages.includes(code)) enabledLanguages.push(code);
    } else {
      rejected.push(code);
    }
  }

  void current;
  return { enabledLanguages, rejected };
}

function rowState(entry, value) {
  if (!value || !String(value.value || "").trim()) return "MISSING";
  if (value.state === "MANUAL") return "MANUAL";
  if (value.state === "AUTO") {
    if (entry?.sourceHash && value.sourceHash && entry.sourceHash !== value.sourceHash) {
      return "STALE";
    }
    return "AUTO";
  }
  return "FALLBACK_RU";
}

export function buildTranslationRows(store = emptyTranslationStore()) {
  const normalized = normalizeTranslationStore(store);
  const valuesByEntry = new Map();
  for (const value of normalized.values) {
    const key = String(value.entryId || "");
    if (!valuesByEntry.has(key)) valuesByEntry.set(key, []);
    valuesByEntry.get(key).push(value);
  }

  return normalized.entries.map((entry) => {
    const values = valuesByEntry.get(String(entry.id || "")) || [];
    const byLanguage = {};
    for (const code of PUBLIC_LOCALE_CODES) {
      if (code === DEFAULT_LOCALE) continue;
      const value = values.find((item) => toPublicLocaleCode(item.languageCode) === code);
      byLanguage[code] = {
        value: value?.value || "",
        state: rowState(entry, value),
        stale: Boolean(
          value &&
            entry.sourceHash &&
            value.sourceHash &&
            entry.sourceHash !== value.sourceHash
        ),
        updatedAt: value?.updatedAt || "",
        updatedBy: value?.updatedBy || "",
      };
    }
    return {
      id: entry.id,
      namespace: entry.namespace || "",
      entityType: entry.entityType || "",
      entityId: entry.entityId || "",
      fieldKey: entry.fieldKey || "",
      sourceRu: entry.sourceRu || "",
      critical: Boolean(entry.critical),
      languages: byLanguage,
    };
  });
}

export function filterTranslationRows(rows, filters = {}) {
  try {
    const list = Array.isArray(rows) ? rows : [];
    const view = String(filters.view || "interface");
    const query = String(filters.query || "").trim().toLowerCase();
    const languageRaw = filters.language;
    const language =
      typeof languageRaw === "string" && isSupportedPublicLocale(languageRaw)
        ? toPublicLocaleCode(languageRaw)
        : "";
    const untranslatedOnly = Boolean(filters.untranslatedOnly);
    const namespaces = VIEW_NAMESPACES[view];
    if (view !== "untranslated" && !namespaces) return [];

    return list.filter((row) => {
      if (!row || typeof row !== "object") return false;
      if (view === "untranslated") {
        const langs = row.languages && typeof row.languages === "object" ? row.languages : {};
        const target = language && langs[language] ? [langs[language]] : Object.values(langs);
        const untranslated = target.some(
          (item) =>
            item &&
            (item.stale || ["MISSING", "FALLBACK_RU", "STALE"].includes(item.state))
        );
        if (!untranslated) return false;
      } else if (namespaces && !namespaces.includes(row.namespace)) {
        return false;
      }
      if (query) {
        const hay = `${row.sourceRu || ""} ${row.fieldKey || ""} ${row.namespace || ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (untranslatedOnly && view !== "untranslated") {
        const langs = row.languages && typeof row.languages === "object" ? row.languages : {};
        const item = language ? langs[language] : null;
        const targets = item ? [item] : Object.values(langs);
        if (
          !targets.some(
            (entry) =>
              entry &&
              (entry.stale || ["MISSING", "FALLBACK_RU", "STALE"].includes(entry.state))
          )
        ) {
          return false;
        }
      }
      return true;
    });
  } catch {
    return [];
  }
}

export function upsertManualTranslation(store, patch = {}) {
  const next = normalizeTranslationStore(store);
  const language = isSupportedPublicLocale(patch.language)
    ? toPublicLocaleCode(patch.language)
    : "";
  if (!language || language === DEFAULT_LOCALE) return next;
  const value = typeof patch.value === "string" ? patch.value.trim() : "";
  if (!value) return next;
  const entryId = String(patch.entryId || "").trim();
  if (!entryId || !next.entries.some((entry) => String(entry.id) === entryId)) return next;

  const existingIndex = next.values.findIndex(
    (item) =>
      String(item.entryId) === entryId && toPublicLocaleCode(item.languageCode) === language
  );
  const existing = existingIndex >= 0 ? next.values[existingIndex] : null;
  if (existing?.state === "MANUAL" && patch.state === "AUTO") {
    return next;
  }

  const record = {
    ...(existing || {}),
    entryId,
    languageCode: language,
    value,
    state: "MANUAL",
    sourceHash: existing?.sourceHash || "",
    updatedAt: new Date().toISOString(),
    updatedBy: String(patch.editor || "").trim(),
  };
  if (existingIndex >= 0) next.values[existingIndex] = record;
  else next.values.push(record);
  return next;
}

export function saveSettingsPreservingTranslations(currentSettings, translations, patch = {}) {
  const current = normalizeLocalizationSettings(currentSettings);
  const next = normalizeLocalizationSettings({
    ...current,
    ...asObject(patch),
    enabledLanguages: uniquePublicCodes(
      patch.enabledLanguages !== undefined ? patch.enabledLanguages : current.enabledLanguages
    ),
  });
  next.catalogVersion = Number(current.catalogVersion || 0) + 1;
  next.updatedAt = new Date().toISOString();
  if (patch.updatedBy !== undefined) next.updatedBy = String(patch.updatedBy || "");
  return {
    settings: next,
    translations: normalizeTranslationStore(translations),
  };
}

export function localeChoices() {
  return PUBLIC_LOCALE_CODES.map((publicCode) => {
    const internal = canonicalizeLocale(publicCode);
    const meta = LANGUAGE_REGISTRY[internal] || {};
    return {
      publicCode,
      internalCode: meta.internalCode || internal,
      direction: meta.direction || "ltr",
      alwaysEnabled: meta.alwaysEnabled === true,
    };
  });
}
