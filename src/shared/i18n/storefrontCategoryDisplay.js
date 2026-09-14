/**
 * Storefront / cabinet category display options.
 *
 * Default enabledLanguages stays ["ru"] (fail-closed) when callers omit the live
 * policy. Stage 9+ screens must pass LocalizationProvider.enabledLanguages plus
 * the public categoryTranslations bag so foreign labels can render.
 */
export const STOREFRONT_CATEGORY_ENABLED_LANGUAGES = Object.freeze(["ru"]);

export function storefrontCategoryDisplayOptions(
  locale,
  translations = {},
  enabledLanguages = STOREFRONT_CATEGORY_ENABLED_LANGUAGES
) {
  return {
    language: locale,
    enabledLanguages: Array.isArray(enabledLanguages)
      ? enabledLanguages
      : STOREFRONT_CATEGORY_ENABLED_LANGUAGES,
    translations:
      translations && typeof translations === "object" ? translations : {},
  };
}
