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
 * Syncs into browser storage best-effort. Returns the normalized public code even
 * when storage is unavailable, or null when the profile locale itself is invalid.
 */
export function syncBrowserPreferenceFromProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : null;
  if (!source) return null;
  const normalized = normalizeLanguagePreference(source.locale);
  if (!normalized) return null;
  writeLanguagePreference(normalized);
  return normalized;
}

function normalizeAccountId(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized || null;
}

/**
 * Coordinates client profile locale with explicit choices made while bootstrap
 * requests are pending. Session boundaries prevent one account's choice from
 * affecting another account.
 */
export function createProfileLocaleCoordinator() {
  let session = 0;
  let accountId = null;
  let selectionVersion = 0;
  let explicitLocale = null;

  const resetSession = (nextAccountId) => {
    session += 1;
    accountId = normalizeAccountId(nextAccountId);
    selectionVersion = 0;
    explicitLocale = null;
  };

  return Object.freeze({
    beginSession(nextAccountId) {
      resetSession(nextAccountId);
    },
    invalidateSession() {
      resetSession(null);
    },
    captureBootstrap() {
      return Object.freeze({ session, accountId, selectionVersion });
    },
    recordExplicitChoice(locale, currentAccountId) {
      const normalizedLocale = normalizeLanguagePreference(locale);
      const normalizedAccountId = normalizeAccountId(currentAccountId);
      if (
        !normalizedLocale ||
        !normalizedAccountId ||
        normalizedAccountId !== accountId
      ) {
        return null;
      }
      selectionVersion += 1;
      explicitLocale = normalizedLocale;
      return normalizedLocale;
    },
    reconcileBootstrapProfile(profile, incomingAccountId, request) {
      const normalizedAccountId = normalizeAccountId(incomingAccountId);
      if (
        !request ||
        request.session !== session ||
        !normalizedAccountId ||
        (request.accountId && request.accountId !== normalizedAccountId)
      ) {
        return null;
      }
      if (accountId === null) accountId = normalizedAccountId;
      if (accountId !== normalizedAccountId) return null;

      const incomingProfile = profile && typeof profile === "object" ? profile : {};
      const profileLocale = normalizeLanguagePreference(incomingProfile.locale);
      const preserveExplicitChoice =
        selectionVersion > request.selectionVersion && Boolean(explicitLocale);
      const locale = preserveExplicitChoice ? explicitLocale : profileLocale;

      return Object.freeze({
        profile: preserveExplicitChoice
          ? { ...incomingProfile, locale }
          : incomingProfile,
        locale,
        shouldApplyRuntime: Boolean(locale) && !preserveExplicitChoice,
        preservedExplicitChoice: preserveExplicitChoice,
      });
    },
  });
}
