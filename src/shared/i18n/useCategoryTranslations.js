import { useEffect, useState } from "react";
import { useLocalization } from "./LocalizationProvider.jsx";
import { storefrontCategoryDisplayOptions } from "./storefrontCategoryDisplay.js";

/**
 * Load public category translation bag for the active UI locale.
 * Uses lightweight /api/public/site (already carries categoryTranslations).
 * Russian / disabled locales keep an empty bag → display falls back to RU.
 *
 * Returns `undefined` while the foreign bag is in flight so callers can
 * skeleton instead of flashing RU labels.
 */
export function useCategoryTranslations({ enabled = true } = {}) {
  const { locale, enabledLanguages } = useLocalization();
  const [translations, setTranslations] = useState(() => {
    const language = String(locale || "ru");
    if (
      !enabled ||
      language === "ru" ||
      !Array.isArray(enabledLanguages) ||
      !enabledLanguages.includes(language)
    ) {
      return {};
    }
    return undefined;
  });

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
    setTranslations(undefined);
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
 * Pass `undefined` explicitly to signal "bag loading".
 */
export function useCategoryDisplayOptions(translations) {
  const { locale, enabledLanguages } = useLocalization();
  const hasOverride = arguments.length > 0;
  const loaded = useCategoryTranslations({ enabled: !hasOverride });
  const bag = hasOverride ? translations : loaded;
  return storefrontCategoryDisplayOptions(locale, bag, enabledLanguages);
}
