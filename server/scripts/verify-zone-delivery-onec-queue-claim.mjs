import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureSpbDeliveryOnOrder,
  isCloverDeliveryLine,
  sanitizeDeliveryZones,
  syncDeliveryLineFromFee,
} from "../src/deliveryFee.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverSource = readFileSync(path.join(root, "server/src/server.js"), "utf8");

const DELIVERY_META = {
  deliveryOneCId: "delivery-uuid",
  deliveryOneCCode: "DELIVERY-CODE",
  deliveryOneCName: "Доставка",
};

const ONE_C_PRODUCTS = [
  {
    id: DELIVERY_META.deliveryOneCId,
    code: DELIVERY_META.deliveryOneCCode,
    name: DELIVERY_META.deliveryOneCName,
  },
];

const PATHS = [
  { name: "pre-claim", variable: "candidateForLinkCheck" },
  { name: "claim", variable: "orderForClaim" },
  { name: "queue", variable: "orderWithDelivery" },
];

function extractEnsureExpression(variable) {
  const pattern = new RegExp(
    `const\\s+${variable}\\s*=\\s*(ensureSpbDeliveryOnOrder\\([\\s\\S]*?\\n\\s*\\));`
  );
  const match = serverSource.match(pattern);
  assert.ok(match, `${variable}: ensureSpbDeliveryOnOrder call not found`);
  return match[1];
}

function runServerPath(pathCase, order, addresses, deliveryZones) {
  const expression = extractEnsureExpression(pathCase.variable);
  const execute = new Function(
    "ensureSpbDeliveryOnOrder",
    "getClientState",
    "sanitizeDeliveryZones",
    "candidate",
    "realOrder",
    "stored",
    "deliverySettings",
    "oneCProducts",
    "oneCProductsCatalog",
    `return (${expression});`
  );

  return execute(
    ensureSpbDeliveryOnOrder,
    () => ({ profile: {}, addresses, favorites: [] }),
    sanitizeDeliveryZones,
    order,
    order,
    { payload: order },
    { ...DELIVERY_META, deliveryZones },
    ONE_C_PRODUCTS,
    ONE_C_PRODUCTS
  );
}

function orderFixture({ subtotal = 1000, initialFee = 700 } = {}) {
  const goods = {
    id: "goods-1",
    productId: "goods-1",
    oneCId: "goods-uuid",
    code: "GOODS-1",
    name: "Товар",
    unit: "piece",
    quantity: 1,
    unitPrice: subtotal,
    lineTotal: subtotal,
  };
  return syncDeliveryLineFromFee(
    {
      id: "order-1",
      clientId: "client-1",
      addressId: "address-1",
      items: [goods],
      customItems: [],
      deliveryFee: initialFee,
    },
    DELIVERY_META,
    ONE_C_PRODUCTS
  );
}

function deliveryLine(order) {
  return (order.items || []).find(isCloverDeliveryLine) || null;
}

const zone700 = { id: "zone-700", name: "Зона 700", enabled: true, freeFrom: 7000, fee: 700 };
const zone1000 = { id: "zone-1000", name: "Зона 1000", enabled: true, freeFrom: 9000, fee: 1000 };
const freeZone = { id: "zone-free", name: "Бесплатная зона", enabled: true, freeFrom: 2000, fee: 700 };

for (const pathCase of PATHS) {
  const addresses700 = [{ id: "address-1", deliveryZoneId: zone700.id }];
  const result700 = runServerPath(
    pathCase,
    orderFixture({ initialFee: 700 }),
    addresses700,
    [zone700]
  );
  assert.equal(result700.deliveryFee, 700, `${pathCase.name}: zone 700 must remain 700`);
  assert.equal(deliveryLine(result700)?.unitPrice, 700, `${pathCase.name}: zone 700 line price`);
  assert.equal(deliveryLine(result700)?.lineTotal, 700, `${pathCase.name}: zone 700 line total`);

  const addresses1000 = [{ id: "address-1", deliveryZoneId: zone1000.id }];
  const result1000 = runServerPath(
    pathCase,
    orderFixture({ initialFee: 1000 }),
    addresses1000,
    [zone1000]
  );
  assert.equal(result1000.deliveryFee, 1000, `${pathCase.name}: zone 1000 must remain 1000`);
  assert.equal(deliveryLine(result1000)?.unitPrice, 1000, `${pathCase.name}: zone 1000 line price`);
  assert.equal(deliveryLine(result1000)?.lineTotal, 1000, `${pathCase.name}: zone 1000 line total`);

  for (const result of [result700, result1000]) {
    const line = deliveryLine(result);
    assert.equal(line?.oneCId, DELIVERY_META.deliveryOneCId, `${pathCase.name}: delivery oneCId`);
    assert.equal(line?.code, DELIVERY_META.deliveryOneCCode, `${pathCase.name}: delivery code`);
    assert.equal(line?.name, DELIVERY_META.deliveryOneCName, `${pathCase.name}: delivery name`);
    assert.equal(line?.quantity, 1, `${pathCase.name}: delivery quantity`);
  }

  const global = runServerPath(
    pathCase,
    orderFixture({ initialFee: 500 }),
    [{ id: "address-1", deliveryZoneId: "" }],
    [zone700]
  );
  assert.equal(global.deliveryFee, 500, `${pathCase.name}: no zone uses global 500`);
  assert.equal(deliveryLine(global)?.unitPrice, 500, `${pathCase.name}: global line price`);
  assert.equal(deliveryLine(global)?.lineTotal, 500, `${pathCase.name}: global line total`);
  assert.equal(deliveryLine(global)?.oneCId, DELIVERY_META.deliveryOneCId, `${pathCase.name}: global delivery oneCId`);
  assert.equal(deliveryLine(global)?.code, DELIVERY_META.deliveryOneCCode, `${pathCase.name}: global delivery code`);
  assert.equal(deliveryLine(global)?.name, DELIVERY_META.deliveryOneCName, `${pathCase.name}: global delivery name`);
  assert.equal(deliveryLine(global)?.quantity, 1, `${pathCase.name}: global delivery quantity`);

  const free = runServerPath(
    pathCase,
    orderFixture({ subtotal: 2000, initialFee: 0 }),
    [{ id: "address-1", deliveryZoneId: freeZone.id }],
    [freeZone]
  );
  assert.equal(free.deliveryFee, 0, `${pathCase.name}: zone threshold gives free delivery`);
  assert.equal(deliveryLine(free), null, `${pathCase.name}: free delivery has no paid line`);
}

console.log("verify-zone-delivery-onec-queue-claim: ok");
