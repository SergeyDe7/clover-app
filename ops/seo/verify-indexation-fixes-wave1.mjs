#!/usr/bin/env node
/**
 * SEO Technical Indexation Fix Wave 1 — проверка production-like через nginx/--resolve.
 *
 *   node ops/seo/verify-indexation-fixes-wave1.mjs --resolve
 */
import { spawnSync } from "node:child_process";
import { getCatalogPageContent } from "../../src/screens/storefront/storefrontCatalogContent.js";
import {
  getCatalogPageSeo,
} from "../../src/screens/storefront/storefrontCatalogSeo.js";
import { buildStorefrontPath } from "../../src/screens/storefront/storefrontSlugs.js";

const ORIGIN = "https://clover-spb.ru";
const WWW = "https://www.clover-spb.ru";
const useResolve = process.argv.includes("--resolve");

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

const INVALID_CATALOG = [
  "/catalog/foo",
  "/catalog/foo-bar-baz",
  "/catalog/odnorazovaya-posuda/folga",
  "/catalog/odnorazovaya-posuda/foo",
  "/catalog/hozyajstvennye-tovary/folga-plenka",
  "/catalog/hozyajstvennye-tovary/shvabry-shchetki",
  "/catalog/hozyajstvennye-tovary/gubki-tryapki",
  "/catalog/odnorazovaya-posuda/perchatki",
  "/catalog/no-such-category",
  "/catalog/pakety-upakovochnye-materialy/nope",
];

const INVALID_PRODUCT = [
  "/product/",
  "/product",
  "/product/NOPE-ART",
  "/product/DOES-NOT-EXIST",
  "/product/___missing___",
  "/product/НЕСУЩЕСТВУЮЩИЙ",
  "/product/00000000",
  "/product/null",
  "/product/undefined",
  "/product/test-404-sku",
];

const LEGACY_CASES = [
  { path: "/каталог", expect: { type: "301", location: "/catalog" } },
  { path: "/vitrina", expect: { type: "301", location: "/" } },
  { path: "/vitrina/", expect: { type: "301", location: "/" } },
  { path: "/vitrina/catalog", expect: { type: "301", location: "/catalog" } },
  {
    path: "/vitrina/catalog/odnorazovaya-posuda",
    expect: { type: "301", location: "/catalog/odnorazovaya-posuda" },
  },
  { path: "/vitrina/lk", expect: { type: "301", location: "/lk" } },
  { path: "/magazin", expect: { type: "404" } },
  { path: "/shop", expect: { type: "404" } },
  { path: "/index.php", expect: { type: "404" } },
  { path: "/home", expect: { type: "404" } },
  { path: "/store", expect: { type: "404" } },
  { path: "/products", expect: { type: "404" } },
];

function pick(re, html) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function curlRaw(url, { hostHeader } = {}) {
  const args = [
    "-sS",
    "-k",
    "--connect-timeout",
    "15",
    "--max-redirs",
    "0",
    "-D",
    "-",
    "-o",
    "/tmp/idx-fix-body.html",
    "-w",
    "\n__META__%{http_code}|%{redirect_url}|%{url_effective}",
  ];
  if (useResolve) {
    args.push(
      "--resolve",
      "clover-spb.ru:443:127.0.0.1",
      "--resolve",
      "www.clover-spb.ru:443:127.0.0.1",
      "--resolve",
      "clover-spb.ru:80:127.0.0.1",
      "--resolve",
      "www.clover-spb.ru:80:127.0.0.1"
    );
  }
  if (hostHeader) args.push("-H", `Host: ${hostHeader}`);
  args.push(url);
  const r = spawnSync("curl", args, {
    encoding: "utf8",
    timeout: 45000,
    maxBuffer: 20 * 1024 * 1024,
  });
  const out = r.stdout || "";
  const [headers, metaLine] = out.includes("__META__")
    ? out.split("__META__")
    : [out, "000||"];
  const [code, redir] = metaLine.trim().split("|");
  let body = "";
  try {
    body = spawnSync("cat", ["/tmp/idx-fix-body.html"], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }).stdout || "";
  } catch {
    body = "";
  }
  const location =
    pick(/^\s*Location:\s*(.+)$/im, headers) || (redir || "").trim();
  return { code: (code || "").trim(), location, body, headers };
}

function curl(path) {
  return curlRaw(`${ORIGIN}${path}`);
}

function robotsIndexable(html) {
  const robots =
    pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i, html) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i, html);
  if (!robots) return true;
  return !/\bnoindex\b/i.test(robots);
}

function followOnce(url) {
  const first = curlRaw(url);
  if (!String(first.code).startsWith("3")) {
    return { hops: 1, final: first, chain: [first] };
  }
  const loc = first.location;
  if (!loc) return { hops: 1, final: first, chain: [first] };
  const second = curlRaw(loc.startsWith("http") ? loc : `${ORIGIN}${loc}`);
  return { hops: 2, final: second, chain: [first, second] };
}

// --- Sitemap ---
const sm = curl("/sitemap.xml");
const locs = [...(sm.body.matchAll(/<loc>([^<]+)<\/loc>/g) || [])].map((m) => m[1]);
const uniqueLocs = new Set(locs);
const sitemapStats = {
  count: locs.length,
  unique: uniqueLocs.size,
  duplicates: locs.length - uniqueLocs.size,
  http200: 0,
  redirects: 0,
  errors: 0,
  canonicalProblems: 0,
  noindexConflicts: 0,
};
const sitemapFails = [];
if (sm.code !== "200") {
  sitemapFails.push({ path: "/sitemap.xml", code: sm.code, kind: "sitemap-fetch" });
}
if (sitemapStats.duplicates > 0) {
  const seen = new Set();
  for (const loc of locs) {
    if (seen.has(loc)) {
      sitemapFails.push({ path: loc.replace(ORIGIN, "") || "/", code: "dup", kind: "duplicate" });
    }
    seen.add(loc);
  }
}
for (const loc of locs) {
  const path = loc.replace(ORIGIN, "") || "/";
  if (!loc.startsWith(`${ORIGIN}/`) && loc !== `${ORIGIN}/` && loc !== ORIGIN) {
    sitemapStats.errors++;
    sitemapFails.push({ path, code: "host", kind: "foreign-host", loc });
    continue;
  }
  // Non-indexable storefront surfaces must not appear in sitemap
  if (
    path === "/cart" ||
    path === "/checkout" ||
    path === "/lk" ||
    path.startsWith("/lk/") ||
    path === "/product" ||
    path === "/product/"
  ) {
    sitemapStats.noindexConflicts++;
    sitemapFails.push({ path, code: "200", kind: "non-indexable-path" });
  }
  const { code, body } = curl(path);
  if (code === "200") sitemapStats.http200++;
  else if (String(code).startsWith("3")) {
    sitemapStats.redirects++;
    sitemapFails.push({ path, code, kind: "redirect" });
  } else {
    sitemapStats.errors++;
    sitemapFails.push({ path, code, kind: "error" });
  }
  if (code === "200") {
    const can =
      pick(/rel=["']canonical["'][^>]+href=["']([^"']+)/i, body) ||
      pick(/href=["']([^"']+)["'][^>]+rel=["']canonical/i, body);
    if (can !== loc) {
      sitemapStats.canonicalProblems++;
      sitemapFails.push({ path, code, kind: "canonical", can });
    }
    // only flag explicit noindex meta in sitemap pages
    if (!robotsIndexable(body)) {
      sitemapStats.noindexConflicts++;
      sitemapFails.push({ path, code, kind: "noindex" });
    }
  }
}

function checkMeta(page) {
  const route = { name: "catalog", ...page };
  const expected = getCatalogPageSeo(route);
  const urlPath = buildStorefrontPath(route);
  const { code, body } = curl(urlPath);
  const title = pick(/<title[^>]*>([^<]+)<\/title>/i, body);
  const h1 = pick(/<h1[^>]*>([^<]+)<\/h1>/i, body);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i, body) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description/i, body);
  const canonical =
    pick(/rel=["']canonical["'][^>]+href=["']([^"']+)/i, body) ||
    pick(/href=["']([^"']+)["'][^>]+rel=["']canonical/i, body);
  const ok =
    code === "200" &&
    expected &&
    title === expected.title &&
    h1 === expected.h1 &&
    description === expected.description &&
    canonical === `${ORIGIN}${urlPath}` &&
    robotsIndexable(body);
  return { urlPath, ok, code };
}

function checkContent(page) {
  const route = { name: "catalog", ...page };
  const content = getCatalogPageContent(route);
  const urlPath = buildStorefrontPath(route);
  const { code, body } = curl(urlPath);
  if (!content) return { urlPath, ok: false };
  const ok =
    code === "200" &&
    body.includes(content.intro) &&
    content.assortment.every((l) => body.includes(l)) &&
    content.faq.every((f) => body.includes(f.q) && body.includes(f.a)) &&
    content.links.every(
      (l) => body.includes(`href="${l.path}"`) || body.includes(`href='${l.path}'`)
    );
  return { urlPath, ok };
}

const wave1 = WAVE1.map(checkMeta);
const wave2 = WAVE2.map(checkMeta);
const wave1c = WAVE1C.map(checkMeta);
const content1 = WAVE1.map(checkContent);
const content2 = WAVE2.map(checkContent);

// 30 random products from sitemap
const productLocs = locs.filter((u) => u.includes("/product/"));
const sample = [];
for (let i = 0; i < 30 && productLocs.length; i++) {
  const idx = Math.floor((i * 97 + 13) % productLocs.length);
  sample.push(productLocs[idx]);
}
const productChecks = [...new Set(sample)].slice(0, 30).map((loc) => {
  const path = loc.replace(ORIGIN, "");
  const { code, body } = curl(path);
  const can =
    pick(/rel=["']canonical["'][^>]+href=["']([^"']+)/i, body) ||
    pick(/href=["']([^"']+)["'][^>]+rel=["']canonical/i, body);
  const h1 = pick(/<h1[^>]*>([^<]+)<\/h1>/i, body);
  const ok =
    code === "200" &&
    can === loc &&
    Boolean(h1) &&
    !/Страница не найдена/i.test(h1);
  return { path, ok, code };
});

const invalidCatalog = INVALID_CATALOG.map((path) => {
  const { code, body } = curl(path);
  const ok =
    code === "404" &&
    /Страница не найдена/i.test(body) &&
    !/rel=["']canonical["'][^>]+href=["'][^"']*catalog\/foo/i.test(body);
  return { path, code, ok };
});

const invalidProduct = INVALID_PRODUCT.map((path) => {
  const { code, body } = curl(path);
  const can = pick(/rel=["']canonical["'][^>]+href=["']([^"']+)/i, body);
  const ok =
    code === "404" &&
    /Страница не найдена|Товар не найден/i.test(body) &&
    !can;
  return { path, code, ok, can };
});

const legacyResults = LEGACY_CASES.map((item) => {
  const { code, location, body } = curl(item.path);
  let ok = false;
  if (item.expect.type === "301") {
    const locPath = (location || "").replace(ORIGIN, "").split("?")[0];
    ok =
      code === "301" &&
      (locPath === item.expect.location ||
        location === `${ORIGIN}${item.expect.location}`);
  } else if (item.expect.type === "404") {
    ok = code === "404";
  }
  return {
    path: item.path,
    code,
    location,
    expect: item.expect,
    ok,
    softHome: code === "200" && /Хозтовары, упаковка/i.test(body),
  };
});

// Cyrillic category still 301
const cyrPath = `/catalog/${encodeURIComponent("Одноразовая посуда")}`;
const cyr = curl(cyrPath);
const cyrOk =
  cyr.code === "301" &&
  (cyr.location || "").includes("/catalog/odnorazovaya-posuda");

// WWW checks
const wwwPaths = [
  "/",
  "/catalog",
  "/catalog/odnorazovaya-posuda",
  "/catalog/odnorazovaya-posuda/stakany",
  "/catalog/hozyajstvennye-tovary",
  "/catalog/bumazhnaya-produkciya/salfetki",
  "/catalog/himiya-chistyashchie-sredstva",
];
// add 5 products
for (const loc of productLocs.slice(0, 5)) {
  wwwPaths.push(loc.replace(ORIGIN, ""));
}
wwwPaths.push("/catalog/odnorazovaya-posuda?utm_source=test");

const wwwResults = wwwPaths.map((path) => {
  const url = `${WWW}${path}`;
  const r = followOnce(url);
  const first = r.chain[0];
  const loc = (first.location || "").replace(/\/$/, path.endsWith("/") ? "/" : "") ;
  const expectedTarget = `${ORIGIN}${path}`;
  const ok =
    first.code === "301" &&
    r.hops === 1 &&
    (first.location === expectedTarget ||
      first.location === expectedTarget.replace(/\/$/, "") ||
      decodeURIComponent(first.location || "") === expectedTarget);
  // hops===1 means only one response checked as redirect without following to second if we count wrong
  // followOnce always fetches second if 3xx - hops 2 means chain of 2 requests. For "one redirect" we want first 301 and second 200 on apex.
  const ok2 =
    first.code === "301" &&
    (first.location === expectedTarget ||
      first.location?.replace(/\/$/, "") === expectedTarget.replace(/\/$/, "")) &&
    r.final.code === "200";
  return { path, code: first.code, location: first.location, hops: r.hops, ok: ok2 };
});

const httpWww = followOnce(`http://www.clover-spb.ru/catalog`);
const httpWwwOk =
  httpWww.chain[0].code === "301" &&
  (httpWww.chain[0].location === `${ORIGIN}/catalog` ||
    httpWww.chain[0].location === "https://clover-spb.ru/catalog");

const sitemapOk =
  sm.code === "200" &&
  sitemapStats.count > 0 &&
  sitemapStats.unique === sitemapStats.count &&
  sitemapStats.duplicates === 0 &&
  sitemapStats.http200 === sitemapStats.count &&
  sitemapStats.redirects === 0 &&
  sitemapStats.errors === 0 &&
  sitemapStats.canonicalProblems === 0 &&
  sitemapStats.noindexConflicts === 0;

const pass =
  sitemapOk &&
  wave1.every((x) => x.ok) &&
  wave2.every((x) => x.ok) &&
  wave1c.every((x) => x.ok) &&
  content1.every((x) => x.ok) &&
  content2.every((x) => x.ok) &&
  productChecks.length === 30 &&
  productChecks.every((x) => x.ok) &&
  invalidCatalog.every((x) => x.ok) &&
  invalidProduct.every((x) => x.ok) &&
  legacyResults.every((x) => x.ok) &&
  cyrOk &&
  wwwResults.every((x) => x.ok) &&
  httpWwwOk;

const report = {
  pass,
  sitemap: sitemapStats,
  wave1: `${wave1.filter((x) => x.ok).length}/10`,
  wave2: `${wave2.filter((x) => x.ok).length}/10`,
  wave1c: `${wave1c.filter((x) => x.ok).length}/3`,
  content1: `${content1.filter((x) => x.ok).length}/10`,
  content2: `${content2.filter((x) => x.ok).length}/10`,
  products: `${productChecks.filter((x) => x.ok).length}/${productChecks.length}`,
  invalidCatalog: `${invalidCatalog.filter((x) => x.ok).length}/${invalidCatalog.length}`,
  invalidProduct: `${invalidProduct.filter((x) => x.ok).length}/${invalidProduct.length}`,
  legacy: legacyResults,
  cyrillicCategory301: { path: cyrPath, code: cyr.code, location: cyr.location, ok: cyrOk },
  www: wwwResults,
  httpWww: {
    code: httpWww.chain[0].code,
    location: httpWww.chain[0].location,
    ok: httpWwwOk,
  },
  fails: {
    sitemap: sitemapFails.slice(0, 20),
    wave1: wave1.filter((x) => !x.ok),
    wave2: wave2.filter((x) => !x.ok),
    content1: content1.filter((x) => !x.ok),
    content2: content2.filter((x) => !x.ok),
    products: productChecks.filter((x) => !x.ok),
    invalidCatalog: invalidCatalog.filter((x) => !x.ok),
    invalidProduct: invalidProduct.filter((x) => !x.ok),
    legacy: legacyResults.filter((x) => !x.ok),
    www: wwwResults.filter((x) => !x.ok),
  },
};

console.log(JSON.stringify(report, null, 2));
process.exit(pass ? 0 : 1);
