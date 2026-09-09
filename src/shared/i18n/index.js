export {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LANGUAGE_REGISTRY,
  PUBLIC_LOCALE_CODES,
  TARGET_INTERNAL_LOCALES,
  canonicalizeLocale,
  canonicalizeTargetLocale,
  getEnabledLocales,
  isLanguageEnabled,
  isSupportedPublicLocale,
  isSupportedTargetLocale,
  toPublicLocaleCode,
} from "./languageRegistry.js";

export {
  BROWSER_LANGUAGE_AUTO_REDIRECT,
  PUBLIC_LANGUAGE_PREFIXES_ENABLED,
  cabinetPathForLocale,
  extractPublicLanguagePrefix,
  resolveLocale,
} from "./languageResolver.js";

export {
  MISSING_TRANSLATION_FALLBACK_RU,
  createLocalizationRuntime,
  translate,
} from "./translationRuntime.js";

export {
  COMPLETENESS_DOMAINS,
  LOCALIZATION_SETTINGS_KEY,
  TRANSLATION_WORKSPACE_VIEWS,
  applyEnabledLanguages,
  computeLanguageCompleteness,
  emptyLocalizationSettings,
  filterTranslationRows,
  localeChoices,
  namespaceToCompletenessDomain,
  normalizeLocalizationSettings,
  saveSettingsPreservingTranslations,
  upsertManualTranslation,
} from "./localizationSettings.js";

export { RU_DICTIONARY, UI_CATALOG, UI_CATALOG_BY_KEY, getCatalogEntry, hasCatalogKey } from "./uiCatalog.js";
export { translationStoreToDictionaries } from "./translationStoreProjection.js";
