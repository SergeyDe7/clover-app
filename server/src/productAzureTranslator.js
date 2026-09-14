/**
 * Azure Text Translation adapter for Stage 8 product batch.
 * Provider is always "azure" when enabled; secrets never leave this module.
 */

export const DEFAULT_MONTHLY_LIMIT = 1_800_000;
export const AZURE_TRANSLATE_ENDPOINT =
  "https://api.cognitive.microsofttranslator.com/translate";
export const AZURE_API_VERSION = "3.0";
export const AZURE_REQUEST_TIMEOUT_MS = 30_000;
export const AZURE_MAX_TEXTS_PER_REQUEST = 50;
export const AZURE_MAX_CHARS_PER_REQUEST = 40_000;

/** Internal locale → Azure Translator language code. */
export const AZURE_LOCALE_MAP = Object.freeze({
  en: "en",
  uz: "uz",
  ky: "ky",
  tg: "tg",
  "zh-CN": "zh-Hans",
  ar: "ar",
});

function asTrimmed(value) {
  return String(value ?? "").trim();
}

export function readProductTranslationProviderConfig(env = process.env) {
  const rawProvider = asTrimmed(env.CLOVER_PRODUCT_TRANSLATION_PROVIDER || "disabled").toLowerCase();
  const provider = rawProvider === "azure" ? "azure" : "disabled";
  const keyPresent = Boolean(asTrimmed(env.CLOVER_AZURE_TRANSLATOR_KEY));
  const regionRaw = asTrimmed(env.CLOVER_AZURE_TRANSLATOR_REGION) || "global";
  const parsedLimit = Number(env.CLOVER_PRODUCT_TRANSLATION_MONTHLY_LIMIT);
  const monthlyLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : DEFAULT_MONTHLY_LIMIT;
  const configured = provider === "azure" && keyPresent;
  return {
    provider,
    configured,
    region: configured ? regionRaw : "",
    monthlyLimit,
  };
}

/** Server-only. Never log or return this value. */
export function readAzureTranslatorKey(env = process.env) {
  return asTrimmed(env.CLOVER_AZURE_TRANSLATOR_KEY);
}

export function azureLanguageCode(internalLocale) {
  return AZURE_LOCALE_MAP[internalLocale] || "";
}

function chunkTexts(texts, maxItems, maxChars) {
  const chunks = [];
  let current = [];
  let chars = 0;
  for (const text of texts) {
    const len = text.length;
    if (
      current.length > 0 &&
      (current.length >= maxItems || chars + len > maxChars)
    ) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Translate one language target for a list of Russian source strings.
 * No automatic retries. Injectable fetch for tests.
 *
 * @returns {Promise<string[]>} translations aligned with `texts`
 */
export async function azureTranslateTexts({
  texts,
  targetInternalLocale,
  key,
  region = "global",
  fetchImpl = globalThis.fetch,
  timeoutMs = AZURE_REQUEST_TIMEOUT_MS,
}) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const azureTo = azureLanguageCode(targetInternalLocale);
  if (!azureTo) {
    const error = new Error("Unsupported Azure target locale.");
    error.code = "UNSUPPORTED_LOCALE";
    throw error;
  }
  if (!key) {
    const error = new Error("Azure Translator key is not configured.");
    error.code = "AZURE_NOT_CONFIGURED";
    throw error;
  }
  if (typeof fetchImpl !== "function") {
    const error = new Error("Fetch is unavailable.");
    error.code = "FETCH_UNAVAILABLE";
    throw error;
  }

  const out = new Array(texts.length);
  const indexed = texts.map((text, index) => ({ text: String(text ?? ""), index }));
  const chunks = chunkTexts(
    indexed,
    AZURE_MAX_TEXTS_PER_REQUEST,
    AZURE_MAX_CHARS_PER_REQUEST
  );

  let billedChars = 0;
  for (const chunk of chunks) {
    const chunkChars = chunk.reduce((sum, item) => sum + item.text.length, 0);
    const params = new URLSearchParams();
    params.set("api-version", AZURE_API_VERSION);
    params.set("from", "ru");
    params.set("to", azureTo);
    const url = `${AZURE_TRANSLATE_ENDPOINT}?${params.toString()}`;
    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      "Ocp-Apim-Subscription-Key": key,
    };
    if (region && region.toLowerCase() !== "global") {
      headers["Ocp-Apim-Subscription-Region"] = region;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(chunk.map((item) => ({ Text: item.text }))),
        signal: controller.signal,
      });
    } catch (cause) {
      const error = new Error("Azure Translator request failed.");
      error.code =
        cause?.name === "AbortError" ? "AZURE_TIMEOUT" : "AZURE_NETWORK_ERROR";
      error.cause = cause;
      error.azureRequestSent = true;
      error.billedChars = billedChars + chunkChars;
      throw error;
    } finally {
      clearTimeout(timer);
    }

    // Request left the process; bill conservatively even if the response is unusable.
    billedChars += chunkChars;

    if (!response || !response.ok) {
      const error = new Error("Azure Translator returned an error status.");
      error.code = "AZURE_HTTP_ERROR";
      error.status = response?.status || 0;
      error.azureRequestSent = true;
      error.billedChars = billedChars;
      throw error;
    }

    let payload;
    try {
      payload = await response.json();
    } catch (cause) {
      const error = new Error("Azure Translator returned invalid JSON.");
      error.code = "AZURE_INVALID_RESPONSE";
      error.cause = cause;
      error.azureRequestSent = true;
      error.billedChars = billedChars;
      throw error;
    }

    if (!Array.isArray(payload) || payload.length !== chunk.length) {
      const error = new Error("Azure Translator response shape mismatch.");
      error.code = "AZURE_INVALID_RESPONSE";
      error.azureRequestSent = true;
      error.billedChars = billedChars;
      throw error;
    }

    for (let i = 0; i < chunk.length; i += 1) {
      const translations = payload[i]?.translations;
      const translated = Array.isArray(translations)
        ? String(translations[0]?.text ?? "")
        : "";
      if (!translated.trim()) {
        const error = new Error("Azure Translator returned an empty translation.");
        error.code = "AZURE_EMPTY_TRANSLATION";
        error.azureRequestSent = true;
        error.billedChars = billedChars;
        throw error;
      }
      out[chunk[i].index] = translated;
    }
  }

  return out;
}

/**
 * Azure adapter implementing the Stage 8 provider contract.
 * Secrets stay inside this factory / azureTranslateTexts.
 */
export function createAzureProductTranslationProvider({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const key = readAzureTranslatorKey(env);
  const regionRaw = asTrimmed(env.CLOVER_AZURE_TRANSLATOR_REGION) || "global";
  const parsedLimit = Number(env.CLOVER_PRODUCT_TRANSLATION_MONTHLY_LIMIT);
  const monthlyLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : DEFAULT_MONTHLY_LIMIT;

  return {
    id: "azure",
    usageUnit: "chars",
    isAvailable() {
      return Boolean(key);
    },
    supportedTargetLocales() {
      return Object.keys(AZURE_LOCALE_MAP);
    },
    requestLimits() {
      return {
        maxTextsPerRequest: AZURE_MAX_TEXTS_PER_REQUEST,
        maxCharsPerRequest: AZURE_MAX_CHARS_PER_REQUEST,
      };
    },
    monthlyLimit() {
      return monthlyLimit;
    },
    describeRegion() {
      return regionRaw.toLowerCase() === "global" ? "global" : "set";
    },
    estimateUsage({ texts = [], targetLocales = [] } = {}) {
      const textChars = (Array.isArray(texts) ? texts : []).reduce(
        (sum, text) => sum + String(text ?? "").length,
        0
      );
      const localeCount = Array.isArray(targetLocales) ? targetLocales.length : 0;
      return { units: "chars", amount: textChars * Math.max(0, localeCount) };
    },
    async translateBatch({ texts, sourceLocale = "ru", targetLocale }) {
      if (sourceLocale !== "ru") {
        const error = new Error("Azure product batch supports source locale ru only.");
        error.code = "UNSUPPORTED_SOURCE_LOCALE";
        throw error;
      }
      const list = Array.isArray(texts) ? texts.map((t) => String(t ?? "")) : [];
      const requestChars = list.reduce((sum, text) => sum + text.length, 0);
      try {
        const translations = await azureTranslateTexts({
          texts: list,
          targetInternalLocale: targetLocale,
          key,
          region: regionRaw,
          fetchImpl,
        });
        return {
          translations,
          confirmedUsage: { units: "chars", amount: requestChars },
          uncertainUsage: { units: "chars", amount: 0 },
        };
      } catch (error) {
        const billed = Math.max(
          0,
          Math.min(requestChars, Number(error?.billedChars) || 0)
        );
        const uncertain =
          error?.azureRequestSent ||
          error?.code === "AZURE_TIMEOUT" ||
          error?.code === "AZURE_NETWORK_ERROR" ||
          error?.code === "AZURE_INVALID_RESPONSE" ||
          error?.code === "AZURE_HTTP_ERROR" ||
          error?.code === "AZURE_EMPTY_TRANSLATION";
        error.confirmedUsage = { units: "chars", amount: 0 };
        error.uncertainUsage = {
          units: "chars",
          amount: uncertain ? billed || requestChars : 0,
        };
        if (error.billedChars == null && uncertain) {
          error.billedChars = billed || requestChars;
        }
        throw error;
      }
    },
  };
}
