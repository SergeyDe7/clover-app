import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../../../..");
function i18nStubPlugin() {
  return {
    name: "i18n-stub",
    enforce: "pre",
    resolveId(source) {
      if (String(source).includes("LocalizationProvider")) return "\0i18n-stub";
      return null;
    },
    load(id) {
      if (id !== "\0i18n-stub") return null;
      return `
        import { translate } from "${path.join(appRoot, "src/shared/i18n/translationRuntime.js")}";
        export function LocalizationProvider({ children }) { return children; }
        export function useLocalization() {
          return {
            locale: "ru",
            enabledLanguages: ["ru", "en"],
            setLanguage: async () => true,
            t: (key, params) => translate(key, { locale: "ru", params }),
          };
        }
      `;
    },
  };
}
export default defineConfig({
  root: __dirname,
  publicDir: path.join(appRoot, "public"),
  plugins: [i18nStubPlugin(), react()],
  server: { host: "127.0.0.1", port: 5201, strictPort: true, fs: { allow: [appRoot, __dirname] } },
  resolve: { dedupe: ["react", "react-dom"] },
});
