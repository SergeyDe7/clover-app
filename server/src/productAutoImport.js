import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  exactTranslationTargetInternal,
  isExactTranslationTargetLocale,
} from "../../src/shared/i18n/languageRegistry.js";
import { isProductTranslationField, canonicalProductId } from "../../src/shared/i18n/productLocalization.js";
import { PRODUCT_GLOSSARY_CONTEXTS, validateProductTranslationSemantics } from "./productLocalizationSemantics.js";
import { catalogSourceFingerprint, listProductSourceCells } from "./productCatalogFingerprint.js";
import {
  findCanonicalProduct,
  listCanonicalProducts,
  listGlossaryEntries,
  upsertProductAutoTranslation,
} from "./productLocalizationStore.js";
import { getProductTranslationRow, runInTransaction } from "./db.js";
import { sourceHash } from "../../src/shared/i18n/sourceHash.js";

export const AUTO_IMPORT_FORMAT = "clover-product-auto-import";
export const AUTO_IMPORT_FORMAT_VERSION = 1;
export const EXPECTED_BASE_MAIN_SHA = "cbd1d0e3ac831fd41126d4e6b0e7af446d436d42";

function emptyCounts() {
  return {
    products: 0,
    sourceFields: 0,
    targetCells: 0,
    wouldInsertAUTO: 0,
    wouldUpdateAUTO: 0,
    wouldSkipMANUAL: 0,
    alreadyIdentical: 0,
    staleSource: 0,
    unknownProduct: 0,
    invalidLocale: 0,
    invalidField: 0,
    numericMismatch: 0,
    protectedMismatch: 0,
    emptyValue: 0,
    languageCounts: { en: 0, uz: 0, ky: 0, tg: 0, "zh-CN": 0, ar: 0 },
  };
}

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function loadAutoImportManifest(filePath) {
  const resolved = path.resolve(filePath);
  const raw = JSON.parse(readFileSync(resolved, "utf8"));
  if (raw.format !== AUTO_IMPORT_FORMAT || Number(raw.formatVersion) !== AUTO_IMPORT_FORMAT_VERSION) {
    const error = new Error("Unsupported product AUTO import artifact.");
    error.code = "INVALID_ARTIFACT";
    throw error;
  }
  const root = path.dirname(resolved);
  const items = [];
  if (Array.isArray(raw.items)) items.push(...raw.items);
  const chunks = [];
  for (const chunk of Array.isArray(raw.chunks) ? raw.chunks : []) {
    const chunkPath = path.resolve(root, chunk.file);
    const parsed = JSON.parse(readFileSync(chunkPath, "utf8"));
    const hash = fileSha256(chunkPath);
    if (chunk.sha256 && chunk.sha256 !== hash) {
      const error = new Error(`Chunk hash mismatch: ${chunk.file}`);
      error.code = "CHUNK_HASH_MISMATCH";
      throw error;
    }
    chunks.push({ file: chunk.file, sha256: hash, count: Array.isArray(parsed.items) ? parsed.items.length : 0 });
    if (Array.isArray(parsed.items)) items.push(...parsed.items);
  }
  return { manifest: raw, items, chunks, artifactPath: resolved };
}

export function classifyAutoItem(item, productsById, glossaryByLanguage) {
  const productId = canonicalProductId(item?.productId);
  const product = productsById.get(productId);
  if (!product) return "unknownProduct";
  if (!isExactTranslationTargetLocale(item?.language)) return "invalidLocale";
  const internal = exactTranslationTargetInternal(item.language);
  if (!internal) return "invalidLocale";
  if (!isProductTranslationField(item?.field)) return "invalidField";
  const sourceRu =
    item.field === "name"
      ? String(product.name || "").trim()
      : String(product.storefrontDetails?.[item.field] || "").trim();
  if (!sourceRu) return "staleSource";
  if (sourceHash(sourceRu) !== String(item.sourceHash || "")) return "staleSource";
  const value = typeof item.value === "string" ? item.value : "";
  if (!value.trim()) return "emptyValue";
  const check = validateProductTranslationSemantics({
    sourceRu,
    targetValue: value,
    product,
    glossaryEntries: glossaryByLanguage.get(internal) || [],
    context: PRODUCT_GLOSSARY_CONTEXTS[item.field] || "",
  });
  if (!check.ok) {
    if (check.code === "NUMERIC_MISMATCH") return "numericMismatch";
    if (check.code === "PROTECTED_TOKEN_MISMATCH" || check.code === "GLOSSARY_PROTECTED_MISMATCH") {
      return "protectedMismatch";
    }
    return "emptyValue";
  }
  const existing = getProductTranslationRow(productId, internal, item.field);
  if (String(existing?.manualValue || "").trim()) return "wouldSkipMANUAL";
  if (existing?.autoValue === value && existing?.autoSourceHash === item.sourceHash) return "alreadyIdentical";
  if (existing?.autoValue) return "wouldUpdateAUTO";
  return "wouldInsertAUTO";
}

export function dryRunProductAutoImport(loaded, products = listCanonicalProducts()) {
  const productsById = new Map(products.map((item) => [canonicalProductId(item.id), item]));
  const glossaryByLanguage = new Map();
  for (const entry of listGlossaryEntries()) {
    const list = glossaryByLanguage.get(entry.languageCode) || [];
    list.push(entry);
    glossaryByLanguage.set(entry.languageCode, list);
  }
  const counts = emptyCounts();
  counts.products = products.length;
  counts.sourceFields = listProductSourceCells(products).length;
  counts.targetCells = loaded.items.length;
  const currentCatalogFingerprint = catalogSourceFingerprint(products);
  const artifactCatalogFingerprint = String(loaded.manifest.wholeCatalogSourceFingerprint || "");
  const catalogMatch = artifactCatalogFingerprint === currentCatalogFingerprint;
  for (const item of loaded.items) {
    const internal = isExactTranslationTargetLocale(item.language)
      ? exactTranslationTargetInternal(item.language)
      : "";
    if (internal && counts.languageCounts[internal] !== undefined) {
      counts.languageCounts[internal] += 1;
    }
    const code = classifyAutoItem(item, productsById, glossaryByLanguage);
    counts[code] += 1;
  }
  return {
    mode: "dry-run",
    writes: 0,
    artifactBaseSha: loaded.manifest.baseMainSha || "",
    artifactCatalogFingerprint,
    currentCatalogFingerprint,
    catalogMatch,
    ...counts,
  };
}

export function applyProductAutoImport(loaded, actor = "offline-auto-import", products = listCanonicalProducts()) {
  const dry = dryRunProductAutoImport(loaded, products);
  if (!dry.catalogMatch) {
    const error = new Error("Artifact catalog fingerprint does not match the current product snapshot.");
    error.code = "CATALOG_SOURCE_MISMATCH";
    error.status = 409;
    throw error;
  }
  return runInTransaction(() => {
    let inserted = 0;
    let updated = 0;
    let skippedManual = 0;
    let identical = 0;
    let failed = 0;
    for (const item of loaded.items) {
      const result = upsertProductAutoTranslation(item, actor);
      if (result.changed) {
        if (result.skipped === "") inserted += 1;
      } else if (result.skipped === "MANUAL_PROTECTED") skippedManual += 1;
      else if (result.skipped === "UNCHANGED") identical += 1;
      else failed += 1;
    }
    return {
      mode: "apply",
      artifactBaseSha: dry.artifactBaseSha,
      artifactCatalogFingerprint: dry.artifactCatalogFingerprint,
      currentCatalogFingerprint: dry.currentCatalogFingerprint,
      imported: inserted + updated,
      inserted,
      updated,
      skippedManual,
      identical,
      failed,
      targetCells: loaded.items.length,
    };
  });
}

export function findCanonicalProductSafe(productId) {
  return findCanonicalProduct(productId);
}
