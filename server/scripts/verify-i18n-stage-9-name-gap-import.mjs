/**
 * Stage 9 name-gap import on a temp DB copy. Never touches production.
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const snapSrc =
  process.env.CLOVER_STAGE9_DB_SNAP ||
  "/opt/clover/worktrees/build-artifacts/i18n-stage-9/clover-readonly-snap.sqlite";
const artifact = path.join(
  root,
  "server/scripts/fixtures/stage9-product-name-gap/artifact.json"
);

const tmp = mkdtempSync(path.join(tmpdir(), "clover-stage9-import-"));
const dbPath = path.join(tmp, "clover.sqlite");
cpSync(snapSrc, dbPath);
process.env.DB_PATH = dbPath;

const artifactJson = JSON.parse(readFileSync(artifact, "utf8"));
assert.equal(artifactJson.quality, "AUTO_MACHINE_DRAFT");
assert.equal(artifactJson.nativeSpeakerVerified, false);
assert.equal(artifactJson.items.length, 18);

const {
  dryRunStage9ProductNameImport,
  applyStage9ProductNameImport,
} = await import("../src/stage9ProductNameImport.js");
const {
  completenessByLanguage,
  readLocalizationSettings,
  writeLocalizationSettings,
} = await import("../src/localizationStore.js");
const { getProductTranslationRow } = await import("../src/db.js");
const { sourceHash } = await import("../../src/shared/i18n/sourceHash.js");

const beforeSettings = readLocalizationSettings();
const beforeVersion = beforeSettings.catalogVersion;

const dry = dryRunStage9ProductNameImport(artifact);
assert.equal(dry.writes, 0);
assert.equal(dry.fatal, 0);
assert.equal(dry.counts.wouldInsertAUTO, 18);
assert.equal(getProductTranslationRow("723", "en", "name"), null, "dry-run must not write");

const applied = applyStage9ProductNameImport(artifact, "stage9-import-test");
assert.equal(applied.inserted, 18);
assert.equal(applied.catalogVersionBumped, true);
assert.equal(applied.catalogVersion, beforeVersion + 1);
assert.equal(applied.nativeSpeakerVerified, false);

const en723 = getProductTranslationRow("723", "en", "name");
assert.equal(en723.autoValue, "liquid soap Synergetic almond milk 500 ml");
assert.equal(en723.autoSourceHash, sourceHash("Жидкое мыло Синергетик миндальное молочко 500 мл"));
assert.equal(en723.manualValue, "");

const reports = completenessByLanguage();
for (const code of ["en", "uz", "ky", "tg", "zh", "ar"]) {
  assert.equal(reports[code].complete, true, `${code} must be complete after import`);
  assert.equal(reports[code].domains.products.ready, 701);
  assert.equal(reports[code].domains.products.total, 701);
  assert.equal(reports[code].domains.faq.complete, true);
  assert.equal(reports[code].domainCorpusStatus.faq, "absent");
}

const enabled = writeLocalizationSettings(
  { enabledLanguages: ["ru", "en", "uz", "ky", "tg", "zh", "ar"] },
  "stage9-import-test-admin"
);
assert.deepEqual(enabled.settings.enabledLanguages.sort(), [
  "ar",
  "en",
  "ky",
  "ru",
  "tg",
  "uz",
  "zh",
].sort());
assert.equal(enabled.rejected.length, 0);

// Idempotent re-apply: identical cells, no bump.
const versionAfterEnable = readLocalizationSettings().catalogVersion;
const again = applyStage9ProductNameImport(artifact, "stage9-import-test");
assert.equal(again.inserted, 0);
assert.equal(again.identical, 18);
assert.equal(again.catalogVersionBumped, false);
assert.equal(readLocalizationSettings().catalogVersion, versionAfterEnable);

// Changed RU source must be rejected (staleSource) without writes.
const { getGlobalState, setGlobalState } = await import("../src/db.js");
const products = getGlobalState("products", []);
const idx723 = products.findIndex((p) => String(p.id) === "723");
assert.ok(idx723 >= 0);
const originalName723 = products[idx723].name;
products[idx723] = { ...products[idx723], name: `${originalName723} ::CHANGED` };
setGlobalState("products", products);
const dryStale = dryRunStage9ProductNameImport(artifact);
assert.ok(dryStale.fatal >= 1);
assert.equal(dryStale.counts.staleSource, 6, "six locales for product 723 must be stale");
assert.equal(getProductTranslationRow("723", "en", "name").autoValue, "liquid soap Synergetic almond milk 500 ml");
products[idx723] = { ...products[idx723], name: originalName723 };
setGlobalState("products", products);

// MANUAL preserved: plant MANUAL, then conflict path skips.
const { upsertProductTranslationRow } = await import("../src/db.js");
upsertProductTranslationRow({
  ...getProductTranslationRow("724", "en", "name"),
  productId: "724",
  languageCode: "en",
  fieldKey: "name",
  autoValue: "",
  autoSourceHash: "",
  manualValue: "MANUAL cup holder kraft",
  manualSourceHash: en723.autoSourceHash,
  updatedAt: new Date().toISOString(),
  updatedBy: "manual-test",
});
const dryManual = dryRunStage9ProductNameImport(artifact);
assert.equal(dryManual.counts.wouldSkipMANUAL, 1);
const afterManual = applyStage9ProductNameImport(artifact, "stage9-import-test");
assert.equal(afterManual.skippedManual, 1);
assert.equal(getProductTranslationRow("724", "en", "name").manualValue, "MANUAL cup holder kraft");

// Unexpected AUTO conflict refuses apply.
upsertProductTranslationRow({
  ...getProductTranslationRow("725", "en", "name"),
  productId: "725",
  languageCode: "en",
  fieldKey: "name",
  autoValue: "UNEXPECTED DIFFERENT AUTO",
  autoSourceHash: en723.autoSourceHash,
  manualValue: "",
  manualSourceHash: "",
  updatedAt: new Date().toISOString(),
  updatedBy: "conflict-test",
});
const dryConflict = dryRunStage9ProductNameImport(artifact);
assert.ok(dryConflict.fatal >= 1);
assert.equal(dryConflict.counts.unexpectedConflict, 1);
assert.throws(
  () => applyStage9ProductNameImport(artifact, "stage9-import-test"),
  /Fatal Stage 9 name-gap/
);

rmSync(tmp, { recursive: true, force: true });
console.log("verify-i18n-stage-9-name-gap-import: ok");
