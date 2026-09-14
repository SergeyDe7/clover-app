/**
 * Stage 9 readiness: empty optional FAQ domain must not block enablement;
 * product-name gaps still block; admin enable gate remains completeness-based.
 * Uses temp DB copy — never writes production.
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const snapSrc = process.env.CLOVER_STAGE9_DB_SNAP
  || "/opt/clover/worktrees/build-artifacts/i18n-stage-9/clover-readonly-snap.sqlite";

const tmp = mkdtempSync(path.join(tmpdir(), "clover-stage9-"));
const dbPath = path.join(tmp, "clover.sqlite");
cpSync(snapSrc, dbPath);
process.env.DB_PATH = dbPath;

const {
  completenessByLanguage,
  readLocalizationSettings,
  writeLocalizationSettings,
} = await import(path.join(root, "server/src/localizationStore.js"));
const {
  computeLanguageCompleteness,
  OPTIONAL_EMPTY_COMPLETENESS_DOMAINS,
} = await import(path.join(root, "src/shared/i18n/localizationSettings.js"));
const {
  canSendForeignLanguageEnablePut,
  shouldShowIncompleteEnableBlock,
} = await import(path.join(root, "src/shared/i18n/languageEnableGate.js"));

assert.deepEqual(OPTIONAL_EMPTY_COMPLETENESS_DOMAINS, ["faq"]);

const vacuousFaq = computeLanguageCompleteness("en", [], {
  domainCorpusStatus: { faq: "absent" },
});
assert.equal(vacuousFaq.domains.faq.complete, true, "absent faq optional");
assert.equal(vacuousFaq.domains.faq.corpusStatus, "absent");
assert.equal(vacuousFaq.domains.interface.complete, false, "empty interface still blocks");
assert.equal(vacuousFaq.complete, false);

const reports = completenessByLanguage();
for (const code of ["en", "uz", "ky", "tg", "zh", "ar"]) {
  const r = reports[code];
  assert.equal(r.domains.faq.total, 0);
  assert.equal(r.domains.faq.complete, true, `${code} faq optional`);
  assert.equal(r.domains.interface.complete, true, `${code} interface`);
  assert.equal(r.domains.categories.complete, true, `${code} categories`);
  assert.equal(r.domains.pages.complete, true, `${code} pages`);
  assert.equal(r.domains.seo.complete, true, `${code} seo`);
  assert.equal(r.domains.checkout.complete, true, `${code} checkout`);
  // Three storefront products lack name rows for every foreign locale.
  assert.equal(r.domains.products.complete, false, `${code} products incomplete`);
  assert.equal(r.domains.products.ready, 698);
  assert.equal(r.domains.products.total, 701);
  assert.equal(r.complete, false, `${code} overall blocked by products`);
  assert.equal(
    canSendForeignLanguageEnablePut({
      code,
      nextEnabled: true,
      overviewReady: true,
      completeness: reports,
    }),
    false
  );
  assert.equal(
    shouldShowIncompleteEnableBlock({
      code,
      nextEnabled: true,
      overviewReady: true,
      completeness: reports,
    }),
    true
  );
}

const before = readLocalizationSettings();
assert.deepEqual(before.enabledLanguages, ["ru"]);

const rejected = writeLocalizationSettings(
  { enabledLanguages: ["ru", "en"] },
  "stage9-test-admin"
);
assert.deepEqual(rejected.settings.enabledLanguages, ["ru"]);
assert.ok(rejected.rejected.includes("en"));

const disableOk = writeLocalizationSettings(
  { enabledLanguages: ["ru"] },
  "stage9-test-admin"
);
assert.deepEqual(disableOk.settings.enabledLanguages, ["ru"]);

// Simulate complete report allows enable (without mutating product translations).
const fakeComplete = Object.fromEntries(
  ["en", "uz", "ky", "tg", "zh", "ar"].map((code) => [code, { complete: true, domains: {} }])
);
assert.equal(
  canSendForeignLanguageEnablePut({
    code: "en",
    nextEnabled: true,
    overviewReady: true,
    completeness: fakeComplete,
  }),
  true
);

rmSync(tmp, { recursive: true, force: true });
console.log("verify-i18n-stage-9-readiness: ok");
