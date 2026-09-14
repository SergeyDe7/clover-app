/**
 * Stage 9 reopen — missing surface gates only:
 * LK Matrix product names, LK Catalog product names, live-refresh language contract.
 * Does NOT re-run home/catalog category or sticky gates (already PASS).
 * Temp DB only. Provider disabled. No production writes.
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
const snapSrc = path.join(evidenceDir, "clover-readonly-snap-stage9-reopen.sqlite");

function rejectProd(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
}

assert.equal(existsSync(CHROME), true);
assert.equal(existsSync(snapSrc), true);

const appSrc = readFileSync(path.join(root, "src/App.jsx"), "utf8");
const bootstrapCalls = [...appSrc.matchAll(/api\.bootstrap\(([^)]*)\)/g)].map((m) => m[1].trim());
assert.ok(bootstrapCalls.length >= 5, "expected bootstrap call sites");
assert.ok(
  bootstrapCalls.every((c) => c.startsWith("resolveProductBootstrapLanguage")),
  `bare bootstrap remains: ${JSON.stringify(bootstrapCalls)}`
);

const tmp = mkdtempSync(path.join(tmpdir(), "clover-stage9-lk-surfaces-"));
const dbPath = path.join(tmp, "clover.sqlite");
rejectProd(dbPath);
cpSync(snapSrc, dbPath);
process.env.DB_PATH = dbPath;
process.env.TEST_DB_ISOLATED = "YES";
process.env.CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED = "1";
process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = "disabled";
process.env.ONEC_WRITE_ENABLED = "0";
process.env.ONEC_PROD_EXCHANGE_ENABLED = "0";

const {
  writeLocalizationSettings,
} = await import("../src/localizationStore.js");
const { buildClientProductDisplayNameMap } = await import("../src/clientProductDisplay.js");
const { getGlobalState, getClientState, setClientStateField } = await import("../src/db.js");

writeLocalizationSettings({
  enabledLanguages: ["ru", "en", "uz", "ky", "tg", "zh", "ar"],
});

const access = getGlobalState("clientAccessVault", {}) || {};
const entry = Object.values(access).find((v) => v?.login === "clover_test@clover.ru");
assert.ok(entry?.clientId);
const state = getClientState(entry.clientId);
setClientStateField(entry.clientId, "profile", {
  ...(state.profile || {}),
  locale: "ru",
});

const displayEn = buildClientProductDisplayNameMap(getGlobalState("products", []), "en");
const expectedProduct = displayEn["723"] || displayEn[723];
assert.ok(expectedProduct);
assert.match(String(expectedProduct), /Synergetic|soap/i);

const report = {
  scope: ["lk-matrix-product-names", "lk-catalog-product-names", "live-refresh-bootstrap-language"],
  skippedAlreadyPassing: ["lk-sticky-over-profile-ru", "home-categories", "hero"],
  expectedProduct,
  unit: { bootstrapCallsAllPassLanguage: true, bootstrapCallCount: bootstrapCalls.length },
  api: {},
  browser: { ok: [], defects: [] },
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
  stdio: ["ignore", "pipe", "pipe"],
});

const uiDist = path.join(evidenceDir, "ui-dist-lk-categories");
assert.equal(existsSync(path.join(uiDist, "index.html")), true);
const worktreeDistLink = path.join(root, "dist");
if (!existsSync(worktreeDistLink)) {
  const { symlinkSync } = await import("node:fs");
  symlinkSync(uiDist, worktreeDistLink);
}

const ui = spawn(
  path.join(root, "node_modules/.bin/vite"),
  ["preview", "--host", "127.0.0.1", "--port", String(uiPort), "--strictPort"],
  { cwd: root, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] }
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
  const loginJson = await loginRes.json();
  assert.equal(loginRes.ok, true, JSON.stringify(loginJson));
  const auth = { authorization: `Bearer ${loginJson.token}` };

  // Live-refresh contract: two sequential bootstraps with sticky language keep displayName.
  const boot1 = await fetch(`http://127.0.0.1:${apiPort}/api/bootstrap?language=en`, {
    headers: auth,
  }).then((r) => r.json());
  const boot2 = await fetch(`http://127.0.0.1:${apiPort}/api/bootstrap?language=en`, {
    headers: auth,
  }).then((r) => r.json());
  const pick723 = (data) =>
    (Array.isArray(data.products) ? data.products : [])
      .concat(Array.isArray(data.fullCatalogProducts) ? data.fullCatalogProducts : [])
      .find((p) => String(p.id) === "723");
  const p1 = pick723(boot1);
  const p2 = pick723(boot2);
  assert.ok(p1 && p2, "product 723 missing from bootstrap");
  assert.equal(String(p1.displayName || ""), String(expectedProduct));
  assert.equal(String(p2.displayName || ""), String(expectedProduct));
  assert.notEqual(String(p2.name || ""), String(p2.displayName || ""));
  report.api.liveRefreshBootstrap1 = p1.displayName;
  report.api.liveRefreshBootstrap2 = p2.displayName;
  report.api.canonicalNamePreserved = p2.name;

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: [
      "--host-resolver-rules=MAP clover-spb.ru 127.0.0.1, MAP www.clover-spb.ru 127.0.0.1, MAP clover-order.ru 127.0.0.1",
    ],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en" });
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
    const defect = (name, detail) => report.browser.defects.push({ name, detail });
    const ok = (name, detail = "") => report.browser.ok.push({ name, detail });

    await page.goto(`${store}/en/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.evaluate((token) => {
      sessionStorage.setItem("clover-language-explicit-v1", "en");
      localStorage.setItem("clover-language-preference-v1", "en");
      localStorage.setItem("clover-api-token", token);
    }, loginJson.token);
    await page.goto(`${store}/lk/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    // Matrix tab (default landing often matrix / home → force matrix).
    const matrixNav = page.getByRole("button", { name: /My matrix|Матрица/i }).first();
    if (await matrixNav.count()) {
      await matrixNav.click();
      await page.waitForTimeout(1500);
    }
    let body = await page.locator("body").innerText();
    const matrixHasExpected = body.includes(expectedProduct);
    const matrixHasOtherEn =
      /toilet soap|liquid soap|dishwashing|gloves|napkin/i.test(body) &&
      !/Туалетное мыло|Жидкое мыло Синергетик|Средство для мытья/i.test(body);
    if (matrixHasExpected) {
      ok("lk-matrix-product-names", expectedProduct);
    } else if (matrixHasOtherEn) {
      const sample = (body.match(/toilet soap[^\n]*/i) || body.match(/liquid soap[^\n]*/i) || [
        "en-product-sample",
      ])[0];
      ok("lk-matrix-product-names", sample);
    } else if (/Туалетное мыло|Жидкое мыло Синергетик/.test(body)) {
      defect("lk-matrix-product-names-ru", body.slice(0, 280));
    } else {
      defect("lk-matrix-product-names-missing", body.slice(0, 280));
    }

    const catalogNav = page
      .getByRole("button", { name: /Add products from the catalog|Каталог/i })
      .first();
    if (await catalogNav.count()) {
      await catalogNav.click();
      await page.waitForTimeout(2000);
    } else {
      const addCatalog = page.getByText(/Add products from the catalog/i).first();
      if (await addCatalog.count()) await addCatalog.click();
      await page.waitForTimeout(2000);
    }
    body = await page.locator("body").innerText();
    if (body.includes(expectedProduct)) {
      ok("lk-catalog-product-names", expectedProduct);
    } else if (/Жидкое мыло Синергетик/.test(body)) {
      defect("lk-catalog-product-names-ru", body.slice(0, 280));
    } else {
      defect("lk-catalog-product-names-missing", body.slice(0, 280));
    }

    // Simulate live refresh the UI performs: bootstrap?language=en while sticky en.
    const refresh = await page.evaluate(async () => {
      const token = localStorage.getItem("clover-api-token");
      const sticky = sessionStorage.getItem("clover-language-explicit-v1");
      const res = await fetch(`/api/bootstrap?language=${encodeURIComponent(sticky || "en")}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const products = []
        .concat(Array.isArray(data.products) ? data.products : [])
        .concat(Array.isArray(data.fullCatalogProducts) ? data.fullCatalogProducts : []);
      const hit = products.find((p) => String(p.id) === "723");
      return {
        sticky,
        displayName: hit?.displayName || null,
        name: hit?.name || null,
      };
    });
    if (refresh.sticky === "en" && refresh.displayName === expectedProduct) {
      ok("live-refresh-keeps-displayName", JSON.stringify(refresh));
    } else {
      defect("live-refresh-keeps-displayName", JSON.stringify(refresh));
    }

    await context.close();
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
  path.join(evidenceDir, "lk-product-surfaces-verify.json"),
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report.summary, null, 2));
if (report.browser.defects.length) {
  for (const d of report.browser.defects) console.log("DEFECT", d.name, d.detail);
  process.exitCode = 2;
} else {
  console.log("verify-i18n-stage-9-lk-product-surfaces: ok");
}
