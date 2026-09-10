/**
 * Stage 5.1 storefront category display options.
 *
 * Production freeze: only RU is enabled. Live category translation bags / foreign
 * activation transport belong to Stage 6 — do not invent selectors or locale URLs here.
 *
 * Projection remains capable of controlled foreign rendering when a caller explicitly
 * supplies an allowed locale + prepared translations (tests / future Stage 6 wiring).
 */
export const STOREFRONT_CATEGORY_ENABLED_LANGUAGES = Object.freeze(["ru"]);

export function storefrontCategoryDisplayOptions(locale, translations = {}) {
  return {
    language: locale,
    enabledLanguages: STOREFRONT_CATEGORY_ENABLED_LANGUAGES,
    translations:
      translations && typeof translations === "object" ? translations : {},
  };
}
