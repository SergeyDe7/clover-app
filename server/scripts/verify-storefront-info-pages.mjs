import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";
import {
  STOREFRONT_INFO_PAGES,
  STOREFRONT_INFO_SLUGS,
  findStorefrontInfoPage,
} from "../../src/screens/storefront/pages/infoPages.js";
import { STOREFRONT_INFO_CONTENT } from "../../src/screens/storefront/pages/infoPageContent.js";

const REQUIRED = [
  ["about", "О нас"],
  ["delivery", "Доставка"],
  ["payment", "Оплата"],
  ["returns", "Условия возврата"],
  ["wholesale", "Оптовикам"],
  ["privacy-policy", "Политика обработки персональных данных"],
  ["personal-data-consent", "Согласие на обработку персональных данных"],
];

assert.equal(STOREFRONT_INFO_PAGES.length, 7);
assert.deepEqual(
  STOREFRONT_INFO_SLUGS,
  REQUIRED.map(([slug]) => slug)
);

for (const [slug, heading] of REQUIRED) {
  const page = findStorefrontInfoPage(slug);
  assert.ok(page, `нет страницы ${slug}`);
  assert.equal(page.heading, heading);
  assert.ok(page.title);
  assert.ok(page.description);
  assert.notEqual(page.description, "Хозтовары, упаковка и химия для HoReCa");
  const blocks = STOREFRONT_INFO_CONTENT[slug];
  assert.ok(Array.isArray(blocks) && blocks.length > 0, `нет текста ${slug}`);
}

assert.equal(findStorefrontInfoPage("aktsii"), null);
assert.equal(findStorefrontInfoPage("unknown"), null);

const mode = readFileSync(
  path.join(projectRoot, "src/screens/storefront/mode.js"),
  "utf8"
);
const seo = readFileSync(
  path.join(projectRoot, "src/screens/storefront/seo.js"),
  "utf8"
);
const app = readFileSync(
  path.join(projectRoot, "src/screens/storefront/StorefrontApp.jsx"),
  "utf8"
);
const footer = readFileSync(
  path.join(projectRoot, "src/screens/storefront/components/StoreFooter.jsx"),
  "utf8"
);
const page = readFileSync(
  path.join(projectRoot, "src/screens/storefront/pages/InfoPage.jsx"),
  "utf8"
);
const sitemap = readFileSync(path.join(projectRoot, "public/sitemap.xml"), "utf8");
const robots = readFileSync(path.join(projectRoot, "public/robots.txt"), "utf8");
const pricing = readFileSync(path.join(projectRoot, "server/src/pricing.js"), "utf8");
const delivery = readFileSync(
  path.join(projectRoot, "server/src/deliveryFee.js"),
  "utf8"
);
const client = readFileSync(
  path.join(projectRoot, "src/screens/client/ClientScreen.jsx"),
  "utf8"
);
const appJsx = readFileSync(path.join(projectRoot, "src/App.jsx"), "utf8");

assert.match(mode, /STOREFRONT_INFO_SLUGS/);
assert.match(mode, /name: "info"/);
assert.match(seo, /findStorefrontInfoPage/);
assert.match(seo, /route\.name === "info"/);
assert.match(seo, /https:\/\/clover-spb\.ru\/aktsii/);
assert.doesNotMatch(seo, /noindex/i);
assert.match(app, /InfoPage/);
assert.match(app, /route\.name === "info"/);
assert.match(footer, /STOREFRONT_INFO_PAGES/);
assert.match(page, /<h1>\{page\.heading\}<\/h1>/);

for (const [slug] of REQUIRED) {
  assert.match(sitemap, new RegExp(`https://clover-spb\\.ru/${slug}`));
}
assert.match(sitemap, /https:\/\/clover-spb\.ru\/aktsii/);
assert.match(robots, /Sitemap: https:\/\/clover-spb\.ru\/sitemap\.xml/);
assert.match(robots, /Disallow: \/lk/);
assert.match(robots, /Disallow: \/api\//);
assert.doesNotMatch(robots, /Disallow: \/about/);

assert.match(client, /Повторить заказ/);
assert.match(appJsx, /openRepeat/);
assert.doesNotMatch(pricing, /STOREFRONT_INFO_|infoPages/);
assert.doesNotMatch(delivery, /STOREFRONT_INFO_|infoPages/);

console.log("verify-storefront-info-pages: ok");
