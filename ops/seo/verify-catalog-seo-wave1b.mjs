#!/usr/bin/env node
/**
 * Проверка SEO Wave 1b на публичной витрине (или локально через Host).
 *
 *   node ops/seo/verify-catalog-seo-wave1b.mjs
 *   node ops/seo/verify-catalog-seo-wave1b.mjs --local   # http://127.0.0.1:5273 + Host
 *   node ops/seo/verify-catalog-seo-wave1b.mjs --resolve # curl --resolve :443→127.0.0.1
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCatalogPageSeo, listCatalogSeoOverridePaths, isCatalogPageNoindex } from "../../src/screens/storefront/storefrontCatalogSeo.js";
import { buildStorefrontPath, listCategorySlugEntries } from "../../src/screens/storefront/storefrontSlugs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ORIGIN = "https://clover-spb.ru";
const useLocal = process.argv.includes("--local");
const useResolve = process.argv.includes("--resolve");

const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(__dirname, "seo-wave1b-reclass-manifest.json"), "utf8")
);

function pick(re, html) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function curl(urlPath, { api = false } = {}) {
  if (api) {
    const base = useLocal || useResolve ? "http://127.0.0.1:4100" : ORIGIN;
    const url = `${base}${urlPath}`;
    const code = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "-k", "--connect-timeout", "15", url], {
      encoding: "utf8",
      timeout: 30000,
    });
    const body = spawnSync("curl", ["-sS", "-k", "--connect-timeout", "15", url], {
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { code: (code.stdout || "").trim(), html: body.stdout || "" };
  }

  if (useLocal) {
    const url = `http://127.0.0.1:5273${urlPath}`;
    const headers = ["-H", "Host: clover-spb.ru"];
    const code = spawnSync(
      "curl",
      ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--connect-timeout", "15", ...headers, url],
      { encoding: "utf8", timeout: 30000 }
    );
    const body = spawnSync("curl", ["-sS", "--connect-timeout", "15", ...headers, url], {
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { code: (code.stdout || "").trim(), html: body.stdout || "" };
  }

  const url = `${ORIGIN}${urlPath}`;
  const args = ["-sS", "-k", "--connect-timeout", "20"];
  if (useResolve) args.push("--resolve", "clover-spb.ru:443:127.0.0.1");
  const codeArgs = [...args, "-o", "/dev/null", "-w", "%{http_code}", url];
  const code = spawnSync("curl", codeArgs, { encoding: "utf8", timeout: 45000 });
  const body = spawnSync("curl", [...args, url], {
    encoding: "utf8",
    timeout: 45000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return { code: (code.stdout || "").trim(), html: body.stdout || "" };
}

function robotsOf(html) {
  return (
    pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i, html) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i, html)
  );
}

function canonicalOf(html) {
  return (
    pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i, html) ||
    pick(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i, html)
  );
}

const sitemap = curl("/sitemap.xml");
const locs = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const noindexPaths = MANIFEST.noindexPaths || [];
const noindexResults = noindexPaths.map((p) => {
  const { code, html } = curl(p);
  const robots = robotsOf(html);
  const canonical = canonicalOf(html);
  const full = `${ORIGIN}${p}`;
  const checks = {
    http200: code === "200",
    robots: robots === "noindex, follow",
    canonical: canonical === full,
    notInSitemap: !locs.includes(full),
  };
  return { path: p, code, robots, canonical, checks, ok: Object.values(checks).every(Boolean) };
});

const indexMust = [
  "/catalog/himiya-chistyashchie-sredstva/universalnye",
  "/catalog/himiya-chistyashchie-sredstva/dlya-posudomoechnyh-mashin",
  "/catalog/pakety-upakovochnye-materialy/bumazhnye-pakety-s-ruchkoj",
];
const indexResults = indexMust.map((p) => {
  const { code, html } = curl(p);
  const robots = robotsOf(html);
  const canonical = canonicalOf(html);
  const full = `${ORIGIN}${p}`;
  const checks = {
    http200: code === "200",
    indexable: !robots || !/noindex/i.test(robots),
    canonical: canonical === full,
    inSitemap: locs.includes(full),
  };
  return { path: p, code, robots, canonical, checks, ok: Object.values(checks).every(Boolean) };
});

// 48 indexable taxonomy in sitemap
const indexableTaxonomy = [];
const noindexTaxonomy = [];
indexableTaxonomy.push("/catalog");
for (const entry of listCategorySlugEntries()) {
  const catRoute = { name: "catalog", category: entry.name };
  const catPath = buildStorefrontPath(catRoute);
  if (isCatalogPageNoindex(catRoute)) noindexTaxonomy.push(catPath);
  else indexableTaxonomy.push(catPath);
  for (const child of entry.children) {
    const subRoute = { name: "catalog", category: entry.name, subcategory: child.name };
    const subPath = buildStorefrontPath(subRoute);
    if (isCatalogPageNoindex(subRoute)) noindexTaxonomy.push(subPath);
    else indexableTaxonomy.push(subPath);
  }
}
const taxonomyInSitemap = indexableTaxonomy.filter((p) => locs.includes(`${ORIGIN}${p}`));
const taxonomyMissing = indexableTaxonomy.filter((p) => !locs.includes(`${ORIGIN}${p}`));
const noindexStillInSitemap = noindexTaxonomy.filter((p) => locs.includes(`${ORIGIN}${p}`));

const wave1 = listCatalogSeoOverridePaths().map((page) => {
  const route = { name: "catalog", ...page };
  const expected = getCatalogPageSeo(route);
  const urlPath = buildStorefrontPath(route);
  const { code, html } = curl(urlPath);
  const title = pick(/<title[^>]*>([^<]+)<\/title>/i, html);
  const h1 = pick(/<h1[^>]*>([^<]+)<\/h1>/i, html);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, html) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i, html);
  const canonical = canonicalOf(html);
  const robots = robotsOf(html);
  const full = `${ORIGIN}${urlPath}`;
  const checks = {
    http200: code === "200",
    title: title === expected.title,
    h1: h1 === expected.h1,
    description: description === expected.description,
    canonical: canonical === full,
    sitemap: locs.includes(full),
    notNoindex: !robots || !/noindex/i.test(robots),
  };
  return { path: urlPath, code, checks, ok: Object.values(checks).every(Boolean), actual: { title, h1, description, canonical, robots } };
});

const catalog = curl("/api/public/catalog", { api: true });
let products = [];
try {
  products = JSON.parse(catalog.html || "{}").products || [];
} catch {
  products = [];
}

const by = new Map();
for (const p of products) {
  const k = `${p.category || ""}\0${p.subcategory || ""}`;
  by.set(k, (by.get(k) || 0) + 1);
}
const expectedCounts = MANIFEST.expectedCountsAfter || {};
const countChecks = Object.entries(expectedCounts).map(([key, expected]) => {
  const [category, subcategory] = key.split("\0");
  const actual = by.get(key) || 0;
  return { category, subcategory: subcategory || "(none)", expected, actual, ok: actual === expected };
});

// totals from DB via API products only covers storefront; full 677 needs DB.
// For public verify we check storefront 660 and counts map.
const codes = products.map((p) => p.code);
const uniqueStorefront = new Set(codes).size;

const report = {
  mode: useLocal ? "local-5273" : useResolve ? "resolve-443" : "public",
  sitemap: { code: sitemap.code, locs: locs.length },
  noindex: {
    expected: noindexPaths.length,
    ok: noindexResults.filter((r) => r.ok).length,
    results: noindexResults,
  },
  indexAfterFill: {
    ok: indexResults.filter((r) => r.ok).length,
    results: indexResults,
  },
  taxonomy: {
    indexableExpected: 48,
    indexableListed: indexableTaxonomy.length,
    indexableInSitemap: taxonomyInSitemap.length,
    missing: taxonomyMissing,
    noindexStillInSitemap,
  },
  wave1: {
    total: wave1.length,
    ok: wave1.filter((r) => r.ok).length,
    results: wave1,
  },
  catalog: {
    apiCode: catalog.code,
    storefrontProducts: products.length,
    uniqueStorefront,
    countChecks,
    countsOk: countChecks.every((c) => c.ok),
  },
};

const failed =
  !noindexResults.every((r) => r.ok) ||
  !indexResults.every((r) => r.ok) ||
  taxonomyMissing.length > 0 ||
  noindexStillInSitemap.length > 0 ||
  indexableTaxonomy.length !== 48 ||
  taxonomyInSitemap.length !== 48 ||
  wave1.some((r) => !r.ok) ||
  products.length !== 660 ||
  uniqueStorefront !== 660 ||
  !report.catalog.countsOk;

fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "tmp/seo-wave1b-public-verify.json"),
  JSON.stringify(report, null, 2)
);

console.log(
  JSON.stringify(
    {
      mode: report.mode,
      failed,
      noindex: `${report.noindex.ok}/${report.noindex.expected}`,
      indexAfterFill: `${report.indexAfterFill.ok}/${indexMust.length}`,
      taxonomyInSitemap: `${report.taxonomy.indexableInSitemap}/48`,
      wave1: `${report.wave1.ok}/10`,
      storefront: products.length,
      countsOk: report.catalog.countsOk,
      sitemapLocs: locs.length,
    },
    null,
    2
  )
);

if (failed) {
  for (const r of noindexResults.filter((x) => !x.ok)) console.error("noindex FAIL", r);
  for (const r of indexResults.filter((x) => !x.ok)) console.error("index FAIL", r);
  for (const r of wave1.filter((x) => !x.ok)) console.error("wave1 FAIL", r.path, r.checks);
  if (taxonomyMissing.length) console.error("taxonomy missing", taxonomyMissing);
  if (noindexStillInSitemap.length) console.error("noindex in sitemap", noindexStillInSitemap);
  for (const c of countChecks.filter((x) => !x.ok)) console.error("count FAIL", c);
  process.exit(1);
}
