/** Виды цен 1С (категории цен) и продажные цены номенклатуры по виду. */

function cleanText(value) {
  return String(value ?? "").trim();
}

function finiteNonNegative(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

const UNITS = ["piece", "pair", "meter", "roll", "pack", "bundle", "box"];

export function normalizeOneCPriceType(item = {}) {
  const id = cleanText(item.id ?? item.oneCId ?? item.ref ?? item.code);
  const name = cleanText(item.name ?? item.presentation ?? item.description ?? id);
  return {
    id,
    code: cleanText(item.code ?? item.oneCCode),
    name,
  };
}

export function normalizeOneCPriceTypes(items) {
  const unique = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeOneCPriceType(raw);
    if (!item.id || !item.name) continue;
    unique.set(item.id, item);
  }
  return [...unique.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ru")
  );
}

function unitPricesFromPayload(raw = {}) {
  const prices =
    raw.prices && typeof raw.prices === "object" && !Array.isArray(raw.prices)
      ? raw.prices
      : {};
  const generic = finiteNonNegative(
    raw.price ?? raw.salePrice ?? raw.Цена ?? prices.price ?? prices.sale
  );
  const result = {};
  for (const unit of UNITS) {
    result[unit] = finiteNonNegative(
      raw[unit] ??
        raw[`price${unit[0].toUpperCase()}${unit.slice(1)}`] ??
        prices[unit]
    );
  }
  // Если пришла одна цена без единиц — считаем её ценой за штуку.
  if (result.piece === null && generic !== null) {
    result.piece = generic;
  }
  return result;
}

export function hasSalePriceForType(oneCItem = {}, priceTypeId = "") {
  const typeId = cleanText(priceTypeId);
  if (!typeId) return false;
  const byType =
    oneCItem.salePricesByType && typeof oneCItem.salePricesByType === "object"
      ? oneCItem.salePricesByType
      : {};
  const entry = byType[typeId];
  if (!entry || typeof entry !== "object") return false;
  return UNITS.some((unit) => finiteNonNegative(entry[unit]) !== null);
}

export function salePriceForUnit(oneCItem = {}, priceTypeId = "", unit = "piece") {
  const typeId = cleanText(priceTypeId);
  if (!typeId) return null;
  const byType =
    oneCItem.salePricesByType && typeof oneCItem.salePricesByType === "object"
      ? oneCItem.salePricesByType
      : {};
  const entry = byType[typeId];
  if (!entry || typeof entry !== "object") return null;
  return finiteNonNegative(entry[unit]);
}

/**
 * Объединяет виды цен из 1С.
 * Полная замена списка, если items непустой массив.
 */
export function mergeOneCPriceTypes(existing, incomingItems, { receivedAt = new Date().toISOString() } = {}) {
  const next = normalizeOneCPriceTypes(incomingItems);
  if (!next.length && Array.isArray(incomingItems) && incomingItems.length === 0) {
    return { types: [], receivedAt, accepted: 0 };
  }
  if (!next.length) {
    return {
      types: normalizeOneCPriceTypes(existing),
      receivedAt,
      accepted: 0,
    };
  }
  return { types: next, receivedAt, accepted: next.length };
}

/**
 * Пишет продажные цены по виду цен в карточки oneCProducts.
 * items: [{ id, priceTypeId, price? | prices?: { piece, pack, ... } }]
 */
export function mergeSalePricesByType(
  existingProducts,
  incomingItems,
  { receivedAt = new Date().toISOString() } = {}
) {
  const existing = Array.isArray(existingProducts) ? [...existingProducts] : [];
  const byId = new Map(
    existing
      .filter((item) => cleanText(item?.id))
      .map((item) => [String(item.id), { ...item }])
  );
  const accepted = [];
  const rejected = [];

  for (const raw of Array.isArray(incomingItems) ? incomingItems : []) {
    const id = cleanText(raw?.id ?? raw?.oneCId ?? raw?.ref);
    const priceTypeId = cleanText(
      raw?.priceTypeId ?? raw?.priceType ?? raw?.видЦен ?? raw?.ВидЦен
    );
    if (!id) {
      rejected.push({ id: "", reason: "id_missing" });
      continue;
    }
    if (!priceTypeId) {
      rejected.push({ id, reason: "price_type_missing" });
      continue;
    }

    const unitPrices = unitPricesFromPayload(raw);
    if (!UNITS.some((unit) => unitPrices[unit] !== null)) {
      rejected.push({ id, priceTypeId, reason: "sale_price_missing" });
      continue;
    }

    const previous = byId.get(id) || { id };
    const salePricesByType = {
      ...(previous.salePricesByType && typeof previous.salePricesByType === "object"
        ? previous.salePricesByType
        : {}),
    };
    const previousType =
      salePricesByType[priceTypeId] && typeof salePricesByType[priceTypeId] === "object"
        ? salePricesByType[priceTypeId]
        : {};
    const mergedUnits = { ...previousType };
    for (const unit of UNITS) {
      if (unitPrices[unit] !== null) mergedUnits[unit] = unitPrices[unit];
      else if (finiteNonNegative(previousType[unit]) !== null) {
        mergedUnits[unit] = previousType[unit];
      } else {
        mergedUnits[unit] = null;
      }
    }
    const unitsChanged = UNITS.some(
      (unit) => finiteNonNegative(previousType[unit]) !== finiteNonNegative(mergedUnits[unit])
    );
    const stamp = unitsChanged
      ? receivedAt
      : cleanText(previousType.receivedAt || previousType.updatedAt) || receivedAt;
    salePricesByType[priceTypeId] = {
      ...mergedUnits,
      updatedAt: unitsChanged
        ? receivedAt
        : cleanText(previousType.updatedAt) || stamp,
      receivedAt: stamp,
      priceTypeId,
      priceTypeName: cleanText(
        raw?.priceTypeName ?? raw?.priceTypeTitle ?? previousType.priceTypeName
      ),
    };

    const merged = {
      ...previous,
      id,
      code: cleanText(raw?.code || raw?.oneCCode || previous.code),
      name: cleanText(
        raw?.name ||
          raw?.presentation ||
          raw?.description ||
          previous.name ||
          id
      ),
      salePricesByType,
      salePriceUpdatedAt: receivedAt,
      salePriceReceivedAt: receivedAt,
    };
    byId.set(id, merged);
    accepted.push({ id, priceTypeId });
  }

  return {
    products: [...byId.values()],
    accepted,
    rejected,
    receivedAt,
  };
}

/**
 * Канал purchase-prices обновляет и вид «Закупочная», чтобы наценка клиента
 * не держалась за более поздний bulk «Обновить цены» со старым значением.
 */
export function syncPurchasePriceIntoType(
  oneCItem = {},
  priceTypeId = "",
  receivedAt = "",
  priceTypeName = ""
) {
  const typeId = cleanText(priceTypeId);
  const stamp = cleanText(receivedAt);
  const piece = finiteNonNegative(
    oneCItem.purchasePrice ?? oneCItem.purchasePricePiece ?? oneCItem.costPrice
  );
  if (!typeId || !stamp || piece === null) return oneCItem;

  const previousByType =
    oneCItem.salePricesByType && typeof oneCItem.salePricesByType === "object"
      ? oneCItem.salePricesByType
      : {};
  const previousType =
    previousByType[typeId] && typeof previousByType[typeId] === "object"
      ? previousByType[typeId]
      : {};

  return {
    ...oneCItem,
    salePricesByType: {
      ...previousByType,
      [typeId]: {
        ...previousType,
        piece,
        pack: finiteNonNegative(oneCItem.purchasePricePack) ?? previousType.pack ?? null,
        bundle:
          finiteNonNegative(oneCItem.purchasePriceBundle) ?? previousType.bundle ?? null,
        box: finiteNonNegative(oneCItem.purchasePriceBox) ?? previousType.box ?? null,
        pair: finiteNonNegative(oneCItem.purchasePricePair) ?? previousType.pair ?? null,
        meter: finiteNonNegative(oneCItem.purchasePriceMeter) ?? previousType.meter ?? null,
        roll: finiteNonNegative(oneCItem.purchasePriceRoll) ?? previousType.roll ?? null,
        receivedAt: stamp,
        updatedAt: stamp,
        priceTypeId: typeId,
        priceTypeName:
          cleanText(priceTypeName) ||
          cleanText(previousType.priceTypeName) ||
          "Закупочная цена",
      },
    },
  };
}

/**
 * Товары, которым нужна цена выбранного вида для клиентов и витрины.
 * storefrontPricingMode:
 * - price_type → storefrontPriceTypeId (напр. «Розничная»)
 * - purchase_markup → storefrontCostPriceTypeId (напр. «Закупочная») для fresher typed cost
 */
export function buildSalePriceRequirements(
  products = [],
  clientLinks = {},
  {
    storefrontPriceTypeId = "",
    storefrontPricingMode = "price_type",
    storefrontCostPriceTypeId = "",
  } = {}
) {
  const typeIds = new Set();
  for (const link of Object.values(clientLinks || {})) {
    const typeId = cleanText(link?.oneCPriceTypeId);
    if (!typeId) continue;
    const mode = String(link?.defaultPricingMode || "").trim();
    // Нужны и «вид цен», и «закупка/категория + %» (база — тот же вид цен).
    if (
      mode === "one_c_price_type" ||
      mode === "purchase_markup" ||
      !mode
    ) {
      typeIds.add(typeId);
    }
  }

  const storefrontMode =
    String(storefrontPricingMode || "").trim() === "purchase_markup"
      ? "purchase_markup"
      : "price_type";
  const storefrontTypeId =
    storefrontMode === "purchase_markup"
      ? cleanText(storefrontCostPriceTypeId)
      : cleanText(storefrontPriceTypeId);
  if (storefrontTypeId) {
    typeIds.add(storefrontTypeId);
  }
  const catalogCostTypeId = cleanText(storefrontCostPriceTypeId);
  if (catalogCostTypeId) {
    typeIds.add(catalogCostTypeId);
  }

  if (!typeIds.size) return [];

  // Товары из матриц клиентов с этими видами цен + товары витрины + весь каталог для закупки.
  const neededOneCIds = new Set();
  for (const link of Object.values(clientLinks || {})) {
    const typeId = cleanText(link?.oneCPriceTypeId);
    if (!typeId || !typeIds.has(typeId)) continue;
    const mode = String(link?.defaultPricingMode || "").trim();
    if (mode && mode !== "one_c_price_type" && mode !== "purchase_markup") {
      continue;
    }
    if (link?.matrixMode === "all") {
      for (const product of Array.isArray(products) ? products : []) {
        if (product.active === false) continue;
        const oneCId = cleanText(product.oneCId);
        if (oneCId) neededOneCIds.add(oneCId);
      }
      continue;
    }
    const ids = Array.isArray(link?.matrixProductIds) ? link.matrixProductIds : [];
    for (const productId of ids) {
      const product = (Array.isArray(products) ? products : []).find(
        (item) => String(item.id) === String(productId)
      );
      const oneCId = cleanText(product?.oneCId);
      if (oneCId) neededOneCIds.add(oneCId);
    }
  }

  if (storefrontTypeId) {
    for (const product of Array.isArray(products) ? products : []) {
      if (product.active === false) continue;
      if (product.showOnStorefront !== true) continue;
      const oneCId = cleanText(product.oneCId);
      if (oneCId) neededOneCIds.add(oneCId);
    }
  }

  if (catalogCostTypeId) {
    for (const product of Array.isArray(products) ? products : []) {
      if (product.active === false) continue;
      const oneCId = cleanText(product.oneCId);
      if (oneCId) neededOneCIds.add(oneCId);
    }
  }

  const required = [];
  for (const product of Array.isArray(products) ? products : []) {
    if (product.active === false) continue;
    const oneCId = cleanText(product.oneCId);
    if (!oneCId || !neededOneCIds.has(oneCId)) continue;

    const productTypeIds = new Set();
    for (const link of Object.values(clientLinks || {})) {
      const typeId = cleanText(link?.oneCPriceTypeId);
      if (!typeId || !typeIds.has(typeId)) continue;
      const mode = String(link?.defaultPricingMode || "").trim();
      if (mode && mode !== "one_c_price_type" && mode !== "purchase_markup") {
        continue;
      }
      const inMatrix =
        link?.matrixMode === "all" ||
        (Array.isArray(link?.matrixProductIds) &&
          link.matrixProductIds.some(
            (productId) => String(productId) === String(product.id)
          ));
      if (inMatrix) productTypeIds.add(typeId);
    }
    if (storefrontTypeId && product.showOnStorefront === true) {
      productTypeIds.add(storefrontTypeId);
    }
    if (catalogCostTypeId) {
      productTypeIds.add(catalogCostTypeId);
    }

    for (const priceTypeId of productTypeIds) {
      required.push({
        productId: product.id,
        id: oneCId,
        code: cleanText(product.oneCCode || product.code),
        name: cleanText(product.oneCName || product.name),
        displayName: cleanText(product.name),
        priceTypeId,
      });
    }
  }
  return required;
}
