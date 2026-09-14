import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isLanguageEnabled, toPublicLocaleCode } from "./languageRegistry.js";
import { readLanguagePreference, markExplicitLanguageChoice } from "./languagePreference.js";
import { createLocalizationRuntime } from "./translationRuntime.js";
import {
  applyRuntimeDocumentLocale,
  normalizePublicRuntimeSnapshot,
  createRuntimeSnapshotLoader,
} from "./runtimeRequestGate.js";
import {
  publicLocaleInfrastructureEnabledFromDocument,
} from "./publicLocaleRouting.js";
import { resolvePublicSurfaceLocale } from "./publicSurfaceLocale.js";

const RUNTIME_ENDPOINT = "/api/public/localization/runtime";
const defaultRuntime = Object.freeze({
  ...createLocalizationRuntime(),
  enabledLanguages: Object.freeze(["ru"]),
  catalogVersion: "",
  setLanguage: async () => ({ ok: false, stale: false }),
  invalidateLanguageRequests: () => {},
});
const LocalizationContext = createContext(defaultRuntime);

export { resolvePublicSurfaceLocale } from "./publicSurfaceLocale.js";

function publicUrlLanguage() {
  if (typeof window === "undefined" || typeof document === "undefined") return "";
  if (!publicLocaleInfrastructureEnabledFromDocument(document)) return "";
  const { surface, urlLocale } = resolvePublicSurfaceLocale(
    window.location?.pathname || "/"
  );
  if (surface === "cabinet") return "";
  // Storefront load signal: explicit prefix wins; unprefixed → ru.
  return urlLocale || "ru";
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
  const preferenceRef = useRef(readLanguagePreference());
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
    if (typeof window === "undefined") return;
    const { surface, urlLocale } = resolvePublicSurfaceLocale(
      window.location?.pathname || "/"
    );

    let preferredLanguage;
    if (locale) {
      preferredLanguage = locale;
    } else if (surface === "storefront") {
      // Prefixed public URLs are authoritative. Persist them so /lk inherits.
      preferredLanguage = urlLocale || "ru";
      if (urlLocale) {
        const stored = markExplicitLanguageChoice(urlLocale);
        if (stored) preferenceRef.current = stored;
      }
    } else {
      // Cabinet: live preference (not a stale mount-time ref).
      preferredLanguage =
        readLanguagePreference() || preferenceRef.current || "ru";
    }

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
          const stored = markExplicitLanguageChoice(language);
          if (stored) preferenceRef.current = stored;
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
