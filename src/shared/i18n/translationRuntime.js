import { canonicalizeLocale, FALLBACK_LOCALE } from "./languageRegistry.js";
import { RU_DICTIONARY } from "./dictionaries/ru.js";

export const MISSING_TRANSLATION_FALLBACK_RU = "Текст недоступен.";

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function lookupIn(dictionary, key) {
  if (!dictionary || typeof dictionary !== "object") return "";
  const value = dictionary[key];
  return isNonEmptyText(value) ? value : "";
}

function interpolate(template, params) {
  if (!params || typeof params !== "object") return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    if (!Object.hasOwn(params, name)) return match;
    const value = params[name];
    if (value == null) return "";
    return String(value);
  });
}

function render(template, params) {
  if (!template) return "";
  const rendered = interpolate(template, params);
  return isNonEmptyText(rendered) ? rendered : "";
}

export function translate(key, options = {}) {
  try {
    if (typeof key !== "string" || !key) {
      return MISSING_TRANSLATION_FALLBACK_RU;
    }

    const locale = canonicalizeLocale(options.locale);
    const dictionaries =
      options.dictionaries && typeof options.dictionaries === "object"
        ? options.dictionaries
        : {};

    const requested = render(lookupIn(dictionaries[locale], key), options.params);
    if (requested) return requested;

    const ruValue = render(
      lookupIn(dictionaries[FALLBACK_LOCALE], key) || lookupIn(RU_DICTIONARY, key),
      options.params
    );
    if (ruValue) return ruValue;

    return MISSING_TRANSLATION_FALLBACK_RU;
  } catch {
    return MISSING_TRANSLATION_FALLBACK_RU;
  }
}
