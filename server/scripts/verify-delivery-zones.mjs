import assert from "node:assert/strict";
import {
  FREE_DELIVERY_MIN_TOTAL,
  PAID_DELIVERY_FEE,
  CLOVER_DELIVERY_LINE_ID,
  getDeliveryFeeForGoodsSubtotal,
  resolveEffectiveDeliveryTariff,
  sanitizeDeliveryZones,
  orderItemsMoneyTotal,
} from "../src/deliveryFee.js";

assert.equal(FREE_DELIVERY_MIN_TOTAL, 5000);
assert.equal(PAID_DELIVERY_FEE, 500);

// A. NO ZONE — preserve global 5000/500
assert.deepEqual(resolveEffectiveDeliveryTariff(null), {
  freeFrom: 5000,
  fee: 500,
});
assert.equal(getDeliveryFeeForGoodsSubtotal(4999, null), 500);
assert.equal(getDeliveryFeeForGoodsSubtotal(5000, null), 0);

// B. FULL ZONE OVERRIDE
const zoneA = {
  id: "zone-a",
  name: "Мурино",
  enabled: true,
  freeFrom: 7000,
  fee: 700,
};
assert.deepEqual(resolveEffectiveDeliveryTariff(zoneA), {
  freeFrom: 7000,
  fee: 700,
});
assert.equal(getDeliveryFeeForGoodsSubtotal(6999, zoneA), 700);
assert.equal(getDeliveryFeeForGoodsSubtotal(7000, zoneA), 0);

// C. PARTIAL — freeFrom null → global threshold, fee from zone
const zoneB = {
  id: "zone-b",
  name: "Всеволожск",
  enabled: true,
  freeFrom: null,
  fee: 1000,
};
assert.deepEqual(resolveEffectiveDeliveryTariff(zoneB), {
  freeFrom: 5000,
  fee: 1000,
});
assert.equal(getDeliveryFeeForGoodsSubtotal(4999, zoneB), 1000);
assert.equal(getDeliveryFeeForGoodsSubtotal(5000, zoneB), 0);

// D. PARTIAL — fee null → global paid fee, freeFrom from zone
const zoneC = {
  id: "zone-c",
  name: "Гатчина",
  enabled: true,
  freeFrom: 8000,
  fee: null,
};
assert.deepEqual(resolveEffectiveDeliveryTariff(zoneC), {
  freeFrom: 8000,
  fee: 500,
});
assert.equal(getDeliveryFeeForGoodsSubtotal(7999, zoneC), 500);
assert.equal(getDeliveryFeeForGoodsSubtotal(8000, zoneC), 0);

// E. DISABLED ZONE → global fallback
const zoneDisabled = {
  id: "zone-off",
  name: "Off",
  enabled: false,
  freeFrom: 9000,
  fee: 2000,
};
assert.deepEqual(resolveEffectiveDeliveryTariff(zoneDisabled), {
  freeFrom: 5000,
  fee: 500,
});
assert.equal(getDeliveryFeeForGoodsSubtotal(4999, zoneDisabled), 500);
assert.equal(getDeliveryFeeForGoodsSubtotal(5000, zoneDisabled), 0);

// F. UNKNOWN / invalid zone-like values → global fallback
assert.deepEqual(resolveEffectiveDeliveryTariff(undefined), {
  freeFrom: 5000,
  fee: 500,
});
assert.deepEqual(resolveEffectiveDeliveryTariff({}), {
  freeFrom: 5000,
  fee: 500,
});
assert.equal(getDeliveryFeeForGoodsSubtotal(4999, { enabled: true }), 500);

// G. Delivery fee must NOT count toward free-delivery threshold
const orderWithDeliveryLine = {
  items: [
    {
      id: "goods-1",
      productId: 1,
      lineTotal: 4800,
      unitPrice: 4800,
      quantity: 1,
    },
    {
      id: CLOVER_DELIVERY_LINE_ID,
      productId: CLOVER_DELIVERY_LINE_ID,
      isDelivery: true,
      lineTotal: 500,
      unitPrice: 500,
      quantity: 1,
    },
  ],
  customItems: [],
};
const goodsOnly = orderItemsMoneyTotal(orderWithDeliveryLine);
assert.equal(goodsOnly, 4800, "threshold uses goods only, excludes delivery line");
assert.equal(getDeliveryFeeForGoodsSubtotal(goodsOnly, null), 500);
// Explicit: 4800 goods stays paid; adding delivery amount into threshold would wrongly free it
assert.equal(getDeliveryFeeForGoodsSubtotal(4800, null), 500);
assert.equal(getDeliveryFeeForGoodsSubtotal(5300, null), 0);

// sanitizeDeliveryZones — drop invalid, keep valid
const cleaned = sanitizeDeliveryZones([
  { id: "ok", name: "  Мурино  ", enabled: true, freeFrom: 7000, fee: 700 },
  { id: "", name: "bad", enabled: true, freeFrom: 1, fee: 1 },
  { id: "x", name: "", enabled: true, freeFrom: 1, fee: 1 },
  { id: "partial", name: "Partial", enabled: true, freeFrom: null, fee: 1000 },
  { id: "neg", name: "Neg", enabled: true, freeFrom: -1, fee: 10 },
  null,
  "nope",
]);
assert.equal(cleaned.length, 2);
assert.deepEqual(cleaned[0], {
  id: "ok",
  name: "Мурино",
  enabled: true,
  freeFrom: 7000,
  fee: 700,
});
assert.deepEqual(cleaned[1], {
  id: "partial",
  name: "Partial",
  enabled: true,
  freeFrom: null,
  fee: 1000,
});

console.log("verify-delivery-zones: ok");
