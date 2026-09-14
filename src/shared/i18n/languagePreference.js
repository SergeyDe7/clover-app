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

/**
 * Session-scoped sticky marker for an explicit user language choice
 * (selector or storefront URL prefix). Survives login bootstrap so
 * profile.locale=ru cannot silently clobber the current choice.
 * Absent sticky → Stage 6.1 profile authority unchanged.
 */
export const EXPLICIT_LANGUAGE_SESSION_KEY = "clover-language-explicit-v1";

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

function sessionStore() {
  try {
    if (typeof globalThis === "undefined") return null;
    const ss = globalThis.sessionStorage;
    if (!ss || typeof ss.getItem !== "function" || typeof ss.setItem !== "function") {
      return null;
    }
    return ss;
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

/** Record an explicit user choice for this browser tab/session. */
export function markExplicitLanguageChoice(locale) {
  const normalized = writeLanguagePreference(locale);
  if (!normalized) return null;
  const ss = sessionStore();
  if (!ss) return normalized;
  try {
    ss.setItem(EXPLICIT_LANGUAGE_SESSION_KEY, normalized);
  } catch {
    // preference still written
  }
  return normalized;
}

export function readExplicitLanguageChoice() {
  const ss = sessionStore();
  if (!ss) return null;
  try {
    return normalizeLanguagePreference(ss.getItem(EXPLICIT_LANGUAGE_SESSION_KEY));
  } catch {
    return null;
  }
}

export function clearExplicitLanguageChoice() {
  const ss = sessionStore();
  if (!ss) return;
  try {
    ss.removeItem(EXPLICIT_LANGUAGE_SESSION_KEY);
  } catch {
    // ignore
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
