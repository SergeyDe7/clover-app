import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  PUBLIC_LOCALE_CODES,
  canonicalizeLocale,
  toPublicLocaleCode,
  isSupportedPublicLocale,
  isLanguageEnabled,
  getEnabledLocales,
} from "../../src/shared/i18n/languageRegistry.js";
import {
  BROWSER_LANGUAGE_AUTO_REDIRECT,
  PUBLIC_LANGUAGE_PREFIXES_ENABLED,
  extractPublicLanguagePrefix,
  resolveLocale,
  cabinetPathForLocale,
} from "../../src/shared/i18n/languageResolver.js";
import {
  MISSING_TRANSLATION_FALLBACK_RU,
  translate,
} from "../../src/shared/i18n/translationRuntime.js";

const APPROVED_PUBLIC_LOCALES = ["ru", "en", "uz", "ky", "tg", "zh", "ar"];

const dictionaries = {
  ru: {
    "greeting.hello": "Привет",
    "cart.title": "Корзина",
    "checkout.submit": "Оформить заказ, {name}",
  },
  en: {
    "greeting.hello": "Hello",
    "checkout.submit": "Place order, {name}",
  },
  "zh-CN": {
    "greeting.hello": "你好",
  },
};

function readSrc(rel) {
  return readFileSync(path.join(projectRoot, rel), "utf8");
}

assert.deepEqual([...PUBLIC_LOCALE_CODES], APPROVED_PUBLIC_LOCALES);
assert.equal(DEFAULT_LOCALE, "ru");
assert.equal(FALLBACK_LOCALE, "ru");
assert.deepEqual(getEnabledLocales(), ["ru"]);
assert.equal(isLanguageEnabled("ru"), true);
assert.equal(isLanguageEnabled("en"), false);
assert.equal(isLanguageEnabled("zh"), false);
assert.equal(isLanguageEnabled("zh-CN"), false);

for (const code of APPROVED_PUBLIC_LOCALES) {
  assert.equal(isSupportedPublicLocale(code), true);
  assert.equal(toPublicLocaleCode(canonicalizeLocale(code)), code);
}

assert.equal(canonicalizeLocale("ru"), "ru");
assert.equal(canonicalizeLocale("EN"), "en");
assert.equal(canonicalizeLocale(" uz "), "uz");
assert.equal(canonicalizeLocale("KY"), "ky");
assert.equal(canonicalizeLocale("tg"), "tg");
assert.equal(canonicalizeLocale("zh"), "zh-CN");
assert.equal(canonicalizeLocale("zh-CN"), "zh-CN");
assert.equal(canonicalizeLocale("zh-cn"), "zh-CN");
assert.equal(canonicalizeLocale("zh_CN"), "zh-CN");
assert.equal(canonicalizeLocale("AR"), "ar");
assert.equal(toPublicLocaleCode("zh-CN"), "zh");

assert.equal(canonicalizeLocale("fr"), "ru");
assert.equal(canonicalizeLocale("en-US"), "ru");
assert.equal(canonicalizeLocale("de"), "ru");
assert.equal(canonicalizeLocale(""), "ru");
assert.equal(canonicalizeLocale("   "), "ru");
assert.equal(canonicalizeLocale(null), "ru");
assert.equal(canonicalizeLocale(undefined), "ru");
assert.equal(canonicalizeLocale(0), "ru");
assert.equal(canonicalizeLocale({}), "ru");
assert.equal(canonicalizeLocale(["en"]), "ru");
assert.equal(canonicalizeLocale("not-a-locale"), "ru");

assert.equal(
  translate("greeting.hello", { locale: "en", dictionaries }),
  "Hello"
);
assert.equal(
  translate("greeting.hello", { locale: "zh", dictionaries }),
  "你好"
);
assert.equal(
  translate("cart.title", { locale: "en", dictionaries }),
  "Корзина"
);
assert.equal(
  translate("missing.key", { locale: "en", dictionaries }),
  MISSING_TRANSLATION_FALLBACK_RU
);
assert.equal(
  translate("missing.key", { locale: "ru", dictionaries }),
  MISSING_TRANSLATION_FALLBACK_RU
);
assert.equal(translate("missing.key"), MISSING_TRANSLATION_FALLBACK_RU);
assert.equal(translate(null, { locale: "en", dictionaries }), MISSING_TRANSLATION_FALLBACK_RU);
assert.equal(translate("", { locale: "ru", dictionaries }), MISSING_TRANSLATION_FALLBACK_RU);
assert.doesNotThrow(() => translate(undefined, { locale: undefined }));
assert.notEqual(translate("missing.key", { locale: "en", dictionaries }), "missing.key");
assert.notEqual(translate("missing.key", { locale: "en", dictionaries }), "");
assert.ok(translate("missing.key", { locale: "en", dictionaries }));

assert.equal(
  translate("checkout.submit", {
    locale: "en",
    dictionaries,
    params: { name: "Clover" },
  }),
  "Place order, Clover"
);
assert.equal(
  translate("checkout.submit", {
    locale: "uz",
    dictionaries,
    params: { name: "Clover" },
  }),
  "Оформить заказ, Clover"
);

const emptyParamDictionaries = {
  en: { "only.param": "{name}" },
  ru: { "only.param": "Имя" },
};
assert.equal(
  translate("only.param", {
    locale: "en",
    dictionaries: emptyParamDictionaries,
    params: { name: null },
  }),
  "Имя"
);
assert.equal(
  translate("only.param", {
    locale: "en",
    dictionaries: { en: { "only.param": "{name}" } },
    params: { name: "" },
  }),
  MISSING_TRANSLATION_FALLBACK_RU
);
assert.equal(
  translate("only.param", {
    locale: "en",
    dictionaries: { en: { "only.param": "{name}" } },
    params: { name: undefined },
  }),
  MISSING_TRANSLATION_FALLBACK_RU
);
assert.notEqual(
  translate("only.param", {
    locale: "en",
    dictionaries: { en: { "only.param": "{name}" } },
    params: { name: null },
  }),
  ""
);
assert.equal(resolveLocale(null), "ru");
assert.equal(resolveLocale(undefined), "ru");
assert.equal(
  resolveLocale({
    surface: "storefront",
    preferredLanguage: "en",
    storedLanguage: "zh",
  }),
  "ru"
);

assert.equal(DEFAULT_LOCALE, "ru");
assert.equal(
  translate("cart.title", { locale: DEFAULT_LOCALE, dictionaries }),
  "Корзина"
);
assert.equal(
  resolveLocale({
    surface: "storefront",
    urlPrefix: null,
    preferredLanguage: null,
    storedLanguage: null,
  }),
  "ru"
);
assert.equal(
  resolveLocale({
    surface: "cabinet",
    preferredLanguage: null,
    storedLanguage: null,
  }),
  "ru"
);

assert.equal(BROWSER_LANGUAGE_AUTO_REDIRECT, false);
assert.equal(
  resolveLocale({
    surface: "storefront",
    browserLanguage: "en",
    acceptLanguage: "en-US,en;q=0.9",
    preferredLanguage: null,
    storedLanguage: null,
  }),
  "ru"
);

assert.equal(PUBLIC_LANGUAGE_PREFIXES_ENABLED, false);
for (const code of ["en", "uz", "ky", "tg", "zh", "ar"]) {
  assert.deepEqual(extractPublicLanguagePrefix(`/${code}`), {
    locale: null,
    pathname: `/${code}`,
  });
  assert.deepEqual(extractPublicLanguagePrefix(`/${code}/catalog`), {
    locale: null,
    pathname: `/${code}/catalog`,
  });
  assert.equal(
    resolveLocale({
      surface: "storefront",
      urlPrefix: code,
      preferredLanguage: null,
      storedLanguage: null,
    }),
    "ru"
  );
}

assert.equal(cabinetPathForLocale("/lk", "en"), "/lk");
assert.equal(cabinetPathForLocale("/lk/client", "zh"), "/lk/client");
assert.equal(cabinetPathForLocale("/lk/manager", "ar"), "/lk/manager");
assert.equal(cabinetPathForLocale("/lk/admin", "uz"), "/lk/admin");

const modeSrc = readSrc("src/screens/storefront/mode.js");
const mainSrc = readSrc("src/main.jsx");
const urlsSrc = readSrc("src/config/urls.js");
assert.doesNotMatch(modeSrc, /PUBLIC_LANGUAGE_PREFIXES_ENABLED|extractPublicLanguagePrefix/);
assert.doesNotMatch(modeSrc, /navigator\.language|Accept-Language/);
assert.doesNotMatch(mainSrc, /navigator\.language|Accept-Language/);
assert.doesNotMatch(modeSrc, /parts\[0\] === ["']en["']/);
assert.match(modeSrc, /if \(parts\[0\] === "catalog"\)/);
assert.match(modeSrc, /if \(parts\[0\] === "contacts"\)/);
assert.match(modeSrc, /if \(parts\[0\] === "aktsii"\)/);
assert.match(modeSrc, /STOREFRONT_INFO_SLUGS/);
assert.match(urlsSrc, /VITE_CABINET_PATH \|\| "\/lk"/);
assert.match(urlsSrc, /export function isCabinetPath/);
assert.match(urlsSrc, /path === prefix \|\| path.startsWith\(`\$\{prefix\}\/`\)/);

console.log("verify-i18n-stage-1: ok");
