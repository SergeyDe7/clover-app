/**
 * Post-Stage4 performance/UX regressions — behavioral + static contracts.
 * TEMP DB only for server completeness/workspace. No production mutation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(import.meta.url);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assertNoMatch(rel, re, message) {
  assert.equal(re.test(read(rel)), false, message || `${rel} must not match ${re}`);
}

function assertMatch(rel, re, message) {
  assert.equal(re.test(read(rel)), true, message || `${rel} must match ${re}`);
}

// --- A. isRegisteredUiKey must not enumerate dictionary keys ---
const { isRegisteredUiKey, isStage3SafeVisibleText } = await import(
  "../../src/shared/i18n/placeholderValidation.js"
);
const { UI_CATALOG } = await import("../../src/shared/i18n/uiCatalog.js");
const { createLocalizationRuntime } = await import("../../src/shared/i18n/translationRuntime.js");
const {
  buildTranslationRows,
  workspaceTargetLanguageCodes,
} = await import("../../src/shared/i18n/localizationSettings.js");
const {
  mergePagedWorkspaceRows,
  shouldClearWorkspaceOnLoadError,
  workspaceMutationReloadOffset,
  mergeWorkspaceDrafts,
  setDraftValue,
  isTranslationDraftDirty,
} = await import("../../src/shared/i18n/translationDrafts.js");
const {
  canSendForeignLanguageEnablePut,
  shouldShowIncompleteEnableBlock,
  isForeignEnableToggleDisabled,
} = await import("../../src/shared/i18n/languageEnableGate.js");
const {
  shouldStartProductTranslationFetch,
  productTranslationFieldPresentation,
  canShowReturnToAuto,
} = await import("../../src/shared/i18n/productTranslationUi.js");
const {
  productCardImageLoadingAttrs,
  STOREFRONT_PRIORITY_IMAGE_COUNT,
} = await import("../../src/screens/storefront/components/productCardImage.js");
const {
  parseWorkspaceLimit,
  parseWorkspaceOffset,
  PRODUCT_WORKSPACE_DEFAULT_LIMIT,
  PRODUCT_WORKSPACE_MAX_LIMIT,
} = await import("../src/productInputLimits.js");

assert.equal(UI_CATALOG.length, 1900, "UI catalog must remain 1900");

{
  let ownKeysCalls = 0;
  const base = { "admin.languages.enableBlocked": "blocked", "unit.piece": "шт" };
  const proxied = new Proxy(base, {
    ownKeys() {
      ownKeysCalls += 1;
      return Reflect.ownKeys(base);
    },
    getOwnPropertyDescriptor(target, prop) {
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });
  assert.equal(isRegisteredUiKey("admin.languages.enableBlocked", proxied), true);
  assert.equal(isRegisteredUiKey("missing.key", proxied), false);
  assert.equal(ownKeysCalls, 0, "isRegisteredUiKey must not enumerate dictionary keys");
}

assert.equal(isRegisteredUiKey("unit.piece", { "unit.piece": "шт" }), true);
assert.equal(isRegisteredUiKey("  unit.piece  ", { "unit.piece": "шт" }), true);
assert.equal(isRegisteredUiKey("Видимый текст", { "unit.piece": "шт" }), false);
assert.equal(isRegisteredUiKey("", { a: 1 }), false);
assert.equal(isRegisteredUiKey(null, { a: 1 }), false);
assert.equal(isRegisteredUiKey("toString", Object.create({ toString: "x" })), false);
assert.equal(isRegisteredUiKey("a", null), false);
assert.equal(isStage3SafeVisibleText("unit.piece", { "unit.piece": "шт" }), false);
assert.equal(isStage3SafeVisibleText("Обычный текст", { "unit.piece": "шт" }), true);

const dict = Object.fromEntries(UI_CATALOG.map((entry) => [entry.key, entry.sourceRu]));
for (const entry of UI_CATALOG) {
  assert.equal(isRegisteredUiKey(entry.key, dict), true);
}

const runtime = createLocalizationRuntime({
  locale: "ru",
  dictionaries: { ru: dict },
});
assert.equal(runtime.locale, "ru");
for (const entry of UI_CATALOG.slice(0, 50)) {
  assert.equal(runtime.t(entry.key), entry.sourceRu);
}

const CALL_COUNT = 20000;
const sampleKeys = UI_CATALOG.slice(0, 200).map((entry) => entry.key);
const t0 = performance.now();
for (let i = 0; i < CALL_COUNT; i += 1) {
  runtime.t(sampleKeys[i % sampleKeys.length]);
}
const AFTER_MS = performance.now() - t0;
console.log(
  JSON.stringify({
    UI_KEY_COUNT: UI_CATALOG.length,
    CALL_COUNT,
    AFTER_MS: Number(AFTER_MS.toFixed(2)),
  })
);

assertNoMatch(
  "src/shared/i18n/placeholderValidation.js",
  /Object\.keys\(\s*dictionary\s*\)/,
  "isRegisteredUiKey must not use Object.keys(dictionary)"
);

// --- B. Pagination limit/offset parsers ---
assert.equal(parseWorkspaceLimit(undefined), PRODUCT_WORKSPACE_DEFAULT_LIMIT);
assert.equal(parseWorkspaceLimit(null), PRODUCT_WORKSPACE_DEFAULT_LIMIT);
assert.equal(parseWorkspaceLimit(Number.NaN), PRODUCT_WORKSPACE_DEFAULT_LIMIT);
assert.equal(parseWorkspaceLimit(0), PRODUCT_WORKSPACE_DEFAULT_LIMIT);
assert.equal(parseWorkspaceLimit(-5), PRODUCT_WORKSPACE_DEFAULT_LIMIT);
assert.equal(parseWorkspaceLimit(1), 1);
assert.equal(parseWorkspaceLimit(100), 100);
assert.equal(parseWorkspaceLimit(200), 200);
assert.equal(parseWorkspaceLimit(201), PRODUCT_WORKSPACE_MAX_LIMIT);
assert.equal(parseWorkspaceLimit(Infinity), PRODUCT_WORKSPACE_DEFAULT_LIMIT);
assert.equal(parseWorkspaceLimit("50.9"), 50);
assert.equal(parseWorkspaceOffset(undefined), 0);
assert.equal(parseWorkspaceOffset(null), 0);
assert.equal(parseWorkspaceOffset(-1), 0);
assert.equal(parseWorkspaceOffset(10.9), 10);

// --- C. merge / mutation / load-error helpers ---
{
  const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `r${i + 1}`, v: 1 }));
  const page2 = Array.from({ length: 100 }, (_, i) => ({ id: `r${i + 101}`, v: 1 }));
  const once = mergePagedWorkspaceRows(page1, page2, 100);
  assert.equal(once.length, 200);
  const twice = mergePagedWorkspaceRows(once, page2, 100);
  assert.equal(twice.length, 200, "repeated page2 must not duplicate ids");
  const overlap = mergePagedWorkspaceRows(once, [{ id: "r150", v: 2 }], 100);
  assert.equal(overlap.length, 200);
  assert.equal(overlap.find((row) => row.id === "r150").v, 2);
  assert.deepEqual(
    mergePagedWorkspaceRows(once, [{ id: "fresh" }], 0).map((row) => row.id),
    ["fresh"]
  );
  assert.equal(shouldClearWorkspaceOnLoadError(0), true);
  assert.equal(shouldClearWorkspaceOnLoadError(100), false);
  assert.equal(workspaceMutationReloadOffset(), 0);

  let drafts = setDraftValue({}, "r1", "en", "dirty-text", true);
  drafts = mergeWorkspaceDrafts(drafts, [{ id: "r1", languages: { en: { value: "server" } } }], "en");
  assert.equal(isTranslationDraftDirty(drafts, "r1", "en"), true);
  assert.equal(drafts[Object.keys(drafts)[0]].value, "dirty-text");
}

// --- D. Language enable fail-closed ---
assert.equal(
  canSendForeignLanguageEnablePut({
    code: "en",
    nextEnabled: true,
    overviewReady: true,
    completeness: { en: { complete: true } },
  }),
  true
);
assert.equal(
  canSendForeignLanguageEnablePut({
    code: "en",
    nextEnabled: true,
    overviewReady: true,
    completeness: { en: { complete: false } },
  }),
  false
);
assert.equal(
  canSendForeignLanguageEnablePut({
    code: "en",
    nextEnabled: true,
    overviewReady: true,
    completeness: {},
  }),
  false
);
assert.equal(
  canSendForeignLanguageEnablePut({
    code: "en",
    nextEnabled: true,
    overviewReady: false,
    completeness: { en: { complete: true } },
  }),
  false
);
assert.equal(
  canSendForeignLanguageEnablePut({
    code: "en",
    nextEnabled: false,
    overviewReady: false,
    completeness: {},
  }),
  true
);
assert.equal(
  shouldShowIncompleteEnableBlock({
    code: "uz",
    nextEnabled: true,
    overviewReady: true,
    completeness: { uz: { complete: false } },
  }),
  true
);
assert.equal(
  isForeignEnableToggleDisabled({
    code: "en",
    locked: false,
    busy: false,
    overviewReady: false,
    currentlyEnabled: false,
  }),
  true
);

// --- E. Product translation UI helpers ---
assert.equal(shouldStartProductTranslationFetch({ hasWorkspace: false, inFlight: false }), true);
assert.equal(shouldStartProductTranslationFetch({ hasWorkspace: true, inFlight: false }), false);
assert.equal(shouldStartProductTranslationFetch({ hasWorkspace: false, inFlight: true }), false);
assert.equal(
  shouldStartProductTranslationFetch({ hasWorkspace: true, inFlight: false, force: true }),
  true
);
assert.equal(
  productTranslationFieldPresentation({ loading: true, workspaceLoaded: false, sourceRu: "" }).kind,
  "loading"
);
assert.equal(
  productTranslationFieldPresentation({ loading: false, workspaceLoaded: true, sourceRu: "" }).kind,
  "notApplicable"
);
assert.equal(canShowReturnToAuto({ state: "MISSING" }), false);
assert.equal(canShowReturnToAuto({ state: "AUTO", autoValue: "x" }), false);
assert.equal(canShowReturnToAuto({ state: "MANUAL", autoValue: "" }), true);
assert.equal(canShowReturnToAuto({ state: "AUTO", stale: true, autoValue: "auto" }), true);

// --- F. Image priority helper hardening ---
assert.deepEqual(productCardImageLoadingAttrs(0), { loading: "eager", fetchPriority: "high" });
assert.deepEqual(productCardImageLoadingAttrs(7), { loading: "eager", fetchPriority: "high" });
assert.deepEqual(productCardImageLoadingAttrs(8), { loading: "lazy" });
assert.equal(productCardImageLoadingAttrs(0, Number.NaN).fetchPriority, "high");
assert.equal(productCardImageLoadingAttrs(0, -1).fetchPriority, "high");
assert.equal(productCardImageLoadingAttrs(0, Infinity).fetchPriority, "high");
assert.equal(productCardImageLoadingAttrs(0, 1000).fetchPriority, "high");
assert.equal(productCardImageLoadingAttrs(8, 1000).loading, "lazy");
assert.equal(STOREFRONT_PRIORITY_IMAGE_COUNT, 8);

{
  const sections = [
    { products: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}` })) },
    { products: Array.from({ length: 5 }, (_, i) => ({ id: `b${i}` })) },
    { products: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}` })) },
  ];
  let cursor = 0;
  const attrs = [];
  for (const section of sections) {
    for (const product of section.products) {
      attrs.push({ id: product.id, ...productCardImageLoadingAttrs(cursor) });
      cursor += 1;
    }
  }
  assert.equal(attrs.filter((item) => item.loading === "eager").length, 8);
}

assertMatch("src/screens/storefront/pages/CatalogPage.jsx", /imagePriorityIndex|productCardImageLoadingAttrs/);
assertMatch("src/screens/storefront/components/ProductCard.jsx", /productCardImageLoadingAttrs|fetchPriority/);

// --- G. Selected-language generic construction ---
{
  const store = {
    entries: [
      {
        id: "e1",
        namespace: "ui",
        entityType: "",
        entityId: "",
        fieldKey: "admin.languages.ready",
        sourceRu: "Готово",
        sourceHash: "h",
        critical: true,
      },
    ],
    values: [
      { entryId: "e1", languageCode: "en", value: "Ready", state: "AUTO", sourceHash: "h" },
      { entryId: "e1", languageCode: "uz", value: "Tayyor", state: "AUTO", sourceHash: "h" },
    ],
  };
  const statsAll = {};
  const all = buildTranslationRows(store, { __stats: statsAll });
  assert.equal(statsAll.languageCodes.length, 6);
  assert.equal(Object.keys(all[0].languages).length, 6);
  const statsOne = {};
  const one = buildTranslationRows(store, { language: "en", __stats: statsOne });
  assert.deepEqual(statsOne.languageCodes, ["en"]);
  assert.equal(statsOne.cellBuilds, 1);
  assert.deepEqual(Object.keys(one[0].languages), ["en"]);
  assert.deepEqual(workspaceTargetLanguageCodes("zh"), ["zh"]);
}

// --- H. Source contracts for ManagerLanguages / ProductTranslationEditor ---
assertMatch("src/screens/manager/ManagerLanguages.jsx", /fetchWorkspacePage|refreshWorkspaceFromStart/);
assertMatch("src/screens/manager/ManagerLanguages.jsx", /canSendForeignLanguageEnablePut|shouldShowIncompleteEnableBlock/);
assertMatch("src/screens/manager/ManagerLanguages.jsx", /debouncedQuery|300/);
assertNoMatch(
  "src/screens/manager/ManagerLanguages.jsx",
  /saveGlossary[\s\S]{0,400}refreshOverview\(\)/,
  "glossary save must not refresh overview/completeness"
);
assertNoMatch(
  "src/screens/manager/ManagerLanguages.jsx",
  /deleteGlossary[\s\S]{0,400}refreshOverview\(\)/,
  "glossary delete must not refresh overview/completeness"
);
assertMatch("src/screens/manager/ProductTranslationEditor.jsx", /loading|aria-busy/);
assertMatch("src/screens/manager/ProductTranslationEditor.jsx", /shouldStartProductTranslationFetch|inFlight/);
assertNoMatch(
  "src/screens/manager/ProductTranslationEditor.jsx",
  /useEffect\(\s*\(\)\s*=>\s*\{\s*load\(\);\s*\},\s*\[load\]\s*\)/,
  "must not auto-load translations on mount"
);

// --- I. TEMP DB: default pagination + selected-language path + completeness ---
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clover-post-stage4-ux-"));
const dbPath = path.join(tmpRoot, "temp.sqlite");
process.env.DB_PATH = dbPath;
process.env.TEST_DB_ISOLATED = "YES";

await import("node:sqlite");
await import("../src/db.js");
const {
  listWorkspacePage,
  listWorkspaceRows,
  collectFilteredWorkspaceRows,
  completenessByLanguage,
  initializeLocalizationCatalog,
} = await import("../src/localizationStore.js");
const {
  productCompletenessItems,
  productFieldCompletenessByLanguage,
  computeProductCompletenessSnapshot,
  buildProductWorkspaceRows,
} = await import("../src/productLocalizationStore.js");
const { sourceHash } = await import("../../src/shared/i18n/sourceHash.js");
const { PRODUCT_TRANSLATION_FIELDS } = await import("../../src/shared/i18n/productLocalization.js");
const { exactTranslationTargetInternal, toPublicLocaleCode, PUBLIC_LOCALE_CODES } = await import(
  "../../src/shared/i18n/languageRegistry.js"
);

initializeLocalizationCatalog();

const defaultPage = listWorkspacePage({ view: "interface", language: "en" });
assert.ok(defaultPage.rows.length <= 100);
assert.equal(defaultPage.limit, 100);
assert.equal(defaultPage.offset, 0);
assert.ok(defaultPage.total > 100);
assert.equal(defaultPage.hasMore, true);
assert.deepEqual(Object.keys(defaultPage.rows[0].languages || {}), ["en"]);

const undefPage = listWorkspacePage({
  view: "interface",
  language: "en",
  limit: undefined,
  offset: undefined,
});
assert.equal(undefPage.limit, 100);
assert.ok(undefPage.rows.length <= 100);

const stats = {};
const collected = collectFilteredWorkspaceRows({ view: "interface", language: "uz" }, { __stats: stats });
assert.deepEqual(stats.languageCodes, ["uz"]);
assert.ok(stats.cellBuilds <= stats.rowCount);
assert.ok(collected.length > 100);
assert.deepEqual(Object.keys(collected[0].languages || {}), ["uz"]);

const allRows = listWorkspaceRows({ view: "interface", language: "en" });
assert.ok(allRows.length > 100, "listWorkspaceRows remains explicit all-rows accessor");

const pageInterface = listWorkspacePage({ view: "interface", language: "en", limit: 100, offset: 0 });
assert.equal(pageInterface.rows.length, Math.min(100, pageInterface.total));
const page2 = listWorkspacePage({ view: "interface", language: "en", limit: 100, offset: 100 });
assert.notEqual(pageInterface.rows[0].id, page2.rows[0].id);

const searched = listWorkspacePage({
  view: "interface",
  language: "uz",
  query: "admin.languages.enableBlocked",
  limit: 50,
  offset: 0,
});
assert.ok(searched.total >= 1);
assert.deepEqual(Object.keys(searched.rows[0].languages || {}), ["uz"]);

const overview = completenessByLanguage();
assert.ok(overview.en);
assert.equal(typeof overview.en.complete, "boolean");

const snap = computeProductCompletenessSnapshot();
assert.ok(Array.isArray(snap.items));
assert.ok(snap.fieldReports?.en);
assert.equal(productCompletenessItems().length, snap.items.length);
assert.deepEqual(productFieldCompletenessByLanguage().en.name, snap.fieldReports.en.name);

// Reference completeness parity (test-only reconstruction of prior Stage4 meaning)
{
  function emptyFieldReport() {
    return { total: 0, current: 0, stale: 0, missing: 0 };
  }
  function deriveFromWorkspaceRows(products) {
    const items = [];
    const fieldReports = {};
    for (const code of PUBLIC_LOCALE_CODES) {
      if (code === "ru") continue;
      fieldReports[code] = {
        name: emptyFieldReport(),
        description: emptyFieldReport(),
        composition: emptyFieldReport(),
        characteristics: emptyFieldReport(),
      };
    }
    const rows = buildProductWorkspaceRows(products);
    for (const row of rows) {
      for (const [code, cell] of Object.entries(row.languages || {})) {
        const critical = row.fieldKey === "name";
        items.push({
          domain: "products",
          language: code,
          state: cell.stale ? "STALE" : cell.state,
          stale: cell.stale,
          critical,
          value: cell.value,
          fieldKey: row.fieldKey,
        });
        const bucket = fieldReports[code]?.[row.fieldKey];
        if (!bucket) continue;
        bucket.total += 1;
        if (cell.stale) bucket.stale += 1;
        else if (!String(cell.value || "").trim() || cell.state === "MISSING") bucket.missing += 1;
        else bucket.current += 1;
      }
    }
    for (const report of Object.values(fieldReports)) {
      report.criticalComplete =
        report.name.total > 0 && report.name.current === report.name.total && report.name.stale === 0;
      report.detailReady = ["description", "composition", "characteristics"].every(
        (field) =>
          report[field].total === 0 ||
          (report[field].current === report[field].total && report[field].stale === 0)
      );
    }
    return { items, fieldReports };
  }

  const reference = deriveFromWorkspaceRows();
  const live = computeProductCompletenessSnapshot();
  assert.equal(live.items.length, reference.items.length);
  for (const code of ["en", "uz", "ky", "tg", "zh", "ar"]) {
    assert.deepEqual(live.fieldReports[code], reference.fieldReports[code], `parity ${code}`);
  }
}

assert.equal(typeof computeProductCompletenessSnapshot, "function");
{
  const src = read("server/src/productLocalizationStore.js");
  const fnBody = src.slice(src.indexOf("export function productCompletenessItems"));
  const nextExport = fnBody.indexOf("\nexport function ", 10);
  const body = nextExport >= 0 ? fnBody.slice(0, nextExport) : fnBody;
  assert.equal(/buildProductWorkspaceRows\s*\(/.test(body), false);
}

console.log("verify-post-stage4-performance-ux: PASS");
