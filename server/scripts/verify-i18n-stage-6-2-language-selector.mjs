import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot } from "./readFrontendUiSource.mjs";
import { buildPublicLocalizationRuntimeSnapshot } from "../src/publicLocalizationRuntime.js";
import {
  PUBLIC_LOCALE_CODES,
  getEnabledLocales,
  toPublicLocaleCode,
} from "../../src/shared/i18n/languageRegistry.js";
import {
  BROWSER_LANGUAGE_AUTO_REDIRECT,
  PUBLIC_LANGUAGE_PREFIXES_ENABLED,
  cabinetPathForLocale,
  resolveLocale,
} from "../../src/shared/i18n/languageResolver.js";
import { createLocalizationRuntime } from "../../src/shared/i18n/translationRuntime.js";
import {
  applyRuntimeDocumentLocale,
  createRuntimeRequestGate,
  createRuntimeSnapshotLoader,
} from "../../src/shared/i18n/runtimeRequestGate.js";

const read = (rel) => readFileSync(path.join(projectRoot, rel), "utf8");
const dtoKeys = ["catalogVersion", "dictionary", "effectiveLocale", "enabledLanguages"];

// A-C: strict snapshot projection, complete language matrix, enabled policy and RU fallback.
for (const publicCode of PUBLIC_LOCALE_CODES) {
  const snapshot = buildPublicLocalizationRuntimeSnapshot({
    requestedLanguage: publicCode,
    settings: { enabledLanguages: PUBLIC_LOCALE_CODES, catalogVersion: 42 },
    translationStore: { entries: [], values: [] },
  });
  assert.deepEqual(Object.keys(snapshot).sort(), dtoKeys);
  assert.equal(toPublicLocaleCode(snapshot.effectiveLocale), publicCode);
  assert.equal(snapshot.catalogVersion, 42);
}

const disabled = buildPublicLocalizationRuntimeSnapshot({
  requestedLanguage: "ar",
  settings: { enabledLanguages: ["ru", "en"], catalogVersion: 7, updatedBy: "secret" },
  translationStore: {
    entries: [{ id: "raw", fieldKey: "secret", sourceRu: "source", updatedBy: "admin" }],
    values: [{ entryId: "raw", languageCode: "ar", value: "secret", state: "MANUAL" }],
  },
});
assert.deepEqual(disabled.enabledLanguages, ["ru", "en"]);
assert.equal(disabled.effectiveLocale, "ru");
assert.deepEqual(Object.keys(disabled.dictionary), []);
assert.doesNotMatch(JSON.stringify(disabled), /MANUAL|AUTO|updatedBy|sourceRu|translation_entries/);
assert.equal(resolveLocale({ storedLanguage: "ar", enabledLanguages: disabled.enabledLanguages }), "ru");
assert.equal(resolveLocale({ preferredLanguage: "bogus", enabledLanguages: ["ru", "en"] }), "ru");
assert.deepEqual(getEnabledLocales(["en", "en", "bogus"]), ["ru", "en"]);

// D-E: Stage 6.1 storage behavior and the public/internal Chinese round-trip.
const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const preferenceUrl = pathToFileURL(
  path.join(projectRoot, "src/shared/i18n/languagePreference.js")
).href;
const preference = await import(`${preferenceUrl}?stage62=${Date.now()}`);
assert.equal(preference.writeLanguagePreference("zh-CN"), "zh");
assert.equal(values.get("clover-language-preference-v1"), "zh");
assert.equal(preference.readLanguagePreference(), "zh");
assert.equal(resolveLocale({ storedLanguage: "zh", enabledLanguages: ["ru", "zh"] }), "zh-CN");
assert.equal(toPublicLocaleCode("zh-CN"), "zh");
values.set("clover-language-preference-v1", "invalid");
assert.equal(preference.readLanguagePreference(), null);
globalThis.localStorage = {
  getItem() { throw new Error("unavailable"); },
  setItem() { throw new Error("unavailable"); },
  removeItem() { throw new Error("unavailable"); },
};
assert.equal(preference.readLanguagePreference(), null);
assert.equal(preference.writeLanguagePreference("en"), null);

// F-H: client state enters the existing autosave path; staff/selector have no persistence API.
const app = read("src/App.jsx");
const selector = read("src/shared/i18n/LanguageSelector.jsx");
const provider = read("src/shared/i18n/LocalizationProvider.jsx");
assert.match(app, /setProfile\(\(current\) => \(\{ \.\.\.current, locale \}\)\)/);
assert.match(app, /authUser\?\.role !== "client"[\s\S]*scheduleSync\(\(\) => api\.saveProfile\(profile\)\)/);
assert.doesNotMatch(selector, /api\.|fetch\(|saveProfile|PUT|profile/);
assert.match(app, /data\.user\.role === "client"[\s\S]*syncBrowserPreferenceFromProfile/);
assert.match(app, /const sequence = \+\+bootstrapSequenceRef\.current/);
assert.match(app, /sequence !== bootstrapSequenceRef\.current\) return/);
assert.match(app, /bootstrapSequenceRef\.current \+= 1/);
assert.match(app, /invalidateLanguageRequests\(\)/);
assert.doesNotMatch(app, /data\.user\.role === "manager"[\s\S]{0,200}syncBrowserPreferenceFromProfile/);
assert.ok(
  selector.indexOf("onLanguageChange(language)") < selector.indexOf("void setLanguage(language)"),
  "client profile state must update synchronously when selection starts"
);
assert.ok(
  provider.indexOf("writeLanguagePreference(language)") < provider.indexOf("const next = await loader.load(language)"),
  "browser preference must be written before the async runtime request"
);
assert.match(app, /scheduleSync\(\(\) => api\.saveProfile\(profile\)\)/);
assert.match(app, /catch \(error\) \{[\s\S]*setSyncError\(/);

// I: locale resolution is route-neutral and all prefix/redirect switches remain frozen off.
assert.equal(PUBLIC_LANGUAGE_PREFIXES_ENABLED, false);
assert.equal(BROWSER_LANGUAGE_AUTO_REDIRECT, false);
assert.equal(cabinetPathForLocale("/lk?tab=orders#new", "ar"), "/lk?tab=orders#new");
assert.doesNotMatch(`${provider}\n${selector}`, /pushState|replaceState|location\.(?:assign|replace)|location\.href/);

// J: runtime direction and the actual document/root projection contract.
assert.equal(createLocalizationRuntime({ locale: "ar", allowForeignRuntime: true }).direction, "rtl");
assert.equal(createLocalizationRuntime({ locale: "ru", allowForeignRuntime: true }).direction, "ltr");
assert.match(provider, /applyRuntimeDocumentLocale\(document/);

// Deferred A response is rejected after logout invalidation and cannot overwrite B.
const gate = createRuntimeRequestGate();
const accountARequest = gate.next();
gate.invalidate();
const accountBRequest = gate.next();
assert.equal(gate.isCurrent(accountARequest), false);
assert.equal(gate.isCurrent(accountBRequest), true);
let resolveA;
const appliedSnapshots = [];
const deferredA = new Promise((resolve) => { resolveA = resolve; });
const loader = createRuntimeSnapshotLoader({
  requestSnapshot: (language) => language === "en"
    ? deferredA
    : Promise.resolve({ locale: "ru" }),
  applySnapshot: (snapshot) => appliedSnapshots.push(snapshot),
});
const staleA = loader.load("en");
loader.invalidate();
await loader.load("ru");
resolveA({ locale: "en" });
assert.equal(await staleA, null);
assert.deepEqual(appliedSnapshots, [{ locale: "ru" }]);

const fakeRoot = {};
const fakeAppRoot = {};
const fakeDocument = { documentElement: fakeRoot, getElementById: () => fakeAppRoot };
applyRuntimeDocumentLocale(fakeDocument, { locale: "ar", direction: "rtl" });
assert.deepEqual({ ...fakeRoot }, { dir: "rtl", lang: "ar" });
assert.equal(fakeAppRoot.dir, "rtl");
applyRuntimeDocumentLocale(fakeDocument, { locale: "ru", direction: "ltr" });
assert.equal(fakeRoot.dir, "ltr");
assert.equal(fakeRoot.lang, "ru");
assert.equal(fakeAppRoot.dir, "ltr");

// K: one native selector mounted through the intended existing shells and login.
assert.match(selector, /const accessibleLabel = t\("admin\.languages\.language"\)/);
assert.match(selector, /<select[\s\S]*aria-label=\{accessibleLabel\}/);
assert.match(selector, /enabledLanguages\.map/);
assert.match(read("src/screens/storefront/components/StoreHeader.jsx"), /<LanguageSelector className="sf-language-selector" \/>/);
assert.match(read("src/shared/SharedPanels.jsx"), /<LanguageSelector onLanguageChange=\{onLanguageChange\}\s*\/>/);
assert.match(app, /<LanguageSelector className="language-selector-login" \/>/);
assert.match(read("src/styles/clover-theme.css"), /@media \(max-width: 640px\)[\s\S]*\.language-selector select[\s\S]*min-height:\s*44px/);

// A/L: endpoint is public/read-only and Stage 6.2 does not touch protected business contours.
const server = read("server/src/server.js");
assert.match(server, /app\.get\("\/api\/public\/localization\/runtime"/);
assert.doesNotMatch(server, /app\.(?:put|post|patch|delete)\("\/api\/public\/localization\/runtime"/);
const changed = String(process.env.STAGE62_CHANGED_FILES || [
  "server/src/publicLocalizationRuntime.js",
  "server/src/server.js",
  "src/shared/i18n/LocalizationProvider.jsx",
  "src/shared/i18n/LanguageSelector.jsx",
  "src/shared/i18n/runtimeRequestGate.js",
  "src/shared/SharedPanels.jsx",
  "src/screens/storefront/components/StoreHeader.jsx",
  "src/screens/client/ClientScreen.jsx",
  "src/App.jsx",
  "src/styles/clover-theme.css",
  "server/scripts/verify-i18n-stage-3-core.mjs",
  "server/scripts/verify-i18n-stage-3-system-ui.mjs",
  "server/scripts/verify-i18n-stage-6-2-language-selector.mjs",
].join("\n"));
assert.doesNotMatch(changed, /(?:pricing|price|order|matrix|onec|one-c|migration|schema)/i);

console.log("I18N Stage 6.2 language selector verification passed.");
