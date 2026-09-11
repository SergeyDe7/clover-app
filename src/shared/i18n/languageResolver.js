import {
  canonicalizeLocale,
  DEFAULT_LOCALE,
  isLanguageEnabled,
} from "./languageRegistry.js";

/** Stage 1: first visit is Russian. Browser language must not redirect. */
export const BROWSER_LANGUAGE_AUTO_REDIRECT = false;

/** Stage 1: public /en /uz /ky /tg /zh /ar prefixes stay off. */
export const PUBLIC_LANGUAGE_PREFIXES_ENABLED = false;

export function extractPublicLanguagePrefix(pathname) {
  const path = typeof pathname === "string" && pathname ? pathname : "/";
  return { locale: null, pathname: path };
}

export function resolveLocale(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  void source.browserLanguage;
  void source.acceptLanguage;

  const surface = source.surface === "cabinet" ? "cabinet" : "storefront";
  const enabledLanguages = source.enabledLanguages;

  if (
    PUBLIC_LANGUAGE_PREFIXES_ENABLED &&
    surface === "storefront" &&
    isLanguageEnabled(source.urlPrefix, enabledLanguages)
  ) {
    return canonicalizeLocale(source.urlPrefix);
  }

  if (isLanguageEnabled(source.preferredLanguage, enabledLanguages)) {
    return canonicalizeLocale(source.preferredLanguage);
  }

  if (isLanguageEnabled(source.storedLanguage, enabledLanguages)) {
    return canonicalizeLocale(source.storedLanguage);
  }

  return DEFAULT_LOCALE;
}

/** Cabinets keep existing unprefixed /lk paths regardless of locale. */
export function cabinetPathForLocale(pathname, _locale) {
  return typeof pathname === "string" && pathname ? pathname : "/lk";
}
