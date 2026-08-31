/**
 * Targeted verify: paid delivery 500₽ propagates to order items and 1C payload.
 */
import assert from "node:assert/strict";
import {
  CLOVER_DELIVERY_LINE_ID,
  PAID_DELIVERY_FEE,
  applyClientSpbDeliveryFees,
  applyDeliveryLineSync,
  isCloverDeliveryLine,
  orderItemsMoneyTotal,
} from "../src/deliveryFee.js";
import { build1CPayload } from "../src/exchange.js";

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

// TEST 1: goods 1000 + paid delivery 500
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

// TEST 2: free delivery — no 500 line
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

// TEST 3: repeated save — no duplicate delivery line
const firstSave = applyClientSpbDeliveryFees([{ ...baseOrder }], {
  showPrices: true,
  ...deliveryMeta,
})[0];
const resaved = applyClientSpbDeliveryFees([firstSave], {
  showPrices: true,
  ...deliveryMeta,
})[0];
assert.equal(deliveryLines(resaved).length, 1, "re-save must not duplicate delivery");
const staffResaved = applyDeliveryLineSync([resaved], deliveryMeta)[0];
assert.equal(deliveryLines(staffResaved).length, 1, "staff sync must not duplicate");

// TEST 4: 1C payload contains delivery line
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

console.log("verify-paid-delivery-order-line: ok");
