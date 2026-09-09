/**
 * Final Stage 3 closure gate: errors, transport, PWA, inventory, catalog.
 * Fail-closed. Does not weaken verify-i18n-stage-3-system-ui.mjs.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";
import { UI_CATALOG, hasCatalogKey } from "../../src/shared/i18n/uiCatalog.js";
import { placeholdersMatch } from "../../src/shared/i18n/placeholderValidation.js";
import {
  getSeedTranslation,
  hasSeedKey,
  listSeedKeys,
} from "../src/i18n/uiTranslationSeed.js";
import { scanSource, AUTHORITY_CALLEE_NAMES } from "./i18n-stage31-ast-scan.mjs";
import {
  DEFAULT_ERROR_DISPLAY_KEY,
  DOMAIN_ERROR_CODES,
  DOMAIN_ERROR_KEY_BY_CODE,
  ERROR_DISPLAY_KEY_BY_CODE,
  PUSH_RESTORE_HINT_KEY,
  TRANSPORT_ERROR_CODES,
  TRANSPORT_ERROR_KEY_BY_CODE,
  codedError,
  displayKeyForErrorCode,
  errorDisplayMessage,
  isKnownErrorCode,
} from "../../src/shared/i18n/errorDisplay.js";
import { PUBLIC_LANGUAGE_PREFIXES_ENABLED } from "../../src/shared/i18n/languageResolver.js";
import { FALLBACK_LOCALE, LANGUAGE_REGISTRY } from "../../src/shared/i18n/languageRegistry.js";
import { MISSING_TRANSLATION_FALLBACK_RU } from "../../src/shared/i18n/translationRuntime.js";

const TARGET_LOCALES = ["en", "uz", "ky", "tg", "zh-CN", "ar"];
const BASE_CATALOG = 1799;
const STAGE32_CLASS = "STAGE32_ERROR_PWA";
const STAGE31_CLASS = "STAGE31_SYSTEM_UI";
const PWA_REASON =
  "static pre-runtime PWA surface has no locale context until Stage 6/7";

const requiredTransportCodes = [
  "TIMEOUT",
  "NETWORK",
  "API_UNAVAILABLE",
  "REQUEST_TOO_LARGE",
  "INVALID_RESPONSE",
  "NO_RESPONSE",
  "REQUEST_FAILED",
];

const CANONICAL_PUSH_REASONS = [
  "registered",
  "unsupported",
  "denied",
  "status_error",
  "ready_timeout",
  "ready_error",
  "sync_error",
  "unexpected_error",
];

const STATIC_PWA_REQUIRED = [
  {
    path: "public/offline.html",
    literals: ["Clover — нет связи", "Нет связи", "Проверьте интернет и попробуйте снова. Clover откроется, как только сеть вернётся.", "Повторить"],
  },
  {
    path: "public/manifest.webmanifest",
    literals: ["Clover — личный кабинет", "Заказы, статусы, документы и связь с менеджером"],
  },
  {
    path: "public/sw.js",
    literals: ["Новое уведомление"],
  },
];

const STAGE3_SURFACES = [
  "src/App.jsx",
  "src/serverApi.js",
  "src/screens/storefront/publicApi.js",
  "src/components",
  "src/shared",
  "src/screens/client",
  "src/screens/manager",
  "src/screens/storefront/components",
  "src/screens/storefront/pages",
  "public/offline.html",
  "public/manifest.webmanifest",
  "public/sw.js",
];

function readRel(rel) {
  return readFileSync(path.join(projectRoot, rel), "utf8");
}

function catalogKeysFromGit(sha) {
  const text = execFileSync("git", ["show", `${sha}:src/shared/i18n/uiCatalog.js`], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const keys = [];
  const re = /"key":\s*"([^"]+)"/g;
  let match = re.exec(text);
  while (match) {
    keys.push(match[1]);
    match = re.exec(text);
  }
  return new Set(keys);
}

const allowlistPath = path.join(projectRoot, "server/scripts/i18n-stage31-residual-allowlist.json");
assert.equal(existsSync(allowlistPath), true, "residual allowlist missing");
const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
assert.ok(Array.isArray(allowlist), "allowlist must be an array");
for (const item of allowlist) {
  assert.ok(item.path && !item.path.includes("*"), `wildcard path forbidden: ${item.path}`);
}

const stage32 = allowlist.filter((item) => item.classification === STAGE32_CLASS);
const stage31 = allowlist.filter((item) => item.classification === STAGE31_CLASS);
assert.equal(stage32.length, 0, `STAGE32_ERROR_PWA must be 0, found ${stage32.length}`);
assert.equal(stage31.length, 0, `STAGE31_SYSTEM_UI must be 0, found ${stage31.length}`);

const pwaInventoryPath = path.join(projectRoot, "server/scripts/i18n-stage32-static-pwa-inventory.json");
assert.equal(existsSync(pwaInventoryPath), true, "PWA static inventory missing from final Stage 3 inventory");
const pwaInventory = JSON.parse(readFileSync(pwaInventoryPath, "utf8"));
assert.ok(Array.isArray(pwaInventory) && pwaInventory.length > 0, "PWA static inventory empty");

const inventoriedPaths = new Set(pwaInventory.map((item) => item.path));
for (const surface of STATIC_PWA_REQUIRED) {
  assert.equal(inventoriedPaths.has(surface.path), true, `PWA surface not inventoried: ${surface.path}`);
  const src = readRel(surface.path);
  for (const literal of surface.literals) {
    assert.equal(src.includes(literal), true, `missing PWA literal in ${surface.path}: ${literal}`);
    const row = pwaInventory.find((item) => item.path === surface.path && item.literal === literal);
    assert.ok(row, `PWA literal not inventoried: ${surface.path} :: ${literal}`);
    assert.equal(row.classification, "SAFE_RU_FALLBACK");
    assert.match(String(row.reason || ""), /Stage 6\/7|no locale context/i);
    assert.match(String(row.reason || ""), /static/i);
  }
}
for (const item of pwaInventory) {
  assert.ok(item.path && !item.path.includes("*"));
  assert.equal(item.classification, "SAFE_RU_FALLBACK");
  assert.match(String(item.reason || ""), /no locale context/i);
  const src = readRel(item.path);
  assert.equal(src.includes(item.literal), true, `stale PWA inventory row: ${item.path} ${item.literal}`);
}

const serverApiSrc = readRel("src/serverApi.js");
for (const code of requiredTransportCodes) {
  assert.match(
    serverApiSrc,
    new RegExp(`["']${code}["']`),
    `serverApi transport code missing: ${code}`
  );
}
assert.match(serverApiSrc, /error\.status\s*=/);
assert.match(serverApiSrc, /error\.payload\s*=/);
assert.match(serverApiSrc, /async function requestBlob/);
assert.match(serverApiSrc, /function makeTransportError/);
assert.match(serverApiSrc, /error\.code\s*=\s*code/);
const blobStart = serverApiSrc.indexOf("async function requestBlob");
const blobEnd = serverApiSrc.indexOf("\nexport const api");
const blobFn = serverApiSrc.slice(blobStart, blobEnd > blobStart ? blobEnd : undefined);
assert.match(blobFn, /makeTransportError/);
assert.match(blobFn, /["']TIMEOUT["']/);
assert.match(blobFn, /["']NETWORK["']/);
assert.match(blobFn, /payload/);

const publicApiSrc = readRel("src/screens/storefront/publicApi.js");
assert.match(publicApiSrc, /error\.code\s*=/);
assert.match(publicApiSrc, /["']NETWORK["']/);
assert.match(publicApiSrc, /["']INVALID_RESPONSE["']/);
assert.match(publicApiSrc, /["']REQUEST_FAILED["']/);

assert.deepEqual([...TRANSPORT_ERROR_CODES], requiredTransportCodes);
for (const code of TRANSPORT_ERROR_CODES) {
  const key = TRANSPORT_ERROR_KEY_BY_CODE[code];
  assert.equal(typeof key, "string");
  assert.equal(hasCatalogKey(key), true, `transport map key missing from catalog: ${code} -> ${key}`);
}
for (const code of DOMAIN_ERROR_CODES) {
  const key = DOMAIN_ERROR_KEY_BY_CODE[code];
  assert.equal(hasCatalogKey(key), true, `domain map key missing from catalog: ${code} -> ${key}`);
}
for (const [code, key] of Object.entries(ERROR_DISPLAY_KEY_BY_CODE)) {
  assert.equal(hasCatalogKey(key), true, `projection map key missing: ${code} -> ${key}`);
  assert.equal(isKnownErrorCode(code), true);
}

const tLookup = (key) => (hasCatalogKey(key) ? `T:${key}` : key);
assert.equal(
  errorDisplayMessage({ code: "TIMEOUT", message: "raw-timeout", status: 0 }, tLookup),
  "T:shared.error.timeout"
);
assert.equal(
  errorDisplayMessage({ code: "NETWORK", message: "raw-network", status: 0 }, tLookup),
  "T:shared.error.network"
);
assert.equal(
  errorDisplayMessage({ message: "Неизвестная сырая ошибка сервера XYZ" }, tLookup),
  `T:${DEFAULT_ERROR_DISPLAY_KEY}`
);
assert.equal(
  errorDisplayMessage({ code: "NOT_A_REAL_CODE", message: "leak-me" }, tLookup),
  `T:${DEFAULT_ERROR_DISPLAY_KEY}`
);
assert.doesNotMatch(
  errorDisplayMessage({ code: "NOT_A_REAL_CODE", message: "shared.error.timeout" }, tLookup),
  /^shared\.error\./
);
assert.equal(displayKeyForErrorCode("NOT_A_REAL_CODE"), "");

const unknownDisplay = errorDisplayMessage({ message: "raw" }, tLookup);
assert.equal(unknownDisplay, `T:${DEFAULT_ERROR_DISPLAY_KEY}`);
assert.equal(hasCatalogKey(unknownDisplay), false, "unknown display must not leak a technical key");
assert.notEqual(unknownDisplay, "NOT_A_REAL_CODE");
assert.notEqual(unknownDisplay, "raw");

const timeoutErr = codedError("TIMEOUT", "Сервер временно недоступен. Попробуйте ещё раз.");
assert.equal(timeoutErr.code, "TIMEOUT");
assert.equal(timeoutErr.status, undefined);
timeoutErr.status = 0;
timeoutErr.payload = { debug: "x" };
assert.equal(timeoutErr.status, 0);
assert.deepEqual(timeoutErr.payload, { debug: "x" });
assert.equal(errorDisplayMessage(timeoutErr, tLookup), "T:shared.error.timeout");
assert.equal(timeoutErr.message.includes("Сервер"), true);

const authorityScan = scanSource(
  `export function save(onSave, t){ onSave({ deliveryNote: t("shared.error.network") }); }`,
  "stage32-unsafe-payload.jsx"
);
assert.ok(authorityScan.authorityUnsafe.length >= 1, "t() must not flow into authority payloads");
assert.equal(AUTHORITY_CALLEE_NAMES.has("selectLinkFilter"), true);

const featureFiles = [
  "src/App.jsx",
  "src/serverApi.js",
  "src/screens/storefront/publicApi.js",
  "src/shared/SharedPanels.jsx",
  "src/shared/pushSync.js",
  "src/shared/productPhoto.js",
  "src/shared/matrixExcelImport.js",
  "src/shared/appHelpers.js",
];
for (const rel of featureFiles) {
  const findings = scanSource(readRel(rel), rel);
  assert.equal(findings.parseError || "", "", `${rel} parse error`);
  assert.deepEqual(findings.authorityUnsafe, [], `authority-unsafe t() in ${rel}`);
}

const pushSrc = readRel("src/shared/pushSync.js");
for (const reason of CANONICAL_PUSH_REASONS) {
  assert.match(
    pushSrc,
    new RegExp(`["']${reason}["']`),
    `push reason missing: ${reason}`
  );
}
const pushSrcNoComments = pushSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
assert.doesNotMatch(
  pushSrcNoComments,
  /Notification\.requestPermission\s*\(/,
  "automatic push lifecycle must not request permission"
);
assert.match(pushSrc, /never call Notification\.requestPermission/);
assert.match(pushSrc, /PUSH_READY_TIMEOUT_MS\s*=\s*4000/);
assert.equal(PUSH_RESTORE_HINT_KEY, "shared.push.restoreHint");
assert.equal(hasCatalogKey(PUSH_RESTORE_HINT_KEY), true);
assert.match(pushSrc, /PUSH_RESTORE_HINT_KEY|shared\.push\.restoreHint/);
assert.doesNotMatch(
  pushSrc,
  /Нажмите «Включить уведомления»/
);
const panelsSrc = readRel("src/shared/SharedPanels.jsx");
assert.match(panelsSrc, /pushRestoreHintMessage\s*\(/);
assert.match(panelsSrc, /errorDisplayMessage\s*\(/);
assert.match(panelsSrc, /t\("shared\.push\.restoreHint"\)/);

assert.doesNotMatch(readRel("src/serverApi.js"), /\bt\(/);
assert.match(readRel("src/shared/productPhoto.js"), /error\.code|codedError/);
assert.match(readRel("src/shared/matrixExcelImport.js"), /error\.code|codedError/);

const futureProduct = allowlist.filter((item) => item.classification === "FUTURE_PRODUCT");
const futureSeo = allowlist.filter((item) => item.classification === "FUTURE_CATEGORY_PAGE_FAQ_SEO");
for (const item of [...futureProduct, ...futureSeo]) {
  assert.ok(item.reason && item.reason.trim(), `unjustified future row ${item.path}`);
  assert.equal(item.path.includes("*"), false);
  const src = existsSync(path.join(projectRoot, item.path)) ? readRel(item.path) : "";
  assert.ok(src.includes(item.literal), `stale future residual: ${item.path} ${item.literal}`);
}

const catalogKeys = new Set(UI_CATALOG.map((entry) => entry.key));
assert.equal(catalogKeys.size, UI_CATALOG.length);
const seedKeys = new Set(listSeedKeys());
assert.equal(seedKeys.size, UI_CATALOG.length, "seed count must equal catalog");
let missing = 0;
let empty = 0;
let placeholderMismatch = 0;
for (const entry of UI_CATALOG) {
  assert.equal(hasSeedKey(entry.key) ? true : false, true, `missing seed ${entry.key}`);
  for (const locale of TARGET_LOCALES) {
    const value = getSeedTranslation(entry.key, locale);
    if (!value) {
      if (value == null) missing += 1;
      else empty += 1;
      continue;
    }
    if (!String(value).trim()) empty += 1;
    if (!placeholdersMatch(entry.sourceRu, value)) placeholderMismatch += 1;
  }
}
assert.equal(missing, 0, "missing target seeds");
assert.equal(empty, 0, "empty target seeds");
assert.equal(placeholderMismatch, 0, "placeholder mismatches");

const baseKeys = catalogKeysFromGit("a285f58add577e67ca1789831af3bc5e484f1ae6");
assert.equal(baseKeys.size, BASE_CATALOG, `base catalog must be ${BASE_CATALOG}`);
const added = [...catalogKeys].filter((key) => !baseKeys.has(key));
const removed = [...baseKeys].filter((key) => !catalogKeys.has(key));
assert.equal(removed.length, 0, `unexpected catalog removals: ${removed.join(", ")}`);
assert.equal(UI_CATALOG.length, BASE_CATALOG + added.length - removed.length);

assert.equal(PUBLIC_LANGUAGE_PREFIXES_ENABLED, false);
assert.equal(FALLBACK_LOCALE, "ru");
assert.equal(LANGUAGE_REGISTRY.ru.alwaysEnabled, true);
for (const code of ["en", "uz", "ky", "tg", "zh-CN", "ar"]) {
  assert.equal(LANGUAGE_REGISTRY[code].alwaysEnabled, false);
}
assert.doesNotMatch(readRel("src/main.jsx"), /allowForeignRuntime/);
assert.doesNotMatch(readRel("src/main.jsx"), /LanguageSelector/);
assert.doesNotMatch(readRel("src/shared/i18n/languageResolver.js"), /PUBLIC_LANGUAGE_PREFIXES_ENABLED\s*=\s*true/);
assert.doesNotMatch(readRel("src/shared/pushSync.js"), /preferred_language/);
assert.doesNotMatch(readRel("src/App.jsx"), /dir\s*=\s*["']rtl["']/);

execFileSync(
  "git",
  ["diff", "--quiet", "a285f58add577e67ca1789831af3bc5e484f1ae6", "--", "package.json", "package-lock.json", "server/package.json", "server/package-lock.json"],
  { cwd: projectRoot, stdio: "pipe" }
);

assert.equal(typeof MISSING_TRANSLATION_FALLBACK_RU, "string");
for (const rel of STAGE3_SURFACES) {
  assert.ok(existsSync(path.join(projectRoot, rel)), `missing Stage 3 surface: ${rel}`);
}

console.log("verify-i18n-stage-3-2: ok");
console.log(`catalog.base=${BASE_CATALOG}`);
console.log(`catalog.added=${added.length}`);
console.log(`catalog.removed=${removed.length}`);
console.log(`catalog.final=${UI_CATALOG.length}`);
console.log(`residual.STAGE32=${stage32.length}`);
console.log(`residual.STAGE31=${stage31.length}`);
console.log(`residual.FUTURE_PRODUCT=${futureProduct.length}`);
console.log(`residual.FUTURE_CATEGORY_PAGE_FAQ_SEO=${futureSeo.length}`);
console.log(`residual.SAFE_RU_FALLBACK=${allowlist.filter((item) => item.classification === "SAFE_RU_FALLBACK").length}`);
console.log(`pwa.inventory=${pwaInventory.length}`);
console.log(`transport.codes=${TRANSPORT_ERROR_CODES.join(",")}`);
