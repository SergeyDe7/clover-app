/**
 * Product batch translation provider contract (Stage 8).
 *
 * Runtime registry is explicit and server-only: disabled | azure.
 * Test adapters are never resolved from environment — only injected in tests.
 *
 * Adapter surface (implement for a new provider):
 * - id, isAvailable(), supportedTargetLocales()
 * - requestLimits(): { maxTextsPerRequest, maxCharsPerRequest }
 * - estimateUsage({ texts, targetLocales }): { units, amount }
 * - monthlyLimit(): number | null  (provider-specific; Azure uses env limit)
 * - translateBatch({ texts, sourceLocale, targetLocale, fetchImpl? })
 *     → { translations, confirmedUsage: { units, amount }, uncertainUsage?: { units, amount } }
 * - on failure: Error with code, optional confirmedUsage / uncertainUsage / azureRequestSent /
 *   billedChars (legacy Azure accounting fields mapped by the batch runner)
 */

import { createAzureProductTranslationProvider } from "./productAzureTranslator.js";

export const PRODUCT_TRANSLATION_RUNTIME_PROVIDERS = Object.freeze(["disabled", "azure"]);

function asTrimmed(value) {
  return String(value ?? "").trim();
}

/**
 * Normalize env provider id. Unknown values never enable a translator.
 * @returns {"disabled"|"azure"|"unknown"}
 */
export function normalizeProductTranslationProviderId(raw) {
  const id = asTrimmed(raw || "disabled").toLowerCase();
  if (!id || id === "disabled") return "disabled";
  if (id === "azure") return "azure";
  return "unknown";
}

/**
 * Resolve the runtime provider from environment. Never returns a test adapter.
 * @returns {null | ReturnType<typeof createAzureProductTranslationProvider>}
 */
export function resolveRuntimeProductTranslationProvider(env = process.env, options = {}) {
  const id = normalizeProductTranslationProviderId(env.CLOVER_PRODUCT_TRANSLATION_PROVIDER);
  if (id === "azure") {
    return createAzureProductTranslationProvider({
      env,
      fetchImpl: options.fetchImpl,
    });
  }
  return null;
}

/**
 * Public, secret-free provider status for admin API/UI.
 */
export function readProductTranslationProviderStatus(env = process.env) {
  const id = normalizeProductTranslationProviderId(env.CLOVER_PRODUCT_TRANSLATION_PROVIDER);
  if (id === "disabled") {
    return {
      provider: "disabled",
      providerConfigured: false,
      blockReason: "PROVIDER_NOT_CONFIGURED",
      region: "",
      monthlyLimit: null,
      usageUnit: "",
    };
  }
  if (id === "unknown") {
    return {
      provider: "unknown",
      providerConfigured: false,
      blockReason: "UNKNOWN_PROVIDER",
      region: "",
      monthlyLimit: null,
      usageUnit: "",
    };
  }
  const provider = resolveRuntimeProductTranslationProvider(env);
  const available = Boolean(provider?.isAvailable?.());
  return {
    provider: "azure",
    providerConfigured: available,
    blockReason: available ? "" : "PROVIDER_NOT_CONFIGURED",
    region: available ? provider.describeRegion?.() || "" : "",
    monthlyLimit: available ? provider.monthlyLimit() : provider?.monthlyLimit?.() ?? null,
    usageUnit: provider?.usageUnit || "chars",
  };
}
