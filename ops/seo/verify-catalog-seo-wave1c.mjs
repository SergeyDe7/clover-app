#!/usr/bin/env node
/**
 * Проверка SEO Wave 1c (3 подкатегории) на публичной витрине или локально.
 *
 *   node ops/seo/verify-catalog-seo-wave1c.mjs
 *   node ops/seo/verify-catalog-seo-wave1c.mjs --local
 *   node ops/seo/verify-catalog-seo-wave1c.mjs --resolve
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCatalogPageSeo,
  isCatalogPageNoindex,
} from "../../src/screens/storefront/storefrontCatalogSeo.js";
import {
  buildStorefrontPath,
  listCategorySlugEntries,
} from "../../src/screens/storefront/storefrontSlugs.js";
import { MAGAZIN_FOLDER_TO_PATH } from "./magazinRedirectMap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ORIGIN = "https://clover-spb.ru";
const useLocal = process.argv.includes("--local");
const useResolve = process.argv.includes("--resolve");

const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(__dirname, "seo-wave1c-three-subcats-manifest.json"), "utf8")
);

const NEW_PAGES = (MANIFEST.newSubcategories || []).map((s) => ({
  category: s.parent,
  subcategory: s.name,
  slug: s.slug,
}));

const NOINDEX_PATHS = [
  "/catalog/prochee",
  "/catalog/odnorazovaya-posuda/prochee",
  "/catalog/hozyajstvennye-tovary/prochee",
  "/catalog/himiya-chistyashchie-sredstva/prochee",
  "/catalog/bumazhnaya-produkciya/prochee",
  "/catalog/pakety-upakovochnye-materialy/prochee",
  "/catalog/hozyajstvennye-tovary/plenka-pod-zapajku",
];

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

function pick(re, html) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function curl(urlPath, { api = false } = {}) {
  if (api) {
    const base = useLocal || useResolve ? "http://127.0.0.1:4100" : ORIGIN;
    const url = `${base}${urlPath}`;
    const code = spawnSync(
      "curl",
      ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "-k", "--connect-timeout", "15", url],
      { encoding: "utf8", timeout: 30000 }
    );
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
  const code = spawnSync("curl", [...args, "-o", "/dev/null", "-w", "%{http_code}", url], {
    encoding: "utf8",
    timeout: 45000,
  });
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

const newResults = NEW_PAGES.map((page) => {
  const route = { name: "catalog", category: page.category, subcategory: page.subcategory };
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
    title: title === expected?.title,
    h1: h1 === expected?.h1,
    description: description === expected?.description,
    canonical: canonical === full,
    indexable: !robots || !/noindex/i.test(robots),
    inSitemap: locs.includes(full),
    notNoindexFn: !isCatalogPageNoindex(route),
  };
  return { path: urlPath, code, checks, ok: Object.values(checks).every(Boolean) };
});

const noindexResults = NOINDEX_PATHS.map((p) => {
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
  return { path: p, checks, ok: Object.values(checks).every(Boolean) };
});

const wave1Results = WAVE1.map((page) => {
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
  return { path: urlPath, checks, ok: Object.values(checks).every(Boolean) };
});

let taxonomyTotal = 1;
let taxonomyNoindex = 0;
let taxonomyIndexable = 1;
for (const entry of listCategorySlugEntries()) {
  taxonomyTotal += 1;
  if (isCatalogPageNoindex({ name: "catalog", category: entry.name })) taxonomyNoindex += 1;
  else taxonomyIndexable += 1;
  for (const child of entry.children) {
    taxonomyTotal += 1;
    if (
      isCatalogPageNoindex({
        name: "catalog",
        category: entry.name,
        subcategory: child.name,
      })
    ) {
      taxonomyNoindex += 1;
    } else taxonomyIndexable += 1;
  }
}

const catalog = curl("/api/public/catalog", { api: true });
let products = [];
try {
  products = JSON.parse(catalog.html || "{}").products || [];
} catch {
  products = [];
}

const redirectOk =
  MAGAZIN_FOLDER_TO_PATH["osvezhiteli-vozduha"] ===
  "/catalog/himiya-chistyashchie-sredstva/osvezhiteli-vozduha";

const report = {
  mode: useLocal ? "local-5273" : useResolve ? "resolve-443" : "public",
  newPages: {
    ok: newResults.filter((r) => r.ok).length,
    total: newResults.length,
    results: newResults,
  },
  noindex: {
    ok: noindexResults.filter((r) => r.ok).length,
    total: noindexResults.length,
    results: noindexResults,
  },
  wave1: {
    ok: wave1Results.filter((r) => r.ok).length,
    total: wave1Results.length,
  },
  taxonomy: {
    total: taxonomyTotal,
    indexable: taxonomyIndexable,
    noindex: taxonomyNoindex,
  },
  sitemapLocs: locs.length,
  storefront: products.length,
  uniqueStorefront: new Set(products.map((p) => p.code)).size,
  redirectOk,
};

const failed =
  !newResults.every((r) => r.ok) ||
  !noindexResults.every((r) => r.ok) ||
  !wave1Results.every((r) => r.ok) ||
  taxonomyTotal !== 58 ||
  taxonomyIndexable !== 51 ||
  taxonomyNoindex !== 7 ||
  locs.length !== 714 ||
  products.length !== 660 ||
  report.uniqueStorefront !== 660 ||
  !redirectOk;

fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "tmp/seo-wave1c-public-verify.json"),
  JSON.stringify(report, null, 2)
);

console.log(
  JSON.stringify(
    {
      mode: report.mode,
      failed,
      newPages: `${report.newPages.ok}/${report.newPages.total}`,
      noindex: `${report.noindex.ok}/${report.noindex.total}`,
      wave1: `${report.wave1.ok}/${report.wave1.total}`,
      taxonomy: report.taxonomy,
      sitemapLocs: report.sitemapLocs,
      storefront: report.storefront,
      redirectOk: report.redirectOk,
    },
    null,
    2
  )
);

process.exit(failed ? 1 : 0);
