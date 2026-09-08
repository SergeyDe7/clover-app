import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LANGUAGE_REGISTRY,
  canonicalizeLocale,
  isSupportedPublicLocale,
} from "./languageRegistry.js";
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

const PLACEHOLDER_TOKEN = /\{([a-zA-Z0-9_]+)\}/g;
const UNRESOLVED_PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/;

function extractPlaceholderNames(text) {
  const names = new Set();
  if (typeof text !== "string") return names;
  PLACEHOLDER_TOKEN.lastIndex = 0;
  let match = PLACEHOLDER_TOKEN.exec(text);
  while (match) {
    names.add(match[1]);
    match = PLACEHOLDER_TOKEN.exec(text);
  }
  return names;
}

function placeholderSetsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const name of left) {
    if (!right.has(name)) return false;
  }
  return true;
}

function isRegisteredUiKey(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  for (const key of Object.keys(RU_DICTIONARY)) {
    if (trimmed === key) return true;
  }
  return false;
}

function isStage3SafeVisibleText(value) {
  if (!isNonEmptyText(value)) return false;
  if (isRegisteredUiKey(value)) return false;
  if (UNRESOLVED_PLACEHOLDER.test(value)) return false;
  return true;
}

function copyStringMap(value) {
  const copy = Object.create(null);
  if (!value || typeof value !== "object") {
    return Object.freeze(copy);
  }
  for (const [key, text] of Object.entries(value)) {
    if (typeof key !== "string" || !key) continue;
    if (typeof text !== "string") continue;
    copy[key] = text;
  }
  return Object.freeze(copy);
}

function dictionaryLocaleId(rawKey) {
  if (typeof rawKey !== "string") return "";
  if (!isSupportedPublicLocale(rawKey)) return "";
  return canonicalizeLocale(rawKey);
}

function snapshotDictionaries(dictionaries) {
  const merged = Object.create(null);
  merged[FALLBACK_LOCALE] = { ...RU_DICTIONARY };

  if (dictionaries && typeof dictionaries === "object") {
    for (const [rawKey, map] of Object.entries(dictionaries)) {
      const internal = dictionaryLocaleId(rawKey);
      if (!internal) continue;
      if (internal === FALLBACK_LOCALE) continue;
      const incoming = Object.create(null);
      if (map && typeof map === "object") {
        for (const [key, text] of Object.entries(map)) {
          if (typeof key !== "string" || !key) continue;
          if (typeof text !== "string") continue;
          if (!Object.hasOwn(RU_DICTIONARY, key)) continue;
          if (
            !placeholderSetsEqual(
              extractPlaceholderNames(RU_DICTIONARY[key]),
              extractPlaceholderNames(text)
            )
          ) {
            continue;
          }
          incoming[key] = text;
        }
      }
      if (Object.keys(incoming).length === 0) continue;
      merged[internal] = {
        ...(merged[internal] || {}),
        ...incoming,
      };
    }
  }

  const frozen = Object.create(null);
  for (const [locale, map] of Object.entries(merged)) {
    frozen[locale] = copyStringMap(map);
  }
  return Object.freeze(frozen);
}

export function createLocalizationRuntime(options = {}) {
  const source = options && typeof options === "object" ? options : {};
  const allowForeignRuntime = source.allowForeignRuntime === true;
  const requested = canonicalizeLocale(source.locale);
  const locale = allowForeignRuntime ? requested : DEFAULT_LOCALE;
  const dictionaries = snapshotDictionaries(source.dictionaries);
  const direction = LANGUAGE_REGISTRY[locale]?.direction || "ltr";

  function t(key, params) {
    const target = translate(key, { locale, dictionaries, params });
    if (isStage3SafeVisibleText(target)) return target;
    const ruText = translate(key, {
      locale: FALLBACK_LOCALE,
      dictionaries,
      params,
    });
    if (isStage3SafeVisibleText(ruText)) return ruText;
    return MISSING_TRANSLATION_FALLBACK_RU;
  }

  return Object.freeze({
    locale,
    direction,
    t,
  });
}
