import {
  canonicalizeLocale,
  getEnabledLocales,
  isExactPublicLocaleCode,
  isLanguageEnabled,
  isSupportedPublicLocale,
} from "./languageRegistry.js";

const PUBLIC_RUNTIME_DTO_KEYS = Object.freeze([
  "catalogVersion",
  "dictionary",
  "effectiveLocale",
  "enabledLanguages",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Reject malformed public runtime data so callers can preserve their last valid snapshot. */
export function normalizePublicRuntimeSnapshot(payload) {
  if (!isRecord(payload)) throw new TypeError("Invalid localization runtime payload");
  const keys = Object.keys(payload).sort();
  if (
    keys.length !== PUBLIC_RUNTIME_DTO_KEYS.length ||
    keys.some((key, index) => key !== PUBLIC_RUNTIME_DTO_KEYS[index])
  ) {
    throw new TypeError("Invalid localization runtime DTO");
  }

  const requestedEnabled = payload.enabledLanguages;
  if (
    !Array.isArray(requestedEnabled) ||
    !requestedEnabled.every(isExactPublicLocaleCode)
  ) {
    throw new TypeError("Invalid enabled language policy");
  }
  const enabledLanguages = getEnabledLocales(requestedEnabled);
  if (
    enabledLanguages.length !== requestedEnabled.length ||
    enabledLanguages.some((language, index) => language !== requestedEnabled[index])
  ) {
    throw new TypeError("Invalid enabled language policy");
  }

  const effectiveLocale = payload.effectiveLocale;
  if (
    typeof effectiveLocale !== "string" ||
    !isSupportedPublicLocale(effectiveLocale) ||
    canonicalizeLocale(effectiveLocale) !== effectiveLocale ||
    !isLanguageEnabled(effectiveLocale, enabledLanguages)
  ) {
    throw new TypeError("Invalid effective locale");
  }
  if (!Number.isFinite(payload.catalogVersion)) {
    throw new TypeError("Invalid localization catalog version");
  }
  if (!isRecord(payload.dictionary)) {
    throw new TypeError("Invalid localization dictionary");
  }

  const dictionary = Object.create(null);
  for (const [key, value] of Object.entries(payload.dictionary)) {
    if (!key || typeof value !== "string") {
      throw new TypeError("Invalid localization dictionary");
    }
    dictionary[key] = value;
  }

  return {
    enabledLanguages,
    catalogVersion: payload.catalogVersion,
    locale: effectiveLocale,
    dictionaries: { [effectiveLocale]: dictionary },
  };
}

/** Small generation gate shared by the provider and its deterministic verifier. */
export function createRuntimeRequestGate() {
  let generation = 0;
  return Object.freeze({
    next() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(candidate) {
      return candidate === generation;
    },
  });
}

/** Latest-request-only async snapshot transition used by LocalizationProvider. */
export function createRuntimeSnapshotLoader({ requestSnapshot, applySnapshot }) {
  const gate = createRuntimeRequestGate();
  return Object.freeze({
    async load(language) {
      const generation = gate.next();
      try {
        const snapshot = await requestSnapshot(language || "ru");
        if (!gate.isCurrent(generation)) return null;
        applySnapshot(snapshot);
        return snapshot;
      } catch {
        return null;
      }
    },
    invalidate() {
      gate.invalidate();
    },
  });
}

export function applyRuntimeDocumentLocale(documentLike, { locale, direction }) {
  if (!documentLike?.documentElement) return;
  const root = documentLike.documentElement;
  const appRoot = documentLike.getElementById?.("root");
  root.dir = direction;
  root.lang = locale;
  if (appRoot) {
    appRoot.dir = direction;
    appRoot.lang = locale;
  }
}
