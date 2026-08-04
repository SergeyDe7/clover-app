import { salePriceForUnit } from "./oneCSalePrices.js";

export const UNITS = ["piece", "pair", "meter", "roll", "pack", "bundle", "box"];

const UNIT_SIZE_FIELD = {
  piece: "pieceSize",
  pair: "pairSize",
  meter: "meterSize",
  roll: "rollSize",
  pack: "packSize",
  bundle: "bundleSize",
  box: "boxSize",
};

const UNIT_PRICE_FIELD = {
  piece: "pricePiece",
  pair: "pricePair",
  meter: "priceMeter",
  roll: "priceRoll",
  pack: "pricePack",
  bundle: "priceBundle",
  box: "priceBox",
};

const UNIT_LABEL = {
  piece: "штука",
  pair: "пара",
  meter: "метр",
  roll: "рулон",
  pack: "упаковка",
  bundle: "пачка",
  box: "коробка",
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
  // Фактическая цена с копейками (без округления вверх до рубля).
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function unitSize(product = {}, unit = "piece") {
  // В 1С штука/пара/метр/рулон уходят 1:1 в шт — размер содержимого не масштабирует.
  if (unit === "piece" || unit === "pair" || unit === "meter" || unit === "roll") return 1;
  const field = UNIT_SIZE_FIELD[unit] || "pieceSize";
  return Math.max(1, Number(product[field]) || 1);
}

export function normalizePurchaseUnit(value) {
  const raw = String(value || "").trim().toLocaleLowerCase("ru-RU");
  if (["pack", "package", "уп", "уп.", "упаковка"].includes(raw)) return "pack";
  if (["bundle", "bundlepack", "пач", "пач.", "пачка"].includes(raw)) return "bundle";
  if (["box", "кор", "кор.", "коробка"].includes(raw)) return "box";
  if (["pair", "пар", "пар.", "пара"].includes(raw)) return "pair";
  if (["meter", "м", "м.", "метр", "метры"].includes(raw)) return "meter";
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
    meter: ["purchasePriceMeter", "costPriceMeter"],
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
      const typed = resolveTypedSalePrice(product, oneCItem, priceTypeId, unit);
      if (typed) {
        result.prices[unit] = typed.price;
        result.priceSources[unit] = typed.source;
      } else {
        const fallback = Math.max(0, Number(product[baseField]) || 0);
        result.prices[unit] = fallback;
        result.priceSources[unit] =
          fallback > 0 ? "base_fallback" : "one_c_price_missing";
      }
      continue;
    }

    if (source === "purchase_markup") {
      // База для наценки: закупочная из регистра 1С, иначе цена выбранного вида цен
      // (часто вид «Закупочная цена» в справочнике видов цен).
      let cost = purchase;
      let costKind = "purchase";
      if (cost === null) {
        const typedCost = resolveTypedSalePrice(product, oneCItem, priceTypeId, unit);
        if (typedCost) {
          cost = typedCost.price;
          costKind = "one_c_price_type";
        }
      }

      const calculated = calculateMarkupPrice(cost, markupPercent);
      if (calculated !== null) {
        result.prices[unit] = calculated;
        result.priceSources[unit] =
          costKind === "purchase"
            ? "purchase_markup"
            : "purchase_markup_from_price_type";
      } else {
        const fallback = Math.max(0, Number(product[baseField]) || 0);
        if (fallback > 0) {
          result.prices[unit] = fallback;
          result.priceSources[unit] = "base_fallback";
        } else {
          result.prices[unit] = 0;
          result.priceSources[unit] = "purchase_missing";
        }
      }
      continue;
    }

    if (source === "manual" && manual !== null) {
      result.prices[unit] = manual;
      result.priceSources[unit] = "manual";
      continue;
    }

    const fallback = Math.max(0, Number(product[baseField]) || 0);
    if (fallback > 0) {
      result.prices[unit] = fallback;
      result.priceSources[unit] = "base";
      continue;
    }

    // В карточке товара цену не задали — для клиента с категорией цен 1С
    // берём цену за шт из вида цен (упаковка/пачка/коробка = шт × внутри).
    const typed = resolveTypedSalePrice(product, oneCItem, priceTypeId, unit);
    if (typed) {
      result.prices[unit] = typed.price;
      result.priceSources[unit] = typed.source;
    } else {
      result.prices[unit] = 0;
      result.priceSources[unit] = "unspecified";
    }
  }

  return result;
}

/**
 * Цена продажи из вида цен 1С.
 * Если цены именно за единицу нет — берём цену за шт и масштабируем размером единицы.
 */
export function resolveTypedSalePrice(
  product = {},
  oneCItem = null,
  priceTypeId = "",
  unit = "piece"
) {
  if (!oneCItem || !cleanTextPriceType(priceTypeId)) return null;

  const direct = salePriceForUnit(oneCItem, priceTypeId, unit);
  if (direct !== null) {
    return { price: direct, source: "one_c_price_type" };
  }

  const piece = salePriceForUnit(oneCItem, priceTypeId, "piece");
  if (piece === null) return null;

  if (unit === "piece") {
    return { price: piece, source: "one_c_price_type" };
  }

  const sized = piece * unitSize(product, unit);
  return { price: sized, source: "one_c_price_type_from_piece" };
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
    salePricesByType:
      oneCItem?.salePricesByType && typeof oneCItem.salePricesByType === "object"
        ? oneCItem.salePricesByType
        : {},
    salePriceReceivedAt:
      oneCItem?.salePriceReceivedAt || oneCItem?.salePriceUpdatedAt || "",
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
