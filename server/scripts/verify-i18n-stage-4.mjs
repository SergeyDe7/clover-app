/**
 * Stage 4 Task 1 gate: product translations, glossary, UOM display, AUTO import.
 * Uses a temporary SQLite database only.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const workRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
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

const tempDir = mkdtempSync(path.join(tmpdir(), "clover-stage4-"));
mkdirSync(tempDir, { recursive: true });
const dbPath = path.join(tempDir, "clover.sqlite");
rejectUnsafePath(dbPath);
process.env.DB_PATH = dbPath;

const opened = path.resolve(process.env.DB_PATH);
assert.equal(opened, path.resolve(dbPath));
assert.ok(!opened.startsWith(PRODUCTION_DATA));
assert.ok(!opened.startsWith(WORKTREE_DATA));
console.log("TEST_DB_ISOLATED=YES");
console.log(`TEST_DB_PATH=${opened}`);

const {
  getDatabasePath,
  getGlobalState,
  setGlobalState,
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  runInTransaction,
} = await import("../src/db.js");
assert.equal(path.resolve(getDatabasePath()), opened);

const { sourceHash } = await import("../../src/shared/i18n/sourceHash.js");
const { UI_CATALOG, hasCatalogKey } = await import("../../src/shared/i18n/uiCatalog.js");
const { hasSeedKey, getSeedTranslation } = await import("../src/i18n/uiTranslationSeed.js");
const { UNIT_DISPLAY_KEYS, unitDisplayLabel } = await import("../../src/shared/i18n/unitDisplay.js");
const { quantityInputUnitLabel } = await import("../../src/shared/appHelpers.js");
const { PUBLIC_LANGUAGE_PREFIXES_ENABLED } = await import("../../src/shared/i18n/languageResolver.js");
const { applyGlossaryPhrases } = await import("../src/productLocalizationSemantics.js");
const {
  saveProductManualTranslation,
  resetProductTranslationToAuto,
  upsertProductAutoTranslation,
  importProductAutoArtifact,
  getProductTranslationWorkspace,
  buildProductWorkspaceRows,
  productCompletenessItems,
  saveGlossaryEntry,
  listGlossaryEntries,
  removeGlossaryEntry,
  deleteProductLocalization,
  projectLocalizedProductDisplay,
  generateAutoCandidate,
} = await import("../src/productLocalizationStore.js");
const { completenessByLanguage } = await import("../src/localizationStore.js");
const { listWorkspaceRows } = await import("../src/localizationStore.js");

const product = {
  id: 722,
  name: "Стакан 200 мл «Мега» (50), код CL-722",
  code: "CL-722",
  oneCId: "1C-722",
  oneCCode: "CL-722",
  oneCName: "Стакан 200",
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

expectReject(() => saveProductManualTranslation(722, "ZH", "name", "Cup"), "UNSUPPORTED_LOCALE");
expectReject(() => saveProductManualTranslation(722, "zh_cn", "name", "Cup"), "UNSUPPORTED_LOCALE");
expectReject(() => saveProductManualTranslation(722, "zh_CN", "name", "Cup"), "UNSUPPORTED_LOCALE");
expectReject(() => saveProductManualTranslation(722, " en ", "name", "Cup"), "UNSUPPORTED_LOCALE");
expectReject(() => saveProductManualTranslation(722, "ar-SA", "name", "Cup"), "UNSUPPORTED_LOCALE");
expectReject(() => saveProductManualTranslation(9999, "en", "name", "Cup"), "UNKNOWN_PRODUCT");
expectReject(() => saveProductManualTranslation(722, "en", "price", "Cup"), "UNSUPPORTED_FIELD");

saveGlossaryEntry({
  sourceRu: "стакан",
  language: "en",
  targetValue: "cup",
  protected: true,
});
saveGlossaryEntry({
  sourceRu: "стакан 200 мл",
  language: "en",
  targetValue: "200 ml cup",
  context: "disposable",
  protected: true,
});

const glossary = listGlossaryEntries({ language: "en" });
assert.equal(glossary.length, 2);
assert.ok(glossary[0].sourceRu.length >= glossary[1].sourceRu.length);

const applied = applyGlossaryPhrases(product.name, glossary.map((row) => ({
  sourceRu: row.sourceRu,
  targetValue: row.targetValue,
  context: row.context,
})));
assert.match(applied, /200 ml cup/i);
assert.ok(!applied.toLowerCase().includes("cup 200"));

expectReject(
  () => saveProductManualTranslation(722, "en", "name", "Plastic tumbler"),
  "NUMERIC_MISMATCH"
);

const autoEn = "200 ml cup «Мега» (50), код CL-722";
const imported = upsertProductAutoTranslation({
  productId: "722",
  language: "en",
  field: "name",
  value: autoEn,
  sourceHash: sourceNameHash,
});
assert.equal(imported.changed, true);

const afterAuto = getProductTranslationWorkspace(722);
assert.equal(afterAuto.fields.name.languages.en.state, "AUTO");
assert.equal(afterAuto.fields.name.languages.en.value, autoEn);
assert.equal(afterAuto.fields.name.languages.en.autoValue, autoEn);

const manualEn = "Mega 200 ml cup «Мега» (50), код CL-722";
const savedManual = saveProductManualTranslation(722, "en", "name", manualEn, "admin@clover.ru");
assert.equal(savedManual.changed, true);
assert.equal(savedManual.field.state, "MANUAL");
assert.equal(savedManual.field.autoValue, autoEn);

const blocked = upsertProductAutoTranslation({
  productId: "722",
  language: "en",
  field: "name",
  value: "200 ml cup «Мега» (50), код CL-722",
  sourceHash: sourceNameHash,
});
assert.equal(blocked.skipped, "MANUAL_PROTECTED");

const zhAuto = upsertProductAutoTranslation({
  productId: 722,
  language: "zh-CN",
  field: "name",
  value: "200 ml cup «Мега» (50), код CL-722",
  sourceHash: sourceNameHash,
});
assert.equal(zhAuto.changed, true);
const zhWorkspace = getProductTranslationWorkspace("722");
assert.equal(zhWorkspace.fields.name.languages.zh.state, "AUTO");

const reset = resetProductTranslationToAuto(722, "en", "name", "admin@clover.ru");
assert.equal(reset.changed, true);
assert.equal(reset.field.state, "AUTO");
assert.equal(reset.field.value, autoEn);
assert.equal(reset.field.manualValue, "");

const staleProduct = {
  ...product,
  name: "Стакан 300 мл «Мега» (50), код CL-722",
};
setGlobalState("products", [staleProduct]);
const staleWorkspace = getProductTranslationWorkspace(722);
assert.equal(staleWorkspace.fields.name.languages.en.state, "STALE");
assert.equal(staleWorkspace.fields.name.languages.en.stale, true);
assert.equal(staleWorkspace.fields.name.languages.en.value, autoEn);

saveProductManualTranslation(
  722,
  "en",
  "name",
  "Mega 300 ml cup «Мега» (50), код CL-722",
  "admin@clover.ru"
);
const staleManual = getProductTranslationWorkspace(722).fields.name.languages.en;
assert.equal(staleManual.state, "MANUAL");
assert.equal(staleManual.stale, false);

setGlobalState("products", [{
  ...staleProduct,
  name: "Стакан 400 мл «Мега» (50), код CL-722",
}]);
const staleManualKeep = getProductTranslationWorkspace(722).fields.name.languages.en;
assert.equal(staleManualKeep.state, "STALE");
assert.equal(staleManualKeep.stale, true);
assert.match(staleManualKeep.value, /300 ml cup «Мега»/);

const resetStale = resetProductTranslationToAuto(722, "en", "name");
assert.equal(resetStale.field.state, "STALE");
assert.equal(resetStale.field.value, autoEn);

setGlobalState("products", [product]);
const restored = getProductTranslationWorkspace(722).fields.name.languages.en;
assert.equal(restored.state, "AUTO");

const artifact = {
  format: "clover-product-auto-import",
  formatVersion: 1,
  runId: "stage4-test",
  generatedAt: new Date().toISOString(),
  items: [
    {
      productId: "722",
      language: "uz",
      field: "name",
      value: "200 ml cup «Мега» (50), код CL-722",
      sourceHash: sourceNameHash,
    },
    {
      productId: "722",
      language: "en",
      field: "description",
      value: "200 ml cup for drinks",
      sourceHash: sourceHash(product.storefrontDetails.description),
    },
  ],
};
const importResult = importProductAutoArtifact(artifact);
assert.equal(importResult.imported, 2);

const projected = projectLocalizedProductDisplay(product, "en", ["ru", "en"]);
assert.equal(projected.name, autoEn);
assert.equal(projected.storefrontDetails.description, "200 ml cup for drinks");
assert.equal(projected.code, product.code);
assert.equal(projected.oneCId, product.oneCId);
assert.equal(projected.pricePiece, product.pricePiece);
assert.deepEqual(projected.saleUnits, product.saleUnits);

const ruOnly = projectLocalizedProductDisplay(product, "en", ["ru"]);
assert.equal(ruOnly.name, product.name);

const rows = buildProductWorkspaceRows();
assert.ok(rows.some((row) => row.id === "product:722:name"));
const productView = listWorkspaceRows({ view: "products", language: "en" });
assert.ok(productView.some((row) => row.kind === "product" && row.fieldKey === "name"));
const untranslated = listWorkspaceRows({ view: "untranslated", language: "ky" });
assert.ok(untranslated.some((row) => row.kind === "product"));

const items = productCompletenessItems();
assert.ok(items.some((item) => item.domain === "products" && item.language === "en"));
const completeness = completenessByLanguage();
assert.equal(completeness.ru.complete, true);
assert.equal(completeness.en.domains.products.total > 0, true);

const snapshot = exportDatabaseSnapshot();
assert.ok(Array.isArray(snapshot.productTranslations));
assert.ok(snapshot.productTranslations.length > 0);
assert.ok(Array.isArray(snapshot.translationGlossary));
assert.ok(snapshot.translationGlossary.length > 0);
assert.ok(!Object.keys(snapshot.productTranslations[0]).some((key) =>
  ["price", "cost", "markup", "saleUnits", "oneCId"].includes(key)
));

const snapshotCopy = structuredClone(snapshot);
importDatabaseSnapshot(snapshotCopy);
assert.equal(getProductTranslationWorkspace(722).fields.name.languages.en.value, autoEn);

runInTransaction(() => {
  setGlobalState("products", []);
  deleteProductLocalization(722);
});
const gone = buildProductWorkspaceRows();
assert.equal(gone.length, 0);
setGlobalState("products", [product]);

removeGlossaryEntry(glossary[0].id);
assert.equal(listGlossaryEntries({ language: "en" }).length, 1);

for (const key of Object.values(UNIT_DISPLAY_KEYS).flatMap((item) => [item.label, item.short])) {
  assert.equal(hasCatalogKey(key), true, key);
  assert.equal(hasSeedKey(key), true, key);
  assert.ok(getSeedTranslation(key, "en"));
}
assert.equal(hasCatalogKey("admin.languages.view.products"), true);
assert.equal(UI_CATALOG.length >= 1890, true);
assert.equal(unitDisplayLabel("piece"), "штука");
assert.equal(quantityInputUnitLabel("piece", 1), "шт.");
assert.equal(PUBLIC_LANGUAGE_PREFIXES_ENABLED, false);
assert.deepEqual(getGlobalState("localizationSettings").enabledLanguages, ["ru"]);

const candidate = generateAutoCandidate(product, "en", "name");
assert.ok(typeof candidate === "string");

const serverSrc = readFileSync(path.join(workRoot, "server/src/server.js"), "utf8");
assert.match(serverSrc, /roleRequired\("admin"\)[\s\S]*\/api\/admin\/product-translations\/:productId/);
assert.match(serverSrc, /\/api\/admin\/product-translations\/:productId\/:language\/:field/);
assert.match(serverSrc, /\/api\/admin\/glossary/);
assert.match(serverSrc, /deleteProductLocalization/);
assert.doesNotMatch(serverSrc, /preferred_language/);
assert.doesNotMatch(
  readFileSync(path.join(workRoot, "src/shared/i18n/languageResolver.js"), "utf8"),
  /LanguageSelector/
);

const schemaSrc = readFileSync(path.join(workRoot, "server/src/db.js"), "utf8");
assert.match(schemaSrc, /CREATE TABLE IF NOT EXISTS product_translations/);
assert.match(schemaSrc, /CREATE TABLE IF NOT EXISTS translation_glossary/);
assert.doesNotMatch(schemaSrc, /product_translations[\s\S]{0,800}oneCId/);

const uiSrc = readFileSync(path.join(workRoot, "src/screens/manager/ManagerLanguages.jsx"), "utf8");
assert.match(uiSrc, /view === "glossary"/);
assert.match(uiSrc, /kind === "product"/);
assert.match(
  readFileSync(path.join(workRoot, "src/screens/manager/ProductEditor.jsx"), "utf8"),
  /ProductTranslationEditor/
);

try {
  execFileSync(
    process.execPath,
    [path.join(workRoot, "server/scripts/import-product-auto-translations.mjs"), "/tmp/nope.json"],
    {
      env: { ...process.env, DB_PATH: path.join(PRODUCTION_DATA, "clover.sqlite") },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  assert.fail("import script must refuse production DB");
} catch (error) {
  assert.ok(String(error.stderr || error.stdout || error.message).includes("Refusing production"));
}

rmSync(tempDir, { recursive: true, force: true });
console.log("STAGE4_VERIFY=PASS");
console.log(`STAGE4_CATALOG=${UI_CATALOG.length}`);
