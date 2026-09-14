import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer as createViteServer } from "vite";
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
  normalizePublicRuntimeSnapshot,
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

const normalizedZh = normalizePublicRuntimeSnapshot({
  enabledLanguages: ["ru", "zh"],
  catalogVersion: 9,
  effectiveLocale: "zh-CN",
  dictionary: { "shared.signOut": "退出" },
});
assert.deepEqual(normalizedZh.enabledLanguages, ["ru", "zh"]);
assert.equal(normalizedZh.locale, "zh-CN");
assert.equal(normalizedZh.catalogVersion, 9);
assert.equal(normalizedZh.dictionaries["zh-CN"]["shared.signOut"], "退出");
assert.equal(
  createLocalizationRuntime({
    locale: normalizedZh.locale,
    dictionaries: normalizedZh.dictionaries,
    allowForeignRuntime: true,
  }).t("shared.signOut"),
  "退出"
);
for (const invalidPayload of [
  null,
  {},
  {
    enabledLanguages: ["ru", "invalid"],
    catalogVersion: 1,
    effectiveLocale: "ru",
    dictionary: {},
  },
  {
    enabledLanguages: ["ru"],
    catalogVersion: 1,
    effectiveLocale: "en",
    dictionary: {},
  },
  {
    enabledLanguages: ["ru"],
    catalogVersion: "1",
    effectiveLocale: "ru",
    dictionary: {},
  },
  {
    enabledLanguages: ["ru"],
    catalogVersion: 1,
    effectiveLocale: "ru",
    dictionary: [],
  },
]) {
  assert.throws(() => normalizePublicRuntimeSnapshot(invalidPayload));
}

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
assert.equal(
  preference.syncBrowserPreferenceFromProfile({ locale: "en" }),
  "en",
  "valid profile locale must survive unavailable browser storage"
);

// A: profile locale activates through the real runtime loader even when storage throws.
const storageFailureApplied = [];
const storageFailureLoader = createRuntimeSnapshotLoader({
  requestSnapshot: async (language) => normalizePublicRuntimeSnapshot({
    enabledLanguages: ["ru", "en"],
    catalogVersion: 11,
    effectiveLocale: language,
    dictionary: { "shared.signOut": "Sign out" },
  }),
  applySnapshot: (snapshot) => storageFailureApplied.push(snapshot),
});
const storageIndependentProfileLocale =
  preference.syncBrowserPreferenceFromProfile({ locale: "en" });
assert.ok(await storageFailureLoader.load(storageIndependentProfileLocale));
assert.equal(storageFailureApplied.at(-1).locale, "en");
assert.equal(
  createLocalizationRuntime({
    locale: storageFailureApplied.at(-1).locale,
    dictionaries: storageFailureApplied.at(-1).dictionaries,
    allowForeignRuntime: true,
  }).t("shared.signOut"),
  "Sign out"
);

// B: a newer explicit choice wins only the locale field of an older bootstrap.
values.clear();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const coordinator = preference.createProfileLocaleCoordinator();
coordinator.beginSession("client-a");
const oldBootstrap = coordinator.captureBootstrap();
const selectedLocale = coordinator.recordExplicitChoice("en", "client-a");
assert.equal(selectedLocale, "en");
preference.writeLanguagePreference(selectedLocale);

const explicitRuntimeApplied = [];
const explicitRuntimeLoader = createRuntimeSnapshotLoader({
  requestSnapshot: async (language) => normalizePublicRuntimeSnapshot(
    buildPublicLocalizationRuntimeSnapshot({
      requestedLanguage: language,
      settings: { enabledLanguages: ["ru", "en"], catalogVersion: 12 },
      translationStore: { entries: [], values: [] },
    })
  ),
  applySnapshot: (snapshot) => explicitRuntimeApplied.push(snapshot),
});
assert.ok(await explicitRuntimeLoader.load(selectedLocale));

const incomingBootstrapProfile = {
  locale: "ru",
  companyName: "Fresh server company",
  contactName: "Fresh server contact",
};
const reconciled = coordinator.reconcileBootstrapProfile(
  incomingBootstrapProfile,
  "client-a",
  oldBootstrap
);
assert.equal(reconciled.preservedExplicitChoice, true);
assert.equal(reconciled.shouldApplyRuntime, false);
assert.equal(reconciled.profile.locale, "en");
assert.equal(reconciled.profile.companyName, "Fresh server company");
assert.equal(reconciled.profile.contactName, "Fresh server contact");
preference.syncBrowserPreferenceFromProfile(reconciled.profile);
assert.equal(values.get("clover-language-preference-v1"), "en");
assert.equal(explicitRuntimeApplied.at(-1).locale, "en");
const autosavePayloads = [structuredClone(reconciled.profile)];
assert.equal(autosavePayloads.at(-1).locale, "en");
assert.equal(autosavePayloads.at(-1).companyName, "Fresh server company");

// Negative controls model both original regressions without mutating the candidate.
globalThis.localStorage = {
  getItem() { throw new Error("unavailable"); },
  setItem() { throw new Error("unavailable"); },
  removeItem() { throw new Error("unavailable"); },
};
assert.equal(
  preference.writeLanguagePreference("en"),
  null,
  "the former storage-dependent activation value is null"
);
assert.equal(
  {
    locale: selectedLocale,
    ...incomingBootstrapProfile,
  }.locale,
  "ru",
  "the former unconditional bootstrap profile would revert the explicit EN choice"
);

// C: without a newer choice, the valid profile locale remains authoritative.
const noChoiceCoordinator = preference.createProfileLocaleCoordinator();
noChoiceCoordinator.beginSession("client-c");
const noChoiceResolution = noChoiceCoordinator.reconcileBootstrapProfile(
  { locale: "en", companyName: "Client C" },
  "client-c",
  noChoiceCoordinator.captureBootstrap()
);
assert.equal(noChoiceResolution.locale, "en");
assert.equal(noChoiceResolution.shouldApplyRuntime, true);
assert.equal(noChoiceResolution.profile.companyName, "Client C");

// D: logout/account switch invalidates A and lets B's profile remain authoritative.
const accountCoordinator = preference.createProfileLocaleCoordinator();
accountCoordinator.beginSession("client-a");
const profileAccountARequest = accountCoordinator.captureBootstrap();
assert.equal(accountCoordinator.recordExplicitChoice("en", "client-a"), "en");
accountCoordinator.invalidateSession();
accountCoordinator.beginSession("client-b");
const profileAccountBRequest = accountCoordinator.captureBootstrap();
const accountBResolution = accountCoordinator.reconcileBootstrapProfile(
  { locale: "ru", companyName: "Client B" },
  "client-b",
  profileAccountBRequest
);
assert.equal(accountBResolution.locale, "ru");
assert.equal(accountBResolution.shouldApplyRuntime, true);
assert.equal(
  accountCoordinator.reconcileBootstrapProfile(
    { locale: "ru", companyName: "Delayed Client A" },
    "client-a",
    profileAccountARequest
  ),
  null
);

// E: a supported but disabled profile locale resolves through policy to safe RU.
const disabledProfileCoordinator = preference.createProfileLocaleCoordinator();
disabledProfileCoordinator.beginSession("client-disabled");
const disabledProfileResolution =
  disabledProfileCoordinator.reconcileBootstrapProfile(
    { locale: "ar" },
    "client-disabled",
    disabledProfileCoordinator.captureBootstrap()
  );
assert.equal(disabledProfileResolution.locale, "ar");
assert.equal(disabledProfileResolution.shouldApplyRuntime, true);
const disabledProfileApplied = [];
const disabledProfileLoader = createRuntimeSnapshotLoader({
  requestSnapshot: async (language) => normalizePublicRuntimeSnapshot(
    buildPublicLocalizationRuntimeSnapshot({
      requestedLanguage: language,
      settings: { enabledLanguages: ["ru", "en"], catalogVersion: 13 },
      translationStore: { entries: [], values: [] },
    })
  ),
  applySnapshot: (snapshot) => disabledProfileApplied.push(snapshot),
});
assert.ok(await disabledProfileLoader.load(disabledProfileResolution.locale));
assert.equal(disabledProfileApplied.at(-1).locale, "ru");

// F-H: client state enters the existing autosave path; staff/selector have no persistence API.
const app = read("src/App.jsx");
const selector = read("src/shared/i18n/LanguageSelector.jsx");
const provider = read("src/shared/i18n/LocalizationProvider.jsx");
const storefrontHeaderSource = read("src/screens/storefront/components/StoreHeader.jsx");
assert.match(
  provider,
  /if \(!response\.ok\)[\s\S]*return normalizePublicRuntimeSnapshot\(await response\.json\(\)\)/,
  "HTTP 200 runtime payload must pass through strict validation"
);
assert.match(app, /recordExplicitChoice\([\s\S]*setProfile\(\(current\) => \(\{[\s\S]*locale: explicitLocale/);
assert.match(app, /reconcileBootstrapProfile\([\s\S]*const nextProfile = profileLocaleResolution\.profile/);
assert.match(app, /profileLocaleResolution\.shouldApplyRuntime[\s\S]*setLanguage\(profileLanguage\)/);
assert.match(app, /authUser\?\.role !== "client"[\s\S]*scheduleSync\(\(\) => api\.saveProfile\(profile\)\)/);
assert.doesNotMatch(selector, /api\.|fetch\(|saveProfile|PUT|profile/);
assert.match(app, /data\.user\.role === "client"[\s\S]*syncBrowserPreferenceFromProfile/);
assert.match(app, /const sequence = \+\+bootstrapSequenceRef\.current/);
assert.match(app, /sequence !== bootstrapSequenceRef\.current\) return/);
assert.match(app, /bootstrapSequenceRef\.current \+= 1/);
assert.match(app, /profileLocaleCoordinatorRef\.current\.invalidateSession\(\)/);
assert.match(app, /invalidateLanguageRequests\(\)/);
assert.doesNotMatch(app, /data\.user\.role === "manager"[\s\S]{0,200}syncBrowserPreferenceFromProfile/);
assert.ok(
  selector.indexOf("onLanguageChange(language)") < selector.indexOf("void setLanguage(language)"),
  "client profile state must update synchronously when selection starts"
);
assert.ok(
  provider.indexOf("writeLanguagePreference(language)") <
    provider.indexOf("await loader.loadWithStatus(language)"),
  "browser preference must be written before the async runtime request"
);
assert.match(app, /scheduleSync\(\(\) => api\.saveProfile\(profile\)\)/);
assert.match(app, /catch \(error\) \{[\s\S]*setSyncError\(/);

// I: cabinet selection stays route-neutral. Stage 7 supersedes only public
// storefront route neutrality behind its disabled-by-default build gate.
assert.equal(PUBLIC_LANGUAGE_PREFIXES_ENABLED, false);
assert.equal(BROWSER_LANGUAGE_AUTO_REDIRECT, false);
assert.equal(cabinetPathForLocale("/lk?tab=orders#new", "ar"), "/lk?tab=orders#new");
assert.doesNotMatch(selector, /pushState|replaceState|location\.(?:assign|replace)|location\.href/);
assert.match(provider, /addEventListener\("popstate"/);
assert.match(storefrontHeaderSource, /equivalentPublicLocaleHref/);
assert.match(storefrontHeaderSource, /window\.history\.pushState/);
assert.match(storefrontHeaderSource, /revertPublicLanguageSwitch/);
assert.match(storefrontHeaderSource, /acceptPublicLanguageSwitch/);
assert.match(storefrontHeaderSource, /onLanguageAccepted/);
assert.match(storefrontHeaderSource, /onLanguageRejected/);
assert.match(selector, /onLanguageRejected\(language\)/);
assert.ok(
  selector.indexOf("void setLanguage(language)") <
    selector.indexOf("onLanguageRejected(language)"),
  "rejected public locale switch runs after the existing setLanguage attempt"
);

// J: runtime direction and the actual document/root projection contract.
assert.equal(createLocalizationRuntime({ locale: "ar", allowForeignRuntime: true }).direction, "rtl");
assert.equal(createLocalizationRuntime({ locale: "ru", allowForeignRuntime: true }).direction, "ltr");
assert.match(provider, /applyRuntimeDocumentLocale\(document/);

// Fresh failure stays on safe RU; later malformed data preserves the last valid runtime.
const freshFailureApplied = [];
const freshFailureLoader = createRuntimeSnapshotLoader({
  requestSnapshot: async () => {
    throw new Error("offline");
  },
  applySnapshot: (snapshot) => freshFailureApplied.push(snapshot),
});
assert.equal(await freshFailureLoader.load("en"), null);
assert.deepEqual(freshFailureApplied, []);

let returnMalformedPayload = false;
const validThenMalformedApplied = [];
const validThenMalformedLoader = createRuntimeSnapshotLoader({
  requestSnapshot: async () => normalizePublicRuntimeSnapshot(
    returnMalformedPayload
      ? {}
      : {
          enabledLanguages: ["ru", "en"],
          catalogVersion: 10,
          effectiveLocale: "en",
          dictionary: { "shared.signOut": "Sign out" },
        }
  ),
  applySnapshot: (snapshot) => validThenMalformedApplied.push(snapshot),
});
assert.ok(await validThenMalformedLoader.load("en"));
returnMalformedPayload = true;
assert.equal(await validThenMalformedLoader.load("ru"), null);
assert.equal(validThenMalformedApplied.length, 1);
assert.equal(validThenMalformedApplied[0].locale, "en");

// A delayed locale A response cannot overwrite the newer locale B snapshot.
let resolveLocaleA;
const localeRaceApplied = [];
const localeADeferred = new Promise((resolve) => { resolveLocaleA = resolve; });
const localeRaceLoader = createRuntimeSnapshotLoader({
  requestSnapshot: (language) => language === "en"
    ? localeADeferred
    : Promise.resolve({ locale: "ru" }),
  applySnapshot: (snapshot) => localeRaceApplied.push(snapshot),
});
const staleLocaleA = localeRaceLoader.load("en");
await localeRaceLoader.load("ru");
resolveLocaleA({ locale: "en" });
assert.equal(await staleLocaleA, null);
assert.deepEqual(localeRaceApplied, [{ locale: "ru" }]);

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
assert.equal(fakeAppRoot.lang, "ar");
applyRuntimeDocumentLocale(fakeDocument, { locale: "ru", direction: "ltr" });
assert.equal(fakeRoot.dir, "ltr");
assert.equal(fakeRoot.lang, "ru");
assert.equal(fakeAppRoot.dir, "ltr");
assert.equal(fakeAppRoot.lang, "ru");
applyRuntimeDocumentLocale(fakeDocument, { locale: "zh-CN", direction: "ltr" });
assert.equal(fakeRoot.lang, "zh-CN");
assert.equal(fakeAppRoot.lang, "zh-CN");

// K: one reusable flag control is mounted in intended shells and omitted from admin DOM.
assert.match(selector, /const accessibleLabel = t\("admin\.languages\.language"\)/);
assert.match(selector, /aria-haspopup="listbox"/);
assert.match(selector, /role="listbox"/);
assert.match(selector, /role="option"/);
assert.match(selector, /aria-selected=/);
assert.match(selector, /tabIndex=\{option\.language === focusedLanguage \? 0 : -1\}/);
assert.match(selector, /event\.key === "Escape"/);
assert.match(selector, /event\.key === "ArrowDown"/);
assert.match(selector, /event\.key === "Home"/);
assert.match(selector, /event\.key === "Tab"/);

const expectedLanguagePresentation = {
  ru: { flag: "🇷🇺", name: "Русский" },
  en: { flag: "🇬🇧", name: "English" },
  uz: { flag: "🇺🇿", name: "O‘zbekcha" },
  ky: { flag: "🇰🇬", name: "Кыргызча" },
  tg: { flag: "🇹🇯", name: "Тоҷикӣ" },
  zh: { flag: "🇨🇳", name: "中文" },
  ar: { flag: "🇸🇦", name: "العربية" },
};
const presentationModule = await import(pathToFileURL(
  path.join(projectRoot, "src/shared/i18n/languageSelectorPresentation.js")
).href);
assert.deepEqual(
  JSON.parse(JSON.stringify(presentationModule.LANGUAGE_PRESENTATION)),
  expectedLanguagePresentation
);
assert.deepEqual(
  presentationModule.getLanguageOptions([...PUBLIC_LOCALE_CODES, "invalid", "en"])
    .map(({ language, flag, name }) => ({ language, flag, name })),
  PUBLIC_LOCALE_CODES.map((language) => ({
    language,
    ...expectedLanguagePresentation[language],
  })),
  "rendered options must be enabled-only, de-duplicated flag presentations"
);
assert.deepEqual(
  presentationModule.getLanguageOptions(["invalid"]),
  [],
  "invalid input must not normalize into a rendered RU option"
);

const vite = await createViteServer({
  root: projectRoot,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});
try {
  const panelsModule = await vite.ssrLoadModule("/src/shared/SharedPanels.jsx");

  const visibleHeaderMarkup = renderToStaticMarkup(
    React.createElement(panelsModule.Header, {
      title: "Client",
      showLanguageSelector: true,
    })
  );
  assert.match(visibleHeaderMarkup, /class="language-selector/);
  assert.match(visibleHeaderMarkup, /class="language-selector-trigger"/);
  assert.match(visibleHeaderMarkup, /class="language-flag"/);
  assert.match(visibleHeaderMarkup, /aria-label="[^"]+:\s*Русский"/);
  assert.doesNotMatch(
    visibleHeaderMarkup,
    />\s*Русский\s*</,
    "the compact selected value must show a flag, not a visible language name"
  );

  const adminHeaderMarkup = renderToStaticMarkup(
    React.createElement(panelsModule.Header, {
      title: "Admin",
      showLanguageSelector: false,
    })
  );
  assert.doesNotMatch(
    adminHeaderMarkup,
    /language-selector|language-flag|aria-haspopup="listbox"/,
    "admin header must not render selector DOM or focusable remnants"
  );
} finally {
  await vite.close();
}

const storefrontHeader = read("src/screens/storefront/components/StoreHeader.jsx");
const storefrontLanguageIndex = storefrontHeader.indexOf("<LanguageSelector");
const storefrontLoginMobileIndex = storefrontHeader.indexOf(
  'className="sf-header-tool sf-login-mobile"'
);
const storefrontLoginDesktopIndex = storefrontHeader.indexOf(
  'className="sf-btn sf-btn-ghost sf-login sf-login-desktop"'
);
assert.ok(storefrontHeader.indexOf("<StorefrontContacts />") < storefrontLoginMobileIndex);
assert.ok(storefrontLoginMobileIndex < storefrontLanguageIndex);
assert.ok(storefrontLoginDesktopIndex < storefrontLanguageIndex);
assert.match(read("src/screens/client/ClientScreen.jsx"), /onLanguageChange=\{onLanguageChange\}/);
assert.match(
  read("src/screens/manager/ManagerScreen.jsx"),
  /showLanguageSelector=\{authUser\?\.role !== "admin"\}/
);
assert.match(
  read("src/shared/SharedPanels.jsx"),
  /showLanguageSelector \? \([\s\S]*<LanguageSelector[\s\S]*className="app-header-language-selector"[\s\S]*onLanguageChange=\{onLanguageChange\}/
);
assert.match(app, /<LanguageSelector className="language-selector-login" \/>/);
const appCss = read("src/App.css");
const themeCss = read("src/styles/clover-theme.css");
const storefrontCss = read("src/screens/storefront/storefront.css");
assert.match(appCss, /\.login-card\{position:relative/);
assert.match(themeCss, /\.language-selector-login\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*12px;[\s\S]*inset-inline-end:\s*12px;/);
assert.match(themeCss, /\.language-selector-trigger,[\s\S]*\.language-selector-option\s*\{[\s\S]*min-width:\s*44px;[\s\S]*min-height:\s*44px;/);
assert.match(themeCss, /\.language-selector-trigger,[\s\S]*\.language-selector-option\s*\{[\s\S]*box-sizing:\s*border-box;/);
assert.match(themeCss, /\.language-selector-trigger:focus-visible,[\s\S]*outline:\s*3px/);
assert.match(themeCss, /\.language-selector-option-name\s*\{[\s\S]*position:\s*absolute;[\s\S]*clip:/);
assert.match(themeCss, /\.app-header-language-selector \.language-flag/);
assert.match(storefrontCss, /\.sf-language-selector \.language-flag/);
assert.match(storefrontCss, /@media \(max-width:\s*400px\)[\s\S]*\.sf-header-actions\s*\{[\s\S]*gap:\s*0;[\s\S]*\.sf-language-selector \.language-selector-trigger\s*\{[\s\S]*width:\s*44px;/);
assert.match(
  read("src/screens/client/ManagerContact.jsx"),
  /manager-contact-trigger--icon/
);

// A/L: endpoint is public/read-only and Stage 6.2 does not touch protected business contours.
const server = read("server/src/server.js");
assert.match(server, /app\.get\("\/api\/public\/localization\/runtime"/);
assert.doesNotMatch(server, /app\.(?:put|post|patch|delete)\("\/api\/public\/localization\/runtime"/);
const changed = String(
  process.env.STAGE62_CHANGED_FILES ||
  execFileSync(
    "git",
    ["diff", "--name-only", "b71bacce08f2be8fb0926f77dfd6b2416944f8eb"],
    { cwd: projectRoot, encoding: "utf8" }
  )
);
assert.doesNotMatch(changed, /(?:pricing|price|order|matrix|onec|one-c|migration|schema)/i);

console.log("I18N Stage 6.2 language selector verification passed.");
