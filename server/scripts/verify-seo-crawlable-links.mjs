import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildIndexableRouteDescriptors,
  buildLocalizedRouteManifest,
} from "../../src/shared/sitemap/localizedSitemap.js";
import { publicPathForLocale } from "../../src/shared/i18n/publicLocaleRouting.js";
import { sitemapStorefrontPath } from "../../src/shared/sitemap/sitemapContract.js";
import { renderPublicRouteHtml } from "../../src/shared/sitemap/publicRouteHtml.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const category = "Одноразовая посуда";
const subcategory = "Для суши и лапши";
const productCode = "НФ-SEO-0001";
const productName = "Контейнер <тест>";
const product = {
  id: "seo-product-1",
  code: productCode,
  name: productName,
  category,
  subcategory,
  active: true,
  showOnStorefront: true,
  storefrontDetails: {
    description: "Крафтовый контейнер для горячих блюд.",
  },
};

const descriptors = buildIndexableRouteDescriptors({
  staticPaths: ["/", "/catalog"],
  categories: [category],
  subcategories: [{ category, subcategory }],
  publicProducts: [product],
});
const manifest = buildLocalizedRouteManifest({
  descriptors,
  enabledLanguages: ["ru", "en"],
  products: [product],
});
const baseHtml = '<!doctype html><html lang="ru"><head><title>Clover</title></head><body><div id="root"></div></body></html>';

function routePath(route, locale = "ru") {
  return publicPathForLocale(sitemapStorefrontPath(route), locale);
}

function rendered(pathname) {
  const record = manifest.routes[pathname];
  assert.ok(record, `missing manifest route ${pathname}`);
  return renderPublicRouteHtml(baseHtml, record, { indexable: true });
}

const catalogPath = routePath({ name: "catalog" });
const categoryPath = routePath({ name: "catalog", category });
const subcategoryPath = routePath({ name: "catalog", category, subcategory });
const productPath = routePath({ name: "product", code: productCode });

const catalogHtml = rendered(catalogPath);
assert.match(catalogHtml, /<main\b[^>]*data-seo-snapshot="ru"/);
assert.match(catalogHtml, /<h1>[^<]*Каталог[^<]*<\/h1>/);
assert.ok(
  catalogHtml.includes(`href="${categoryPath}"`),
  "Russian catalog snapshot must link to its category"
);

const categoryHtml = rendered(categoryPath);
assert.ok(
  categoryHtml.includes(`href="${subcategoryPath}"`),
  "Russian category snapshot must link to its subcategory"
);

const subcategoryHtml = rendered(subcategoryPath);
assert.ok(
  subcategoryHtml.includes(`href="${productPath}"`),
  "Russian subcategory snapshot must link to its product"
);
assert.match(subcategoryHtml, /Контейнер &lt;тест&gt;/);
assert.doesNotMatch(subcategoryHtml, /Контейнер <тест>/);

const productHtml = rendered(productPath);
assert.ok(
  productHtml.includes(`href="${subcategoryPath}"`),
  "Russian product snapshot must link back to its indexable taxonomy parent"
);

const englishCatalogHtml = rendered(routePath({ name: "catalog" }, "en"));
assert.doesNotMatch(
  englishCatalogHtml,
  /data-seo-snapshot=/,
  "This SEO wave must add initial crawlable snapshots only to /ru/"
);

const productCard = readFileSync(
  path.join(projectRoot, "src/screens/storefront/components/ProductCard.jsx"),
  "utf8"
);
const groupNav = readFileSync(
  path.join(projectRoot, "src/screens/storefront/components/CatalogGroupNav.jsx"),
  "utf8"
);
const catalogPage = readFileSync(
  path.join(projectRoot, "src/screens/storefront/pages/CatalogPage.jsx"),
  "utf8"
);

for (const [name, source] of [
  ["ProductCard", productCard],
  ["CatalogGroupNav", groupNav],
  ["CatalogPage", catalogPage],
]) {
  assert.match(source, /storefrontHref/, `${name} must generate real href values`);
}
assert.match(productCard, /<a\b[\s\S]*?href=\{storefrontHref/);
assert.match(groupNav, /<a\b[\s\S]*?href=\{storefrontHref/);
assert.match(catalogPage, /<a\b[\s\S]*?href=\{storefrontHref/);

console.log("SEO_CRAWLABLE_LINKS_VERIFY_PASS");
