#!/usr/bin/env node
/**
 * Проверка SEO Wave 2 (10 подкатегорий) + регресс Wave 1 и Wave 1c.
 *
 *   node ops/seo/verify-catalog-seo-wave2.mjs
 *   node ops/seo/verify-catalog-seo-wave2.mjs --local
 *   node ops/seo/verify-catalog-seo-wave2.mjs --resolve
 */
import { spawnSync } from "node:child_process";
import { getCatalogPageSeo, isCatalogPageNoindex } from "../../src/screens/storefront/storefrontCatalogSeo.js";
import { buildStorefrontPath } from "../../src/screens/storefront/storefrontSlugs.js";

const ORIGIN = "https://clover-spb.ru";
const useLocal = process.argv.includes("--local");
const useResolve = process.argv.includes("--resolve");

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

const WAVE1C = [
  { category: "Химия, чистящие средства", subcategory: "Освежители воздуха" },
  { category: "Химия, чистящие средства", subcategory: "Отбеливатели" },
  { category: "Пакеты, упаковочные материалы", subcategory: "Пакеты zip-lock" },
];

function pick(re, html) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function curl(urlPath) {
  const host = useLocal ? "http://127.0.0.1:5273" : ORIGIN;
  const url = `${host}${urlPath}`;
  const codeArgs = ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "-k", "--connect-timeout", "15"];
  const bodyArgs = ["-sS", "-k", "--connect-timeout", "15"];
  if (useResolve && !useLocal) {
    codeArgs.push("--resolve", "clover-spb.ru:443:127.0.0.1");
    bodyArgs.push("--resolve", "clover-spb.ru:443:127.0.0.1");
  }
  codeArgs.push(url);
  bodyArgs.push(url);
  const code = spawnSync("curl", codeArgs, { encoding: "utf8", timeout: 45000 });
  const body = spawnSync("curl", bodyArgs, {
    encoding: "utf8",
    timeout: 45000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return { code: (code.stdout || "").trim(), html: body.stdout || "" };
}

function fetchSitemap() {
  const host = useLocal ? "http://127.0.0.1:5273" : ORIGIN;
  const args = ["-sS", "-k", "--connect-timeout", "15"];
  if (useResolve && !useLocal) args.push("--resolve", "clover-spb.ru:443:127.0.0.1");
  args.push(`${host}/sitemap.xml`);
  return spawnSync("curl", args, { encoding: "utf8", timeout: 45000 }).stdout || "";
}

function robotsIndexable(html) {
  const robots =
    pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i, html) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i, html);
  if (!robots) return true;
  return !/\bnoindex\b/i.test(robots);
}

function checkPage(page, label, sitemapLocs, titles, descriptions) {
  const route = { name: "catalog", ...page };
  const expected = getCatalogPageSeo(route);
  const urlPath = buildStorefrontPath(route);
  const publicUrl = `${ORIGIN}${urlPath}`;
  const { code, html } = curl(urlPath);

  const title = pick(/<title[^>]*>([^<]+)<\/title>/i, html);
  const h1 = pick(/<h1[^>]*>([^<]+)<\/h1>/i, html);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, html) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i, html);
  const canonical =
    pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i, html) ||
    pick(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i, html);

  const ssrTitle = html.includes(`<title`) && title === expected?.title;
  const ssrH1 = html.includes("<h1") && h1 === expected?.h1;
  const ssrDesc = Boolean(description) && description === expected?.description;

  const checks = {
    http200: code === "200",
    hasOverride: Boolean(expected),
    title: title === expected?.title,
    h1: h1 === expected?.h1,
    description: description === expected?.description,
    ssr: ssrTitle && ssrH1 && ssrDesc,
    canonical: canonical === publicUrl,
    index: robotsIndexable(html) && !isCatalogPageNoindex(route),
    sitemap: sitemapLocs.includes(publicUrl),
  };

  if (title) {
    if (!titles.has(title)) titles.set(title, []);
    titles.get(title).push(`${label}:${urlPath}`);
  }
  if (description) {
    if (!descriptions.has(description)) descriptions.set(description, []);
    descriptions.get(description).push(`${label}:${urlPath}`);
  }

  const ok = Object.values(checks).every(Boolean);
  return {
    label,
    urlPath,
    ok,
    checks,
    got: { code, title, h1, description, canonical },
    expected,
  };
}

const sitemap = fetchSitemap();
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const titles = new Map();
const descriptions = new Map();

const wave2 = WAVE2.map((p) => checkPage(p, "W2", sitemapLocs, titles, descriptions));
const wave1 = WAVE1.map((p) => checkPage(p, "W1", sitemapLocs, titles, descriptions));
const wave1c = WAVE1C.map((p) => checkPage(p, "W1c", sitemapLocs, titles, descriptions));

const all = [...wave2, ...wave1, ...wave1c];
const titleDupes = [...titles.entries()].filter(([, urls]) => urls.length > 1);
const descDupes = [...descriptions.entries()].filter(([, urls]) => urls.length > 1);

// Cross-check: Wave2 titles/descriptions must not equal Wave1 titles/descriptions
const w1Titles = new Set(wave1.map((r) => r.expected?.title).filter(Boolean));
const w1Descs = new Set(wave1.map((r) => r.expected?.description).filter(Boolean));
const crossTitle = wave2.filter((r) => r.expected && w1Titles.has(r.expected.title));
const crossDesc = wave2.filter((r) => r.expected && w1Descs.has(r.expected.description));

function summarize(name, rows) {
  const pass = rows.filter((r) => r.ok).length;
  return { name, pass, total: rows.length, ok: pass === rows.length };
}

const summary = [
  summarize("Wave2", wave2),
  summarize("Wave1", wave1),
  summarize("Wave1c", wave1c),
];

console.log(
  JSON.stringify(
    {
      mode: useLocal ? "local:5273" : useResolve ? "resolve:443->127.0.0.1" : "public",
      sitemapLocCount: sitemapLocs.length,
      summary,
      wave2,
      wave1,
      wave1c,
      titleDupes: titleDupes.map(([t, urls]) => ({ title: t, urls })),
      descriptionDupes: descDupes.map(([d, urls]) => ({ description: d, urls })),
      crossWave1TitleHits: crossTitle.map((r) => r.urlPath),
      crossWave1DescHits: crossDesc.map((r) => r.urlPath),
      pass:
        summary.every((s) => s.ok) &&
        titleDupes.length === 0 &&
        descDupes.length === 0 &&
        crossTitle.length === 0 &&
        crossDesc.length === 0,
    },
    null,
    2
  )
);

process.exit(
  summary.every((s) => s.ok) &&
    titleDupes.length === 0 &&
    descDupes.length === 0 &&
    crossTitle.length === 0 &&
    crossDesc.length === 0
    ? 0
    : 1
);
