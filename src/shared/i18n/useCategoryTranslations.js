import { useEffect, useState } from "react";
import { useLocalization } from "./LocalizationProvider.jsx";
import { storefrontCategoryDisplayOptions } from "./storefrontCategoryDisplay.js";

/**
 * Load public category translation bag for the active UI locale.
 * Uses lightweight /api/public/site (already carries categoryTranslations).
 * Russian / disabled locales keep an empty bag → display falls back to RU.
 */
export function useCategoryTranslations({ enabled = true } = {}) {
  const { locale, enabledLanguages } = useLocalization();
  const [translations, setTranslations] = useState({});

  useEffect(() => {
    if (!enabled) {
      setTranslations({});
      return undefined;
    }
    const language = String(locale || "ru");
    if (
      language === "ru" ||
      !Array.isArray(enabledLanguages) ||
      !enabledLanguages.includes(language)
    ) {
      setTranslations({});
      return undefined;
    }

    let cancelled = false;
    const query = new URLSearchParams({ language });
    fetch(`/api/public/site?${query}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`site ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const bag = payload?.site?.categoryTranslations;
        setTranslations(bag && typeof bag === "object" ? bag : {});
      })
      .catch(() => {
        if (!cancelled) setTranslations({});
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, enabledLanguages, locale]);

  return translations;
}

/**
 * Projection options for the active locale.
 * Pass `translations` to reuse an already-fetched bag (catalog/product payloads);
 * omit it to load via /api/public/site.
 */
export function useCategoryDisplayOptions(translations) {
  const { locale, enabledLanguages } = useLocalization();
  const hasOverride = translations !== undefined;
  const loaded = useCategoryTranslations({ enabled: !hasOverride });
  const bag = hasOverride
    ? translations && typeof translations === "object"
      ? translations
      : {}
    : loaded;
  return storefrontCategoryDisplayOptions(locale, bag, enabledLanguages);
}
