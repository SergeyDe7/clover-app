/** Build/server locale-route infrastructure flag. Exact value `1` enables. */

export const PUBLIC_LOCALE_ROUTES_ENV_KEY = "CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED";

export function isPublicLocaleRoutesEnabledFromEnv(env) {
  const source =
    env ||
    (typeof globalThis !== "undefined" && globalThis.process?.env) ||
    {};
  return String(source?.[PUBLIC_LOCALE_ROUTES_ENV_KEY] || "").trim() === "1";
}
