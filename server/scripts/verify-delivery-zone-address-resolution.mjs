/**
 * Phase 2: address.deliveryZoneId → settings.deliveryZones → server delivery fee.
 * Strict TDD verifier (no test framework).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FREE_DELIVERY_MIN_TOTAL,
  PAID_DELIVERY_FEE,
  CLOVER_DELIVERY_LINE_ID,
  applyClientSpbDeliveryFees,
  ensureSpbDeliveryOnOrder,
  isCloverDeliveryLine,
  resolveDeliveryZoneForAddress,
  resolveDeliveryZoneForOrder,
  sanitizeDeliveryZones,
} from "../src/deliveryFee.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverJs = readFileSync(path.join(root, "server/src/server.js"), "utf8");

assert.equal(FREE_DELIVERY_MIN_TOTAL, 5000);
assert.equal(PAID_DELIVERY_FEE, 500);

const zones = sanitizeDeliveryZones([
  {
    id: "murino",
    name: "Мурино",
    enabled: true,
    freeFrom: 7000,
    fee: 700,
  },
  {
    id: "vsevolozhsk",
    name: "Всеволожск",
    enabled: true,
    freeFrom: 7000,
    fee: 1000,
  },
  {
    id: "partial-fee",
    name: "Partial fee",
    enabled: true,
    freeFrom: null,
    fee: 700,
  },
  {
    id: "partial-threshold",
    name: "Partial threshold",
    enabled: true,
    freeFrom: 8000,
    fee: null,
  },
  {
    id: "disabled-zone",
    name: "Off",
    enabled: false,
    freeFrom: 9000,
    fee: 2000,
  },
]);

const addrNoZone = { id: "a-old", label: "Старый", address: "СПб", isDefault: true };
const addrMurino = {
  id: "a-murino",
  label: "Мурино",
  address: "Мурино 1",
  isDefault: false,
  deliveryZoneId: "murino",
};
const addrVsevo = {
  id: "a-vsevo",
  label: "Всеволожск",
  address: "Всеволожск 2",
  isDefault: false,
  deliveryZoneId: "vsevolozhsk",
};
const addrUnknown = {
  id: "a-unknown",
  label: "Unknown",
  address: "X",
  isDefault: false,
  deliveryZoneId: "no-such-zone",
};
const addrDisabled = {
  id: "a-off",
  label: "Off",
  address: "Y",
  isDefault: false,
  deliveryZoneId: "disabled-zone",
};
const addrPartialFee = {
  id: "a-pf",
  label: "PF",
  address: "Z",
  isDefault: false,
  deliveryZoneId: "partial-fee",
};
const addrPartialThreshold = {
  id: "a-pt",
  label: "PT",
  address: "W",
  isDefault: false,
  deliveryZoneId: "partial-threshold",
};

const addresses = [
  addrNoZone,
  addrMurino,
  addrVsevo,
  addrUnknown,
  addrDisabled,
  addrPartialFee,
  addrPartialThreshold,
];

function goodsOrder({ addressId, subtotal, deliveryFee = 9999 }) {
  return {
    id: `order-${addressId || "none"}-${subtotal}`,
    addressId: addressId || "",
    address: "snapshot text must not drive zone",
    items: [
      {
        id: "g1",
        productId: "p1",
        name: "Goods",
        unit: "piece",
        quantity: 1,
        unitPrice: subtotal,
        lineTotal: subtotal,
      },
    ],
    customItems: [],
    deliveryFee,
    deliveryNote: "client fake",
    total: subtotal,
    amount: subtotal,
  };
}

function deliveryLines(order) {
  return (Array.isArray(order?.items) ? order.items : []).filter(isCloverDeliveryLine);
}

function applyWithZones(orders) {
  return applyClientSpbDeliveryFees(orders, {
    showPrices: true,
    addresses,
    deliveryZones: zones,
    deliveryOneCId: "del-uuid",
    deliveryOneCCode: "DEL-CODE",
    deliveryOneCName: "Доставка",
  });
}

// --- resolve helpers ---
assert.equal(resolveDeliveryZoneForAddress(null, zones), null);
assert.equal(resolveDeliveryZoneForAddress(addrNoZone, zones), null);
assert.equal(resolveDeliveryZoneForAddress({ ...addrNoZone, deliveryZoneId: null }, zones), null);
assert.equal(resolveDeliveryZoneForAddress(addrUnknown, zones), null);
assert.equal(resolveDeliveryZoneForAddress(addrDisabled, zones), null);
assert.equal(resolveDeliveryZoneForAddress(addrMurino, zones)?.id, "murino");

assert.equal(
  resolveDeliveryZoneForOrder(goodsOrder({ addressId: "a-murino", subtotal: 100 }), {
    addresses,
    deliveryZones: zones,
  })?.id,
  "murino"
);
assert.equal(
  resolveDeliveryZoneForOrder(goodsOrder({ addressId: "missing", subtotal: 100 }), {
    addresses,
    deliveryZones: zones,
  }),
  null
);

// A. OLD ADDRESS — NO ZONE → global 5000/500
{
  const paid = applyWithZones([goodsOrder({ addressId: "a-old", subtotal: 4999 })])[0];
  assert.equal(paid.deliveryFee, 500);
  assert.equal(deliveryLines(paid).length, 1);
  assert.equal(deliveryLines(paid)[0].lineTotal, 500);

  const free = applyWithZones([goodsOrder({ addressId: "a-old", subtotal: 5000 })])[0];
  assert.equal(free.deliveryFee, 0);
  assert.equal(deliveryLines(free).length, 0);
}

// B. ADDRESS WITH ZONE murino 7000/700
{
  const paid = applyWithZones([goodsOrder({ addressId: "a-murino", subtotal: 6999 })])[0];
  assert.equal(paid.deliveryFee, 700);
  assert.equal(deliveryLines(paid).length, 1);
  assert.equal(deliveryLines(paid)[0].lineTotal, 700);
  assert.equal(deliveryLines(paid)[0].productId, CLOVER_DELIVERY_LINE_ID);

  const free = applyWithZones([goodsOrder({ addressId: "a-murino", subtotal: 7000 })])[0];
  assert.equal(free.deliveryFee, 0);
  assert.equal(deliveryLines(free).length, 0);
}

// C. Address A → Address B recalculation (same goods)
{
  const subtotal = 6999;
  const withA = applyWithZones([
    goodsOrder({ addressId: "a-murino", subtotal, deliveryFee: 0 }),
  ])[0];
  assert.equal(withA.deliveryFee, 700);

  const withB = applyWithZones([
    {
      ...withA,
      addressId: "a-vsevo",
      deliveryFee: withA.deliveryFee,
    },
  ])[0];
  assert.equal(withB.deliveryFee, 1000);
  assert.equal(deliveryLines(withB)[0].lineTotal, 1000);
}

// D. UNKNOWN ZONE ID → global
{
  const paid = applyWithZones([goodsOrder({ addressId: "a-unknown", subtotal: 4999 })])[0];
  assert.equal(paid.deliveryFee, 500);
}

// E. DISABLED ZONE → global
{
  const paid = applyWithZones([goodsOrder({ addressId: "a-off", subtotal: 4999 })])[0];
  assert.equal(paid.deliveryFee, 500);
}

// F. PARTIAL ZONE SETTINGS
{
  const feeOnly = applyWithZones([goodsOrder({ addressId: "a-pf", subtotal: 4999 })])[0];
  assert.equal(feeOnly.deliveryFee, 700);
  const feeOnlyFree = applyWithZones([goodsOrder({ addressId: "a-pf", subtotal: 5000 })])[0];
  assert.equal(feeOnlyFree.deliveryFee, 0);

  const thrOnly = applyWithZones([goodsOrder({ addressId: "a-pt", subtotal: 7999 })])[0];
  assert.equal(thrOnly.deliveryFee, 500);
  const thrFree = applyWithZones([goodsOrder({ addressId: "a-pt", subtotal: 8000 })])[0];
  assert.equal(thrFree.deliveryFee, 0);
}

// G. CLIENT FAKE DELIVERY FEE ignored (authoritative zone fee 700)
{
  const fakeZero = applyWithZones([
    goodsOrder({ addressId: "a-murino", subtotal: 6999, deliveryFee: 0 }),
  ])[0];
  assert.equal(fakeZero.deliveryFee, 700);
  assert.equal(deliveryLines(fakeZero)[0].lineTotal, 700);

  const fakeOne = applyWithZones([
    goodsOrder({ addressId: "a-murino", subtotal: 6999, deliveryFee: 1 }),
  ])[0];
  assert.equal(fakeOne.deliveryFee, 700);
}

// H. STOREFRONT / no address-book context → global 5000/500
{
  const draft = {
    id: "sf-1",
    address: "СПб, Невский 1",
    items: [
      {
        id: "g1",
        productId: "p1",
        name: "Goods",
        unit: "piece",
        quantity: 1,
        unitPrice: 4999,
        lineTotal: 4999,
      },
    ],
    customItems: [],
    deliveryFee: 0,
  };
  const ensured = ensureSpbDeliveryOnOrder(draft, {
    deliveryOneCId: "del-uuid",
    deliveryOneCCode: "DEL-CODE",
    deliveryOneCName: "Доставка",
  });
  assert.equal(ensured.deliveryFee, 500);
  assert.equal(deliveryLines(ensured)[0].lineTotal, 500);

  const freeDraft = {
    ...draft,
    id: "sf-2",
    items: [{ ...draft.items[0], unitPrice: 5000, lineTotal: 5000 }],
  };
  const freeEnsured = ensureSpbDeliveryOnOrder(freeDraft, {
    deliveryOneCId: "del-uuid",
    deliveryOneCCode: "DEL-CODE",
    deliveryOneCName: "Доставка",
  });
  assert.equal(freeEnsured.deliveryFee, 0);
  assert.equal(deliveryLines(freeEnsured).length, 0);
}

// Wiring: address schema + client order save must pass addresses/zones
assert.match(
  serverJs,
  /managerClientAddressSchema[\s\S]*deliveryZoneId/,
  "manager address schema must include deliveryZoneId"
);
assert.match(
  serverJs,
  /normalizeManagerClientAddresses[\s\S]*deliveryZoneId/,
  "manager address normalize must preserve deliveryZoneId"
);
assert.match(
  serverJs,
  /applyClientSpbDeliveryFees\([\s\S]*addresses[\s\S]*deliveryZones/,
  "client order save must pass addresses + deliveryZones into delivery apply"
);

// Must not trust free-text address for zone (resolver uses addressId only)
assert.equal(
  resolveDeliveryZoneForOrder(
    {
      addressId: "",
      address: "Мурино should not match",
      items: [],
    },
    { addresses, deliveryZones: zones }
  ),
  null
);

console.log("verify-delivery-zone-address-resolution: ok");
