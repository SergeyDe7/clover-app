/**
 * Stage 4 closure matrix: artifact, true dry-run, full TEMP apply, rollback.
 * Caller must already set DB_PATH to an isolated temp SQLite and import db.js.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const EMPTY_GLOSSARY_FP = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function expectReject(fn, code) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `expected ${code}`);
  assert.equal(thrown.code, code, `${code} got ${thrown.code}: ${thrown.message}`);
}

function countByLanguage(rows) {
  const counts = { en: 0, uz: 0, ky: 0, tg: 0, "zh-CN": 0, ar: 0 };
  for (const row of rows) {
    if (counts[row.languageCode] !== undefined) counts[row.languageCode] += 1;
  }
  return counts;
}

export async function runStage4ClosureMatrixAsync(ctx) {
  const {
    getGlobalState,
    setGlobalState,
    listProductTranslationRows,
    exportDatabaseSnapshot,
    importDatabaseSnapshot,
  } = await import("../src/db.js");
  const { catalogSourceFingerprint, glossaryFingerprint } = await import("../src/productCatalogFingerprint.js");
  const { loadAutoImportManifest, applyProductAutoImport, artifactFingerprint } = await import(
    "../src/productAutoImport.js"
  );
  const { dryRunProductAutoImportReadOnly } = await import("../src/productAutoImportReadOnly.js");
  const { saveProductManualTranslation, resetProductTranslationToAuto, deleteProductLocalization, listGlossaryEntries, listGlossaryPage, removeGlossaryEntry } = await import(
    "../src/productLocalizationStore.js"
  );
  const { listWorkspacePage } = await import("../src/localizationStore.js");
  const { commitCanonicalProducts } = await import("../src/productSourceCorpus.js");
  const { shouldApplyWorkspaceResponse } = await import("../../src/shared/i18n/translationDrafts.js");
  const { writeProductFieldDraft, readProductFieldDraft } = await import("../../src/shared/i18n/productTranslationDrafts.js");

  const { workRoot, dbPath, artifactPath, expectedMain } = ctx;
  const slimPath = path.join(path.dirname(artifactPath), "source-products.slim.json");
  const slimProducts = JSON.parse(readFileSync(slimPath, "utf8"));
  assert.equal(slimProducts.length, 698);
  const fixture607 = slimProducts.find((item) => String(item.id) === "607");
  assert.ok(fixture607);

  const generatorSrc = readFileSync(path.join(workRoot, "server/scripts/generate-product-auto-artifact.mjs"), "utf8");
  assert.match(generatorSrc, /--source-db/);
  assert.doesNotMatch(generatorSrc, /defaultOutDir = path.resolve\("\/opt\/clover/);
  assert.match(generatorSrc, /readOnly: true/);
  assert.match(generatorSrc, /existingArtifactPreservedOnFailure/);

  const verifierSrc = readFileSync(path.join(workRoot, "server/scripts/verify-i18n-stage-4.mjs"), "utf8");
  assert.doesNotMatch(verifierSrc, /new DatabaseSync\("\/opt\/clover\/clover-app\/server\/data\/clover\.sqlite"/);

  const loaded = loadAutoImportManifest(artifactPath, { baseMainSha: expectedMain });
  assert.equal(loaded.manifest.runId, "stage4-initial-cbd1d0e-6259e882d1bf");
  assert.equal(loaded.manifest.baseMainSha, expectedMain);
  assert.equal(loaded.manifest.quality, "AUTO_MACHINE_DRAFT");
  assert.equal(loaded.manifest.productCount, 698);
  assert.equal(loaded.manifest.sourceCellCount, 2675);
  assert.equal(loaded.manifest.targetCellCount, 16050);
  assert.equal(loaded.items.length, 16050);
  assert.equal(loaded.manifest.glossaryCount, 0);
  assert.equal(loaded.manifest.glossaryFingerprint, EMPTY_GLOSSARY_FP);
  assert.deepEqual(loaded.manifest.languageCounts, {
    en: 2675,
    uz: 2675,
    ky: 2675,
    tg: 2675,
    "zh-CN": 2675,
    ar: 2675,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(loaded.manifest, "items"), false);
  const catalogFingerprint = catalogSourceFingerprint(slimProducts);
  assert.equal(catalogFingerprint, loaded.manifest.wholeCatalogSourceFingerprint);
  assert.equal(glossaryFingerprint([]), EMPTY_GLOSSARY_FP);
  const artifactFp = artifactFingerprint(loaded);

  const joined = loaded.items.map((item) => item.value).join("\n");
  assert.doesNotMatch(joined, /Пmm/);
  const nonEn = loaded.items.filter((item) => item.language !== "en").map((item) => item.value).join("\n");
  assert.doesNotMatch(nonEn, /Suitable/);
  assert.doesNotMatch(nonEn, /pcs per pack/i);
  assert.doesNotMatch(nonEn, /in the box/i);
  assert.doesNotMatch(nonEn, /\bper pack\b/i);

  setGlobalState("products", slimProducts);
  setGlobalState("localizationSettings", {
    enabledLanguages: ["ru"],
    catalogVersion: 2,
    updatedAt: "",
    updatedBy: "",
  });
  for (const id of [...new Set(listProductTranslationRows().map((row) => row.productId))]) {
    deleteProductLocalization(id);
  }
  const leftover = listProductTranslationRows();
  if (leftover.length) {
    console.error("LEFTOVER_PRODUCT_TRANSLATIONS", leftover);
  }
  assert.equal(leftover.length, 0);
  for (const entry of listGlossaryEntries()) {
    removeGlossaryEntry(entry.id, "stage4-test-cleanup");
  }
  assert.equal(listGlossaryEntries().length, 0);

  const dry = dryRunProductAutoImportReadOnly(artifactPath, dbPath);
  assert.equal(dry.writes, 0);
  assert.equal(dry.readOnly, true);
  assert.equal(dry.wouldInsertAUTO, 16050);
  assert.equal(dry.wouldSkipMANUAL, 0);
  assert.equal(dry.staleSource, 0);
  assert.equal(dry.fatal, 0);

  const importer = path.join(workRoot, "server/scripts/import-product-auto-translations.mjs");
  let noMode = "";
  try {
    execFileSync(process.execPath, [importer, "--file", artifactPath], {
      env: { ...process.env, DB_PATH: dbPath },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    noMode = String(error.stderr || error.stdout || error.message);
  }
  assert.match(noMode, /Exactly one of --dry-run or --apply/);

  let prodApply = "";
  try {
    execFileSync(process.execPath, [importer, "--file", artifactPath, "--apply"], {
      env: { ...process.env, DB_PATH: path.join(PRODUCTION_DATA, "clover.sqlite") },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    prodApply = String(error.stderr || error.stdout || error.message);
  }
  assert.match(prodApply, /CLOVER_ALLOW_PRODUCT_AUTO_IMPORT=YES/);

  const dryCli = execFileSync(process.execPath, [importer, "--file", artifactPath, "--dry-run"], {
    env: { ...process.env, DB_PATH: dbPath },
    encoding: "utf8",
  });
  const dryJson = JSON.parse(dryCli);
  assert.equal(dryJson.writes, 0);
  assert.equal(dryJson.wouldInsertAUTO, 16050);

  const versionPreImport = Number(getGlobalState("localizationSettings").catalogVersion);
  const first = applyProductAutoImport(loaded, "stage4-temp-import");
  assert.equal(first.inserted, 16050);
  assert.equal(first.updated, 0);
  assert.equal(first.failed, 0);
  assert.equal(first.skippedManual, 0);
  assert.equal(listProductTranslationRows().length, 16050);
  assert.deepEqual(countByLanguage(listProductTranslationRows()), {
    en: 2675,
    uz: 2675,
    ky: 2675,
    tg: 2675,
    "zh-CN": 2675,
    ar: 2675,
  });
  assert.equal(listProductTranslationRows().every((row) => !String(row.manualValue || "").trim()), true);
  assert.equal(listProductTranslationRows().every((row) => row.autoRunId === loaded.manifest.runId), true);
  assert.equal(Number(getGlobalState("localizationSettings").catalogVersion), versionPreImport + 1);
  assert.deepEqual(getGlobalState("localizationSettings").enabledLanguages, ["ru"]);

  const page = listWorkspacePage({ view: "products", language: "en", limit: 100, offset: 0 });
  assert.equal(page.limit, 100);
  assert.equal(page.rows.length, 100);
  assert.equal(page.hasMore, true);
  assert.equal(page.total, 2675);
  assert.equal(Object.keys(page.rows[0].languages || {}).join(), "en");
  const searched = listWorkspacePage({ view: "products", language: "en", query: String(fixture607.name).slice(0, 12), limit: 50 });
  assert.ok(searched.total >= 1);
  const untranslated = listWorkspacePage({ view: "untranslated", language: "en", limit: 200 });
  assert.equal(
    untranslated.rows.some((row) => row.kind === "product" && !row.languages?.en?.stale && ["AUTO", "MANUAL"].includes(row.languages?.en?.state)),
    false
  );
  const glossaryPage = listGlossaryPage({ language: "en", limit: 100 });
  assert.equal(glossaryPage.limit, 100);
  assert.equal(glossaryPage.total, 0);

  const versionPreSecond = Number(getGlobalState("localizationSettings").catalogVersion);
  const second = applyProductAutoImport(loaded, "stage4-temp-import");
  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.identical, 16050);
  assert.equal(second.failed, 0);
  assert.equal(listProductTranslationRows().length, 16050);
  assert.equal(Number(getGlobalState("localizationSettings").catalogVersion), versionPreSecond);
  assert.equal(listProductTranslationRows().every((row) => row.autoRunId === loaded.manifest.runId), true);

  const sample = loaded.items.find((item) => item.language === "en" && item.field === "name");
  deleteProductLocalization(sample.productId);
  const remaining = listProductTranslationRows().length;
  assert.equal(remaining < 16050, true);
  const versionPreResume = Number(getGlobalState("localizationSettings").catalogVersion);
  const resumed = applyProductAutoImport(loaded, "stage4-temp-import");
  assert.equal(listProductTranslationRows().length, 16050);
  assert.ok(resumed.inserted > 0);
  assert.equal(Number(getGlobalState("localizationSettings").catalogVersion), versionPreResume + 1);

  const autoA = sample.value;
  const sourceH = sample.sourceHash;
  const manualM = `${autoA} MANUAL`;
  const savedManual = saveProductManualTranslation(sample.productId, "en", sample.field, manualM, "admin", sourceH);
  assert.equal(savedManual.field.state, "MANUAL");
  const versionPreConflict = Number(getGlobalState("localizationSettings").catalogVersion);
  const conflicted = applyProductAutoImport(loaded, "stage4-temp-import");
  assert.ok(conflicted.skippedManual >= 1);
  const afterConflict = listProductTranslationRows().find(
    (row) => row.productId === sample.productId && row.languageCode === "en" && row.fieldKey === sample.field
  );
  assert.equal(afterConflict.manualValue, manualM);
  assert.equal(afterConflict.autoValue, autoA);
  assert.equal(afterConflict.autoRunId, loaded.manifest.runId);
  assert.equal(Number(getGlobalState("localizationSettings").catalogVersion), versionPreConflict);
  const restored = resetProductTranslationToAuto(sample.productId, "en", sample.field, "admin", sourceH);
  assert.equal(restored.field.value, autoA);
  assert.equal(restored.field.state, "AUTO");

  const snapshot = exportDatabaseSnapshot();
  assert.equal(snapshot.version, 5);
  const restoredRow = snapshot.productTranslations.find(
    (row) =>
      String(row.product_id || row.productId) === String(sample.productId) &&
      String(row.language_code || row.languageCode) === "en" &&
      String(row.field_key || row.fieldKey) === sample.field
  );
  assert.equal(String(restoredRow.auto_run_id || restoredRow.autoRunId), loaded.manifest.runId);
  importDatabaseSnapshot(structuredClone(snapshot));
  assert.equal(
    listProductTranslationRows().find(
      (row) => row.productId === sample.productId && row.languageCode === "en" && row.fieldKey === sample.field
    ).autoRunId,
    loaded.manifest.runId
  );
  const v4 = structuredClone(snapshot);
  delete v4.productTranslations;
  delete v4.translationGlossary;
  v4.version = 4;
  importDatabaseSnapshot(v4);
  assert.equal(listProductTranslationRows().length, 0);
  importDatabaseSnapshot(structuredClone(snapshot));
  assert.equal(listProductTranslationRows().length, 16050);

  const fatalDir = mkdtempSync(path.join(tmpdir(), "clover-stage4-fatal-"));
  try {
    const pmmItem = loaded.items.find((item) => item.value.includes("ПММ")) || loaded.items[loaded.items.length - 1];
    const numericItem = loaded.items.find((item) => /\d/.test(item.value)) || loaded.items[loaded.items.length - 1];
    const cases = [
      {
        mutate: (items) => {
          const idx = items.findIndex((item) => item.productId === numericItem.productId && item.language === numericItem.language && item.field === numericItem.field);
          items[idx].value = items[idx].value.replace(/\d+/, (n) => String(Number(n) + 7));
        },
        code: "ARTIFACT_VALIDATION_FAILED",
      },
      {
        mutate: (items) => {
          items[items.length - 1].sourceHash = "a".repeat(64);
        },
        code: "ARTIFACT_VALIDATION_FAILED",
      },
      { mutate: (items) => { items.push({ ...items[items.length - 1] }); }, code: "ARTIFACT_COVERAGE_MISMATCH" },
      { mutate: (items) => { items.pop(); }, code: "ARTIFACT_COVERAGE_MISMATCH" },
      {
        mutate: (items) => {
          const idx = items.findIndex((item) => item.productId === pmmItem.productId && item.language === pmmItem.language && item.field === pmmItem.field);
          items[idx].value = items[idx].value.replace(/ПММ/g, "PMM");
        },
        code: "ARTIFACT_VALIDATION_FAILED",
      },
    ];
    const preRows = listProductTranslationRows().length;
    const preVersion = Number(getGlobalState("localizationSettings").catalogVersion);
    for (const testCase of cases) {
      const clone = {
        ...loaded,
        items: loaded.items.map((item) => ({ ...item })),
        manifest: { ...loaded.manifest },
      };
      testCase.mutate(clone.items);
      expectReject(() => applyProductAutoImport(clone, "fatal"), testCase.code);
      assert.equal(listProductTranslationRows().length, preRows, testCase.code);
      assert.equal(Number(getGlobalState("localizationSettings").catalogVersion), preVersion, testCase.code);
    }
  } finally {
    rmSync(fatalDir, { recursive: true, force: true });
  }

  const mismatchLoaded = {
    ...loaded,
    manifest: { ...loaded.manifest, wholeCatalogSourceFingerprint: "0".repeat(64) },
  };
  expectReject(() => applyProductAutoImport(mismatchLoaded, "test"), "CATALOG_SOURCE_MISMATCH");

  const versionBeforeDelete = Number(getGlobalState("localizationSettings").catalogVersion);
  const removed = slimProducts.filter((item) => String(item.id) !== String(sample.productId));
  commitCanonicalProducts(removed, "delete-product");
  assert.equal(Number(getGlobalState("localizationSettings").catalogVersion), versionBeforeDelete + 1);
  commitCanonicalProducts(slimProducts, "restore-catalog");

  const after607 = slimProducts.find((item) => String(item.id) === "607");
  assert.equal(after607.id, fixture607.id);
  assert.equal(after607.name, fixture607.name);
  assert.equal(after607.oneCId || "", fixture607.oneCId || "");
  assert.equal(after607.oneCCode || "", fixture607.oneCCode || "");

  const cartSrc = readFileSync(path.join(workRoot, "src/screens/storefront/cartStorage.js"), "utf8");
  assert.match(cartSrc, /productId::\$\{unit\}|`\$\{productId\}::\$\{unit\}`/);
  const orderSrc = readFileSync(path.join(workRoot, "src/config/orderConfig.js"), "utf8");
  assert.match(orderSrc, /productId/);
  assert.doesNotMatch(orderSrc, /unitLabel/);

  const serverSrc = readFileSync(path.join(workRoot, "server/src/server.js"), "utf8");
  assert.doesNotMatch(serverSrc, /preferred_language/);
  assert.doesNotMatch(serverSrc, /hreflang/);
  assert.doesNotMatch(serverSrc, /LanguageSelector/);

  const editorSrc = readFileSync(path.join(workRoot, "src/screens/manager/ProductEditor.jsx"), "utf8");
  assert.match(editorSrc, /ProductTranslationEditor/);
  assert.match(editorSrc, /staffRole === ["']admin["']/);

  const languagesSrc = readFileSync(path.join(workRoot, "src/screens/manager/ManagerLanguages.jsx"), "utf8");
  assert.match(languagesSrc, /glossaryFormLanguage/);
  assert.match(languagesSrc, /shouldDisableTargetLanguageSelect/);
  assert.match(languagesSrc, /disabled=\{languageSelectDisabled\}/);
  assert.match(languagesSrc, /shouldApplyWorkspaceResponse/);

  let drafts = writeProductFieldDraft({}, "en", "name", "dirty-draft");
  assert.equal(readProductFieldDraft(drafts, "en", "name", "fallback"), "dirty-draft");
  assert.equal(
    shouldApplyWorkspaceResponse({
      requestGeneration: 4,
      currentGeneration: 4,
      requestLanguage: "en",
      currentLanguage: "en",
      requestProductId: String(sample.productId),
      currentProductId: String(sample.productId),
    }),
    true
  );

  return {
    glossaryCount: listGlossaryEntries().length,
    catalogFingerprint,
    runId: loaded.manifest.runId,
    glossaryFingerprint: loaded.manifest.glossaryFingerprint,
    artifactFingerprint: artifactFp,
    firstInserted: first.inserted,
    secondIdentical: second.identical,
  };
}
