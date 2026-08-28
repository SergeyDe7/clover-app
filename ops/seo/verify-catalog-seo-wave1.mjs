#!/usr/bin/env node
/**
 * Проверка SEO волны 1: 10 URL каталога.
 * node ops/seo/verify-catalog-seo-wave1.mjs [--resolve]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCatalogPageSeo } from "../../src/screens/storefront/storefrontCatalogSeo.js";
import { buildStorefrontPath } from "../../src/screens/storefront/storefrontSlugs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://clover-spb.ru";
const useResolve = process.argv.includes("--resolve");

const PAGES = [
  { category: "Одноразовая посуда" },
  { category: "Одноразовая посуда", subcategory: "Стаканы" },
  { category: "Одноразовая посуда", subcategory: "Бумажная упаковка" },
  { category: "Одноразовая посуда", subcategory: "Контейнеры" },
  { category: "Одноразовая посуда", subcategory: "Столовые приборы" },
  { category: "Канцелярские товары" },
  { category: "Бумажная продукция", subcategory: "Салфетки" },
  { category: "Бумажная продукция", subcategory: "Бuмажные полotenca" },
  { category: "Хозяйственные товары" },
  { category: "Химия, чистящие средства" },
];

// fix typo in last entry
PAGES[7].subcategory = "Бумажные полотенца";

function pick(re, html) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function fetchPage(urlPath) {
  const url = `${ORIGIN}${urlPath}`;
  const args = ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "-k"];
  if (useResolve) args.push("--resolve", `${new URL(ORIGIN).hostname}:443:127.0.0.1`);
  args.push(url);
  const codeRes = spawnSync("curl", args, { encoding: "utf8", timeout: 30000 });
  const bodyArgs = ["-sS", "-k"];
  if (useResolve) bodyArgs.push("--resolve", `${new URL(ORIGIN).hostname}:443:127.0.0.1`);
  bodyArgs.push(url);
  const bodyRes = spawnSync("curl", bodyArgs, { encoding: "utf8", timeout: 30000, maxBuffer: 15 * 1024 * 1024 });
  return {
    code: codeRes.stdout?.trim() || "000",
    html: bodyRes.stdout || "",
  };
}

function fetchSitemap() {
  const args = ["-sS", "-k"];
  if (useResolve) args.push("--resolve", `${new URL(ORIGIN).hostname}:443:127.0.0.1`);
  args.push(`${ORIGIN}/sitemap.xml`);
  const r = spawnSync("curl", args, { encoding: "utf8", timeout: 30000 });
  return r.stdout || "";
}

const sitemap = fetchSitemap();
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const results = [];
const titles = new Map();
const descriptions = new Map();

for (const page of PAGES) {
  const route = { name: "catalog", ...page };
  const expected = getCatalogPageSeo(route);
  const urlPath = buildStorefrontPath(route);
  const fullUrl = `${ORIGIN}${urlPath}`;

  const { code, html } = fetchPage(urlPath);
  const title = pick(/<title[^>]*>([^<]+)<\/title>/i, html);
  const h1 = pick(/<h1[^>]*>([^<]+)<\/h1>/i, html);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, html) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i, html);
  const canonical =
    pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i, html) ||
    pick(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i, html);

  const checks = {
    http200: code === "200",
    title: title === expected.title,
    h1: h1 === expected.h1,
    description: description === expected.description,
    canonical: canonical === fullUrl,
    sitemap: sitemapLocs.includes(fullUrl),
  };

  if (title) {
    if (!titles.has(title)) titles.set(title, []);
    titles.get(title).push(urlPath);
  }
  if (description) {
    if (!descriptions.has(description)) descriptions.set(description, []);
    descriptions.get(description).push(urlPath);
  }

  const ok = Object.values(checks).every(Boolean);
  results.push({
    urlPath,
    code,
    ok,
    checks,
    expected: { title: expected.title, h1: expected.h1, description: expected.description },
    actual: { title, h1, description, canonical },
  });
}

const dupTitles = [...titles.entries()].filter(([, urls]) => urls.length > 1);
const dupDescs = [...descriptions.entries()].filter(([, urls]) => urls.length > 1);

const report = {
  mode: useResolve ? "nginx-local" : "direct",
  summary: {
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    duplicateTitles: dupTitles.length,
    duplicateDescriptions: dupDescs.length,
  },
  duplicateTitles: dupTitles.map(([t, urls]) => ({ title: t, urls })),
  duplicateDescriptions: dupDescs.map(([d, urls]) => ({ description: d.slice(0, 80), urls })),
  results,
};

fs.mkdirSync(path.join(__dirname, "../../tmp"), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, "../../tmp/catalog-seo-wave1-verify.json"),
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify(report.summary, null, 2));
for (const r of results) {
  const status = r.ok ? "OK" : "FAIL";
  console.log(`\n[${status}] ${r.urlPath} (${r.code})`);
  if (!r.ok) {
    for (const [k, v] of Object.entries(r.checks)) {
      if (!v) console.log(`  ✗ ${k}`);
    }
    if (!r.checks.title) console.log(`    title expected: ${r.expected.title}`);
    if (!r.checks.title) console.log(`    title actual:   ${r.actual.title}`);
    if (!r.checks.h1) console.log(`    h1 expected: ${r.expected.h1}`);
    if (!r.checks.h1) console.log(`    h1 actual:   ${r.actual.h1}`);
    if (!r.checks.description) console.log(`    desc expected: ${r.expected.description}`);
    if (!r.checks.description) console.log(`    desc actual:   ${r.actual.description}`);
    if (!r.checks.canonical) console.log(`    canonical: ${r.actual.canonical}`);
  }
}

process.exit(report.summary.failed > 0 || dupTitles.length > 0 || dupDescs.length > 0 ? 1 : 0);
