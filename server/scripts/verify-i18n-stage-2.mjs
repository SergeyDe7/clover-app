import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";
import {
  DEFAULT_LOCALE,
  PUBLIC_LOCALE_CODES,
  canonicalizeLocale,
  getEnabledLocales,
  isLanguageEnabled,
} from "../../src/shared/i18n/languageRegistry.js";
import {
  COMPLETENESS_DOMAINS,
  TRANSLATION_WORKSPACE_VIEWS,
  applyEnabledLanguages,
  computeLanguageCompleteness,
  emptyLocalizationSettings,
  filterTranslationRows,
  normalizeLocalizationSettings,
  saveSettingsPreservingTranslations,
  upsertManualTranslation,
} from "../../src/shared/i18n/localizationSettings.js";
import { translate, MISSING_TRANSLATION_FALLBACK_RU } from "../../src/shared/i18n/translationRuntime.js";
import { staffHasFeature as staffHasFeatureUi } from "../../src/shared/appHelpers.js";
import { staffHasFeature as staffHasFeatureRoles } from "../src/roles.js";

function readSrc(rel) {
  return readFileSync(path.join(projectRoot, rel), "utf8");
}

const helpersSrc = readSrc("src/shared/appHelpers.js");
const screenSrc = readSrc("src/screens/manager/ManagerScreen.jsx");
const languagesSrc = readSrc("src/screens/manager/ManagerLanguages.jsx");
const rolesSrc = readSrc("server/src/roles.js");
const serverSrc = readSrc("server/src/server.js");
const apiSrc = readSrc("src/serverApi.js");

assert.deepEqual([...PUBLIC_LOCALE_CODES], ["ru", "en", "uz", "ky", "tg", "zh", "ar"]);
assert.equal(DEFAULT_LOCALE, "ru");
assert.deepEqual(getEnabledLocales(), ["ru"]);
assert.equal(isLanguageEnabled("ru"), true);
assert.equal(isLanguageEnabled("en"), false);

const defaults = emptyLocalizationSettings();
assert.deepEqual(defaults.enabledLanguages, ["ru"]);
assert.equal(defaults.catalogVersion, 0);

const normalized = normalizeLocalizationSettings({
  enabledLanguages: ["en", "ru", "fr", "zh-CN", ""],
  catalogVersion: "3",
  extraKeep: true,
});
assert.ok(normalized.enabledLanguages.includes("ru"));
assert.ok(normalized.enabledLanguages.includes("en"));
assert.ok(normalized.enabledLanguages.includes("zh"));
assert.equal(normalized.enabledLanguages.includes("fr"), false);
assert.equal(normalized.extraKeep, undefined);
assert.equal(normalizeLocalizationSettings(null).enabledLanguages[0], "ru");
assert.doesNotThrow(() => normalizeLocalizationSettings({ enabledLanguages: "nope" }));
assert.ok(normalizeLocalizationSettings({ enabledLanguages: ["xx"] }).enabledLanguages.includes("ru"));

assert.equal(canonicalizeLocale("not-a-locale"), "ru");
assert.doesNotThrow(() =>
  filterTranslationRows(null, { view: "nope", language: "fr", query: 1 })
);
assert.deepEqual(
  filterTranslationRows(undefined, { view: "interface", language: "zzz" }),
  []
);

const emptyCompleteness = computeLanguageCompleteness("en", []);
assert.equal(emptyCompleteness.complete, false);
assert.ok(Array.isArray(COMPLETENESS_DOMAINS) && COMPLETENESS_DOMAINS.length > 0);
const categoryReady = computeLanguageCompleteness("en", [
  {
    domain: "categories",
    language: "en",
    critical: true,
    state: "MANUAL",
    stale: false,
    value: "Gloves",
  },
]);
assert.equal(categoryReady.complete, false);
assert.equal(categoryReady.domains.categories.complete, true);
assert.equal(categoryReady.domains.interface.complete, false);
assert.equal(computeLanguageCompleteness("ru", []).complete, true);

const rejectedEnable = applyEnabledLanguages(["ru"], ["ru", "en"], {
  en: emptyCompleteness,
});
assert.deepEqual(rejectedEnable.enabledLanguages, ["ru"]);
assert.equal(rejectedEnable.rejected.includes("en"), true);

const allowedEnable = applyEnabledLanguages(["ru"], ["ru", "en"], {
  en: { complete: true, domains: {} },
});
assert.ok(allowedEnable.enabledLanguages.includes("en"));
assert.ok(isLanguageEnabled("en", allowedEnable.enabledLanguages));
assert.deepEqual(getEnabledLocales(allowedEnable.enabledLanguages).sort(), ["en", "ru"].sort());

const ruLocked = applyEnabledLanguages(["ru", "en"], ["en"], {
  en: { complete: true, domains: {} },
});
assert.ok(ruLocked.enabledLanguages.includes("ru"));
assert.equal(ruLocked.enabledLanguages.includes("en"), false);

assert.deepEqual(
  TRANSLATION_WORKSPACE_VIEWS.map(([id]) => id),
  ["interface", "categories", "seo", "glossary", "untranslated"]
);
assert.match(languagesSrc, /useLocalization|Языки и переводы|admin\.languages\.title/);
for (const [, title] of TRANSLATION_WORKSPACE_VIEWS) {
  assert.match(
    readSrc("src/shared/i18n/localizationSettings.js"),
    new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
}
assert.doesNotMatch(languagesSrc, /auto-translate|OpenAI|deepl/i);

const manualStore = {
  entries: [
    {
      id: "entry-1",
      namespace: "ui",
      entityType: "",
      entityId: "",
      fieldKey: "checkout.submit",
      sourceRu: "Оформить заказ",
      sourceHash: "abc",
      critical: true,
    },
  ],
  values: [
    {
      entryId: "entry-1",
      languageCode: "en",
      value: "Place order",
      state: "MANUAL",
      sourceHash: "abc",
    },
  ],
};
const afterManual = upsertManualTranslation(manualStore, {
  entryId: "entry-1",
  language: "en",
  value: "Checkout now",
  editor: "admin@clover.ru",
});
assert.equal(afterManual.values[0].state, "MANUAL");
assert.equal(afterManual.values[0].value, "Checkout now");

const autoAttempt = upsertManualTranslation(afterManual, {
  entryId: "entry-1",
  language: "en",
  value: "AUTO OVERWRITE",
  editor: "system",
  state: "AUTO",
});
assert.equal(autoAttempt.values[0].value, "Checkout now");
assert.equal(autoAttempt.values[0].state, "MANUAL");

const saved = saveSettingsPreservingTranslations(
  { enabledLanguages: ["ru"], catalogVersion: 1 },
  afterManual,
  { enabledLanguages: ["ru"] }
);
assert.equal(saved.translations.values[0].value, "Checkout now");
assert.equal(saved.translations.values[0].state, "MANUAL");
assert.ok(saved.settings.catalogVersion > 1);
assert.ok(saved.settings.enabledLanguages.includes("ru"));

assert.equal(staffHasFeatureUi({ role: "admin" }, "languages"), true);
assert.equal(staffHasFeatureUi({ role: "manager" }, "languages"), false);
assert.equal(
  staffHasFeatureUi({ role: "manager", permissions: { fullAccess: true } }, "languages"),
  false
);
assert.equal(staffHasFeatureUi({ role: "client" }, "languages"), false);
assert.equal(staffHasFeatureRoles({ role: "admin" }, "languages"), true);
assert.equal(staffHasFeatureRoles({ role: "manager" }, "languages"), false);
assert.equal(
  staffHasFeatureRoles({ role: "manager", permissions: { fullAccess: true } }, "languages"),
  false
);
assert.equal(staffHasFeatureRoles({ role: "client" }, "languages"), false);

assert.match(helpersSrc, /\["languages", "(?:Языки и переводы|manager\.nav\.languages)"\]/);
assert.match(screenSrc, /tab === "languages"/);
assert.match(screenSrc, /ManagerLanguages/);
assert.match(rolesSrc, /id === "languages"/);
assert.match(serverSrc, /\/api\/admin\/localization/);
assert.match(serverSrc, /roleRequired\("admin"\)/);
assert.match(apiSrc, /getLocalizationSettings|saveLocalizationSettings/);

assert.doesNotMatch(readSrc("src/screens/storefront/mode.js"), /LanguageSelector|enabledLanguages/);
assert.doesNotMatch(readSrc("src/main.jsx"), /LanguageSelector/);
assert.equal(translate("missing.stage2"), MISSING_TRANSLATION_FALLBACK_RU);

console.log("verify-i18n-stage-2: ok");
