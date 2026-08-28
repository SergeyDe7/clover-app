#!/usr/bin/env node
/**
 * Проверка SEO Content Wave 1 + регресс Wave 1 / Wave 2 meta.
 *
 *   node ops/seo/verify-catalog-seo-content-wave1.mjs --resolve
 *   node ops/seo/verify-catalog-seo-content-wave1.mjs --local
 */
import { spawnSync } from "node:child_process";
import { getCatalogPageContent } from "../../src/screens/storefront/storefrontCatalogContent.js";
import {
  getCatalogPageSeo,
  isCatalogPageNoindex,
} from "../../src/screens/storefront/storefrontCatalogSeo.js";
import { buildStorefrontPath } from "../../src/screens/storefront/storefrontSlugs.js";

const ORIGIN = "https://clover-spb.ru";
const useLocal = process.argv.includes("--local");
const useResolve = process.argv.includes("--resolve");

const CONTENT_PAGES = [
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

const WAVE1 = CONTENT_PAGES; // meta wave 1 = same 10
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

function normalizeText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function checkMeta(page, label, sitemapLocs) {
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

  const checks = {
    http200: code === "200",
    title: title === expected?.title,
    h1: h1 === expected?.h1,
    description: description === expected?.description,
    canonical: canonical === publicUrl,
    index: robotsIndexable(html) && !isCatalogPageNoindex(route),
    sitemap: sitemapLocs.includes(publicUrl),
  };
  return {
    label,
    urlPath,
    ok: Object.values(checks).every(Boolean),
    checks,
    got: { code, title, h1, description, canonical },
    html,
    expected,
  };
}

function checkContent(page, html) {
  const route = { name: "catalog", ...page };
  const content = getCatalogPageContent(route);
  const urlPath = buildStorefrontPath(route);
  if (!content) {
    return { urlPath, ok: false, checks: { hasContentDef: false } };
  }
  const introOk = html.includes(content.intro);
  const assortmentOk = content.assortment.every((line) => html.includes(line));
  const faqOk = content.faq.every(
    (item) => html.includes(item.q) && html.includes(item.a)
  );
  const linksOk = content.links.every(
    (link) =>
      html.includes(`href="${link.path}"`) || html.includes(`href='${link.path}'`)
  );
  const noOps =
    urlPath.includes("/kontejnery") ? !/\bOPS\b/.test(html.match(/data-seo-content="intro"[\s\S]*?(?=<h2>Товары)/)?.[0] || content.intro + content.assortment.join(" ") + content.faq.map((f) => f.a).join(" ")) : true;
  // simpler factual flags on content object
  const contentBlob = [
    content.intro,
    ...content.assortment,
    ...content.faq.map((f) => f.q + f.a),
  ].join("\n");
  const factual = {
    noOpsInContainers:
      !urlPath.includes("kontejnery") || !/\bOPS\b/.test(contentBlob),
    cupsFrom100:
      !urlPath.includes("/stakany") ||
      (/от 100/.test(contentBlob) && /100–400|100 до 400/.test(contentBlob)),
    noSet3AsNapkins:
      !urlPath.includes("/salfetki") || !/набор[^.]{0,30}[«"]?3/i.test(contentBlob),
  };
  const checks = {
    introInSsr: introOk,
    assortmentInSsr: assortmentOk,
    faqInSsr: faqOk,
    linksInSsr: linksOk,
    ...factual,
  };
  return {
    urlPath,
    ok: Object.values(checks).every(Boolean),
    checks,
    content,
  };
}

const sitemap = fetchSitemap();
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const wave1 = WAVE1.map((p) => checkMeta(p, "W1", sitemapLocs));
const wave2 = WAVE2.map((p) => checkMeta(p, "W2", sitemapLocs));
const contentChecks = CONTENT_PAGES.map((p, i) =>
  checkContent(p, wave1[i].html)
);

// internal links from all content
const linkSet = new Set();
for (const page of CONTENT_PAGES) {
  const c = getCatalogPageContent({ name: "catalog", ...page });
  for (const link of c?.links || []) linkSet.add(link.path);
}
const brokenLinks = [];
for (const path of [...linkSet].sort()) {
  const { code, html } = curl(path);
  const canonical =
    pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i, html) ||
    pick(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i, html);
  const ok =
    code === "200" &&
    canonical === `${ORIGIN}${path}` &&
    robotsIndexable(html);
  if (!ok) brokenLinks.push({ path, code, canonical });
}

// duplicate intros
const intros = CONTENT_PAGES.map((p) => ({
  url: buildStorefrontPath({ name: "catalog", ...p }),
  intro: getCatalogPageContent({ name: "catalog", ...p })?.intro || "",
}));
const dupWarnings = [];
for (let i = 0; i < intros.length; i++) {
  for (let j = i + 1; j < intros.length; j++) {
    const a = normalizeText(intros[i].intro);
    const b = normalizeText(intros[j].intro);
    if (!a || !b) continue;
    if (a === b) {
      dupWarnings.push({ type: "exact", a: intros[i].url, b: intros[j].url });
      continue;
    }
    // near-dup: shared prefix >= 120 chars
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    if (k >= 120) {
      dupWarnings.push({
        type: "prefix",
        shared: k,
        a: intros[i].url,
        b: intros[j].url,
      });
    }
  }
}

const contentPass = contentChecks.filter((c) => c.ok).length;
const wave1Pass = wave1.filter((r) => r.ok).length;
const wave2Pass = wave2.filter((r) => r.ok).length;
const http200 = wave1.filter((r) => r.checks.http200).length;
const ssrMeta = wave1.filter(
  (r) => r.checks.title && r.checks.h1 && r.checks.description
).length;
const canonical = wave1.filter((r) => r.checks.canonical).length;
const ssrContent = contentChecks.filter((c) => c.checks.introInSsr).length;

const factualErrors = contentChecks.filter(
  (c) =>
    !c.checks.noOpsInContainers ||
    !c.checks.cupsFrom100 ||
    !c.checks.noSet3AsNapkins
).length;

const pass =
  wave1Pass === 10 &&
  wave2Pass === 10 &&
  contentPass === 10 &&
  brokenLinks.length === 0 &&
  dupWarnings.length === 0 &&
  sitemapLocs.length === 714 &&
  factualErrors === 0;

const report = {
  mode: useLocal ? "local:5273" : useResolve ? "resolve" : "public",
  pass,
  summary: {
    http200: `${http200}/10`,
    ssrMeta: `${ssrMeta}/10`,
    ssrContent: `${ssrContent}/10`,
    canonical: `${canonical}/10`,
    wave1: `${wave1Pass}/10`,
    wave2: `${wave2Pass}/10`,
    contentBlocks: `${contentPass}/10`,
    internalLinksBroken: brokenLinks.length,
    factualErrors,
    duplicateContentWarnings: dupWarnings.length,
    sitemapLocCount: sitemapLocs.length,
  },
  urls: wave1.map((r) => r.urlPath),
  contentFails: contentChecks.filter((c) => !c.ok),
  wave1Fails: wave1.filter((r) => !r.ok).map((r) => ({ url: r.urlPath, checks: r.checks })),
  wave2Fails: wave2.filter((r) => !r.ok).map((r) => ({ url: r.urlPath, checks: r.checks })),
  brokenLinks,
  dupWarnings,
};

console.log(JSON.stringify(report, null, 2));
process.exit(pass ? 0 : 1);
