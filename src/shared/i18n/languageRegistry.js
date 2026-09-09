/** Code-owned language registry. Runtime cannot add or remove valid codes. */

export const DEFAULT_LOCALE = "ru";
export const FALLBACK_LOCALE = "ru";

export const PUBLIC_LOCALE_CODES = Object.freeze([
  "ru",
  "en",
  "uz",
  "ky",
  "tg",
  "zh",
  "ar",
]);

const PUBLIC_TO_INTERNAL = Object.freeze({
  ru: "ru",
  en: "en",
  uz: "uz",
  ky: "ky",
  tg: "tg",
  zh: "zh-CN",
  ar: "ar",
});

const INTERNAL_TO_PUBLIC = Object.freeze({
  ru: "ru",
  en: "en",
  uz: "uz",
  ky: "ky",
  tg: "tg",
  "zh-CN": "zh",
  ar: "ar",
});

export const LANGUAGE_REGISTRY = Object.freeze({
  ru: Object.freeze({ internalCode: "ru", publicCode: "ru", direction: "ltr", alwaysEnabled: true }),
  en: Object.freeze({ internalCode: "en", publicCode: "en", direction: "ltr", alwaysEnabled: false }),
  uz: Object.freeze({ internalCode: "uz", publicCode: "uz", direction: "ltr", alwaysEnabled: false }),
  ky: Object.freeze({ internalCode: "ky", publicCode: "ky", direction: "ltr", alwaysEnabled: false }),
  tg: Object.freeze({ internalCode: "tg", publicCode: "tg", direction: "ltr", alwaysEnabled: false }),
  "zh-CN": Object.freeze({ internalCode: "zh-CN", publicCode: "zh", direction: "ltr", alwaysEnabled: false }),
  ar: Object.freeze({ internalCode: "ar", publicCode: "ar", direction: "rtl", alwaysEnabled: false }),
});

function asLocaleInput(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function recognizedInternalCode(value) {
  const raw = asLocaleInput(value);
  if (!raw) return "";
  const lower = raw.toLowerCase().replaceAll("_", "-");
  if (lower === "zh-cn") return "zh-CN";
  if (Object.hasOwn(PUBLIC_TO_INTERNAL, lower)) return PUBLIC_TO_INTERNAL[lower];
  return "";
}

export function canonicalizeLocale(value) {
  return recognizedInternalCode(value) || DEFAULT_LOCALE;
}

export function toPublicLocaleCode(value) {
  const internal = canonicalizeLocale(value);
  return INTERNAL_TO_PUBLIC[internal] || DEFAULT_LOCALE;
}

export function isSupportedPublicLocale(value) {
  if (typeof value !== "string") return false;
  const raw = value.trim().toLowerCase().replaceAll("_", "-");
  if (raw === "zh-cn") return true;
  return PUBLIC_LOCALE_CODES.includes(raw);
}

export function isLanguageEnabled(value, enabledLanguages) {
  const internal = recognizedInternalCode(value);
  if (!internal) return false;
  if (LANGUAGE_REGISTRY[internal]?.alwaysEnabled === true) return true;
  if (!Array.isArray(enabledLanguages)) return false;
  return enabledLanguages.some((code) => recognizedInternalCode(code) === internal);
}

export function getEnabledLocales(enabledLanguages) {
  const enabled = [DEFAULT_LOCALE];
  if (!Array.isArray(enabledLanguages)) return enabled;
  for (const code of enabledLanguages) {
    const internal = recognizedInternalCode(code);
    if (!internal) continue;
    const publicCode = INTERNAL_TO_PUBLIC[internal] || DEFAULT_LOCALE;
    if (!enabled.includes(publicCode)) enabled.push(publicCode);
  }
  return enabled;
}

/** Internal non-RU codes stored in translation_values.language_code. */
export const TARGET_INTERNAL_LOCALES = Object.freeze([
  "en",
  "uz",
  "ky",
  "tg",
  "zh-CN",
  "ar",
]);

/**
 * Validation boundary: supported public or internal target locale.
 * Never folds unknown/fr/ru into a usable target.
 */
export function isSupportedTargetLocale(value) {
  if (typeof value !== "string") return false;
  if (!isSupportedPublicLocale(value)) return false;
  const internal = recognizedInternalCode(value);
  return TARGET_INTERNAL_LOCALES.includes(internal);
}

export function canonicalizeTargetLocale(value) {
  if (!isSupportedTargetLocale(value)) return "";
  return recognizedInternalCode(value);
}
