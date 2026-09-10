/**
 * Stage 5.1 — categories + subcategories localization gate.
 * TEMP SQLite only. No production writes. No commit required.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workRoot = path.resolve(__dirname, "../..");
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

const tempDir = mkdtempSync(path.join(tmpdir(), "clover-stage5-1-"));
mkdirSync(tempDir, { recursive: true });
const dbPath = path.join(tempDir, "clover.sqlite");
rejectUnsafePath(dbPath);
process.env.DB_PATH = dbPath;
process.env.TEST_DB_ISOLATED = "YES";

const { getDatabasePath } = await import("../src/db.js");
assert.equal(path.resolve(getDatabasePath()), path.resolve(dbPath));
assert.ok(!path.resolve(getDatabasePath()).startsWith(PRODUCTION_DATA));
console.log("TEST_DB_ISOLATED=YES");

const { sourceHash } = await import("../../src/shared/i18n/sourceHash.js");
const {
  CLOVER_PRODUCT_GROUPS,
  CLOVER_GROUP_META,
  buildGroupNav,
  canonicalizeProductCategory,
  canonicalizeProductSubcategory,
  assignCloverTaxonomy,
  LEGACY_CATEGORY_TO_CANONICAL,
} = await import("../../src/screens/storefront/productGroups.js");
const {
  BROWSER_LANGUAGE_AUTO_REDIRECT,
  PUBLIC_LANGUAGE_PREFIXES_ENABLED,
} = await import("../../src/shared/i18n/languageResolver.js");
const { computeLanguageCompleteness } = await import(
  "../../src/shared/i18n/localizationSettings.js"
);

let categoryCatalog;
try {
  categoryCatalog = await import("../../src/shared/i18n/categoryCatalog.js");
} catch (error) {
  assert.fail(`category localization catalog missing: ${error.message}`);
}

const {
  CATEGORY_NAMESPACE,
  CATEGORY_FIELD_KEY,
  listCategoryCatalogEntries,
  getCategoryCatalogEntry,
  isCurrentCategoryCatalogEntry,
  categoryEntityKey,
  findCategoryCatalogBySource,
} = categoryCatalog;

assert.equal(CATEGORY_NAMESPACE, "category");
assert.equal(CATEGORY_FIELD_KEY, "name");

/** Strip line and block comments without treating string contents as code. */
function stripJsCommentsPreservingStrings(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = source[i];
        out += c;
        if (c === "\\" && i + 1 < n) {
          out += source[i + 1];
          i += 2;
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i + 1 < n && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i = Math.min(n, i + 2);
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Collect static import/export module specifiers (formatting-independent). */
function collectStaticModuleSpecifiers(source) {
  const code = stripJsCommentsPreservingStrings(source);
  const specs = [];
  const re =
    /\b(?:import|export)(?:\s+type)?\s+(?:[\w*\s{},]+?\s+from\s+)?(["'])([^"']+)\1/g;
  let match;
  while ((match = re.exec(code)) !== null) {
    specs.push(match[2]);
  }
  const sideEffect = /\bimport\s*(["'])([^"']+)\1/g;
  while ((match = sideEffect.exec(code)) !== null) {
    specs.push(match[2]);
  }
  return [...new Set(specs)];
}

function assertBrowserSafeCategoryModule(label, relativePath) {
  const source = readFileSync(path.join(workRoot, relativePath), "utf8");
  const specs = collectStaticModuleSpecifiers(source);
  for (const spec of specs) {
    assert.ok(
      !spec.startsWith("node:"),
      `${label} must not import node builtin ${spec}`
    );
    assert.ok(
      spec !== "crypto",
      `${label} must not import bare crypto builtin`
    );
    const leaf = spec.split("/").pop() || spec;
    assert.ok(
      leaf !== "sourceHash.js" && leaf !== "sourceHash",
      `${label} must not depend on sourceHash (${spec})`
    );
    assert.ok(
      !/(?:^|\/)server(?:\/|$)/.test(spec) &&
        !spec.includes("localizationStore") &&
        !/\/db\.js$/.test(spec),
      `${label} must not import server-only module ${spec}`
    );
  }
}

// Browser boundary: Stage 5.1 category modules must not pull Node hashing / server code.
assertBrowserSafeCategoryModule(
  "categoryCatalog",
  "src/shared/i18n/categoryCatalog.js"
);
assertBrowserSafeCategoryModule(
  "categoryDisplayProjection",
  "src/shared/i18n/categoryDisplayProjection.js"
);
assertBrowserSafeCategoryModule(
  "storefrontCategoryDisplay",
  "src/shared/i18n/storefrontCategoryDisplay.js"
);

const catalogEntries = listCategoryCatalogEntries();
assert.ok(catalogEntries.length > 0, "category corpus must be non-empty");

const topCount = catalogEntries.filter((e) => e.entityType === "category").length;
const subCount = catalogEntries.filter((e) => e.entityType === "subcategory").length;
assert.equal(topCount, CLOVER_PRODUCT_GROUPS.length, "top-level category count");
const expectedSubs = Object.values(CLOVER_GROUP_META).reduce(
  (n, meta) => n + (Array.isArray(meta.children) ? meta.children.length : 0),
  0
);
assert.equal(subCount, expectedSubs, "subcategory count");
assert.equal(catalogEntries.length, topCount + subCount);
assert.ok(catalogEntries.every((e) => e.critical === true), "all category rows critical");
assert.ok(catalogEntries.every((e) => e.fieldKey === "name"));
assert.ok(catalogEntries.every((e) => e.namespace === "category"));
assert.ok(
  catalogEntries.every((e) => typeof e.sourceRu === "string" && e.sourceRu.trim()),
  "catalog entries must expose canonical sourceRu"
);
assert.ok(
  catalogEntries.every((e) => !Object.prototype.hasOwnProperty.call(e, "sourceHash")),
  "browser catalog entries must not precompute sourceHash"
);

// Duplicate Прочее isolation
const otherSubs = catalogEntries.filter(
  (e) => e.entityType === "subcategory" && e.sourceRu === "Прочее"
);
assert.ok(otherSubs.length >= 5, "repeated Прочее under parents");
const otherIds = new Set(otherSubs.map((e) => e.entityId));
assert.equal(otherIds.size, otherSubs.length, "Прочее entityIds must not collide");

// Stable identity survives wording: ids are code-owned, not hash(sourceRu)
const disposable = findCategoryCatalogBySource({ entityType: "category", sourceRu: "Одноразовая посуда" });
assert.ok(disposable?.entityId);
assert.notEqual(disposable.entityId, sourceHash(disposable.sourceRu));

let categorySeed;
try {
  categorySeed = await import("../src/i18n/categoryTranslationSeed.js");
} catch (error) {
  assert.fail(`category AUTO seed missing: ${error.message}`);
}
const { getCategorySeedTranslation, hasCategorySeed } = categorySeed;

const TARGETS = ["en", "uz", "ky", "tg", "zh-CN", "ar"];
for (const entry of catalogEntries) {
  assert.ok(hasCategorySeed(entry.entityType, entry.entityId), `seed missing ${entry.entityId}`);
  for (const locale of TARGETS) {
    const value = getCategorySeedTranslation(entry.entityType, entry.entityId, locale);
    assert.ok(String(value || "").trim(), `empty AUTO seed ${entry.entityId}/${locale}`);
  }
}

let displayProjection;
try {
  displayProjection = await import("../../src/shared/i18n/categoryDisplayProjection.js");
} catch (error) {
  assert.fail(`category display projection missing: ${error.message}`);
}
const { projectLocalizedGroupNav, resolveCategoryDisplayName } = displayProjection;

const navRu = buildGroupNav([]);
const projectedRu = projectLocalizedGroupNav(navRu, {
  language: "ru",
  enabledLanguages: ["ru"],
  translations: {},
});
assert.equal(projectedRu.length, navRu.length);
for (let i = 0; i < navRu.length; i += 1) {
  assert.equal(projectedRu[i].name, navRu[i].name, "canonical name unchanged for RU");
  assert.equal(projectedRu[i].displayName, navRu[i].name, "RU displayName equals name");
  assert.equal(projectedRu[i].children.length, navRu[i].children.length);
}

const enLookup = Object.create(null);
for (const entry of catalogEntries) {
  enLookup[categoryEntityKey(entry.entityType, entry.entityId)] = getCategorySeedTranslation(
    entry.entityType,
    entry.entityId,
    "en"
  );
}
const projectedEn = projectLocalizedGroupNav(navRu, {
  language: "en",
  enabledLanguages: ["ru", "en"],
  translations: enLookup,
});
assert.equal(projectedEn.length, navRu.length);
let changedLabels = 0;
for (let i = 0; i < navRu.length; i += 1) {
  assert.equal(projectedEn[i].name, navRu[i].name, "canonical identity must not change for EN");
  if (projectedEn[i].displayName !== navRu[i].name) changedLabels += 1;
  for (let j = 0; j < navRu[i].children.length; j += 1) {
    assert.equal(projectedEn[i].children[j].name, navRu[i].children[j].name);
  }
}
assert.ok(changedLabels > 0, "foreign display labels must differ when translations present");

assert.equal(
  resolveCategoryDisplayName({
    sourceRu: "Стаканы",
    entityType: "subcategory",
    entityId: "missing-id",
    language: "en",
    enabledLanguages: ["ru", "en"],
    translations: {},
  }),
  "Стаканы",
  "missing translation → RU fallback"
);

// Taxonomy invariance
assert.deepEqual(
  assignCloverTaxonomy("стакан пэт 500").category,
  canonicalizeProductCategory("Одноразовая посуда")
);
assert.equal(canonicalizeProductCategory("Контейнеры"), "Одноразовая посуда");
assert.equal(Object.keys(LEGACY_CATEGORY_TO_CANONICAL).length, 31);
assert.equal(canonicalizeProductSubcategory("Тряпки, МОПы, полотенца"), "Тряпки, мопы, полотенца");
assert.notEqual(
  enLookup[categoryEntityKey("subcategory", otherSubs[0].entityId)],
  undefined
);
assert.equal(
  canonicalizeProductCategory(enLookup[categoryEntityKey("category", disposable.entityId)] || "x"),
  enLookup[categoryEntityKey("category", disposable.entityId)] || "x",
  "translated label must not become a new canonical via accidental rewrite of rules"
);
// Translated EN label must NOT match Russian canonicalize path as identity input for assignment
const enDisposable = enLookup[categoryEntityKey("category", disposable.entityId)];
assert.ok(enDisposable && enDisposable !== "Одноразовая посуда");
assert.equal(
  canonicalizeProductCategory(enDisposable),
  enDisposable,
  "foreign label stays unknown to taxonomy (not remapped to RU group)"
);

const {
  initializeLocalizationCatalog,
  completenessByLanguage,
  listWorkspacePage,
  saveManualTranslation,
  resetTranslationToAuto,
  readLocalizationSettings,
  writeLocalizationSettings,
  collectFilteredWorkspaceRows,
} = await import("../src/localizationStore.js");
const { findTranslationEntryByEntityIdentity, getTranslationValueRow } = await import("../src/db.js");

initializeLocalizationCatalog();

const settings = readLocalizationSettings();
assert.deepEqual(settings.enabledLanguages, ["ru"]);

// Server hash authority: persisted rows must match code-owned catalog identity + sourceRu.
for (const catalogEntry of catalogEntries) {
  const persisted = findTranslationEntryByEntityIdentity(
    catalogEntry.namespace,
    catalogEntry.entityType,
    catalogEntry.entityId,
    catalogEntry.fieldKey
  );
  assert.ok(persisted, `persisted category entry ${catalogEntry.entityId}`);
  assert.equal(persisted.namespace, catalogEntry.namespace, `namespace ${catalogEntry.entityId}`);
  assert.equal(persisted.entityType, catalogEntry.entityType, `entityType ${catalogEntry.entityId}`);
  assert.equal(persisted.entityId, catalogEntry.entityId, `entityId ${catalogEntry.entityId}`);
  assert.equal(persisted.fieldKey, catalogEntry.fieldKey, `fieldKey ${catalogEntry.entityId}`);
  assert.equal(
    persisted.sourceRu,
    catalogEntry.sourceRu,
    `persisted sourceRu must equal catalog sourceRu for ${catalogEntry.entityId}`
  );
  assert.ok(
    Number(persisted.critical) === 1 || persisted.critical === true,
    `persisted critical for ${catalogEntry.entityId}`
  );
  const expectedHash = sourceHash(catalogEntry.sourceRu);
  assert.equal(
    persisted.sourceHash,
    expectedHash,
    `server entry sourceHash from catalog sourceRu for ${catalogEntry.entityId}`
  );
  for (const locale of TARGETS) {
    const value = getTranslationValueRow(persisted.id, locale);
    assert.ok(value, `AUTO value ${catalogEntry.entityId}/${locale}`);
    assert.equal(value.state, "AUTO");
    assert.equal(
      value.sourceHash,
      expectedHash,
      `server value sourceHash from catalog sourceRu for ${catalogEntry.entityId}/${locale}`
    );
  }
}

const reports = completenessByLanguage();
for (const code of ["en", "uz", "ky", "tg", "zh", "ar"]) {
  const report = reports[code];
  assert.ok(report, `missing completeness ${code}`);
  const cats = report.domains.categories;
  assert.ok(cats.total > 0, `${code} categories.total must be > 0`);
  assert.equal(cats.ready, cats.total, `${code} categories must be fully ready after seed`);
  assert.equal(cats.complete, true, `${code} categories.complete`);
  assert.equal(report.complete, false, `${code} overall must stay incomplete (pages/faq/seo)`);
}

const page = listWorkspacePage({ view: "categories", language: "en", limit: 100, offset: 0 });
assert.equal(page.total, catalogEntries.length, "categories workspace total must equal corpus");
assert.ok(page.rows.length > 0);
assert.ok(page.rows.every((row) => row.namespace === "category"));
assert.ok(page.rows.every((row) => row.entityType === "category" || row.entityType === "subcategory"));

const stats = {};
collectFilteredWorkspaceRows({ view: "categories", language: "en" }, { __stats: stats });
assert.equal(stats.genericEntriesRead, 0, "categories view must not scan generic UI entries");
assert.equal(stats.genericValuesRead, 0, "categories view must not scan generic all-values");
assert.equal(stats.uiRowsBuilt, 0, "categories view must not build UI rows");
assert.equal(stats.productRowsBuilt, 0, "categories view must not build product rows");
assert.equal(stats.categoryRowsBuilt, catalogEntries.length, "category rows built");
assert.equal(stats.categoryCurrentEntries, catalogEntries.length);
assert.equal(stats.categoryValuesRead, catalogEntries.length, "only selected-language category values");
assert.equal(stats.valueLanguageInternal, "en");
assert.deepEqual(stats.languageCodes, ["en"], "only selected language materialized");
assert.equal(stats.cellBuilds, catalogEntries.length, "one cell per category entry");
assert.equal(stats.namespace, "category");

const cups = findCategoryCatalogBySource({
  entityType: "subcategory",
  sourceRu: "Стаканы",
  parentSourceRu: "Одноразовая посуда",
});
assert.ok(cups);
const cupsEntry = findTranslationEntryByEntityIdentity(
  "category",
  cups.entityType,
  cups.entityId,
  "name"
);
assert.ok(cupsEntry, "DB entity identity lookup");

const versionBeforeManual = readLocalizationSettings().catalogVersion;
const manual = saveManualTranslation(cupsEntry.id, "en", "Cups MANUAL", "test-admin");
assert.equal(manual.changed, true);
const versionAfterManual = readLocalizationSettings().catalogVersion;
assert.equal(versionAfterManual, versionBeforeManual + 1);

const afterManual = listWorkspacePage({ view: "categories", language: "en", query: "Стаканы", limit: 10 });
const cupsRow = afterManual.rows.find((row) => row.id === cupsEntry.id);
assert.equal(cupsRow?.languages?.en?.state, "MANUAL");
assert.equal(cupsRow?.languages?.en?.value, "Cups MANUAL");

// MANUAL survives catalog resync; no-op sync must not bump catalogVersion
const resync = initializeLocalizationCatalog();
assert.equal(resync.dirty, false, "resync with MANUAL present and unchanged corpus is no-op");
assert.equal(
  readLocalizationSettings().catalogVersion,
  versionAfterManual,
  "no-op resync must not bump catalogVersion"
);
const afterResync = listWorkspacePage({ view: "categories", language: "en", query: "Стаканы", limit: 10 });
const cupsRowResync = afterResync.rows.find((row) => row.id === cupsEntry.id);
assert.equal(cupsRowResync?.languages?.en?.state, "MANUAL");
assert.equal(cupsRowResync?.languages?.en?.value, "Cups MANUAL");

const reset = resetTranslationToAuto(cupsEntry.id, "en", "test-admin");
assert.equal(reset.changed, true);
const afterReset = listWorkspacePage({ view: "categories", language: "en", query: "Стаканы", limit: 10 });
const cupsRow2 = afterReset.rows.find((row) => row.id === cupsEntry.id);
assert.equal(cupsRow2?.languages?.en?.state, "AUTO");
assert.equal(
  cupsRow2?.languages?.en?.value,
  getCategorySeedTranslation(cups.entityType, cups.entityId, "en")
);

// Unknown UUID rejection
let unknownRejected = false;
try {
  saveManualTranslation("00000000-0000-4000-8000-000000000099", "en", "x", "test");
} catch (error) {
  unknownRejected = error?.code === "UNKNOWN_ENTRY" || error?.status === 404;
}
assert.ok(unknownRejected, "unknown entry rejected");

// Structurally valid orphan category entity (not in code-owned catalog)
const {
  insertTranslationEntryRow,
  upsertTranslationValueRow,
  getTranslationEntryRow,
} = await import("../src/db.js");
const orphanId = "00000000-0000-4000-8000-0000000000aa";
const orphanStamp = new Date().toISOString();
const orphanRu = "Сирота-категория";
insertTranslationEntryRow({
  id: orphanId,
  namespace: "category",
  entityType: "subcategory",
  entityId: "orphan/not-in-catalog",
  fieldKey: "name",
  sourceRu: orphanRu,
  sourceHash: sourceHash(orphanRu),
  critical: true,
  createdAt: orphanStamp,
  updatedAt: orphanStamp,
});
upsertTranslationValueRow({
  entryId: orphanId,
  languageCode: "en",
  value: "Orphan EN",
  state: "AUTO",
  sourceHash: sourceHash(orphanRu),
  updatedAt: orphanStamp,
  updatedBy: "orphan-seed",
});
assert.ok(getTranslationEntryRow(orphanId));
assert.equal(
  isCurrentCategoryCatalogEntry({
    namespace: "category",
    entityType: "subcategory",
    entityId: "orphan/not-in-catalog",
    fieldKey: "name",
  }),
  false,
  "orphan must not masquerade as current category entry"
);
let orphanSaveRejected = false;
try {
  saveManualTranslation(orphanId, "en", "Orphan MANUAL", "test");
} catch (error) {
  orphanSaveRejected = error?.code === "ORPHAN_ENTRY";
}
assert.ok(orphanSaveRejected, "orphan MANUAL save must be ORPHAN_ENTRY");
let orphanResetRejected = false;
try {
  resetTranslationToAuto(orphanId, "en", "test");
} catch (error) {
  orphanResetRejected = error?.code === "ORPHAN_ENTRY";
}
assert.ok(orphanResetRejected, "orphan AUTO reset must be ORPHAN_ENTRY");

// Fake orphan entity in DB shape via isCurrentCategoryCatalogEntry
assert.equal(
  isCurrentCategoryCatalogEntry({
    namespace: "category",
    entityType: "subcategory",
    entityId: "not-a-real-id",
    fieldKey: "name",
  }),
  false
);
assert.equal(
  isCurrentCategoryCatalogEntry({
    namespace: "category",
    entityType: cups.entityType,
    entityId: cups.entityId,
    fieldKey: "name",
  }),
  true
);

// ProductPage: label projection vs canonical navigation identity
const productPageSrc = readFileSync(
  path.join(workRoot, "src/screens/storefront/pages/ProductPage.jsx"),
  "utf8"
);
assert.match(productPageSrc, /categoryDisplayNameFromCanonical/);
assert.match(productPageSrc, /storefrontCategoryDisplayOptions/);
assert.match(
  productPageSrc,
  /navigateStorefront\(\{\s*name:\s*"catalog",\s*category:\s*product\.category/
);
assert.match(productPageSrc, /sf-product-cat">\{categoryLabel\}/);
assert.doesNotMatch(
  productPageSrc,
  /sf-product-cat">\{product\.category\}/
);

// CatalogPage: no unrequested subcategory breadcrumb; section H2 uses display projection
const catalogPageSrc = readFileSync(
  path.join(workRoot, "src/screens/storefront/pages/CatalogPage.jsx"),
  "utf8"
);
assert.doesNotMatch(
  catalogPageSrc,
  /sf-crumb-current">\{subcategoryDisplayName\}/,
  "must not render subcategory breadcrumb crumb"
);
assert.doesNotMatch(
  catalogPageSrc,
  /subcategoryDisplayName/,
  "subcategory breadcrumb display helper must not be reintroduced"
);
assert.doesNotMatch(
  catalogPageSrc,
  /<h2>\{\s*section\.name\s*\}<\/h2>/,
  "all-catalog section H2 must not render raw canonical section.name"
);
assert.match(
  catalogPageSrc,
  /key=\{section\.name\}/,
  "section React key must remain canonical section.name"
);
assert.match(
  catalogPageSrc,
  /categoryDisplayNameFromCanonical\(\s*section\.name/,
  "section H2 must use Stage 5.1 category display projection"
);
assert.match(
  catalogPageSrc,
  /\{categoryDisplayName\}/,
  "existing category breadcrumb localization must remain"
);

// Storefront display helper documents Stage 6 transport boundary + RU freeze
const displayHelper = await import("../../src/shared/i18n/storefrontCategoryDisplay.js");
assert.deepEqual(displayHelper.STOREFRONT_CATEGORY_ENABLED_LANGUAGES, ["ru"]);
assert.deepEqual(displayHelper.storefrontCategoryDisplayOptions("en").enabledLanguages, ["ru"]);

// Enable gate still blocks foreign languages
const enableAttempt = writeLocalizationSettings(
  { enabledLanguages: ["ru", "en"] },
  "test-admin"
);
assert.deepEqual(enableAttempt.settings.enabledLanguages, ["ru"]);
assert.ok(enableAttempt.rejected.includes("en"));

// UI workspace still works and is not empty after category sync
const uiPage = listWorkspacePage({ view: "interface", language: "en", limit: 5, offset: 0 });
assert.ok(uiPage.total > 1000, "UI workspace must remain populated");

// Activation freeze
assert.equal(BROWSER_LANGUAGE_AUTO_REDIRECT, false);
assert.equal(PUBLIC_LANGUAGE_PREFIXES_ENABLED, false);
assert.doesNotMatch(
  readFileSync(path.join(workRoot, "src/shared/i18n/languageResolver.js"), "utf8"),
  /LanguageSelector/
);

// Permissions helpers still deny non-admin writes conceptually (roles)
const { hasRole } = await import("../src/roles.js");
assert.equal(hasRole("admin", ["admin"]), true, "admin has admin role");
assert.equal(hasRole("manager", ["admin"]), false, "manager denied admin");
assert.equal(hasRole("client", ["admin"]), false, "client denied admin");
assert.equal(hasRole("", ["admin"]), false, "empty role denied");

console.log(
  JSON.stringify({
    STAGE5_1: "PASS",
    categories: catalogEntries.length,
    top: topCount,
    sub: subCount,
    en_categories_complete: reports.en.domains.categories.complete,
    en_overall_complete: reports.en.complete,
    category_isolation_stats: {
      genericEntriesRead: stats.genericEntriesRead,
      categoryValuesRead: stats.categoryValuesRead,
      languageCodes: stats.languageCodes,
    },
  })
);

rmSync(tempDir, { recursive: true, force: true });
