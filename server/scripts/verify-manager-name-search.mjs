import assert from "node:assert/strict";
import {
  matchesTextSearch,
  buildClientSearchHaystack,
  buildOrderSearchHaystack,
  translitRuToLat,
} from "../../src/shared/appHelpers.js";

assert.equal(translitRuToLat("Кореана"), "koreana");
assert.equal(matchesTextSearch('Koreana ООО "Кореана Рест"', "Кореана"), true);
assert.equal(matchesTextSearch('Бар "FRANK", Рубинштейна', "FRANK"), true);
assert.equal(matchesTextSearch('Бар "FRANK", Рубинштейна', "frank"), true);

const client = {
  companyName: "TEST1",
  contactName: "Иван",
  phone: "+7 (911) 111-11-11",
  email: "a@b.c",
};
const link = {
  oneCMatchName: 'Бар "FRANK", Рубинштейна, 29/28',
  oneCName: 'Бар "FRANK", Рубинштейна, 29/28',
  oneCCode: "НФ-000820",
};
const clientHay = buildClientSearchHaystack(client, link);
assert.equal(matchesTextSearch(clientHay, "FRANK"), true);
assert.equal(matchesTextSearch(clientHay, "TEST1"), true);
assert.equal(matchesTextSearch(clientHay, "9111111111"), true);
assert.equal(matchesTextSearch(clientHay, "НФ-000820"), true);
assert.equal(matchesTextSearch(clientHay, "7801576790"), false);
const withInn = buildClientSearchHaystack(client, { ...link, oneCInn: "7801576790", oneCMatchInn: "" });
assert.equal(matchesTextSearch(withInn, "7801576790"), true);
assert.equal(matchesTextSearch(withInn, "7801 576790"), true);

const orderHay = buildOrderSearchHaystack(
  {
    number: "CL-1",
    customerName: "TEST1",
    customerPhone: "+79111111111",
    address: "Невский",
  },
  link
);
assert.equal(matchesTextSearch(orderHay, "FRANK"), true);
assert.equal(matchesTextSearch(orderHay, "TEST1"), true);
assert.equal(matchesTextSearch(orderHay, "Невский"), true);
assert.equal(matchesTextSearch(buildClientSearchHaystack({
  companyName: "X",
  addresses: [{ label: "Основной", address: "Рубинштейна, 29" }],
}, {}), "Рубинштейна"), true);

assert.equal(matchesTextSearch(buildOrderSearchHaystack({
  number: "CL-42",
  customerEmail: "shop@example.com",
}, {}), "CL-42"), true);
assert.equal(matchesTextSearch(buildOrderSearchHaystack({
  number: "CL-42",
  customerEmail: "shop@example.com",
}, {}), "shop@example.com"), true);

console.log("verify-manager-name-search: ok");
