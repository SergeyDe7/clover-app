/**
 * Fail-closed Stage 4 AUTO artifact loader/validator.
 * Does not import db.js and does not write any database.
 */
import { createHash } from "node:crypto";
import { lstatSync, realpathSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  TARGET_INTERNAL_LOCALES,
  exactTranslationTargetInternal,
  isExactTranslationTargetLocale,
} from "../../src/shared/i18n/languageRegistry.js";
import {
  PRODUCT_TRANSLATION_FIELDS,
  canonicalProductId,
  isProductTranslationField,
} from "../../src/shared/i18n/productLocalization.js";
import { CATALOG_TECHNICAL_SERIES } from "./productLocalizationSemantics.js";

export const AUTO_IMPORT_FORMAT = "clover-product-auto-import";
export const AUTO_IMPORT_FORMAT_VERSION = 1;
export const AUTO_QUALITY = "AUTO_MACHINE_DRAFT";
export const TARGET_LANGUAGES = Object.freeze([...TARGET_INTERNAL_LOCALES]);
export const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
export const GIT_SHA_RE = /^[0-9a-f]{40}$/;
export const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const ENGLISH_BOILERPLATE = Object.freeze([
  "Suitable",
  "pcs per pack",
  "in the box",
  "per pack",
  "catering",
]);
const CYRILLIC_WORD_RE = /[А-Яа-яЁё]+/g;
const LATIN_SCRIPT_TARGETS = Object.freeze(["en", "uz", "zh-CN", "ar"]);

function artifactError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}

export function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function isValidSha256Hex(value) {
  return SHA256_HEX_RE.test(String(value || "").trim());
}

function requireString(value, code, message) {
  if (typeof value !== "string" || !value.trim()) {
    throw artifactError(code, message);
  }
  return value.trim();
}

export function resolveSafeChunkPath(artifactDir, filename) {
  const name = String(filename || "");
  if (!name || name.includes("\0")) {
    throw artifactError("CHUNK_PATH_ESCAPE", "Chunk filename is required.");
  }
  if (path.isAbsolute(name) || name.includes("..") || name.includes("\\")) {
    throw artifactError("CHUNK_PATH_ESCAPE", `Unsafe chunk path: ${name}`);
  }
  const root = realpathSync(artifactDir);
  const resolved = path.resolve(root, name);
  const realFile = realpathSync(resolved);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (realFile !== path.join(root, path.basename(realFile)) && !realFile.startsWith(rootPrefix)) {
    throw artifactError("CHUNK_PATH_ESCAPE", `Chunk path escaped artifact directory: ${name}`);
  }
  if (lstatSync(resolved).isSymbolicLink()) {
    throw artifactError("CHUNK_PATH_ESCAPE", `Chunk path is a symlink: ${name}`);
  }
  return realFile;
}

export function validateManifestShape(raw, expected = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw artifactError("INVALID_ARTIFACT", "Manifest must be an object.");
  }
  if (Object.prototype.hasOwnProperty.call(raw, "items")) {
    throw artifactError("INVALID_ARTIFACT", "Chunked Stage 4 artifacts must not include top-level items.");
  }
  if (raw.format !== AUTO_IMPORT_FORMAT || Number(raw.formatVersion) !== AUTO_IMPORT_FORMAT_VERSION) {
    throw artifactError("INVALID_ARTIFACT", "Unsupported product AUTO import artifact.");
  }
  if (raw.quality !== AUTO_QUALITY) {
    throw artifactError("INVALID_ARTIFACT", "Artifact quality must be AUTO_MACHINE_DRAFT.");
  }
  const runId = requireString(raw.runId, "INVALID_ARTIFACT", "runId is required.");
  const baseMainSha = requireString(raw.baseMainSha, "INVALID_ARTIFACT", "baseMainSha is required.");
  if (!GIT_SHA_RE.test(baseMainSha)) {
    throw artifactError("INVALID_ARTIFACT", "baseMainSha must be a 40-hex git SHA.");
  }
  if (expected.baseMainSha && expected.baseMainSha !== baseMainSha) {
    throw artifactError("BASE_GUARD_MISMATCH", "Artifact base SHA does not match the approved run.");
  }
  if (expected.runId && expected.runId !== runId) {
    throw artifactError("RUN_ID_MISMATCH", "Artifact runId does not match the approved run.");
  }
  const generatedAt = requireString(raw.generatedAt, "INVALID_ARTIFACT", "generatedAt is required.");
  if (!ISO_TIMESTAMP_RE.test(generatedAt)) {
    throw artifactError("INVALID_ARTIFACT", "generatedAt must be a valid ISO timestamp.");
  }
  if (!Number.isInteger(raw.productCount) || raw.productCount < 0) {
    throw artifactError("INVALID_ARTIFACT", "productCount is required.");
  }
  if (!raw.sourceFieldCounts || typeof raw.sourceFieldCounts !== "object") {
    throw artifactError("INVALID_ARTIFACT", "sourceFieldCounts is required.");
  }
  for (const field of PRODUCT_TRANSLATION_FIELDS) {
    if (!Number.isInteger(raw.sourceFieldCounts[field])) {
      throw artifactError("INVALID_ARTIFACT", `sourceFieldCounts.${field} is required.`);
    }
  }
  if (!Number.isInteger(raw.sourceCellCount) || raw.sourceCellCount < 0) {
    throw artifactError("INVALID_ARTIFACT", "sourceCellCount is required.");
  }
  if (!Number.isInteger(raw.targetCellCount) || raw.targetCellCount < 0) {
    throw artifactError("INVALID_ARTIFACT", "targetCellCount is required.");
  }
  if (!isValidSha256Hex(raw.wholeCatalogSourceFingerprint)) {
    throw artifactError("INVALID_ARTIFACT", "wholeCatalogSourceFingerprint must be SHA-256.");
  }
  if (typeof raw.glossaryCount !== "number" || raw.glossaryCount < 0) {
    throw artifactError("INVALID_ARTIFACT", "glossaryCount is required.");
  }
  if (!isValidSha256Hex(raw.glossaryFingerprint)) {
    throw artifactError("INVALID_ARTIFACT", "glossaryFingerprint must be SHA-256.");
  }
  if (!raw.languageCounts || typeof raw.languageCounts !== "object") {
    throw artifactError("INVALID_ARTIFACT", "languageCounts is required.");
  }
  if (!Array.isArray(raw.chunks) || raw.chunks.length !== TARGET_LANGUAGES.length) {
    throw artifactError("INVALID_ARTIFACT", "Exactly one chunk per target language is required.");
  }
  return raw;
}

function validateChunkDescriptors(chunks) {
  const languages = new Set();
  const files = new Set();
  for (const chunk of chunks) {
    const filename = requireString(chunk?.file, "INVALID_ARTIFACT", "Chunk filename is required.");
    const language = requireString(chunk?.language, "INVALID_ARTIFACT", "Chunk language is required.");
    if (!TARGET_LANGUAGES.includes(language)) {
      throw artifactError("INVALID_LOCALE", `Unexpected chunk language: ${language}`);
    }
    if (languages.has(language)) {
      throw artifactError("INVALID_ARTIFACT", `Duplicate chunk language: ${language}`);
    }
    if (files.has(filename)) {
      throw artifactError("INVALID_ARTIFACT", `Duplicate chunk file: ${filename}`);
    }
    if (!Number.isInteger(chunk.count) || chunk.count < 0) {
      throw artifactError("INVALID_ARTIFACT", `Chunk count is required for ${filename}`);
    }
    if (!isValidSha256Hex(chunk.sha256)) {
      throw artifactError("CHUNK_HASH_MISMATCH", `Chunk sha256 is required for ${filename}`);
    }
    languages.add(language);
    files.add(filename);
  }
  for (const language of TARGET_LANGUAGES) {
    if (!languages.has(language)) {
      throw artifactError("INVALID_ARTIFACT", `Missing chunk for ${language}`);
    }
  }
}

export function validateArtifactItem(item) {
  if (!item || typeof item !== "object") {
    throw artifactError("INVALID_ARTIFACT", "Artifact item must be an object.");
  }
  const productId = item.productId;
  if (typeof productId !== "string" || !productId || canonicalProductId(productId) !== productId) {
    throw artifactError("INVALID_ARTIFACT", "productId must be the canonical String(product.id).");
  }
  if (!isExactTranslationTargetLocale(item.language) || item.language === "zh") {
    throw artifactError("INVALID_LOCALE", `Invalid artifact language: ${item.language}`);
  }
  const internal = exactTranslationTargetInternal(item.language);
  if (internal !== item.language) {
    throw artifactError("INVALID_LOCALE", `Artifact must use internal locale codes, not ${item.language}`);
  }
  if (!isProductTranslationField(item.field)) {
    throw artifactError("INVALID_FIELD", `Invalid field: ${item.field}`);
  }
  if (!isValidSha256Hex(item.sourceHash)) {
    throw artifactError("INVALID_ARTIFACT", "sourceHash must be SHA-256.");
  }
  const value = item.value;
  if (typeof value !== "string" || !value.trim() || value.length > 8000) {
    throw artifactError("EMPTY_VALUE", "Artifact value must be a non-empty bounded string.");
  }
  const allowed = new Set(["productId", "language", "field", "sourceHash", "value"]);
  for (const key of Object.keys(item)) {
    if (!allowed.has(key)) {
      throw artifactError("INVALID_ARTIFACT", `Unexpected artifact field: ${key}`);
    }
  }
  return item;
}

export function itemKey(item) {
  return `${item.productId}\0${item.language}\0${item.field}`;
}

export function validateUniqueCoverage(items, sourceCells) {
  const keys = new Set();
  const expected = new Set();
  for (const cell of sourceCells) {
    for (const language of TARGET_LANGUAGES) {
      expected.add(`${cell.productId}\0${language}\0${cell.field}`);
    }
  }
  for (const item of items) {
    const key = itemKey(item);
    if (keys.has(key)) {
      throw artifactError("ARTIFACT_COVERAGE_MISMATCH", "Duplicate artifact cell.");
    }
    keys.add(key);
  }
  if (keys.size !== expected.size) {
    throw artifactError(
      "ARTIFACT_COVERAGE_MISMATCH",
      `Coverage mismatch: items=${keys.size} expected=${expected.size}`
    );
  }
  for (const key of expected) {
    if (!keys.has(key)) {
      throw artifactError("ARTIFACT_COVERAGE_MISMATCH", "Missing artifact target cell.");
    }
  }
  for (const key of keys) {
    if (!expected.has(key)) {
      throw artifactError("ARTIFACT_COVERAGE_MISMATCH", "Unexpected artifact target cell.");
    }
  }
}

function isProtectedCyrillicToken(token, value = "") {
  if (CATALOG_TECHNICAL_SERIES.includes(token)) return true;
  if (/^(?:НФ|NF|CL)(?:-\d+)?$/i.test(token)) return true;
  if (String(value).includes("Д-Полимер") && (token === "Д" || token === "Полимер")) return true;
  if (token.length === 1 && /[А-Яа-яЁё]/.test(token)) return true;
  if (String(value).includes(token) && CATALOG_TECHNICAL_SERIES.some((series) => series.includes(token) && value.includes(series))) {
    return true;
  }
  return false;
}

export function lintArtifactItem(item) {
  const value = String(item.value || "");
  const mixedWords = String(value)
    .replace(/Д-Полимер/g, "")
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((word) => /[A-Za-z]/.test(word) && /[А-Яа-яЁё]/.test(word));
  if (LATIN_SCRIPT_TARGETS.includes(item.language) && mixedWords.length) {
    throw artifactError("STRUCTURAL_LINT_FAILURE", `Mixed-script corruption in ${itemKey(item)}`);
  }
  if (LATIN_SCRIPT_TARGETS.includes(item.language)) {
    for (const token of value.match(CYRILLIC_WORD_RE) || []) {
      if (isProtectedCyrillicToken(token, value)) continue;
      throw artifactError(
        "STRUCTURAL_LINT_FAILURE",
        `Unexpected Cyrillic '${token}' in ${item.language}`
      );
    }
  }
  if (item.language !== "en") {
    const hay = value.toLowerCase();
    for (const phrase of ENGLISH_BOILERPLATE) {
      if (hay.includes(phrase.toLowerCase())) {
        throw artifactError(
          "STRUCTURAL_LINT_FAILURE",
          `English boilerplate '${phrase}' leaked into ${item.language}`
        );
      }
    }
  }
}

export function lintArtifactItems(items) {
  for (const item of items) lintArtifactItem(item);
}

export function loadAutoImportManifest(filePath, expected = {}) {
  const resolved = path.resolve(filePath);
  const raw = JSON.parse(readFileSync(resolved, "utf8"));
  const manifest = validateManifestShape(raw, expected);
  validateChunkDescriptors(manifest.chunks);
  const root = path.dirname(resolved);
  const items = [];
  const chunks = [];
  for (const chunk of manifest.chunks) {
    const chunkPath = resolveSafeChunkPath(root, chunk.file);
    const payload = JSON.parse(readFileSync(chunkPath, "utf8"));
    const hash = fileSha256(chunkPath);
    if (hash !== String(chunk.sha256).toLowerCase()) {
      throw artifactError("CHUNK_HASH_MISMATCH", `Chunk hash mismatch: ${chunk.file}`);
    }
    if (payload.language !== chunk.language) {
      throw artifactError("INVALID_ARTIFACT", `Chunk language mismatch: ${chunk.file}`);
    }
    const chunkItems = Array.isArray(payload.items) ? payload.items : [];
    if (chunkItems.length !== chunk.count) {
      throw artifactError("INVALID_ARTIFACT", `Chunk count mismatch: ${chunk.file}`);
    }
    for (const item of chunkItems) {
      if (item.language !== chunk.language) {
        throw artifactError("INVALID_LOCALE", `Item language mismatch in ${chunk.file}`);
      }
      validateArtifactItem(item);
      items.push(item);
    }
    chunks.push({ file: chunk.file, language: chunk.language, sha256: hash, count: chunkItems.length });
  }
  if (items.length !== manifest.targetCellCount) {
    throw artifactError("ARTIFACT_COVERAGE_MISMATCH", "targetCellCount does not match loaded items.");
  }
  const languageCounts = Object.fromEntries(TARGET_LANGUAGES.map((code) => [code, 0]));
  for (const item of items) languageCounts[item.language] += 1;
  for (const language of TARGET_LANGUAGES) {
    if (languageCounts[language] !== Number(manifest.languageCounts[language] || 0)) {
      throw artifactError("ARTIFACT_COVERAGE_MISMATCH", `languageCounts mismatch for ${language}`);
    }
  }
  lintArtifactItems(items);
  return { manifest, items, chunks, artifactPath: resolved };
}

export function artifactFingerprint(loaded) {
  const lines = loaded.chunks.map((chunk) => `${chunk.file}:${chunk.sha256}`).join("\n");
  return createHash("sha256")
    .update(`${loaded.manifest.runId}\n${loaded.manifest.wholeCatalogSourceFingerprint}\n${lines}`)
    .digest("hex");
}
