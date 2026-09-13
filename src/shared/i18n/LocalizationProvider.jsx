import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isLanguageEnabled, toPublicLocaleCode } from "./languageRegistry.js";
import { readLanguagePreference, writeLanguagePreference } from "./languagePreference.js";
import { createLocalizationRuntime } from "./translationRuntime.js";
import {
  applyRuntimeDocumentLocale,
  normalizePublicRuntimeSnapshot,
  createRuntimeSnapshotLoader,
} from "./runtimeRequestGate.js";

const RUNTIME_ENDPOINT = "/api/public/localization/runtime";
const defaultRuntime = Object.freeze({
  ...createLocalizationRuntime(),
  enabledLanguages: Object.freeze(["ru"]),
  catalogVersion: "",
  setLanguage: async () => false,
  invalidateLanguageRequests: () => {},
});
const LocalizationContext = createContext(defaultRuntime);

async function requestRuntimeSnapshot(language, signal) {
  const query = new URLSearchParams({ language: toPublicLocaleCode(language) });
  const response = await fetch(`${RUNTIME_ENDPOINT}?${query}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`Localization runtime request failed (${response.status})`);
  return normalizePublicRuntimeSnapshot(await response.json());
}

export function LocalizationProvider({
  children,
  locale,
  dictionaries,
}) {
  const initialPreference = useRef(readLanguagePreference());
  const [snapshot, setSnapshot] = useState(() => ({
    enabledLanguages: ["ru"],
    catalogVersion: "",
    locale: "ru",
    dictionaries: dictionaries || {},
  }));
  const loader = useRef(createRuntimeSnapshotLoader({
    requestSnapshot: requestRuntimeSnapshot,
    applySnapshot: setSnapshot,
  })).current;

  useEffect(() => {
    const preferredLanguage = locale || initialPreference.current || "ru";
    void loader.load(preferredLanguage);
  }, [locale, loader]);

  const value = useMemo(() => {
    const runtime = createLocalizationRuntime({
      locale: snapshot.locale,
      dictionaries: snapshot.dictionaries,
      allowForeignRuntime: true,
    });
    return Object.freeze({
      ...runtime,
      enabledLanguages: Object.freeze([...snapshot.enabledLanguages]),
      catalogVersion: snapshot.catalogVersion,
      setLanguage: async (language) => {
        if (isLanguageEnabled(language, snapshot.enabledLanguages)) {
          writeLanguagePreference(language);
        }
        const next = await loader.load(language);
        return Boolean(
          next &&
          isLanguageEnabled(language, next.enabledLanguages) &&
          toPublicLocaleCode(next.locale) === toPublicLocaleCode(language)
        );
      },
      invalidateLanguageRequests: () => loader.invalidate(),
    });
  }, [loader, snapshot]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    applyRuntimeDocumentLocale(document, {
      locale: value.locale,
      direction: value.direction,
    });
    return undefined;
  }, [value.direction, value.locale]);

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  return useContext(LocalizationContext);
}
