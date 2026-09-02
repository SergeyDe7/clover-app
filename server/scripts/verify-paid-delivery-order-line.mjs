/**
 * Targeted verify: paid delivery 500₽ propagates to order items and 1C payload.
 * Also covers server-side fee authority, threshold flips, addendum recalculation,
 * PUT total/amount sync, and storefront create wiring via ensureSpbDeliveryOnOrder.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLOVER_DELIVERY_LINE_ID,
  FREE_DELIVERY_MIN_TOTAL,
  PAID_DELIVERY_FEE,
  applyClientSpbDeliveryFees,
  applyDeliveryLineSync,
  ensureSpbDeliveryOnOrder,
  getSpbDeliveryFee,
  isCloverDeliveryLine,
  orderItemsMoneyTotal,
  resolveClientSpbDelivery,
} from "../src/deliveryFee.js";
import { build1CPayload } from "../src/exchange.js";
import { roundPriceUp } from "../src/pricing.js";
import { mergeOrderCatalogItems } from "../../src/shared/orderAddendum.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const DELIVERY_UUID = "abd0ca3a-8033-11f1-abc0-b42e99f8290d";
const DELIVERY_CODE = "НФ-00002361";

const deliveryMeta = {
  deliveryOneCId: DELIVERY_UUID,
  deliveryOneCCode: DELIVERY_CODE,
  deliveryOneCName: "Доставка",
};

const goodsLine = {
  productId: "p1",
  name: "Товар",
  lineTotal: 1000,
  quantity: 1,
  unit: "piece",
  unitPrice: 1000,
  oneCId: "prod-uuid-1",
};

const baseOrder = {
  id: "o-paid",
  number: "1001",
  clientId: "c1",
  customerName: "Test Client",
  address: "СПб, тест",
  firstDeliveryDate: "2026-09-01",
  items: [goodsLine],
  customItems: [],
};

function deliveryLines(order) {
  return (order.items || []).filter(isCloverDeliveryLine);
}

function itemsMoneyTotal(order) {
  return (order.items || []).reduce(
    (sum, item) => sum + (Number(item.lineTotal) || 0),
    0
  );
}

assert.equal(FREE_DELIVERY_MIN_TOTAL, 5000);
assert.equal(PAID_DELIVERY_FEE, 500);
assert.equal(getSpbDeliveryFee(4999), 500);
assert.equal(getSpbDeliveryFee(5000), 0);

// A. ORDER BELOW THRESHOLD
const paid = applyClientSpbDeliveryFees([{ ...baseOrder }], {
  showPrices: true,
  oneCProducts: [],
  ...deliveryMeta,
})[0];

assert.equal(orderItemsMoneyTotal(paid), 1000, "goods subtotal without delivery");
assert.equal(paid.deliveryFee, PAID_DELIVERY_FEE);
const paidLines = deliveryLines(paid);
assert.equal(paidLines.length, 1, "exactly one delivery line");
assert.equal(paidLines[0].quantity, 1);
assert.equal(paidLines[0].unitPrice, 500);
assert.equal(paidLines[0].lineTotal, 500);
assert.equal(paidLines[0].productId, CLOVER_DELIVERY_LINE_ID);
assert.equal(itemsMoneyTotal(paid), 1500, "items total includes delivery once");

// B. ORDER AT/ABOVE THRESHOLD
const free = applyClientSpbDeliveryFees(
  [
    {
      ...baseOrder,
      id: "o-free",
      items: [{ ...goodsLine, lineTotal: 5000, unitPrice: 5000 }],
    },
  ],
  { showPrices: true, ...deliveryMeta }
)[0];

assert.equal(free.deliveryFee, 0);
assert.equal(deliveryLines(free).length, 0);
assert.equal(itemsMoneyTotal(free), 5000);

// C. CART / THRESHOLD CROSSING
const below = resolveClientSpbDelivery(
  { items: [{ ...goodsLine, lineTotal: 4800, unitPrice: 4800 }], customItems: [] },
  { showPrices: true }
);
const above = resolveClientSpbDelivery(
  { items: [{ ...goodsLine, lineTotal: 5200, unitPrice: 5200 }], customItems: [] },
  { showPrices: true }
);
assert.equal(below.deliveryFee, PAID_DELIVERY_FEE);
assert.equal(above.deliveryFee, 0);

// D. SERVER SECURITY — client fake fees ignored
const fakeZero = applyClientSpbDeliveryFees(
  [{ ...baseOrder, deliveryFee: 0, deliveryNote: "free hack" }],
  { showPrices: true, ...deliveryMeta }
)[0];
assert.equal(fakeZero.deliveryFee, PAID_DELIVERY_FEE, "fake zero corrected");
assert.equal(deliveryLines(fakeZero).length, 1);

const fakeHigh = applyClientSpbDeliveryFees(
  [{ ...baseOrder, deliveryFee: 9999, deliveryNote: "inflate" }],
  { showPrices: true, ...deliveryMeta }
)[0];
assert.equal(fakeHigh.deliveryFee, PAID_DELIVERY_FEE, "fake high corrected");
assert.equal(deliveryLines(fakeHigh).length, 1);
assert.equal(deliveryLines(fakeHigh)[0].lineTotal, PAID_DELIVERY_FEE);

const fakeOnFree = applyClientSpbDeliveryFees(
  [
    {
      ...baseOrder,
      items: [{ ...goodsLine, lineTotal: 6000, unitPrice: 6000 }],
      deliveryFee: 500,
    },
  ],
  { showPrices: true, ...deliveryMeta }
)[0];
assert.equal(fakeOnFree.deliveryFee, 0, "fake paid on free order cleared");
assert.equal(deliveryLines(fakeOnFree).length, 0);

// E. PERSISTENCE / RE-SAVE — no duplicate line
const firstSave = applyClientSpbDeliveryFees([{ ...baseOrder }], {
  showPrices: true,
  ...deliveryMeta,
})[0];
const resaved = applyClientSpbDeliveryFees([firstSave], {
  showPrices: true,
  ...deliveryMeta,
})[0];
assert.equal(deliveryLines(resaved).length, 1, "re-save must not duplicate delivery");
assert.equal(resaved.deliveryFee, PAID_DELIVERY_FEE);
const staffResaved = applyDeliveryLineSync([resaved], deliveryMeta)[0];
assert.equal(deliveryLines(staffResaved).length, 1, "staff sync must not duplicate");

// F. DOZAKAZ — same orderId, shared server recalc, no duplicate line
const openOrder = applyClientSpbDeliveryFees([{ ...baseOrder }], {
  showPrices: true,
  ...deliveryMeta,
})[0];
const mergedItems = mergeOrderCatalogItems(openOrder.items, [
  { productId: "p1", unit: "piece", quantity: 5, unitPrice: 1000, lineTotal: 5000 },
]);
const afterAddendum = applyClientSpbDeliveryFees(
  [
    {
      ...openOrder,
      id: openOrder.id,
      items: mergedItems.filter((item) => !isCloverDeliveryLine(item)),
      deliveryFee: 0,
    },
  ],
  { showPrices: true, ...deliveryMeta }
)[0];
assert.equal(afterAddendum.id, openOrder.id, "same orderId");
assert.equal(afterAddendum.deliveryFee, 0, "addendum crossed free threshold");
assert.equal(deliveryLines(afterAddendum).length, 0, "no delivery line when free");
assert.ok(orderItemsMoneyTotal(afterAddendum) >= FREE_DELIVERY_MIN_TOTAL);

const afterSmallAddendum = applyClientSpbDeliveryFees(
  [
    {
      ...openOrder,
      id: openOrder.id,
      items: mergeOrderCatalogItems(
        openOrder.items.filter((item) => !isCloverDeliveryLine(item)),
        [{ productId: "p2", unit: "piece", quantity: 1, unitPrice: 100, lineTotal: 100 }]
      ),
      deliveryFee: 0,
    },
  ],
  { showPrices: true, ...deliveryMeta }
)[0];
assert.equal(afterSmallAddendum.id, openOrder.id);
assert.equal(afterSmallAddendum.deliveryFee, PAID_DELIVERY_FEE);
assert.equal(deliveryLines(afterSmallAddendum).length, 1, "exactly one delivery line");

// G. 1C payload
const payload = build1CPayload({
  order: paid,
  products: [{ id: "p1", name: "Товар", oneCId: "prod-uuid-1" }],
  clientLinks: {
    c1: { matched1C: true, oneCId: "client-uuid", oneCName: "Client" },
  },
  deliverySettings: deliveryMeta,
});

assert.equal(payload.items.length, 2, "goods + delivery in 1C payload");
const payloadDelivery = payload.items.find(
  (row) => row.cloverProductId === CLOVER_DELIVERY_LINE_ID
);
assert.ok(payloadDelivery, "delivery row in 1C payload");
assert.equal(payloadDelivery.quantity, 1);
assert.equal(payloadDelivery.unitPrice, 500);
assert.equal(payloadDelivery.lineTotal, 500);
assert.equal(payloadDelivery.oneCId, DELIVERY_UUID);
assert.equal(payloadDelivery.code, DELIVERY_CODE);
assert.equal(payload.totals.amount, 1500);
const deliveryRows = payload.items.filter(
  (row) => row.cloverProductId === CLOVER_DELIVERY_LINE_ID
);
assert.equal(deliveryRows.length, 1, "1C payload has single delivery row");

// H. PRICED CUSTOM ITEMS — same formula as server orderMoneyTotal after delivery sync
function moneyTotalLikePut(order) {
  const itemsTotal = (Array.isArray(order?.items) ? order.items : []).reduce(
    (sum, item) => sum + (Number(item?.lineTotal) || 0),
    0
  );
  const customTotal = (Array.isArray(order?.customItems) ? order.customItems : []).reduce(
    (sum, item) =>
      sum + (Number(item?.unitPrice) || 0) * (Number(item?.quantity) || 0),
    0
  );
  return roundPriceUp(itemsTotal + customTotal) ?? 0;
}

/** Mirrors PUT /api/state/orders client branch: fee sync then persist total/amount. */
function persistLikeClientPut(orders) {
  return applyClientSpbDeliveryFees(orders, {
    showPrices: true,
    oneCProducts: [],
    ...deliveryMeta,
  }).map((order) => {
    const grandTotal = moneyTotalLikePut(order);
    return { ...order, total: grandTotal, amount: grandTotal };
  });
}

// CASE 1: goods 1000 + custom 500 + delivery 500 = 2000
const withCustom = applyClientSpbDeliveryFees(
  [
    {
      ...baseOrder,
      id: "o-custom-paid",
      customItems: [
        { id: "c1", name: "Вне матрицы", quantity: 1, unitPrice: 500, unit: "шт." },
      ],
    },
  ],
  { showPrices: true, ...deliveryMeta }
)[0];
assert.equal(orderItemsMoneyTotal(withCustom), 1500, "threshold base includes custom");
assert.equal(withCustom.deliveryFee, PAID_DELIVERY_FEE);
assert.equal(deliveryLines(withCustom).length, 1);
assert.equal(moneyTotalLikePut(withCustom), 2000, "total includes goods+custom+delivery");
const persistedCustom = {
  ...withCustom,
  total: moneyTotalLikePut(withCustom),
  amount: moneyTotalLikePut(withCustom),
};
assert.equal(persistedCustom.total, 2000);
assert.equal(persistedCustom.amount, 2000);

// CASE 2: goods + custom reach free threshold → delivery 0
const customFree = applyClientSpbDeliveryFees(
  [
    {
      ...baseOrder,
      id: "o-custom-free",
      items: [{ ...goodsLine, lineTotal: 4500, unitPrice: 4500 }],
      customItems: [
        { id: "c2", name: "Добор", quantity: 1, unitPrice: 600, unit: "шт." },
      ],
    },
  ],
  { showPrices: true, ...deliveryMeta }
)[0];
assert.equal(orderItemsMoneyTotal(customFree), 5100);
assert.equal(customFree.deliveryFee, 0);
assert.equal(deliveryLines(customFree).length, 0);
assert.equal(moneyTotalLikePut(customFree), 5100);
assert.equal(
  ({ ...customFree, total: moneyTotalLikePut(customFree) }).total,
  5100
);

// CASE 3: re-save — custom kept, no duplicate delivery, total not reduced
const customResaved = applyClientSpbDeliveryFees([persistedCustom], {
  showPrices: true,
  ...deliveryMeta,
})[0];
assert.equal(customResaved.customItems.length, 1);
assert.equal(Number(customResaved.customItems[0].unitPrice), 500);
assert.equal(deliveryLines(customResaved).length, 1);
const resaveTotal = moneyTotalLikePut(customResaved);
assert.equal(resaveTotal, 2000, "resave must keep monetary total");
assert.ok(resaveTotal >= persistedCustom.total, "resave must not shrink total");

// I. PUT-LIKE PERSIST — fake fee cannot control stored totals
const putPaid = persistLikeClientPut([
  { ...baseOrder, id: "o-put-paid", deliveryFee: 0, total: 1, amount: 1 },
])[0];
assert.equal(putPaid.deliveryFee, PAID_DELIVERY_FEE);
assert.equal(deliveryLines(putPaid).length, 1);
assert.equal(putPaid.total, 1500);
assert.equal(putPaid.amount, 1500);

const putFree = persistLikeClientPut([
  {
    ...baseOrder,
    id: "o-put-free",
    items: [{ ...goodsLine, lineTotal: 6000, unitPrice: 6000 }],
    deliveryFee: 9999,
    total: 9999,
    amount: 9999,
  },
])[0];
assert.equal(putFree.deliveryFee, 0);
assert.equal(deliveryLines(putFree).length, 0);
assert.equal(putFree.total, 6000);
assert.equal(putFree.amount, 6000);

// J. STOREFRONT CREATE PATH — same ensureSpbDeliveryOnOrder + total/amount + response fee
function persistLikeStorefrontCreate(draft) {
  const orderWithDelivery = ensureSpbDeliveryOnOrder(draft, deliveryMeta, []);
  const itemsSum = (orderWithDelivery.items || []).reduce(
    (sum, line) => sum + (Number(line.lineTotal) || 0),
    0
  );
  const grandTotal = roundPriceUp(itemsSum) ?? 0;
  const order = {
    ...orderWithDelivery,
    total: grandTotal,
    amount: grandTotal,
  };
  return {
    saved: order,
    response: {
      id: order.id,
      number: order.number,
      total: order.total,
      deliveryFee: order.deliveryFee || 0,
      status: order.status,
      firstDeliveryDate: order.firstDeliveryDate,
    },
  };
}

const sfPaidDraft = {
  ...baseOrder,
  id: "o-sf-paid",
  source: "storefront",
  total: 1000,
  amount: 1000,
  deliveryFee: 0,
};
const sfPaid = persistLikeStorefrontCreate(sfPaidDraft);
assert.equal(sfPaid.saved.deliveryFee, PAID_DELIVERY_FEE);
assert.equal(deliveryLines(sfPaid.saved).length, 1);
assert.equal(sfPaid.saved.total, 1500);
assert.equal(sfPaid.saved.amount, 1500);
assert.equal(sfPaid.response.deliveryFee, PAID_DELIVERY_FEE);
assert.equal(sfPaid.response.total, sfPaid.saved.total);
assert.equal(deliveryLines(sfPaid.saved)[0].oneCId, DELIVERY_UUID);
assert.equal(deliveryLines(sfPaid.saved)[0].oneCCode || deliveryLines(sfPaid.saved)[0].code, DELIVERY_CODE);

const sfFree = persistLikeStorefrontCreate({
  ...baseOrder,
  id: "o-sf-free",
  source: "storefront",
  items: [{ ...goodsLine, lineTotal: 5000, unitPrice: 5000 }],
  total: 5000,
  amount: 5000,
  deliveryFee: 500,
});
assert.equal(sfFree.saved.deliveryFee, 0);
assert.equal(deliveryLines(sfFree.saved).length, 0);
assert.equal(sfFree.saved.total, 5000);
assert.equal(sfFree.response.deliveryFee, 0);
assert.equal(sfFree.response.total, 5000);

// K. SOURCE WIRING — PUT map + storefront create must stay connected
const serverSource = readFileSync(path.join(root, "server/src/server.js"), "utf8");
const storefrontSource = readFileSync(
  path.join(root, "server/src/storefrontPublic.js"),
  "utf8"
);
const putOrdersIdx = serverSource.indexOf('app.put("/api/state/orders"');
assert.ok(putOrdersIdx >= 0, "PUT /api/state/orders missing");
const nextRouteIdx = serverSource.indexOf("\napp.", putOrdersIdx + 1);
const putSlice = serverSource.slice(
  putOrdersIdx,
  nextRouteIdx > putOrdersIdx ? nextRouteIdx : putOrdersIdx + 12000
);
assert.match(
  putSlice,
  /applyClientSpbDeliveryFees\([\s\S]*?\)\.map\(\(order\) => \{[\s\S]*?orderMoneyTotal\(order\)/,
  "PUT client path must persist orderMoneyTotal after delivery sync"
);
assert.match(
  putSlice,
  /applyDeliveryLineSync\([\s\S]*?\)\.map\(\(order\) => \{[\s\S]*?orderMoneyTotal\(order\)/,
  "PUT staff path must persist orderMoneyTotal after delivery sync"
);
assert.match(
  storefrontSource,
  /ensureSpbDeliveryOnOrder\([\s\S]*?deliveryOneCId: settings\.deliveryOneCId/,
  "storefront create must call ensureSpbDeliveryOnOrder with settings refs"
);
assert.match(
  storefrontSource,
  /deliveryFee: order\.deliveryFee \|\| 0/,
  "storefront create response must expose deliveryFee"
);
assert.match(
  storefrontSource,
  /roundPriceUp\(itemsSum\)/,
  "storefront create total must use roundPriceUp"
);

console.log("verify-paid-delivery-order-line: ok");
