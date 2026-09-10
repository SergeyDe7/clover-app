/**
 * Post-Stage4 performance/UX regressions.
 * TEMP DB only for server completeness/workspace. No production mutation.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

assert.equal(UI_CATALOG.length, 1900, "UI catalog must remain 1900");

{
  let ownKeysCalls = 0;
  const base = { "admin.languages.enableBlocked": "blocked", "unit.piece": "шт" };
  const proxied = new Proxy(base, {
    ownKeys(target) {
      ownKeysCalls += 1;
      return Reflect.ownKeys(target);
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
  language: "ru",
  dictionaries: { ru: dict },
});
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

// --- B. Product card image priority helper ---
const { productCardImageLoadingAttrs } = await import(
  "../../src/screens/storefront/components/productCardImage.js"
);
assert.deepEqual(productCardImageLoadingAttrs(0), { loading: "eager", fetchPriority: "high" });
assert.deepEqual(productCardImageLoadingAttrs(7), { loading: "eager", fetchPriority: "high" });
assert.deepEqual(productCardImageLoadingAttrs(8), { loading: "lazy" });
assert.deepEqual(productCardImageLoadingAttrs(100), { loading: "lazy" });
assertMatch("src/screens/storefront/pages/CatalogPage.jsx", /imagePriorityIndex|productCardImageLoadingAttrs/);
assertMatch("src/screens/storefront/components/ProductCard.jsx", /productCardImageLoadingAttrs|fetchPriority/);

// Global first-8 across multi-section render order
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
  assert.equal(attrs.filter((item) => item.fetchPriority === "high").length, 8);
  assert.equal(attrs[8].loading, "lazy");
  assert.equal(attrs[8].fetchPriority, undefined);
}

// --- C. ProductTranslationEditor lazy/collapsed contracts ---
assertMatch(
  "src/screens/manager/ProductTranslationEditor.jsx",
  /expanded|setExpanded|collapsed/,
  "translation section must support collapsed/expanded"
);
assertNoMatch(
  "src/screens/manager/ProductTranslationEditor.jsx",
  /useEffect\(\s*\(\)\s*=>\s*\{\s*load\(\);\s*\},\s*\[load\]\s*\)/,
  "must not auto-load translations on mount"
);
assertMatch(
  "src/screens/manager/ProductTranslationEditor.jsx",
  /openField|expandedField|activeField/,
  "field accordion required"
);

// --- D. ManagerLanguages overview decoupling + enable short-circuit + debounce ---
assertMatch("src/screens/manager/ManagerLanguages.jsx", /loadOverview|refreshOverview/);
assertMatch("src/screens/manager/ManagerLanguages.jsx", /loadWorkspace|debouncedQuery|debounce/);
assertMatch(
  "src/screens/manager/ManagerLanguages.jsx",
  /complete\s*!==\s*true|!\w+\.complete/,
  "known-incomplete enable must short-circuit"
);

// --- E. TEMP DB: completeness single-pass + interface pagination ---
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clover-post-stage4-ux-"));
const dbPath = path.join(tmpRoot, "temp.sqlite");
process.env.DB_PATH = dbPath;
process.env.TEST_DB_ISOLATED = "YES";

const { default: DatabaseSync } = await import("node:sqlite").then((m) => ({
  default: m.DatabaseSync,
}));
// Boot schema via db module
const dbMod = await import("../src/db.js");
const {
  listWorkspacePage,
  completenessByLanguage,
  initializeLocalizationCatalog,
} = await import("../src/localizationStore.js");
const {
  productCompletenessItems,
  productFieldCompletenessByLanguage,
  computeProductCompletenessSnapshot,
} = await import("../src/productLocalizationStore.js");

initializeLocalizationCatalog();

const overview = completenessByLanguage();
assert.ok(overview.en);
assert.equal(typeof overview.en.complete, "boolean");

const pageInterface = listWorkspacePage({ view: "interface", language: "en", limit: 100, offset: 0 });
assert.equal(pageInterface.limit, 100);
assert.ok(pageInterface.rows.length <= 100);
assert.equal(pageInterface.rows.length, Math.min(100, pageInterface.total));
assert.ok(pageInterface.total > 100);
assert.equal(pageInterface.hasMore, true);
assert.deepEqual(Object.keys(pageInterface.rows[0].languages || {}), ["en"]);

const page2 = listWorkspacePage({ view: "interface", language: "en", limit: 100, offset: 100 });
assert.equal(page2.rows.length > 0, true);
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

// Snapshot API exists and avoids double workspace construction contract via source inspection
assert.equal(typeof computeProductCompletenessSnapshot, "function");
const snap = computeProductCompletenessSnapshot();
assert.ok(Array.isArray(snap.items));
assert.ok(snap.fieldReports?.en);
const items = productCompletenessItems();
const fields = productFieldCompletenessByLanguage();
assert.equal(items.length, snap.items.length);
assert.deepEqual(fields.en.name, snap.fieldReports.en.name);

assertNoMatch(
  "server/src/productLocalizationStore.js",
  /productCompletenessItems[\s\S]*buildProductWorkspaceRows\([\s\S]*productFieldCompletenessByLanguage[\s\S]*buildProductWorkspaceRows/,
  "completeness must not call buildProductWorkspaceRows twice via old pattern"
);

// Source contracts for completeness helpers
{
  const src = read("server/src/productLocalizationStore.js");
  const fnBody = src.slice(src.indexOf("export function productCompletenessItems"));
  const nextExport = fnBody.indexOf("\nexport function ", 10);
  const body = nextExport >= 0 ? fnBody.slice(0, nextExport) : fnBody;
  assert.equal(/buildProductWorkspaceRows\s*\(/.test(body), false);
}
{
  const src = read("server/src/productLocalizationStore.js");
  const start = src.indexOf("export function productFieldCompletenessByLanguage");
  const fnBody = src.slice(start);
  const nextExport = fnBody.indexOf("\nexport function ", 10);
  const body = nextExport >= 0 ? fnBody.slice(0, nextExport) : fnBody;
  assert.equal(/buildProductWorkspaceRows\s*\(/.test(body), false);
}

console.log("verify-post-stage4-performance-ux: PASS");
