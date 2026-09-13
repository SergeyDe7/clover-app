import {
  isSupportedPublicLocale,
  toPublicLocaleCode,
} from "./languageRegistry.js";

export const LANGUAGE_PRESENTATION = Object.freeze({
  ru: Object.freeze({ flag: "🇷🇺", name: "Русский" }),
  en: Object.freeze({ flag: "🇬🇧", name: "English" }),
  uz: Object.freeze({ flag: "🇺🇿", name: "O‘zbekcha" }),
  ky: Object.freeze({ flag: "🇰🇬", name: "Кыргызча" }),
  tg: Object.freeze({ flag: "🇹🇯", name: "Тоҷикӣ" }),
  zh: Object.freeze({ flag: "🇨🇳", name: "中文" }),
  ar: Object.freeze({ flag: "🇸🇦", name: "العربية" }),
});

export function getLanguageOptions(enabledLanguages = []) {
  return enabledLanguages
    .filter((language) => isSupportedPublicLocale(language))
    .map((language) => toPublicLocaleCode(language))
    .filter((language, index, languages) =>
      Boolean(LANGUAGE_PRESENTATION[language]) && languages.indexOf(language) === index
    )
    .map((language) => ({ language, ...LANGUAGE_PRESENTATION[language] }));
}
