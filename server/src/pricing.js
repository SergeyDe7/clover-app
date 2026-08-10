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

/** Цена товара на витрине: inherit (глобальный режим) или manual (своя). */
export function normalizeStorefrontPricing(value = {}) {
  const raw = value && typeof value === "object" ? value : {};
  const source = String(raw.source || "").trim() === "manual" ? "manual" : "inherit";
  const normalized = { source };
  for (const unit of UNITS) {
    const amount = finiteNonNegative(raw[unit]);
    normalized[unit] = amount === null ? null : Math.round(amount * 100) / 100;
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
      // База для наценки: закупочная (purchase-prices) или вид цен («Обновить цены»).
      // Если есть оба — берём более свежий timestamp, чтобы старый purchase
      // не перекрывал свежую выгрузку вида «Закупочная цена».
      const { cost, costKind } = pickPurchaseMarkupCost(
        product,
        oneCItem,
        priceTypeId,
        unit,
        purchase
      );

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
 * Источник: oneCItem.salePricesByType, иначе уже подмешанный product.salePricesByType.
 */
export function resolveTypedSalePrice(
  product = {},
  oneCItem = null,
  priceTypeId = "",
  unit = "piece"
) {
  if (!cleanTextPriceType(priceTypeId)) return null;

  const priceSource =
    oneCItem && hasTypedSalePrices(oneCItem)
      ? oneCItem
      : hasTypedSalePrices(product)
        ? product
        : oneCItem;

  if (!priceSource) return null;

  const direct = salePriceForUnit(priceSource, priceTypeId, unit);
  if (direct !== null) {
    return { price: direct, source: "one_c_price_type" };
  }

  const piece = salePriceForUnit(priceSource, priceTypeId, "piece");
  if (piece === null) return null;

  if (unit === "piece") {
    return { price: piece, source: "one_c_price_type" };
  }

  const sized = piece * unitSize(product, unit);
  return { price: sized, source: "one_c_price_type_from_piece" };
}

function hasTypedSalePrices(source = {}) {
  const byType =
    source?.salePricesByType && typeof source.salePricesByType === "object"
      ? source.salePricesByType
      : null;
  if (!byType) return false;
  return Object.values(byType).some(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      UNITS.some((unit) => finiteNonNegative(entry[unit]) !== null)
  );
}

function cleanTextPriceType(value) {
  return String(value ?? "").trim();
}

function purchaseCostReceivedAt(oneCItem = {}) {
  return cleanTextPriceType(
    oneCItem?.purchasePriceReceivedAt || oneCItem?.purchasePriceUpdatedAt || ""
  );
}

function typedSalePriceReceivedAt(oneCItem = {}, priceTypeId = "") {
  const typeId = cleanTextPriceType(priceTypeId);
  if (!typeId) return "";
  const byType =
    oneCItem?.salePricesByType && typeof oneCItem.salePricesByType === "object"
      ? oneCItem.salePricesByType
      : {};
  const entry = byType[typeId];
  if (!entry || typeof entry !== "object") return "";
  return cleanTextPriceType(entry.receivedAt || entry.updatedAt || "");
}

/**
 * База для purchase_markup: purchase и/или вид цен.
 * Свежий вид цен («Обновить цены») побеждает более старый purchase.
 * При равных/пустых датах — прежнее поведение (purchase первым).
 */
export function pickPurchaseMarkupCost(
  product,
  oneCItem,
  priceTypeId,
  unit,
  purchase
) {
  const typedCost = oneCItem
    ? resolveTypedSalePrice(product, oneCItem, priceTypeId, unit)
    : null;

  if (purchase === null && !typedCost) {
    return { cost: null, costKind: "purchase" };
  }
  if (purchase === null) {
    return { cost: typedCost.price, costKind: "one_c_price_type" };
  }
  if (!typedCost) {
    return { cost: purchase, costKind: "purchase" };
  }

  const purchaseAt = purchaseCostReceivedAt(oneCItem);
  const typedAt = typedSalePriceReceivedAt(oneCItem, priceTypeId);
  if (typedAt && (!purchaseAt || typedAt > purchaseAt)) {
    return { cost: typedCost.price, costKind: "one_c_price_type" };
  }
  return { cost: purchase, costKind: "purchase" };
}

export function enrichProductWithPurchasePrices(product = {}, oneCItem = null) {
  const purchasePrices = {};
  for (const unit of UNITS) {
    purchasePrices[unit] = oneCItem ? purchasePriceForUnit(product, oneCItem, unit) : null;
  }

  const fromOneC =
    oneCItem?.salePricesByType && typeof oneCItem.salePricesByType === "object"
      ? oneCItem.salePricesByType
      : null;
  const fromProduct =
    product.salePricesByType && typeof product.salePricesByType === "object"
      ? product.salePricesByType
      : {};
  const oneCHasTyped =
    fromOneC &&
    Object.values(fromOneC).some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        UNITS.some((unit) => finiteNonNegative(entry[unit]) !== null)
    );

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
    // Не затираем уже подтянутые виды цен пустым stub из products-preview.
    salePricesByType: oneCHasTyped ? fromOneC : fromProduct,
    salePriceReceivedAt:
      oneCItem?.salePriceReceivedAt ||
      oneCItem?.salePriceUpdatedAt ||
      product.salePriceReceivedAt ||
      "",
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
