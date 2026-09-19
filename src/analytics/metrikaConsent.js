import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  ANALYTICS_CONSENT_DENIED,
  ANALYTICS_CONSENT_GRANTED,
  ANALYTICS_CONSENT_SCHEMA_VERSION,
  ANALYTICS_CONSENT_STORAGE_KEY,
  ANALYTICS_CONSENT_UNSET,
  ANALYTICS_SETTINGS_OPEN_EVENT,
} from "./metrikaConfig.js";

/**
 * Versioned opt-in store for optional analytics.
 * Absence, corrupt JSON, or a different schema version is UNSET — not consent.
 * Order-form / personal-data-consent is a separate legal document and is not
 * read or written here.
 */

export function emptyAnalyticsConsentRecord() {
  return {
    version: ANALYTICS_CONSENT_SCHEMA_VERSION,
    status: ANALYTICS_CONSENT_UNSET,
  };
}

export function parseAnalyticsConsentRecord(raw) {
  const fallback = emptyAnalyticsConsentRecord();
  if (raw == null || raw === "") return fallback;
  if (raw === ANALYTICS_CONSENT_GRANTED || raw === ANALYTICS_CONSENT_DENIED) {
    return { version: ANALYTICS_CONSENT_SCHEMA_VERSION, status: raw };
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (Number(parsed?.version) !== ANALYTICS_CONSENT_SCHEMA_VERSION) {
      return fallback;
    }
    if (
      parsed.status === ANALYTICS_CONSENT_GRANTED ||
      parsed.status === ANALYTICS_CONSENT_DENIED
    ) {
      return {
        version: ANALYTICS_CONSENT_SCHEMA_VERSION,
        status: parsed.status,
      };
    }
  } catch {
    /* unset */
  }
  return fallback;
}

export function readAnalyticsConsentRecord(storage) {
  if (!storage?.getItem) return emptyAnalyticsConsentRecord();
  try {
    return parseAnalyticsConsentRecord(storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY));
  } catch {
    return emptyAnalyticsConsentRecord();
  }
}

export function readAnalyticsConsent(storage) {
  return readAnalyticsConsentRecord(storage).status;
}

export function hasAnalyticsConsent(storage) {
  return readAnalyticsConsent(storage) === ANALYTICS_CONSENT_GRANTED;
}

export function serializeAnalyticsConsentRecord(status) {
  const normalized =
    status === ANALYTICS_CONSENT_GRANTED
      ? ANALYTICS_CONSENT_GRANTED
      : ANALYTICS_CONSENT_DENIED;
  return JSON.stringify({
    version: ANALYTICS_CONSENT_SCHEMA_VERSION,
    status: normalized,
  });
}

function emit(targetWindow, name) {
  const win = targetWindow || (typeof window !== "undefined" ? window : null);
  if (!win?.dispatchEvent) return;
  try {
    win.dispatchEvent(new win.CustomEvent(name));
  } catch {
    /* ignore */
  }
}

export function writeAnalyticsConsent(storage, value, targetWindow) {
  const next =
    value === ANALYTICS_CONSENT_GRANTED
      ? ANALYTICS_CONSENT_GRANTED
      : ANALYTICS_CONSENT_DENIED;
  if (storage?.setItem) {
    try {
      storage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, serializeAnalyticsConsentRecord(next));
    } catch {
      /* quota / private mode — in-memory only */
    }
  }
  emit(targetWindow, ANALYTICS_CONSENT_CHANGED_EVENT);
  return next;
}

export function openAnalyticsSettings(targetWindow) {
  emit(targetWindow, ANALYTICS_SETTINGS_OPEN_EVENT);
}
