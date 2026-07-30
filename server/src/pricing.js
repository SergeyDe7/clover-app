const UNITS = ["piece", "pack", "bundle"];

function finiteNonNegative(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function hasManualUnitPrice(value = {}) {
  return UNITS.some((unit) => finiteNonNegative(value?.[unit]) !== null);
}

export function normalizePricingSource(value, rawConfig = {}) {
  if (value === "purchase_markup") return "purchase_markup";
  if (value === "manual") return "manual";
  if (value === "inherit") return "inherit";

  if (hasManualUnitPrice(rawConfig)) return "manual";
  if (finiteNonNegative(rawConfig?.markupPercent) !== null) return "purchase_markup";
  return "inherit";
}

export function normalizeDefaultPricingSource(value) {
  return value === "purchase_markup" ? "purchase_markup" : "base";
}

export function normalizeMarkupPercent(value) {
  const numeric = finiteNonNegative(value);
  return numeric === null ? 0 : Math.min(10000, numeric);
}

export function roundPriceUp(value) {
  const numeric = finiteNonNegative(value);
  if (numeric === null) return null;
  return Math.ceil(numeric - 1e-9);
}

export function unitSize(product = {}, unit = "piece") {
  if (unit === "pack") return Math.max(1, Number(product.packSize) || 1);
  if (unit === "bundle") return Math.max(1, Number(product.bundleSize) || 1);
  return Math.max(1, Number(product.pieceSize) || 1);
}

export function normalizePurchaseUnit(value) {
  const raw = String(value || "").trim().toLocaleLowerCase("ru-RU");
  if (["pack", "package", "уп", "уп.", "упаковка"].includes(raw)) return "pack";
  if (["bundle", "bundlepack", "пач", "пач.", "пачка"].includes(raw)) return "bundle";
  return "piece";
}

export function purchasePriceForUnit(product = {}, oneCItem = {}, unit = "piece") {
  const directFields = {
    piece: ["purchasePricePiece", "costPricePiece"],
    pack: ["purchasePricePack", "costPricePack"],
    bundle: ["purchasePriceBundle", "costPriceBundle"],
  };

  for (const field of directFields[unit] || []) {
    const direct = finiteNonNegative(oneCItem[field]);
    if (direct !== null) return direct;
  }

  const generic = finiteNonNegative(oneCItem.purchasePrice ?? oneCItem.costPrice);
  if (generic === null) return null;

  const sourceUnit = normalizePurchaseUnit(oneCItem.purchasePriceUnit);
  const sourceSize = unitSize(product, sourceUnit);
  const targetSize = unitSize(product, unit);
  return generic * (targetSize / sourceSize);
}

export function calculateMarkupPrice(purchasePrice, markupPercent) {
  const purchase = finiteNonNegative(purchasePrice);
  if (purchase === null) return null;
  const markup = normalizeMarkupPercent(markupPercent);
  return roundPriceUp(purchase * (1 + markup / 100));
}

export function normalizeDefaultPricingConfig(value = {}) {
  return {
    source: normalizeDefaultPricingSource(
      value.defaultPricingMode ?? value.defaultPriceSource ?? value.source
    ),
    markupPercent: normalizeMarkupPercent(
      value.defaultMarkupPercent ?? value.markupPercent
    ),
  };
}

export function normalizePersonalPriceConfig(value = {}) {
  const source = normalizePricingSource(value.source, value);
  const normalized = {
    ...value,
    source,
    markupPercent: normalizeMarkupPercent(value.markupPercent),
  };

  for (const unit of UNITS) {
    normalized[unit] = finiteNonNegative(value[unit]);
  }

  return normalized;
}

export function resolveClientProductPricing(
  product = {},
  rawConfig = {},
  oneCItem = null,
  rawDefaultConfig = {}
) {
  const config = normalizePersonalPriceConfig(rawConfig);
  const defaults = normalizeDefaultPricingConfig(rawDefaultConfig);
  const overrideSource = config.source;
  const source = overrideSource === "inherit" ? defaults.source : overrideSource;
  const markupPercent =
    overrideSource === "purchase_markup"
      ? config.markupPercent
      : overrideSource === "inherit" && defaults.source === "purchase_markup"
        ? defaults.markupPercent
        : config.markupPercent;

  const result = {
    source,
    overrideSource,
    markupPercent,
    defaultPricingMode: defaults.source,
    defaultMarkupPercent: defaults.markupPercent,
    purchasePriceUpdatedAt:
      oneCItem?.purchasePriceReceivedAt ||
      oneCItem?.purchasePriceUpdatedAt ||
      oneCItem?.updatedAt ||
      "",
    purchasePriceReceivedAt: oneCItem?.purchasePriceReceivedAt || "",
    purchasePriceSourceUpdatedAt: oneCItem?.purchasePriceSourceUpdatedAt || "",
    purchasePriceSourceDatabase: oneCItem?.purchasePriceSourceDatabase || "",
    purchasePriceUnit: normalizePurchaseUnit(oneCItem?.purchasePriceUnit),
    prices: {},
    purchasePrices: {},
    priceSources: {},
  };

  for (const unit of UNITS) {
    const baseField = unit === "piece" ? "pricePiece" : unit === "pack" ? "pricePack" : "priceBundle";
    const manual = config[unit];
    const purchase = oneCItem ? purchasePriceForUnit(product, oneCItem, unit) : null;
    result.purchasePrices[unit] = purchase;

    if (source === "purchase_markup") {
      const calculated = calculateMarkupPrice(purchase, markupPercent);
      if (calculated !== null) {
        result.prices[unit] = calculated;
        result.priceSources[unit] = "purchase_markup";
      } else {
        // Нет закупочной из 1С — не обнуляем витрину: показываем базовую цену каталога.
        const fallback = Math.max(0, Number(product[baseField]) || 0);
        result.prices[unit] = fallback;
        result.priceSources[unit] =
          fallback > 0 ? "base_fallback" : "purchase_missing";
      }
      continue;
    }

    if (source === "manual" && manual !== null) {
      result.prices[unit] = manual;
      result.priceSources[unit] = "manual";
      continue;
    }

    const fallback = Math.max(0, Number(product[baseField]) || 0);
    result.prices[unit] = fallback;
    result.priceSources[unit] = fallback > 0 ? "base" : "unspecified";
  }

  return result;
}

export function enrichProductWithPurchasePrices(product = {}, oneCItem = null) {
  const purchasePrices = {};
  for (const unit of UNITS) {
    purchasePrices[unit] = oneCItem ? purchasePriceForUnit(product, oneCItem, unit) : null;
  }

  return {
    ...product,
    purchasePrices,
    purchasePriceUpdatedAt:
      oneCItem?.purchasePriceReceivedAt ||
      oneCItem?.purchasePriceUpdatedAt ||
      oneCItem?.updatedAt ||
      "",
    purchasePriceReceivedAt: oneCItem?.purchasePriceReceivedAt || "",
    purchasePriceSourceUpdatedAt: oneCItem?.purchasePriceSourceUpdatedAt || "",
    purchasePriceSourceDatabase: oneCItem?.purchasePriceSourceDatabase || "",
    purchasePriceUnit: normalizePurchaseUnit(oneCItem?.purchasePriceUnit),
    purchasePriceAvailable: UNITS.some((unit) => purchasePrices[unit] !== null),
  };
}

export function hasPurchasePrice(oneCItem = {}) {
  return [
    oneCItem.purchasePrice,
    oneCItem.costPrice,
    oneCItem.purchasePricePiece,
    oneCItem.purchasePricePack,
    oneCItem.purchasePriceBundle,
    oneCItem.costPricePiece,
    oneCItem.costPricePack,
    oneCItem.costPriceBundle,
  ].some((value) => finiteNonNegative(value) !== null);
}
