import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";
import {
  buildPublicSite,
  getStorefrontSettings,
  mergeStorefrontSettings,
  stripStorefrontSettings,
  STOREFRONT_SETTING_KEYS,
} from "../src/storefrontPublic.js";

const merged = mergeStorefrontSettings(
  { storefrontHeroTitle: "Keep" },
  {
    storefrontContactPhone: " +7 (921) 000-00-00 ",
    storefrontContactEmail: " hello@clover-spb.ru ",
  }
);
assert.equal(merged.storefrontHeroTitle, "Keep");
assert.equal(merged.storefrontContactPhone, "+7 (921) 000-00-00");
assert.equal(merged.storefrontContactEmail, "hello@clover-spb.ru");

const site = buildPublicSite(merged);
assert.equal(site.contactPhone, "+7 (921) 000-00-00");
assert.equal(site.contactEmail, "hello@clover-spb.ru");
assert.equal(site.heroTitle, "Keep");

const settings = getStorefrontSettings({
  storefrontContactEmail: `${"a".repeat(250)}@x.ru`,
});
assert.equal(settings.storefrontContactEmail.length, 254);

const stripped = stripStorefrontSettings({
  storefrontContactPhone: "x",
  storefrontContactEmail: "y",
  managerPhone: "keep",
});
assert.equal(stripped.storefrontContactPhone, undefined);
assert.equal(stripped.storefrontContactEmail, undefined);
assert.equal(stripped.managerPhone, "keep");
assert.ok(STOREFRONT_SETTING_KEYS.includes("storefrontContactPhone"));
assert.ok(STOREFRONT_SETTING_KEYS.includes("storefrontContactEmail"));

const header = readFileSync(
  path.join(projectRoot, "src/screens/storefront/components/StoreHeader.jsx"),
  "utf8"
);
const contacts = readFileSync(
  path.join(
    projectRoot,
    "src/screens/storefront/components/StorefrontContacts.jsx"
  ),
  "utf8"
);
const admin = readFileSync(
  path.join(projectRoot, "src/screens/manager/ManagerStorefront.jsx"),
  "utf8"
);
const api = readFileSync(
  path.join(projectRoot, "src/screens/storefront/publicApi.js"),
  "utf8"
);
const server = readFileSync(path.join(projectRoot, "server/src/server.js"), "utf8");

assert.match(header, /StorefrontContacts/);
assert.match(
  header,
  /sf-cart-mobile[\s\S]*StorefrontContacts[\s\S]*sf-login/,
  "«Контакты» стоят между «Корзина» и «Войти в ЛК»."
);
assert.match(contacts, /Контакты/);
assert.match(contacts, /mailto:/);
assert.match(contacts, /Позвонить/);
assert.match(contacts, /Написать/);
assert.match(
  contacts,
  /javascript/i,
  "mailto не должен принимать javascript: — проверка в mailtoHref."
);
assert.match(admin, /Контакты на витрине/);
assert.match(admin, /storefrontContactPhone/);
assert.match(admin, /storefrontContactEmail/);
assert.match(api, /site\(\)/);
assert.match(server, /\/api\/public\/site/);

const css = readFileSync(
  path.join(projectRoot, "src/screens/storefront/storefront.css"),
  "utf8"
);
assert.match(css, /\.sf-contacts-panel\s*\{/);

console.log("verify-storefront-contacts: ok");
