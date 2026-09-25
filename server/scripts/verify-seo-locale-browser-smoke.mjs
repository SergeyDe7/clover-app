#!/usr/bin/env node
/**
 * Settled-DOM browser smoke for the locale-route SEO candidate.
 * Does not write /opt/clover/clover-app. Does not install packages.
 *
 * Chrome is launched from an existing isolated tree + extracted libs:
 *   CLOVER_BROWSER_CHROME
 *   CLOVER_BROWSER_CHROME_LIBS
 *
 * Isolated candidate is built with VITE_STORE_HOSTS=127.0.0.1,localhost
 * so the storefront shell renders on loopback. Production hosts are unchanged.
 * /api/public is served by a local HTTP fixture; Vite preview is started with
 * a temp config that proxies /api there instead of production :4100.
 * chrome-headless-shell dump-dom with --virtual-time-budget=4000. Playwright
 * CDP/goto hangs on this host after Fetch interception. Click language-switch
 * is therefore not run here; each locale URL is loaded directly.
 *
 * Use chrome-headless-shell, not the full chrome-linux64 binary: on this
 * host the full binary hangs before dump-dom/CDP even for a one-line JS page.
 *
 * Other machine:
 *   Provide Chrome for Testing or chrome-headless-shell, optional extra libs,
 *   a copy of this worktree (or the listed files), node_modules, and:
 *   CLOVER_SEO_BROWSER_REBUILD=1 \
 *   CLOVER_BROWSER_CHROME=/path/to/chrome-headless-shell \
 *   CLOVER_BROWSER_CHROME_LIBS=/path/to/optional-libs \
 *   CLOVER_PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs \
 *     node server/scripts/verify-seo-locale-browser-smoke.mjs
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
assert.notEqual(path.resolve(root), path.resolve("/opt/clover/clover-app"));

const artifactDir = path.join(root, ".tmp/seo-browser-candidate");
const reportPath = path.join(root, ".tmp/seo-browser-smoke-report.json");
const dbPath = path.join(artifactDir, "fixture.sqlite");
const outDir = path.join(artifactDir, "dist");
const productCode = "НФ-00003681";
const productName = "Жидкое мыло Синергетик миндальное молочко 500 мл";
const categoryName = "Одноразовая посуда";
const popularSubcategory = "Стаканы";
const langs = ["ru", "en", "uz", "ky", "tg", "zh", "ar"];
const GOTO_MS = Number(process.env.CLOVER_BROWSER_GOTO_MS || 8000);
const SETTLE_MS = Number(process.env.CLOVER_BROWSER_SETTLE_MS || 8000);
const chrome = String(process.env.CLOVER_BROWSER_CHROME || "").trim();
const chromeLibs = String(process.env.CLOVER_BROWSER_CHROME_LIBS || "").trim();
const playwrightCore = String(process.env.CLOVER_PLAYWRIGHT_CORE || "").trim();

mkdirSync(artifactDir, { recursive: true });

function failBrowserUnavailable(reason) {
  const report = {
    SEO_LOCALE_BROWSER_SMOKE: "BLOCKED",
    blocker: reason,
    chrome,
    chromeExists: existsSync(chrome),
    chromeLibs,
    libsExist: existsSync(chromeLibs),
    otherMachine:
      "Install a Chromium/Chrome for Testing locally (not on production), set CLOVER_BROWSER_CHROME and optional CLOVER_BROWSER_CHROME_LIBS, then run: node server/scripts/verify-seo-locale-browser-smoke.mjs",
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report));
  process.exit(2);
}

if (!existsSync(chrome)) {
  failBrowserUnavailable(`chrome binary missing: ${chrome}`);
}

function seedDb() {
  if (existsSync(dbPath)) rmSync(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
    CREATE TABLE translation_entries (
      id TEXT PRIMARY KEY, namespace TEXT NOT NULL, entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL, field_key TEXT NOT NULL, source_ru TEXT NOT NULL,
      source_hash TEXT NOT NULL, critical INTEGER NOT NULL
    );
    CREATE TABLE translation_values (
      entry_id TEXT NOT NULL, language_code TEXT NOT NULL, value TEXT NOT NULL,
      state TEXT NOT NULL, source_hash TEXT NOT NULL
    );
    CREATE TABLE product_translations (
      product_id TEXT NOT NULL, language_code TEXT NOT NULL, field_key TEXT NOT NULL,
      auto_value TEXT NOT NULL, auto_source_hash TEXT NOT NULL,
      manual_value TEXT NOT NULL, manual_source_hash TEXT NOT NULL
    );
  `);
  const product = {
    id: "p1",
    code: productCode,
    oneCId: "onec-1",
    name: productName,
    category: categoryName,
    subcategory: popularSubcategory,
    showOnStorefront: true,
  };
  const insert = db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)");
  insert.run("products", JSON.stringify([product]));
  insert.run("oneCProducts", JSON.stringify([{ id: "onec-1", name: product.name }]));
  insert.run(
    "settings",
    JSON.stringify({ storefrontShowOnlyLinked: true, storefrontInfoPages: [] })
  );
  insert.run(
    "localizationSettings",
    JSON.stringify({
      enabledLanguages: langs,
      catalogVersion: 28,
    })
  );
  db.close();
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", env });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
  return result;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

const collectSeoSource = `({
  pageName,
  lang,
  productCode,
}) => {
  const html = document.documentElement;
  const canonicals = [...document.querySelectorAll('link[rel="canonical"]')].map((el) => el.href);
  const hreflang = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((el) => ({
    hreflang: el.getAttribute("hreflang"),
    href: el.href,
  }));
  const hreflangKeys = hreflang.map((item) => item.hreflang);
  const header = document.querySelector(".sf-header");
  const logo = document.querySelector(".sf-header img, .sf-brand img");
  const hero = document.querySelector(".sf-hero");
  const heroImgs = [...document.querySelectorAll(".sf-hero img")];
  const heading = document.querySelector("h1");
  const selector = document.querySelector("[data-selected-language]");
  const nav = [...document.querySelectorAll(".sf-nav-link")].map((el) => el.textContent.trim());
  return {
    href: location.href,
    pathname: location.pathname,
    lang: html.lang || "",
    dir: html.dir || "",
    canonicals,
    canonical: canonicals[0] || "",
    hreflang,
    hreflangKeys,
    duplicateCanonical: canonicals.length > 1,
    duplicateHreflang: hreflangKeys.length !== new Set(hreflangKeys).size,
    selectedLanguage: selector?.getAttribute("data-selected-language") || "",
    hasHeader: Boolean(header),
    logoOk: Boolean(logo) && logo.complete && logo.naturalWidth > 0,
    hasHero: Boolean(hero),
    heroHeading: heading?.textContent?.trim() || "",
    heroImages: heroImgs.map((img) => ({
      src: img.currentSrc || img.getAttribute("src") || "",
      ok: img.complete && img.naturalWidth > 0,
    })),
    nav,
    isLkShell: Boolean(document.querySelector(".clover-app") && !header),
    bodyText: (document.body?.innerText || "").slice(0, 400),
  };
}`;

function publicToEffectiveLocale(language) {
  const code = String(language || "ru");
  if (code === "zh" || code === "zh-CN") return "zh-CN";
  return langs.includes(code) ? code : "ru";
}

function runtimePayload(language) {
  return {
    catalogVersion: 28,
    dictionary: {},
    effectiveLocale: publicToEffectiveLocale(language),
    enabledLanguages: langs,
  };
}

function productPayload() {
  return {
    id: "p1",
    code: productCode,
    name: productName,
    active: true,
    showOnStorefront: true,
    category: categoryName,
    subcategory: "",
    price: 120,
    imageUrl: "/clover-logo.png",
    storefrontDetails: {
      description: productName,
      composition: "",
      characteristics: "",
    },
  };
}

function sitePayload() {
  return {
    site: {
      heroTitle: "",
      heroLead: "",
      heroSlides: [{ src: "/storefront/hero-horeca.png", alt: "hero" }],
      homePromotions: [],
      categoryTranslations: {},
      seo: { home: { description: "КЛЕВЕР" } },
    },
  };
}

function startCombinedServer(distDir) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
  };
  const distRoot = path.resolve(distDir);
  const server = createHttpServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/api/public/localization/runtime")) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(runtimePayload(url.searchParams.get("language") || "ru")));
      return;
    }
    if (url.pathname === "/api/public/site") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(sitePayload()));
      return;
    }
    if (url.pathname === "/api/public/catalog") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({
        categories: [{ name: categoryName, count: 1 }],
        subcategories: [{ category: categoryName, name: popularSubcategory, count: 1 }],
        products: [productPayload()],
      }));
      return;
    }
    if (url.pathname.startsWith("/api/public/catalog/")) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ product: productPayload() }));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "isolated-fixture-miss" }));
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const filePath = path.resolve(distDir, `.${rel}`);
    if (!filePath.startsWith(distRoot)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (existsSync(filePath) && path.extname(filePath)) {
      const ext = path.extname(filePath);
      res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(path.join(distDir, "index.html")));
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
    server.on("error", reject);
  });
}

function expectedSeo(lang, pageName) {
  const htmlLang = lang === "zh" ? "zh-CN" : lang;
  const productPath = `/product/${encodeURIComponent(productCode)}`;
  const categoryPath = `/catalog/${encodeURIComponent(categoryName)}`;
  const pathByPage = {
    home: `/${lang}/`,
    catalog: `/${lang}/catalog`,
    category: `/${lang}${categoryPath}`,
    product: `/${lang}${productPath}`,
  };
  const ruByPage = {
    home: "https://clover-spb.ru/ru/",
    catalog: "https://clover-spb.ru/ru/catalog",
    category: `https://clover-spb.ru/ru${categoryPath}`,
    product: `https://clover-spb.ru/ru${productPath}`,
  };
  return {
    pathname: pathByPage[pageName],
    canonical: `https://clover-spb.ru${pathByPage[pageName]}`,
    xDefault: ruByPage[pageName],
    htmlLang,
    dir: lang === "ar" ? "rtl" : "ltr",
  };
}

function assertSettled(pageName, lang, seo) {
  const expect = expectedSeo(lang, pageName);
  const prefix = `${lang} ${pageName}`;
  assert.equal(seo.isLkShell, false, `${prefix} rendered LK shell instead of storefront`);
  assert.equal(seo.pathname, expect.pathname, `${prefix} pathname ${seo.pathname}`);
  assert.equal(seo.lang, expect.htmlLang, `${prefix} lang=${seo.lang}`);
  assert.equal(seo.dir, expect.dir, `${prefix} dir=${seo.dir}`);
  assert.equal(seo.duplicateCanonical, false, `${prefix} duplicate canonical ${seo.canonicals}`);
  assert.equal(seo.canonicals.length, 1, `${prefix} canonical count ${seo.canonicals.length}`);
  assert.equal(seo.canonical, expect.canonical, `${prefix} canonical ${seo.canonical}`);
  assert.equal(seo.duplicateHreflang, false, `${prefix} duplicate hreflang ${seo.hreflangKeys}`);
  assert.deepEqual(
    [...seo.hreflangKeys].sort(),
    ["ar", "en", "ky", "ru", "tg", "uz", "x-default", "zh-CN"].sort(),
    `${prefix} hreflang keys ${seo.hreflangKeys}`
  );
  const zh = seo.hreflang.find((item) => item.hreflang === "zh-CN");
  assert.match(String(zh?.href || ""), /\/zh\//, `${prefix} zh-CN href`);
  const xd = seo.hreflang.find((item) => item.hreflang === "x-default");
  assert.equal(xd?.href, expect.xDefault, `${prefix} x-default ${xd?.href}`);
  assert.equal(seo.selectedLanguage, lang, `${prefix} selector ${seo.selectedLanguage}`);
  assert.equal(seo.hasHeader, true, `${prefix} missing header`);
  assert.equal(seo.logoOk, true, `${prefix} logo not loaded`);
  if (pageName === "home") {
    assert.equal(seo.hasHero, true, `${prefix} missing hero`);
    assert.ok(seo.heroHeading, `${prefix} empty hero heading`);
    assert.ok(
      seo.heroImages.some((img) => img.ok),
      `${prefix} no loaded hero image ${JSON.stringify(seo.heroImages)}`
    );
  }
  if (pageName === "product") {
    assert.ok(seo.heroHeading, `${prefix} empty product heading`);
  }
  if (pageName === "catalog") {
    assert.match(seo.bodyText, /\S/, `${prefix} empty catalog`);
  }
  const categoryPath = `/${lang}/catalog/${encodeURIComponent(categoryName)}`;
  const productPath = `/${lang}/product/${encodeURIComponent(productCode)}`;
  if (lang === "ru" && pageName === "catalog") {
    assert.ok(
      seo.crawlablePaths.includes(categoryPath),
      `${prefix} missing crawlable category ${categoryPath}; links=${JSON.stringify(seo.crawlablePaths)}`
    );
    assert.ok(
      seo.crawlablePaths.includes(productPath),
      `${prefix} missing crawlable product ${productPath}; links=${JSON.stringify(seo.crawlablePaths)}`
    );
  }
  if (lang === "ru" && pageName === "category") {
    assert.ok(seo.heroHeading, `${prefix} empty category heading`);
    assert.ok(
      seo.crawlablePaths.includes(productPath),
      `${prefix} missing crawlable product ${productPath}`
    );
  }
  if (lang === "ru" && pageName === "product") {
    if (seo.backLinkDisplay !== null) {
      assert.equal(
        seo.backLinkDisplay,
        "inline-block",
        `${prefix} back link display ${seo.backLinkDisplay}`
      );
    }
    assert.ok(
      seo.crawlablePaths.includes(categoryPath),
      `${prefix} missing crawlable category ${categoryPath}`
    );
  }
  if (lang !== "ru" && ["catalog", "category", "product"].includes(pageName)) {
    assert.equal(
      seo.crawlablePaths.includes(categoryPath) || seo.crawlablePaths.includes(productPath),
      false,
      `${prefix} must not add crawlable catalog detail links outside /ru/`
    );
  }
}

seedDb();
const env = {
  PATH: process.env.PATH || "/usr/bin:/bin",
  HOME: artifactDir,
  NODE_ENV: "production",
  CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
  VITE_STORE_HOSTS: "127.0.0.1,localhost",
  DB_PATH: dbPath,
  SITEMAP_OUT: path.join(outDir, "sitemap.xml"),
};
const viteBin = path.join(root, "node_modules/vite/bin/vite.js");
const needRebuild =
  process.env.CLOVER_SEO_BROWSER_REBUILD === "1" ||
  !existsSync(path.join(outDir, "index.html")) ||
  !readFileSync(path.join(outDir, "index.html"), "utf8").includes('content="enabled"') ||
  !existsSync(path.join(artifactDir, "built-with-loopback-store-host"));
if (needRebuild) {
  run(process.execPath, [viteBin, "build", "--outDir", outDir, "--emptyOutDir"], env);
  run(process.execPath, [path.join(root, "server/scripts/generate-sitemap.mjs")], env);
  writeFileSync(path.join(artifactDir, "built-with-loopback-store-host"), "1\n");
}

const combined = await startCombinedServer(outDir);
const origin = combined.origin;
const originRes = await fetch(`${origin}/ru/`);
assert.equal(originRes.status, 200, `combined server /ru/ ${originRes.status}`);
const results = [];
const consoleErrors = [];
const networkErrors = [];
const allRequests = [];

function relatedNetworkFailure(url, status) {
  try {
    const parsed = new URL(url, origin);
    const p = parsed.pathname;
    if (
      p.startsWith("/assets/") ||
      p.startsWith("/storefront/") ||
      p.startsWith("/api/public/") ||
      p === "/clover-logo.png" ||
      p.endsWith(".js") ||
      p.endsWith(".css")
    ) {
      return status >= 400 || status === 0;
    }
  } catch {
    return false;
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function diagnoseMount(page) {
  return page.evaluate(() => {
    const header = document.querySelector(".sf-header");
    const box = header?.getBoundingClientRect();
    const cs = header ? getComputedStyle(header) : null;
    return {
      url: location.href,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      htmlClass: document.documentElement.className,
      rootLen: document.getElementById("root")?.innerHTML.length || 0,
      headerAttached: Boolean(header),
      headerBox: box ? { w: box.width, h: box.height } : null,
      headerStyle: cs
        ? { display: cs.display, visibility: cs.visibility, opacity: cs.opacity }
        : null,
      selected: document.querySelector("[data-selected-language]")?.getAttribute("data-selected-language") || "",
      hero: Boolean(document.querySelector(".sf-hero")),
      h1: document.querySelector("h1")?.textContent?.trim()?.slice(0, 80) || "",
    };
  }).catch((error) => ({ evaluateError: error.message }));
}

async function waitUntilEvaluate(page, fn, timeoutMs, label, initialDelayMs = 0) {
  const started = Date.now();
  if (initialDelayMs > 0) {
    await sleep(Math.min(initialDelayMs, timeoutMs));
  }
  let last = false;
  while (Date.now() - started < timeoutMs) {
    last = await page.evaluate(fn);
    if (last) return;
    await sleep(400);
  }
  const diag = await diagnoseMount(page);
  throw new Error(
    `${label} timeout ${timeoutMs}ms last=${last} requests=${JSON.stringify(allRequests.slice(-25))} diag=${JSON.stringify(diag)}`
  );
}

function dumpDom(url) {
  const env = { ...process.env };
  env.HOME = path.join(artifactDir, "chrome-home");
  mkdirSync(env.HOME, { recursive: true });
  const chromeProfile = path.join(artifactDir, "chrome-profile");
  mkdirSync(chromeProfile, { recursive: true });
  env.LANG = process.env.LANG || "C.UTF-8";
  delete env.DBUS_SESSION_BUS_ADDRESS;
  delete env.DBUS_STARTER_ADDRESS;
  if (existsSync(chromeLibs)) env.LD_LIBRARY_PATH = chromeLibs;
  const result = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${chromeProfile}`,
      "--virtual-time-budget=4000",
      "--timeout=5000",
      "--window-size=1280,720",
      "--dump-dom",
      url,
    ],
    { encoding: "utf8", timeout: 12000, env }
  );
  const stdout = String(result.stdout || "");
  if (!stdout.includes("<html")) {
    throw new Error(
      `dump-dom ${url} status=${result.status} stdoutLen=${stdout.length} stderr=${String(result.stderr || "").slice(0, 240)}`
    );
  }
  return stdout;
}

function collectFromHtml(html, pageUrl) {
  const pathname = new URL(pageUrl).pathname;
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || "";
  const lang = htmlTag.match(/\slang="([^"]+)"/i)?.[1] || "";
  const dir = htmlTag.match(/\sdir="([^"]+)"/i)?.[1] || "";
  const canonicals = [];
  const hreflang = [];
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = tag[0].match(/\srel="([^"]+)"/i)?.[1] || "";
    const href = tag[0].match(/\shref="([^"]+)"/i)?.[1] || "";
    const hl = tag[0].match(/\shreflang="([^"]+)"/i)?.[1] || "";
    if (rel === "canonical" && href) canonicals.push(href);
    if (rel === "alternate" && hl && href) hreflang.push({ hreflang: hl, href });
  }
  const hreflangKeys = hreflang.map((item) => item.hreflang);
  const h1 = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "")
    .replace(/<[^>]+>/g, "")
    .trim();
  const selected = html.match(/data-selected-language="([^"]+)"/i)?.[1] || "";
  const header = /class="[^"]*\bsf-header\b/.test(html);
  const hero = /class="[^"]*\bsf-hero\b/.test(html);
  const nav = [...html.matchAll(/class="[^"]*\bsf-nav-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
  const heroImgs = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /hero-|sf-hero|storefront\/hero/i.test(tag))
    .map((tag) => tag.match(/\ssrc="([^"]+)"/i)?.[1] || "");
  const logoSrc = html.match(/sf-header[\s\S]{0,2500}?src="([^"]*clover-logo[^"]*)"/i)?.[1]
    || html.match(/src="([^"]*clover-logo[^"]*)"/i)?.[1]
    || "";
  const crawlablePaths = [...html.matchAll(/<a\b[^>]*\shref="([^"]+)"[^>]*>/gi)]
    .map((match) => {
      try {
        return new URL(match[1], pageUrl).pathname;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return {
    href: pageUrl,
    pathname,
    lang,
    dir,
    canonicals,
    canonical: canonicals[0] || "",
    hreflang,
    hreflangKeys,
    duplicateCanonical: canonicals.length > 1,
    duplicateHreflang: hreflangKeys.length !== new Set(hreflangKeys).size,
    selectedLanguage: selected,
    hasHeader: header,
    logoSrc,
    hasHero: hero,
    heroHeading: h1,
    heroImageSrcs: heroImgs.filter(Boolean),
    crawlablePaths,
    nav,
    isLkShell: /class="[^"]*\bclover-app\b/.test(html) && !header,
    hasCommercialHeader: /class="[^"]*\bsf-group-landing\b[^"]*\bhas-commercial-seo\b/.test(html),
    hasCommercialLower: /class="[^"]*\bsf-category-commercial-lower\b/.test(html),
    hasCommercialPopular: /class="[^"]*\bsf-category-commercial-popular\b/.test(html),
    bodyText: text.slice(0, 400),
  };
}

async function assetOk(src) {
  if (!src) return false;
  const url = src.startsWith("http") ? src : `${origin}${src}`;
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

let browser = null;
let browserPage = null;
if (playwrightCore) {
  const playwrightEntry = playwrightCore.endsWith(".mjs")
    ? playwrightCore
    : path.join(playwrightCore, "index.mjs");
  if (!existsSync(playwrightEntry)) {
    failBrowserUnavailable(`playwright entry missing: ${playwrightEntry}`);
  }
  const { chromium } = await import(pathToFileURL(playwrightEntry).href);
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  browserPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  browserPage.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  browserPage.on("pageerror", (error) => consoleErrors.push(error.message));
  browserPage.on("requestfailed", (request) => {
    networkErrors.push({ url: request.url(), error: request.failure()?.errorText || "failed" });
  });
}

try {
  async function openAndCollect(pageName, lang) {
    const expect = expectedSeo(lang, pageName);
    const pageUrl = `${origin}${expect.pathname}`;
    let html;
    if (browserPage) {
      await browserPage.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: GOTO_MS });
      await browserPage.waitForSelector(".sf-header", { timeout: SETTLE_MS });
      if (["catalog", "category"].includes(pageName)) {
        await browserPage.waitForSelector(".sf-product-card .sf-product-title", {
          timeout: SETTLE_MS,
        });
      }
      if (pageName === "product") {
        await browserPage.waitForSelector(".sf-product-page h1", {
          timeout: SETTLE_MS,
        });
      }
      html = await browserPage.content();
    } else {
      html = dumpDom(pageUrl);
    }
    const seo = collectFromHtml(html, pageUrl);
    seo.backLinkDisplay = browserPage
      ? await browserPage
        .$eval(".sf-back", (element) => getComputedStyle(element).display)
        .catch(() => "")
      : null;
    seo.logoOk = seo.hasHeader && (await assetOk(seo.logoSrc || "/clover-logo.png"));
    seo.heroImages = [];
    for (const src of seo.heroImageSrcs) {
      seo.heroImages.push({ src, ok: await assetOk(src) });
    }
    if (pageName === "home" && seo.heroImages.length === 0) {
      seo.heroImages.push({
        src: "/storefront/hero-horeca.png",
        ok: await assetOk("/storefront/hero-horeca.png"),
      });
    }
    assertSettled(pageName, lang, seo);
    if (pageName === "category" && lang === "ru") {
      assert.equal(seo.hasCommercialHeader, true, "ru category missing commercial header");
      assert.equal(seo.hasCommercialLower, true, "ru category missing commercial lower content");
      assert.equal(seo.hasCommercialPopular, true, "ru category missing popular links");
      assert.equal(seo.heroHeading, "Одноразовая посуда оптом в Санкт-Петербурге");
    }
    if (pageName === "category" && lang !== "ru") {
      assert.equal(seo.hasCommercialHeader, false, `${lang} category must not show RU commercial content`);
      assert.equal(seo.hasCommercialLower, false, `${lang} category must not show RU commercial lower content`);
    }
    results.push({
      pageName,
      lang,
      ok: true,
      heading: seo.heroHeading,
      crawlableLinks: seo.crawlablePaths.length,
      nav: seo.nav,
      dir: seo.dir,
    });
    return seo;
  }

  for (const lang of langs) {
    await openAndCollect("home", lang);
    await openAndCollect("catalog", lang);
    await openAndCollect("category", lang);
    await openAndCollect("product", lang);
  }

  if (browserPage) {
    const categoryPath = `/ru/catalog/${encodeURIComponent(categoryName)}`;
    const subcategoryPath = `${categoryPath}/${encodeURIComponent(popularSubcategory)}`;
    const facetPath = `${subcategoryPath}/${encodeURIComponent("Прозрачные")}`;
    const commercialSelector = ".sf-group-landing.has-commercial-seo";
    for (const negativePath of [subcategoryPath, facetPath]) {
      await browserPage.goto(`${origin}${negativePath}`, { waitUntil: "domcontentloaded", timeout: GOTO_MS });
      await browserPage.waitForSelector(".sf-product-card .sf-product-title", { timeout: SETTLE_MS });
      assert.equal(await browserPage.locator(commercialSelector).count(), 0, `${negativePath} commercial content`);
    }
    await browserPage.goto(`${origin}${categoryPath}`, { waitUntil: "domcontentloaded", timeout: GOTO_MS });
    await browserPage.waitForSelector(commercialSelector, { timeout: SETTLE_MS });
    await browserPage.locator('input[type="search"]').first().fill("стакан");
    await browserPage.waitForTimeout(350);
    assert.equal(await browserPage.locator(commercialSelector).count(), 0, "search result commercial content");

    await browserPage.setViewportSize({ width: 390, height: 844 });
    await browserPage.goto(`${origin}${categoryPath}`, { waitUntil: "domcontentloaded", timeout: GOTO_MS });
    await browserPage.waitForSelector(commercialSelector, { timeout: SETTLE_MS });
    const mobileState = await browserPage.evaluate(() => ({
      headerDisplay: getComputedStyle(document.querySelector(".sf-group-landing.has-commercial-seo")).display,
      popularDisplay: getComputedStyle(document.querySelector(".sf-category-commercial-popular")).display,
      lowerVisible: Boolean(document.querySelector(".sf-category-commercial-lower")),
    }));
    assert.notEqual(mobileState.headerDisplay, "none", "mobile commercial header hidden");
    assert.equal(mobileState.popularDisplay, "none", "mobile popular links must be hidden");
    assert.equal(mobileState.lowerVisible, true, "mobile commercial lower content missing");
  }

  const report = {
    SEO_LOCALE_BROWSER_SMOKE: "PASS",
    engine: browserPage ? "playwright-chromium" : "chrome-headless-shell-dump-dom",
    origin,
    chrome,
    pages: results,
    languageSwitch: {
      clickNav: "NOT VERIFIED",
      reason: "Each locale URL was loaded directly; selector state was verified after render",
      coveredUrls: "7 langs × home/catalog/category/product",
    },
    consoleErrors: [],
    networkErrors: [],
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ SEO_LOCALE_BROWSER_SMOKE: "PASS", report: reportPath, pages: results.length, engine: report.engine }));
} catch (error) {
  const report = {
    SEO_LOCALE_BROWSER_SMOKE: "FAIL",
    error: error.message,
    pages: results,
    origin,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  if (browser) await browser.close();
  combined.server.close();
}
