import assert from "node:assert/strict";
import { build1CPayload, validateOrderFor1C } from "../src/exchange.js";

const products = [
  {
    id: 1,
    code: "CL-0001",
    name: "Красивые перчатки для сайта",
    oneCId: "d7e2aad0-e049-11e9-9ba2-9cda3efabffd",
    oneCCode: "НФ-00000742",
    oneCName: "Перчатки Нитриловые черные XL (100шт)",
  },
  {
    id: 2,
    code: "CL-0002",
    name: "Банка для супа 500 мл",
    oneCId: "4426db82-2b81-11e9-9b9e-9cda3efabffd",
    oneCCode: "НФ-00000252",
    oneCName: "Банка суповая 500 мл Перинт (50/400)",
  },
];
const order = {
  id: "order-1",
  externalId: "CLOVER-ORDER-1",
  number: "CL-260724-161838-797",
  clientId: "client-1",
  customerName: "Восточная лавка",
  customerContact: "Виктор",
  customerPhone: "+79117908089",
  customerEmail: "vl@example.test",
  address: "СПб, ул. Софийская 4к3",
  firstDeliveryDate: "2026-07-25",
  items: [
    { productId: 1, name: products[0].name, unit: "piece", quantity: 1, multiplier: 1, unitPrice: 200, lineTotal: 200 },
    { productId: 2, name: products[1].name, unit: "piece", quantity: 1, multiplier: 1, unitPrice: 75, lineTotal: 75 },
  ],
};

const validationWithoutClientLink = validateOrderFor1C({ order, products, clientLinks: {} });
assert.equal(validationWithoutClientLink.ready, true);
assert.equal(validationWithoutClientLink.clientLookupRequired, true);
assert.ok(validationWithoutClientLink.warnings.length > 0);

const payload = build1CPayload({ order, products, clientLinks: {} });
assert.equal(payload.items[0].oneCId, products[0].oneCId);
assert.equal(payload.items[1].oneCId, products[1].oneCId);
assert.equal(payload.items[0].name, products[0].oneCName);
assert.equal(payload.items[0].displayName, products[0].name);
assert.equal(payload.totals.amount, 275);
assert.equal(payload.validation.ready, true);


const hintedPayload = build1CPayload({
  order,
  products,
  clientLinks: {
    "client-1": {
      matched1C: false,
      oneCMatchCode: "НФ-КЛ-0001",
      oneCMatchName: "Восточная лавка (контрагент)",
      oneCMatchInn: "7812345678",
    },
  },
});
assert.equal(hintedPayload.client.oneCId, "");
assert.equal(hintedPayload.client.oneCCode, "НФ-КЛ-0001");
assert.equal(hintedPayload.client.oneCName, "Восточная лавка (контрагент)");
assert.equal(hintedPayload.client.oneCInn, "7812345678");
assert.equal(hintedPayload.client.lookupRequired, true);

const linkedPayload = build1CPayload({
  order,
  products,
  clientLinks: {
    "client-1": { matched1C: true, oneCId: "client-onec-id", oneCName: "Восточная лавка" },
  },
});
assert.equal(linkedPayload.client.oneCId, "client-onec-id");
assert.equal(linkedPayload.validation.clientLookupRequired, false);

console.log("Проверка передачи разных ID товаров, красивых названий и клиента в заказ 1С пройдена успешно.");
