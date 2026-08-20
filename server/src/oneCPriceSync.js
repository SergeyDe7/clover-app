import {
  normalizeOneCProduct,
  normalizeOneCProducts,
} from "./oneCProducts.js";
import {
  hasPurchasePrice,
  normalizeDefaultPricingConfig,
  normalizePersonalPriceConfig,
} from "./pricing.js";

const DEFAULT_PRICE_MAX_AGE_MS = 10 * 60 * 1000;
export const TEST_DATABASE_NAME = "TEST";

function cleanText(value) {
  return String(value ?? "").trim();
}

function finitePositive(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function priceMaxAgeMs(value = process.env.ONE_C_PRICE_MAX_AGE_MINUTES) {
  const minutes = finitePositive(value, DEFAULT_PRICE_MAX_AGE_MS / 60000);
  return Math.max(60_000, Math.min(24 * 60 * 60 * 1000, minutes * 60_000));
}

export function normalizeOneCDatabaseName(value) {
  return cleanText(value).toLocaleUpperCase("ru-RU");
}

export function isTestDatabase(value) {
  return normalizeOneCDatabaseName(value) === TEST_DATABASE_NAME;
}

/** Prod-контур: явный флаг. Без него в allowlist остаётся только TEST. */
export function isProdExchangeEnabled(
  value = process.env.ONEC_PROD_EXCHANGE_ENABLED
) {
  return String(value || "false").toLowerCase() === "true";
}

/**
 * Список имён баз 1С для pull/ACK/цен.
 * TEST всегда сохраняется. Другие — только при ONEC_PROD_EXCHANGE_ENABLED=true.
 */
export function parseAllowedOneCDatabases(
  envValue = process.env.ONEC_ALLOWED_DATABASES
) {
  const parsed = String(envValue || TEST_DATABASE_NAME)
    .split(/[,;\s]+/)
    .map((item) => normalizeOneCDatabaseName(item))
    .filter(Boolean);
  const allowed = new Set(parsed.length ? parsed : [TEST_DATABASE_NAME]);
  allowed.add(TEST_DATABASE_NAME);
  if (!isProdExchangeEnabled()) {
    return [TEST_DATABASE_NAME];
  }
  return [...allowed];
}

export function isAllowedOneCDatabase(value) {
  const database = normalizeOneCDatabaseName(value);
  if (!database) return false;
  return parseAllowedOneCDatabases().includes(database);
}

export function defaultExchangeDatabase(
  value = process.env.ONEC_DEFAULT_EXCHANGE_DATABASE
) {
  const preferred = normalizeOneCDatabaseName(value || TEST_DATABASE_NAME);
  if (preferred && isAllowedOneCDatabase(preferred)) {
    return preferred;
  }
  return TEST_DATABASE_NAME;
}

export function publicOneCExchangeStatus() {
  return {
    prodEnabled: isProdExchangeEnabled(),
    allowedDatabases: parseAllowedOneCDatabases(),
    defaultDatabase: defaultExchangeDatabase(),
    testDatabase: TEST_DATABASE_NAME,
  };
}

export function extractOneCDatabase(req = {}) {
  return normalizeOneCDatabaseName(
    req.headers?.["x-clover-database"] ??
      req.body?.database ??
      req.query?.database
  );
}

export function purchasePricingRequired(product = {}, rawLink = {}) {
  const personal = normalizePersonalPriceConfig(
    rawLink?.personalPrices?.[String(product.id)] ??
      rawLink?.personalPrices?.[product.id] ??
      {}
  );
  if (personal.source === "purchase_markup") return true;
  if (personal.source === "manual") return false;
  return normalizeDefaultPricingConfig(rawLink).source === "purchase_markup";
}

function orderProductIds(order = {}) {
  return new Set(
    (Array.isArray(order.items) ? order.items : [])
      .map((item) => cleanText(item.productId ?? item.id))
      .filter(Boolean)
  );
}

function matrixIncludesProduct(rawLink = {}, productId) {
  if (rawLink.matrixMode === "all") return true;
  if (rawLink.matrixMode !== "selected") return false;
  return (Array.isArray(rawLink.matrixProductIds) ? rawLink.matrixProductIds : [])
    .map(String)
    .includes(String(productId));
}

function productReference(product = {}) {
  return {
    productId: product.id,
    id: cleanText(product.oneCId),
    code: cleanText(product.oneCCode || product.oneCMatchCode),
    name: cleanText(product.oneCName || product.oneCMatchName || product.name),
    displayName: cleanText(product.name),
  };
}

export function buildOrderPriceRequirements(order, products, rawLink = {}) {
  const selectedIds = orderProductIds(order);
  return (Array.isArray(products) ? products : [])
    .filter((product) => selectedIds.has(String(product.id)))
    .filter((product) => purchasePricingRequired(product, rawLink))
    .map(productReference);
}

export function buildAllPriceRequirements(
  products,
  clientLinks = {},
  orders = [],
  { includeStorefrontPurchaseMarkup = false, includeAllCatalog = false } = {}
) {
  const required = new Map();
  const sourceProducts = Array.isArray(products) ? products : [];

  if (includeAllCatalog) {
    for (const product of sourceProducts) {
      if (product.active === false || !cleanText(product.oneCId)) continue;
      required.set(String(product.oneCId), productReference(product));
    }
  } else {
    for (const product of sourceProducts) {
      if (product.active === false || !cleanText(product.oneCId)) continue;
      const isRequired = Object.values(clientLinks || {}).some(
        (link) =>
          matrixIncludesProduct(link, product.id) &&
          purchasePricingRequired(product, link)
      );
      if (isRequired) required.set(String(product.oneCId), productReference(product));
    }
  }

  for (const order of Array.isArray(orders) ? orders : []) {
    const link = clientLinks?.[order.clientId] || {};
    for (const item of buildOrderPriceRequirements(order, sourceProducts, link)) {
      if (item.id) required.set(item.id, item);
    }
  }

  if (includeStorefrontPurchaseMarkup) {
    for (const product of sourceProducts) {
      if (product.active === false) continue;
      if (product.showOnStorefront !== true) continue;
      const oneCId = cleanText(product.oneCId);
      if (!oneCId) continue;
      required.set(oneCId, productReference(product));
    }
  }

  return [...required.values()];
}

function parsedTimestamp(value) {
  const timestamp = Date.parse(cleanText(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function purchasePriceFreshness(
  oneCItem,
  { now = Date.now(), maxAgeMs = priceMaxAgeMs(), expectedDatabase = "" } = {}
) {
  if (!oneCItem || !hasPurchasePrice(oneCItem)) {
    return { fresh: false, reason: "missing", ageMs: null, timestamp: "" };
  }

  const timestamp =
    oneCItem.purchasePriceReceivedAt ||
    oneCItem.purchasePriceUpdatedAt ||
    oneCItem.updatedAt ||
    "";
  const time = parsedTimestamp(timestamp);
  if (time === null) {
    return { fresh: false, reason: "timestamp_missing", ageMs: null, timestamp: "" };
  }

  const ageMs = Math.max(0, Number(now) - time);
  if (ageMs > maxAgeMs) {
    return { fresh: false, reason: "stale", ageMs, timestamp };
  }

  const sourceDatabase = normalizeOneCDatabaseName(
    oneCItem.purchasePriceSourceDatabase
  );
  const expected = normalizeOneCDatabaseName(expectedDatabase);
  if (expected) {
    if (sourceDatabase && sourceDatabase !== expected) {
      return { fresh: false, reason: "wrong_database", ageMs, timestamp };
    }
  } else if (sourceDatabase && !isAllowedOneCDatabase(sourceDatabase)) {
    return { fresh: false, reason: "wrong_database", ageMs, timestamp };
  }

  return { fresh: true, reason: "fresh", ageMs, timestamp };
}

export function validatePriceRequirements(
  requirements,
  oneCProducts,
  options = {}
) {
  const byId = new Map(
    normalizeOneCProducts(oneCProducts).map((item) => [String(item.id), item])
  );
  const issues = [];

  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    if (!requirement.id) {
      issues.push({ ...requirement, reason: "not_linked" });
      continue;
    }
    const item = byId.get(String(requirement.id));
    const freshness = purchasePriceFreshness(item, options);
    if (!freshness.fresh) {
      issues.push({
        ...requirement,
        reason: freshness.reason,
        ageMs: freshness.ageMs,
        purchasePriceUpdatedAt: freshness.timestamp,
      });
    }
  }

  return issues;
}

export function mergePurchasePrices(
  existingProducts,
  incomingItems,
  {
    receivedAt = new Date().toISOString(),
    database = TEST_DATABASE_NAME,
    allowedIds = null,
  } = {}
) {
  if (!isAllowedOneCDatabase(database)) {
    throw new Error(
      isProdExchangeEnabled()
        ? `Закупочные цены принимаются только из разрешённых баз 1С: ${parseAllowedOneCDatabases().join(", ")}.`
        : "Закупочные цены разрешено принимать только из базы 1С TEST (prod-контур выключен)."
    );
  }

  const allowed = allowedIds
    ? new Set([...allowedIds].map((value) => String(value)))
    : null;
  const existing = normalizeOneCProducts(existingProducts);
  const byId = new Map(existing.map((item) => [String(item.id), item]));
  const accepted = [];
  const rejected = [];

  for (const rawItem of Array.isArray(incomingItems) ? incomingItems : []) {
    const id = cleanText(rawItem?.id ?? rawItem?.oneCId ?? rawItem?.ref);
    if (!id || (allowed && !allowed.has(id))) {
      rejected.push({ id, reason: id ? "not_requested" : "id_missing" });
      continue;
    }

    const previous = byId.get(id) || {};
    const normalized = normalizeOneCProduct({
      ...previous,
      ...rawItem,
      id,
      code: rawItem?.code || rawItem?.oneCCode || previous.code,
      name:
        rawItem?.name ||
        rawItem?.presentation ||
        rawItem?.description ||
        previous.name ||
        id,
    });

    if (!hasPurchasePrice(normalized)) {
      rejected.push({ id, reason: "purchase_price_missing" });
      continue;
    }

    const merged = {
      ...previous,
      ...normalized,
      purchasePriceSourceUpdatedAt:
        cleanText(rawItem?.purchasePriceUpdatedAt ?? rawItem?.priceUpdatedAt) ||
        previous.purchasePriceSourceUpdatedAt ||
        "",
      purchasePriceUpdatedAt: receivedAt,
      purchasePriceReceivedAt: receivedAt,
      purchasePriceSourceDatabase:
        normalizeOneCDatabaseName(database) || TEST_DATABASE_NAME,
    };
    byId.set(id, merged);
    accepted.push(merged);
  }

  const sourceDatabase =
    normalizeOneCDatabaseName(database) || TEST_DATABASE_NAME;

  return {
    products: [...byId.values()],
    accepted,
    rejected,
    receivedAt,
    database: sourceDatabase,
  };
}

export function buildPriceRequest({
  scope = "next-order",
  order = null,
  products = [],
  clientLinks = {},
  orders = [],
  maxAgeMs = priceMaxAgeMs(),
  database = TEST_DATABASE_NAME,
  includeStorefrontPurchaseMarkup = false,
  includeAllCatalog = false,
} = {}) {
  const requirements =
    scope === "all"
      ? buildAllPriceRequirements(products, clientLinks, orders, {
          includeStorefrontPurchaseMarkup,
          includeAllCatalog,
        })
      : order
        ? buildOrderPriceRequirements(
            order,
            products,
            clientLinks?.[order.clientId] || {}
          )
        : [];

  return {
    ok: true,
    database: normalizeOneCDatabaseName(database) || TEST_DATABASE_NAME,
    scope,
    maxAgeSeconds: Math.round(maxAgeMs / 1000),
    order: order
      ? { id: order.id, number: order.number || "" }
      : null,
    items: requirements,
  };
}
