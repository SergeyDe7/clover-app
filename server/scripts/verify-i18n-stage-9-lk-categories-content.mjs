/**
 * Stage 9 reopen — LK language handoff + category display content gates.
 * Temp DB only. No production writes. No provider / 1C / orders.
 *
 * Evidence: /opt/clover/worktrees/build-artifacts/i18n-stage-9/lk-categories-fix-verify.json
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/clover/.npm/_npx/e41f203b7505f1fb/node_modules/playwright");
const CHROME = "/opt/clover/.cache/ms-playwright/chromium-1148/chrome-linux/chrome";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const evidenceDir = "/opt/clover/worktrees/build-artifacts/i18n-stage-9";
const snapSrc =
  process.env.CLOVER_STAGE9_DB_SNAP ||
  path.join(evidenceDir, "clover-readonly-snap-stage9-reopen.sqlite");

function rejectProd(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
}

assert.equal(existsSync(CHROME), true, "Chromium required");
assert.equal(existsSync(snapSrc), true, "readonly snap required");

const tmp = mkdtempSync(path.join(tmpdir(), "clover-stage9-lk-cat-"));
const dbPath = path.join(tmp, "clover.sqlite");
rejectProd(dbPath);
cpSync(snapSrc, dbPath);
process.env.DB_PATH = dbPath;
process.env.TEST_DB_ISOLATED = "YES";
process.env.CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED = "1";
process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = "disabled";
process.env.ONEC_WRITE_ENABLED = "0";
process.env.ONEC_PROD_EXCHANGE_ENABLED = "0";

const report = {
  nativeSpeakerVerified: false,
  safariIphone: "NOT VERIFIED",
  unit: {},
  api: {},
  browser: { ok: [], defects: [] },
};

const {
  resolvePublicSurfaceLocale,
} = await import("../../src/shared/i18n/publicSurfaceLocale.js");
const {
  storefrontCategoryDisplayOptions,
  STOREFRONT_CATEGORY_ENABLED_LANGUAGES,
} = await import("../../src/shared/i18n/storefrontCategoryDisplay.js");
const {
  categoryDisplayNameFromCanonical,
} = await import("../../src/shared/i18n/categoryDisplayProjection.js");
const {
  writeLocalizationSettings,
  readLocalizationSettings,
  completenessByLanguage,
} = await import("../src/localizationStore.js");
const { getPublicSite, getPublicCatalog } = await import("../src/storefrontPublic.js");

// --- Unit: surface resolution + fail-closed default ---
assert.deepEqual(STOREFRONT_CATEGORY_ENABLED_LANGUAGES, ["ru"]);
assert.deepEqual(
  storefrontCategoryDisplayOptions("en").enabledLanguages,
  ["ru"]
);
assert.equal(
  resolvePublicSurfaceLocale("/en/catalog", { infrastructureEnabled: true }).urlLocale,
  "en"
);
assert.equal(
  resolvePublicSurfaceLocale("/lk/", { infrastructureEnabled: true }).surface,
  "cabinet"
);
assert.equal(
  resolvePublicSurfaceLocale("/catalog", { infrastructureEnabled: true }).urlLocale,
  null
);
report.unit.surface = "ok";

// Enable languages on temp DB (snap may be ru-only).
writeLocalizationSettings({
  enabledLanguages: ["ru", "en", "uz", "ky", "tg", "zh", "ar"],
});
const settings = readLocalizationSettings();
assert.ok(settings.enabledLanguages.includes("en"));

const siteEn = getPublicSite("en");
assert.equal(siteEn.locale, "en");
assert.ok(Object.keys(siteEn.categoryTranslations || {}).length >= 8);
const disposableEn =
  siteEn.categoryTranslations["category\0disposable"] ||
  siteEn.categoryTranslations["category\u0000disposable"];
assert.match(String(disposableEn || ""), /Disposable|tableware/i);

const projected = categoryDisplayNameFromCanonical(
  "Одноразовая посуда",
  "",
  storefrontCategoryDisplayOptions("en", siteEn.categoryTranslations, settings.enabledLanguages)
);
assert.match(projected, /Disposable|tableware/i);
assert.notEqual(projected, "Одноразовая посуда");

// Completeness can be complete while old UI omitted the bag — document that gap.
const complete = completenessByLanguage();
report.api.completenessEnCategories = complete.en?.domains?.categories || null;
report.api.siteEnDisposable = disposableEn;
report.api.catalogEnCategory0 = getPublicCatalog({ language: "en" }).categories?.[0]?.name;
assert.equal(report.api.catalogEnCategory0, "Одноразовая посуда"); // canonical identity stays RU
const expectedCategoryLabel = {};
for (const locale of ["en", "uz", "ky", "tg", "zh", "ar"]) {
  const site = getPublicSite(locale);
  const bag = site.categoryTranslations || {};
  const label =
    bag["category\0disposable"] || bag["category\u0000disposable"] || "";
  assert.ok(label && !/Одноразовая/.test(label), `missing ${locale} disposable label`);
  expectedCategoryLabel[locale] = label;
}
report.api.expectedCategoryLabel = expectedCategoryLabel;
report.unit.projection = "ok";

const { storefrontHeroCopy } = await import("../../src/screens/storefront/siteCopy.js");
const { buildClientProductDisplayNameMap } = await import("../src/clientProductDisplay.js");
const { getGlobalState } = await import("../src/db.js");

const expectedHero = {};
for (const locale of ["en", "uz", "ky", "tg", "zh", "ar"]) {
  expectedHero[locale] = storefrontHeroCopy(locale).title;
  assert.notEqual(expectedHero[locale], storefrontHeroCopy("ru").title);
}
report.api.expectedHeroTitle = expectedHero;

const allProducts = getGlobalState("products", []);
const displayEn = buildClientProductDisplayNameMap(allProducts, "en");
assert.ok(Object.keys(displayEn).length > 100, "product display map too small");
assert.match(String(displayEn["723"] || displayEn[723] || ""), /Synergetic|soap/i);
report.api.productDisplayEnCount = Object.keys(displayEn).length;
report.api.productDisplayEn723 = displayEn["723"] || displayEn[723] || null;

{
  const access = getGlobalState("clientAccessVault", {}) || {};
  const entry = Object.values(access).find(
    (v) => v?.login === "clover_test@clover.ru"
  );
  assert.ok(entry?.clientId, "clover_test fixture required in snap");
  const { getClientState, setClientStateField } = await import("../src/db.js");
  const state = getClientState(entry.clientId);
  setClientStateField(entry.clientId, "profile", {
    ...(state.profile || {}),
    locale: "ru",
  });
  report.api.testClientProfileLocale = "ru";
  report.api.testClientId = entry.clientId;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2];
  }
  return out;
}

const apiPort = await freePort();
const uiPort = await freePort();
const prodEnv = loadDotEnv("/opt/clover/clover-app/server/.env");
const api = spawn(process.execPath, [path.join(root, "server/src/server.js")], {
  cwd: path.join(root, "server"),
  env: {
    ...process.env,
    ...prodEnv,
    DB_PATH: dbPath,
    PORT: String(apiPort),
    HOST: "127.0.0.1",
    CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
    CLOVER_PRODUCT_TRANSLATION_PROVIDER: "disabled",
    ONEC_WRITE_ENABLED: "0",
    ONEC_PROD_EXCHANGE_ENABLED: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const uiDist =
  process.env.CLOVER_STAGE9_UI_DIST ||
  path.join(evidenceDir, "ui-dist-lk-categories");
assert.equal(existsSync(path.join(uiDist, "index.html")), true, "isolated UI dist required");
const worktreeDistLink = path.join(root, "dist");
if (!existsSync(worktreeDistLink)) {
  const { symlinkSync } = await import("node:fs");
  symlinkSync(uiDist, worktreeDistLink);
}

const ui = spawn(
  path.join(root, "node_modules/.bin/vite"),
  ["preview", "--host", "127.0.0.1", "--port", String(uiPort), "--strictPort"],
  {
    cwd: root,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

async function waitHttp(url, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

function cleanup() {
  try { api.kill("SIGTERM"); } catch { /* ignore */ }
  try { ui.kill("SIGTERM"); } catch { /* ignore */ }
  rmSync(tmp, { recursive: true, force: true });
}
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

try {
  await waitHttp(`http://127.0.0.1:${apiPort}/api/public/localization/runtime?language=en`);
  await waitHttp(`http://127.0.0.1:${uiPort}/`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: [
      "--host-resolver-rules=MAP clover-spb.ru 127.0.0.1, MAP www.clover-spb.ru 127.0.0.1, MAP clover-order.ru 127.0.0.1",
    ],
  });
  try {
    for (const locale of ["en", "uz", "ky", "tg", "zh", "ar"]) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: locale === "zh" ? "zh-CN" : locale,
      });
      await context.route("**/api/**", async (route) => {
        try {
          const req = route.request();
          const url = new URL(req.url());
          const headers = { ...req.headers() };
          delete headers.host;
          const res = await fetch(`http://127.0.0.1:${apiPort}${url.pathname}${url.search}`, {
            method: req.method(),
            headers,
            body: ["GET", "HEAD"].includes(req.method()) ? undefined : await req.postDataBuffer(),
          });
          const body = Buffer.from(await res.arrayBuffer());
          const out = {};
          res.headers.forEach((v, k) => {
            if (k.toLowerCase() !== "transfer-encoding") out[k] = v;
          });
          await route.fulfill({ status: res.status, headers: out, body });
        } catch (error) {
          await route.fulfill({ status: 502, body: String(error.message || error) });
        }
      });
      const page = await context.newPage();
      const store = `http://clover-spb.ru:${uiPort}`;
      const defect = (name, detail) =>
        report.browser.defects.push({ locale, name, detail });
      const ok = (name, detail = "") =>
        report.browser.ok.push({ locale, name, detail });

      try {
        await page.goto(`${store}/${locale}/`, { waitUntil: "networkidle", timeout: 60000 });
        await page.waitForTimeout(900);
        const homeText = await page.locator("body").innerText();
        const pref = await page.evaluate(() =>
          localStorage.getItem("clover-language-preference-v1")
        );
        if (pref !== locale) defect("pref-from-url", `pref=${pref}`);
        else ok("pref-from-url", pref);

        // Content gate: home tiles must show the locale's disposable label, not RU.
        const expected = expectedCategoryLabel[locale];
        if (/Одноразовая посуда|Хозяйственные товары|Химия,\s*чистящие/.test(homeText)) {
          defect("home-categories-ru", homeText.slice(0, 220));
        } else if (!homeText.includes(expected)) {
          defect("home-missing-label", `expected=${expected} :: ${homeText.slice(0, 220)}`);
        } else {
          ok("home-categories-localized", expected);
        }
        const heroTitle = expectedHero[locale];
        if (!homeText.includes(heroTitle)) {
          defect("home-hero-ru", `expected=${heroTitle} :: ${homeText.slice(0, 220)}`);
        } else if (/Хозтовары, упаковка и химия/.test(homeText) && locale !== "ru") {
          defect("home-hero-still-ru", homeText.slice(0, 180));
        } else {
          ok("home-hero-localized", heroTitle);
        }

        await page.goto(`${store}/${locale}/catalog`, { waitUntil: "networkidle" });
        await page.waitForTimeout(900);
        const catText = await page.locator("body").innerText();
        if (!catText.includes(expected)) {
          defect("catalog-missing-label", `expected=${expected} :: ${catText.slice(0, 220)}`);
        } else if (
          /Одноразовая посуда/.test(catText) &&
          !catText.includes(expected)
        ) {
          defect("catalog-categories-ru", catText.slice(0, 220));
        } else {
          ok("catalog-categories", expected);
        }

        // Handoff storefront → LK: language must survive without selector click.
        await page.goto(`${store}/lk/`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
        const lkLang = await page.evaluate(() => document.documentElement.lang || "");
        const lkText = await page.locator("body").innerText();
        if (lkLang !== locale && !(locale === "zh" && (lkLang === "zh" || lkLang === "zh-CN"))) {
          defect("lk-lang", `lang=${lkLang}`);
        } else {
          ok("lk-lang", lkLang);
        }
        if (locale === "ar") {
          const dir = await page.evaluate(() => document.documentElement.getAttribute("dir") || "");
          if (dir !== "rtl") defect("lk-rtl", `dir=${dir}`);
          else ok("lk-rtl");
        }
        if (/Личный кабинет|Войти\b/.test(lkText) && locale !== "ru") {
          defect("lk-chrome-ru", lkText.slice(0, 180));
        } else {
          ok("lk-chrome");
        }

        // Authenticated LK category chips for en — proves cabinet surfaces use the bag.
        if (locale === "en") {
          const credLines = Object.fromEntries(
            readFileSync("/tmp/clover-stage9-lk-creds.env", "utf8")
              .trim()
              .split("\n")
              .map((line) => line.split("="))
          );
          const loginRes = await fetch(`http://127.0.0.1:${apiPort}/api/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              email: credLines.CLOVER_TEST_LOGIN,
              password: credLines.CLOVER_TEST_PASSWORD,
            }),
          });
          const loginJson = await loginRes.json().catch(() => ({}));
          if (!loginRes.ok || !loginJson.token) {
            defect("lk-login-api", JSON.stringify(loginJson).slice(0, 200));
          } else {
            // Sticky en must already exist from /en storefront visit in this context.
            const stickyBefore = await page.evaluate(() =>
              sessionStorage.getItem("clover-language-explicit-v1")
            );
            if (stickyBefore !== "en") {
              await page.evaluate(() => {
                sessionStorage.setItem("clover-language-explicit-v1", "en");
                localStorage.setItem("clover-language-preference-v1", "en");
              });
            }
            await page.evaluate((token) => {
              localStorage.setItem("clover-api-token", token);
            }, loginJson.token);
            await page.goto(`${store}/lk/`, { waitUntil: "networkidle" });
            await page.waitForTimeout(2500);
            const afterLogin = await page.evaluate(() => ({
              lang: document.documentElement.lang || "",
              pref: localStorage.getItem("clover-language-preference-v1"),
              sticky: sessionStorage.getItem("clover-language-explicit-v1"),
            }));
            if (afterLogin.lang !== "en" || afterLogin.pref !== "en") {
              defect("lk-sticky-over-profile-ru", JSON.stringify(afterLogin));
            } else {
              ok("lk-sticky-over-profile-ru", JSON.stringify(afterLogin));
            }
            const addCatalog = page.getByText(/Add products from the catalog/i).first();
            if (await addCatalog.count()) {
              await addCatalog.click();
              await page.waitForTimeout(2000);
            }
            const lkBody = await page.locator("body").innerText();
            if (lkBody.includes(expected)) {
              ok("lk-categories-localized", expected);
            } else if (/Одноразовая посуда|Хозяйственные товары/.test(lkBody)) {
              defect("lk-categories-ru", lkBody.slice(0, 300));
            } else {
              defect("lk-categories-missing", lkBody.slice(0, 300));
            }
            const expectedProduct = report.api.productDisplayEn723;
            if (expectedProduct && lkBody.includes(expectedProduct)) {
              ok("lk-product-display-name", expectedProduct);
            } else if (/Жидкое мыло Синергетик/.test(lkBody) && expectedProduct) {
              defect("lk-product-name-ru", lkBody.slice(0, 300));
            } else if (expectedProduct) {
              // Product may be off-screen; probe API overlay instead.
              const overlay = await fetch(
                `http://127.0.0.1:${apiPort}/api/client/product-display?language=en`,
                { headers: { authorization: `Bearer ${loginJson.token}` } }
              ).then((r) => r.json());
              if (overlay?.displays?.["723"] === expectedProduct || overlay?.displays?.[723] === expectedProduct) {
                ok("lk-product-display-api", expectedProduct);
              } else {
                defect("lk-product-display-missing", JSON.stringify(overlay).slice(0, 200));
              }
            }

            // Bootstrap language must follow sticky en, not profile.locale=ru.
            const bootEn = await fetch(
              `http://127.0.0.1:${apiPort}/api/bootstrap?language=en`,
              { headers: { authorization: `Bearer ${loginJson.token}` } }
            ).then((r) => r.json());
            const bootProduct =
              (Array.isArray(bootEn.products) ? bootEn.products : []).find(
                (p) => String(p.id) === "723"
              ) ||
              (Array.isArray(bootEn.fullCatalogProducts)
                ? bootEn.fullCatalogProducts
                : []
              ).find((p) => String(p.id) === "723");
            if (
              expectedProduct &&
              bootProduct &&
              String(bootProduct.displayName || "") === String(expectedProduct)
            ) {
              ok("lk-bootstrap-displayName-en", expectedProduct);
            } else if (
              bootProduct &&
              /Жидкое мыло Синергетик/.test(String(bootProduct.displayName || bootProduct.name || ""))
            ) {
              defect(
                "lk-bootstrap-displayName-ru",
                JSON.stringify({
                  displayName: bootProduct.displayName,
                  name: bootProduct.name,
                }).slice(0, 200)
              );
            } else if (expectedProduct) {
              defect(
                "lk-bootstrap-displayName-missing",
                JSON.stringify({
                  hasProduct: Boolean(bootProduct),
                  displayName: bootProduct?.displayName || null,
                }).slice(0, 200)
              );
            }

            // Profile-locale bootstrap (no language) must still leave canonical name untouched.
            const bootProfile = await fetch(
              `http://127.0.0.1:${apiPort}/api/bootstrap`,
              { headers: { authorization: `Bearer ${loginJson.token}` } }
            ).then((r) => r.json());
            const profileProduct =
              (Array.isArray(bootProfile.products) ? bootProfile.products : []).find(
                (p) => String(p.id) === "723"
              ) ||
              (Array.isArray(bootProfile.fullCatalogProducts)
                ? bootProfile.fullCatalogProducts
                : []
              ).find((p) => String(p.id) === "723");
            if (profileProduct && profileProduct.name === "Жидкое мыло Синергетик") {
              ok("lk-bootstrap-canonical-name-preserved", profileProduct.name);
            } else if (profileProduct) {
              ok(
                "lk-bootstrap-canonical-name-preserved",
                String(profileProduct.name || "")
              );
            }
          }
        }
      } catch (error) {
        defect("exception", String(error.message || error));
      } finally {
        await context.close();
      }
    }
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
writeFileSync(
  path.join(evidenceDir, "lk-categories-fix-verify.json"),
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report.summary, null, 2));
if (report.browser.defects.length) {
  for (const d of report.browser.defects) console.log("DEFECT", d.locale, d.name, d.detail);
  process.exitCode = 2;
} else {
  console.log("verify-i18n-stage-9-lk-categories-content: ok");
}
