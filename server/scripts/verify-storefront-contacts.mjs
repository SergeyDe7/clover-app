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
import {
  normalizeYandexMapsUrl,
  parseYandexMapsPoint,
  yandexStaticMapSrc,
  yandexMapWidgetSrc,
  clampYandexZoom,
} from "../../src/shared/yandexMaps.js";

const merged = mergeStorefrontSettings(
  { storefrontHeroTitle: "Keep" },
  {
    storefrontContactPhone: " +7 (921) 000-00-00 ",
    storefrontContactEmail: " hello@clover-spb.ru ",
    storefrontContactAddress: " Санкт-Петербург, Невский 1 ",
    storefrontContactHours: "Пн–Пт 9:00–18:00",
    storefrontContactMapsUrl:
      "https://yandex.ru/maps/?ll=30.3141,59.9386&z=15&pt=30.3141,59.9386,pm2rdm",
    storefrontContactMapImageUrl: "/uploads/storefront-map-1.png",
  }
);
assert.equal(merged.storefrontHeroTitle, "Keep");
assert.equal(merged.storefrontContactPhone, "+7 (921) 000-00-00");
assert.equal(merged.storefrontContactEmail, "hello@clover-spb.ru");
assert.equal(merged.storefrontContactAddress, "Санкт-Петербург, Невский 1");
assert.equal(merged.storefrontContactHours, "Пн–Пт 9:00–18:00");
assert.equal(
  merged.storefrontContactMapsUrl,
  "https://yandex.ru/maps/?ll=30.3141,59.9386&z=15&pt=30.3141,59.9386,pm2rdm"
);
assert.equal(merged.storefrontContactMapImageUrl, "/uploads/storefront-map-1.png");
assert.equal(
  mergeStorefrontSettings({}, { storefrontContactMapsUrl: "javascript:alert(1)" })
    .storefrontContactMapsUrl,
  ""
);
assert.equal(
  mergeStorefrontSettings({}, { storefrontContactMapImageUrl: "https://evil.example/x.png" })
    .storefrontContactMapImageUrl,
  ""
);

const site = buildPublicSite(merged);
assert.equal(site.contactPhone, "+7 (921) 000-00-00");
assert.equal(site.contactEmail, "hello@clover-spb.ru");
assert.equal(site.contactAddress, "Санкт-Петербург, Невский 1");
assert.equal(site.contactHours, "Пн–Пт 9:00–18:00");
assert.ok(site.contactMapsUrl.includes("yandex.ru/maps"));
assert.equal(site.contactMapImageUrl, "/uploads/storefront-map-1.png");

const settings = getStorefrontSettings({
  storefrontContactEmail: `${"a".repeat(250)}@x.ru`,
});
assert.equal(settings.storefrontContactEmail.length, 254);

const stripped = stripStorefrontSettings({
  storefrontContactPhone: "x",
  storefrontContactEmail: "y",
  storefrontContactAddress: "z",
  storefrontContactMapsUrl: "u",
  managerPhone: "keep",
});
assert.equal(stripped.storefrontContactPhone, undefined);
assert.equal(stripped.storefrontContactAddress, undefined);
assert.equal(stripped.managerPhone, "keep");
assert.ok(STOREFRONT_SETTING_KEYS.includes("storefrontContactAddress"));
assert.ok(STOREFRONT_SETTING_KEYS.includes("storefrontContactMapsUrl"));
assert.ok(STOREFRONT_SETTING_KEYS.includes("storefrontContactMapImageUrl"));

assert.equal(normalizeYandexMapsUrl("https://evil.example/maps"), "");
assert.equal(normalizeYandexMapsUrl("javascript:alert(1)"), "");
assert.ok(
  normalizeYandexMapsUrl("yandex.ru/maps/-/CHxxxx").includes("yandex.ru/maps")
);
assert.ok(
  normalizeYandexMapsUrl("https://n.maps.yandex.ru/?ll=30.4,59.9").includes(
    "n.maps.yandex.ru"
  )
);
assert.ok(
  normalizeYandexMapsUrl(
    "https://yandex.ru/map-widget/v1/?um=constructor%3Aabc"
  ).includes("map-widget")
);
const point = parseYandexMapsPoint(
  "https://n.maps.yandex.ru/?ll=30.3141,59.9386&z=15"
);
assert.equal(point.lon, 30.3141);
assert.equal(point.lat, 59.9386);
assert.equal(point.zoom, 15);
const liveMaps = parseYandexMapsPoint(
  "https://yandex.ru/maps/2/saint-petersburg/?ll=30.391976%2C59.888748&mode=whatshere&whatshere%5Bpoint%5D=30.391850%2C59.888885&whatshere%5Bzoom%5D=19.31&z=19.31"
);
assert.ok(liveMaps);
assert.equal(liveMaps.zoom, 19);
assert.ok(liveMaps.zoom > 4);
assert.match(yandexStaticMapSrc(point), /static-maps\.yandex\.ru/);
assert.match(yandexStaticMapSrc(point), /pm2rdm/);
assert.match(yandexStaticMapSrc({ ...point, zoom: 10 }), /(?:\?|&)z=10(?:&|$)/);
assert.match(yandexStaticMapSrc({ ...point, zoom: 18 }), /(?:\?|&)z=18(?:&|$)/);
assert.match(yandexMapWidgetSrc({ ...point, zoom: 10 }), /(?:\?|&)z=10(?:&|$)/);
assert.equal(clampYandexZoom(""), 16);
assert.equal(clampYandexZoom(3.2), 3);
assert.equal(clampYandexZoom(-4), 1);
assert.equal(clampYandexZoom(40), 21);

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
const page = readFileSync(
  path.join(projectRoot, "src/screens/storefront/pages/ContactsPage.jsx"),
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
const mode = readFileSync(
  path.join(projectRoot, "src/screens/storefront/mode.js"),
  "utf8"
);
const server = readFileSync(path.join(projectRoot, "server/src/server.js"), "utf8");

assert.match(header, /StorefrontContacts/);
assert.doesNotMatch(
  header,
  /sf-header-phone|contactPhone|showHomePhone/,
  "В шапке витрины нет телефона — он только на странице контактов."
);
assert.match(
  header,
  /sf-cart-mobile[\s\S]*StorefrontContacts[\s\S]*sf-login/,
  "«Контакты» стоят между «Корзина» и «Войти в ЛК»."
);
assert.match(contacts, /name: "contacts"/);
assert.match(page, /Режим работы/);
assert.match(page, /Связаться/);
assert.match(page, /Как нас найти/);
assert.match(page, /Позвонить/);
assert.match(page, /Написать/);
assert.match(page, /label="Телефон"/);
assert.match(page, /label="Почта"/);
assert.match(page, /label="Адрес"/);
assert.doesNotMatch(
  page,
  /телефон, почта, адрес и как нас найти/,
  "На странице контактов нет старой поясняющей подсказки под заголовком."
);
assert.doesNotMatch(
  page,
  /Позвоните или напишите/,
  "Под заголовком «Контакты» нет абзаца «Позвоните или напишите…»."
);
assert.match(page, /mailto:/);
assert.match(page, /javascript/i);
assert.match(page, /yandexStaticMapSrc/);
assert.match(page, /yandexEmbedSrc/);
assert.match(page, /Открыть в Яндекс.Картах/);
assert.match(page, /Увеличить карту/);
assert.match(page, /Уменьшить карту/);
assert.match(page, /yandexMapWidgetSrc/);
assert.match(page, /MAP_Z_MIN = 4/);
assert.match(page, /MAP_Z_MAX = 21/);
assert.match(page, /geoZoom/);
assert.match(page, /data-map-geo/);
assert.doesNotMatch(
  page,
  /MAP_ZOOM_MIN = 1/,
  "Минус не заблокирован на стартовом CSS-scale=1: зум идёт через z Яндекса."
);
assert.match(admin, /Контакты на витрине/);
assert.match(admin, /storefrontContactAddress/);
assert.match(admin, /storefrontContactHours/);
assert.match(admin, /storefrontContactMapsUrl/);
assert.match(admin, /uploadStorefrontMapImage/);
assert.match(api, /site\(\)/);
assert.match(mode, /name: "contacts"/);
assert.match(server, /\/api\/public\/site/);
assert.match(server, /\/api\/admin\/storefront\/map-image/);

const css = readFileSync(
  path.join(projectRoot, "src/screens/storefront/storefront.css"),
  "utf8"
);
assert.match(css, /\.sf-contacts-page|\.sf-contacts-sheet/);
assert.match(css, /\.sf-contacts-map-zoom/);
assert.match(
  css,
  /\.sf-contacts-col \{[\s\S]*?overflow:\s*hidden/,
  "Зелёная полоса обрезается скруглением карточки."
);
assert.doesNotMatch(
  css,
  /\.sf-contacts-col::before \{[\s\S]*?border-radius:\s*22px 0 0 22px/,
  "Радиус 22px на полоске 5px не скругляет ободок по карточке."
);
assert.doesNotMatch(
  css,
  /\.sf-header-phone/,
  "Стилей телефона в шапке больше нет."
);

console.log("verify-storefront-contacts: ok");
