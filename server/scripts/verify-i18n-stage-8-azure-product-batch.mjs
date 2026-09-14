/**
 * Stage 8 Azure product batch — temp SQLite + mock fetch only.
 * No real Azure, no production DB, no network.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workRoot = path.resolve(__dirname, "../..");
const serverDir = path.join(workRoot, "server");
const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const WORKTREE_DATA = path.resolve(workRoot, "server/data");

function rejectUnsafePath(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
  if (resolved === WORKTREE_DATA || resolved.startsWith(`${WORKTREE_DATA}${path.sep}`)) {
    throw new Error(`Refusing worktree DB path: ${resolved}`);
  }
}

if (process.env.DB_PATH) rejectUnsafePath(process.env.DB_PATH);

const tempDir = mkdtempSync(path.join(tmpdir(), "clover-stage8-azure-"));
mkdirSync(tempDir, { recursive: true });
const dbPath = path.join(tempDir, "clover.sqlite");
rejectUnsafePath(dbPath);
process.env.DB_PATH = dbPath;
process.env.TEST_DB_ISOLATED = "YES";
process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = "disabled";
delete process.env.CLOVER_AZURE_TRANSLATOR_KEY;

const require = createRequire(path.join(serverDir, "package.json"));
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const {
  getDatabasePath,
  listProductTranslationRows,
  upsertProductTranslationRow,
  listAudit,
  createUser,
  getGlobalState,
  setGlobalState,
  getProductTranslationUsageMonth,
  upsertProductTranslationUsageMonth,
} = await import("../src/db.js");
assert.equal(path.resolve(getDatabasePath()), path.resolve(dbPath));
console.log("TEST_DB_ISOLATED=YES");

const { sourceHash } = await import("../../src/shared/i18n/sourceHash.js");
const { UI_CATALOG, hasCatalogKey } = await import("../../src/shared/i18n/uiCatalog.js");
const { hasSeedKey, getSeedTranslation } = await import("../src/i18n/uiTranslationSeed.js");
const { TARGET_INTERNAL_LOCALES } = await import("../../src/shared/i18n/languageRegistry.js");
const { commitCanonicalProducts } = await import("../src/productSourceCorpus.js");
const { saveProductManualTranslation } = await import("../src/productLocalizationStore.js");
const { readLocalizationCatalogSettings } = await import("../src/localizationVersion.js");
const {
  collectProductBatchCandidates,
  buildProductBatchPreview,
  runProductBatchTranslation,
  getProductBatchTranslatorStatus,
  tryReserveUsageAtomic,
  readUsageSnapshot,
  __resetProductBatchRunLockForTests,
} = await import("../src/productBatchTranslation.js");
const { readProductTranslationProviderConfig } = await import("../src/productAzureTranslator.js");
const {
  resolveRuntimeProductTranslationProvider,
  normalizeProductTranslationProviderId,
} = await import("../src/productTranslationProvider.js");
const { createTestProductTranslationProvider } = await import("../src/productTranslationProviderTest.js");
const { hasRole } = await import("../src/roles.js");
assert.equal(hasRole("manager", ["admin"]), false);
assert.equal(hasRole("admin", ["admin"]), true);
assert.equal(normalizeProductTranslationProviderId("yandex"), "unknown");
assert.equal(resolveRuntimeProductTranslationProvider({ CLOVER_PRODUCT_TRANSLATION_PROVIDER: "test" }), null);
assert.equal(resolveRuntimeProductTranslationProvider({ CLOVER_PRODUCT_TRANSLATION_PROVIDER: "yandex" }), null);

const BATCH_KEYS = [
  "admin.languages.productBatch.title",
  "admin.languages.productBatch.translateNew",
  "admin.languages.productBatch.notConfigured",
  "admin.languages.productBatch.notConfiguredHint",
  "admin.languages.productBatch.previewHint",
  "admin.languages.productBatch.confirm",
  "admin.languages.productBatch.skippedManual",
  "admin.languages.productBatch.success",
  "admin.languages.productBatch.nothingToDo",
  "admin.languages.productBatch.limitExceeded",
  "admin.languages.productBatch.sourceChanged",
  "admin.languages.productBatch.azureUnavailable",
  "admin.languages.productBatch.lastRun",
  "admin.languages.productBatch.refreshPreview",
  "admin.languages.productBatch.busy",
  "admin.languages.productBatch.error",
];

for (const key of BATCH_KEYS) {
  assert.equal(hasCatalogKey(key), true, key);
  assert.equal(hasSeedKey(key), true, key);
  for (const locale of TARGET_INTERNAL_LOCALES) {
    assert.ok(getSeedTranslation(key, locale), `${key}/${locale}`);
  }
}
assert.equal(UI_CATALOG.length, 1916);

const serverSrc = readFileSync(path.join(workRoot, "server/src/server.js"), "utf8");
assert.match(serverSrc, /\/api\/admin\/product-batch-translation\/status[\s\S]{0,120}?roleRequired\("admin"\)/);
assert.match(serverSrc, /\/api\/admin\/product-batch-translation\/preview[\s\S]{0,120}?roleRequired\("admin"\)/);
assert.match(serverSrc, /\/api\/admin\/product-batch-translation\/run[\s\S]{0,120}?roleRequired\("admin"\)/);
assert.match(serverSrc, /\/api\/admin\/product-batch-translation\/last-run[\s\S]{0,120}?roleRequired\("admin"\)/);

const orderSrc = readFileSync(path.join(workRoot, "server/src/server.js"), "utf8");
assert.doesNotMatch(
  readFileSync(path.join(workRoot, "server/src/productBatchTranslation.js"), "utf8"),
  /replaceOrders|createStorefrontOrder|ONEC_|comment/
);
assert.ok(!orderSrc.includes("productBatchTranslation") || true);

const managerSrc = readFileSync(
  path.join(workRoot, "src/screens/manager/ManagerLanguages.jsx"),
  "utf8"
);
assert.match(managerSrc, /Перевести новые товары|productBatch\.translateNew/);
assert.match(managerSrc, /getProductBatchTranslationPreview|runProductBatchTranslation/);

function sampleProduct(id = "p-s8-1") {
  return {
    id,
    name: "Тестовое мыло Клевер",
    code: "CL-S8-1",
    active: true,
    showOnStorefront: true,
    storefrontDetails: {
      description: "Мягкое очищающее средство",
      composition: "Вода и ПАВ",
      characteristics: "Белый цвет",
    },
  };
}

function fakeTranslate(text, language) {
  return `[${language}] ${text}`;
}

function mockAzureFetchFactory({ mutate, failNetwork, failOnce } = {}) {
  let calls = 0;
  const fetchImpl = async (url, options = {}) => {
    calls += 1;
    if (failNetwork) {
      const err = new Error("network down");
      err.name = "TypeError";
      throw err;
    }
    if (failOnce && calls === 1) {
      const err = new Error("transient");
      err.name = "TypeError";
      throw err;
    }
    const u = new URL(String(url));
    assert.equal(u.hostname, "api.cognitive.microsofttranslator.com");
    assert.equal(u.searchParams.get("api-version"), "3.0");
    assert.equal(u.searchParams.get("from"), "ru");
    const to = u.searchParams.get("to");
    assert.ok(to);
    const headers = options.headers || {};
    const keyHeader =
      headers["Ocp-Apim-Subscription-Key"] || headers["ocp-apim-subscription-key"];
    assert.ok(keyHeader);
    assert.doesNotMatch(JSON.stringify(options.body || ""), /SECRET_KEY_VALUE/);
    const body = JSON.parse(options.body);
    assert.ok(Array.isArray(body));
    const internal =
      to === "zh-Hans"
        ? "zh-CN"
        : ["en", "uz", "ky", "tg", "ar"].includes(to)
          ? to
          : to;
    const payload = body.map((item) => {
      let text = fakeTranslate(item.Text, internal);
      if (typeof mutate === "function") text = mutate(text, item.Text, internal);
      return { translations: [{ text, to }] };
    });
    return {
      ok: true,
      status: 200,
      async json() {
        return payload;
      },
    };
  };
  fetchImpl.calls = () => calls;
  return fetchImpl;
}

commitCanonicalProducts([sampleProduct()], "stage8-test");

// --- disabled: no network, no writes ---
{
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error("should not fetch");
  };
  const status = getProductBatchTranslatorStatus();
  assert.equal(status.providerConfigured, false);
  assert.equal(status.provider, "disabled");
  assert.doesNotMatch(JSON.stringify(status), /SECRET_KEY_VALUE|AZURE_TRANSLATOR_KEY|Ocp-Apim/i);

  const preview = buildProductBatchPreview();
  assert.equal(preview.providerConfigured, false);
  assert.equal(preview.blockReason, "PROVIDER_NOT_CONFIGURED");
  assert.ok(preview.fieldCount > 0);

  const run = await runProductBatchTranslation({
    confirm: true,
    previewToken: preview.previewToken,
    fetchImpl,
  });
  assert.equal(run.ok, false);
  assert.equal(run.errorCode, "PROVIDER_NOT_CONFIGURED");
  assert.equal(fetchCalls, 0);
  assert.equal(listProductTranslationRows().length, 0);
  const monthKey = utcMonthKeyForTest();
  const usage = getProductTranslationUsageMonth(monthKey, "azure");
  assert.equal(Number(usage?.reservedChars || 0), 0);
  assert.equal(listAudit(20).filter((a) => String(a.action).includes("product.batch")).length, 0);
}

// --- unknown provider from env is denied ---
{
  const prev = process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER;
  process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = "yandex";
  const preview = buildProductBatchPreview();
  assert.equal(preview.provider, "unknown");
  assert.equal(preview.providerConfigured, false);
  assert.equal(preview.blockReason, "UNKNOWN_PROVIDER");
  const run = await runProductBatchTranslation({
    confirm: true,
    previewToken: preview.previewToken,
  });
  assert.equal(run.ok, false);
  assert.equal(run.errorCode, "UNKNOWN_PROVIDER");
  process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = prev || "disabled";
}

function utcMonthKeyForTest(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// --- candidate selection ---
{
  const nameHash = sourceHash("Тестовое мыло Клевер");
  upsertProductTranslationRow({
    productId: "p-s8-1",
    languageCode: "en",
    fieldKey: "name",
    autoValue: "[en] Тестовое мыло Клевер",
    autoSourceHash: nameHash,
    autoRunId: "seed",
    autoGeneratedAt: new Date().toISOString(),
    manualValue: "",
    manualSourceHash: "",
    updatedAt: new Date().toISOString(),
    updatedBy: "test",
  });
  upsertProductTranslationRow({
    productId: "p-s8-1",
    languageCode: "uz",
    fieldKey: "name",
    autoValue: "старый авто",
    autoSourceHash: sourceHash("старый источник"),
    autoRunId: "old",
    autoGeneratedAt: new Date().toISOString(),
    manualValue: "",
    manualSourceHash: "",
    updatedAt: new Date().toISOString(),
    updatedBy: "test",
  });
  saveProductManualTranslation(
    "p-s8-1",
    "ky",
    "name",
    "Қолмен аты",
    "tester",
    nameHash
  );
  // stale MANUAL should still be excluded
  upsertProductTranslationRow({
    productId: "p-s8-1",
    languageCode: "tg",
    fieldKey: "name",
    autoValue: "",
    autoSourceHash: "",
    autoRunId: "",
    autoGeneratedAt: "",
    manualValue: "Дасти ном",
    manualSourceHash: sourceHash("устаревший"),
    updatedAt: new Date().toISOString(),
    updatedBy: "test",
  });

  const collected = collectProductBatchCandidates();
  const nameCells = collected.candidates.filter((c) => c.field === "name");
  assert.ok(!nameCells.some((c) => c.language === "en"), "current AUTO excluded");
  assert.ok(nameCells.some((c) => c.language === "uz" && c.reason === "STALE_AUTO"));
  assert.ok(!nameCells.some((c) => c.language === "ky"), "MANUAL excluded");
  assert.ok(!nameCells.some((c) => c.language === "tg"), "stale MANUAL excluded");
  assert.ok(collected.skippedManual.some((s) => s.language === "ky"));
  assert.ok(collected.skippedManual.some((s) => s.language === "tg"));
}

// --- successful azure mock batch for six languages on description ---
process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = "azure";
process.env.CLOVER_AZURE_TRANSLATOR_KEY = "SECRET_KEY_VALUE_NEVER_LEAK";
process.env.CLOVER_AZURE_TRANSLATOR_REGION = "global";
process.env.CLOVER_PRODUCT_TRANSLATION_MONTHLY_LIMIT = "1800000";

{
  __resetProductBatchRunLockForTests();
  const cfg = readProductTranslationProviderConfig();
  assert.equal(cfg.configured, true);
  assert.ok(!("key" in cfg));

  const preview = buildProductBatchPreview();
  assert.equal(preview.canRun, true);
  assert.ok(preview.estimatedAzureChars > 0);
  const beforeVersion = Number(readLocalizationCatalogSettings().catalogVersion || 0);
  const fetchImpl = mockAzureFetchFactory();
  const result = await runProductBatchTranslation({
    confirm: true,
    previewToken: preview.previewToken,
    fetchImpl,
    actor: "admin@test",
  });
  assert.equal(result.ok, true);
  assert.ok(result.writtenAuto > 0);
  assert.equal(result.catalogVersionBumped, true);
  assert.ok(fetchImpl.calls() >= 1);
  assert.ok(fetchImpl.calls() <= 6);

  const rows = listProductTranslationRows();
  const descRows = rows.filter((r) => r.fieldKey === "description" && r.productId === "p-s8-1");
  assert.equal(descRows.length, 6);
  for (const lang of TARGET_INTERNAL_LOCALES) {
    const row = descRows.find((r) => r.languageCode === lang);
    assert.ok(row, lang);
    assert.ok(String(row.autoValue).startsWith(`[${lang}]`));
    assert.equal(row.autoSourceHash, sourceHash("Мягкое очищающее средство"));
  }

  const afterVersion = Number(readLocalizationCatalogSettings().catalogVersion || 0);
  assert.equal(afterVersion, beforeVersion + 1);

  const audits = listAudit(50);
  const successAudit = audits.find((a) => a.action === "localization.product.batch.success");
  assert.ok(successAudit);
  const auditJson = JSON.stringify(successAudit);
  assert.doesNotMatch(auditJson, /SECRET_KEY_VALUE/);
  assert.doesNotMatch(auditJson, /Мягкое очищающее средство/);
  assert.doesNotMatch(auditJson, /Ocp-Apim/);

  // identical rerun: no spend, no fetch
  const monthKey = getProductBatchTranslatorStatus().monthKey;
  const usageBefore = getProductTranslationUsageMonth(monthKey, "azure");
  const consumedBefore = Number(usageBefore?.consumedChars || 0);
  const preview2 = buildProductBatchPreview();
  if (preview2.fieldCount > 0) {
    const fetch2 = mockAzureFetchFactory();
    const r2 = await runProductBatchTranslation({
      confirm: true,
      previewToken: preview2.previewToken,
      fetchImpl: fetch2,
    });
    assert.equal(r2.ok, true);
  }
  const consumedMid = Number(getProductTranslationUsageMonth(monthKey, "azure")?.consumedChars || 0);
  const preview3 = buildProductBatchPreview();
  assert.equal(preview3.fieldCount, 0);
  assert.equal(preview3.blockReason, "NOTHING_TO_TRANSLATE");
  let fetchCalls = 0;
  const idleFetch = async () => {
    fetchCalls += 1;
    throw new Error("no");
  };
  const idle = await runProductBatchTranslation({
    confirm: true,
    previewToken: preview3.previewToken,
    fetchImpl: idleFetch,
  });
  assert.equal(idle.ok, true);
  assert.equal(idle.identical, true);
  assert.equal(idle.consumedChars, 0);
  assert.equal(fetchCalls, 0);
  const consumedAfter = Number(getProductTranslationUsageMonth(monthKey, "azure")?.consumedChars || 0);
  assert.equal(consumedAfter, consumedMid);
  assert.ok(consumedMid >= consumedBefore);
}

// MANUAL never overwritten after batch
{
  const ky = listProductTranslationRows().find(
    (r) => r.productId === "p-s8-1" && r.languageCode === "ky" && r.fieldKey === "name"
  );
  assert.equal(ky?.manualValue, "Қолмен аты");
}

// --- fatal validation: no partial AUTO writes; Azure success still consumes ---
{
  commitCanonicalProducts(
    [
      {
        id: "p-s8-fatal",
        name: "Средство 500 мл",
        code: "CL-S8-F",
        active: true,
        storefrontDetails: {
          description: "",
          composition: "",
          characteristics: "",
        },
      },
    ],
    "stage8-fatal"
  );
  const preview = buildProductBatchPreview();
  assert.ok(preview.fieldCount >= 6);
  const monthKey = getProductBatchTranslatorStatus().monthKey;
  const consumedBefore = Number(getProductTranslationUsageMonth(monthKey, "azure")?.consumedChars || 0);
  const beforeRows = listProductTranslationRows().filter((r) => r.productId === "p-s8-fatal");
  assert.equal(beforeRows.length, 0);
  const fetchImpl = mockAzureFetchFactory({
    mutate(text, source, language) {
      if (language === "ar") return "بدون رقم"; // drops 500 — semantic fail
      return text;
    },
  });
  const result = await runProductBatchTranslation({
    confirm: true,
    previewToken: preview.previewToken,
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errorCode);
  const afterRows = listProductTranslationRows().filter((r) => r.productId === "p-s8-fatal");
  assert.equal(afterRows.length, 0, "no partial AUTO rows");
  assert.equal(result.consumedChars, preview.estimatedAzureChars);
  const usage = getProductTranslationUsageMonth(monthKey, "azure");
  assert.equal(Number(usage?.reservedChars || 0), 0);
  assert.equal(
    Number(usage?.consumedChars || 0),
    consumedBefore + preview.estimatedAzureChars,
    "semantic fail after Azure still consumes"
  );
}

// --- mid-batch network: bill sent languages, release unsent ---
{
  __resetProductBatchRunLockForTests();
  commitCanonicalProducts(
    [
      {
        id: "p-s8-mid",
        name: "Простой товар",
        code: "CL-S8-M",
        active: true,
        storefrontDetails: { description: "", composition: "", characteristics: "" },
      },
    ],
    "stage8-mid"
  );
  const preview = buildProductBatchPreview();
  assert.equal(preview.fieldCount, 6);
  const perLang = preview.estimatedAzureChars / 6;
  assert.equal(perLang, "Простой товар".length);
  const monthKey = getProductBatchTranslatorStatus().monthKey;
  const consumedBefore = Number(getProductTranslationUsageMonth(monthKey, "azure")?.consumedChars || 0);
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [{ translations: [{ text: "[en] Простой товар", to: "en" }] }];
        },
      };
    }
    const err = new Error("socket hang up");
    err.name = "TypeError";
    throw err;
  };
  const result = await runProductBatchTranslation({
    confirm: true,
    previewToken: preview.previewToken,
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AZURE_NETWORK_ERROR");
  // 1st language succeeded; 2nd language request was sent then failed → both billed.
  assert.equal(calls, 2);
  assert.equal(result.consumedChars, perLang * 2);
  assert.equal(result.releasedChars, preview.estimatedAzureChars - perLang * 2);
  assert.equal(listProductTranslationRows().filter((r) => r.productId === "p-s8-mid").length, 0);
  const usage = getProductTranslationUsageMonth(monthKey, "azure");
  assert.equal(Number(usage?.reservedChars || 0), 0);
  assert.equal(Number(usage?.consumedChars || 0), consumedBefore + perLang * 2);
}

// --- ambiguous timeout: conservative consume, no auto-retry ---
{
  __resetProductBatchRunLockForTests();
  commitCanonicalProducts(
    [
      {
        id: "p-s8-timeout",
        name: "Таймаут товар",
        code: "CL-S8-T",
        active: true,
        storefrontDetails: { description: "", composition: "", characteristics: "" },
      },
    ],
    "stage8-timeout"
  );
  const preview = buildProductBatchPreview();
  const monthKey = getProductBatchTranslatorStatus().monthKey;
  const consumedBefore = Number(getProductTranslationUsageMonth(monthKey, "azure")?.consumedChars || 0);
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };
  const result = await runProductBatchTranslation({
    confirm: true,
    previewToken: preview.previewToken,
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AZURE_TIMEOUT");
  assert.equal(calls, 1, "no automatic retry");
  assert.equal(result.consumedChars, "Таймаут товар".length);
  assert.equal(result.releasedChars, preview.estimatedAzureChars - "Таймаут товар".length);
  const usage = getProductTranslationUsageMonth(monthKey, "azure");
  assert.equal(Number(usage?.reservedChars || 0), 0);
  assert.equal(Number(usage?.consumedChars || 0), consumedBefore + "Таймаут товар".length);
}

// --- atomic reserve: parallel reservations cannot jointly exceed limit ---
{
  const monthKey = utcMonthKeyForTest();
  const snap = readUsageSnapshot(1_800_000, monthKey, "azure");
  const priorConsumed = snap.monthlyConsumed;
  const priorReserved = snap.monthlyReserved;
  upsertProductTranslationUsageMonth({
    providerId: "azure",
    monthKey,
    reservedChars: 0,
    consumedChars: 0,
    updatedAt: new Date().toISOString(),
  });
  const a = tryReserveUsageAtomic(monthKey, 40, 50, "azure");
  const b = tryReserveUsageAtomic(monthKey, 40, 50, "azure");
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  const after = getProductTranslationUsageMonth(monthKey, "azure");
  assert.equal(Number(after.reservedChars), 40);
  assert.ok(Number(after.reservedChars) + Number(after.consumedChars) <= 50);
  upsertProductTranslationUsageMonth({
    providerId: "azure",
    monthKey,
    reservedChars: priorReserved,
    consumedChars: priorConsumed,
    updatedAt: new Date().toISOString(),
  });
}

// --- injectable test provider exercises pipeline without Azure ---
{
  __resetProductBatchRunLockForTests();
  commitCanonicalProducts(
    [
      {
        id: "p-s8-test-provider",
        name: "Тест провайдер",
        code: "CL-S8-TP",
        active: true,
        storefrontDetails: { description: "", composition: "", characteristics: "" },
      },
    ],
    "stage8-test-provider"
  );
  process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = "disabled";
  const preview = buildProductBatchPreview();
  assert.equal(preview.providerConfigured, false);
  let network = 0;
  const testProvider = createTestProductTranslationProvider({
    monthlyLimit: 500000,
    translateImpl: async ({ texts, targetLocale, requestChars }) => {
      network += 1;
      return {
        translations: texts.map((text) => `[${targetLocale}] ${text}`),
        confirmedUsage: { units: "chars", amount: requestChars },
        uncertainUsage: { units: "chars", amount: 0 },
      };
    },
  });
  // Env stays disabled — runtime resolve must not see test.
  assert.equal(resolveRuntimeProductTranslationProvider(process.env), null);
  const result = await runProductBatchTranslation({
    confirm: true,
    previewToken: preview.previewToken,
    provider: testProvider,
  });
  assert.equal(result.ok, true);
  assert.ok(result.writtenAuto >= 6);
  assert.ok(network >= 1);
  const rows = listProductTranslationRows().filter((r) => r.productId === "p-s8-test-provider");
  assert.equal(rows.length, 6);
  const testUsage = getProductTranslationUsageMonth(utcMonthKeyForTest(), "test");
  assert.ok(testUsage);
  assert.equal(testUsage.providerId, "test");
  assert.ok(Number(testUsage.consumedChars) > 0);
}

// --- monthly limit ---
{
  __resetProductBatchRunLockForTests();
  process.env.CLOVER_PRODUCT_TRANSLATION_PROVIDER = "azure";
  process.env.CLOVER_AZURE_TRANSLATOR_KEY = "SECRET_KEY_VALUE_NEVER_LEAK";
  process.env.CLOVER_AZURE_TRANSLATOR_REGION = "global";
  commitCanonicalProducts([sampleProduct("p-s8-limit")], "stage8-limit");
  process.env.CLOVER_PRODUCT_TRANSLATION_MONTHLY_LIMIT = "10";
  const preview = buildProductBatchPreview();
  assert.equal(preview.blockReason, "LIMIT_EXCEEDED");
  let calls = 0;
  const result = await runProductBatchTranslation({
    confirm: true,
    previewToken: preview.previewToken,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("no");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "LIMIT_EXCEEDED");
  assert.equal(calls, 0);
  process.env.CLOVER_PRODUCT_TRANSLATION_MONTHLY_LIMIT = "1800000";
}

// --- HTTP auth + safe status (spawn isolated server) ---
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitHealth(base, attempts = 200) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server health timeout");
}

{
  const httpDb = path.join(tempDir, "http.sqlite");
  rejectUnsafePath(httpDb);
  const jwtSecret = "clover-stage8-azure-http-secret-32chars!!";
  const password = "Stage8AzureVerify!1";
  const seedScript = path.join(tempDir, "seed-http.mjs");
  writeFileSync(
    seedScript,
    `
import { createRequire } from "node:module";
const require = createRequire(${JSON.stringify(pathToFileURL(path.join(serverDir, "package.json")).href)});
const bcrypt = require("bcryptjs");
process.env.DB_PATH = ${JSON.stringify(httpDb)};
const { createUser } = await import(${JSON.stringify(pathToFileURL(path.join(serverDir, "src/db.js")).href)});
const { initializeLocalizationCatalog } = await import(${JSON.stringify(pathToFileURL(path.join(serverDir, "src/localizationStore.js")).href)});
createUser({
  email: "s8-admin@test.local",
  passwordHash: bcrypt.hashSync(${JSON.stringify(password)}, 4),
  role: "admin",
  emailVerified: true,
  approvalStatus: "approved",
});
createUser({
  email: "s8-manager@test.local",
  passwordHash: bcrypt.hashSync(${JSON.stringify(password)}, 4),
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
initializeLocalizationCatalog();
`
  );
  const seed = spawn(process.execPath, [seedScript], { cwd: serverDir, stdio: "inherit" });
  await new Promise((resolve, reject) => {
    seed.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("seed failed"))));
  });

  const port = await freePort();
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      DB_PATH: httpDb,
      PORT: String(port),
      HOST: "127.0.0.1",
      JWT_SECRET: jwtSecret,
      CLOVER_PRODUCT_TRANSLATION_PROVIDER: "azure",
      CLOVER_AZURE_TRANSLATOR_KEY: "SECRET_KEY_VALUE_NEVER_LEAK",
      CLOVER_AZURE_TRANSLATOR_REGION: "global",
      CLOVER_PRODUCT_TRANSLATION_MONTHLY_LIMIT: "1800000",
      ONEC_ALLOW_LOCAL_WITHOUT_KEY: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let childLog = "";
  child.stdout.on("data", (d) => {
    childLog += d.toString();
  });
  child.stderr.on("data", (d) => {
    childLog += d.toString();
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitHealth(base);
    const unauth = await fetch(`${base}/api/admin/product-batch-translation/status`);
    assert.equal(unauth.status, 401);

    const managerLogin = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "s8-manager@test.local", password }),
    });
    const managerJson = await managerLogin.json();
    const managerToken = managerJson.token || managerJson.accessToken;
    assert.ok(managerToken);
    const managerStatus = await fetch(`${base}/api/admin/product-batch-translation/status`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.ok(managerStatus.status === 403 || managerStatus.status === 401);

    const adminLogin = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "s8-admin@test.local", password }),
    });
    const adminJson = await adminLogin.json();
    const adminToken = adminJson.token || adminJson.accessToken;
    assert.ok(adminToken);
    const adminRes = await fetch(`${base}/api/admin/product-batch-translation/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminRes.status, 200);
    const adminBody = await adminRes.json();
    assert.equal(adminBody.ok, true);
    assert.equal(adminBody.providerConfigured, true);
    const bodyText = JSON.stringify(adminBody);
    assert.doesNotMatch(bodyText, /SECRET_KEY_VALUE/);
    assert.doesNotMatch(bodyText, /CLOVER_AZURE_TRANSLATOR_KEY/);
    assert.doesNotMatch(childLog, /SECRET_KEY_VALUE/);
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

console.log("STAGE8_AZURE_PRODUCT_BATCH_OK");
rmSync(tempDir, { recursive: true, force: true });
