/**
 * Smoke: paid delivery becomes an order line for UI + 1C.
 */
import assert from "node:assert/strict";
import {
  CLOVER_DELIVERY_LINE_ID,
  FREE_DELIVERY_MIN_TOTAL,
  PAID_DELIVERY_FEE,
  applyClientSpbDeliveryFees,
  isCloverDeliveryLine,
  orderItemsMoneyTotal,
  resolveDeliveryOneCRefs,
} from "../src/deliveryFee.js";

const refsCode = resolveDeliveryOneCRefs({ deliveryOneCId: "НФ-00002361" });
assert.equal(refsCode.oneCId, "");
assert.equal(refsCode.oneCCode, "НФ-00002361");

const refsUuid = resolveDeliveryOneCRefs({
  deliveryOneCId: "abd0ca3a-8033-11f1-abc0-b42e99f8290d",
  deliveryOneCCode: "НФ-1",
});
assert.equal(refsUuid.oneCId, "abd0ca3a-8033-11f1-abc0-b42e99f8290d");
assert.equal(refsUuid.oneCCode, "НФ-1");

const under = applyClientSpbDeliveryFees(
  [
    {
      id: "o1",
      items: [{ productId: "p1", name: "Товар", lineTotal: 3000, quantity: 1, unit: "piece" }],
      customItems: [],
      deliveryFee: 0,
    },
  ],
  {
    showPrices: true,
    deliveryOneCId: "abd0ca3a-8033-11f1-abc0-b42e99f8290d",
    deliveryOneCCode: "DEL-01",
    deliveryOneCName: "Доставка",
  }
)[0];

assert.equal(under.deliveryFee, PAID_DELIVERY_FEE);
const deliveryLine = under.items.find(isCloverDeliveryLine);
assert.ok(deliveryLine);
assert.equal(deliveryLine.productId, CLOVER_DELIVERY_LINE_ID);
assert.equal(deliveryLine.unitPrice, PAID_DELIVERY_FEE);
assert.equal(deliveryLine.lineTotal, PAID_DELIVERY_FEE);
assert.equal(deliveryLine.oneCId, "abd0ca3a-8033-11f1-abc0-b42e99f8290d");
assert.equal(deliveryLine.oneCCode, "DEL-01");
assert.equal(orderItemsMoneyTotal(under), 3000);

const byCode = applyClientSpbDeliveryFees(
  [{ id: "o3", items: [{ productId: "p1", lineTotal: 1000, quantity: 1, unit: "piece" }] }],
  { showPrices: true, deliveryOneCId: "НФ-00002361" }
)[0];
const byCodeLine = byCode.items.find(isCloverDeliveryLine);
assert.equal(byCodeLine.oneCId, "");
assert.equal(byCodeLine.oneCCode, "НФ-00002361");

const over = applyClientSpbDeliveryFees(
  [
    {
      id: "o2",
      items: [
        { productId: "p1", lineTotal: FREE_DELIVERY_MIN_TOTAL, quantity: 1, unit: "piece" },
        {
          productId: CLOVER_DELIVERY_LINE_ID,
          isDelivery: true,
          lineTotal: 500,
          unitPrice: 500,
          quantity: 1,
        },
      ],
      customItems: [],
    },
  ],
  { showPrices: true, deliveryOneCId: "uuid-delivery" }
)[0];

assert.equal(over.deliveryFee, 0);
assert.equal(over.items.some(isCloverDeliveryLine), false);

console.log("verify-delivery-fee: ok");
