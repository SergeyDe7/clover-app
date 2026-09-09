import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const workRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function rejectProductionPath(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
}

if (process.env.DB_PATH) rejectProductionPath(process.env.DB_PATH);

const tempDir = mkdtempSync(path.join(tmpdir(), "clover-stage31-persist-"));
const dbPath = path.join(tempDir, "clover.sqlite");
rejectProductionPath(dbPath);
process.env.DB_PATH = dbPath;

function sourceHash(text) {
  return createHash("sha256")
    .update(String(text).normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(), "utf8")
    .digest("hex");
}

const legacy = new DatabaseSync(dbPath);
legacy.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);
legacy.prepare(
  `INSERT INTO users(id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`
).run("sentinel-user", "sentinel@clover.ru", "x", "admin", "2026-01-01T00:00:00.000Z");
legacy.prepare(
  `INSERT INTO app_state(key, value_json, updated_at) VALUES (?, ?, ?)`
).run(
  "localizationSettings",
  JSON.stringify({ enabledLanguages: ["ru"], catalogVersion: 0, updatedAt: "", updatedBy: "" }),
  "2026-01-01T00:00:00.000Z"
);
legacy.prepare(
  `INSERT INTO app_state(key, value_json, updated_at) VALUES (?, ?, ?)`
).run("stage31Sentinel", JSON.stringify({ mark: "keep-me" }), "2026-01-01T00:00:00.000Z");
legacy.close();

const dbMod = await import(pathToFileURL(path.join(workRoot, "server/src/db.js")).href);
assert.equal(path.resolve(dbMod.getDatabasePath()), path.resolve(dbPath));
rejectProductionPath(dbMod.getDatabasePath());

const integrity = dbMod.db.prepare("PRAGMA integrity_check").get();
assert.equal(integrity.integrity_check, "ok");
const fk = dbMod.db.prepare("PRAGMA foreign_key_check").all();
assert.deepEqual(fk, []);

const sentinelUser = dbMod.db.prepare("SELECT email FROM users WHERE id = ?").get("sentinel-user");
assert.equal(sentinelUser.email, "sentinel@clover.ru");
const sentinelState = dbMod.db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("stage31Sentinel");
assert.equal(JSON.parse(sentinelState.value_json).mark, "keep-me");

const tables = new Set(dbMod.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
assert.equal(tables.has("translation_entries"), true);
assert.equal(tables.has("translation_values"), true);

let ruRejected = false;
try {
  dbMod.db.prepare(
    `INSERT INTO translation_values(entry_id, language_code, value, state, source_hash, updated_at, updated_by)
     VALUES ('x', 'ru', 'Привет', 'AUTO', 'abc', 'now', '')`
  ).run();
} catch {
  ruRejected = true;
}
assert.equal(ruRejected, true, "RU language_code must be rejected");

const storeMod = await import(pathToFileURL(path.join(workRoot, "server/src/localizationStore.js")).href);
const { UI_CATALOG } = await import(pathToFileURL(path.join(workRoot, "src/shared/i18n/uiCatalog.js")).href);
const { translationStoreToDictionaries } = await import(
  pathToFileURL(path.join(workRoot, "src/shared/i18n/translationStoreProjection.js")).href
);
const { createLocalizationRuntime } = await import(
  pathToFileURL(path.join(workRoot, "src/shared/i18n/translationRuntime.js")).href
);
const { TARGET_INTERNAL_LOCALES } = await import(
  pathToFileURL(path.join(workRoot, "src/shared/i18n/languageRegistry.js")).href
);

const first = storeMod.initializeLocalizationCatalog();
assert.equal(first.dirty, true);
const store1 = storeMod.readTranslationStore();
const n = UI_CATALOG.length;
assert.equal(store1.entries.length, n);
assert.equal(store1.values.length, n * 6);
assert.equal(store1.values.every((v) => v.state === "AUTO"), true);
assert.equal(store1.values.filter((v) => v.languageCode === "ru").length, 0);
assert.equal(store1.values.some((v) => v.languageCode === "zh-CN"), true);
assert.equal(store1.values.some((v) => v.languageCode === "zh"), false);

const settings1 = storeMod.readLocalizationSettings();
assert.ok(settings1.catalogVersion >= 1);
const versionAfterFirst = settings1.catalogVersion;
const freshCompleteness = storeMod.completenessByLanguage(store1);
for (const code of ["en", "uz", "ky", "tg", "zh", "ar"]) {
  const report = freshCompleteness[code];
  assert.equal(report.domains.interface.complete, true, `${code} interface`);
  assert.equal(report.domains.checkout.complete, true, `${code} checkout`);
  assert.equal(report.domains.products.complete, false, `${code} products`);
  assert.equal(report.domains.categories.complete, false, `${code} categories`);
  assert.equal(report.domains.pages.complete, false, `${code} pages`);
  assert.equal(report.domains.faq.complete, false, `${code} faq`);
  assert.equal(report.domains.seo.complete, false, `${code} seo`);
  assert.equal(report.complete, false, `${code} overall`);
}
assert.equal(freshCompleteness.ru.complete, true);
const ids = store1.entries.map((e) => e.id).sort();
const stamps = store1.entries.map((e) => e.updatedAt).join("|");

const second = storeMod.initializeLocalizationCatalog();
assert.equal(second.dirty, false);
const store2 = storeMod.readTranslationStore();
assert.deepEqual(store2.entries.map((e) => e.id).sort(), ids);
assert.equal(store2.entries.map((e) => e.updatedAt).join("|"), stamps);
assert.equal(storeMod.readLocalizationSettings().catalogVersion, versionAfterFirst);

const uiEntry = store2.entries.find((e) => e.fieldKey === "shared.modal.confirm");
assert.ok(uiEntry);
const beforeManual = storeMod.readLocalizationSettings().catalogVersion;
const saved = storeMod.saveManualTranslation(uiEntry.id, "en", "Confirm now", "admin@clover.ru");
assert.equal(saved.changed, true);
assert.equal(saved.value.state, "MANUAL");
assert.equal(saved.value.value, "Confirm now");
assert.equal(saved.value.sourceHash, uiEntry.sourceHash);
assert.equal(saved.value.updatedBy, "admin@clover.ru");
const afterManual = storeMod.readLocalizationSettings().catalogVersion;
assert.equal(afterManual, beforeManual + 1);
const sameManual = storeMod.saveManualTranslation(uiEntry.id, "en", "Confirm now", "admin@clover.ru");
assert.equal(sameManual.changed, false);
assert.equal(storeMod.readLocalizationSettings().catalogVersion, afterManual);

storeMod.initializeLocalizationCatalog();
const afterRestart = storeMod.readTranslationStore().values.find(
  (v) => v.entryId === uiEntry.id && v.languageCode === "en"
);
assert.equal(afterRestart.value, "Confirm now");
assert.equal(afterRestart.state, "MANUAL");

const staleHash = sourceHash("CHANGED RU");
dbMod.db.prepare("UPDATE translation_entries SET source_ru = ?, source_hash = ? WHERE id = ?").run(
  "CHANGED RU",
  staleHash,
  uiEntry.id
);
const staleStore = storeMod.readTranslationStore();
const staleEntry = staleStore.entries.find((e) => e.id === uiEntry.id);
const staleValue = staleStore.values.find((v) => v.entryId === uiEntry.id && v.languageCode === "en");
assert.equal(staleValue.value, "Confirm now");
assert.equal(staleValue.state, "MANUAL");
assert.notEqual(staleValue.sourceHash, staleEntry.sourceHash);
const rows = storeMod.listWorkspaceRows({ view: "interface", language: "en" });
const staleRow = rows.find((r) => r.id === uiEntry.id);
assert.equal(staleRow.languages.en.stale, true);
const completeness = storeMod.completenessByLanguage(staleStore);
assert.equal(completeness.en.complete, false);

const resave = storeMod.saveManualTranslation(uiEntry.id, "en", "Confirm now", "admin@clover.ru");
assert.equal(resave.changed, true);
assert.equal(resave.value.sourceHash, staleHash);
assert.equal(storeMod.listWorkspaceRows({ view: "interface", language: "zh" })[0].languages.zh !== undefined, true);

dbMod.db.prepare("UPDATE translation_entries SET source_ru = ?, source_hash = ? WHERE id = ?").run(
  "Подтвердить",
  sourceHash("Подтвердить"),
  uiEntry.id
);
storeMod.initializeLocalizationCatalog();
const autoEntry = storeMod.readTranslationStore().entries.find((e) => e.fieldKey === "shared.modal.cancel");
const autoBefore = storeMod.readTranslationStore().values.find((v) => v.entryId === autoEntry.id && v.languageCode === "en");
dbMod.db.prepare("UPDATE translation_entries SET source_hash = ? WHERE id = ?").run("deadbeef", autoEntry.id);
storeMod.initializeLocalizationCatalog();
const autoAfter = storeMod.readTranslationStore().values.find((v) => v.entryId === autoEntry.id && v.languageCode === "en");
assert.equal(autoAfter.state, "AUTO");
assert.notEqual(autoAfter.sourceHash, "stale-should-refresh-or-current");

const resetBefore = storeMod.readLocalizationSettings().catalogVersion;
storeMod.saveManualTranslation(autoEntry.id, "uz", "Qo'lda", "admin@clover.ru");
const reset = storeMod.resetTranslationToAuto(autoEntry.id, "uz", "admin@clover.ru");
assert.equal(reset.changed, true);
assert.equal(reset.value.state, "AUTO");
assert.equal(reset.value.sourceHash, storeMod.readTranslationStore().entries.find((e) => e.id === autoEntry.id).sourceHash);
assert.ok(storeMod.readLocalizationSettings().catalogVersion > resetBefore);

const orphanId = randomUUID();
dbMod.insertTranslationEntryRow({
  id: orphanId,
  namespace: "ui",
  entityType: "",
  entityId: "",
  fieldKey: "orphan.removed.key",
  sourceRu: "Сирота",
  sourceHash: sourceHash("Сирота"),
  critical: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
dbMod.upsertTranslationValueRow({
  entryId: orphanId,
  languageCode: "en",
  value: "Orphan",
  state: "MANUAL",
  sourceHash: sourceHash("Сирота"),
  updatedAt: new Date().toISOString(),
  updatedBy: "admin@clover.ru",
});
const withOrphan = storeMod.readTranslationStore();
assert.equal(withOrphan.entries.some((e) => e.id === orphanId), true);
const workspace = storeMod.listWorkspaceRows({ view: "interface", language: "en" });
assert.equal(workspace.some((r) => r.id === orphanId), false);
const dicts = translationStoreToDictionaries(withOrphan);
assert.equal(Object.hasOwn(dicts.en, "orphan.removed.key"), false);
const reports = storeMod.completenessByLanguage(withOrphan);
assert.equal(reports.en.domains.interface.total > 0, true);

const versionBeforeReject = storeMod.readLocalizationSettings().catalogVersion;
for (const bad of ["ru", "fr", "unknown", ""]) {
  let failed = false;
  try {
    storeMod.saveManualTranslation(uiEntry.id, bad, "X", "admin");
  } catch {
    failed = true;
  }
  assert.equal(failed, true, `must reject ${bad}`);
}
let emptyFailed = false;
try {
  storeMod.saveManualTranslation(uiEntry.id, "en", "   ", "admin");
} catch {
  emptyFailed = true;
}
assert.equal(emptyFailed, true);
let unknownFailed = false;
try {
  storeMod.saveManualTranslation("missing-entry", "en", "Hello", "admin");
} catch {
  unknownFailed = true;
}
assert.equal(unknownFailed, true);
let mismatchFailed = false;
try {
  storeMod.saveManualTranslation(uiEntry.id, "en", "Hello {name}", "admin");
} catch {
  mismatchFailed = true;
}
assert.equal(mismatchFailed, true);
assert.equal(storeMod.readLocalizationSettings().catalogVersion, versionBeforeReject);

const enable = storeMod.writeLocalizationSettings({ enabledLanguages: ["ru", "en"] }, "admin");
assert.equal(enable.settings.enabledLanguages.includes("en"), false);
assert.equal(enable.rejected.includes("en"), true);
assert.equal(enable.settings.catalogVersion, versionBeforeReject);
const sameSettings = storeMod.writeLocalizationSettings({ enabledLanguages: ["ru"] }, "admin");
assert.equal(sameSettings.settings.catalogVersion, versionBeforeReject);

assert.equal(storeMod.completenessByLanguage().ru.complete, true);
const unsupported = (await import(pathToFileURL(path.join(workRoot, "src/shared/i18n/localizationSettings.js")).href))
  .computeLanguageCompleteness("fr", [{ domain: "interface", language: "ru", critical: true, state: "AUTO", stale: false, value: "x" }]);
assert.equal(unsupported.complete, false);

const snapshot = storeMod.readTranslationStore();
const runtimeDicts = translationStoreToDictionaries(snapshot);
for (const locale of [...TARGET_INTERNAL_LOCALES, "zh"]) {
  const runtime = createLocalizationRuntime({
    locale,
    allowForeignRuntime: true,
    dictionaries: runtimeDicts,
  });
  for (const entry of UI_CATALOG) {
    const text = runtime.t(entry.key);
    assert.ok(String(text).trim(), `${locale} ${entry.key} empty`);
    assert.notEqual(text, entry.key);
    assert.doesNotMatch(text, /\{[a-zA-Z0-9_]+\}/);
  }
}
assert.equal(createLocalizationRuntime().locale, "ru");
assert.equal(createLocalizationRuntime({ locale: "en" }).locale, "ru");
assert.equal(createLocalizationRuntime({ locale: "en", allowForeignRuntime: 1 }).locale, "ru");
assert.equal(createLocalizationRuntime({ locale: "fr", allowForeignRuntime: true }).locale, "ru");
assert.equal(createLocalizationRuntime({ locale: "unknown", allowForeignRuntime: true }).locale, "ru");
assert.equal(createLocalizationRuntime({ locale: "zh", allowForeignRuntime: true }).locale, "zh-CN");
assert.equal(createLocalizationRuntime({ locale: "ar", allowForeignRuntime: true }).direction, "rtl");

const staleAuto = structuredClone(snapshot);
const autoVal = staleAuto.values.find((v) => v.state === "AUTO");
if (autoVal) autoVal.sourceHash = "old";
const projected = translationStoreToDictionaries(staleAuto);
assert.equal(Object.hasOwn(projected[autoVal.languageCode] || {}, snapshot.entries.find((e) => e.id === autoVal.entryId)?.fieldKey || ""), false);

assert.equal(storeMod.readLocalizationSettings().enabledLanguages.includes("en"), false);

rmSync(tempDir, { recursive: true, force: true });
console.log("verify-i18n-stage-3-persistence: ok");
