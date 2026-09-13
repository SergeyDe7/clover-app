import { useLocalization } from "./LocalizationProvider.jsx";
import { toPublicLocaleCode } from "./languageRegistry.js";

const LANGUAGE_NAMES = Object.freeze({
  ru: "Русский",
  en: "English",
  uz: "O‘zbekcha",
  ky: "Кыргызча",
  tg: "Тоҷикӣ",
  zh: "中文",
  ar: "العربية",
});

/** One native, keyboard- and touch-friendly selector shared by all application shells. */
export function LanguageSelector({ onLanguageChange, className = "" }) {
  const { locale, enabledLanguages, setLanguage, t } = useLocalization();
  const selected = toPublicLocaleCode(locale);
  const accessibleLabel = t("admin.languages.language");

  function handleChange(event) {
    const language = event.target.value;
    if (typeof onLanguageChange === "function") onLanguageChange(language);
    void setLanguage(language);
  }

  return (
    <label className={`language-selector${className ? ` ${className}` : ""}`}>
      <span className="language-selector-label">{accessibleLabel}</span>
      <select
        aria-label={accessibleLabel}
        value={selected}
        onChange={handleChange}
      >
        {enabledLanguages.map((language) => (
          <option key={language} value={language}>
            {LANGUAGE_NAMES[language] || language}
          </option>
        ))}
      </select>
    </label>
  );
}
