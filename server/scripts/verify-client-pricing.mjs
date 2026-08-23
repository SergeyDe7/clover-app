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
import {
  mergeSalePricesByType,
  syncPurchasePriceIntoType,
} from "../src/oneCSalePrices.js";

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
assert.equal(roundPriceUp(104.25), 104.25);
assert.equal(calculateMarkupPrice(83.4, 25), 104.25);

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
assert.equal(inherited.prices.piece, 104.25);
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
assert.equal(individualMarkup.prices.piece, 91.74);
assert.equal(individualMarkup.prices.pack, 9174);

const inheritedAgain = resolveClientProductPricing(
  product,
  normalizePersonalPriceConfig({ source: "inherit" }),
  oneCItem,
  { defaultPricingMode: "purchase_markup", defaultMarkupPercent: 25 }
);
assert.equal(inheritedAgain.prices.piece, 104.25);

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

// Клиентская цена — свой % или вид цен, не витрина закупка+60%.
const clientFive = resolveClientProductPricing(
  { ...product, pricePiece: 0, pricePack: 0, priceBundle: 0 },
  {},
  oneCItem,
  { defaultPricingMode: "purchase_markup", defaultMarkupPercent: 5 }
);
assert.equal(clientFive.prices.piece, roundPriceUp(83.4 * 1.05));
assert.notEqual(clientFive.prices.piece, roundPriceUp(83.4 * 1.6));

// Наценка % от вида цен «Закупочная» (когда purchasePrice в номенклатуре пустой).
const typedPurchaseBase = {
  ...oneCItem,
  purchasePrice: null,
  salePricesByType: {
    "type-zakup": { piece: 65.47, pack: null, bundle: null, box: null, pair: null, roll: null },
  },
};
const markupFromType = resolveClientProductPricing(
  { ...product, pricePiece: 0, pricePack: 0 },
  {},
  typedPurchaseBase,
  {
    defaultPricingMode: "purchase_markup",
    defaultMarkupPercent: 5,
    oneCPriceTypeId: "type-zakup",
  }
);
assert.equal(markupFromType.prices.piece, 68.74);
assert.equal(markupFromType.priceSources.piece, "purchase_markup_from_price_type");
assert.equal(markupFromType.prices.pack, 6874.35);

// Свежий вид «Закупочная» побеждает более старый purchase (кнопка «Обновить цены»).
const stalePurchaseFreshType = {
  ...oneCItem,
  purchasePrice: 65.47,
  purchasePriceReceivedAt: "2026-08-07T19:04:41.608Z",
  purchasePriceUpdatedAt: "2026-08-07T19:04:41.608Z",
  salePricesByType: {
    "type-zakup": {
      piece: 100,
      pack: null,
      bundle: null,
      box: null,
      pair: null,
      roll: null,
      receivedAt: "2026-08-08T18:57:27.353Z",
      updatedAt: "2026-08-08T18:57:27.353Z",
    },
  },
};
const fresherTyped = resolveClientProductPricing(
  { ...product, pricePiece: 0, pricePack: 0 },
  {},
  stalePurchaseFreshType,
  {
    defaultPricingMode: "purchase_markup",
    defaultMarkupPercent: 5,
    oneCPriceTypeId: "type-zakup",
  }
);
assert.equal(fresherTyped.prices.piece, 105);
assert.equal(fresherTyped.priceSources.piece, "purchase_markup_from_price_type");

// Более свежий purchase по-прежнему важнее устаревшего вида цен.
const freshPurchaseStaleType = {
  ...stalePurchaseFreshType,
  purchasePrice: 70,
  purchasePriceReceivedAt: "2026-08-08T20:00:00.000Z",
  purchasePriceUpdatedAt: "2026-08-08T20:00:00.000Z",
  salePricesByType: {
    "type-zakup": {
      piece: 100,
      pack: null,
      bundle: null,
      box: null,
      pair: null,
      roll: null,
      receivedAt: "2026-08-08T18:57:27.353Z",
      updatedAt: "2026-08-08T18:57:27.353Z",
    },
  },
};
const fresherPurchase = resolveClientProductPricing(
  { ...product, pricePiece: 0, pricePack: 0 },
  {},
  freshPurchaseStaleType,
  {
    defaultPricingMode: "purchase_markup",
    defaultMarkupPercent: 5,
    oneCPriceTypeId: "type-zakup",
  }
);
assert.equal(fresherPurchase.prices.piece, 73.5);
assert.equal(fresherPurchase.priceSources.piece, "purchase_markup");

const directUnits = normalizeOneCProduct({
  id: "onec-direct",
  name: "Товар с отдельными ценами",
  prices: { piece: 10.1, pack: 95.5, bundle: 440.2 },
});
assert.equal(purchasePriceForUnit(product, directUnits, "pack"), 95.5);
assert.equal(calculateMarkupPrice(95.5, 10), 105.05);

const enriched = enrichProductWithPurchasePrices(product, oneCItem);
assert.equal(enriched.purchasePriceAvailable, true);
assert.equal(enriched.purchasePrices.piece, 83.4);

const typedZakupOnly = {
  id: "onec-typed-zakup",
  name: "Только вид Закупочная",
  purchasePrice: null,
  purchasePricePiece: null,
  salePricesByType: {
    "type-zakup": {
      piece: 44.2,
      pack: null,
      bundle: null,
      box: null,
      pair: null,
      roll: null,
      priceTypeName: "",
    },
  },
};
const enrichedFromType = enrichProductWithPurchasePrices(
  { ...product, purchasePrices: {} },
  typedZakupOnly,
  "type-zakup"
);
assert.equal(enrichedFromType.purchasePrices.piece, 44.2);
assert.equal(enrichedFromType.purchasePriceAvailable, true);

// Категория цен 1С: в карточке товара цену не задали — берём шт из вида цен,
// упаковку = шт × packSize.
const typedOneC = {
  ...oneCItem,
  salePricesByType: {
    "type-opt": { piece: 50, pack: null, bundle: null, box: null, pair: null, roll: null },
  },
};
const emptyCatalog = {
  ...product,
  pricePiece: 0,
  pricePack: 0,
  priceBundle: 0,
  priceBox: 0,
  pricePair: 0,
  priceRoll: 0,
};
const fromType = resolveClientProductPricing(
  emptyCatalog,
  {},
  typedOneC,
  { defaultPricingMode: "one_c_price_type", oneCPriceTypeId: "type-opt" }
);
assert.equal(fromType.prices.piece, 50);
assert.equal(fromType.priceSources.piece, "one_c_price_type");
assert.equal(fromType.prices.pack, 5000);
assert.equal(fromType.priceSources.pack, "one_c_price_type_from_piece");

const baseEmptyWithType = resolveClientProductPricing(
  emptyCatalog,
  {},
  typedOneC,
  { defaultPricingMode: "base", oneCPriceTypeId: "type-opt" }
);
assert.equal(baseEmptyWithType.prices.piece, 50);
assert.equal(baseEmptyWithType.priceSources.piece, "one_c_price_type");
assert.equal(baseEmptyWithType.prices.pack, 5000);
assert.equal(baseEmptyWithType.priceSources.pack, "one_c_price_type_from_piece");

// Повторная выгрузка того же вида цен не должна сдвигать receivedAt —
// иначе старая «Закупочная» из «Обновить цены» бьёт свежий purchase-prices.
const restampBase = [
  {
    id: "onec-7",
    salePricesByType: {
      "type-zakup": {
        piece: 99,
        receivedAt: "2026-08-13T15:16:12.757Z",
        updatedAt: "2026-08-13T15:16:12.757Z",
      },
    },
  },
];
const restampSame = mergeSalePricesByType(
  restampBase,
  [{ id: "onec-7", priceTypeId: "type-zakup", price: 99 }],
  { receivedAt: "2026-08-14T10:00:00.000Z" }
);
assert.equal(
  restampSame.products[0].salePricesByType["type-zakup"].receivedAt,
  "2026-08-13T15:16:12.757Z"
);
const restampChanged = mergeSalePricesByType(
  restampBase,
  [{ id: "onec-7", priceTypeId: "type-zakup", price: 110 }],
  { receivedAt: "2026-08-14T10:00:00.000Z" }
);
assert.equal(
  restampChanged.products[0].salePricesByType["type-zakup"].receivedAt,
  "2026-08-14T10:00:00.000Z"
);
assert.equal(restampChanged.products[0].salePricesByType["type-zakup"].piece, 110);

const syncedZakup = syncPurchasePriceIntoType(
  {
    id: "onec-7",
    purchasePrice: 100,
    salePricesByType: {
      "type-zakup": {
        piece: 99,
        receivedAt: "2026-08-13T15:16:12.757Z",
        updatedAt: "2026-08-13T15:16:12.757Z",
      },
    },
  },
  "type-zakup",
  "2026-08-13T18:00:00.000Z",
  "Закупочная цена"
);
assert.equal(syncedZakup.salePricesByType["type-zakup"].piece, 100);
assert.equal(
  syncedZakup.salePricesByType["type-zakup"].receivedAt,
  "2026-08-13T18:00:00.000Z"
);
const afterPurchaseSync = resolveClientProductPricing(
  { ...product, pricePiece: 0, pricePack: 0 },
  {},
  syncedZakup,
  {
    defaultPricingMode: "purchase_markup",
    defaultMarkupPercent: 5,
    oneCPriceTypeId: "type-zakup",
  }
);
assert.equal(afterPurchaseSync.prices.piece, 105);

console.log("Проверка общей наценки клиента и индивидуальных исключений прошла успешно.");
console.log("Приоритет проверен: фиксированная цена -> индивидуальный процент -> общий процент.");
console.log("Цены с копейками (без округления вверх до рубля) проверены.");
console.log("Пустая цена в карточке → цена за шт из категории цен 1С (упаковка = шт × внутри).");
