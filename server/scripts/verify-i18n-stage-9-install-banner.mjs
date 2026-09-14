/**
 * Stage 9 reopen — PWA install banner → instruction localization.
 * Isolated UI dist + temp DB. No production writes. Provider disabled.
 *
 * Repro (before): /en/ → hero install banner href=/install-app → lang=ru, RU instruction.
 * After: href=/en/install-app, visible instruction localized; language switch keeps locale.
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
  symlinkSync,
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
const snapSrc = path.join(evidenceDir, "clover-readonly-snap-stage9-reopen.sqlite");
const uiDist = path.join(evidenceDir, "ui-dist-remove-install-cta");

function rejectProd(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
}

assert.equal(existsSync(CHROME), true);
assert.equal(existsSync(snapSrc), true);
assert.equal(existsSync(path.join(uiDist, "index.html")), true, "build ui-dist-remove-install-cta first");

const tmp = mkdtempSync(path.join(tmpdir(), "clover-stage9-install-banner-"));
const dbPath = path.join(tmp, "clover.sqlite");
rejectProd(dbPath);
cpSync(snapSrc, dbPath);
process.env.DB_PATH = dbPath;
process.env.TEST_DB_ISOLATED = "YES";
process.env.CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED = "1";
process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = "disabled";

const { writeLocalizationSettings } = await import("../src/localizationStore.js");
writeLocalizationSettings({
  enabledLanguages: ["ru", "en", "uz", "ky", "tg", "zh", "ar"],
});

const report = {
  before: {
    note: "PR #116 localized install route + auto-injected visible .sf-hero-slide-btn CTA; user confirmed CTA was unwanted",
    heroHrefFromEn: "/install-app",
    afterClickLang: "ru",
    afterClickH1: "Как установить на телефон",
    enPrefixedInstall: "Not found",
    visibleCtaFromPr116: "storefront.appInstallGuide via .sf-hero-slide-btn",
  },
  browser: { ok: [], defects: [] },
  limitations: {
    safariIphonePhysicalInstall: "NOT VERIFIED",
    cmsHeroOperatorContent: "known localization limitation (separate from PWA install banner)",
    nativeSpeakerQuality: "NOT VERIFIED",
    operatorButtonLabel: "CMS buttonLabel still renders .sf-hero-slide-btn if set (pre-existing)",
  },
};

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
  stdio: ["ignore", "ignore", "ignore"],
});

const distLink = path.join(root, "dist");
if (!existsSync(distLink)) symlinkSync(uiDist, distLink);

const ui = spawn(
  path.join(root, "node_modules/.bin/vite"),
  ["preview", "--host", "127.0.0.1", "--port", String(uiPort), "--strictPort"],
  { cwd: root, env: { ...process.env }, stdio: ["ignore", "ignore", "ignore"] }
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
  throw new Error(`Timeout ${url}`);
}

function cleanup() {
  try { api.kill("SIGTERM"); } catch { /* ignore */ }
  try { ui.kill("SIGTERM"); } catch { /* ignore */ }
  rmSync(tmp, { recursive: true, force: true });
}
process.on("exit", cleanup);

await waitHttp(`http://127.0.0.1:${apiPort}/api/public/localization/runtime?language=en`);
await waitHttp(`http://127.0.0.1:${uiPort}/`);

const expectedH1 = {};
const runtimeLabels = {};
const SOURCE_RU = {
  h1: "Как установить на телефон",
  cta: "Инструкция по установке приложения",
  alt: "Мобильное приложение Clover",
};
for (const locale of ["ru", "en", "uz", "ky", "tg", "zh", "ar"]) {
  if (locale === "ru") {
    expectedH1.ru = SOURCE_RU.h1;
    runtimeLabels.ru = { cta: SOURCE_RU.cta, alt: SOURCE_RU.alt };
    continue;
  }
  const runtime = await fetch(
    `http://127.0.0.1:${apiPort}/api/public/localization/runtime?language=${locale}`
  ).then((r) => r.json());
  expectedH1[locale] = runtime.dictionary?.["storefront.howToInstallOnAPhone"];
  runtimeLabels[locale] = {
    cta: runtime.dictionary?.["storefront.appInstallGuide"],
    alt: runtime.dictionary?.["storefront.cloverMobileApp"],
  };
  assert.ok(expectedH1[locale], `missing h1 ${locale}`);
  assert.ok(runtimeLabels[locale].cta, `missing cta ${locale}`);
  assert.ok(runtimeLabels[locale].alt, `missing alt ${locale}`);
}
report.expectedH1 = expectedH1;
report.expectedBanner = runtimeLabels;

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: [
    "--host-resolver-rules=MAP clover-spb.ru 127.0.0.1, MAP www.clover-spb.ru 127.0.0.1",
  ],
});

try {
  for (const locale of ["ru", "en", "uz", "ky", "tg", "zh", "ar"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: locale === "zh" ? "zh-CN" : locale,
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
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
      report.browser.defects.push({ locale, name, detail: String(detail).slice(0, 350) });
    const ok = (name, detail = "") =>
      report.browser.ok.push({ locale, name, detail: String(detail).slice(0, 350) });

    try {
      await page.goto(`${store}/${locale}/`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(900);
      const hero = page.locator("a.sf-hero-slide-link").first();
      assert.equal(await hero.count(), 1, "hero install banner link missing");
      const href = await hero.getAttribute("href");
      const expectedHref = `/${locale}/install-app`;
      if (href !== expectedHref) defect("hero-install-href", `href=${href} expected=${expectedHref}`);
      else ok("hero-install-href", href);

      const expectedBanner = runtimeLabels[locale];
      const banner = await page.evaluate(() => {
        const a = document.querySelector("a.sf-hero-slide-link");
        const btn = document.querySelector(".sf-hero-slide-btn");
        const img = document.querySelector(".sf-hero-visual img.is-active, .sf-hero-visual img");
        return {
          btn: (btn?.innerText || "").trim(),
          btnPresent: Boolean(btn),
          coverOnly: Boolean(a?.classList.contains("is-cover-only")),
          aria: (a?.getAttribute("aria-label") || "").trim(),
          alt: (img?.getAttribute("alt") || "").trim(),
        };
      });
      // Visible auto-CTA must be absent (cover-only link).
      if (banner.btnPresent || banner.btn) {
        defect("banner-cta-absent", JSON.stringify(banner));
      } else if (!banner.coverOnly) {
        defect("banner-cover-only", JSON.stringify(banner));
      } else {
        ok("banner-cta-absent", "no .sf-hero-slide-btn");
      }
      if (banner.aria !== expectedBanner.cta) {
        defect("banner-aria", JSON.stringify({ aria: banner.aria, expected: expectedBanner.cta }));
      } else {
        ok("banner-aria", banner.aria);
      }
      if (banner.alt !== expectedBanner.alt) {
        defect("banner-img-alt", JSON.stringify({ alt: banner.alt, expected: expectedBanner.alt }));
      } else {
        ok("banner-img-alt", banner.alt);
      }

      // Cover-only <a> remains keyboard-reachable (focusable link, no replacement text).
      await hero.focus();
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tag: el?.tagName || "",
          className: el?.className || "",
          href: el?.getAttribute?.("href") || "",
          coverOnly: el?.classList?.contains("is-cover-only") || false,
          hasVisibleBtn: Boolean(el?.querySelector?.(".sf-hero-slide-btn")),
        };
      });
      if (
        focused.tag === "A" &&
        /sf-hero-slide-link/.test(focused.className) &&
        focused.href === expectedHref &&
        focused.coverOnly &&
        !focused.hasVisibleBtn
      ) {
        ok("banner-keyboard-link", JSON.stringify(focused));
      } else {
        defect("banner-keyboard-link", JSON.stringify(focused));
      }

      await hero.click();
      await page.waitForTimeout(1200);
      const after = await page.evaluate(() => ({
        url: location.pathname,
        lang: document.documentElement.lang || "",
        dir: document.documentElement.getAttribute("dir") || "",
        h1: document.querySelector("h1")?.innerText || "",
        body: document.body.innerText.slice(0, 800),
      }));
      if (after.url !== expectedHref) defect("install-url", after.url);
      else ok("install-url", after.url);
      if (after.lang !== locale && !(locale === "zh" && after.lang.startsWith("zh"))) {
        defect("install-lang", after.lang);
      } else ok("install-lang", after.lang);
      if (locale === "ar") {
        if (after.dir !== "rtl") defect("install-rtl", after.dir);
        else ok("install-rtl", after.dir);
      }
      if (after.h1 !== expectedH1[locale]) {
        defect("install-h1", `got=${after.h1} expected=${expectedH1[locale]}`);
      } else ok("install-h1", after.h1);
      if (/Как установить на телефон/.test(after.body) && locale !== "ru") {
        defect("install-body-ru", after.body.slice(0, 200));
      } else ok("install-body-localized");

      const robots = await page.evaluate(() => {
        const el = document.querySelector('meta[name="robots"]');
        return el?.getAttribute("content") || "";
      });
      if (!/noindex/i.test(robots)) {
        defect("install-noindex", `robots=${robots}`);
      } else {
        ok("install-noindex", robots);
      }

      // Platform sections present (instruction content, not physical install).
      if (!/iOS|Android/i.test(after.body)) defect("install-platforms-missing", after.body.slice(0, 160));
      else ok("install-platforms");

      // Language switch away and back should not leave stale RU chrome.
      if (locale === "en") {
        await page.goto(`${store}/uz/install-app`, { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
        const uzH1 = await page.locator("h1").innerText();
        if (uzH1 !== expectedH1.uz) defect("switch-uz-h1", uzH1);
        else ok("switch-uz-h1", uzH1);
        await page.goto(`${store}/en/install-app`, { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
        const enAgain = await page.locator("h1").innerText();
        if (enAgain !== expectedH1.en) defect("switch-back-en-h1", enAgain);
        else ok("switch-back-en-h1", enAgain);

        // Bare /install-app after sticky en must keep EN (defense).
        await page.goto(`${store}/en/`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);
        await page.goto(`${store}/install-app`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
        const bare = await page.evaluate(() => ({
          lang: document.documentElement.lang || "",
          h1: document.querySelector("h1")?.innerText || "",
        }));
        if (bare.lang !== "en" || bare.h1 !== expectedH1.en) {
          defect("bare-install-keeps-sticky", JSON.stringify(bare));
        } else ok("bare-install-keeps-sticky", JSON.stringify(bare));
      }
    } catch (error) {
      defect("exception", error.message || error);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

report.summary = {
  defects: report.browser.defects.length,
  ok: report.browser.ok.length,
  verdict: report.browser.defects.length === 0 ? "PASS" : "FAIL",
};
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  path.join(evidenceDir, "remove-install-cta-verify.json"),
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report.summary, null, 2));
if (report.browser.defects.length) {
  for (const d of report.browser.defects) console.log("DEFECT", d.locale, d.name, d.detail);
  cleanup();
  process.exit(2);
} else {
  console.log("verify-i18n-stage-9-remove-install-cta: ok");
  cleanup();
  process.exit(0);
}
