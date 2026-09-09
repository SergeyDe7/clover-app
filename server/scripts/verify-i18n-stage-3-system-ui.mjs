import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot } from "./readFrontendUiSource.mjs";
import { UI_CATALOG, STAGE31_FOUNDATIONAL_KEYS } from "../../src/shared/i18n/uiCatalog.js";
import { placeholdersMatch } from "../../src/shared/i18n/placeholderValidation.js";
import {
  SEEDS,
  SEED_EXACT_RU_ALLOWLIST,
  SEED_SCRIPT_EXCEPTIONS,
  getSeedTranslation,
  listSeedKeys,
} from "../src/i18n/uiTranslationSeed.js";

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
  "TECHNICAL_IDENTIFIER",
  "STAGE32_ERROR_PWA",
  "NON_VISIBLE",
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
    /(?:\bfunction\b|\breturn\b|\bconst\b|\blet\b|\bexport\b|\.replace\(|\.match\(|\.test\()/.test(value) ||
    value.includes("\n")
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
}

const sourceOwners = new Map();
for (const entry of UI_CATALOG) {
  const prev = sourceOwners.get(entry.sourceRu);
  assert.equal(prev, undefined, `duplicate sourceRu ownership: ${prev} and ${entry.key}`);
  sourceOwners.set(entry.sourceRu, entry.key);
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
  const row = SEEDS[entry.key];
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
