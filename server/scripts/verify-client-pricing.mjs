import assert from "node:assert/strict";
import { normalizeOneCProduct } from "../src/oneCProducts.js";
import {
  calculateMarkupPrice,
  enrichProductWithPurchasePrices,
  normalizeDefaultPricingConfig,
  normalizePersonalPriceConfig,
  purchasePriceForUnit,
  resolveClientProductPricing,
  roundPriceUp,
} from "../src/pricing.js";

const product = {
  id: 7,
  name: "Вакуумный пакет 200×300 мм, 60 мкм (100 шт.)",
  oneCId: "onec-7",
  pieceSize: 1,
  packSize: 100,
  bundleSize: 500,
  pricePiece: 120,
  pricePack: 12000,
  priceBundle: 60000,
  saleUnits: ["piece", "pack"],
};

const oneCItem = normalizeOneCProduct({
  id: "onec-7",
  code: "НФ-00000400",
  name: "Вакуумный пакет 200 x 300мм 60мкм (100)",
  purchasePrice: "83,40",
  purchasePriceUnit: "piece",
  updatedAt: "2026-07-25T07:00:00.000Z",
});

assert.equal(oneCItem.purchasePrice, 83.4);
assert.equal(purchasePriceForUnit(product, oneCItem, "piece"), 83.4);
assert.equal(purchasePriceForUnit(product, oneCItem, "pack"), 8340);
assert.equal(roundPriceUp(104.25), 105);
assert.equal(calculateMarkupPrice(83.4, 25), 105);

const defaults = normalizeDefaultPricingConfig({
  defaultPricingMode: "purchase_markup",
  defaultMarkupPercent: 25,
});
assert.equal(defaults.source, "purchase_markup");
assert.equal(defaults.markupPercent, 25);

const inherited = resolveClientProductPricing(
  product,
  {},
  oneCItem,
  { defaultPricingMode: "purchase_markup", defaultMarkupPercent: 25 }
);
assert.equal(inherited.overrideSource, "inherit");
assert.equal(inherited.source, "purchase_markup");
assert.equal(inherited.markupPercent, 25);
assert.equal(inherited.prices.piece, 105);
assert.equal(inherited.prices.pack, 10425);
assert.equal(inherited.priceSources.piece, "purchase_markup");

const manual = resolveClientProductPricing(
  product,
  { source: "manual", piece: 150, pack: 14500 },
  oneCItem,
  { defaultPricingMode: "purchase_markup", defaultMarkupPercent: 25 }
);
assert.equal(manual.overrideSource, "manual");
assert.equal(manual.source, "manual");
assert.equal(manual.prices.piece, 150);
assert.equal(manual.prices.pack, 14500);
assert.equal(manual.priceSources.piece, "manual");

const individualMarkup = resolveClientProductPricing(
  product,
  { source: "purchase_markup", markupPercent: 10 },
  oneCItem,
  { defaultPricingMode: "purchase_markup", defaultMarkupPercent: 25 }
);
assert.equal(individualMarkup.overrideSource, "purchase_markup");
assert.equal(individualMarkup.markupPercent, 10);
assert.equal(individualMarkup.prices.piece, 92);
assert.equal(individualMarkup.prices.pack, 9174);

const inheritedAgain = resolveClientProductPricing(
  product,
  normalizePersonalPriceConfig({ source: "inherit" }),
  oneCItem,
  { defaultPricingMode: "purchase_markup", defaultMarkupPercent: 25 }
);
assert.equal(inheritedAgain.prices.piece, 105);

const baseDefault = resolveClientProductPricing(
  product,
  {},
  oneCItem,
  { defaultPricingMode: "base", defaultMarkupPercent: 99 }
);
assert.equal(baseDefault.source, "base");
assert.equal(baseDefault.prices.piece, 120);
assert.equal(baseDefault.priceSources.piece, "base");

const missing = resolveClientProductPricing(
  product,
  {},
  null,
  { defaultPricingMode: "purchase_markup", defaultMarkupPercent: 15 }
);
assert.equal(missing.prices.piece, 120);
assert.equal(missing.priceSources.piece, "base_fallback");
assert.equal(missing.prices.pack, 12000);
assert.equal(missing.priceSources.pack, "base_fallback");

const missingNoBase = resolveClientProductPricing(
  { ...product, pricePiece: 0, pricePack: 0, priceBundle: 0 },
  {},
  null,
  { defaultPricingMode: "purchase_markup", defaultMarkupPercent: 15 }
);
assert.equal(missingNoBase.prices.piece, 0);
assert.equal(missingNoBase.priceSources.piece, "purchase_missing");

const directUnits = normalizeOneCProduct({
  id: "onec-direct",
  name: "Товар с отдельными ценами",
  prices: { piece: 10.1, pack: 95.5, bundle: 440.2 },
});
assert.equal(purchasePriceForUnit(product, directUnits, "pack"), 95.5);
assert.equal(calculateMarkupPrice(95.5, 10), 106);

const enriched = enrichProductWithPurchasePrices(product, oneCItem);
assert.equal(enriched.purchasePriceAvailable, true);
assert.equal(enriched.purchasePrices.piece, 83.4);

console.log("Проверка общей наценки клиента и индивидуальных исключений прошла успешно.");
console.log("Приоритет проверен: фиксированная цена -> индивидуальный процент -> общий процент.");
console.log("Округление копеек вверх до целого рубля проверено.");
