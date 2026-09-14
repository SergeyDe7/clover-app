/**
 * Test-only product translation provider.
 * Never registered in the runtime env registry — inject via runProductBatchTranslation({ provider }).
 */

export function createTestProductTranslationProvider({
  id = "test",
  available = true,
  supportedLocales = ["en", "uz", "ky", "tg", "zh-CN", "ar"],
  monthlyLimit = 1_000_000,
  translateImpl,
} = {}) {
  return {
    id,
    usageUnit: "chars",
    isAvailable() {
      return available === true;
    },
    supportedTargetLocales() {
      return [...supportedLocales];
    },
    requestLimits() {
      return { maxTextsPerRequest: 50, maxCharsPerRequest: 40_000 };
    },
    monthlyLimit() {
      return monthlyLimit;
    },
    describeRegion() {
      return "test";
    },
    estimateUsage({ texts = [], targetLocales = [] } = {}) {
      const textChars = texts.reduce((sum, text) => sum + String(text ?? "").length, 0);
      return { units: "chars", amount: textChars * Math.max(0, targetLocales.length) };
    },
    async translateBatch({ texts, targetLocale }) {
      const list = Array.isArray(texts) ? texts.map((t) => String(t ?? "")) : [];
      const requestChars = list.reduce((sum, text) => sum + text.length, 0);
      if (typeof translateImpl === "function") {
        return translateImpl({ texts: list, targetLocale, requestChars });
      }
      return {
        translations: list.map((text) => `[${targetLocale}] ${text}`),
        confirmedUsage: { units: "chars", amount: requestChars },
        uncertainUsage: { units: "chars", amount: 0 },
      };
    },
  };
}
