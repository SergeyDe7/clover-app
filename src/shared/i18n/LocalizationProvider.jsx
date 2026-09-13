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
import { extractPublicLanguagePrefix } from "./languageResolver.js";
import {
  publicLocaleInfrastructureEnabledFromDocument,
} from "./publicLocaleRouting.js";

const RUNTIME_ENDPOINT = "/api/public/localization/runtime";
const defaultRuntime = Object.freeze({
  ...createLocalizationRuntime(),
  enabledLanguages: Object.freeze(["ru"]),
  catalogVersion: "",
      setLanguage: async () => ({ ok: false, stale: false }),
  invalidateLanguageRequests: () => {},
});
const LocalizationContext = createContext(defaultRuntime);

function publicUrlLanguage() {
  if (typeof window === "undefined" || typeof document === "undefined") return "";
  if (!publicLocaleInfrastructureEnabledFromDocument(document)) return "";
  const pathname = String(window.location?.pathname || "/");
  if (pathname === "/lk" || pathname.startsWith("/lk/")) return "";
  const parsed = extractPublicLanguagePrefix(pathname, {
    infrastructureEnabled: true,
  });
  return parsed.locale || "ru";
}

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
  const [urlLanguage, setUrlLanguage] = useState(publicUrlLanguage);
  const [snapshot, setSnapshot] = useState(() => ({
    enabledLanguages: ["ru"],
    catalogVersion: "",
    locale: publicUrlLanguage() || "ru",
    dictionaries: dictionaries || {},
  }));
  const loader = useRef(createRuntimeSnapshotLoader({
    requestSnapshot: requestRuntimeSnapshot,
    applySnapshot: setSnapshot,
  })).current;

  useEffect(() => {
    const sync = () => setUrlLanguage(publicUrlLanguage());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    const preferredLanguage =
      locale || urlLanguage || initialPreference.current || "ru";
    void loader.load(preferredLanguage);
  }, [locale, loader, urlLanguage]);

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
        const result = await loader.loadWithStatus(language);
        if (result.status === "stale") return { ok: false, stale: true };
        const next = result.snapshot;
        return {
          ok: Boolean(
            next &&
            isLanguageEnabled(language, next.enabledLanguages) &&
            toPublicLocaleCode(next.locale) === toPublicLocaleCode(language)
          ),
          stale: false,
        };
      },
      invalidateLanguageRequests: () => loader.invalidate(),
    });
  }, [loader, snapshot]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const immediate = urlLanguage || value.locale;
    applyRuntimeDocumentLocale(document, {
      locale: immediate === "zh" ? "zh-CN" : immediate,
      direction: (immediate === "ar" ? "rtl" : value.direction) || "ltr",
    });
    return undefined;
  }, [urlLanguage, value.direction, value.locale]);

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  return useContext(LocalizationContext);
}
