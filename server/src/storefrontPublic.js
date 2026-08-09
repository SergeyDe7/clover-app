import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createUser,
  findUserByEmail,
  getGlobalState,
  insertOrder,
  setGlobalState,
} from "./db.js";
import { DEFAULT_PRODUCTS, DEFAULT_SETTINGS } from "./defaults.js";
import { normalizeOneCProducts } from "./oneCProducts.js";
import { normalizeOneCPriceTypes } from "./oneCSalePrices.js";
import {
  resolveTypedSalePrice,
  UNITS as SALE_UNITS,
  unitLabel,
  unitPriceField,
  unitSize,
  purchasePriceForUnit,
  calculateMarkupPrice,
  pickPurchaseMarkupCost,
} from "./pricing.js";
import { normalizeExchangeState } from "./exchange.js";
import {
  getEarliestDeliveryDateIso,
  validateDeliveryDate,
} from "../../src/shared/deliveryDateRules.js";

const STOREFRONT_GUEST_EMAIL = "storefront-guest@clover.local";

export function getStorefrontSettings(settingsInput) {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(settingsInput && typeof settingsInput === "object" ? settingsInput : {}),
  };
  return {
    storefrontPricingMode: normalizeStorefrontPricingMode(
      settings.storefrontPricingMode
    ),
    storefrontMarkupPercent: normalizeStorefrontMarkupPercent(
      settings.storefrontMarkupPercent
    ),
    storefrontPriceTypeId: String(settings.storefrontPriceTypeId || "").trim(),
    storefrontPriceTypeName: String(settings.storefrontPriceTypeName || "").trim(),
    storefrontShowOnlyLinked: settings.storefrontShowOnlyLinked !== false,
    storefrontHeroTitle: String(settings.storefrontHeroTitle || "").trim(),
    storefrontHeroLead: String(settings.storefrontHeroLead || "").trim(),
  };
}

function normalizeStorefrontPricingMode(value) {
  return String(value || "").trim() === "purchase_markup"
    ? "purchase_markup"
    : "price_type";
}

function normalizeStorefrontMarkupPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(1000, Math.round(num * 100) / 100);
}

const STOREFRONT_SETTING_KEYS = [
  "storefrontPricingMode",
  "storefrontMarkupPercent",
  "storefrontPriceTypeId",
  "storefrontPriceTypeName",
  "storefrontShowOnlyLinked",
  "storefrontHeroTitle",
  "storefrontHeroLead",
];

/** Менеджер не может менять поля витрины через общий PUT settings. */
export function stripStorefrontSettings(settings = {}) {
  const next = { ...(settings && typeof settings === "object" ? settings : {}) };
  for (const key of STOREFRONT_SETTING_KEYS) {
    delete next[key];
  }
  return next;
}

export function mergeStorefrontSettings(baseSettings, patch = {}) {
  const current = {
    ...DEFAULT_SETTINGS,
    ...(baseSettings && typeof baseSettings === "object" ? baseSettings : {}),
  };
  const incoming = patch && typeof patch === "object" ? patch : {};
  return {
    ...current,
    storefrontPricingMode: normalizeStorefrontPricingMode(
      incoming.storefrontPricingMode ?? current.storefrontPricingMode
    ),
    storefrontMarkupPercent: normalizeStorefrontMarkupPercent(
      incoming.storefrontMarkupPercent ?? current.storefrontMarkupPercent
    ),
    storefrontPriceTypeId: String(
      incoming.storefrontPriceTypeId ?? current.storefrontPriceTypeId ?? ""
    ).trim(),
    storefrontPriceTypeName: String(
      incoming.storefrontPriceTypeName ?? current.storefrontPriceTypeName ?? ""
    ).trim(),
    storefrontShowOnlyLinked:
      incoming.storefrontShowOnlyLinked !== undefined
        ? Boolean(incoming.storefrontShowOnlyLinked)
        : current.storefrontShowOnlyLinked !== false,
    storefrontHeroTitle: String(
      incoming.storefrontHeroTitle ?? current.storefrontHeroTitle ?? ""
    ).trim(),
    storefrontHeroLead: String(
      incoming.storefrontHeroLead ?? current.storefrontHeroLead ?? ""
    ).trim(),
  };
}

function oneCByIdMap(items) {
  return new Map(
    normalizeOneCProducts(items).map((item) => [String(item.id), item])
  );
}

function findPurchasePriceTypeId(priceTypes = []) {
  const list = normalizeOneCPriceTypes(priceTypes);
  const found = list.find((item) => /закупочн/i.test(String(item?.name || "")));
  return found ? String(found.id) : "";
}

function publicSaleUnits(product = {}) {
  const raw = Array.isArray(product.saleUnits) ? product.saleUnits : [];
  const units = raw.filter((unit) => SALE_UNITS.includes(unit));
  return units.length ? units : ["piece"];
}

function buildStorefrontPrices(product, oneCItem, storeSettings, costPriceTypeId = "") {
  const prices = {};
  const priceSources = {};
  const mode = storeSettings.storefrontPricingMode;
  const markupPercent = storeSettings.storefrontMarkupPercent;
  const priceTypeId = storeSettings.storefrontPriceTypeId;

  for (const unit of SALE_UNITS) {
    const field = unitPriceField(unit);

    if (mode === "purchase_markup") {
      const purchase = oneCItem
        ? purchasePriceForUnit(product, oneCItem, unit)
        : null;
      const { cost, costKind } = pickPurchaseMarkupCost(
        product,
        oneCItem,
        costPriceTypeId,
        unit,
        purchase
      );
      const calculated = calculateMarkupPrice(cost, markupPercent);
      if (calculated !== null) {
        prices[unit] = calculated;
        priceSources[unit] =
          costKind === "purchase"
            ? "purchase_markup"
            : "purchase_markup_from_price_type";
        continue;
      }
      const fallback = Math.max(0, Number(product[field]) || 0);
      prices[unit] = fallback;
      priceSources[unit] = fallback > 0 ? "base_fallback" : "purchase_missing";
      continue;
    }

    if (priceTypeId) {
      const typed = resolveTypedSalePrice(product, oneCItem, priceTypeId, unit);
      if (typed) {
        prices[unit] = typed.price;
        priceSources[unit] = typed.source;
        continue;
      }
    }
    const fallback = Math.max(0, Number(product[field]) || 0);
    prices[unit] = fallback;
    priceSources[unit] = fallback > 0 ? "base" : "missing";
  }
  return { prices, priceSources };
}

function toPublicProduct(product, oneCItem, storeSettings, costPriceTypeId = "") {
  const { prices, priceSources } = buildStorefrontPrices(
    product,
    oneCItem,
    storeSettings,
    costPriceTypeId
  );
  const details =
    product.storefrontDetails && typeof product.storefrontDetails === "object"
      ? product.storefrontDetails
      : {};

  const cloverCode = String(product.code || "").trim();
  const oneCCode = String(product.oneCCode || oneCItem?.code || "").trim();
  // На витрине артикул = код 1С; внутренний CL- оставляем как запасной ключ URL.
  const code = oneCCode || cloverCode;

  return {
    id: product.id,
    code,
    cloverCode,
    name: String(product.name || "").trim(),
    category: String(product.category || "Прочее").trim() || "Прочее",
    imageUrl: String(product.imageUrl || "").trim(),
    certificateUrl: String(product.certificateUrl || "").trim(),
    oneCId: String(product.oneCId || "").trim(),
    oneCCode,
    saleUnits: publicSaleUnits(product),
    prices,
    priceSources,
    details: {
      description: String(details.description || "").trim(),
      composition: String(details.composition || "").trim(),
      characteristics: String(details.characteristics || "").trim(),
    },
    pieceSize: Number(product.pieceSize) || 1,
    packSize: Number(product.packSize) || 1,
    bundleSize: Number(product.bundleSize) || 1,
    boxSize: Number(product.boxSize) || 1,
  };
}

function listStorefrontProducts(storeSettings) {
  const products = getGlobalState("products", DEFAULT_PRODUCTS);
  const oneCProducts = getGlobalState("oneCProducts", []);
  const priceTypes = getGlobalState("oneCPriceTypes", []);
  const byId = oneCByIdMap(oneCProducts);
  const costPriceTypeId = findPurchasePriceTypeId(priceTypes);

  return (Array.isArray(products) ? products : [])
    .filter((product) => product?.active !== false)
    .filter((product) => product?.showOnStorefront === true)
    .filter((product) => {
      if (!storeSettings.storefrontShowOnlyLinked) return true;
      return Boolean(String(product.oneCId || "").trim());
    })
    .map((product) => {
      const oneCItem = byId.get(String(product.oneCId || "")) || null;
      return toPublicProduct(product, oneCItem, storeSettings, costPriceTypeId);
    })
    .filter((product) => product.code && product.name);
}

/** Группы как в ЛК Clover (порядок CATEGORY_KEYWORD_RULES). */
const CLOVER_PRODUCT_GROUPS = [
  "Перчатки",
  "Пакеты и пленка",
  "Уборка",
  "Упаковка",
  "Одноразовая продукция",
  "Канцтовары",
  "Бытовая химия",
  "Текстиль",
];

function sortCloverProductGroups(names) {
  const order = new Map(CLOVER_PRODUCT_GROUPS.map((name, index) => [name, index]));
  return [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))].sort(
    (a, b) => {
      if (a === "Прочее") return 1;
      if (b === "Прочее") return -1;
      const ai = order.has(a) ? order.get(a) : 1000;
      const bi = order.has(b) ? order.get(b) : 1000;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b, "ru");
    }
  );
}

function buildCategories(products) {
  const counts = new Map();
  for (const product of products) {
    const name = product.category || "Прочее";
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  // Всегда отдаём канонические группы Clover (даже с 0), плюс фактические «лишние».
  for (const name of CLOVER_PRODUCT_GROUPS) {
    if (!counts.has(name)) counts.set(name, 0);
  }
  return sortCloverProductGroups([...counts.keys()])
    .filter((name) => (counts.get(name) || 0) > 0 || CLOVER_PRODUCT_GROUPS.includes(name))
    .filter((name) => (counts.get(name) || 0) > 0)
    .map((name) => ({ name, count: counts.get(name) || 0 }));
}

export function getPublicCatalog({ category = "", q = "" } = {}) {
  const settings = getStorefrontSettings(
    getGlobalState("settings", DEFAULT_SETTINGS)
  );
  const priceTypes = normalizeOneCPriceTypes(
    getGlobalState("oneCPriceTypes", [])
  );
  let products = listStorefrontProducts(settings);

  const categoryFilter = String(category || "").trim();
  if (categoryFilter) {
    products = products.filter(
      (product) =>
        product.category.toLocaleLowerCase("ru-RU") ===
        categoryFilter.toLocaleLowerCase("ru-RU")
    );
  }

  const query = String(q || "").trim().toLocaleLowerCase("ru-RU");
  if (query) {
    products = products.filter((product) =>
      `${product.name} ${product.code} ${product.cloverCode || ""} ${product.oneCCode || ""} ${product.category}`
        .toLocaleLowerCase("ru-RU")
        .includes(query)
    );
  }

  const selectedType =
    priceTypes.find((item) => item.id === settings.storefrontPriceTypeId) ||
    null;

  return {
    categories: buildCategories(listStorefrontProducts(settings)),
    products,
    pricingMode: settings.storefrontPricingMode,
    markupPercent: settings.storefrontMarkupPercent,
    priceType: selectedType
      ? { id: selectedType.id, name: selectedType.name }
      : settings.storefrontPriceTypeId
        ? {
            id: settings.storefrontPriceTypeId,
            name:
              settings.storefrontPriceTypeName ||
              settings.storefrontPriceTypeId,
          }
        : null,
    site: {
      heroTitle: settings.storefrontHeroTitle || "",
      heroLead: settings.storefrontHeroLead || "",
    },
  };
}

export function getPublicProductByCode(code) {
  const needle = String(code || "").trim().toLocaleLowerCase("ru-RU");
  if (!needle) return null;
  const settings = getStorefrontSettings(
    getGlobalState("settings", DEFAULT_SETTINGS)
  );
  return (
    listStorefrontProducts(settings).find((product) => {
      const aliases = [product.code, product.oneCCode, product.cloverCode]
        .map((value) => String(value || "").trim().toLocaleLowerCase("ru-RU"))
        .filter(Boolean);
      return aliases.includes(needle);
    }) || null
  );
}

export function ensureStorefrontGuestUser() {
  const existing = findUserByEmail(STOREFRONT_GUEST_EMAIL);
  if (existing) return existing;
  return createUser({
    email: STOREFRONT_GUEST_EMAIL,
    passwordHash: `!storefront-guest!${randomUUID()}`,
    role: "client",
    emailVerified: true,
    approvalStatus: "approved",
    profile: {
      companyName: "Заказы с сайта",
      contactName: "Гость витрины",
      phone: "",
      email: STOREFRONT_GUEST_EMAIL,
    },
  });
}

function makeOrderNumber() {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `WS-${datePart.slice(2)}-${timePart}-${ms}`;
}

export const storefrontOrderSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(160).optional().default(""),
  phone: z.string().trim().min(6).max(50),
  email: z.union([z.string().trim().email().max(200), z.literal("")]).default(""),
  address: z.string().trim().min(5).max(500),
  comment: z.string().trim().max(2000).optional().default(""),
  firstDeliveryDate: z.string().trim().max(20).optional().default(""),
  items: z
    .array(
      z.object({
        productId: z.union([z.string(), z.number()]),
        code: z.string().trim().max(80).optional().default(""),
        unit: z.enum(SALE_UNITS).default("piece"),
        qty: z.coerce.number().int().positive().max(100000),
      })
    )
    .min(1)
    .max(200),
});

export function createStorefrontOrder(input, { notify } = {}) {
  const parsed = storefrontOrderSchema.parse(input);
  const settings = getStorefrontSettings(
    getGlobalState("settings", DEFAULT_SETTINGS)
  );
  const catalog = listStorefrontProducts(settings);
  const storedProducts = getGlobalState("products", DEFAULT_PRODUCTS);
  const rawById = new Map(
    (Array.isArray(storedProducts) ? storedProducts : []).map((product) => [
      String(product.id),
      product,
    ])
  );
  const byId = new Map(catalog.map((product) => [String(product.id), product]));
  const byCode = new Map();
  for (const product of catalog) {
    for (const alias of [product.code, product.oneCCode, product.cloverCode]) {
      const key = String(alias || "")
        .trim()
        .toLocaleLowerCase("ru-RU");
      if (key && !byCode.has(key)) byCode.set(key, product);
    }
  }

  let firstDeliveryDate = String(parsed.firstDeliveryDate || "").trim();
  if (!firstDeliveryDate) {
    firstDeliveryDate = getEarliestDeliveryDateIso();
  }
  const dateCheck = validateDeliveryDate(firstDeliveryDate);
  if (!dateCheck.ok) {
    const error = new Error(dateCheck.message || "Некорректная дата доставки.");
    error.status = 400;
    error.code = "INVALID_DELIVERY_DATE";
    throw error;
  }

  const lines = [];
  for (const raw of parsed.items) {
    const product =
      byId.get(String(raw.productId)) ||
      byCode.get(String(raw.code || "").trim().toLocaleLowerCase("ru-RU"));
    if (!product) {
      const error = new Error(`Товар не найден: ${raw.code || raw.productId}`);
      error.status = 400;
      error.code = "PRODUCT_NOT_FOUND";
      throw error;
    }
    const unit = SALE_UNITS.includes(raw.unit) ? raw.unit : "piece";
    if (!product.saleUnits.includes(unit)) {
      const error = new Error(
        `Единица «${unitLabel(unit)}» недоступна для ${product.code}.`
      );
      error.status = 400;
      error.code = "INVALID_UNIT";
      throw error;
    }

    const oneCId = String(product.oneCId || "").trim();
    if (!oneCId) {
      const error = new Error(
        `Товар «${product.name}» не связан с 1С — заказ с сайта недоступен.`
      );
      error.status = 400;
      error.code = "PRODUCT_NOT_LINKED";
      throw error;
    }

    const stored = rawById.get(String(product.id)) || {};
    const quantity = raw.qty;
    const unitPrice = Number(product.prices?.[unit]) || 0;
    const multiplier = unitSize(stored, unit);
    const lineTotal = unitPrice * quantity;

    lines.push({
      id: randomUUID(),
      productId: product.id,
      code: product.code,
      oneCCode: String(product.oneCCode || "").trim(),
      name: product.name,
      category: product.category || stored.category || "",
      unit,
      quantity,
      multiplier,
      unitPrice,
      lineTotal,
      oneCId,
      oneCCode: String(product.oneCCode || stored.oneCCode || "").trim(),
      oneCName: String(stored.oneCName || product.name || "").trim(),
      pieceSize: Number(stored.pieceSize || product.pieceSize) || 1,
      packSize: Number(stored.packSize || product.packSize) || 1,
      bundleSize: Number(stored.bundleSize || product.bundleSize) || 1,
      boxSize: Number(stored.boxSize || product.boxSize) || 1,
      priceSource: "storefront",
    });
  }

  const total = lines.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0);
  const guest = ensureStorefrontGuestUser();
  const createdAt = new Date().toISOString();
  const orderId = randomUUID();
  const number = makeOrderNumber();
  const address = parsed.address;
  const clientCommentParts = [
    "Оформлен на сайте (витрина).",
    parsed.comment ? `Комментарий: ${parsed.comment}` : "",
    `Контакт: ${parsed.contactName}`,
    `Тел.: ${parsed.phone}`,
    parsed.email ? `Email: ${parsed.email}` : "",
  ].filter(Boolean);

  const order = {
    id: orderId,
    externalId: orderId,
    number,
    status: "Новый",
    source: "storefront",
    guest: true,
    clientId: guest.id,
    customerName: parsed.companyName || parsed.contactName || "Гость сайта",
    customerContact: parsed.contactName,
    customerPhone: parsed.phone,
    customerEmail: parsed.email || "",
    address,
    deliveryAddress: address,
    firstDeliveryDate,
    managerComment: "",
    internalNote: "",
    clientComment: clientCommentParts.join("\n"),
    comment: parsed.comment || "",
    history: [
      {
        type: "order.created",
        label: "Заказ создан с сайта",
        actor: parsed.contactName || "Гость сайта",
        createdAt,
      },
    ],
    exchange: normalizeExchangeState({ status: "not_sent" }),
    items: lines,
    customItems: [],
    total,
    amount: total,
    createdAt,
    updatedAt: createdAt,
    storefrontPriceTypeId: settings.storefrontPriceTypeId,
    storefrontPriceTypeName: settings.storefrontPriceTypeName,
  };

  insertOrder(order, guest.id);

  if (typeof notify === "function") notify(order);

  return {
    id: order.id,
    number: order.number,
    total: order.total,
    status: order.status,
    firstDeliveryDate: order.firstDeliveryDate,
  };
}

export function saveStorefrontPriceType({ id = "", name = "" } = {}) {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...getGlobalState("settings", DEFAULT_SETTINGS),
    storefrontPriceTypeId: String(id || "").trim(),
    storefrontPriceTypeName: String(name || "").trim(),
  };
  setGlobalState("settings", settings);
  return getStorefrontSettings(settings);
}
