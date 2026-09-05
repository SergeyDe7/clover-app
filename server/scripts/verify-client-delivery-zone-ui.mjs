/**
 * Phase 3: client zone spoof lock + OrderEditor preview + no client zone UI.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  FREE_DELIVERY_MIN_TOTAL,
  PAID_DELIVERY_FEE,
  preserveClientAddressDeliveryZones,
  projectClientDeliveryZones,
  applyClientSpbDeliveryFees,
  ensureSpbDeliveryOnOrder,
  isCloverDeliveryLine,
} from "../src/deliveryFee.js";
import {
  getDeliveryFeeForSelectedAddress,
  resolveEffectiveDeliveryTariffForAddress,
  FREE_DELIVERY_MIN_TOTAL as CLIENT_FREE,
  PAID_DELIVERY_FEE as CLIENT_FEE,
} from "../../src/config/orderConfig.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
assert.equal(FREE_DELIVERY_MIN_TOTAL, 5000);
assert.equal(PAID_DELIVERY_FEE, 500);
assert.equal(CLIENT_FREE, 5000);
assert.equal(CLIENT_FEE, 500);

const zones = [
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
    freeFrom: 10000,
    fee: 1000,
  },
  {
    id: "disabled-zone",
    name: "Off",
    enabled: false,
    freeFrom: 9000,
    fee: 2000,
  },
];

const addrMurino = {
  id: "a-murino",
  label: "Мурино",
  address: "Мурино 1",
  deliveryZoneId: "murino",
};
const addrVsevo = {
  id: "a-vsevo",
  label: "Всеволожск",
  address: "Всеволожск 2",
  deliveryZoneId: "vsevolozhsk",
};
const addrOld = {
  id: "a-old",
  label: "Старый",
  address: "СПб",
};

// F. Client cannot assign/change deliveryZoneId
{
  const current = [
    {
      id: "a1",
      label: "A",
      address: "Street",
      isDefault: true,
      deliveryZoneId: "murino",
    },
  ];
  const spoof = preserveClientAddressDeliveryZones(
    [
      {
        id: "a1",
        label: "A",
        address: "Street updated",
        isDefault: true,
        deliveryZoneId: "vsevolozhsk",
      },
      {
        id: "a-new",
        label: "New",
        address: "New street",
        isDefault: false,
        deliveryZoneId: "murino",
      },
    ],
    current
  );
  assert.equal(spoof[0].deliveryZoneId, "murino", "existing zone must be preserved");
  assert.equal(spoof[0].address, "Street updated");
  assert.equal(spoof[1].deliveryZoneId, "", "new client address must not set zone");
}

const serverJs = readFileSync(path.join(root, "server/src/server.js"), "utf8");
assert.match(
  serverJs,
  /preserveClientAddressDeliveryZones/,
  "client addresses PUT must call preserveClientAddressDeliveryZones"
);

// Client-safe projection: enabled only, no admin noise
{
  const projected = projectClientDeliveryZones(zones);
  assert.deepEqual(projected, [
    { id: "murino", freeFrom: 7000, fee: 700 },
    { id: "vsevolozhsk", freeFrom: 10000, fee: 1000 },
  ]);
  assert.match(
    serverJs,
    /projectClientDeliveryZones/,
    "bootstrap must project client-safe delivery zones"
  );
}

// G/H/I/K client preview mirror
assert.equal(getDeliveryFeeForSelectedAddress(6999, addrMurino, zones), 700);
assert.equal(getDeliveryFeeForSelectedAddress(7000, addrMurino, zones), 0);
assert.equal(getDeliveryFeeForSelectedAddress(9999, addrVsevo, zones), 1000);
assert.equal(getDeliveryFeeForSelectedAddress(10000, addrVsevo, zones), 0);
assert.equal(getDeliveryFeeForSelectedAddress(4999, addrOld, zones), 500);
assert.equal(getDeliveryFeeForSelectedAddress(5000, addrOld, zones), 0);

assert.deepEqual(resolveEffectiveDeliveryTariffForAddress(addrMurino, zones), {
  freeFrom: 7000,
  fee: 700,
});
assert.deepEqual(resolveEffectiveDeliveryTariffForAddress(addrOld, zones), {
  freeFrom: 5000,
  fee: 500,
});

// J. Server still overrides fake fee with zone
{
  const orders = applyClientSpbDeliveryFees(
    [
      {
        id: "o1",
        addressId: "a-murino",
        items: [
          {
            id: "g1",
            productId: "p1",
            unit: "piece",
            quantity: 1,
            unitPrice: 6999,
            lineTotal: 6999,
          },
        ],
        customItems: [],
        deliveryFee: 0,
      },
    ],
    {
      showPrices: true,
      addresses: [addrMurino],
      deliveryZones: zones,
    }
  );
  assert.equal(orders[0].deliveryFee, 700);
  assert.equal(
    (orders[0].items || []).filter(isCloverDeliveryLine)[0].lineTotal,
    700
  );
}

// L. Storefront unchanged global
{
  const ensured = ensureSpbDeliveryOnOrder({
    id: "sf",
    address: "free text",
    items: [
      {
        id: "g1",
        productId: "p1",
        unit: "piece",
        quantity: 1,
        unitPrice: 4999,
        lineTotal: 4999,
      },
    ],
    customItems: [],
    deliveryFee: 0,
  });
  assert.equal(ensured.deliveryFee, 500);
}

// Client AddressesPanel / AddressManager: no zone selector
const addressManager = readFileSync(
  path.join(root, "src/components/AddressManager.jsx"),
  "utf8"
);
assert.equal(addressManager.includes("deliveryZoneId"), false);
assert.equal(addressManager.includes("Зона доставки"), false);

const orderEditor = readFileSync(
  path.join(root, "src/screens/client/OrderEditor.jsx"),
  "utf8"
);
assert.match(
  orderEditor,
  /getDeliveryFeeForSelectedAddress/,
  "OrderEditor must preview fee from selected address zone"
);
assert.equal(
  orderEditor.includes("Зона доставки"),
  false,
  "OrderEditor must not show zone selector"
);

console.log("verify-client-delivery-zone-ui: ok");
