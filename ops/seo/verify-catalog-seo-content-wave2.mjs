#!/usr/bin/env node
/**
 * Проверка SEO Content Wave 2 + регресс Content Wave 1 / Wave 1–2 meta / Wave 1c.
 *
 *   node ops/seo/verify-catalog-seo-content-wave2.mjs --resolve
 *   node ops/seo/verify-catalog-seo-content-wave2.mjs --local
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

const CONTENT_WAVE1 = [
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

const CONTENT_WAVE2 = [
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

const CONTROL_NO_CONTENT = [
  { category: "Пакеты, упаковочные материалы", subcategory: "Пакеты zip-lock" },
  { category: "Бумажная продукция" },
  { category: "Химия, чистящие средства", subcategory: "Освежители воздуха" },
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
    title: Boolean(expected) && title === expected.title,
    h1: Boolean(expected) && h1 === expected.h1,
    description: Boolean(expected) && description === expected.description,
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
  const contentBlob = [
    content.intro,
    ...content.assortment,
    ...content.faq.map((f) => f.q + f.a),
  ].join("\n");
  const factual = {
    alumNoSpkAsForm:
      !urlPath.includes("formy-alyuminievye") ||
      !/СПК[^.]{0,40}алюмин/i.test(contentBlob),
    glovesNoClothingAsGloves:
      !urlPath.includes("/perchatki") ||
      !/шапочк|фартук|бахил/i.test(content.intro + content.assortment.join(" ")),
    sauceNoBlack80:
      !urlPath.includes("/sousniki") ||
      !/чёрн\w*\s+(?:и\s+)?(?:\d+\s*,\s*)*80\s*мл/i.test(contentBlob),
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

const wave2Meta = CONTENT_WAVE2.map((p) => checkMeta(p, "W2", sitemapLocs));
const wave1Meta = CONTENT_WAVE1.map((p) => checkMeta(p, "W1", sitemapLocs));
const wave1cMeta = WAVE1C.map((p) => checkMeta(p, "W1c", sitemapLocs));

const contentW2 = CONTENT_WAVE2.map((p, i) => checkContent(p, wave2Meta[i].html));
const contentW1 = CONTENT_WAVE1.map((p, i) => checkContent(p, wave1Meta[i].html));

// Content Wave 2 must not appear on control pages without Wave2 content defs
const leak = [];
for (const page of CONTROL_NO_CONTENT) {
  const route = { name: "catalog", ...page };
  const urlPath = buildStorefrontPath(route);
  const def = getCatalogPageContent(route);
  const { html } = curl(urlPath);
  // sample unique Wave2 intro fragments
  const markers = [
    "На витрине — одноразовые тарелки и миски",
    "Алюминиевые формы под выпечку, запекание",
    "Вакуумные пакеты под вакууматор",
    "Уборочный инвентарь без бытовой химии",
  ];
  const found = markers.filter((m) => html.includes(m));
  if (def && CONTENT_WAVE2.some((w) => w.subcategory === page.subcategory)) continue;
  if (found.length) leak.push({ urlPath, found });
}

// internal links from Wave1+Wave2 content
const linkSet = new Set();
for (const page of [...CONTENT_WAVE1, ...CONTENT_WAVE2]) {
  const c = getCatalogPageContent({ name: "catalog", ...page });
  for (const link of c?.links || []) linkSet.add(link.path);
}
const brokenLinks = [];
const noindexLinks = [];
for (const path of [...linkSet].sort()) {
  const { code, html } = curl(path);
  const canonical =
    pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i, html) ||
    pick(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i, html);
  const indexable = robotsIndexable(html);
  if (code !== "200" || canonical !== `${ORIGIN}${path}`) {
    brokenLinks.push({ path, code, canonical });
  } else if (!indexable) {
    noindexLinks.push({ path });
  }
}

function collectIntros(pages) {
  return pages.map((p) => ({
    url: buildStorefrontPath({ name: "catalog", ...p }),
    intro: getCatalogPageContent({ name: "catalog", ...p })?.intro || "",
  }));
}

const allIntros = [...collectIntros(CONTENT_WAVE1), ...collectIntros(CONTENT_WAVE2)];
const dupWarnings = [];
for (let i = 0; i < allIntros.length; i++) {
  for (let j = i + 1; j < allIntros.length; j++) {
    const a = normalizeText(allIntros[i].intro);
    const b = normalizeText(allIntros[j].intro);
    if (!a || !b) continue;
    if (a === b) {
      dupWarnings.push({ type: "exact", a: allIntros[i].url, b: allIntros[j].url });
      continue;
    }
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    if (k >= 120) {
      dupWarnings.push({
        type: "prefix",
        shared: k,
        a: allIntros[i].url,
        b: allIntros[j].url,
      });
    }
  }
}

const factualErrors = contentW2.filter(
  (c) =>
    !c.checks?.alumNoSpkAsForm ||
    !c.checks?.glovesNoClothingAsGloves ||
    !c.checks?.sauceNoBlack80
).length;

const contentW2Pass = contentW2.filter((c) => c.ok).length;
const contentW1Pass = contentW1.filter((c) => c.ok).length;
const wave2Pass = wave2Meta.filter((r) => r.ok).length;
const wave1Pass = wave1Meta.filter((r) => r.ok).length;
const wave1cPass = wave1cMeta.filter((r) => r.ok).length;

const urlTable = wave2Meta.map((r, i) => {
  const c = contentW2[i];
  return {
    url: r.urlPath,
    http200: r.checks.http200,
    h1: r.checks.h1,
    title: r.checks.title,
    description: r.checks.description,
    canonical: r.checks.canonical,
    index: r.checks.index,
    sitemap: r.checks.sitemap,
    intro: Boolean(c.checks?.introInSsr),
    assortment: Boolean(c.checks?.assortmentInSsr),
    faq: Boolean(c.checks?.faqInSsr),
    links: Boolean(c.checks?.linksInSsr),
    ok: r.ok && c.ok,
  };
});

const pass =
  contentW2Pass === 10 &&
  contentW1Pass === 10 &&
  wave2Pass === 10 &&
  wave1Pass === 10 &&
  wave1cPass === 3 &&
  brokenLinks.length === 0 &&
  noindexLinks.length === 0 &&
  dupWarnings.length === 0 &&
  factualErrors === 0 &&
  leak.length === 0 &&
  sitemapLocs.length === 714;

const report = {
  mode: useLocal ? "local:5273" : useResolve ? "resolve" : "public",
  pass,
  summary: {
    contentWave2: `${contentW2Pass}/10`,
    contentWave1: `${contentW1Pass}/10`,
    wave2Meta: `${wave2Pass}/10`,
    wave1Meta: `${wave1Pass}/10`,
    wave1c: `${wave1cPass}/3`,
    brokenLinks: brokenLinks.length,
    noindexLinks: noindexLinks.length,
    factualErrors,
    duplicateContentWarnings: dupWarnings.length,
    contentLeakOnOtherPages: leak.length,
    sitemapLocCount: sitemapLocs.length,
  },
  urlTable,
  contentW2Fails: contentW2.filter((c) => !c.ok),
  contentW1Fails: contentW1.filter((c) => !c.ok),
  wave2Fails: wave2Meta.filter((r) => !r.ok).map((r) => ({ url: r.urlPath, checks: r.checks, got: r.got })),
  wave1Fails: wave1Meta.filter((r) => !r.ok).map((r) => ({ url: r.urlPath, checks: r.checks })),
  brokenLinks,
  noindexLinks,
  dupWarnings,
  leak,
};

console.log(JSON.stringify(report, null, 2));
process.exit(pass ? 0 : 1);
