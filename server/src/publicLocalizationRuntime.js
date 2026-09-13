import { resolveLocale } from "../../src/shared/i18n/languageResolver.js";
import {
  DEFAULT_LOCALE,
  getEnabledLocales,
} from "../../src/shared/i18n/languageRegistry.js";
import { translationStoreToDictionaries } from "../../src/shared/i18n/translationStoreProjection.js";

function copyDictionary(dictionary) {
  const projected = Object.create(null);
  if (!dictionary || typeof dictionary !== "object") return projected;
  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof key !== "string" || !key || typeof value !== "string") continue;
    projected[key] = value;
  }
  return projected;
}

/**
 * Strict public projection. Persisted rows and their workflow/audit metadata
 * never cross this boundary.
 */
export function buildPublicLocalizationRuntimeSnapshot({
  requestedLanguage,
  settings,
  translationStore,
} = {}) {
  const enabledLanguages = getEnabledLocales(settings?.enabledLanguages);
  const effectiveLocale = resolveLocale({
    preferredLanguage: requestedLanguage,
    enabledLanguages,
  });
  const catalogVersion = Number(settings?.catalogVersion);
  const dictionaries = translationStoreToDictionaries(translationStore);

  return {
    enabledLanguages,
    catalogVersion: Number.isFinite(catalogVersion) ? catalogVersion : 0,
    effectiveLocale,
    // Russian is code-owned in the client runtime. Avoid sending its source
    // corpus when no persisted foreign-language projection is required.
    dictionary:
      effectiveLocale === DEFAULT_LOCALE
        ? Object.create(null)
        : copyDictionary(dictionaries[effectiveLocale]),
  };
}
