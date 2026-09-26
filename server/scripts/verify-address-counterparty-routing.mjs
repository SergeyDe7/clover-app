import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  bindClientOrderCounterparties,
  bindStaffOrderCounterparties,
  build1CPayload,
  validateOrderFor1C,
} from "../src/exchange.js";
import { preserveClientAddressDeliveryZones } from "../src/deliveryFee.js";
import { autoLinkCloverClients } from "../src/oneCClients.js";

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
  orders: [{
    ...bound[0],
    address: "Подменённый клиентом адрес",
    oneCCounterparty: { oneCId: "client-forged" },
  }],
  previousOrders: [bound[0]],
  addresses: changedAddresses,
  capturedAt: "2026-09-27T12:00:00.000Z",
});
assert.deepEqual(preserved[0].oneCCounterparty, bound[0].oneCCounterparty);
assert.equal(preserved[0].address, addresses[0].address);

const [clientDeletedAddressPreserved] = bindClientOrderCounterparties({
  orders: [{ ...bound[0], address: "Подмена после удаления адреса" }],
  previousOrders: [bound[0]],
  addresses: [addresses[1]],
  capturedAt,
});
assert.equal(clientDeletedAddressPreserved.address, addresses[0].address);
assert.deepEqual(
  clientDeletedAddressPreserved.oneCCounterparty,
  bound[0].oneCCounterparty
);

assert.throws(
  () => bindClientOrderCounterparties({
    orders: [{ ...bound[0], addressId: "address-unknown" }],
    previousOrders: [bound[0]],
    addresses,
    capturedAt,
  }),
  (error) => error?.code === "ORDER_ADDRESS_UNKNOWN" && error?.status === 400
);

const [changedAddress] = bindClientOrderCounterparties({
  orders: [{ ...bound[0], addressId: "address-2", address: "Подмена" }],
  previousOrders: [bound[0]],
  addresses,
  capturedAt: "2026-09-28T12:00:00.000Z",
});
assert.equal(changedAddress.address, addresses[1].address);
assert.equal(changedAddress.oneCCounterparty.addressId, "address-2");
assert.equal(changedAddress.oneCCounterparty.oneCId, "counterparty-onec-2");

const legacyPrevious = order("legacy-change", addresses[0]);
const [legacyAddressChanged] = bindClientOrderCounterparties({
  orders: [{ ...legacyPrevious, addressId: "address-2" }],
  previousOrders: [legacyPrevious],
  addresses,
  capturedAt,
});
assert.equal(legacyAddressChanged.oneCCounterparty.oneCId, "counterparty-onec-2");

const [staffPreserved] = bindStaffOrderCounterparties({
  orders: [{
    ...bound[0],
    address: "Подменённый менеджером адрес",
    oneCCounterparty: { oneCId: "staff-forged" },
  }],
  previousOrders: [bound[0]],
  clients: [{ id: "client-1", addresses }],
  capturedAt,
});
assert.deepEqual(staffPreserved.oneCCounterparty, bound[0].oneCCounterparty);
assert.equal(staffPreserved.address, addresses[0].address);

const [staffDeletedAddressPreserved] = bindStaffOrderCounterparties({
  orders: [{ ...bound[0], address: "Подмена после удаления адреса" }],
  previousOrders: [bound[0]],
  clients: [{ id: "client-1", addresses: [addresses[1]] }],
  capturedAt,
});
assert.equal(staffDeletedAddressPreserved.address, addresses[0].address);
assert.deepEqual(
  staffDeletedAddressPreserved.oneCCounterparty,
  bound[0].oneCCounterparty
);

const [staffChanged] = bindStaffOrderCounterparties({
  orders: [{
    ...bound[0],
    addressId: "address-2",
    address: "Подменённый менеджером адрес",
    oneCCounterparty: { oneCId: "staff-forged" },
  }],
  previousOrders: [bound[0]],
  clients: [{ id: "client-1", addresses }],
  capturedAt,
});
assert.equal(staffChanged.address, addresses[1].address);
assert.equal(staffChanged.oneCCounterparty.oneCId, "counterparty-onec-2");

const sharedIdOtherClientAddress = {
  ...addresses[0],
  address: "Москва, Тверская, 1",
  oneCId: "counterparty-other-client",
  oneCCode: "К-OTHER",
  oneCName: "ООО Другой клиент",
  oneCInn: "7700000001",
};
const [staffOwnerChanged] = bindStaffOrderCounterparties({
  orders: [{
    ...bound[0],
    clientId: "client-2",
    address: "Подмена при смене клиента",
    oneCCounterparty: { oneCId: "staff-forged" },
  }],
  previousOrders: [bound[0]],
  clients: [
    { id: "client-1", addresses },
    { id: "client-2", addresses: [sharedIdOtherClientAddress] },
  ],
  capturedAt,
});
assert.equal(staffOwnerChanged.address, sharedIdOtherClientAddress.address);
assert.equal(
  staffOwnerChanged.oneCCounterparty.oneCId,
  "counterparty-other-client"
);

assert.throws(
  () => bindStaffOrderCounterparties({
    orders: [{
      ...bound[0],
      clientId: "client-unknown",
      oneCCounterparty: { oneCId: "staff-forged" },
    }],
    previousOrders: [bound[0]],
    clients: [{ id: "client-1", addresses }],
    capturedAt,
  }),
  (error) => error?.code === "ORDER_ADDRESS_UNKNOWN"
);

assert.throws(
  () => bindStaffOrderCounterparties({
    orders: [{
      ...order("staff-new-without-address", addresses[0]),
      addressId: "",
      address: "Поддельный свободный текст",
      oneCCounterparty: { oneCId: "staff-forged" },
    }],
    previousOrders: [],
    clients: [{ id: "client-1", addresses }],
    capturedAt,
  }),
  (error) => error?.code === "ORDER_ADDRESS_UNKNOWN" && error?.status === 400
);

assert.throws(
  () => bindStaffOrderCounterparties({
    orders: [{ ...bound[0], addressId: "other-client-address" }],
    previousOrders: [bound[0]],
    clients: [{ id: "client-1", addresses }],
    capturedAt,
  }),
  (error) => error?.code === "ORDER_ADDRESS_UNKNOWN"
);

const historicalLegacy = {
  ...order("legacy-without-address-id", addresses[0]),
  addressId: "",
  address: "Исторический адрес",
};
const [legacyUnchanged] = bindClientOrderCounterparties({
  orders: [{ ...historicalLegacy, address: "Подмена без addressId" }],
  previousOrders: [historicalLegacy],
  addresses,
  capturedAt,
});
assert.equal(legacyUnchanged.address, "Исторический адрес");
assert.equal(Object.hasOwn(legacyUnchanged, "oneCCounterparty"), false);

const [staffLegacyUnchanged] = bindStaffOrderCounterparties({
  orders: [{
    ...historicalLegacy,
    address: "Подмена менеджером без addressId",
    oneCCounterparty: { oneCId: "staff-forged" },
  }],
  previousOrders: [historicalLegacy],
  clients: [{ id: "client-1", addresses }],
  capturedAt,
});
assert.equal(staffLegacyUnchanged.address, "Исторический адрес");
assert.equal(Object.hasOwn(staffLegacyUnchanged, "oneCCounterparty"), false);

assert.throws(
  () => bindStaffOrderCounterparties({
    orders: [{ ...historicalLegacy, clientId: "client-2" }],
    previousOrders: [historicalLegacy],
    clients: [
      { id: "client-1", addresses },
      { id: "client-2", addresses: [sharedIdOtherClientAddress] },
    ],
    capturedAt,
  }),
  (error) => error?.code === "ORDER_ADDRESS_UNKNOWN"
);

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

const autoLinkedWithAddressReservation = autoLinkCloverClients(
  [
    {
      id: "client-address-owner",
      companyName: "Другой клиент",
      addresses: [{ id: "owner-address", oneCId: "counterparty-onec-1" }],
    },
    {
      id: "client-auto-candidate",
      companyName: "ООО Ресторан Центр",
      addresses: [],
    },
  ],
  {},
  [{
    id: "counterparty-onec-1",
    code: "К-1",
    name: "ООО Ресторан Центр",
    inn: "7800000001",
  }],
  capturedAt
);
assert.equal(
  autoLinkedWithAddressReservation.clientLinks["client-auto-candidate"],
  undefined
);
assert.equal(autoLinkedWithAddressReservation.report.autoLinked, 0);
assert.equal(autoLinkedWithAddressReservation.report.ambiguous, 1);

// Executable transaction-race regression: a request-start staff binding is
// stale by the time replaceOrders acquires BEGIN IMMEDIATE. The DB authority
// pass must capture the latest persisted mapping, not the stale request value.
const raceTemp = mkdtempSync(path.join(tmpdir(), "clover-address-route-race-"));
const priorDbPath = process.env.DB_PATH;
const priorNodeEnv = process.env.NODE_ENV;
process.env.DB_PATH = path.join(raceTemp, "clover.sqlite");
process.env.NODE_ENV = "test";
let raceDbModule;
try {
  raceDbModule = await import(
    `${pathToFileURL(path.join(serverDir, "src", "db.js")).href}?addressRace=${Date.now()}`
  );
  const raceClient = raceDbModule.createUser({
    email: "address-race@example.test",
    passwordHash: "not-used-in-this-db-test",
    role: "client",
    emailVerified: true,
    approvalStatus: "approved",
  });
  const raceOldAddress = {
    ...addresses[0],
    id: "race-old-address",
    oneCId: "race-old-counterparty",
  };
  const raceNewAddressBefore = {
    ...addresses[1],
    id: "race-new-address",
    address: "До транзакционного обновления",
    oneCId: "race-stale-counterparty",
  };
  const raceNewAddressLatest = {
    ...raceNewAddressBefore,
    address: "После транзакционного обновления",
    oneCId: "race-latest-counterparty",
    oneCName: "Актуальный контрагент",
  };
  raceDbModule.setClientStateField(
    raceClient.id,
    "addresses",
    [raceOldAddress, raceNewAddressBefore]
  );

  const racePrevious = {
    ...order("staff-race-order", raceOldAddress),
    clientId: raceClient.id,
  };
  const [racePreviousBound] = bindClientOrderCounterparties({
    orders: [racePrevious],
    previousOrders: [],
    addresses: [raceOldAddress, raceNewAddressBefore],
    capturedAt,
  });
  raceDbModule.replaceOrders({
    orders: [racePreviousBound],
    managerMode: true,
  });

  const [staleStaffOrder] = bindStaffOrderCounterparties({
    orders: [{ ...racePreviousBound, addressId: raceNewAddressBefore.id }],
    previousOrders: [racePreviousBound],
    clients: [{
      id: raceClient.id,
      addresses: [raceOldAddress, raceNewAddressBefore],
    }],
    capturedAt,
  });
  assert.equal(
    staleStaffOrder.oneCCounterparty.oneCId,
    "race-stale-counterparty"
  );

  raceDbModule.replaceOrdersTestHooks.beforeStaffAuthority = () => {
    raceDbModule.setClientStateField(
      raceClient.id,
      "addresses",
      [raceOldAddress, raceNewAddressLatest]
    );
  };
  raceDbModule.replaceOrders({
    orders: [staleStaffOrder],
    managerMode: true,
    enforceStaffCounterpartyAuthority: true,
  });
  raceDbModule.replaceOrdersTestHooks.beforeStaffAuthority = null;

  const [raceSaved] = raceDbModule.listOrders(null, { includeDeleted: true });
  assert.equal(raceSaved.address, raceNewAddressLatest.address);
  assert.equal(
    raceSaved.oneCCounterparty.oneCId,
    "race-latest-counterparty"
  );

  assert.throws(
    () => raceDbModule.replaceOrders({
      orders: [{
        ...raceSaved,
        id: "staff-db-new-without-address",
        addressId: "",
        address: "Поддельный адрес",
        oneCCounterparty: { oneCId: "staff-forged" },
      }],
      managerMode: true,
      enforceStaffCounterpartyAuthority: true,
    }),
    (error) => error?.code === "ORDER_ADDRESS_UNKNOWN"
  );
  assert.equal(
    raceDbModule.listOrders(null, { includeDeleted: true })[0].id,
    raceSaved.id,
    "failed staff authority must roll back manager bulk replace"
  );
} finally {
  raceDbModule?.replaceOrdersTestHooks &&
    (raceDbModule.replaceOrdersTestHooks.beforeStaffAuthority = null);
  raceDbModule?.db?.close();
  if (priorDbPath === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = priorDbPath;
  if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = priorNodeEnv;
  rmSync(raceTemp, { recursive: true, force: true });
}

const serverSource = readFileSync(path.join(serverDir, "src", "server.js"), "utf8");
const dbSource = readFileSync(path.join(serverDir, "src", "db.js"), "utf8");
const managerSource = readFileSync(
  path.join(rootDir, "src", "screens", "manager", "ManagerClients.jsx"),
  "utf8"
);
assert.match(serverSource, /oneCId:\s*z\.string\(\).*ONEC_ADDRESS_COUNTERPARTY_UNKNOWN/su);
assert.match(serverSource, /bindClientOrderCounterparties\(\{/u);
assert.match(serverSource, /bindStaffOrderCounterparties\(\{/u);
assert.match(serverSource, /oneCCounterparty:\s*_oneCCounterparty/u);
assert.match(serverSource, /sanitizeAddressesForClient\(state\.addresses\)/u);
assert.match(serverSource, /assertGlobalCounterpartyNotOwnedByOtherAddress/u);
assert.match(serverSource, /item\.oneCId === undefined \? previous\.oneCId/u);
assert.match(dbSource, /persistedAddresses = getClientState\(userId\)\.addresses/u);
assert.match(dbSource, /bindClientOrderCounterparties\(\{/u);
assert.match(dbSource, /enforceStaffCounterpartyAuthority/u);
assert.match(dbSource, /bindStaffOrderCounterparties\(\{/u);
assert.match(managerSource, /addressMode[\s\S]*updateAddress\(item\.id, patch\)/u);

console.log("verify-address-counterparty-routing: PASS");
