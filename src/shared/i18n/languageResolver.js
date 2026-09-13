import {
  canonicalizeLocale,
  DEFAULT_LOCALE,
  isLanguageEnabled,
} from "./languageRegistry.js";
import {
  isPublicLocaleInfrastructureEnabled,
  stripPublicLocalePrefix,
} from "./publicLocaleRouting.js";

/** Stage 1: first visit is Russian. Browser language must not redirect. */
export const BROWSER_LANGUAGE_AUTO_REDIRECT = false;

/** Stage 1: public /en /uz /ky /tg /zh /ar prefixes stay off. */
export const PUBLIC_LANGUAGE_PREFIXES_ENABLED = false;

export function extractPublicLanguagePrefix(
  pathname,
  { infrastructureEnabled = PUBLIC_LANGUAGE_PREFIXES_ENABLED } = {}
) {
  const path = typeof pathname === "string" && pathname ? pathname : "/";
  const parsed = stripPublicLocalePrefix(path, { infrastructureEnabled });
  if (!parsed.ok) return { locale: null, pathname: path };
  return { locale: parsed.locale, pathname: parsed.pathname };
}

export function resolveLocale(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  void source.browserLanguage;
  void source.acceptLanguage;

  const surface = source.surface === "cabinet" ? "cabinet" : "storefront";
  const enabledLanguages = source.enabledLanguages;
  const publicRoutesEnabled = isPublicLocaleInfrastructureEnabled(
    source.publicLocaleInfrastructureEnabled ?? PUBLIC_LANGUAGE_PREFIXES_ENABLED
  );

  if (
    publicRoutesEnabled &&
    surface === "storefront" &&
    isLanguageEnabled(source.urlPrefix, enabledLanguages)
  ) {
    return canonicalizeLocale(source.urlPrefix);
  }
  if (publicRoutesEnabled && surface === "storefront") {
    // Explicit public URLs are authoritative. The unprefixed compatibility
    // route is always Russian and never inherits browser/profile preference.
    return DEFAULT_LOCALE;
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
