#!/usr/bin/env node
/**
 * Policy/consent/banner source checks for the Metrika legal cycle.
 * Does not write the live DB, change checkout fields, or enable Metrika.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STOREFRONT_INFO_CONTENT } from "../../src/screens/storefront/pages/infoPageContent.js";
import { STOREFRONT_INFO_PAGES } from "../../src/screens/storefront/pages/infoPages.js";
import { LEGAL_INFO_PAGE_BODIES } from "../src/i18n/legalInfoPageBodyTranslations.js";
import { getInfoPageBodyBlocks } from "../src/i18n/infoPageBodyTranslationSeed.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

function flatten(blocks) {
  return (blocks || [])
    .map((block) => {
      if (block.type === "list") return (block.items || []).join("\n");
      return String(block.text || block.label || "");
    })
    .join("\n");
}

const policy = flatten(STOREFRONT_INFO_CONTENT["privacy-policy"]);
const consent = flatten(STOREFRONT_INFO_CONTENT["personal-data-consent"]);
const allRu = `${policy}\n${consent}`;

assert.match(policy, /ООО «Клевер»/);
assert.match(allRu, /ИНН 7813285010/);
assert.match(allRu, /ОГРН 1177847262669/);
assert.match(allRu, /Красного Курсанта/);
assert.match(allRu, /9112368277@mail\.ru/);
assert.doesNotMatch(allRu, /использование сайта означает согласие/i);
assert.doesNotMatch(allRu, /юридический адрес, который в этой редакции не указывается/);
assert.doesNotMatch(allRu, /сроки хранения по каждой категории в этой редакции не фиксируются/);
assert.doesNotMatch(allRu, /банковск/i);
assert.doesNotMatch(policy, /Автоматического удаления таких записей нет/);
assert.doesNotMatch(policy, /страна не определяется только по IP/);
assert.doesNotMatch(policy, /независимая проверка дата-центра/);
assert.doesNotMatch(policy, /не проверка всех внешних сервисов/);
assert.doesNotMatch(allRu, /четырёх лет/);
assert.doesNotMatch(allRu, /четыре года/);
assert.match(policy, /ООО «Филанко Санкт-Петербург»/);
assert.match(policy, /7838492138/);
assert.match(policy, /Российской Федерации/);
assert.match(policy, /402-ФЗ/);
assert.match(policy, /152-ФЗ/);
assert.match(policy, /подп\. 8 п\. 1 ст\. 23 НК РФ/);
assert.match(policy, /не отдельное юридическое лицо/);
assert.match(policy, /не означают, что все данные обязаны быть удалены ровно через пять лет/);
assert.match(policy, /Остальные данные заказа/);
assert.match(policy, /не удаляют ранее отправленные данные/);
assert.match(policy, /не являются полностью анонимными/);
assert.match(policy, /Яндекс Метрик/);
assert.match(policy, /ООО «ЯНДЕКС»/);
assert.match(policy, /yandex\.ru\/legal\/metrica_termsofuse/);
assert.match(policy, /yandex\.ru\/legal\/confidential/);
assert.match(policy, /yandex\.ru\/legal\/cookies_policy/);
assert.match(policy, /Разрешить аналитику/);
assert.match(policy, /Вебвизор выключен/);
assert.match(policy, /не включаются ФИО/);
assert.match(policy, /Личный кабинет/);
assert.match(policy, /не отменяет уже начатые запросы/);
assert.match(policy, /не удаляет ранее отправленные данные автоматически/);
assert.match(consent, /не является согласием на рекламу/);
assert.match(consent, /не является согласием на аналитику/);
assert.match(consent, /не требуется, чтобы оформить заказ/);
assert.match(consent, /подп\. 8 п\. 1 ст\. 23 НК РФ/);
assert.match(consent, /не срок удаления всех сведений заказа/);

const headings = Object.fromEntries(
  STOREFRONT_INFO_PAGES.map((page) => [page.slug, page.heading])
);
assert.equal(headings["privacy-policy"], "Политика обработки персональных данных");
assert.equal(
  headings["personal-data-consent"],
  "Согласие на обработку персональных данных"
);

for (const locale of ["en", "uz", "ky", "tg", "zh-CN", "ar"]) {
  const localized = getInfoPageBodyBlocks("privacy-policy", locale);
  assert.ok(localized?.length, `missing ${locale} policy body`);
  const text = flatten(localized);
  assert.doesNotMatch(text, /use of the website means/i);
  assert.doesNotMatch(text, /saytdan foydalanish foydalanuvchining/i);
  assert.match(text, /7813285010/);
  assert.match(text, /1177847262669/);
  assert.match(text, /9112368277@mail\.ru/);
  assert.match(text, /7838492138/);
  assert.doesNotMatch(text, /not stated here as the legal registered address/i);
  assert.doesNotMatch(text, /Specific retention periods for each category are not fixed/i);
  assert.doesNotMatch(text, /country is not determined from an IP address alone/i);
  assert.doesNotMatch(text, /independent datacenter audit/i);
  assert.doesNotMatch(text, /four years/i);
  assert.doesNotMatch(text, /to‘rt yil/);
  assert.doesNotMatch(text, /төрт жыл/);
  assert.doesNotMatch(text, /чор сол/);
  assert.doesNotMatch(text, /四年/);
  assert.doesNotMatch(text, /أربع سنوات/);
  assert.ok(LEGAL_INFO_PAGE_BODIES["personal-data-consent"][locale]?.length);
}

const catalog = read("src/shared/i18n/uiCatalog.js");
assert.match(catalog, /Мы используем Яндекс Метрику, чтобы понимать, какие страницы открывают посетители/);
assert.match(catalog, /каталог, вход и заказ работают без согласия/);
assert.match(catalog, /Отсутствие ответа не считается согласием/);
assert.match(catalog, /storefront\.checkout\.orderLegalNote/);
assert.match(catalog, /storefront\.checkout\.orderLegalLink/);

const checkout = read("src/screens/storefront/pages/CheckoutPage.jsx");
assert.match(checkout, /contactName/);
assert.match(checkout, /placeOrder/);
assert.match(checkout, /personal-data-consent/);
assert.match(checkout, /storefront\.checkout\.orderLegalNote/);
assert.doesNotMatch(checkout, /storefront\.analytics/);
assert.doesNotMatch(checkout, /data-analytics-action/);
assert.doesNotMatch(checkout, /type="checkbox"/);

const seo = read("src/screens/storefront/seo.js");
assert.match(seo, /resolveStorefrontInfoPage/);
assert.match(seo, /route\.name === "info"/);
const robots = read("public/robots.txt");
assert.doesNotMatch(robots, /Disallow: \/privacy-policy/);
assert.doesNotMatch(robots, /Disallow: \/personal-data-consent/);

const footer = read("src/screens/storefront/components/StoreFooter.jsx");
assert.match(footer, /STOREFRONT_INFO_PAGES/);
assert.match(footer, /openAnalyticsSettings/);
assert.match(footer, /readMetrikaEnvFlag/);

const rootUi = read("src/analytics/YandexMetrikaRoot.jsx");
assert.match(rootUi, /readMetrikaEnvFlag/);
assert.match(rootUi, /consentUiEnabled && record\.status === ANALYTICS_CONSENT_UNSET/);

console.log("verify-legal-metrika-policy: ok");
