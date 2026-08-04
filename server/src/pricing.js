import { salePriceForUnit } from "./oneCSalePrices.js";

export const UNITS = ["piece", "bundle", "pack", "box", "pair", "roll"];

const UNIT_SIZE_FIELD = {
  piece: "pieceSize",
  pack: "packSize",
  bundle: "bundleSize",
  box: "boxSize",
  pair: "pairSize",
  roll: "rollSize",
};

const UNIT_PRICE_FIELD = {
  piece: "pricePiece",
  pack: "pricePack",
  bundle: "priceBundle",
  box: "priceBox",
  pair: "pricePair",
  roll: "priceRoll",
};

const UNIT_LABEL = {
  piece: "штука",
  pack: "упаковка",
  bundle: "пачка",
  box: "коробка",
  pair: "пара",
  roll: "рулон",
};

function finiteNonNegative(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function hasManualUnitPrice(value = {}) {
  return UNITS.some((unit) => finiteNonNegative(value?.[unit]) !== null);
}

export function unitPriceField(unit) {
  return UNIT_PRICE_FIELD[unit] || "pricePiece";
}

export function unitLabel(unit) {
  return UNIT_LABEL[unit] || "штука";
}

export function normalizePricingSource(value, rawConfig = {}) {
  if (value === "purchase_markup") return "purchase_markup";
  if (value === "one_c_price_type") return "one_c_price_type";
  if (value === "manual") return "manual";
  if (value === "inherit") return "inherit";

  if (hasManualUnitPrice(rawConfig)) return "manual";
  if (finiteNonNegative(rawConfig?.markupPercent) !== null) return "purchase_markup";
  return "inherit";
}

export function normalizeDefaultPricingSource(value) {
  if (value === "purchase_markup") return "purchase_markup";
  if (value === "one_c_price_type") return "one_c_price_type";
  return "base";
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
  // В 1С пара/рулон/штука уходят 1:1 в шт — размер содержимого не масштабирует.
  if (unit === "piece" || unit === "pair" || unit === "roll") return 1;
  const field = UNIT_SIZE_FIELD[unit] || "pieceSize";
  return Math.max(1, Number(product[field]) || 1);
}

export function normalizePurchaseUnit(value) {
  const raw = String(value || "").trim().toLocaleLowerCase("ru-RU");
  if (["pack", "package", "уп", "уп.", "упаковка"].includes(raw)) return "pack";
  if (["bundle", "bundlepack", "пач", "пач.", "пачка"].includes(raw)) return "bundle";
  if (["box", "кор", "кор.", "коробка"].includes(raw)) return "box";
  if (["pair", "пар", "пар.", "пара"].includes(raw)) return "pair";
  if (["roll", "рул", "рул.", "рулон"].includes(raw)) return "roll";
  return "piece";
}

export function purchasePriceForUnit(product = {}, oneCItem = {}, unit = "piece") {
  const directFields = {
    piece: ["purchasePricePiece", "costPricePiece"],
    pack: ["purchasePricePack", "costPricePack"],
    bundle: ["purchasePriceBundle", "costPriceBundle"],
    box: ["purchasePriceBox", "costPriceBox"],
    pair: ["purchasePricePair", "costPricePair"],
    roll: ["purchasePriceRoll", "costPriceRoll"],
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
    oneCPriceTypeId: cleanTextPriceType(rawDefaultConfig?.oneCPriceTypeId),
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

  const priceTypeId = result.oneCPriceTypeId;

  for (const unit of UNITS) {
    const baseField = unitPriceField(unit);
    const manual = config[unit];
    const purchase = oneCItem ? purchasePriceForUnit(product, oneCItem, unit) : null;
    result.purchasePrices[unit] = purchase;

    if (source === "one_c_price_type") {
      const typed = oneCItem ? salePriceForUnit(oneCItem, priceTypeId, unit) : null;
      if (typed !== null) {
        result.prices[unit] = typed;
        result.priceSources[unit] = "one_c_price_type";
      } else {
        const fallback = Math.max(0, Number(product[baseField]) || 0);
        result.prices[unit] = fallback;
        result.priceSources[unit] =
          fallback > 0 ? "base_fallback" : "one_c_price_missing";
      }
      continue;
    }

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

function cleanTextPriceType(value) {
  return String(value ?? "").trim();
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
    oneCItem.purchasePriceBox,
    oneCItem.purchasePricePair,
    oneCItem.purchasePriceRoll,
    oneCItem.costPricePiece,
    oneCItem.costPricePack,
    oneCItem.costPriceBundle,
    oneCItem.costPriceBox,
    oneCItem.costPricePair,
    oneCItem.costPriceRoll,
  ].some((value) => finiteNonNegative(value) !== null);
}
