import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot } from "./readFrontendUiSource.mjs";
import {
  BROWSER_LANGUAGE_AUTO_REDIRECT,
  PUBLIC_LANGUAGE_PREFIXES_ENABLED,
  cabinetPathForLocale,
} from "../../src/shared/i18n/languageResolver.js";
import { RU_DICTIONARY } from "../../src/shared/i18n/dictionaries/ru.js";
import { MISSING_TRANSLATION_FALLBACK_RU } from "../../src/shared/i18n/translationRuntime.js";

const FOUNDATIONAL_RU = Object.freeze({
  "shared.modal.confirmTitle": "Подтвердите действие",
  "shared.modal.confirm": "Подтвердить",
  "shared.modal.cancel": "Отмена",
  "shared.modal.alertTitle": "Внимание",
  "shared.modal.ok": "Понятно",
  "shared.modal.details": "Подробности",
  "shared.modal.orderContents": "Состав заказа",
});

const ALLOWED_RUNTIME_FACTORY_FILES = new Set([
  "src/shared/i18n/translationRuntime.js",
  "src/shared/i18n/LocalizationProvider.jsx",
  "src/shared/i18n/index.js",
]);

function readSrc(rel) {
  return readFileSync(path.join(projectRoot, rel), "utf8");
}

function assertSafeUiText(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim() !== "", `${label} must be non-empty`);
  assert.notEqual(value, "", `${label} must not be empty`);
  assert.notEqual(value, null, `${label} must not be null`);
  assert.notEqual(value, undefined, `${label} must not be undefined`);
  assert.equal(Object.keys(RU_DICTIONARY).includes(value.trim()), false, `${label} must not be a registered key`);
  assert.doesNotMatch(value, /\{[a-zA-Z0-9_]+\}/, `${label} must not contain an unresolved placeholder`);
}

function listSrcJsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      listSrcJsFiles(full, out);
      continue;
    }
    if (/\.(jsx?)$/i.test(name)) out.push(full);
  }
  return out;
}

const providerPath = path.join(projectRoot, "src/shared/i18n/LocalizationProvider.jsx");
const runtimePath = path.join(projectRoot, "src/shared/i18n/translationRuntime.js");
const mainSrc = readSrc("src/main.jsx");
const providerSrc = readSrc("src/shared/i18n/LocalizationProvider.jsx");
const indexSrc = readSrc("src/shared/i18n/index.js");
const appModalSrc = readSrc("src/shared/AppModal.jsx");

assert.equal(existsSync(providerPath), true, "LocalizationProvider.jsx contract does not yet exist / is not wired");
assert.match(providerSrc, /export function LocalizationProvider/);
assert.match(providerSrc, /export function useLocalization/);
assert.match(providerSrc, /createLocalizationRuntime\(/);
assert.doesNotMatch(providerSrc, /\bruntime\b/, "Provider must not accept arbitrary ready runtime");
assert.doesNotMatch(providerSrc, /runtimeFactory|unsafeRuntime/);
assert.doesNotMatch(providerSrc, /allowForeignRuntime\s*=\s*true/);
assert.doesNotMatch(providerSrc, /allowForeignRuntime:\s*true/);
assert.doesNotMatch(providerSrc, /from ["'].*App\.jsx["']/);
assert.doesNotMatch(providerSrc, /StorefrontApp/);
assert.doesNotMatch(providerSrc, /ManagerLanguages/);
assert.doesNotMatch(providerSrc, /serverApi/);
assert.doesNotMatch(providerSrc, /localizationStore/);
assert.doesNotMatch(providerSrc, /from ["'].*\/db\.js["']/);
assert.doesNotMatch(providerSrc, /navigator\.language/);
assert.doesNotMatch(providerSrc, /Accept-Language/);
assert.doesNotMatch(providerSrc, /window\.location/);
assert.doesNotMatch(providerSrc, /localStorage/);
assert.doesNotMatch(providerSrc, /sessionStorage/);
assert.doesNotMatch(providerSrc, /preferred_language|preferredLanguage/);
assert.doesNotMatch(providerSrc, /PUBLIC_LANGUAGE_PREFIXES/);
assert.doesNotMatch(providerSrc, /setLanguage/);
assert.doesNotMatch(providerSrc, /LanguageSelector/);

const runtimeMod = await import(pathToFileURL(runtimePath).href);
assert.equal(typeof runtimeMod.createLocalizationRuntime, "function");
assert.equal(typeof runtimeMod.translate, "function");
assert.equal(runtimeMod.MISSING_TRANSLATION_FALLBACK_RU, MISSING_TRANSLATION_FALLBACK_RU);
const { createLocalizationRuntime, translate } = runtimeMod;

assert.equal(Object.isFrozen(RU_DICTIONARY), true);
assert.deepEqual({ ...RU_DICTIONARY }, { ...FOUNDATIONAL_RU });
for (const [key, value] of Object.entries(FOUNDATIONAL_RU)) {
  assert.equal(RU_DICTIONARY[key], value);
  assert.equal(Object.hasOwn(RU_DICTIONARY, key), true);
}

assert.match(
  appModalSrc,
  /export async function appConfirm\(\{[\s\S]*?title = "Подтвердите действие"/
);
assert.match(
  appModalSrc,
  /export async function appConfirm\(\{[\s\S]*?confirmLabel = "Подтвердить"/
);
assert.match(
  appModalSrc,
  /export async function appConfirm\(\{[\s\S]*?cancelLabel = "Отмена"/
);
assert.match(
  appModalSrc,
  /export async function appAlert\(\{[\s\S]*?title = "Внимание"/
);
assert.match(
  appModalSrc,
  /export async function appAlert\(\{[\s\S]*?confirmLabel = "Понятно"/
);
assert.match(appModalSrc, /expandable\.summary \|\| "Подробности"/);
assert.match(appModalSrc, /dialog\.expandable\.summary \|\| "Состав заказа"/);
assert.equal(RU_DICTIONARY["shared.modal.confirmTitle"], "Подтвердите действие");
assert.equal(RU_DICTIONARY["shared.modal.confirm"], "Подтвердить");
assert.equal(RU_DICTIONARY["shared.modal.cancel"], "Отмена");
assert.equal(RU_DICTIONARY["shared.modal.alertTitle"], "Внимание");
assert.equal(RU_DICTIONARY["shared.modal.ok"], "Понятно");
assert.equal(RU_DICTIONARY["shared.modal.details"], "Подробности");
assert.equal(RU_DICTIONARY["shared.modal.orderContents"], "Состав заказа");

const sameKeyLeakRuntime = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: { en: { "shared.modal.confirm": "shared.modal.confirm" } },
});
const otherKeyLeakRuntime = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: { en: { "shared.modal.confirm": "shared.modal.cancel" } },
});
const addedPlaceholderRuntime = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: { en: { "shared.modal.confirm": "Confirm {name}" } },
});
const unresolvedPlaceholderRuntime = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: { en: { "shared.modal.confirm": "Wait {name}" } },
});
const safetyProbe = {
  sameKeyLeak: sameKeyLeakRuntime.t("shared.modal.confirm"),
  otherKeyLeak: otherKeyLeakRuntime.t("shared.modal.confirm"),
  addedPlaceholder: addedPlaceholderRuntime.t("shared.modal.confirm"),
  unresolvedPlaceholder: unresolvedPlaceholderRuntime.t("shared.modal.confirm"),
};
assert.deepEqual(safetyProbe, {
  sameKeyLeak: "Подтвердить",
  otherKeyLeak: "Подтвердить",
  addedPlaceholder: "Подтвердить",
  unresolvedPlaceholder: "Подтвердить",
});

assert.match(mainSrc, /<LocalizationProvider>\s*<RootShell\s*\/>\s*<\/LocalizationProvider>/s);
assert.doesNotMatch(mainSrc, /<LocalizationProvider\s+[^>]*\/>|<LocalizationProvider\s+[^>]*>/);
assert.doesNotMatch(mainSrc, /\{\s*\.\.\./);
assert.doesNotMatch(mainSrc, /allowForeignRuntime/);
assert.doesNotMatch(mainSrc, /locale=/);
assert.doesNotMatch(mainSrc, /dictionaries=/);
assert.doesNotMatch(mainSrc, /\bruntime=/);
assert.match(
  mainSrc,
  /const StorefrontApp = lazy\(\(\) => import\("\.\/screens\/storefront\/StorefrontApp\.jsx"\)\)/
);
assert.match(mainSrc, /const App = lazy\(\(\) => import\("\.\/App\.jsx"\)\)/);
assert.match(mainSrc, /shouldRenderStorefront/);
assert.match(mainSrc, /AppModalHost/);
assert.doesNotMatch(mainSrc, /navigator\.language|Accept-Language/);

const providerImportFiles = [];
const providerMountFiles = [];
const runtimeFactoryFiles = [];
const foreignActivationFiles = [];
for (const file of listSrcJsFiles(path.join(projectRoot, "src"))) {
  const rel = path.relative(projectRoot, file);
  const src = readFileSync(file, "utf8");
  if (src.includes("LocalizationProvider.jsx") && rel !== "src/main.jsx") {
    providerImportFiles.push(rel);
  }
  const mounts = src.match(/<LocalizationProvider\b/g);
  if (mounts) {
    for (let i = 0; i < mounts.length; i += 1) providerMountFiles.push(rel);
  }
  if (src.includes("createLocalizationRuntime") && !ALLOWED_RUNTIME_FACTORY_FILES.has(rel)) {
    runtimeFactoryFiles.push(rel);
  }
  if (!ALLOWED_RUNTIME_FACTORY_FILES.has(rel) && src.includes("allowForeignRuntime")) {
    foreignActivationFiles.push(rel);
  }
}
assert.deepEqual(providerImportFiles, [], `LocalizationProvider.jsx imported outside main: ${providerImportFiles.join(", ")}`);
assert.deepEqual(providerMountFiles, ["src/main.jsx"]);
assert.deepEqual(runtimeFactoryFiles, [], `createLocalizationRuntime used outside allowlist: ${runtimeFactoryFiles.join(", ")}`);
assert.deepEqual(foreignActivationFiles, [], `production foreign-runtime activation in: ${foreignActivationFiles.join(", ")}`);

assert.match(indexSrc, /createLocalizationRuntime/);
assert.doesNotMatch(indexSrc, /LocalizationProvider\.jsx/);
assert.doesNotMatch(indexSrc, /allowForeignRuntime/);

const defaultRuntime = createLocalizationRuntime();
assert.ok(Object.isFrozen(defaultRuntime));
assert.equal(defaultRuntime.locale, "ru");
assert.equal(defaultRuntime.direction, "ltr");
assert.equal(typeof defaultRuntime.t, "function");
assert.equal(defaultRuntime.setLanguage, undefined);
assert.equal(defaultRuntime.t("shared.modal.confirm"), "Подтвердить");
assert.equal(defaultRuntime.t("shared.modal.confirmTitle"), "Подтвердите действие");
assert.equal(defaultRuntime.t("shared.modal.cancel"), "Отмена");
assert.equal(defaultRuntime.t("shared.modal.alertTitle"), "Внимание");
assert.equal(defaultRuntime.t("shared.modal.ok"), "Понятно");
assert.equal(defaultRuntime.t("shared.modal.details"), "Подробности");
assert.equal(defaultRuntime.t("shared.modal.orderContents"), "Состав заказа");
assertSafeUiText(defaultRuntime.t("missing.stage3.key"), "unknown key");
assert.equal(defaultRuntime.t("missing.stage3.key"), MISSING_TRANSLATION_FALLBACK_RU);
assertSafeUiText(defaultRuntime.t(null), "null key");
assertSafeUiText(defaultRuntime.t(""), "empty key");
assertSafeUiText(defaultRuntime.t(undefined), "undefined key");
assert.equal(defaultRuntime.t(null), MISSING_TRANSLATION_FALLBACK_RU);
assert.equal(defaultRuntime.t(""), MISSING_TRANSLATION_FALLBACK_RU);
assert.equal(defaultRuntime.t(undefined), MISSING_TRANSLATION_FALLBACK_RU);

const blockedEn = createLocalizationRuntime({
  locale: "en",
  dictionaries: { en: { "shared.modal.confirm": "Confirm" } },
});
assert.equal(blockedEn.locale, "ru");
assert.equal(blockedEn.t("shared.modal.confirm"), "Подтвердить");

const truthyFlagRuntime = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: 1,
  dictionaries: { en: { "shared.modal.confirm": "Confirm" } },
});
assert.equal(truthyFlagRuntime.locale, "ru");
assert.equal(truthyFlagRuntime.t("shared.modal.confirm"), "Подтвердить");

const allowedEn = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: { en: { "shared.modal.confirm": "Confirm" } },
});
assert.equal(allowedEn.locale, "en");
assert.equal(allowedEn.t("shared.modal.confirm"), "Confirm");
assert.equal(allowedEn.t("shared.modal.cancel"), "Отмена");

const missingEn = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: { en: {} },
});
assert.equal(missingEn.t("shared.modal.confirm"), "Подтвердить");

const emptyTarget = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: { en: { "shared.modal.confirm": "" } },
});
assert.equal(emptyTarget.t("shared.modal.confirm"), "Подтвердить");

const whitespaceTarget = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: { en: { "shared.modal.confirm": "   " } },
});
assert.equal(whitespaceTarget.t("shared.modal.confirm"), "Подтвердить");

const nonStringTarget = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: { en: { "shared.modal.confirm": 123 } },
});
assert.equal(nonStringTarget.t("shared.modal.confirm"), "Подтвердить");

assert.equal(
  createLocalizationRuntime({
    dictionaries: { ru: { "shared.modal.confirm": "ПОДМЕНА" } },
  }).t("shared.modal.confirm"),
  "Подтвердить"
);
assert.equal(
  createLocalizationRuntime({
    locale: "en",
    allowForeignRuntime: true,
    dictionaries: {
      en: {},
      ru: { "shared.modal.confirm": "ПОДМЕНА" },
    },
  }).t("shared.modal.confirm"),
  "Подтвердить"
);

const foreignOnlyUnknown = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: {
    en: {
      "shared.modal.confirm": "Confirm",
      "not.registered.stage3.key": "Foreign only",
    },
  },
});
assert.equal(foreignOnlyUnknown.t("shared.modal.confirm"), "Confirm");
assert.equal(foreignOnlyUnknown.t("not.registered.stage3.key"), MISSING_TRANSLATION_FALLBACK_RU);
assertSafeUiText(foreignOnlyUnknown.t("not.registered.stage3.key"), "unregistered foreign key");

assert.equal(sameKeyLeakRuntime.t("shared.modal.confirm"), "Подтвердить");
assert.equal(otherKeyLeakRuntime.t("shared.modal.confirm"), "Подтвердить");
assert.equal(addedPlaceholderRuntime.t("shared.modal.confirm"), "Подтвердить");
assert.equal(unresolvedPlaceholderRuntime.t("shared.modal.confirm"), "Подтвердить");
assert.doesNotMatch(addedPlaceholderRuntime.t("shared.modal.confirm"), /\{[a-zA-Z0-9_]+\}/);
assert.doesNotMatch(unresolvedPlaceholderRuntime.t("shared.modal.confirm"), /\{[a-zA-Z0-9_]+\}/);

const zhRuntime = createLocalizationRuntime({
  locale: "zh",
  allowForeignRuntime: true,
  dictionaries: { zh: { "shared.modal.confirm": "确认" } },
});
assert.equal(zhRuntime.locale, "zh-CN");
assert.equal(zhRuntime.t("shared.modal.confirm"), "确认");

const zhCnRuntime = createLocalizationRuntime({
  locale: "zh-CN",
  allowForeignRuntime: true,
  dictionaries: { "zh-CN": { "shared.modal.ok": "好的" } },
});
assert.equal(zhCnRuntime.locale, "zh-CN");
assert.equal(zhCnRuntime.t("shared.modal.ok"), "好的");

const arRuntime = createLocalizationRuntime({
  locale: "ar",
  allowForeignRuntime: true,
});
assert.equal(arRuntime.locale, "ar");
assert.equal(arRuntime.direction, "rtl");
assert.equal(arRuntime.t("shared.modal.confirm"), "Подтвердить");

const ignoredFr = createLocalizationRuntime({
  locale: "fr",
  allowForeignRuntime: true,
  dictionaries: { fr: { "shared.modal.confirm": "Confirmer" } },
});
assert.equal(ignoredFr.locale, "ru");
assert.equal(ignoredFr.t("shared.modal.confirm"), "Подтвердить");

const mutableEn = { "shared.modal.confirm": "Confirm" };
const mutableRu = { "shared.modal.confirm": "ПОДМЕНА" };
assert.equal(
  createLocalizationRuntime({ dictionaries: { ru: mutableRu } }).t("shared.modal.confirm"),
  "Подтвердить"
);
const snapshotRuntime = createLocalizationRuntime({
  locale: "en",
  allowForeignRuntime: true,
  dictionaries: { en: mutableEn, ru: mutableRu },
});
assert.equal(snapshotRuntime.t("shared.modal.confirm"), "Confirm");
mutableEn["shared.modal.confirm"] = "CHANGED";
mutableEn["shared.modal.cancel"] = "Cancel";
delete mutableEn["shared.modal.confirm"];
mutableRu["shared.modal.confirm"] = "ИЗМЕНЕНО";
assert.equal(snapshotRuntime.t("shared.modal.confirm"), "Confirm");
assert.equal(snapshotRuntime.t("shared.modal.cancel"), "Отмена");
assert.equal(
  createLocalizationRuntime({ dictionaries: { ru: mutableRu } }).t("shared.modal.confirm"),
  "Подтвердить"
);

assert.equal(
  translate("shared.modal.confirm", {
    locale: "en",
    dictionaries: { en: { "shared.modal.confirm": "shared.modal.confirm" } },
  }),
  "shared.modal.confirm"
);

assert.equal(PUBLIC_LANGUAGE_PREFIXES_ENABLED, false);
assert.equal(BROWSER_LANGUAGE_AUTO_REDIRECT, false);
assert.equal(cabinetPathForLocale("/lk", "en"), "/lk");
assert.equal(cabinetPathForLocale("/lk/client", "zh"), "/lk/client");

console.log("verify-i18n-stage-3-core: ok");
