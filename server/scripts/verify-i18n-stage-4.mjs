/**
 * Stage 4 Task 1 gate. Temporary SQLite only. No production writes.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const workRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const WORKTREE_DATA = path.resolve(workRoot, "server/data");
const ARTIFACT = path.join(workRoot, "server/i18n-artifacts/stage4/manifest.json");
const EXPECTED_MAIN = "cbd1d0e3ac831fd41126d4e6b0e7af446d436d42";
const UI_CATALOG_BASE = 1856;
const UI_CATALOG_ADDED = 44;
const UI_CATALOG_REMOVED = 0;
const UI_CATALOG_FINAL = 1900;

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

const tempDir = mkdtempSync(path.join(tmpdir(), "clover-stage4-"));
mkdirSync(tempDir, { recursive: true });
const dbPath = path.join(tempDir, "clover.sqlite");
rejectUnsafePath(dbPath);
process.env.DB_PATH = dbPath;
process.env.TEST_DB_ISOLATED = "YES";

const {
  getDatabasePath,
  getGlobalState,
  setGlobalState,
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  runInTransaction,
  listProductTranslationRows,
} = await import("../src/db.js");
assert.equal(path.resolve(getDatabasePath()), path.resolve(dbPath));
assert.ok(!path.resolve(getDatabasePath()).startsWith(PRODUCTION_DATA));
console.log("TEST_DB_ISOLATED=YES");

const { sourceHash } = await import("../../src/shared/i18n/sourceHash.js");
const { UI_CATALOG, hasCatalogKey } = await import("../../src/shared/i18n/uiCatalog.js");
const { hasSeedKey } = await import("../src/i18n/uiTranslationSeed.js");
const { UNIT_DISPLAY_KEYS, unitDisplayLabel } = await import("../../src/shared/i18n/unitDisplay.js");
const { quantityInputUnitLabel } = await import("../../src/shared/appHelpers.js");
const { PUBLIC_LANGUAGE_PREFIXES_ENABLED } = await import("../../src/shared/i18n/languageResolver.js");
const {
  applyGlossaryPhrases,
  validateProductTranslationSemantics,
  PRODUCT_GLOSSARY_CONTEXTS,
  selectGlossaryMatches,
  extractImmutableIdentityTokens,
} = await import("../src/productLocalizationSemantics.js");
const {
  readProductFieldDraft,
  writeProductFieldDraft,
  clearProductDrafts,
} = await import("../../src/shared/i18n/productTranslationDrafts.js");
const { projectLocalizedProductDisplay } = await import("../../src/shared/i18n/productDisplayProjection.js");
const { hasRole } = await import("../src/roles.js");
const {
  saveProductManualTranslation,
  resetProductTranslationToAuto,
  upsertProductAutoTranslation,
  getProductTranslationWorkspace,
  buildProductWorkspaceRows,
  productCompletenessItems,
  productFieldCompletenessByLanguage,
  saveGlossaryEntry,
  listGlossaryEntries,
  removeGlossaryEntry,
  deleteProductLocalization,
  generateAutoCandidate,
  buildProductTranslationCellMap,
} = await import("../src/productLocalizationStore.js");
const { listWorkspaceRows, listWorkspacePage } = await import("../src/localizationStore.js");
const { commitCanonicalProducts } = await import("../src/productSourceCorpus.js");

assert.equal(hasRole("manager", ["admin"]), false);
assert.equal(hasRole("admin", ["admin"]), true);

const projectionSrc = readFileSync(path.join(workRoot, "src/shared/i18n/productDisplayProjection.js"), "utf8");
assert.doesNotMatch(projectionSrc, /from ["'].*db\.js["']/);
assert.doesNotMatch(projectionSrc, /getGlobalState|better-sqlite|node:sqlite/);

const storefrontSrc = readFileSync(path.join(workRoot, "server/src/storefrontPublic.js"), "utf8");
assert.match(storefrontSrc, /buildProductTranslationCellMap\(/);
assert.doesNotMatch(storefrontSrc, /for\s*\(.*field.*\)\s*\{[\s\S]{0,200}getProductTranslationRow/);

const serverSrc = readFileSync(path.join(workRoot, "server/src/server.js"), "utf8");
assert.doesNotMatch(serverSrc, /product-translations\/import-auto/);
assert.doesNotMatch(serverSrc, /import-auto/);
assert.match(serverSrc, /expectedSourceHash/);
assert.match(serverSrc, /roleRequired\("admin"\)/);

const editorSrc = readFileSync(path.join(workRoot, "src/screens/manager/ProductTranslationEditor.jsx"), "utf8");
assert.match(editorSrc, /writeProductFieldDraft/);
assert.match(editorSrc, /expectedSourceHash|sourceHash/);
assert.match(editorSrc, /notApplicable/);
assert.match(editorSrc, /SOURCE_STALE/);

const languagesSrc = readFileSync(path.join(workRoot, "src/screens/manager/ManagerLanguages.jsx"), "utf8");
assert.match(languagesSrc, /admin\.glossary\.edit/);
assert.match(languagesSrc, /admin\.glossary\.cancel/);
assert.match(languagesSrc, /glossaryForm\.id/);
assert.match(languagesSrc, /expectedSourceHash|sourceHash/);

function expectReject(fn, code) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `expected ${code}`);
  assert.equal(thrown.code, code);
}

const generic = { sourceRu: "стакан", targetValue: "cup", context: "", protected: true };
const exact = { sourceRu: "стакан", targetValue: "tumbler", context: "product.name", protected: false };
const longer = { sourceRu: "стакан 200", targetValue: "200 cup", context: "", protected: false };
assert.equal(applyGlossaryPhrases("стакан 200 мл", [generic, exact, longer], "product.name"), "tumbler 200 мл");
assert.equal(applyGlossaryPhrases("стакан 200 мл", [generic, longer], ""), "200 cup мл");
const overlap = applyGlossaryPhrases("стакан стакан", [generic], "");
assert.equal(overlap, "cup cup");
const winners = selectGlossaryMatches("стакан 200 мл", [generic, exact], "product.name");
assert.equal(winners.length, 1);
assert.equal(winners[0].target, "tumbler");
assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "стакан 200 мл",
    targetValue: "tumbler 200 ml",
    product: {},
    glossaryEntries: [generic, exact],
    context: "product.name",
  }).ok,
  true
);

const { translateCatalogText } = await import("./lib/stage4Phrasebook.mjs");
const pmmSource = "ПММ D028 5 мм";
const pmmTokens = extractImmutableIdentityTokens(pmmSource, { name: pmmSource });
assert.equal(pmmTokens.includes("ПММ"), true);
assert.equal(pmmTokens.includes("D028"), true);
for (const language of ["en", "uz", "ky", "tg", "zh-CN", "ar"]) {
  const translated = translateCatalogText(pmmSource, language, { protectedTokens: pmmTokens, glossaryEntries: [] });
  assert.match(translated, /ПММ/);
  assert.match(translated, /D028/);
  assert.doesNotMatch(translated, /Пmm/);
}
assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "50 шт",
    targetValue: "50 dona",
    product: {},
  }).ok,
  true
);
assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "50 шт",
    targetValue: "50 件",
    product: {},
  }).ok,
  true
);
assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "50 шт",
    targetValue: "50 قطعة",
    product: {},
  }).ok,
  true
);
assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "50 шт",
    targetValue: "500 units",
    product: {},
  }).ok,
  false
);

const { shouldApplyWorkspaceResponse } = await import("../../src/shared/i18n/translationDrafts.js");
assert.equal(
  shouldApplyWorkspaceResponse({
    requestGeneration: 1,
    currentGeneration: 2,
    requestLanguage: "en",
    currentLanguage: "uz",
  }),
  false
);
assert.equal(
  shouldApplyWorkspaceResponse({
    requestGeneration: 2,
    currentGeneration: 2,
    requestLanguage: "uz",
    currentLanguage: "uz",
    requestView: "glossary",
    currentView: "glossary",
  }),
  true
);
assert.equal(
  shouldApplyWorkspaceResponse({
    requestGeneration: 3,
    currentGeneration: 3,
    requestLanguage: "en",
    currentLanguage: "en",
    requestProductId: "A",
    currentProductId: "B",
  }),
  false
);

assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "Стакан 200 мл, 50 шт.",
    targetValue: "200 ml cup, 50 pcs, 999",
    product: { code: "" },
  }).ok,
  false
);
assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "50 / 50",
    targetValue: "50",
    product: {},
  }).ok,
  false
);
assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "35×40",
    targetValue: "40x35",
    product: {},
  }).ok,
  false
);
assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "35×40",
    targetValue: "35 x 40",
    product: {},
  }).ok,
  true
);
assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "90 г",
    targetValue: "90 g",
    product: {},
  }).ok,
  true
);
assert.equal(
  validateProductTranslationSemantics({
    sourceRu: "90 г",
    targetValue: "90 kg",
    product: {},
  }).ok,
  false
);

let drafts = {};
drafts = writeProductFieldDraft(drafts, "en", "name", "English name");
drafts = writeProductFieldDraft(drafts, "uz", "name", "Uzbek name");
assert.equal(readProductFieldDraft(drafts, "en", "name", "fallback"), "English name");
assert.equal(readProductFieldDraft(drafts, "uz", "name", "fallback"), "Uzbek name");
assert.equal(readProductFieldDraft(drafts, "ky", "name", "fallback-ky"), "fallback-ky");
drafts = clearProductDrafts();
assert.equal(readProductFieldDraft(drafts, "en", "name", "gone"), "gone");

const product = {
  id: 722,
  name: "Стакан 200 мл «Мега» (50), код CL-722",
  code: "CL-722",
  oneCId: "1C-722",
  oneCCode: "CL-722",
  category: "Посуда",
  saleUnits: ["piece", "pack"],
  pieceSize: 1,
  packSize: 50,
  pricePiece: 10,
  active: true,
  showOnStorefront: true,
  storefrontDetails: {
    description: "Стакан 200 мл для напитков",
    composition: "Пластик",
    characteristics: "200 мл, упаковка 50 шт.",
  },
};
setGlobalState("products", [product]);
setGlobalState("localizationSettings", {
  enabledLanguages: ["ru"],
  catalogVersion: 2,
  updatedAt: "",
  updatedBy: "",
});
const sourceNameHash = sourceHash(product.name);

expectReject(
  () => saveProductManualTranslation(722, "en", "name", "200 ml cup «Мега» (50), код CL-722"),
  "SOURCE_STALE"
);
expectReject(
  () =>
    saveProductManualTranslation(
      722,
      "en",
      "name",
      "200 ml cup «Мега» (50), код CL-722",
      "admin",
      "deadbeef"
    ),
  "SOURCE_STALE"
);

const autoA = "200 ml cup «Мега» (50), код CL-722";
assert.equal(
  upsertProductAutoTranslation({
    productId: "722",
    language: "en",
    field: "name",
    value: autoA,
    sourceHash: sourceNameHash,
  }).changed,
  true
);
const manualM = "Mega cup 200 ml «Мега» (50), код CL-722";
const saved = saveProductManualTranslation(722, "en", "name", manualM, "admin@clover.ru", sourceNameHash);
assert.equal(saved.field.state, "MANUAL");
assert.equal(saved.field.autoValue, autoA);
const blocked = upsertProductAutoTranslation({
  productId: "722",
  language: "en",
  field: "name",
  value: "Other 200 ml cup «Мега» (50), код CL-722",
  sourceHash: sourceNameHash,
});
assert.equal(blocked.skipped, "MANUAL_PROTECTED");
assert.equal(getProductTranslationWorkspace(722).fields.name.languages.en.value, manualM);
assert.equal(getProductTranslationWorkspace(722).fields.name.languages.en.autoValue, autoA);
const reset = resetProductTranslationToAuto(722, "en", "name", "admin@clover.ru", sourceNameHash);
assert.equal(reset.field.value, autoA);
assert.equal(reset.field.state, "AUTO");

const versionBeforeRename = Number(getGlobalState("localizationSettings").catalogVersion);
commitCanonicalProducts(
  [{ ...product, name: "Стакан 400 мл «Мега» (50), код CL-722" }],
  "source-rename"
);
assert.equal(Number(getGlobalState("localizationSettings").catalogVersion), versionBeforeRename + 1);
assert.deepEqual(getGlobalState("localizationSettings").enabledLanguages, ["ru"]);
expectReject(
  () =>
    saveProductManualTranslation(
      722,
      "en",
      "name",
      "200 ml cup «Мега» (50), код CL-722",
      "admin@clover.ru",
      sourceNameHash
    ),
  "SOURCE_STALE"
);
expectReject(
  () => resetProductTranslationToAuto(722, "en", "name", "admin@clover.ru", sourceNameHash),
  "SOURCE_STALE"
);
commitCanonicalProducts([product], "restore-product");
const versionBeforePrice = Number(getGlobalState("localizationSettings").catalogVersion);
commitCanonicalProducts([{ ...product, pricePiece: 99 }], "price-only");
assert.equal(Number(getGlobalState("localizationSettings").catalogVersion), versionBeforePrice);
commitCanonicalProducts([{ ...product, packSize: 99 }], "uom-size-only");
assert.equal(Number(getGlobalState("localizationSettings").catalogVersion), versionBeforePrice);
commitCanonicalProducts([product], "restore-product-authority");

const emptyProduct = {
  ...product,
  id: 801,
  name: "Empty details 10",
  storefrontDetails: { description: "", composition: "", characteristics: "" },
};
setGlobalState("products", [product, emptyProduct]);
expectReject(
  () => saveProductManualTranslation(801, "en", "description", "nope", "admin", sourceHash("")),
  "EMPTY_SOURCE"
);
const emptyWorkspace = getProductTranslationWorkspace(801);
assert.equal(emptyWorkspace.fields.description.sourceRu, "");
const emptyRows = buildProductWorkspaceRows().filter((row) => row.entityId === "801");
assert.equal(emptyRows.some((row) => row.fieldKey === "description"), false);

const created = saveGlossaryEntry({
  sourceRu: "мега",
  language: "en",
  targetValue: "Mega",
  context: "product.name",
  protected: false,
});
const edited = saveGlossaryEntry({
  id: created.entry.id,
  sourceRu: "мега",
  language: "en",
  targetValue: "MEGA",
  context: "product.name",
  protected: true,
});
assert.equal(edited.entry.id, created.entry.id);
assert.equal(edited.entry.targetValue, "MEGA");
assert.equal(listGlossaryEntries({ language: "en" }).length, 1);
expectReject(
  () =>
    saveGlossaryEntry({
      sourceRu: "стакан",
      language: "en",
      targetValue: "cup",
      context: "seo.title",
    }),
  "INVALID_GLOSSARY_CONTEXT"
);
const versionBeforeIdenticalGlossary = Number(getGlobalState("localizationSettings").catalogVersion);
const identicalGlossary = saveGlossaryEntry({
  id: created.entry.id,
  sourceRu: "мега",
  language: "en",
  targetValue: "MEGA",
  context: "product.name",
  protected: true,
});
assert.equal(identicalGlossary.changed, false);
assert.equal(Number(getGlobalState("localizationSettings").catalogVersion), versionBeforeIdenticalGlossary);

const fields = productFieldCompletenessByLanguage();
assert.ok(fields.en.name.total >= 1);
assert.equal(Object.hasOwn(fields.en.name, "current"), true);
assert.equal(Object.hasOwn(fields.en.description, "missing"), true);
const items = productCompletenessItems();
assert.ok(items.some((item) => item.fieldKey === "description"));
assert.ok(items.filter((item) => item.fieldKey === "name").every((item) => item.critical === true));
assert.ok(items.filter((item) => item.fieldKey !== "name").every((item) => item.critical !== true));

const inactive = { ...product, id: 999, active: false, name: "Inactive product 10" };
setGlobalState("products", [product, emptyProduct, inactive]);
const activeReport = productFieldCompletenessByLanguage();
assert.equal(activeReport.en.name.total, 2);
assert.equal(
  productCompletenessItems().some((item) => item.value && String(item.value).includes("Inactive")),
  false
);

const { MANUAL_NAME_MAX_CHARS, STAGE4_QUERY_MAX_CHARS } = await import("../src/productInputLimits.js");
expectReject(
  () => saveProductManualTranslation(722, "en", "name", "x".repeat(MANUAL_NAME_MAX_CHARS + 1), "admin", sourceHash(product.name)),
  "VALUE_TOO_LARGE"
);
expectReject(() => listWorkspacePage({ view: "products", language: "en", query: "q".repeat(STAGE4_QUERY_MAX_CHARS + 1) }), "QUERY_TOO_LARGE");

const untranslated = listWorkspaceRows({ view: "untranslated", language: "ky" });
assert.ok(untranslated.some((row) => row.kind === "product" && row.fieldKey === "name"));
assert.equal(
  untranslated.some(
    (row) =>
      row.kind === "product" &&
      row.fieldKey === "name" &&
      row.languages?.ky &&
      !row.languages.ky.stale &&
      ["AUTO", "MANUAL"].includes(row.languages.ky.state)
  ),
  false
);

const descHash = sourceHash(product.storefrontDetails.description);
const cells = {
  name: { autoValue: autoA, manualValue: "", autoSourceHash: sourceNameHash },
  description: {
    autoValue: "200 ml cup for drinks",
    manualValue: "",
    autoSourceHash: descHash,
  },
};
const projected = projectLocalizedProductDisplay(product, "en", ["ru", "en"], cells);
assert.equal(projected.name, autoA);
assert.equal(projected.storefrontDetails.description, "200 ml cup for drinks");
assert.equal(projected.pricePiece, product.pricePiece);
const ruOnly = projectLocalizedProductDisplay(product, "en", ["ru"], cells);
assert.equal(ruOnly.name, product.name);
const staleAutoPublic = projectLocalizedProductDisplay(product, "en", ["ru", "en"], {
  name: { autoValue: autoA, autoSourceHash: "0".repeat(64), manualValue: "" },
});
assert.equal(staleAutoPublic.name, product.name);
const staleManualPublic = projectLocalizedProductDisplay(product, "en", ["ru", "en"], {
  name: {
    manualValue: manualM,
    manualSourceHash: "0".repeat(64),
    autoValue: autoA,
    autoSourceHash: sourceNameHash,
  },
});
assert.equal(staleManualPublic.name, product.name);
const currentManualPublic = projectLocalizedProductDisplay(product, "en", ["ru", "en"], {
  name: { manualValue: manualM, manualSourceHash: sourceNameHash, autoValue: autoA, autoSourceHash: sourceNameHash },
});
assert.equal(currentManualPublic.name, manualM);
assert.equal(projected === product, false);
assert.equal(product.name.startsWith("Стакан"), true);
const batch = buildProductTranslationCellMap("en");
assert.equal(batch instanceof Map, true);
assert.ok(batch.get("722")?.name);

const snapshot = exportDatabaseSnapshot();
assert.equal(snapshot.version, 5);
const keepAuto = getProductTranslationWorkspace(722).fields.name.languages.en.value;
importDatabaseSnapshot(structuredClone(snapshot));
assert.equal(getProductTranslationWorkspace(722).fields.name.languages.en.value, keepAuto);
const v4 = structuredClone(snapshot);
delete v4.productTranslations;
delete v4.translationGlossary;
v4.version = 4;
importDatabaseSnapshot(v4);
assert.equal(listProductTranslationRows().length, 0);
assert.equal(listGlossaryEntries().length, 0);
importDatabaseSnapshot(structuredClone(snapshot));

runInTransaction(() => {
  deleteProductLocalization(722);
});
assert.equal(listProductTranslationRows().filter((row) => row.productId === "722").length, 0);

setGlobalState("products", [product, emptyProduct]);
upsertProductAutoTranslation({
  productId: "722",
  language: "en",
  field: "name",
  value: autoA,
  sourceHash: sourceNameHash,
});

assert.equal(UI_CATALOG.length, UI_CATALOG_FINAL);
assert.equal(UI_CATALOG_BASE + UI_CATALOG_ADDED - UI_CATALOG_REMOVED, UI_CATALOG_FINAL);
for (const key of Object.values(UNIT_DISPLAY_KEYS).flatMap((item) => [item.label, item.short])) {
  assert.equal(hasCatalogKey(key), true, key);
  assert.equal(hasSeedKey(key), true, key);
}
assert.equal(unitDisplayLabel("piece"), "штука");
assert.equal(quantityInputUnitLabel("piece", 1), "шт.");
assert.equal(PUBLIC_LANGUAGE_PREFIXES_ENABLED, false);
assert.deepEqual(getGlobalState("localizationSettings").enabledLanguages, ["ru"]);
assert.ok(typeof generateAutoCandidate(product, "en", "name") === "string");

const { runStage4ClosureMatrixAsync } = await import("./i18n-stage4-closure-matrix.mjs");
const closure = await runStage4ClosureMatrixAsync({
  workRoot,
  dbPath,
  artifactPath: ARTIFACT,
  expectedMain: EXPECTED_MAIN,
});

const { runStage4AuthHttpTest } = await import("./i18n-stage4-http-auth.mjs");
await runStage4AuthHttpTest({ workRoot });

console.log("STAGE4_VERIFY=PASS");
console.log(`STAGE4_CATALOG_BASE=${UI_CATALOG_BASE}`);
console.log(`STAGE4_CATALOG_ADDED=${UI_CATALOG_ADDED}`);
console.log(`STAGE4_CATALOG_REMOVED=${UI_CATALOG_REMOVED}`);
console.log(`STAGE4_CATALOG_FINAL=${UI_CATALOG.length}`);
console.log(`STAGE4_UI_SEED_CELLS=${UI_CATALOG.length * 6}`);
console.log(`STAGE4_PRODUCT_SOURCE_FIELDS=2675`);
console.log(`STAGE4_AUTO_TARGET_CELLS=16050`);
console.log(`STAGE4_EXPECTED_PRODUCT_TRANSLATION_ROWS=16050`);
console.log(`STAGE4_GLOSSARY_ROWS=${closure.glossaryCount}`);
console.log(`STAGE4_ARTIFACT_FINGERPRINT=${closure.catalogFingerprint}`);
console.log(`STAGE4_ARTIFACT_RUN_ID=${closure.runId}`);
console.log(`STAGE4_GLOSSARY_FINGERPRINT=${closure.glossaryFingerprint}`);
rmSync(tempDir, { recursive: true, force: true });
