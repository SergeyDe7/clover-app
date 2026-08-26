import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createUser,
  findUserByEmail,
  getGlobalState,
  insertOrder,
  setGlobalState,
} from "./db.js";
import { DEFAULT_PRODUCTS, DEFAULT_SETTINGS, EMPTY_LINK } from "./defaults.js";
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
  normalizeStorefrontPricing,
} from "./pricing.js";
import { normalizeExchangeState } from "./exchange.js";
import {
  overlayStorefrontClientLink,
  resolveStorefrontOneCClient,
  STOREFRONT_DEFAULT_COUNTERPARTY_NAME,
} from "./storefrontCounterparty.js";
import {
  getEarliestDeliveryDateIso,
  validateDeliveryDate,
} from "../../src/shared/deliveryDateRules.js";
import {
  CLOVER_PRODUCT_GROUPS as STOREFRONT_PRODUCT_GROUPS,
  canonicalizeProductCategory,
  categoryMatchesFilter,
  subcategoryMatchesFilter,
  facetMatchesFilter,
  sortCloverProductGroups,
} from "../../src/screens/storefront/productGroups.js";
import {
  matchesCatalogPrefixSearch,
  productCatalogSearchHaystack,
} from "../../src/shared/appHelpers.js";
import { normalizeYandexMapsUrl } from "../../src/shared/yandexMaps.js";
import {
  STOREFRONT_DEFAULT_HERO_INTERVAL_SEC,
  STOREFRONT_DEFAULT_HERO_SLIDES,
  STOREFRONT_MAX_HERO_SLIDES,
} from "../../src/screens/storefront/siteCopy.js";

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
    storefrontHeroSlides: normalizeStorefrontHeroSlides(
      settings.storefrontHeroSlides
    ),
    storefrontHeroIntervalSec: normalizeStorefrontHeroIntervalSec(
      settings.storefrontHeroIntervalSec
    ),
    storefrontContactPhone: normalizeStorefrontContactPhone(
      settings.storefrontContactPhone
    ),
    storefrontContactEmail: normalizeStorefrontContactEmail(
      settings.storefrontContactEmail
    ),
    storefrontContactAddress: normalizeStorefrontContactText(
      settings.storefrontContactAddress,
      500
    ),
    storefrontContactHours: normalizeStorefrontContactText(
      settings.storefrontContactHours,
      800
    ),
    storefrontContactNote: normalizeStorefrontContactText(
      settings.storefrontContactNote,
      800
    ),
    storefrontContactMapsUrl: normalizeYandexMapsUrl(
      settings.storefrontContactMapsUrl
    ),
    storefrontContactMapImageUrl: normalizeStorefrontMapImageUrl(
      settings.storefrontContactMapImageUrl
    ),
    storefrontOneCClientId: String(settings.storefrontOneCClientId || "").trim(),
    storefrontOneCClientName:
      String(settings.storefrontOneCClientName || "").trim() ||
      "Интернет магазин Clover",
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

function normalizeStorefrontContactPhone(value) {
  return String(value || "").trim();
}

function normalizeStorefrontContactEmail(value) {
  return String(value || "").trim().slice(0, 254);
}

function normalizeStorefrontContactText(value, max) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

function normalizeStorefrontMapImageUrl(value) {
  const raw = String(value || "").trim();
  if (!/^\/uploads\/storefront-map-[A-Za-z0-9._-]+$/.test(raw)) return "";
  return raw;
}

const HERO_SLIDE_SRC_RE =
  /^\/(?:storefront\/hero-[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)|uploads\/storefront-hero-[A-Za-z0-9._-]+)$/;

export function cloneDefaultHeroSlides() {
  return STOREFRONT_DEFAULT_HERO_SLIDES.map((slide) => ({ ...slide }));
}

export function normalizeStorefrontHeroSlides(value) {
  const list = Array.isArray(value) ? value : [];
  const slides = [];
  const seen = new Set();
  const defaultsBySrc = new Map(
    STOREFRONT_DEFAULT_HERO_SLIDES.map((slide) => [slide.src, slide])
  );
  for (const [index, item] of list.entries()) {
    const src = String(
      item && typeof item === "object" ? item.src : item || ""
    ).trim();
    if (!HERO_SLIDE_SRC_RE.test(src) || seen.has(src)) continue;
    seen.add(src);
    const fallback = defaultsBySrc.get(src);
    let href =
      normalizeStorefrontHeroHref(item?.href) ||
      normalizeStorefrontHeroHref(fallback?.href);
    if (!href && index === 0) href = "/install-app";
    slides.push({
      src,
      alt: String(item?.alt || fallback?.alt || "").trim().slice(0, 120),
      href,
      buttonLabel: normalizeStorefrontHeroButton(
        item?.buttonLabel !== undefined && item?.buttonLabel !== null
          ? item.buttonLabel
          : fallback?.buttonLabel
      ),
    });
    if (slides.length >= STOREFRONT_MAX_HERO_SLIDES) break;
  }
  return slides.length ? slides : cloneDefaultHeroSlides();
}

export function normalizeStorefrontHeroIntervalSec(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return STOREFRONT_DEFAULT_HERO_INTERVAL_SEC;
  return Math.min(60, Math.max(2, Math.round(num)));
}

export function heroSlideUploadUrls(slides) {
  return (Array.isArray(slides) ? slides : [])
    .map((slide) => String(slide?.src || ""))
    .filter((src) => src.startsWith("/uploads/storefront-hero-"));
}

export function normalizeStorefrontHeroButton(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export function normalizeStorefrontHeroHref(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(javascript|data|vbscript):/i.test(raw)) return "";

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      if (host !== "clover-spb.ru" && host !== "localhost") return "";
      raw = `${url.pathname || "/"}${url.search || ""}`;
    } catch {
      return "";
    }
  }

  raw = raw.replace(/^\/vitrina(?=\/|$)/, "") || "/";
  if (!raw.startsWith("/")) {
    const code = raw.slice(0, 80);
    if (!code || /[/?#\s]/.test(code)) return "";
    return `/product/${encodeURIComponent(code)}`;
  }

  if (raw.length > 400) return "";
  if (raw === "/") return "";
  if (!/^\/(product|catalog|contacts|cart|install-app)(\/|$)/.test(raw)) return "";
  if (raw.startsWith("/product/") && raw === "/product/") return "";
  return raw;
}

export const STOREFRONT_SETTING_KEYS = [
  "storefrontPricingMode",
  "storefrontMarkupPercent",
  "storefrontPriceTypeId",
  "storefrontPriceTypeName",
  "storefrontShowOnlyLinked",
  "storefrontHeroTitle",
  "storefrontHeroLead",
  "storefrontHeroSlides",
  "storefrontHeroIntervalSec",
  "storefrontContactPhone",
  "storefrontContactEmail",
  "storefrontContactAddress",
  "storefrontContactHours",
  "storefrontContactNote",
  "storefrontContactMapsUrl",
  "storefrontContactMapImageUrl",
  "storefrontOneCClientId",
  "storefrontOneCClientName",
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
    storefrontHeroSlides: normalizeStorefrontHeroSlides(
      incoming.storefrontHeroSlides !== undefined
        ? incoming.storefrontHeroSlides
        : current.storefrontHeroSlides
    ),
    storefrontHeroIntervalSec: normalizeStorefrontHeroIntervalSec(
      incoming.storefrontHeroIntervalSec !== undefined
        ? incoming.storefrontHeroIntervalSec
        : current.storefrontHeroIntervalSec
    ),
    storefrontContactPhone: normalizeStorefrontContactPhone(
      incoming.storefrontContactPhone ?? current.storefrontContactPhone ?? ""
    ),
    storefrontContactEmail: normalizeStorefrontContactEmail(
      incoming.storefrontContactEmail ?? current.storefrontContactEmail ?? ""
    ),
    storefrontContactAddress: normalizeStorefrontContactText(
      incoming.storefrontContactAddress ?? current.storefrontContactAddress ?? "",
      500
    ),
    storefrontContactHours: normalizeStorefrontContactText(
      incoming.storefrontContactHours ?? current.storefrontContactHours ?? "",
      800
    ),
    storefrontContactNote: normalizeStorefrontContactText(
      incoming.storefrontContactNote ?? current.storefrontContactNote ?? "",
      800
    ),
    storefrontContactMapsUrl: normalizeYandexMapsUrl(
      incoming.storefrontContactMapsUrl ?? current.storefrontContactMapsUrl ?? ""
    ),
    storefrontContactMapImageUrl: normalizeStorefrontMapImageUrl(
      incoming.storefrontContactMapImageUrl ??
        current.storefrontContactMapImageUrl ??
        ""
    ),
    storefrontOneCClientId: String(
      incoming.storefrontOneCClientId ?? current.storefrontOneCClientId ?? ""
    ).trim(),
    storefrontOneCClientName:
      String(
        incoming.storefrontOneCClientName ??
          current.storefrontOneCClientName ??
          ""
      ).trim() || "Интернет магазин Clover",
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

export { findPurchasePriceTypeId };

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
  const storefrontPricing = normalizeStorefrontPricing(product.storefrontPricing);

  for (const unit of SALE_UNITS) {
    const field = unitPriceField(unit);

    if (storefrontPricing.source === "manual") {
      const manual = storefrontPricing[unit];
      if (manual !== null) {
        prices[unit] = manual;
        priceSources[unit] = "storefront_manual";
        continue;
      }
    }

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

    // Выбранный вид цен пуст (часто «Розничная» не выгружена) —
    // считаем от закупки / вида «Закупочная» + наценка витрины.
    {
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
            ? "purchase_markup_fallback"
            : "purchase_markup_from_price_type_fallback";
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
  // На витрине артикул = код 1С; иначе не-CL код Clover; иначе стабильный slug по id
  // (чтобы карточки без 1С не пропадали из каталога при showOnStorefront).
  const publicCode =
    oneCCode ||
    (/^cl-\d+$/i.test(cloverCode) ? "" : cloverCode) ||
    `id-${product.id}`;
  const code = publicCode;

  // На витрине имя = как в матрице/каталоге Clover (не сырое имя 1С).
  const cloverName = String(product.name || "").trim();
  const oneCName = String(oneCItem?.name || product.oneCName || "").trim();

  return {
    id: product.id,
    code,
    cloverCode,
    name: cloverName || oneCName,
    oneCName,
    category: canonicalizeProductCategory(
      String(product.category || "Прочее").trim() || "Прочее"
    ),
    subcategory: String(product.subcategory || "").trim(),
    facet: String(product.facet || "").trim(),
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
    pieceOrderMultiple: (() => {
      const raw = Number(product.pieceOrderMultiple);
      if (!Number.isFinite(raw) || raw < 1) return 1;
      return Math.max(1, Math.floor(raw));
    })(),
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
    .filter((product) => product.name);
}

/** Группы витрины — как Opticom, канон из productGroups.js. */
const CLOVER_PRODUCT_GROUPS = STOREFRONT_PRODUCT_GROUPS;

function buildCategories(products) {
  const counts = new Map();
  for (const product of products) {
    const name = canonicalizeProductCategory(product.category || "Прочее");
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  for (const name of CLOVER_PRODUCT_GROUPS) {
    if (!counts.has(name)) counts.set(name, 0);
  }
  // На витрине показываем все канонические группы (в т.ч. пустые), как у Opticom.
  return sortCloverProductGroups([
    ...CLOVER_PRODUCT_GROUPS,
    ...counts.keys(),
  ]).map((name) => ({ name, count: counts.get(name) || 0 }));
}

export function getPublicCatalog({
  category = "",
  subcategory = "",
  facet = "",
  q = "",
} = {}) {
  const settings = getStorefrontSettings(
    getGlobalState("settings", DEFAULT_SETTINGS)
  );
  const priceTypes = normalizeOneCPriceTypes(
    getGlobalState("oneCPriceTypes", [])
  );
  let products = listStorefrontProducts(settings);

  const categoryFilter = String(category || "").trim();
  if (categoryFilter) {
    products = products.filter((product) =>
      categoryMatchesFilter(product.category, categoryFilter)
    );
  }

  const subcategoryFilter = String(subcategory || "").trim();
  if (subcategoryFilter) {
    products = products.filter((product) =>
      subcategoryMatchesFilter(product.subcategory, subcategoryFilter)
    );
  }

  const facetFilter = String(facet || "").trim();
  if (facetFilter) {
    products = products.filter((product) =>
      facetMatchesFilter(product.facet, facetFilter)
    );
  }

  const query = String(q || "").trim();
  if (query) {
    products = products.filter((product) =>
      matchesCatalogPrefixSearch(productCatalogSearchHaystack(product), query)
    );
  }

  const selectedType =
    priceTypes.find((item) => item.id === settings.storefrontPriceTypeId) ||
    null;

  // Не отдаём pricingMode/markupPercent наружу: по % можно восстановить закупку.
  const priceType =
    settings.storefrontPricingMode === "price_type"
      ? selectedType
        ? { id: selectedType.id, name: selectedType.name }
        : settings.storefrontPriceTypeId
          ? {
              id: settings.storefrontPriceTypeId,
              name:
                settings.storefrontPriceTypeName ||
                settings.storefrontPriceTypeId,
            }
          : null
      : null;

  return {
    categories: buildCategories(listStorefrontProducts(settings)),
    products,
    priceType,
    site: buildPublicSite(settings),
  };
}

export function buildPublicSite(settingsInput) {
  const settings = getStorefrontSettings(settingsInput);
  return {
    heroTitle: settings.storefrontHeroTitle || "",
    heroLead: settings.storefrontHeroLead || "",
    heroSlides: settings.storefrontHeroSlides,
    heroIntervalSec: settings.storefrontHeroIntervalSec,
    contactPhone: settings.storefrontContactPhone || "",
    contactEmail: settings.storefrontContactEmail || "",
    contactAddress: settings.storefrontContactAddress || "",
    contactHours: settings.storefrontContactHours || "",
    contactNote: settings.storefrontContactNote || "",
    contactMapsUrl: settings.storefrontContactMapsUrl || "",
    contactMapImageUrl: settings.storefrontContactMapImageUrl || "",
  };
}

export function getPublicSite() {
  return buildPublicSite(getGlobalState("settings", DEFAULT_SETTINGS));
}

export function getPublicProductByCode(code) {
  const needle = String(code || "").trim().toLocaleLowerCase("ru-RU");
  if (!needle) return null;
  const settings = getStorefrontSettings(
    getGlobalState("settings", DEFAULT_SETTINGS)
  );
  return (
    listStorefrontProducts(settings).find((product) => {
      const aliases = [
        product.code,
        product.oneCCode,
        product.cloverCode,
        `id-${product.id}`,
        String(product.id),
      ]
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
      companyName: STOREFRONT_DEFAULT_COUNTERPARTY_NAME,
      contactName: "Гость витрины",
      phone: "",
      email: STOREFRONT_GUEST_EMAIL,
    },
  });
}

function linkStorefrontGuestToOneC(guestId, settings) {
  const counterpart = resolveStorefrontOneCClient({
    settings,
    oneCClients: getGlobalState("oneCClients", []),
  });
  const links = { ...(getGlobalState("clientLinks", {}) || {}) };
  const next = overlayStorefrontClientLink(
    { source: "storefront", guest: true },
    { ...EMPTY_LINK, ...(links[guestId] || {}) },
    counterpart
  );
  const prev = links[guestId] || {};
  const same =
    String(prev.oneCId || "") === String(next.oneCId || "") &&
    String(prev.oneCName || "") === String(next.oneCName || "") &&
    String(prev.oneCCode || "") === String(next.oneCCode || "") &&
    Boolean(prev.matched1C) === Boolean(next.matched1C);
  if (!same) {
    links[guestId] = next;
    setGlobalState("clientLinks", links);
  }
  return next;
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
    const pieceMultiple = (() => {
      const rawMultiple = Number(product.pieceOrderMultiple);
      if (!Number.isFinite(rawMultiple) || rawMultiple < 1) return 1;
      return Math.max(1, Math.floor(rawMultiple));
    })();
    if (unit === "piece" && pieceMultiple > 1 && quantity % pieceMultiple !== 0) {
      const error = new Error(
        `Для «${product.name}» количество в шт. должно быть кратно ${pieceMultiple} (сейчас ${quantity}).`
      );
      error.status = 400;
      error.code = "INVALID_QTY_STEP";
      throw error;
    }
    const unitPrice = Number(product.prices?.[unit]) || 0;
    const multiplier = unitSize(stored, unit);
    const lineTotal = unitPrice * quantity;

    lines.push({
      id: randomUUID(),
      productId: product.id,
      code: product.code,
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
  linkStorefrontGuestToOneC(guest.id, settings);
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
    storefrontPricingMode: settings.storefrontPricingMode,
    storefrontMarkupPercent: settings.storefrontMarkupPercent,
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
