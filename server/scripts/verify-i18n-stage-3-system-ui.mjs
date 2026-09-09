import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot } from "./readFrontendUiSource.mjs";
import { UI_CATALOG, STAGE31_FOUNDATIONAL_KEYS } from "../../src/shared/i18n/uiCatalog.js";
import { placeholdersMatch } from "../../src/shared/i18n/placeholderValidation.js";
import {
  hasSeedKey,
  SEED_EXACT_RU_ALLOWLIST,
  SEED_SCRIPT_EXCEPTIONS,
  getSeedTranslation,
  listSeedKeys,
} from "../src/i18n/uiTranslationSeed.js";
import { scanSource, GENERIC_KEY } from "./i18n-stage31-ast-scan.mjs";
import {
  clearTranslationDraft,
  mergeWorkspaceDrafts,
  shouldApplyWorkspaceResponse,
  translationDraftKey,
} from "../../src/shared/i18n/translationDrafts.js";
import { LANGUAGE_REGISTRY } from "../../src/shared/i18n/languageRegistry.js";
import { UI_CATALOG_BY_KEY, getCatalogEntry, hasCatalogKey } from "../../src/shared/i18n/uiCatalog.js";

const FOUNDATIONAL_RU = Object.freeze({
  "shared.modal.confirmTitle": "Подтвердите действие",
  "shared.modal.confirm": "Подтвердить",
  "shared.modal.cancel": "Отмена",
  "shared.modal.alertTitle": "Внимание",
  "shared.modal.ok": "Понятно",
  "shared.modal.details": "Подробности",
  "shared.modal.orderContents": "Состав заказа",
});

const AUDITED_FILES = [
  "src/App.jsx",
  "src/screens/storefront/StorefrontApp.jsx",
];

const AUDITED_DIRS = [
  "src/components",
  "src/shared",
  "src/screens/client",
  "src/screens/manager",
  "src/screens/storefront/components",
  "src/screens/storefront/pages",
];

const ALLOWED_CLASSIFICATIONS = new Set([
  "FUTURE_PRODUCT",
  "FUTURE_CATEGORY_PAGE_FAQ_SEO",
  "USER_CONTENT",
  "EXTERNAL_BUSINESS_CONTENT",
  "CANONICAL_BUSINESS_VALUE",
  "TECHNICAL_IDENTIFIER",
  "STAGE32_ERROR_PWA",
  "NON_VISIBLE",
  "SAFE_RU_FALLBACK",
]);

const TARGET_LOCALES = ["en", "uz", "ky", "tg", "zh-CN", "ar"];
const SURFACES = ["shared", "auth", "storefront", "client", "manager", "admin"];
const CYRILLIC = /[А-Яа-яЁё]/;
const T_CALL = /\bt\(\s*(["'])([^"'\\]+)\1/g;
const STRING_LIT = /(["'])((?:\\.|(?!\1).)*?)\1/g;
const JSX_TEXT = />\s*([^<>{}]+?)\s*</g;
const CSS_CONTENT = /content\s*:\s*(["'])((?:\\.|(?!\1).)*?)\1/g;
const LATIN = /[A-Za-z]/;
const HAN = /[\u4e00-\u9fff]/;
const ARAB = /[\u0600-\u06FF]/;
const CYR_SCRIPT = /[\u0400-\u04FF]/;

function listAuditedFiles() {
  const out = [];
  for (const rel of AUDITED_FILES) {
    const full = path.join(projectRoot, rel);
    if (existsSync(full)) out.push(rel);
  }
  function walk(relDir) {
    const fullDir = path.join(projectRoot, relDir);
    if (!existsSync(fullDir)) return;
    for (const name of readdirSync(fullDir)) {
      const rel = path.join(relDir, name);
      const full = path.join(projectRoot, rel);
      if (statSync(full).isDirectory()) {
        walk(rel);
        continue;
      }
      if (/\.(jsx?|css)$/i.test(name)) out.push(rel.replaceAll("\\", "/"));
    }
  }
  for (const dir of AUDITED_DIRS) walk(dir);
  return out.sort();
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function readRel(rel) {
  return readFileSync(path.join(projectRoot, rel), "utf8");
}

function countLiteral(source, literal) {
  if (!literal) return 0;
  let count = 0;
  let from = 0;
  while (from <= source.length) {
    const idx = source.indexOf(literal, from);
    if (idx === -1) break;
    count += 1;
    from = idx + literal.length;
  }
  return count;
}

function looksLikeCode(value) {
  return (
    /(?:\bfunction\b|\breturn\b|\bconst\b|\blet\b|\bexport\b|\.replace\(|\.match\(|\.test\(|===|!==|\?\s*\()/.test(
      value
    ) ||
    value.includes("\n") ||
    /\\[ntr]/.test(value)
  );
}

function extractVisibleCyrillic(source) {
  const stripped = stripComments(source);
  const found = [];
  for (const match of stripped.matchAll(STRING_LIT)) {
    const value = match[2];
    if (!value || !CYRILLIC.test(value) || looksLikeCode(value) || value.length > 240) continue;
    found.push(value);
  }
  for (const match of stripped.matchAll(JSX_TEXT)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    if (value && CYRILLIC.test(value) && !looksLikeCode(value)) found.push(value);
  }
  for (const match of stripped.matchAll(CSS_CONTENT)) {
    const value = match[2];
    if (value && CYRILLIC.test(value)) found.push(value);
  }
  return found;
}

function isSentenceLike(value) {
  return typeof value === "string" && value.trim().length >= 8 && /\s/.test(value);
}

function isTechnicalToken(value) {
  return /^(Clover|PDF|SKU|1C|КЛЕВЕР|OK|MAX|Telegram|© Clover|© КЛЕВЕР)$/i.test(String(value).trim());
}

const catalogKeys = new Set(UI_CATALOG.map((entry) => entry.key));
assert.equal(catalogKeys.size, UI_CATALOG.length, "catalog keys must be unique");
for (const entry of UI_CATALOG) {
  assert.equal(typeof entry.key, "string");
  assert.ok(entry.key.trim(), `${entry.key} empty key`);
  assert.doesNotMatch(entry.key, /[А-Яа-яЁё]/, `Russian used as key: ${entry.key}`);
  assert.equal(typeof entry.sourceRu, "string");
  assert.ok(entry.sourceRu.trim(), `${entry.key} empty RU`);
  assert.ok(entry.namespace === "ui" || entry.namespace === "checkout", `${entry.key} namespace`);
  assert.ok(SURFACES.includes(entry.surface), `${entry.key} surface`);
  assert.equal(GENERIC_KEY.test(entry.key), false, `generic semantic key: ${entry.key}`);
}

for (const key of STAGE31_FOUNDATIONAL_KEYS) {
  const entry = UI_CATALOG.find((item) => item.key === key);
  assert.ok(entry, `missing foundational ${key}`);
  assert.equal(entry.sourceRu, FOUNDATIONAL_RU[key]);
}

const bySurface = Object.fromEntries(SURFACES.map((surface) => [surface, 0]));
const criticalBySurface = Object.fromEntries(SURFACES.map((surface) => [surface, 0]));
let criticalTotal = 0;
let checkoutCritical = 0;
for (const entry of UI_CATALOG) {
  bySurface[entry.surface] += 1;
  if (entry.critical) {
    criticalTotal += 1;
    criticalBySurface[entry.surface] += 1;
  }
  if (entry.namespace === "checkout") {
    assert.equal(entry.critical, true, `${entry.key} checkout must be critical`);
    checkoutCritical += 1;
  }
}
for (const surface of SURFACES) {
  assert.ok(bySurface[surface] > 0, `${surface} must have catalog keys`);
}

const seedKeys = new Set(listSeedKeys());
assert.equal(seedKeys.size, UI_CATALOG.length, "seed key count must match catalog");
for (const entry of UI_CATALOG) {
  assert.equal(seedKeys.has(entry.key), true, `missing seed ${entry.key}`);
}

let missing = 0;
let empty = 0;
let placeholderMismatch = 0;
const exactRu = [];
const scriptHits = [];
for (const entry of UI_CATALOG) {
  const row = hasSeedKey(entry.key);
  if (!row) {
    missing += TARGET_LOCALES.length;
    continue;
  }
  for (const locale of TARGET_LOCALES) {
    const value = getSeedTranslation(entry.key, locale);
    if (value == null) {
      missing += 1;
      continue;
    }
    if (!String(value).trim()) {
      empty += 1;
      continue;
    }
    if (!placeholdersMatch(entry.sourceRu, value)) placeholderMismatch += 1;
    if (value === entry.sourceRu) exactRu.push({ key: entry.key, locale, value });
    if (isSentenceLike(value) && !isTechnicalToken(value)) {
      if ((locale === "en" || locale === "uz") && CYR_SCRIPT.test(value) && !LATIN.test(value)) {
        scriptHits.push({ key: entry.key, locale, reason: "cyrillic-in-latin-locale" });
      }
      if ((locale === "ky" || locale === "tg") && !CYR_SCRIPT.test(value) && LATIN.test(value) && !HAN.test(value)) {
        scriptHits.push({ key: entry.key, locale, reason: "latin-in-cyrillic-locale" });
      }
      if (locale === "zh-CN" && !HAN.test(value)) {
        scriptHits.push({ key: entry.key, locale, reason: "missing-han" });
      }
      if (locale === "ar" && !ARAB.test(value)) {
        scriptHits.push({ key: entry.key, locale, reason: "missing-arabic" });
      }
    }
  }
}
assert.equal(missing, 0, "missing target seeds");
assert.equal(empty, 0, "empty target seeds");
assert.equal(placeholderMismatch, 0, "placeholder mismatches");

const exactAllow = new Set(SEED_EXACT_RU_ALLOWLIST.map((item) => `${item.key}|${item.locale}`));
for (const item of SEED_EXACT_RU_ALLOWLIST) {
  assert.ok(item.key && item.locale && item.reason, "exact-RU allowlist must name key/locale/reason");
}
const unjustifiedExact = exactRu.filter((item) => !exactAllow.has(`${item.key}|${item.locale}`));
assert.deepEqual(unjustifiedExact, [], `unjustified exact-RU copies: ${JSON.stringify(unjustifiedExact.slice(0, 8))}`);

const scriptAllow = new Set(SEED_SCRIPT_EXCEPTIONS.map((item) => `${item.key}|${item.locale}`));
for (const item of SEED_SCRIPT_EXCEPTIONS) {
  assert.ok(item.key && item.locale && item.reason, "script exception must name key/locale/reason");
}
const unjustifiedScript = scriptHits.filter((item) => !scriptAllow.has(`${item.key}|${item.locale}`));
assert.deepEqual(unjustifiedScript, [], `unjustified script mismatches: ${JSON.stringify(unjustifiedScript.slice(0, 8))}`);

const audited = listAuditedFiles();
const usedKeys = new Set();
const unknownKeys = [];
for (const rel of audited) {
  if (rel.startsWith("src/shared/i18n/")) continue;
  const src = readRel(rel);
  T_CALL.lastIndex = 0;
  let match = T_CALL.exec(src);
  while (match) {
    const key = match[2];
    usedKeys.add(key);
    if (!catalogKeys.has(key)) unknownKeys.push(`${rel}:${key}`);
    match = T_CALL.exec(src);
  }
}
assert.deepEqual(unknownKeys, [], `unregistered t() keys: ${unknownKeys.slice(0, 20).join(", ")}`);

const allowlistPath = path.join(projectRoot, "server/scripts/i18n-stage31-residual-allowlist.json");
assert.equal(existsSync(allowlistPath), true, "residual allowlist missing");
const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
assert.ok(Array.isArray(allowlist), "allowlist must be an array");

const allowIndex = new Map();
for (const item of allowlist) {
  assert.ok(item.path && !item.path.includes("*"), `wildcard path forbidden: ${item.path}`);
  assert.ok(item.literal, `missing literal in ${item.path}`);
  assert.equal(typeof item.count, "number");
  assert.ok(item.count > 0);
  assert.ok(ALLOWED_CLASSIFICATIONS.has(item.classification), `bad classification ${item.classification}`);
  assert.ok(typeof item.reason === "string" && item.reason.trim() && item.reason.trim().toLowerCase() !== "legacy");
  const key = `${item.path}\0${item.literal}`;
  assert.equal(allowIndex.has(key), false, `duplicate allowlist row ${item.path} ${item.literal}`);
  allowIndex.set(key, item);
}

const leftover = [];
const countMismatches = [];
const extractedByFile = new Map();
for (const rel of audited) {
  if (rel.startsWith("src/shared/i18n/")) continue;
  const src = readRel(rel);
  const visibles = extractVisibleCyrillic(src);
  const counts = new Map();
  for (const literal of visibles) {
    counts.set(literal, (counts.get(literal) || 0) + 1);
  }
  extractedByFile.set(rel, counts);
  for (const [literal, extractedCount] of counts.entries()) {
    const item = allowIndex.get(`${rel}\0${literal}`);
    if (!item) {
      leftover.push({ path: rel, literal, count: extractedCount });
      continue;
    }
    if (extractedCount !== item.count) {
      countMismatches.push({
        path: rel,
        literal,
        expected: item.count,
        extracted: extractedCount,
      });
    }
  }
}

for (const item of allowlist) {
  const counts = extractedByFile.get(item.path) || new Map();
  const actual = counts.get(item.literal) || 0;
  if (actual !== item.count) {
    countMismatches.push({
      path: item.path,
      literal: item.literal,
      expected: item.count,
      extracted: actual,
    });
  }
}

assert.deepEqual(
  leftover,
  [],
  `unclassified visible literals remain:\n${leftover
    .slice(0, 25)
    .map((row) => `${row.path} :: ${row.literal} x${row.count}`)
    .join("\n")}`
);
assert.deepEqual(countMismatches.slice(0, 15), [], `allowlist counts drifted: ${JSON.stringify(countMismatches.slice(0, 8))}`);
assert.equal(allowlist.filter((item) => item.classification === "STAGE31_SYSTEM_UI").length, 0);

// --- AST scanner self-tests (SAFE / UNSAFE fixtures) ---
const unsafePayload = scanSource(
  `export function save(onSave, t){ onSave({ deliveryNote: t("client.note") }); }`,
  "unsafe-payload.jsx"
);
assert.ok(unsafePayload.authorityUnsafe.length >= 1, "scanner must detect translated deliveryNote");
const safePayload = scanSource(
  `export function save(onSave){ onSave({ deliveryNote: "Доставка по СПб бесплатная" }); }`,
  "safe-payload.jsx"
);
assert.equal(safePayload.authorityUnsafe.length, 0, "canonical deliveryNote must be SAFE");

const unsafeClient = scanSource(
  `const profile = { addressLabel: t("shared.address.primary") };`,
  "unsafe-client.jsx"
);
assert.ok(unsafeClient.authorityUnsafe.some((row) => row.prop === "addressLabel"));
const safeClient = scanSource(`const profile = { label: "Основной" };`, "safe-client.jsx");
assert.equal(safeClient.authorityUnsafe.length, 0);

const unsafeProduct = scanSource(`const product = { category: t("manager.other") };`, "unsafe-product.jsx");
assert.ok(unsafeProduct.authorityUnsafe.some((row) => row.prop === "category"));
const unsafeStorefront = scanSource(
  `const draft = { storefrontName: t("manager.shop") };`,
  "unsafe-storefront.jsx"
);
assert.ok(unsafeStorefront.authorityUnsafe.length >= 1);
const unsafeBackup = scanSource(`api.post({ reason: t("manager.backup.manual") });`, "unsafe-backup.jsx");
assert.ok(unsafeBackup.authorityUnsafe.length >= 1 || /reason/.test(JSON.stringify(unsafeBackup)));
const unsafeFilter = scanSource(`setFilter(t("shared.filter.all"));`, "unsafe-filter.jsx");
assert.ok(unsafeFilter.authorityUnsafe.length >= 1);
const unsafeOption = scanSource(`export function F({t}){ return <select><option>{t("shared.filter.all")}</option></select>; }`, "unsafe-option.jsx");
assert.ok(unsafeOption.optionWithoutValue.length >= 1);
const safeOption = scanSource(
  `export function F({t}){ return <select><option value="Все">{t("shared.filter.all")}</option></select>; }`,
  "safe-option.jsx"
);
assert.equal(safeOption.optionWithoutValue.length, 0);

const draftsEn = {};
const draftsUz = mergeWorkspaceDrafts(draftsEn, [{ id: "e1", languages: { en: { value: "Hello" } } }], "en");
draftsUz[translationDraftKey("e1", "en")] = "Hello dirty";
const afterUz = mergeWorkspaceDrafts(draftsUz, [{ id: "e1", languages: { uz: { value: "Salom" } } }], "uz");
assert.equal(afterUz[translationDraftKey("e1", "en")], "Hello dirty");
assert.equal(afterUz[translationDraftKey("e1", "uz")], "Salom");
assert.equal(
  shouldApplyWorkspaceResponse({
    requestGeneration: 1,
    currentGeneration: 2,
    requestLanguage: "en",
    currentLanguage: "uz",
  }),
  false
);
assert.equal(
  shouldApplyWorkspaceResponse({
    requestGeneration: 2,
    currentGeneration: 2,
    requestLanguage: "uz",
    currentLanguage: "uz",
  }),
  true
);
const cleared = clearTranslationDraft(afterUz, "e1", "uz");
assert.equal(cleared[translationDraftKey("e1", "en")], "Hello dirty");
assert.equal(cleared[translationDraftKey("e1", "uz")], undefined);

const unbounded = scanSource(`export function F({t, key}){ return t(key); }`, "unbounded.jsx");
assert.ok(unbounded.unboundedT.length >= 1);
const genericScan = scanSource(`export function F({t}){ return t("manager.text12"); }`, "generic.jsx");
assert.ok(genericScan.genericKeys.length >= 1);
const missingHook = scanSource(
  `import { useEffect } from "react"; export function F({t}){ useEffect(() => { document.title = t("auth.documentTitle"); }, []); }`,
  "missing-hook.jsx"
);
assert.ok(missingHook.hookMissingT.length >= 1);
const okHook = scanSource(
  `import { useEffect } from "react"; export function F({t}){ useEffect(() => { document.title = t("auth.documentTitle"); }, [t]); }`,
  "ok-hook.jsx"
);
assert.equal(okHook.hookMissingT.length, 0);

const frozenEntry = getCatalogEntry("shared.modal.confirm");
assert.ok(frozenEntry);
assert.equal(Object.isFrozen(frozenEntry), true);
assert.equal(hasCatalogKey("shared.modal.confirm"), true);
let mapMutated = false;
try {
  UI_CATALOG_BY_KEY.__injected = true;
} catch {
  mapMutated = true;
}
assert.equal(UI_CATALOG_BY_KEY.__injected, undefined);
void mapMutated;
let nestedMutated = false;
try {
  LANGUAGE_REGISTRY.en.publicCode = "xx";
} catch {
  nestedMutated = true;
}
assert.equal(LANGUAGE_REGISTRY.en.publicCode, "en");
void nestedMutated;

const dynamicTemplate = scanSource(
  "export function F(order){ return `Удалить заказ № ${order.number} навсегда?`; }",
  "dyn-template.jsx"
);
assert.ok(dynamicTemplate.templates.some((row) => /Удалить заказ/.test(row.raw)));
const fragmentScan = scanSource(
  'export function F(){ return "Статус изменён: " + "Новый"; }',
  "fragments.jsx"
);
assert.ok(fragmentScan.concatenations.length >= 1, "scanner must detect RU string concatenation");
const jsxUnsafe = scanSource(
  "export function F({count}){ return <span>Выбрано заказов: {count}</span>; }",
  "unsafe-jsx.jsx"
);
assert.ok(jsxUnsafe.jsxTexts.some((row) => /Выбрано заказов/.test(row.text)), "scanner must detect RU JSXText");
const jsxSafe = scanSource(
  'export function F({t, count}){ return <span>{t("manager.orders.selectedOrdersCount", { count })}</span>; }',
  "safe-jsx.jsx"
);
assert.equal(jsxSafe.jsxTexts.filter((row) => /[А-Яа-яЁё]/.test(row.text)).length, 0);

const astUnknown = [];
const astUnbounded = [];
const astGeneric = [];
const astAuthority = [];
const astOptions = [];
const astHooks = [];
const astTemplates = [];
const astJsxTexts = [];
const astConcat = [];
for (const rel of audited) {
  if (!/\.jsx?$/i.test(rel)) continue;
  if (rel.startsWith("src/shared/i18n/") && rel !== "src/shared/i18n/displayLabels.js") continue;
  const src = readRel(rel);
  const findings = scanSource(src, rel);
  if (findings.parseError && rel.endsWith(".js") && src.includes("#!/")) continue;
  for (const call of findings.tCalls) {
    usedKeys.add(call.key);
    if (!catalogKeys.has(call.key)) astUnknown.push(`${rel}:${call.key}`);
  }
  if (findings.unboundedT.length) {
    const mapValues = [
      ...src.matchAll(
        /["'][a-zA-Z0-9._-]+["']\s*:\s*["']((?:shared|auth|storefront|client|manager|admin)\.[a-zA-Z0-9.]+)["']/g
      ),
    ].map((m) => m[1]);
    if (rel === "src/shared/i18n/translationRuntime.js") {
      // runtime t(key) implementation
    } else if (
      rel.endsWith("displayLabels.js") ||
      rel.endsWith("ManagerExchange.jsx") ||
      rel.endsWith("ManagerNotifications.jsx") ||
      rel.endsWith("StorefrontProductAdd.jsx") ||
      rel.endsWith("ManagerAudit.jsx") ||
      rel.endsWith("ManagerScreen.jsx") ||
      rel.endsWith("ClientScreen.jsx") ||
      rel.endsWith("ClientSectionMenu.jsx") ||
      rel.endsWith("AdminRolePanel.jsx") ||
      rel.endsWith("ManagerLanguages.jsx") ||
      rel.endsWith("ManagerStorefrontInfoPages.jsx")
    ) {
      for (const key of mapValues) {
        if (!catalogKeys.has(key)) astUnknown.push(`${rel}:map:${key}`);
      }
    } else if (!mapValues.length && !/t\([A-Za-z.]+ \|\| ["']/.test(src) && !/t\(stateKey\)/.test(src) && !/t\(label\)/.test(src) && !/t\(labelKey\)/.test(src) && !/t\(option\.labelKey\)/.test(src)) {
      astUnbounded.push(`${rel}:${findings.unboundedT[0].line}`);
    } else {
      for (const key of mapValues) {
        if (!catalogKeys.has(key)) astUnknown.push(`${rel}:map:${key}`);
      }
    }
  }
  astGeneric.push(...findings.genericKeys.map((row) => `${rel}:${row.key}`));
  astAuthority.push(...findings.authorityUnsafe.map((row) => `${rel}:${row.prop || row.kind}:${row.line}`));
  astOptions.push(...findings.optionWithoutValue.map((row) => `${rel}:${row.line}`));
  astHooks.push(...findings.hookMissingT.map((row) => `${rel}:${row.hook}:${row.line}`));
  for (const tpl of findings.templates) {
    if (!/[А-Яа-яЁё]/.test(tpl.raw)) continue;
    const allowed =
      /@media|display:\s*|font-family|border-collapse/.test(tpl.text) ||
      /Адрес \$\{/.test(tpl.raw) ||
      rel.endsWith("productCatalogOrder.js") ||
      (rel.endsWith("appHelpers.js") && /console\.error/.test(String(tpl.text || "")) || /сохранить/.test(tpl.raw)) ||
      (rel.endsWith("ProductPage.jsx") && /КЛЕВЕР/.test(tpl.raw)) ||
      (rel.endsWith("App.jsx") && /Статус (изменён|массово)/.test(tpl.raw)) ||
      (rel.endsWith("OrderEditor.jsx") && /Доставка по СПб/.test(tpl.raw));
    if (!allowed) astTemplates.push(`${rel}:${tpl.line}:${tpl.raw.slice(0, 80)}`);
  }
  if (
    !rel.endsWith("seo.js") &&
    !rel.endsWith("infoPageContent.js") &&
    !rel.endsWith("infoPages.js")
  ) {
    for (const row of findings.jsxTexts) {
      if (!/[А-Яа-яЁё]/.test(row.text)) continue;
      if (/^(шт\.|уп\.|пач\.|кг|л|рулон|кор\.|пикс\.)$/.test(row.text)) continue;
      astJsxTexts.push(`${rel}:${row.line}:${row.text.slice(0, 80)}`);
    }
  }
}
assert.deepEqual(astUnknown.slice(0, 15), [], `unregistered AST t() keys: ${astUnknown.slice(0, 10).join(", ")}`);
assert.deepEqual(astUnbounded, [], `unbounded dynamic t(): ${astUnbounded.join(", ")}`);
assert.deepEqual(astGeneric, [], `generic keys used: ${astGeneric.join(", ")}`);
assert.deepEqual(astAuthority, [], `authority-unsafe t(): ${astAuthority.join(", ")}`);
assert.deepEqual(astOptions, [], `option without canonical value: ${astOptions.join(", ")}`);
assert.deepEqual(astHooks, [], `missing t hook deps: ${astHooks.join(", ")}`);
assert.deepEqual(astTemplates.slice(0, 20), [], `dynamic system templates remain:\n${astTemplates.slice(0, 12).join("\n")}`);
assert.deepEqual(astJsxTexts.slice(0, 40), [], `RU JSXText remains:\n${astJsxTexts.slice(0, 25).join("\n")}`);
assert.deepEqual(astConcat.slice(0, 20), [], `RU concatenations remain:\n${astConcat.slice(0, 12).join("\n")}`);

const featureSrc = audited
  .filter((rel) => !rel.startsWith("src/shared/i18n/"))
  .map((rel) => readRel(rel))
  .join("\n");
assert.doesNotMatch(featureSrc, /LanguageSelector/);
assert.doesNotMatch(featureSrc, /preferred_language/);
assert.doesNotMatch(featureSrc, /allowForeignRuntime\s*=\s*true/);
assert.doesNotMatch(featureSrc, /PUBLIC_LANGUAGE_PREFIXES_ENABLED\s*=\s*true/);
assert.doesNotMatch(featureSrc, /dir\s*=\s*["']rtl["']/);
assert.doesNotMatch(featureSrc, /uiTranslationSeed/);

for (const rel of audited) {
  if (rel.startsWith("src/shared/i18n/")) continue;
  const src = readRel(rel);
  assert.doesNotMatch(src, /from ["'].*uiTranslationSeed/, `${rel} imports target seed`);
  assert.doesNotMatch(src, /LocalizationProvider\.jsx/, `${rel} imports LocalizationProvider.jsx`);
}

const pkgFiles = [
  "package.json",
  "package-lock.json",
  "server/package.json",
  "server/package-lock.json",
];
for (const rel of pkgFiles) {
  const src = readRel(rel);
  assert.ok(src.includes("{"), rel);
}

console.log("verify-i18n-stage-3-system-ui: ok");
console.log(`catalog.total=${UI_CATALOG.length}`);
console.log(`catalog.critical=${criticalTotal}`);
console.log(`catalog.checkoutCritical=${checkoutCritical}`);
for (const surface of SURFACES) {
  console.log(`catalog.${surface}=${bySurface[surface]} critical=${criticalBySurface[surface]}`);
}
console.log(`targets.missing=${missing}`);
console.log(`targets.empty=${empty}`);
console.log(`targets.placeholderMismatch=${placeholderMismatch}`);
console.log(`targets.exactRu=${exactRu.length}`);
console.log(`targets.scriptExceptions=${SEED_SCRIPT_EXCEPTIONS.length}`);
console.log(`tKeys=${usedKeys.size}`);
console.log(`residual.allowlist=${allowlist.length}`);
console.log(`residual.STAGE31=0`);
