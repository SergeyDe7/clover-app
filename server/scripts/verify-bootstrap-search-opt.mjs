import assert from "node:assert/strict";
import { publicClientSettings, CLIENT_SETTINGS_KEYS } from "../src/clientSettings.js";
import {
  searchOneCProductsIndexed,
  resetOneCProductSearchIndex,
} from "../src/oneCSearchIndex.js";

const settings = {
  showPrices: true,
  managerNotifyEmail: true,
  managerNotificationEmail: "secret@example.com",
  managerTelegramChatId: "123",
  managerFullName: "Иван",
  managerPhone: "+7",
};

const pub = publicClientSettings(settings);
assert.equal(pub.showPrices, true);
assert.equal(pub.managerFullName, "Иван");
assert.equal(pub.managerNotifyEmail, undefined);
assert.equal(pub.managerNotificationEmail, undefined);
assert.equal(pub.managerTelegramChatId, undefined);
assert.ok(CLIENT_SETTINGS_KEYS.includes("managerPhone"));

resetOneCProductSearchIndex();
const catalog = [
  { id: "1", code: "A1", name: "Салфетка белая" },
  { id: "2", code: "B2", name: "Мыло жидкое" },
  { id: "3", code: "C3", name: "Салфетка синяя" },
];
const found = searchOneCProductsIndexed(catalog, { search: "салфет", limit: 10, offset: 0 });
assert.equal(found.total, 2);
assert.equal(found.items.length, 2);
const again = searchOneCProductsIndexed(catalog, { search: "салфет", limit: 10, offset: 0 });
assert.equal(again.total, 2);
const page = searchOneCProductsIndexed(catalog, { search: "", limit: 2, offset: 1 });
assert.equal(page.total, 3);
assert.equal(page.items.length, 2);

console.log("verify-bootstrap-search-opt: ok");
