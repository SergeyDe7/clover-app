#!/usr/bin/env node
/**
 * SEO Structured Data Wave 1 — проверка production-like через nginx / --resolve.
 *
 *   node ops/seo/verify-structured-data-wave1.mjs --resolve
 *
 * Проверяет Organization, все storefront Product+Offer, BreadcrumbList на
 * indexable категориях/подкатегориях + sample товаров, regression SEO waves.
 */
import { spawnSync, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import {
  getCatalogPageSeo,
  isCatalogPageNoindex,
} from "../../src/screens/storefront/storefrontCatalogSeo.js";
import { getCatalogPageContent } from "../../src/screens/storefront/storefrontCatalogContent.js";
import {
  buildStorefrontPath,
  listCategorySlugEntries,
} from "../../src/screens/storefront/storefrontSlugs.js";
import { ORGANIZATION_ID, STOREFRONT_ORIGIN } from "../../src/screens/storefront/storefrontJsonLd.js";

const execFileAsync = promisify(execFile);

const ORIGIN = STOREFRONT_ORIGIN;
const useResolve = process.argv.includes("--resolve");
const CONCURRENCY = Number(process.env.SD_CONCURRENCY || 12);
const PRODUCT_SAMPLE = Number(process.env.SD_BREADCRUMB_SAMPLE || 50);

const WAVE1 = [
  { category: "Одноразовая посуда" },
  { category: "Одноразовая посуда", subcategory: "Стаканы" },
  { category: "Одноразовая посуда", subcategory: "Бумажная упаковка" },
  { category: "Одноразовая посуда", subcategory: "Контейнеры" },
  { category: "Одноразовая посуда", subcategory: "Столовые приборы" },
  { category: "Канцелярские товары" },
  { category: "Бумажная продукция", subcategory: "Салфетки" },
  { category: "Бумажная продукция", subcategory: "Бумажные полотенца" },
  { category: "Хозяйственные товары" },
  { category: "Химия, чистящие средства" },
];

const WAVE2 = [
  { category: "Одноразовая посуда", subcategory: "Тарелки, миски" },
  { category: "Одноразовая посуда", subcategory: "Формы алюминиевые" },
  { category: "Хозяйственные товары", subcategory: "Мешки для мусора" },
  { category: "Пакеты, упаковочные материалы", subcategory: "Пакеты-майки" },
  { category: "Пакеты, упаковочные материалы", subcategory: "Пакеты вакуумные" },
  { category: "Хозяйственные товары", subcategory: "Одноразовая одежда" },
  { category: "Хозяйственные товары", subcategory: "Перчатки" },
  { category: "Одноразовая посуда", subcategory: "Соусники" },
  { category: "Бумажная продукция", subcategory: "Туалетная бумага" },
  { category: "Хозяйственные товары", subcategory: "Швабры, щетки" },
];

const WAVE1C = [
  { category: "Химия, чистящие средства", subcategory: "Освежители воздуха" },
  { category: "Химия, чистящие средства", subcategory: "Отбеливатели" },
  { category: "Пакеты, упаковочные материалы", subcategory: "Пакеты zip-lock" },
];

const INVALID_PRODUCT = [
  "/product/",
  "/product",
  "/product/NOPE-ART",
  "/product/DOES-NOT-EXIST",
  "/product/___missing___",
  "/product/test-404-sku",
];

const INVALID_CATALOG = [
  "/catalog/foo",
  "/catalog/no-such-category",
  "/catalog/odnorazovaya-posuda/foo",
];

function curlArgs(url, { method = "GET", hostHeader } = {}) {
  const args = [
    "-sS",
    "-k",
    "--connect-timeout",
    "20",
    "--max-time",
    "60",
    "--max-redirs",
    "0",
    "-w",
    "\n__META__%{http_code}",
  ];
  if (useResolve) {
    args.push(
      "--resolve",
      "clover-spb.ru:443:127.0.0.1",
      "--resolve",
      "www.clover-spb.ru:443:127.0.0.1"
    );
  }
  if (hostHeader) args.push("-H", `Host: ${hostHeader}`);
  if (method === "HEAD") args.push("-I");
  args.push(url);
  return args;
}

function parseCurlOut(stdout, stderr) {
  const out = stdout || "";
  const idx = out.lastIndexOf("\n__META__");
  if (idx < 0) {
    return { code: "000", body: out, err: stderr || "no meta" };
  }
  const body = out.slice(0, idx);
  const code = out.slice(idx + "\n__META__".length).trim();
  return { code, body, err: stderr || "" };
}

function curl(url, opts = {}) {
  const r = spawnSync("curl", curlArgs(url, opts), {
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return parseCurlOut(r.stdout, r.stderr);
}

async function curlAsync(url, opts = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("curl", curlArgs(url, opts), {
      encoding: "utf8",
      timeout: 90_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return parseCurlOut(stdout, stderr);
  } catch (e) {
    return { code: "000", body: "", err: String(e.message || e) };
  }
}

function api(path) {
  const r = spawnSync(
    "curl",
    ["-sS", "--connect-timeout", "10", "--max-time", "30", `http://127.0.0.1:4100${path}`],
    { encoding: "utf8", timeout: 60_000, maxBuffer: 30 * 1024 * 1024 }
  );
  try {
    return JSON.parse(r.stdout || "{}");
  } catch {
    return {};
  }
}

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    try {
      blocks.push({ ok: true, data: JSON.parse(raw), raw });
    } catch (e) {
      blocks.push({ ok: false, error: String(e.message || e), raw });
    }
  }
  return blocks;
}

function byType(blocks, type) {
  return blocks.filter((b) => b.ok && b.data?.["@type"] === type).map((b) => b.data);
}

function pick(re, html) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function absOk(url) {
  try {
    const u = new URL(url);
    return u.origin === ORIGIN;
  } catch {
    return false;
  }
}

function seededSample(items, n) {
  if (items.length <= n) return items.slice();
  const scored = items.map((item, i) => {
    const h = createHash("sha1").update(String(item.code || i)).digest("hex");
    return { item, h };
  });
  scored.sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  return scored.slice(0, n).map((x) => x.item);
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

function checkBreadcrumb(ld, pageUrl) {
  const errors = [];
  if (!ld) {
    errors.push("missing BreadcrumbList");
    return errors;
  }
  if (ld["@id"] !== `${pageUrl}#breadcrumb`) {
    errors.push(`@id expected ${pageUrl}#breadcrumb got ${ld["@id"]}`);
  }
  const items = Array.isArray(ld.itemListElement) ? ld.itemListElement : [];
  if (items.length < 2) errors.push("too few ListItem");
  items.forEach((it, idx) => {
    const pos = idx + 1;
    if (it["@type"] !== "ListItem") errors.push(`item ${pos}: not ListItem`);
    if (it.position !== pos) errors.push(`item ${pos}: position=${it.position}`);
    if (!it.name) errors.push(`item ${pos}: empty name`);
    if (!absOk(it.item)) errors.push(`item ${pos}: bad/non-origin URL ${it.item}`);
  });
  const last = items[items.length - 1];
  if (last && last.item !== pageUrl && last.item !== `${pageUrl}/`) {
    // allow trailing slash only on home
    if (!(pageUrl.endsWith("/") === false && last.item === pageUrl)) {
      if (last.item !== pageUrl) {
        errors.push(`last item ${last.item} != page ${pageUrl}`);
      }
    }
  }
  return errors;
}

// —— main ——
const sitePayload = api("/api/public/site");
const site = sitePayload?.site || {};
const catalogPayload = api("/api/public/catalog");
const products = Array.isArray(catalogPayload?.products) ? catalogPayload.products : [];

console.log(`Public site phone=${site.contactPhone || "(none)"}`);
console.log(`Storefront products: ${products.length}`);

const report = {
  organization: { ok: false, errors: [] },
  products: {
    checked: 0,
    withProduct: 0,
    withOffer: 0,
    priceMismatch: 0,
    schemaErrors: 0,
    missingOfferPrice: [],
    failures: [],
  },
  breadcrumbs: { catalogChecked: 0, catalogOk: 0, productChecked: 0, productOk: 0, failures: [] },
  duplicates: { org: 0, product: 0, breadcrumb: 0 },
  foreignHost: 0,
  parseErrors: 0,
  invalidPages: { ok: true, failures: [] },
  regression: {},
};

// Organization (home)
{
  const { code, body } = curl(`${ORIGIN}/`);
  const blocks = extractJsonLd(body);
  report.parseErrors += blocks.filter((b) => !b.ok).length;
  const orgs = byType(blocks, "Organization");
  const productsLd = byType(blocks, "Product");
  const crumbs = byType(blocks, "BreadcrumbList");
  if (orgs.length !== 1) report.organization.errors.push(`Organization count=${orgs.length}`);
  report.duplicates.org += Math.max(0, orgs.length - 1);
  const org = orgs[0] || {};
  if (org["@id"] !== ORGANIZATION_ID) {
    report.organization.errors.push(`@id=${org["@id"]}`);
  }
  if (org.url !== `${ORIGIN}/`) report.organization.errors.push(`url=${org.url}`);
  if (org.logo !== `${ORIGIN}/apple-touch-icon.png`) {
    report.organization.errors.push(`logo=${org.logo}`);
  }
  if (site.contactPhone && org.telephone !== site.contactPhone) {
    report.organization.errors.push(`telephone mismatch`);
  }
  if (site.contactEmail && org.email !== site.contactEmail) {
    report.organization.errors.push(`email mismatch`);
  }
  if (site.contactAddress) {
    const street = org.address?.streetAddress;
    if (street !== site.contactAddress) {
      report.organization.errors.push(`address mismatch`);
    }
    if (org.address?.postalCode || org.address?.addressCountry) {
      report.organization.errors.push(`invented address fields`);
    }
  }
  if (org.sameAs) report.organization.errors.push("unexpected sameAs");
  if (code !== "200") report.organization.errors.push(`HTTP ${code}`);
  if (productsLd.length) report.organization.errors.push("Product on home");
  if (crumbs.length) report.organization.errors.push("BreadcrumbList on home");
  report.organization.ok = report.organization.errors.length === 0;
  report.organization.sample = org;
  console.log(`Organization: ${report.organization.ok ? "PASS" : "FAIL"} (${code})`);
}

// All products
console.log(`Checking ${products.length} product pages (concurrency=${CONCURRENCY})…`);
const productResults = await mapPool(products, CONCURRENCY, async (product) => {
  const path = `/product/${encodeURIComponent(product.code)}`;
  const pageUrl = `${ORIGIN}${path}`;
  const { code, body } = await curlAsync(pageUrl);
  const blocks = extractJsonLd(body);
  const parseFail = blocks.filter((b) => !b.ok).length;
  const orgs = byType(blocks, "Organization");
  const prods = byType(blocks, "Product");
  const crumbs = byType(blocks, "BreadcrumbList");
  const errors = [];
  let foreign = 0;

  if (code !== "200") errors.push(`HTTP ${code}`);
  if (orgs.length !== 1) errors.push(`Organization count=${orgs.length}`);
  if (prods.length !== 1) errors.push(`Product count=${prods.length}`);
  if (crumbs.length !== 1) errors.push(`BreadcrumbList count=${crumbs.length}`);

  const p = prods[0] || {};
  const expectedPrice = Number(product?.prices?.piece) || 0;
  const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i, body);

  if (p.name !== product.name) errors.push(`name mismatch`);
  if (p.sku !== product.code) errors.push(`sku mismatch`);
  if (!p.image) errors.push(`missing image`);
  if (p.url !== pageUrl) errors.push(`Product.url=${p.url}`);
  if (canonical && canonical !== pageUrl) errors.push(`canonical=${canonical}`);
  if (p["@id"] !== `${pageUrl}#product`) errors.push(`Product @id`);
  if (p.brand) errors.push(`unexpected brand`);
  if (/"availability"\s*:/.test(JSON.stringify(p))) errors.push(`unexpected availability`);

  let hasOffer = false;
  if (expectedPrice > 0) {
    if (!p.offers) errors.push(`missing Offer`);
    else {
      hasOffer = true;
      const o = p.offers;
      if (o["@type"] !== "Offer") errors.push(`Offer type`);
      if (o.priceCurrency !== "RUB") errors.push(`currency`);
      if (String(o.price) !== expectedPrice.toFixed(2)) {
        errors.push(`price ${o.price} != ${expectedPrice.toFixed(2)}`);
      }
      if (o.seller?.["@id"] !== ORGANIZATION_ID) errors.push(`seller`);
      if (o.url !== pageUrl) errors.push(`Offer.url`);
    }
  } else {
    errors.push(`price<=0 no Offer expected`);
  }

  for (const b of blocks) {
    if (!b.ok) continue;
    const raw = JSON.stringify(b.data);
    for (const m of raw.matchAll(/https?:\/\/[^"\\]+/g)) {
      try {
        const host = new URL(m[0]).host.toLowerCase();
        if (host === "schema.org" || host === "www.schema.org") continue;
        if (host !== "clover-spb.ru") foreign += 1;
      } catch {
        /* ignore */
      }
    }
  }

  const crumbErrors = checkBreadcrumb(crumbs[0], pageUrl);
  return {
    code: product.code,
    name: product.name,
    http: code,
    errors: [...errors, ...crumbErrors.map((e) => `crumb: ${e}`)],
    hasProduct: prods.length === 1,
    hasOffer,
    priceMismatch: errors.some((e) => e.startsWith("price ")),
    parseFail,
    dupOrg: Math.max(0, orgs.length - 1),
    dupProduct: Math.max(0, prods.length - 1),
    dupCrumb: Math.max(0, crumbs.length - 1),
    foreign,
    missingOfferPrice: expectedPrice <= 0,
  };
});

for (const r of productResults) {
  report.products.checked += 1;
  if (r.hasProduct) report.products.withProduct += 1;
  if (r.hasOffer) report.products.withOffer += 1;
  if (r.priceMismatch) report.products.priceMismatch += 1;
  if (r.errors.length) {
    report.products.schemaErrors += 1;
    if (report.products.failures.length < 25) {
      report.products.failures.push({ code: r.code, errors: r.errors });
    }
  }
  if (r.missingOfferPrice) report.products.missingOfferPrice.push(r.code);
  report.parseErrors += r.parseFail;
  report.duplicates.org += r.dupOrg;
  report.duplicates.product += r.dupProduct;
  report.duplicates.breadcrumb += r.dupCrumb;
  report.foreignHost += r.foreign;
}

console.log(
  `Products: ${report.products.checked} checked / ${report.products.withProduct} Product / ${report.products.withOffer} Offer / ${report.products.priceMismatch} price mismatch / ${report.products.schemaErrors} schema errors`
);

// Indexable catalog breadcrumbs
const catalogRoutes = [];
for (const entry of listCategorySlugEntries()) {
  const catRoute = { name: "catalog", category: entry.name };
  if (!isCatalogPageNoindex(catRoute)) catalogRoutes.push(catRoute);
  for (const child of entry.children || []) {
    const sub = {
      name: "catalog",
      category: entry.name,
      subcategory: child.name,
    };
    if (!isCatalogPageNoindex(sub)) catalogRoutes.push(sub);
  }
}

console.log(`Checking ${catalogRoutes.length} indexable catalog breadcrumbs…`);
for (const route of catalogRoutes) {
  const path = buildStorefrontPath(route);
  const pageUrl = `${ORIGIN}${path}`;
  const { code, body } = curl(pageUrl);
  const blocks = extractJsonLd(body);
  report.parseErrors += blocks.filter((b) => !b.ok).length;
  const orgs = byType(blocks, "Organization");
  const crumbs = byType(blocks, "BreadcrumbList");
  const prods = byType(blocks, "Product");
  const errors = [];
  report.breadcrumbs.catalogChecked += 1;
  if (code !== "200") errors.push(`HTTP ${code}`);
  if (orgs.length !== 1) errors.push(`Organization count=${orgs.length}`);
  if (prods.length) errors.push(`unexpected Product`);
  errors.push(...checkBreadcrumb(crumbs[0], pageUrl));
  report.duplicates.org += Math.max(0, orgs.length - 1);
  report.duplicates.breadcrumb += Math.max(0, crumbs.length - 1);

  // intermediate URLs 200
  const items = crumbs[0]?.itemListElement || [];
  for (const it of items) {
    if (!it.item) continue;
    const head = curl(it.item);
    if (head.code !== "200") errors.push(`crumb URL ${it.item} → ${head.code}`);
  }

  if (!errors.length) report.breadcrumbs.catalogOk += 1;
  else if (report.breadcrumbs.failures.length < 20) {
    report.breadcrumbs.failures.push({ path, errors });
  }
}

// Sample product breadcrumbs already validated in product loop; count sample
{
  const sample = seededSample(products, PRODUCT_SAMPLE);
  report.breadcrumbs.productChecked = sample.length;
  report.breadcrumbs.productOk = sample.filter((p) => {
    const fail = productResults.find((r) => r.code === p.code);
    return fail && fail.errors.every((e) => !e.startsWith("crumb:"));
  }).length;
  // Prefer: products with no crumb errors among sample
  report.breadcrumbs.productOk = sample.filter((p) => {
    const r = productResults.find((x) => x.code === p.code);
    return r && !r.errors.some((e) => e.startsWith("crumb:")) && r.http === "200";
  }).length;
}

console.log(
  `Breadcrumbs catalog: ${report.breadcrumbs.catalogOk}/${report.breadcrumbs.catalogChecked}; product sample: ${report.breadcrumbs.productOk}/${report.breadcrumbs.productChecked}`
);

// Invalid / noindex-ish pages: no Product schema
for (const path of [...INVALID_PRODUCT, ...INVALID_CATALOG, "/cart", "/checkout"]) {
  const { code, body } = curl(`${ORIGIN}${path}`);
  const blocks = extractJsonLd(body);
  const prods = byType(blocks, "Product");
  const crumbs = byType(blocks, "BreadcrumbList");
  if (prods.length) {
    report.invalidPages.ok = false;
    report.invalidPages.failures.push({ path, code, issue: "Product schema present" });
  }
  if (path.startsWith("/product") && code === "404" && prods.length) {
    report.invalidPages.ok = false;
  }
  // cart/checkout should not look like category breadcrumbs either
  if ((path === "/cart" || path === "/checkout") && crumbs.length) {
    report.invalidPages.ok = false;
    report.invalidPages.failures.push({ path, code, issue: "BreadcrumbList present" });
  }
  if (path.startsWith("/catalog/") && code === "404" && (prods.length || crumbs.length)) {
    report.invalidPages.ok = false;
    report.invalidPages.failures.push({
      path,
      code,
      issue: `schema on 404 (Product=${prods.length}, Crumb=${crumbs.length})`,
    });
  }
}
{
  const { code, body } = curl(`${ORIGIN}/lk`);
  const prods = byType(extractJsonLd(body), "Product");
  if (prods.length) {
    report.invalidPages.ok = false;
    report.invalidPages.failures.push({ path: "/lk", code, issue: "Product schema" });
  }
}

console.log(`Invalid pages Product schema: ${report.invalidPages.ok ? "PASS" : "FAIL"}`);

// Regression meta/content
function checkWave(pages, kind) {
  let ok = 0;
  for (const page of pages) {
    const route = { name: "catalog", ...page };
    const path = buildStorefrontPath(route);
    const { code, body } = curl(`${ORIGIN}${path}`);
    const title = pick(/<title[^>]*>([^<]+)<\/title>/i, body);
    const h1 = pick(/<h1[^>]*>([^<]+)<\/h1>/i, body);
    const expected = getCatalogPageSeo(route);
    if (kind === "meta") {
      if (code === "200" && expected && title === expected.title && h1 === expected.h1) ok += 1;
    } else if (kind === "content") {
      const content = getCatalogPageContent(route);
      const hasIntro = content?.intro && body.includes(content.intro.slice(0, 40));
      if (code === "200" && hasIntro) ok += 1;
    } else if (kind === "wave1c") {
      if (code === "200" && expected) ok += 1;
    }
  }
  return `${ok}/${pages.length}`;
}

report.regression.wave1Meta = checkWave(WAVE1, "meta");
report.regression.wave2Meta = checkWave(WAVE2, "meta");
report.regression.contentW1 = checkWave(WAVE1, "content");
report.regression.contentW2 = checkWave(WAVE2, "content");
report.regression.wave1c = checkWave(WAVE1C, "wave1c");

{
  const sm = curl(`${ORIGIN}/sitemap.xml`);
  const locs = [...(sm.body || "").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  report.regression.sitemapCount = locs.length;
  let ok200 = 0;
  // sample check all locs would be heavy; check count + spot products length consistency
  const productLocs = locs.filter((u) => u.includes("/product/"));
  report.regression.sitemapProducts = productLocs.length;
  report.regression.sitemapHttpHint = sm.code;
}

report.regression.productsTotalHint = api("/api/public/catalog")?.products
  ? undefined
  : undefined;

// print summary JSON-ish
const summary = {
  organization: report.organization.ok ? "PASS" : "FAIL",
  organizationErrors: report.organization.errors,
  products: `${report.products.checked} checked / ${report.products.withProduct} Product / ${report.products.withOffer} Offer / ${report.products.priceMismatch} price mismatch / ${report.products.schemaErrors} schema errors`,
  missingOfferPrice: report.products.missingOfferPrice,
  productFailuresSample: report.products.failures,
  breadcrumbsCatalog: `${report.breadcrumbs.catalogOk}/${report.breadcrumbs.catalogChecked}`,
  breadcrumbsProductSample: `${report.breadcrumbs.productOk}/${report.breadcrumbs.productChecked}`,
  breadcrumbFailures: report.breadcrumbs.failures,
  duplicates: report.duplicates,
  foreignHost: report.foreignHost,
  parseErrors: report.parseErrors,
  invalidPages: report.invalidPages,
  regression: report.regression,
  storefrontCount: products.length,
  organizationSample: report.organization.sample,
};

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));

const hardFail =
  !report.organization.ok ||
  report.products.schemaErrors > 0 ||
  report.products.priceMismatch > 0 ||
  report.breadcrumbs.catalogOk !== report.breadcrumbs.catalogChecked ||
  !report.invalidPages.ok ||
  report.parseErrors > 0 ||
  report.duplicates.org + report.duplicates.product + report.duplicates.breadcrumb > 0 ||
  report.foreignHost > 0;

process.exit(hardFail ? 1 : 0);
