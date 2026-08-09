import assert from "node:assert/strict";
import {
  buildAllPriceRequirements,
  buildOrderPriceRequirements,
  buildPriceRequest,
  isTestDatabase,
  mergePurchasePrices,
  purchasePriceFreshness,
  validatePriceRequirements,
} from "../src/oneCPriceSync.js";

const products = [
  {
    id: 1,
    name: "Перчатки Нитриловые чёрные XL",
    active: true,
    oneCId: "d7e2aad0-e049-11e9-9ba2-9cda3efabffd",
    oneCCode: "НФ-00000742",
    oneCName: "Перчатки Нитриловые чёрные XL (100 шт.)",
  },
  {
    id: 2,
    name: "Банка суповая 500 мл",
    active: true,
    oneCId: "4426db82-2b81-11e9-9b9e-9cda3efabffd",
    oneCCode: "НФ-00000252",
    oneCName: "Банка суповая 500 мл Перинт (50/400)",
  },
];
const clientLinks = {
  client1: {
    matrixMode: "all",
    defaultPricingMode: "purchase_markup",
    defaultMarkupPercent: 25,
    personalPrices: {
      2: { source: "manual", piece: 80 },
    },
  },
};
const order = {
  id: "order-1",
  number: "CL-TEST-1",
  clientId: "client1",
  status: "Новый",
  items: [
    { productId: 1, quantity: 1, unit: "piece" },
    { productId: 2, quantity: 1, unit: "piece" },
  ],
};

assert.equal(isTestDatabase("test"), true);
assert.equal(isTestDatabase("VLAVKA"), false);

const orderRequirements = buildOrderPriceRequirements(
  order,
  products,
  clientLinks.client1
);
assert.equal(orderRequirements.length, 1);
assert.equal(orderRequirements[0].id, products[0].oneCId);

const allRequirements = buildAllPriceRequirements(
  products,
  clientLinks,
  [order]
);
assert.equal(allRequirements.length, 1);

const receivedAt = "2026-07-25T08:00:00.000Z";
const merged = mergePurchasePrices(
  [
    {
      id: products[0].oneCId,
      code: products[0].oneCCode,
      name: products[0].oneCName,
    },
  ],
  [
    {
      id: products[0].oneCId,
      purchasePrice: "83,40",
      purchasePriceUnit: "piece",
    },
    {
      id: "not-linked",
      purchasePrice: 10,
    },
  ],
  {
    database: "TEST",
    receivedAt,
    allowedIds: new Set(products.map((item) => item.oneCId)),
  }
);
assert.equal(merged.accepted.length, 1);
assert.equal(merged.rejected.length, 1);
assert.equal(merged.accepted[0].purchasePrice, 83.4);
assert.equal(merged.accepted[0].purchasePriceReceivedAt, receivedAt);
assert.equal(merged.accepted[0].purchasePriceSourceDatabase, "TEST");

assert.throws(
  () =>
    mergePurchasePrices([], [], {
      database: "VLAVKA",
    }),
  /только из базы 1С TEST/
);

const now = Date.parse("2026-07-25T08:05:00.000Z");
const fresh = purchasePriceFreshness(merged.accepted[0], {
  now,
  maxAgeMs: 10 * 60 * 1000,
});
assert.equal(fresh.fresh, true);

const stale = purchasePriceFreshness(merged.accepted[0], {
  now: Date.parse("2026-07-25T08:20:01.000Z"),
  maxAgeMs: 10 * 60 * 1000,
});
assert.equal(stale.fresh, false);
assert.equal(stale.reason, "stale");

assert.equal(
  validatePriceRequirements(orderRequirements, merged.products, {
    now,
    maxAgeMs: 10 * 60 * 1000,
  }).length,
  0
);
assert.equal(
  validatePriceRequirements(orderRequirements, [], {
    now,
    maxAgeMs: 10 * 60 * 1000,
  })[0].reason,
  "missing"
);

const request = buildPriceRequest({
  scope: "next-order",
  order,
  products,
  clientLinks,
  maxAgeMs: 10 * 60 * 1000,
});
assert.equal(request.database, "TEST");
assert.equal(request.items.length, 1);
assert.equal(request.maxAgeSeconds, 600);

// Витрина в режиме Закупочная+% должна попадать в purchase-price-request (scope=all).
const storefrontOnlyId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const selectedLinks = {
  client1: {
    matrixMode: "selected",
    matrixProductIds: [1],
    defaultPricingMode: "purchase_markup",
    defaultMarkupPercent: 25,
  },
};
const storefrontProducts = [
  ...products,
  {
    id: 3,
    name: "Только витрина",
    active: true,
    showOnStorefront: true,
    oneCId: storefrontOnlyId,
    oneCCode: "НФ-STORE",
  },
];
const withoutStorefront = buildAllPriceRequirements(
  storefrontProducts,
  selectedLinks,
  []
);
assert.equal(
  withoutStorefront.some((item) => item.id === storefrontOnlyId),
  false
);
const withStorefront = buildAllPriceRequirements(
  storefrontProducts,
  selectedLinks,
  [],
  { includeStorefrontPurchaseMarkup: true }
);
assert.equal(
  withStorefront.some((item) => item.id === storefrontOnlyId),
  true
);

console.log("Проверка запроса и приёма свежих закупочных цен из 1С TEST прошла успешно.");
console.log("Проверено: только нужные товары, запрет VLAVKA, контроль давности и фиксированное исключение.");
