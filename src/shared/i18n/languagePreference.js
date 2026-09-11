/**
 * Stage 6.1 — browser language preference persistence.
 * Validates via the Stage 1 registry only. Never throws for storage failures.
 */
import {
  isSupportedPublicLocale,
  toPublicLocaleCode,
} from "./languageRegistry.js";

/** Centralized CLOVER localStorage key for UI language preference. */
export const LANGUAGE_PREFERENCE_STORAGE_KEY = "clover-language-preference-v1";

function storage() {
  try {
    if (typeof globalThis === "undefined") return null;
    const ls = globalThis.localStorage;
    if (!ls || typeof ls.getItem !== "function" || typeof ls.setItem !== "function") {
      return null;
    }
    return ls;
  } catch {
    return null;
  }
}

/**
 * Normalize an incoming preference to a supported public locale code.
 * Returns null when missing/unknown/malformed (never invents a locale).
 */
export function normalizeLanguagePreference(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (!isSupportedPublicLocale(raw)) return null;
  return toPublicLocaleCode(raw);
}

export function readLanguagePreference() {
  const ls = storage();
  if (!ls) return null;
  try {
    return normalizeLanguagePreference(ls.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Persist a canonical public locale. Returns the stored public code, or null
 * when the value is invalid / storage is unavailable.
 */
export function writeLanguagePreference(locale) {
  const normalized = normalizeLanguagePreference(locale);
  if (!normalized) return null;
  const ls = storage();
  if (!ls) return null;
  try {
    ls.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, normalized);
    return normalized;
  } catch {
    return null;
  }
}

export function clearLanguagePreference() {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * After authenticated bootstrap/login: profile.locale is authoritative when valid.
 * Syncs into browser storage. Returns synced public code or null.
 */
export function syncBrowserPreferenceFromProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : null;
  if (!source) return null;
  const normalized = normalizeLanguagePreference(source.locale);
  if (!normalized) return null;
  return writeLanguagePreference(normalized);
}
