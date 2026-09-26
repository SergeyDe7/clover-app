import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bindClientOrderCounterparties,
  build1CPayload,
  validateOrderFor1C,
} from "../src/exchange.js";
import { preserveClientAddressDeliveryZones } from "../src/deliveryFee.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(currentDir, "..");
const rootDir = path.resolve(serverDir, "..");

const products = [{
  id: "product-1",
  name: "Тестовый товар",
  oneCId: "product-onec-1",
  oneCCode: "НФ-1",
}];
const addresses = [
  {
    id: "address-1",
    label: "Невский",
    address: "СПб, Невский, 10",
    oneCId: "counterparty-onec-1",
    oneCCode: "К-1",
    oneCName: "ООО Ресторан Центр",
    oneCInn: "7800000001",
  },
  {
    id: "address-2",
    label: "Московский",
    address: "СПб, Московский, 25",
    oneCId: "counterparty-onec-2",
    oneCCode: "К-2",
    oneCName: "ООО Ресторан Юг",
    oneCInn: "7800000002",
  },
];

function order(id, address) {
  return {
    id,
    externalId: id,
    number: id,
    clientId: "client-1",
    customerName: "Клиент Clover",
    addressId: address.id,
    address: address.address,
    firstDeliveryDate: "2026-10-01",
    items: [{
      productId: "product-1",
      name: "Тестовый товар",
      unit: "piece",
      quantity: 1,
      multiplier: 1,
      unitPrice: 100,
      lineTotal: 100,
    }],
  };
}

const capturedAt = "2026-09-26T12:00:00.000Z";
const bound = bindClientOrderCounterparties({
  orders: [order("order-1", addresses[0]), order("order-2", addresses[1])],
  previousOrders: [],
  addresses,
  capturedAt,
});

assert.equal(bound[0].oneCCounterparty.oneCId, "counterparty-onec-1");
assert.equal(bound[1].oneCCounterparty.oneCId, "counterparty-onec-2");
assert.equal(bound[0].oneCCounterparty.addressId, "address-1");
assert.equal(bound[1].oneCCounterparty.addressId, "address-2");

const payload1 = build1CPayload({ order: bound[0], products, clientLinks: {
  "client-1": { matched1C: true, oneCId: "legacy-counterparty" },
} });
const payload2 = build1CPayload({ order: bound[1], products, clientLinks: {
  "client-1": { matched1C: true, oneCId: "legacy-counterparty" },
} });
assert.equal(payload1.client.oneCId, "counterparty-onec-1");
assert.equal(payload2.client.oneCId, "counterparty-onec-2");
assert.equal(payload1.client.oneCName, "ООО Ресторан Центр");
assert.equal(payload2.client.oneCName, "ООО Ресторан Юг");

const changedAddresses = addresses.map((item) =>
  item.id === "address-1"
    ? { ...item, oneCId: "counterparty-changed", oneCName: "Новый контрагент" }
    : item
);
const preserved = bindClientOrderCounterparties({
  orders: [{ ...bound[0], oneCCounterparty: { oneCId: "client-forged" } }],
  previousOrders: [bound[0]],
  addresses: changedAddresses,
  capturedAt: "2026-09-27T12:00:00.000Z",
});
assert.deepEqual(preserved[0].oneCCounterparty, bound[0].oneCCounterparty);

const clientAddressSave = preserveClientAddressDeliveryZones(
  [{ id: "address-1", address: "Обновлённый адрес", oneCId: "client-forged" }],
  addresses
)[0];
assert.equal(clientAddressSave.oneCId, "counterparty-onec-1");
assert.equal(clientAddressSave.oneCName, "ООО Ресторан Центр");

const unmappedAddress = { id: "address-3", address: "СПб, Садовая, 1" };
const [unmapped] = bindClientOrderCounterparties({
  orders: [order("order-3", unmappedAddress)],
  previousOrders: [],
  addresses: [unmappedAddress],
  capturedAt,
});
const missingValidation = validateOrderFor1C({
  order: unmapped,
  products,
  clientLinks: {
    "client-1": { matched1C: true, oneCId: "legacy-counterparty" },
  },
});
assert.equal(missingValidation.ready, false);
assert.match(missingValidation.issues.join(" "), /выбранного адреса доставки/u);

const legacyPayload = build1CPayload({
  order: order("legacy-order", addresses[0]),
  products,
  clientLinks: {
    "client-1": { matched1C: true, oneCId: "legacy-counterparty" },
  },
});
assert.equal(legacyPayload.client.oneCId, "legacy-counterparty");

const serverSource = readFileSync(path.join(serverDir, "src", "server.js"), "utf8");
const dbSource = readFileSync(path.join(serverDir, "src", "db.js"), "utf8");
const managerSource = readFileSync(
  path.join(rootDir, "src", "screens", "manager", "ManagerClients.jsx"),
  "utf8"
);
assert.match(serverSource, /oneCId:\s*z\.string\(\).*ONEC_ADDRESS_COUNTERPARTY_UNKNOWN/su);
assert.match(serverSource, /bindClientOrderCounterparties\(\{/u);
assert.match(serverSource, /oneCCounterparty:\s*_oneCCounterparty/u);
assert.match(serverSource, /sanitizeAddressesForClient\(state\.addresses\)/u);
assert.match(serverSource, /assertGlobalCounterpartyNotOwnedByOtherAddress/u);
assert.match(serverSource, /item\.oneCId === undefined \? previous\.oneCId/u);
assert.match(dbSource, /Object\.hasOwn\(current, "oneCCounterparty"\)/u);
assert.match(managerSource, /addressMode[\s\S]*updateAddress\(item\.id, patch\)/u);

console.log("verify-address-counterparty-routing: PASS");
