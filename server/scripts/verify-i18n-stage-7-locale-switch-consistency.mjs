import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchTestChromium } from "./playwrightRuntime.mjs";

import {
  PUBLIC_LOCALE_CODES,
  TARGET_INTERNAL_LOCALES,
} from "../../src/shared/i18n/languageRegistry.js";
import { listSeoCatalogEntries } from "../../src/shared/i18n/seoCatalog.js";
import { listInfoPageCatalogEntries } from "../../src/shared/i18n/infoPageCatalog.js";
import { listCategoryCatalogEntries } from "../../src/shared/i18n/categoryCatalog.js";
import { sourceHash } from "../../src/shared/i18n/sourceHash.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const productionDataPrefix = "/opt/clover/clover-app/";
const temp = mkdtempSync(path.join(tmpdir(), "clover-stage7-locale-switch-"));
const dbPath = path.join(temp, "fixture.sqlite");
const outDir = path.join(temp, "dist");
const evidenceDir =
  process.env.STAGE7_LOCALE_SWITCH_EVIDENCE ||
  path.join(tmpdir(), "clover-stage7-locale-switch-evidence");
assert.equal(path.resolve(dbPath).startsWith(productionDataPrefix), false);
mkdirSync(evidenceDir, { recursive: true });

function cleanup() {
  rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
process.on("exit", cleanup);

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

function insertAppState(db, key, value) {
  db.prepare("INSERT INTO app_state(key, value_json) VALUES (?, ?)").run(
    key,
    JSON.stringify(value)
  );
}

function seedFixtureDatabase() {
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
    id: "product-7",
    code: "SKU-7",
    oneCId: "onec-7",
    oneCCode: "SKU-7",
    name: "Стакан тестовый",
    active: true,
    showOnStorefront: true,
    category: "Одноразовая посуда",
    subcategory: "Стаканы",
    storefrontDetails: {
      description: "Описание тестового стакана",
      composition: "",
      characteristics: "",
    },
  };
  insertAppState(db, "products", [product]);
  insertAppState(db, "oneCProducts", [{ id: "onec-7", code: "SKU-7", name: product.name }]);
  insertAppState(db, "settings", { storefrontShowOnlyLinked: true, storefrontInfoPages: {} });
  insertAppState(db, "localizationSettings", {
    enabledLanguages: PUBLIC_LOCALE_CODES,
    catalogVersion: 700,
  });
  const catalogs = [
    ...listSeoCatalogEntries(),
    ...listInfoPageCatalogEntries(),
    ...listCategoryCatalogEntries(),
  ];
  const insertEntry = db.prepare(
    `INSERT INTO translation_entries(id, namespace, entity_type, entity_id, field_key, source_ru, source_hash, critical)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );
  const insertValue = db.prepare(
    `INSERT INTO translation_values(entry_id, language_code, value, state, source_hash)
     VALUES (?, ?, ?, 'MANUAL', ?)`
  );
  catalogs.forEach((entry, index) => {
    const id = `entry-${index}`;
    const hash = sourceHash(entry.sourceRu);
    insertEntry.run(
      id,
      entry.namespace,
      entry.entityType || "",
      entry.entityId || "",
      entry.fieldKey,
      entry.sourceRu,
      hash
    );
    for (const internal of TARGET_INTERNAL_LOCALES) {
      const publicCode = internal === "zh-CN" ? "zh" : internal;
      const translated =
        entry.entityId === "catalog" && entry.fieldKey === "title"
          ? `${publicCode.toUpperCase()} Catalog`
          : `${publicCode.toUpperCase()} ${entry.sourceRu}`;
      insertValue.run(id, internal, translated, hash);
    }
  });
  const insertProduct = db.prepare(
    `INSERT INTO product_translations(product_id, language_code, field_key, auto_value, auto_source_hash, manual_value, manual_source_hash)
     VALUES (?, ?, 'name', ?, ?, '', '')`
  );
  const nameHash = sourceHash(product.name);
  for (const internal of TARGET_INTERNAL_LOCALES) {
    const publicCode = internal === "zh-CN" ? "zh" : internal;
    insertProduct.run(product.id, internal, `${publicCode.toUpperCase()} Test Cup`, nameHash);
  }
  db.close();
}

function minimalEnvironment(extra = {}) {
  return {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: temp,
    NODE_ENV: "test",
    NO_PROXY: "*",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
    DB_PATH: dbPath,
    SITEMAP_OUT: path.join(outDir, "sitemap.xml"),
    ...extra,
  };
}

function run(command, args, env = minimalEnvironment()) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`
  );
  return result;
}

const ENABLED = ["ru", "en", "uz", "ky", "tg", "zh", "ar"];
const DICTIONARIES = {
  ru: {
    "storefront.nav.home": "Главная",
    "storefront.nav.catalog": "Каталог",
    "storefront.nav.cart": "Корзина",
    "admin.languages.language": "Язык",
    "shared.error.requestFailed": "Не удалось выполнить запрос.",
  },
  en: {
    "storefront.nav.home": "Home",
    "storefront.nav.catalog": "Catalog",
    "storefront.nav.cart": "Cart",
    "admin.languages.language": "Language",
    "shared.error.requestFailed": "The request failed.",
  },
  ar: {
    "storefront.nav.home": "الرئيسية",
    "storefront.nav.catalog": "كتالوج",
    "storefront.nav.cart": "السلة",
    "admin.languages.language": "اللغة",
    "shared.error.requestFailed": "فشل الطلب.",
  },
};

function runtimeFor(requested) {
  const map = {
    ru: "ru",
    en: "en",
    uz: "uz",
    ky: "ky",
    tg: "tg",
    zh: "zh-CN",
    "zh-CN": "zh-CN",
    ar: "ar",
  };
  const effectiveLocale = map[String(requested || "ru")] || "ru";
  return {
    catalogVersion: 700,
    dictionary: DICTIONARIES[effectiveLocale] || {},
    effectiveLocale,
    enabledLanguages: ENABLED,
  };
}

function productFor(language) {
  const publicCode =
    language === "zh-CN" || language === "zh"
      ? "ZH"
      : String(language || "ru").toUpperCase();
  const name =
    language === "ru" || !language ? "Стакан тестовый" : `${publicCode} Test Cup`;
  return {
    id: "product-7",
    code: "SKU-7",
    name,
    active: true,
    showOnStorefront: true,
    category: "Одноразовая посуда",
    subcategory: "Стаканы",
    price: 120,
    imageUrl: "",
    storefrontDetails: { description: name, composition: "", characteristics: "" },
  };
}

function homeDescription(language) {
  return language === "ru"
    ? "Организация КЛЕВЕР"
    : `${String(language).toUpperCase()} Organization description`;
}

function expectedAccepted(language) {
  const nav = {
    ru: "Главная",
    en: "Home",
    ar: "الرئيسية",
  };
  const h1 = language === "ru" ? "Стакан тестовый" : `${language.toUpperCase()} Test Cup`;
  return {
    pathname: `/${language}/product/SKU-7`,
    selected: language,
    lang: language,
    dir: language === "ar" ? "rtl" : "ltr",
    navHome: nav[language],
    h1,
    jsonLdDescription: homeDescription(language),
    jsonLdUrl: "https://clover-spb.ru/ru/",
    canonical: `https://clover-spb.ru/${language}/product/SKU-7`,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const apiControl = {
  runtimeMode: { ru: "ok", en: "ok", ar: "ok" },
  runtimeDelayMs: { ru: 0, en: 0, ar: 0 },
  runtimeEvents: [],
};

function setRuntime(language, mode, delayMs = 0) {
  apiControl.runtimeMode[language] = mode;
  apiControl.runtimeDelayMs[language] = delayMs;
}

async function installApiIsolation(page, blocked, previewPort) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const previewHost =
      (url.hostname === "127.0.0.1" || url.hostname === "clover-spb.ru") &&
      url.port === previewPort;
    if (!previewHost) {
      blocked.push(request.url());
      await route.abort();
      return;
    }
    if (url.pathname.startsWith("/api/public/localization/runtime")) {
      const language = url.searchParams.get("language") || "ru";
      const delay = apiControl.runtimeDelayMs[language] || 0;
      if (delay) await sleep(delay);
      const mode = apiControl.runtimeMode[language] || "ok";
      apiControl.runtimeEvents.push({ language, mode, at: Date.now() });
      if (mode === "http500") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "synthetic-runtime-fail" }),
        });
        return;
      }
      if (mode === "network") {
        await route.abort("connectionrefused");
        return;
      }
      if (mode === "invalid") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ effectiveLocale: language }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(runtimeFor(language)),
      });
      return;
    }
    if (url.pathname === "/api/public/site") {
      const language = url.searchParams.get("language") || "ru";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          site: {
            heroTitle: "Fixture title",
            heroLead: "Lead",
            heroSlides: [],
            homePromotions: [],
            seo: { home: { description: homeDescription(language) } },
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/public/catalog") {
      const language = url.searchParams.get("language") || "ru";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          categories: [{ category: "Одноразовая посуда", subcategory: "Стаканы" }],
          products: [productFor(language)],
        }),
      });
      return;
    }
    if (url.pathname.startsWith("/api/public/catalog/")) {
      const language = url.searchParams.get("language") || "ru";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ product: productFor(language) }),
      });
      return;
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "isolated-fixture-miss" }),
      });
      return;
    }
    await route.continue();
  });
}

async function pageState(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    let jsonLd = {};
    try {
      jsonLd = JSON.parse(
        document.querySelector('script[type="application/ld+json"]')?.textContent || "{}"
      );
    } catch {
      jsonLd = { parseError: true };
    }
    return {
      href: location.href,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      historyLength: history.length,
      lang: root.lang,
      dir: root.dir,
      selected:
        document.querySelector(".language-selector")?.dataset.selectedLanguage || "",
      switchFailed:
        document.querySelector(".language-selector")?.dataset.languageSwitchFailed || "0",
      switchStatus:
        document.querySelector("[data-language-switch-status]")?.textContent?.trim() || "",
      navHome: document.querySelector(".sf-nav-link")?.textContent?.trim() || "",
      h1: document.querySelector("h1")?.textContent?.trim() || "",
      title: document.title,
      canonical:
        document.querySelector('link[rel="canonical"]')?.getAttribute("href") || "",
      jsonLdDescription: jsonLd.description || "",
      jsonLdUrl: jsonLd.url || "",
    };
  });
}

function assertAccepted(actual, language, label) {
  const expected = expectedAccepted(language);
  const failures = [];
  for (const key of [
    "pathname",
    "selected",
    "lang",
    "dir",
    "navHome",
    "h1",
    "jsonLdDescription",
    "jsonLdUrl",
    "canonical",
  ]) {
    if (actual[key] !== expected[key]) {
      failures.push(`${label}.${key}: expected ${expected[key]} got ${actual[key]}`);
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
}

function matchesAccepted(actual, language, { failed = false } = {}) {
  const expected = expectedAccepted(language);
  return (
    actual.pathname === expected.pathname &&
    actual.selected === expected.selected &&
    actual.lang === expected.lang &&
    actual.dir === expected.dir &&
    actual.navHome === expected.navHome &&
    actual.h1 === expected.h1 &&
    actual.jsonLdDescription === expected.jsonLdDescription &&
    actual.jsonLdUrl === expected.jsonLdUrl &&
    actual.canonical === expected.canonical &&
    (!failed || actual.switchFailed === "1")
  );
}

async function waitForAcceptedState(page, language, { failed = false, timeout = 15000 } = {}) {
  const started = Date.now();
  let last = await pageState(page);
  while (Date.now() - started < timeout) {
    if (matchesAccepted(last, language, { failed })) return last;
    await sleep(50);
    last = await pageState(page);
  }
  assertAccepted(last, language, failed ? "settled-failure" : "accepted");
  if (failed) assert.equal(last.switchFailed, "1", "switch failure was not exposed");
  return last;
}

async function waitAccepted(page, language, timeout = 15000) {
  return waitForAcceptedState(page, language, { failed: false, timeout });
}

async function waitSettledFailure(page, language, timeout = 15000) {
  return waitForAcceptedState(page, language, { failed: true, timeout });
}

async function chooseLanguage(page, code) {
  await page.locator(".language-selector-trigger").click();
  await page.waitForSelector(`[data-language="${code}"]`);
  await page.locator(`[data-language="${code}"]`).click();
}

seedFixtureDatabase();
const viteBin = path.join(root, "node_modules/vite/bin/vite.js");
run(process.execPath, [viteBin, "build", "--outDir", outDir, "--emptyOutDir"]);
run(process.execPath, [path.join(root, "server/scripts/generate-sitemap.mjs")]);

const port = await freePort();
const preview = spawn(
  process.execPath,
  [viteBin, "preview", "--outDir", outDir, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: root, env: minimalEnvironment(), stdio: ["ignore", "pipe", "pipe"] }
);
let previewOutput = "";
preview.stdout.on("data", (chunk) => {
  previewOutput += chunk;
});
preview.stderr.on("data", (chunk) => {
  previewOutput += chunk;
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // retry
    }
    await sleep(100);
  }
  assert.equal(ready, true, `preview startup failed\n${previewOutput}`);

  const browser = await launchTestChromium({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--host-resolver-rules=MAP clover-spb.ru 127.0.0.1`,
    ],
  });
  const blocked = [];
  const findings = {};
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    findings.pageErrors = [...(findings.pageErrors || []), String(error)];
  });
  await installApiIsolation(page, blocked, String(port));
  const origin = `http://clover-spb.ru:${port}`;

  async function openAccepted(language, suffix = "/product/SKU-7") {
    setRuntime(language, "ok", 0);
    await page.goto(`${origin}/${language}${suffix}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sf-header .language-selector", { timeout: 15000 });
    return waitAccepted(page, language);
  }

  findings.beforeA = await openAccepted("ar");
  assertAccepted(findings.beforeA, "ar", "A.before");

  setRuntime("ru", "http500", 0);
  const historyBeforeA = findings.beforeA.historyLength;
  await chooseLanguage(page, "ru");
  findings.afterA = await waitSettledFailure(page, "ar");
  assertAccepted(findings.afterA, "ar", "A.after");
  assert.equal(findings.afterA.switchFailed, "1", "A must mark unsuccessful switch");
  assert.ok(findings.afterA.switchStatus, "A must expose existing failure copy");
  assert.equal(
    findings.afterA.historyLength,
    historyBeforeA,
    `A must not add history on rejected switch (${findings.afterA.historyLength} vs ${historyBeforeA})`
  );

  await openAccepted("ar");
  setRuntime("ru", "network", 0);
  await chooseLanguage(page, "ru");
  findings.afterBNetwork = await waitSettledFailure(page, "ar");
  assertAccepted(findings.afterBNetwork, "ar", "B.network");

  await openAccepted("ar");
  setRuntime("ru", "invalid", 0);
  await chooseLanguage(page, "ru");
  findings.afterBInvalid = await waitSettledFailure(page, "ar");
  assertAccepted(findings.afterBInvalid, "ar", "B.invalid");

  setRuntime("ru", "ok", 0);
  await chooseLanguage(page, "ru");
  findings.afterC = await waitAccepted(page, "ru");
  assertAccepted(findings.afterC, "ru", "C.retry");
  assert.equal(findings.afterC.switchFailed, "0");

  findings.beforeD = await openAccepted("ar");
  setRuntime("ru", "http500", 400);
  setRuntime("en", "ok", 40);
  await chooseLanguage(page, "ru");
  await sleep(80);
  assert.equal((await pageState(page)).pathname, "/ar/product/SKU-7", "D must stay on last accepted URL while RU is in flight");
  await chooseLanguage(page, "en");
  findings.afterD = await waitAccepted(page, "en");
  assertAccepted(findings.afterD, "en", "D.acceptedEn");
  await sleep(600);
  findings.afterDHold = await pageState(page);
  assertAccepted(findings.afterDHold, "en", "D.hold");

  findings.beforeE = await openAccepted("ar", "/product/SKU-7?utm_source=test#details");
  assert.equal(findings.beforeE.search, "?utm_source=test");
  assert.equal(findings.beforeE.hash, "#details");
  setRuntime("ru", "ok", 0);
  const historyBeforeE = findings.beforeE.historyLength;
  await chooseLanguage(page, "ru");
  findings.afterE = await waitAccepted(page, "ru");
  assertAccepted(findings.afterE, "ru", "E.success");
  assert.equal(findings.afterE.search, "?utm_source=test");
  assert.equal(findings.afterE.hash, "#details");
  await page.goBack();
  findings.afterEBack = await waitAccepted(page, "ar");
  assertAccepted(findings.afterEBack, "ar", "E.back");
  assert.equal(findings.afterEBack.search, "?utm_source=test");
  await page.goForward();
  findings.afterEForward = await waitAccepted(page, "ru");
  assertAccepted(findings.afterEForward, "ru", "E.forward");
  assert.ok(findings.afterE.historyLength >= historyBeforeE);

  const productionHits = blocked.filter((url) =>
    /:(4100|5273)(?:\/|$)|https:\/\/clover-spb\.ru\/api\//.test(url)
  );
  assert.deepEqual(productionHits, []);

  writeFileSync(
    path.join(evidenceDir, "locale-switch-evidence.json"),
    `${JSON.stringify({ origin: `http://127.0.0.1:${port}`, findings, runtimeEvents: apiControl.runtimeEvents, blocked }, null, 2)}\n`
  );
  console.log("STAGE_7_LOCALE_SWITCH_CONSISTENCY=PASS");
  console.log("A=PASS B=PASS C=PASS D=PASS E=PASS");
  console.log(`EVIDENCE_DIR=${evidenceDir}`);

  await context.close();
  await browser.close();
} finally {
  preview.kill("SIGTERM");
  await new Promise((resolve) => preview.once("exit", resolve));
}
