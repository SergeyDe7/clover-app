export {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LANGUAGE_REGISTRY,
  PUBLIC_LOCALE_CODES,
  PUBLIC_TARGET_LOCALE_CODES,
  TARGET_INTERNAL_LOCALES,
  TRANSLATION_TARGET_INPUT_CODES,
  canonicalizeLocale,
  canonicalizeTargetLocale,
  exactTranslationTargetInternal,
  getEnabledLocales,
  isExactPublicLocaleCode,
  isExactPublicTargetLocale,
  isExactTranslationTargetLocale,
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
export {
  PRODUCT_TRANSLATION_FIELDS,
  canonicalProductId,
  productFieldSource,
  productTranslationRowId,
  parseProductTranslationRowId,
} from "./productLocalization.js";
export { unitDisplayLabel, unitDisplayShort, UNIT_DISPLAY_KEYS } from "./unitDisplay.js";
export { translationStoreToDictionaries } from "./translationStoreProjection.js";
export {
  DEFAULT_ERROR_DISPLAY_KEY,
  DOMAIN_ERROR_CODES,
  DOMAIN_ERROR_KEY_BY_CODE,
  ERROR_DISPLAY_KEY_BY_CODE,
  PUSH_RESTORE_HINT_KEY,
  TRANSPORT_ERROR_CODES,
  TRANSPORT_ERROR_KEY_BY_CODE,
  codedError,
  displayKeyForErrorCode,
  errorDisplayMessage,
  isKnownErrorCode,
  resolveTransportCode,
} from "./errorDisplay.js";
export { notificationDeliveryReasonLabel } from "./notificationDeliveryReasonLabel.js";
