/** Vite plugin: useLocalization without React dispatcher, RU catalog display. */
export function createI18nStubVitePlugin() {
  return {
    name: "i18n-test-localization-stub",
    enforce: "pre",
    resolveId(source) {
      if (String(source).includes("LocalizationProvider")) {
        return "\0i18n-test-localization-stub";
      }
      return null;
    },
    load(id) {
      if (id !== "\0i18n-test-localization-stub") return null;
      return `
        import { translate } from "/src/shared/i18n/translationRuntime.js";
        export function LocalizationProvider({ children }) {
          return children;
        }
        export function useLocalization() {
          return {
            locale: "ru",
            t: (key, params) => translate(key, { locale: "ru", params }),
          };
        }
      `;
    },
  };
}
