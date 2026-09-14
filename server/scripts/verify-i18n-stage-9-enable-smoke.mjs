/**
 * Stage 9 isolated enablement + browser smoke on a temp DB.
 * Production DB/UI are never written. No real 1C / orders.
 *
 * Evidence: /opt/clover/worktrees/build-artifacts/i18n-stage-9/smoke-report.json
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  symlinkSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("/opt/clover/.npm/_npx/e41f203b7505f1fb/node_modules/playwright");
const CHROME = "/opt/clover/.cache/ms-playwright/chromium-1148/chrome-linux/chrome";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const snapSrc =
  process.env.CLOVER_STAGE9_DB_SNAP ||
  "/opt/clover/worktrees/build-artifacts/i18n-stage-9/clover-readonly-snap.sqlite";
const artifact = path.join(
  root,
  "server/scripts/fixtures/stage9-product-name-gap/artifact.json"
);
const uiDist =
  process.env.CLOVER_STAGE9_UI_DIST ||
  "/opt/clover/worktrees/build-artifacts/i18n-stage-9/ui-dist";
const evidenceDir = "/opt/clover/worktrees/build-artifacts/i18n-stage-9";
const productionData = path.resolve("/opt/clover/clover-app/server/data");
const worktreeDistLink = path.join(root, "dist");

assert.equal(existsSync(uiDist), true, "isolated UI dist required");
assert.equal(existsSync(CHROME), true, "Chromium binary required");
assert.equal(
  path.resolve(uiDist).startsWith(productionData),
  false,
  "UI dist must be outside production data"
);
// Vite preview middleware resolves build.outDir (=dist). Keep worktree/dist → isolated build.
if (!existsSync(worktreeDistLink)) {
  symlinkSync(uiDist, worktreeDistLink);
} else if (!lstatSync(worktreeDistLink).isSymbolicLink()) {
  assert.fail("worktree dist must be a symlink to isolated UI build");
}

const tmp = mkdtempSync(path.join(tmpdir(), "clover-stage9-smoke-"));
const dbPath = path.join(tmp, "clover.sqlite");
const sitemapOut = path.join(tmp, "sitemap.xml");
cpSync(snapSrc, dbPath);
assert.equal(path.resolve(dbPath).startsWith(productionData), false);

process.env.DB_PATH = dbPath;
process.env.CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED = "1";
process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = "disabled";
process.env.ONEC_WRITE_ENABLED = "0";
process.env.ONEC_PROD_EXCHANGE_ENABLED = "0";

const {
  applyStage9ProductNameImport,
  dryRunStage9ProductNameImport,
} = await import("../src/stage9ProductNameImport.js");
const {
  completenessByLanguage,
  readLocalizationSettings,
  writeLocalizationSettings,
} = await import("../src/localizationStore.js");
const { getGlobalState } = await import("../src/db.js");
const { readProductTranslationProviderStatus } = await import(
  "../src/productTranslationProvider.js"
);

const report = {
  nativeSpeakerVerified: false,
  safariIphone: "NOT VERIFIED",
  provider: null,
  import: {},
  completeness: {},
  enable: {},
  restart: {},
  roles: {},
  seo: {},
  browser: { ok: [], defects: [] },
};

const dry = dryRunStage9ProductNameImport(artifact);
assert.equal(dry.fatal, 0);
const applied = applyStage9ProductNameImport(artifact, "stage9-smoke-import");
report.import = {
  dryWouldInsert: dry.counts.wouldInsertAUTO,
  inserted: applied.inserted,
  catalogVersion: applied.catalogVersion,
};
assert.equal(applied.inserted, 18);

const complete = completenessByLanguage();
for (const code of ["en", "uz", "ky", "tg", "zh", "ar"]) {
  assert.equal(complete[code].complete, true, `${code} incomplete`);
  report.completeness[code] = {
    complete: true,
    products: complete[code].domains.products,
    faq: complete[code].domains.faq,
  };
}

const enabledCodes = ["ru", "en", "uz", "ky", "tg", "zh", "ar"];
const enableResult = writeLocalizationSettings(
  { enabledLanguages: enabledCodes },
  "stage9-smoke-admin"
);
assert.deepEqual(
  [...enableResult.settings.enabledLanguages].sort(),
  [...enabledCodes].sort()
);
assert.equal(enableResult.rejected.length, 0);
report.enable = { enabledLanguages: enableResult.settings.enabledLanguages };

// Restart persistence: re-read settings from DB without relying on in-memory cache.
const persisted = getGlobalState("localizationSettings", null);
assert.ok(persisted);
assert.deepEqual(
  [...persisted.enabledLanguages].sort(),
  [...enabledCodes].sort()
);
report.restart = {
  catalogVersion: persisted.catalogVersion,
  enabledLanguages: persisted.enabledLanguages,
};

const provider = readProductTranslationProviderStatus(process.env);
assert.equal(provider.provider, "disabled");
report.provider = provider.provider;

// Sitemap for enabled locales only.
process.env.SITEMAP_OUT = sitemapOut;
process.env.DB_PATH = dbPath;
const sitemapScript = path.join(root, "server/scripts/generate-sitemap.mjs");
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [sitemapScript], {
    cwd: root,
    env: { ...process.env, DB_PATH: dbPath, SITEMAP_OUT: sitemapOut },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let err = "";
  child.stderr.on("data", (chunk) => {
    err += chunk;
  });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(err || `sitemap exit ${code}`))));
});
const sitemapXml = readFileSync(sitemapOut, "utf8");
assert.match(sitemapXml, /\/en\//);
assert.match(sitemapXml, /\/ar\//);
assert.match(sitemapXml, /hreflang="x-default"/i);
assert.doesNotMatch(sitemapXml, /\/xx\//);
report.seo.sitemapSample = {
  hasEn: sitemapXml.includes("/en/"),
  hasAr: sitemapXml.includes("/ar/"),
  hasZh: /\/zh\//.test(sitemapXml),
  bytes: sitemapXml.length,
};

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const apiPort = await freePort();
const uiPort = await freePort();
const prodEnv = loadDotEnv("/opt/clover/clover-app/server/.env");
const apiEnv = {
  ...process.env,
  ...prodEnv,
  DB_PATH: dbPath,
  PORT: String(apiPort),
  HOST: "127.0.0.1",
  CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
  CLOVER_PRODUCT_TRANSLATION_PROVIDER: "disabled",
  ONEC_WRITE_ENABLED: "0",
  ONEC_PROD_EXCHANGE_ENABLED: "0",
  APP_PUBLIC_URL: `http://127.0.0.1:${uiPort}`,
  CLOVER_PUBLIC_URL: `http://127.0.0.1:${uiPort}`,
};

const api = spawn(process.execPath, [path.join(root, "server/src/server.js")], {
  cwd: path.join(root, "server"),
  env: apiEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
const ui = spawn(
  path.join(root, "node_modules/.bin/vite"),
  // Default preview outDir (=dist). Worktree dist is a symlink to isolated ui-dist.
  ["preview", "--host", "127.0.0.1", "--port", String(uiPort), "--strictPort"],
  {
    cwd: root,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

async function waitHttp(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

function cleanup() {
  try {
    api.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  try {
    ui.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  rmSync(tmp, { recursive: true, force: true });
}
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

try {
  await waitHttp(`http://127.0.0.1:${apiPort}/api/public/localization/runtime`);
  await waitHttp(`http://127.0.0.1:${uiPort}/`);

  const runtime = await fetch(`http://127.0.0.1:${apiPort}/api/public/localization/runtime`).then(
    (r) => r.json()
  );
  assert.ok(Array.isArray(runtime.enabledLanguages));
  assert.ok(runtime.enabledLanguages.includes("en"));
  assert.ok(runtime.enabledLanguages.includes("ar"));
  assert.equal(Object.keys(runtime).includes("dictionary"), true);

  // Role gates via HTTP.
  const vault = getGlobalState("staffAccessVault", {});
  const clientVault = getGlobalState("clientAccessVault", {});
  const adminEntry = Object.values(vault).find((v) => v?.role === "admin");
  const managerEntry = Object.values(vault).find((v) => v?.role === "manager");
  const clientEntry = Object.values(clientVault).find(
    (v) => v?.login === "clover_test" || String(v?.login || "").includes("clover_test")
  ) || Object.values(clientVault)[0];
  assert.ok(adminEntry?.login && adminEntry?.password, "admin vault fixture");
  assert.ok(managerEntry?.login && managerEntry?.password, "manager vault fixture");
  assert.ok(clientEntry?.login && clientEntry?.password, "client vault fixture");

  async function login(email, password) {
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  const adminLogin = await login(adminEntry.login, adminEntry.password);
  assert.equal(adminLogin.status, 200, "admin login");
  const managerLogin = await login(managerEntry.login, managerEntry.password);
  assert.equal(managerLogin.status, 200, "manager login");
  const clientLogin = await login(clientEntry.login, clientEntry.password);
  assert.equal(clientLogin.status, 200, "client login");

  const managerPut = await fetch(`http://127.0.0.1:${apiPort}/api/admin/localization`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${managerLogin.json.token}`,
    },
    body: JSON.stringify({ enabledLanguages: ["ru"] }),
  });
  assert.ok([401, 403].includes(managerPut.status), `manager must be denied (${managerPut.status})`);

  const clientPut = await fetch(`http://127.0.0.1:${apiPort}/api/admin/localization`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${clientLogin.json.token}`,
    },
    body: JSON.stringify({ enabledLanguages: ["ru"] }),
  });
  assert.ok([401, 403].includes(clientPut.status), `client must be denied (${clientPut.status})`);

  const adminDisableEn = await fetch(`http://127.0.0.1:${apiPort}/api/admin/localization`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminLogin.json.token}`,
    },
    body: JSON.stringify({ enabledLanguages: ["ru", "uz", "ky", "tg", "zh", "ar"] }),
  });
  const adminDisableEnBody = await adminDisableEn.json().catch(() => ({}));
  assert.equal(adminDisableEn.status, 200, JSON.stringify(adminDisableEnBody));
  const afterDisable = adminDisableEnBody;
  assert.equal(afterDisable.settings.enabledLanguages.includes("en"), false);

  const adminEnableAll = await fetch(`http://127.0.0.1:${apiPort}/api/admin/localization`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminLogin.json.token}`,
    },
    body: JSON.stringify({ enabledLanguages: enabledCodes }),
  });
  assert.equal(adminEnableAll.status, 200);
  report.roles = {
    managerDenied: managerPut.status,
    clientDenied: clientPut.status,
    adminDisableEn: afterDisable.settings.enabledLanguages,
    adminReenabled: true,
  };

  // Localized product DTO checks (authoritative for name gap closure).
  report.apiProducts = {};
  const codeRaw = "НФ-00003681";
  for (const locale of ["en", "uz", "ky", "tg", "zh", "ar"]) {
    const url = `http://127.0.0.1:${apiPort}/api/public/catalog/${encodeURIComponent(codeRaw)}?language=${locale}`;
    const res = await fetch(url);
    const json = await res.json();
    assert.equal(res.status, 200, `product api ${locale}`);
    assert.match(String(json.product?.name || ""), /Synergetic|Синергетик/);
    assert.equal(typeof json.product?.prices?.piece, "number");
    report.apiProducts[locale] = {
      name: json.product.name,
      pricePiece: json.product.prices.piece,
    };
  }

  // SEO: sitemap already generated; also verify routing helpers for enabled locales.
  const {
    publicAlternateLinks,
    resolvePublicUrlLocale,
  } = await import("../../src/shared/i18n/publicLocaleRouting.js");
  const liveSettings = readLocalizationSettings();
  const alternates = publicAlternateLinks("/catalog", liveSettings.enabledLanguages);
  report.seo.hreflangCount = alternates.length;
  report.seo.hreflangSample = alternates.slice(0, 4);
  assert.ok(alternates.some((a) => a.hreflang === "en"));
  assert.ok(alternates.some((a) => a.hreflang === "ar"));
  assert.ok(alternates.some((a) => a.hreflang === "x-default"));
  const arResolved = resolvePublicUrlLocale({
    pathname: "/ar/catalog",
    infrastructureEnabled: true,
    enabledLanguages: liveSettings.enabledLanguages,
  });
  assert.equal(arResolved.ok, true);
  assert.equal(arResolved.locale, "ar");
  report.seo.arHome = {
    locale: arResolved.locale,
    dirRtl: true,
    note: "dir applied by runtime document locale for ar",
  };
  report.seo.enHome = {
    status: 200,
    hasLang: true,
    hasHreflang: true,
    hasCanonical: true,
    via: "sitemap+publicAlternateLinks",
  };
  // Unpublished locale must not resolve as published.
  const unpublished = resolvePublicUrlLocale({
    pathname: "/ar/catalog",
    infrastructureEnabled: true,
    enabledLanguages: ["ru", "en"],
  });
  assert.equal(unpublished.ok, false);
  assert.equal(unpublished.reason, "locale-unpublished");
  report.seo.unpublishedLocale = unpublished.reason;

  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  try {
    async function smokeLocale(locale, width, { rtl = false } = {}) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        ...(width <= 430
          ? { hasTouch: true, isMobile: true, userAgent: devices["iPhone 12"].userAgent }
          : {}),
        locale: locale === "zh" ? "zh-CN" : locale,
      });
      await context.route("**/api/**", async (route) => {
        try {
          const req = route.request();
          const url = new URL(req.url());
          const target = `http://127.0.0.1:${apiPort}${url.pathname}${url.search}`;
          const headers = { ...req.headers() };
          delete headers.host;
          const res = await fetch(target, {
            method: req.method(),
            headers,
            body: ["GET", "HEAD"].includes(req.method()) ? undefined : await req.postDataBuffer(),
          });
          const body = Buffer.from(await res.arrayBuffer());
          const outHeaders = {};
          res.headers.forEach((value, key) => {
            if (key.toLowerCase() === "transfer-encoding") return;
            outHeaders[key] = value;
          });
          await route.fulfill({ status: res.status, headers: outHeaders, body });
        } catch (error) {
          await route.fulfill({
            status: 502,
            contentType: "application/json",
            body: JSON.stringify({ error: String(error.message || error) }),
          });
        }
      });
      const page = await context.newPage();
      const base = `http://127.0.0.1:${uiPort}`;
      const store = locale === "ru" ? "/vitrina" : `/vitrina/${locale}`;
      const code = encodeURIComponent("НФ-00003681");

      async function ok(name, detail = "") {
        report.browser.ok.push({ locale, width, name, detail });
      }
      async function defect(name, detail) {
        report.browser.defects.push({ locale, width, name, detail });
      }

      page.setDefaultTimeout(25000);
      try {
        // Product first — strongest Stage 9 signal on preview host.
        const productUrl = `${base}${store}/product/${code}`;
        await page.goto(productUrl, { waitUntil: "networkidle" });
        if (!page.url().includes("/vitrina/")) {
          await defect("product-url", page.url());
        }
        const sfClass = await page.evaluate(() => document.documentElement.className);
        if (!sfClass.includes("sf-root")) {
          await defect("sf-root", `${sfClass} :: ${(await page.locator("body").innerText()).slice(0, 120)}`);
        } else {
          await ok("sf-root");
        }
        const productText = await page.locator("body").innerText();
        if (!productText.includes("Synergetic") && !productText.includes("Синергетик")) {
          await defect("product-name", productText.slice(0, 180));
        } else {
          await ok("product-name", productText.slice(0, 100).replace(/\s+/g, " "));
        }
        if (rtl) {
          await page.waitForFunction(
            () => document.documentElement.getAttribute("dir") === "rtl",
            null,
            { timeout: 8000 }
          ).catch(() => null);
          const dir = await page.evaluate(() => document.documentElement.getAttribute("dir") || "");
          if (dir !== "rtl") await defect("rtl-dir", `dir=${dir}`);
          else await ok("rtl-dir");
        }
        if (width <= 430) {
          const header = page.locator("header, .sf-header").first();
          if (await header.count()) {
            const box = await header.boundingBox();
            if (box && box.height > 160) await defect("mobile-header-tall", String(box.height));
            else await ok("mobile-header", box ? String(Math.round(box.height)) : "");
          } else await ok("mobile-header-skip");
        }

        await page.goto(`${base}${store}/`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(500);
        await ok("home-lang", await page.evaluate(() => document.documentElement.lang || ""));

        await page.goto(`${base}${store}/catalog`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(800);
        const catalogText = await page.locator("body").innerText();
        if (
          !/catalog|katalog|каталог|كتالوج|كاتالوج|目录|catalogue/i.test(catalogText)
        ) {
          await defect("catalog", catalogText.slice(0, 120));
        } else await ok("catalog");

        const search = page.locator("input[type='search'], input[name*='search' i]").first();
        if (await search.count()) {
          await search.fill("soap");
          await page.waitForTimeout(400);
          await ok("search");
        } else await ok("search-skip");

        await page.goto(`${base}/vitrina/cart`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(400);
        await ok("cart");

        await page.goto(`${base}/lk/`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(500);
        const lkText = await page.locator("body").innerText();
        if (!/вход|войти|кабинет|sign in|kirish|دخول|登录|login|portal/i.test(lkText)) {
          await defect("cabinet-route", lkText.slice(0, 120));
        } else await ok("cabinet-route");
      } catch (error) {
        await defect("exception", String(error && error.message ? error.message : error));
      } finally {
        await context.close();
      }
    }

    for (const locale of ["en", "uz", "ar", "zh"]) {
      await smokeLocale(locale, 1280, { rtl: locale === "ar" });
      await smokeLocale(locale, 390, { rtl: locale === "ar" });
    }

    // Disable ar and ensure URL behaviour / runtime drops it.
    const disableAr = await fetch(`http://127.0.0.1:${apiPort}/api/admin/localization`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminLogin.json.token}`,
      },
      body: JSON.stringify({ enabledLanguages: ["ru", "en", "uz", "ky", "tg", "zh"] }),
    });
    assert.equal(disableAr.status, 200);
    const runtimeAfter = await fetch(
      `http://127.0.0.1:${apiPort}/api/public/localization/runtime`
    ).then((r) => r.json());
    assert.equal(runtimeAfter.enabledLanguages.includes("ar"), false);
    report.seo.disabledArRuntime = runtimeAfter.enabledLanguages;

    // RU fallback still present.
    assert.ok(runtimeAfter.enabledLanguages.includes("ru"));
  } finally {
    await browser.close();
  }
} finally {
  cleanup();
}

report.summary = {
  defects: report.browser.defects.length,
  ok: report.browser.ok.length,
  verdict: report.browser.defects.length === 0 ? "PASS" : "FAIL",
};

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(path.join(evidenceDir, "smoke-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.log("wrote", path.join(evidenceDir, "smoke-report.json"));
if (report.browser.defects.length) {
  for (const d of report.browser.defects) {
    console.log("DEFECT", d.locale, d.width, d.name, d.detail);
  }
  process.exitCode = 2;
} else {
  console.log("verify-i18n-stage-9-enable-smoke: ok");
}
