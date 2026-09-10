import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
import { scanSource, GENERIC_KEY, AUTHORITY_CALLEE_NAMES } from "./i18n-stage31-ast-scan.mjs";
import {
  clearTranslationDraft,
  markDraftClean,
  mergeWorkspaceDrafts,
  readDraftValue,
  setDraftValue,
  shouldApplyWorkspaceResponse,
  translationDraftKey,
} from "../../src/shared/i18n/translationDrafts.js";
import {
  backupReasonLabel,
  DISPLAY_PROJECTION_MAPS,
  orderHistoryLabel,
  reconciliationPeriodDisplayLabel,
  reconciliationStatusLabel,
} from "../../src/shared/i18n/displayLabels.js";
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
const exactFound = new Set(exactRu.map((item) => `${item.key}|${item.locale}`));
const staleExact = SEED_EXACT_RU_ALLOWLIST.filter((item) => !exactFound.has(`${item.key}|${item.locale}`));
assert.deepEqual(staleExact, [], `stale exact-RU allowlist rows: ${JSON.stringify(staleExact.slice(0, 8))}`);
const scriptFound = new Set(scriptHits.map((item) => `${item.key}|${item.locale}`));
const staleScript = SEED_SCRIPT_EXCEPTIONS.filter((item) => !scriptFound.has(`${item.key}|${item.locale}`));
assert.deepEqual(staleScript, [], `stale script exception rows: ${JSON.stringify(staleScript.slice(0, 8))}`);

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

const draftsEn = mergeWorkspaceDrafts({}, [{ id: "e1", languages: { en: { value: "Hello" } } }], "en");
assert.equal(Object.keys(draftsEn).length, 0);
const draftsDirtyEn = setDraftValue(draftsEn, "e1", "en", "Hello dirty", true);
const afterUz = mergeWorkspaceDrafts(draftsDirtyEn, [{ id: "e1", languages: { uz: { value: "Salom" } } }], "uz");
assert.equal(readDraftValue(afterUz, "e1", "en"), "Hello dirty");
assert.equal(readDraftValue(afterUz, "e1", "uz"), "");
assert.equal(readDraftValue(afterUz, "e1", "uz", "Salom"), "Salom");
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
assert.equal(readDraftValue(cleared, "e1", "en"), "Hello dirty");
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

const CATALOG_KEY_RE = /(?:shared|auth|storefront|client|manager|admin)\.[a-zA-Z0-9.]+/;

function catalogKeysFromGit(sha) {
  const src = execFileSync("git", ["show", `${sha}:src/shared/i18n/uiCatalog.js`], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  return new Set([...src.matchAll(/"key":\s*"([^"]+)"/g)].map((match) => match[1]));
}

function deltaSets(oldSet, newSet) {
  const added = [...newSet].filter((key) => !oldSet.has(key)).sort();
  const removed = [...oldSet].filter((key) => !newSet.has(key)).sort();
  const unchanged = [...oldSet].filter((key) => newSet.has(key)).sort();
  assert.equal(
    oldSet.size + added.length - removed.length,
    newSet.size,
    `catalog arithmetic failed old=${oldSet.size} added=${added.length} removed=${removed.length} new=${newSet.size}`
  );
  return { added, removed, unchanged };
}

function extractTupleCatalogKeys(src, exportName) {
  const match = src.match(new RegExp(`(?:export\\s+)?const\\s+${exportName}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if (!match) return [];
  return [...match[1].matchAll(/,\s*["']((?:shared|auth|storefront|client|manager|admin)\.[a-zA-Z0-9.]+)["']/g)].map(
    (row) => row[1]
  );
}

function extractObjectCatalogKeys(src, exportName) {
  const match = src.match(new RegExp(`(?:export\\s+)?const\\s+${exportName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!match) return [];
  return [...match[1].matchAll(/:\s*["']((?:shared|auth|storefront|client|manager|admin)\.[a-zA-Z0-9.]+)["']/g)].map(
    (row) => row[1]
  );
}

const appHelpersSrc = readRel("src/shared/appHelpers.js");
const TUPLE_MAP_OWNERS = {
  CLIENT_TABS: extractTupleCatalogKeys(appHelpersSrc, "CLIENT_TABS"),
  CLIENT_CABINET_SECTIONS: extractTupleCatalogKeys(appHelpersSrc, "CLIENT_CABINET_SECTIONS"),
  MANAGER_TABS: extractTupleCatalogKeys(appHelpersSrc, "MANAGER_TABS"),
  MANAGER_MORE_TABS: extractTupleCatalogKeys(appHelpersSrc, "MANAGER_MORE_TABS"),
  STAFF_FEATURE_OPTIONS: extractTupleCatalogKeys(appHelpersSrc, "STAFF_FEATURE_OPTIONS"),
};
for (const [name, keys] of Object.entries(TUPLE_MAP_OWNERS)) {
  assert.ok(keys.length > 0, `missing tuple map ${name}`);
  for (const key of keys) {
    assert.equal(catalogKeys.has(key), true, `${name} has unknown catalog key ${key}`);
  }
}

function proveFiniteDynamicT(rel, src, row) {
  const text = String(row.text || "");
  if (rel === "src/shared/i18n/translationRuntime.js") return true;
  if (rel.endsWith("displayLabels.js") && /\bt\(\s*(key|known)\s*[,)]/.test(text)) {
    const mapValues = Object.values(DISPLAY_PROJECTION_MAPS).flatMap((map) => Object.values(map));
    return mapValues.every((key) => catalogKeys.has(key));
  }
  if (/AUDIT_ACTION_LABELS\s*\[/.test(text)) {
    const keys = extractObjectCatalogKeys(
      readRel("src/screens/manager/ManagerAudit.jsx"),
      "AUDIT_ACTION_LABELS"
    );
    return keys.length > 0 && keys.every((key) => catalogKeys.has(key));
  }
  const member = text.match(/\bt\(\s*([A-Z][A-Z0-9_]*)\s*\[/);
  if (member) {
    const localKeys = extractObjectCatalogKeys(src, member[1]);
    const importedKeys =
      member[1] === "AUDIT_ACTION_LABELS"
        ? extractObjectCatalogKeys(readRel("src/screens/manager/ManagerAudit.jsx"), "AUDIT_ACTION_LABELS")
        : [];
    const keys = localKeys.length ? localKeys : importedKeys;
    if (keys.length > 0) return keys.every((key) => catalogKeys.has(key));
  }
  if (/\bt\(\s*label\s*\)/.test(text)) {
    if (rel.endsWith("ClientSectionMenu.jsx")) {
      return TUPLE_MAP_OWNERS.CLIENT_TABS.every((key) => catalogKeys.has(key));
    }
    return Object.keys(TUPLE_MAP_OWNERS).some((name) => src.includes(name));
  }
  if (/\bt\(\s*stateKey\s*\)/.test(text)) {
    const assigned = [
      ...src.matchAll(
        /const stateKey\s*=[\s\S]{0,400}?["']((?:shared|auth|storefront|client|manager|admin)\.[a-zA-Z0-9.]+)["']/g
      ),
    ].map((m) => m[1]);
    return assigned.length > 0 && assigned.every((key) => catalogKeys.has(key));
  }
  if (/\bt\(\s*(?:option|meta)\.labelKey\s*\)/.test(text) || /\bt\(\s*meta\?\.labelKey\s*\)/.test(text)) {
    const keys = [...src.matchAll(/labelKey:\s*["']((?:shared|auth|storefront|client|manager|admin)\.[a-zA-Z0-9.]+)["']/g)].map(
      (m) => m[1]
    );
    return keys.length > 0 && keys.every((key) => catalogKeys.has(key));
  }
  if (/\bt\(\s*SHEET_TITLE_KEYS\s*\[/.test(text)) {
    const keys = extractObjectCatalogKeys(src, "SHEET_TITLE_KEYS");
    return keys.length > 0 && keys.every((key) => catalogKeys.has(key));
  }
  return false;
}

const TEMPLATE_EXCEPTIONS = [
  {
    path: "src/App.jsx",
    pattern: "Статус изменён: ${}",
    expectedCount: 1,
    classification: "CANONICAL_BUSINESS_VALUE",
    reason: "persisted order-history label construction; UI display uses orderHistoryLabel",
  },
  {
    path: "src/App.jsx",
    pattern: "Статус массово изменён: ${}",
    expectedCount: 1,
    classification: "CANONICAL_BUSINESS_VALUE",
    reason: "persisted bulk order-history label construction; UI display uses orderHistoryLabel",
  },
  {
    path: "src/screens/client/OrderEditor.jsx",
    pattern: "Доставка по СПб платная:",
    expectedCount: 1,
    classification: "CANONICAL_BUSINESS_VALUE",
    reason: "canonical paid-delivery note written into the order payload; identity remains BASE RU",
  },
  {
    path: "src/screens/manager/ManagerClients.jsx",
    pattern: "Адрес ${}",
    expectedCount: 2,
    classification: "CANONICAL_BUSINESS_VALUE",
    reason: "constructs canonical numbered address labels; visible UI uses addressLabel",
  },
  {
    path: "src/shared/productCatalogOrder.js",
    pattern: "мл",
    expectedCount: 1,
    classification: "TECHNICAL_IDENTIFIER",
    reason: "UOM millilitre detector regex, not user-visible system chrome",
  },
  {
    path: "src/screens/storefront/pages/ProductPage.jsx",
    pattern: "| КЛЕВЕР",
    expectedCount: 1,
    classification: "FUTURE_CATEGORY_PAGE_FAQ_SEO",
    reason: "storefront product document.title brand suffix owned by later SEO stage",
  },
  {
    path: "src/screens/storefront/pages/ProductPage.jsx",
    pattern: "Купить «${}» в каталоге компании КЛЕВЕР.",
    expectedCount: 1,
    classification: "FUTURE_CATEGORY_PAGE_FAQ_SEO",
    reason: "storefront product meta description template owned by later SEO stage",
  },
];

const CONCAT_EXCEPTIONS = [];

function normalizeTemplateRaw(raw) {
  return String(raw || "").replace(/\$\{\}/g, "${}");
}

const astUnknown = [];
const astUnbounded = [];
const astGeneric = [];
const astAuthority = [];
const astOptions = [];
const astHooks = [];
const astTemplates = [];
const astJsxTexts = [];
const astConcat = [];
const astParseErrors = [];
const astForeign = [];
const templateHits = new Map(TEMPLATE_EXCEPTIONS.map((item) => [`${item.path}\0${item.pattern}`, 0]));

for (const rel of audited) {
  if (!/\.jsx?$/i.test(rel)) continue;
  if (rel.startsWith("src/shared/i18n/") && rel !== "src/shared/i18n/displayLabels.js") continue;
  let src = readRel(rel);
  if (src.startsWith("#!")) src = src.replace(/^#!.*\n/, "");
  const findings = scanSource(src, rel);
  if (findings.parseError) {
    astParseErrors.push(`${rel}:${findings.parseError}`);
    continue;
  }
  astConcat.push(...findings.concatenations.map((row) => `${rel}:${row.line}:${row.text}`));
  astForeign.push(...(findings.foreignActivation || []).map((row) => `${rel}:${row.kind}:${row.line}`));
  for (const call of findings.tCalls) {
    usedKeys.add(call.key);
    if (!catalogKeys.has(call.key)) astUnknown.push(`${rel}:${call.key}`);
  }
  for (const row of findings.unboundedT) {
    if (!proveFiniteDynamicT(rel, src, row)) {
      astUnbounded.push(`${rel}:${row.line}:${row.text}`);
    }
  }
  astGeneric.push(...findings.genericKeys.map((row) => `${rel}:${row.key}`));
  astAuthority.push(...findings.authorityUnsafe.map((row) => `${rel}:${row.prop || row.kind}:${row.line}`));
  astOptions.push(...findings.optionWithoutValue.map((row) => `${rel}:${row.line}`));
  astHooks.push(...findings.hookMissingT.map((row) => `${rel}:${row.hook}:${row.line}`));
  for (const tpl of findings.templates) {
    if (!/[А-Яа-яЁё]/.test(tpl.raw)) continue;
    if (/@media|display:\s*|font-family|border-collapse/.test(tpl.text)) continue;
    const raw = normalizeTemplateRaw(tpl.raw);
    const exception = TEMPLATE_EXCEPTIONS.find(
      (item) => item.path === rel && item.pattern && (raw.includes(item.pattern) || raw === item.pattern)
    );
    if (exception) {
      const key = `${exception.path}\0${exception.pattern}`;
      templateHits.set(key, (templateHits.get(key) || 0) + 1);
      continue;
    }
    astTemplates.push(`${rel}:${tpl.line}:${tpl.raw.slice(0, 80)}`);
  }
  if (!rel.endsWith("seo.js") && !rel.endsWith("infoPageContent.js") && !rel.endsWith("infoPages.js")) {
    for (const row of findings.jsxTexts) {
      if (!/[А-Яа-яЁё]/.test(row.text)) continue;
      if (/^(шт\.|уп\.|пач\.|кг|л|рулон|кор\.|пикс\.)$/.test(row.text)) continue;
      astJsxTexts.push(`${rel}:${row.line}:${row.text.slice(0, 80)}`);
    }
  }
}

assert.deepEqual(astParseErrors, [], `AST parse errors must fail verification:\n${astParseErrors.join("\n")}`);
assert.deepEqual(astUnknown.slice(0, 15), [], `unregistered AST t() keys: ${astUnknown.slice(0, 10).join(", ")}`);
assert.deepEqual(astUnbounded, [], `unbounded dynamic t(): ${astUnbounded.join(", ")}`);
assert.deepEqual(astGeneric, [], `generic keys used: ${astGeneric.join(", ")}`);
assert.deepEqual(astAuthority, [], `authority-unsafe t(): ${astAuthority.join(", ")}`);
assert.deepEqual(astOptions, [], `option without canonical value: ${astOptions.join(", ")}`);
assert.deepEqual(astHooks, [], `missing t hook deps: ${astHooks.join(", ")}`);
assert.deepEqual(astTemplates.slice(0, 20), [], `dynamic system templates remain:\n${astTemplates.slice(0, 12).join("\n")}`);
assert.deepEqual(astJsxTexts.slice(0, 40), [], `RU JSXText remains:\n${astJsxTexts.slice(0, 25).join("\n")}`);

const concatLeftover = [];
const concatHits = new Map(CONCAT_EXCEPTIONS.map((item) => [`${item.path}\0${item.pattern}`, 0]));
for (const row of astConcat) {
  const [rel, line, ...rest] = row.split(":");
  const text = rest.join(":");
  const exception = CONCAT_EXCEPTIONS.find((item) => item.path === rel && text.includes(item.pattern));
  if (exception) {
    const key = `${exception.path}\0${exception.pattern}`;
    concatHits.set(key, (concatHits.get(key) || 0) + 1);
    continue;
  }
  concatLeftover.push(row);
}
assert.deepEqual(concatLeftover.slice(0, 20), [], `RU concatenations remain:\n${concatLeftover.slice(0, 12).join("\n")}`);
for (const item of TEMPLATE_EXCEPTIONS) {
  if (!item.pattern) continue;
  const actual = templateHits.get(`${item.path}\0${item.pattern}`) || 0;
  assert.equal(actual, item.expectedCount, `stale template exception ${item.path} ${item.pattern}: ${actual}!=${item.expectedCount}`);
}
for (const item of CONCAT_EXCEPTIONS) {
  const actual = concatHits.get(`${item.path}\0${item.pattern}`) || 0;
  assert.equal(actual, item.expectedCount, `stale concat exception ${item.path} ${item.pattern}`);
}

const productionRel = audited.filter((rel) => !rel.startsWith("src/shared/i18n/") && /\.jsx?$/i.test(rel));
for (const rel of productionRel) {
  const findings = scanSource(readRel(rel), rel);
  if ((findings.foreignActivation || []).length) {
    astForeign.push(...findings.foreignActivation.map((row) => `${rel}:${row.kind}:${row.line}`));
  }
}
const productionForeign = astForeign.filter((row) => !row.includes("fixture"));
assert.deepEqual(productionForeign, [], `production foreign-runtime activation:\n${productionForeign.join("\n")}`);

const featureSrc = audited
  .filter((rel) => !rel.startsWith("src/shared/i18n/"))
  .map((rel) => readRel(rel))
  .join("\n");
assert.doesNotMatch(featureSrc, /LanguageSelector/);
assert.doesNotMatch(featureSrc, /preferred_language/);
assert.doesNotMatch(featureSrc, /allowForeignRuntime\s*=\s*true/);
assert.doesNotMatch(featureSrc, /allowForeignRuntime:\s*true/);
assert.doesNotMatch(featureSrc, /PUBLIC_LANGUAGE_PREFIXES_ENABLED\s*=\s*true/);
assert.doesNotMatch(featureSrc, /dir\s*=\s*["']rtl["']/);
assert.doesNotMatch(featureSrc, /uiTranslationSeed/);
assert.match(readRel("src/main.jsx"), /<LocalizationProvider>/);
assert.doesNotMatch(readRel("src/main.jsx"), /allowForeignRuntime/);

for (const rel of audited) {
  if (rel.startsWith("src/shared/i18n/")) continue;
  const src = readRel(rel);
  assert.doesNotMatch(src, /from ["'].*uiTranslationSeed/, `${rel} imports target seed`);
  assert.doesNotMatch(src, /LocalizationProvider\.jsx/, `${rel} imports LocalizationProvider.jsx`);
}

const BASE_SHA = "059ab7ffd591250a9359185c2de32b4b29c93aa2";
execFileSync(
  "git",
  ["diff", "--quiet", BASE_SHA, "--", "package.json", "package-lock.json", "server/package.json", "server/package-lock.json"],
  { cwd: projectRoot, stdio: "pipe" }
);

const managerProductsSrc = readRel("src/screens/manager/ManagerProducts.jsx");
assert.doesNotMatch(
  managerProductsSrc,
  /selectLinkFilter\(\s*t\(/,
  "ManagerProducts: selectLinkFilter(t(...)) must not enter filter authority"
);
assert.match(managerProductsSrc, /selectLinkFilter\("Связанные с 1С"\)/);
assert.match(managerProductsSrc, /selectLinkFilter\("Без связи с 1С"\)/);
assert.match(managerProductsSrc, /selectLinkFilter\("Есть варианты"\)/);

const clientScreenSrc = readRel("src/screens/client/ClientScreen.jsx");
assert.match(clientScreenSrc, /onClick=\{\(\) => setFilter\(status\)\}/);
assert.match(clientScreenSrc, /orderHistoryFilterLabel\(status,\s*t\)/);
assert.match(clientScreenSrc, /orderStatusLabel\(order\.status,\s*t\)/);

const reconClientSrc = readRel("src/screens/client/ReconciliationPanel.jsx");
const reconManagerSrc = readRel("src/screens/manager/ManagerReconciliation.jsx");
assert.doesNotMatch(reconClientSrc, /RECONCILIATION_STATUS_LABELS\[item\.status\]/);
assert.doesNotMatch(reconManagerSrc, /RECONCILIATION_STATUS_LABELS\[item\.status\]/);
assert.match(reconClientSrc, /reconciliationStatusLabel\(item\.status,\s*t\)/);
assert.match(reconManagerSrc, /reconciliationStatusLabel\(item\.status,\s*t\)/);
assert.match(reconClientSrc, /reconciliationPeriodDisplayLabel\(/);
assert.match(reconManagerSrc, /reconciliationPeriodDisplayLabel\(/);

assert.equal(orderHistoryLabel("Заказ создан", (key) => `T:${key}`), "T:shared.orderCreated");
assert.equal(
  orderHistoryLabel("Заказ создан с сайта", (key) => `T:${key}`),
  "T:shared.orderHistory.createdFromSite"
);
assert.equal(
  orderHistoryLabel("Клиент добавил позиции (дозаказ)", (key) => `T:${key}`),
  "T:shared.orderHistory.clientAddendum"
);
assert.equal(
  orderHistoryLabel("Клиент изменил состав или условия заказа", (key) => `T:${key}`),
  "T:shared.orderHistory.clientEdit"
);
assert.equal(
  orderHistoryLabel("Передача в 1С отменена: заказ обработан вручную", (key) => `T:${key}`),
  "T:shared.orderHistory.exchangeCancelledManual"
);
assert.match(
  orderHistoryLabel("Статус изменён: Новый → Принят", (key, params = {}) => `${key}:${params.from || ""}/${params.to || ""}`),
  /shared\.orderHistory\.statusChanged/
);
assert.match(
  orderHistoryLabel("Статус изменён: Новый → Принят (1С: Проведен)", (key, params = {}) => `${key}:${params.from || ""}/${params.to || ""}/${params.state || ""}`),
  /shared\.orderHistory\.statusChangedOneC/
);
assert.equal(orderHistoryLabel("Комментарий клиента: срочно", (key) => `T:${key}`), "Комментарий клиента: срочно");
assert.equal(reconciliationStatusLabel("processing", (key) => `T:${key}`), "T:shared.reconciliation.status.processing");
assert.equal(reconciliationStatusLabel("historic-x", (key) => `T:${key}`), "historic-x");
assert.equal(
  reconciliationPeriodDisplayLabel({ periodType: "q1", year: 2026 }, (key) => `T:${key}`),
  "T:shared.reconciliation.period.q1 2026"
);
assert.equal(
  backupReasonLabel("Ручная копия из кабинета менеджера", (key) => `T:${key}`),
  "T:manager.manualCopyFromTheManagerCabinet"
);
assert.equal(backupReasonLabel("Пользовательская причина", (key) => `T:${key}`), "Пользовательская причина");

const backupSrc = readRel("src/screens/manager/ManagerBackup.jsx");
assert.match(backupSrc, /reason:\s*"Ручная копия из кабинета менеджера"/);
assert.match(backupSrc, /backupReasonLabel\(item\.reason,\s*t\)/);

const bezKoda = allowlist.find(
  (item) => item.path === "src/screens/manager/ManagerClients.jsx" && item.literal === "без кода"
);
assert.equal(bezKoda, undefined, "без кода must not remain as a residual allowlist row");
assert.match(readRel("src/screens/manager/ManagerClients.jsx"), /t\("manager\.clients\.noCode"\)/);

const appModalSrc = readRel("src/shared/AppModal.jsx");
assert.match(
  appModalSrc,
  /isConfirm[\s\S]{0,220}?shared\.modal\.orderContents[\s\S]{0,220}?shared\.modal\.details/
);
assert.match(appModalSrc, /value == null/);
assert.match(appModalSrc, /trimmed\.toLowerCase\(\) === "null"/);

const managerOrdersSrc = readRel("src/screens/manager/ManagerOrders.jsx");
assert.match(managerOrdersSrc, /canTrashOrder\(order,\s*staffRole,\s*t\)/);
assert.match(managerOrdersSrc, /canPurgeOrder\(order,\s*staffRole,\s*t\)/);
assert.match(managerOrdersSrc, /roleLabel\(order\.deletedBy\.role,\s*t\)/);

let optionalTThrew = false;
try {
  const t = undefined;
  const changed = true;
  void (changed ? (typeof t === "function" ? t("manager.changed") : "Изменён") : "");
} catch {
  optionalTThrew = true;
}
assert.equal(optionalTThrew, false, "missing t must not throw");
assert.doesNotMatch(
  readRel("src/screens/manager/ManagerNotifications.jsx"),
  /t \? t\("manager.changed"\) : t\("manager.changed"\)/
);
assert.match(
  readRel("src/screens/manager/ManagerNotifications.jsx"),
  /typeof t === "function" \? t\("manager.changed"\) : "Изменён"/
);

const draftRowsA = [{ id: "e1", languages: { en: { value: "A" } } }];
const draftRowsB = [{ id: "e1", languages: { en: { value: "B" } } }];
const draftRowsD = [{ id: "e1", languages: { en: { value: "D" } } }];
const enKey = translationDraftKey("e1", "en");
const uzKey = translationDraftKey("e1", "uz");
const cleanDrafts = mergeWorkspaceDrafts({}, draftRowsA, "en");
assert.equal(Object.keys(cleanDrafts).length, 0);
assert.equal(readDraftValue(cleanDrafts, "e1", "en", "A"), "A");
const refreshedClean = mergeWorkspaceDrafts(cleanDrafts, draftRowsB, "en");
assert.equal(Object.keys(refreshedClean).length, 0);
assert.equal(readDraftValue(refreshedClean, "e1", "en", "B"), "B");
const dirty = setDraftValue(mergeWorkspaceDrafts({}, draftRowsB, "en"), "e1", "en", "C", true);
const preservedDirty = mergeWorkspaceDrafts(dirty, draftRowsB, "en");
assert.equal(readDraftValue(preservedDirty, "e1", "en"), "C");
const savedClean = markDraftClean(preservedDirty, "e1", "en", "C");
assert.equal(Object.hasOwn(savedClean, enKey), false);
assert.equal(readDraftValue(mergeWorkspaceDrafts(savedClean, draftRowsD, "en"), "e1", "en", "D"), "D");
const independent = setDraftValue(setDraftValue({}, "e1", "en", "C", true), "e1", "uz", "U", true);
const afterUzRefresh = mergeWorkspaceDrafts(independent, [{ id: "e1", languages: { uz: { value: "Z" } } }], "uz");
assert.equal(readDraftValue(afterUzRefresh, "e1", "en"), "C");
assert.equal(readDraftValue(afterUzRefresh, "e1", "uz"), "U");
const afterReset = clearTranslationDraft(afterUzRefresh, "e1", "en");
assert.equal(Object.hasOwn(afterReset, enKey), false);
assert.equal(Object.hasOwn(afterReset, uzKey), true);
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

assert.doesNotMatch(
  readRel("src/screens/client/ClientCatalogAddPanel.jsx"),
  /group\.name === ["']Прочее["']\s*\?/
);
assert.match(
  readRel("src/screens/client/ClientMatrixPanel.jsx"),
  /item === ["']Все["']\s*\?\s*t\("shared\.filter\.all"\)/
);

const unverifiedProjection = allowlist.filter(
  (item) =>
    /Display-only projection exists where the string is shown/i.test(item.reason) ||
    /Display projection exists where the string is shown/i.test(item.reason)
);
assert.equal(unverifiedProjection.length, 0, "unverified projection prose remains");

const projectionNames = [
  "orderStatusLabel",
  "requestStatusLabel",
  "exchangeStatusLabel",
  "visibilityFilterLabel",
  "orderHistoryFilterLabel",
  "orderHistoryLabel",
  "historyActorLabel",
  "reconciliationStatusLabel",
  "reconciliationPeriodDisplayLabel",
  "backupReasonLabel",
  "contactLabel",
  "contactRoleLabel",
  "addressLabel",
  "roleLabel",
  "promoStatusLabel",
  "translationEditorStateLabel",
];
for (const item of allowlist) {
  if (item.classification !== "CANONICAL_BUSINESS_VALUE") continue;
  const claimsProjection = /Display projection:/i.test(item.reason);
  if (!claimsProjection) continue;
  const named = projectionNames.filter((name) => item.reason.includes(name));
  assert.ok(named.length > 0, `projection claim without named helper: ${item.path} ${item.literal}`);
  const src = existsSync(path.join(projectRoot, item.path)) ? readRel(item.path) : "";
  const helperSrc = readRel("src/shared/i18n/displayLabels.js");
  for (const name of named) {
    assert.match(helperSrc, new RegExp(`export function ${name}\\(`));
    if (item.path.startsWith("src/") && src) {
      assert.equal(
        src.includes(name) || helperSrc.includes(name),
        true,
        `claimed ${name} not referenced from ${item.path}`
      );
    }
  }
}

assert.equal(AUTHORITY_CALLEE_NAMES.has("selectLinkFilter"), true);
const linkFilterScan = scanSource(
  `export function F({t, selectLinkFilter}){ selectLinkFilter(t("manager.linkedTo1c2")); }`,
  "unsafe-link-filter.jsx"
);
assert.ok(linkFilterScan.authorityUnsafe.length >= 1, "selectLinkFilter(t(...)) must be detected");
const safeLink = scanSource(
  `export function F({t, selectLinkFilter}){ return <button onClick={() => selectLinkFilter("Связанные с 1С")}>{t("manager.linkedTo1c2")}</button>; }`,
  "safe-link-filter.jsx"
);
assert.equal(safeLink.authorityUnsafe.length, 0);
for (const name of ["setFilter", "setVisibility", "setStatus", "setMode", "setTab"]) {
  const scan = scanSource(`export function F({t, ${name}}){ ${name}(t("shared.filter.all")); }`, `unsafe-${name}.jsx`);
  assert.ok(scan.authorityUnsafe.length >= 1, `${name}(t(...)) must be detected`);
}
const unsafeOptionValue = scanSource(
  `export function F({t}){ return <option value={t("shared.filter.all")}>x</option>; }`,
  "unsafe-option-value.jsx"
);
assert.ok(unsafeOptionValue.optionTranslatedValue.length >= 1);
const safeCanonicalOption = scanSource(
  `export function F({t}){ return <option value="Новый">{t("manager.orderStatus.new")}</option>; }`,
  "safe-option.jsx"
);
assert.equal(safeCanonicalOption.optionTranslatedValue.length, 0);

const concatFixture = scanSource(
  `export function F(){ return "Удалить заказ № " + "12" + " навсегда?"; }`,
  "unsafe-concat.jsx"
);
assert.ok(concatFixture.concatenations.length >= 1, "scanner must detect RU concatenation fixture");

const brokenParse = scanSource("export function F({t){ return t('x'); }", "broken.jsx");
assert.ok(brokenParse.parseError, "parse errors must be recorded");

const foreignPropScan = scanSource(
  `export function F(){ return createLocalizationRuntime({ allowForeignRuntime: true, locale: "en" }); }`,
  "unsafe-foreign-prop.jsx"
);
assert.ok(foreignPropScan.foreignActivation.length >= 1, "property-form allowForeignRuntime: true must be scanned");
const foreignJsx = scanSource(
  `export function F(){ return <LocalizationProvider allowForeignRuntime />; }`,
  "unsafe-foreign-jsx.jsx"
);
assert.ok(foreignJsx.foreignActivation.length >= 1);
const foreignSpread = scanSource(
  `export function F(cfg){ return createLocalizationRuntime({ ...cfg }); }`,
  "unsafe-foreign-spread.jsx"
);
assert.ok(foreignSpread.foreignActivation.length >= 1);

assert.doesNotMatch(readFileSync(new URL(import.meta.url).pathname, "utf8"), /rel\.endsWith\("ManagerExchange\.jsx"\)/);

const keysA = catalogKeysFromGit("ee7334f080fa17f7fe37c538f6ea8706aadb1f96");
const keysB = catalogKeysFromGit("d5f8a908d290ccd292743c17ed83bc8681231f8c");
const keysC = new Set(UI_CATALOG.map((entry) => entry.key));
const deltaAB = deltaSets(keysA, keysB);
const deltaBC = deltaSets(keysB, keysC);
const deltaAC = deltaSets(keysA, keysC);
console.log(`catalog.ee7334f=${keysA.size}`);
console.log(`catalog.d5f8a90=${keysB.size}`);
console.log(`catalog.final=${keysC.size}`);
console.log(`catalog.AtoB.added=${deltaAB.added.length}`);
console.log(`catalog.AtoB.removed=${deltaAB.removed.length}`);
console.log(`catalog.AtoB.unchanged=${deltaAB.unchanged.length}`);
console.log(`catalog.BtoC.added=${deltaBC.added.length}`);
console.log(`catalog.BtoC.removed=${deltaBC.removed.length}`);
console.log(`catalog.BtoC.unchanged=${deltaBC.unchanged.length}`);
console.log(`catalog.AtoC.added=${deltaAC.added.length}`);
console.log(`catalog.AtoC.removed=${deltaAC.removed.length}`);
console.log(`catalog.AtoC.unchanged=${deltaAC.unchanged.length}`);
if (deltaBC.added.length) console.log(`catalog.BtoC.addedKeys=${deltaBC.added.join(",")}`);

const stage31Residual = allowlist.filter((item) => item.classification === "STAGE31_SYSTEM_UI");
assert.equal(stage31Residual.length, 0);

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
