import assert from "node:assert/strict";
import { build1CPayload } from "../src/exchange.js";
import {
  overlayStorefrontClientLink,
  resolveStorefrontOneCClient,
  STOREFRONT_DEFAULT_COUNTERPARTY_NAME,
} from "../src/storefrontCounterparty.js";

const products = [
  {
    id: 1,
    code: "CL-0001",
    name: "Перчатки",
    oneCId: "prod-1",
    oneCCode: "НФ-1",
    oneCName: "Перчатки 1С",
  },
];

const guestOrder = {
  id: "sf-1",
  externalId: "sf-1",
  number: "WS-260821-1",
  source: "storefront",
  guest: true,
  clientId: "guest-user",
  customerName: "Иван с сайта",
  customerContact: "Иван",
  customerPhone: "+79001112233",
  customerEmail: "ivan@example.test",
  address: "Санкт-Петербург, Невский 1",
  firstDeliveryDate: "2026-08-24",
  items: [
    {
      productId: 1,
      quantity: 2,
      unit: "piece",
      multiplier: 1,
      unitPrice: 10,
      lineTotal: 20,
      oneCId: "prod-1",
    },
  ],
};

const byName = resolveStorefrontOneCClient({
  settings: {},
  oneCClients: [
    { id: "guid-clover-shop", code: "00001", name: "Интернет магазин Clover" },
  ],
});
assert.equal(byName.id, "guid-clover-shop");
assert.equal(byName.name, STOREFRONT_DEFAULT_COUNTERPARTY_NAME);

const fallback = resolveStorefrontOneCClient({
  settings: { storefrontOneCClientName: "Интернет магазин Clover" },
  oneCClients: [],
});
assert.equal(fallback.id, "");
assert.equal(fallback.name, STOREFRONT_DEFAULT_COUNTERPARTY_NAME);

const payload = build1CPayload({
  order: guestOrder,
  products,
  clientLinks: {},
  storefrontCounterpart: byName,
});
assert.equal(payload.client.oneCId, "guid-clover-shop");
assert.equal(payload.client.oneCName, STOREFRONT_DEFAULT_COUNTERPARTY_NAME);
assert.equal(payload.client.lookupRequired, false);
assert.equal(payload.client.companyName, "Иван с сайта");

const nameOnly = build1CPayload({
  order: guestOrder,
  products,
  clientLinks: {},
});
assert.equal(nameOnly.client.oneCId, "");
assert.equal(nameOnly.client.oneCName, STOREFRONT_DEFAULT_COUNTERPARTY_NAME);
assert.equal(nameOnly.client.lookupRequired, true);

const lkOrder = { ...guestOrder, source: "lk", guest: false };
const lkLink = overlayStorefrontClientLink(
  lkOrder,
  { oneCId: "other", oneCName: "Кафе" },
  byName
);
assert.equal(lkLink.oneCId, "other");
assert.equal(lkLink.oneCName, "Кафе");

console.log("Проверка контрагента витрины для 1С пройдена успешно.");
