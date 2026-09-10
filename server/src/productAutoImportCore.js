import { sourceHash } from "../../src/shared/i18n/sourceHash.js";
import { canonicalProductId } from "../../src/shared/i18n/productLocalization.js";
import { PRODUCT_GLOSSARY_CONTEXTS, validateProductTranslationSemantics } from "./productLocalizationSemantics.js";
import {
  catalogSourceFingerprint,
  glossaryFingerprint,
  listProductSourceCells,
} from "./productCatalogFingerprint.js";
import { TARGET_LANGUAGES, validateUniqueCoverage } from "./productAutoArtifact.js";

export function emptyAutoImportCounts() {
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
    languageCounts: Object.fromEntries(TARGET_LANGUAGES.map((code) => [code, 0])),
  };
}

export function precomputeImportContext(products, glossaryRows, translationRows) {
  const productsById = new Map();
  for (const product of products) {
    const id = canonicalProductId(product?.id);
    if (id) productsById.set(id, product);
  }
  const sourceCells = listProductSourceCells(products);
  const sourceCellsByKey = new Map();
  for (const cell of sourceCells) {
    sourceCellsByKey.set(`${cell.productId}\0${cell.field}`, cell);
  }
  const glossaryByLanguage = new Map();
  for (const entry of glossaryRows) {
    const language = entry.languageCode || entry.language_code;
    const list = glossaryByLanguage.get(language) || [];
    list.push(entry);
    glossaryByLanguage.set(language, list);
  }
  const existingByKey = new Map();
  for (const row of translationRows) {
    existingByKey.set(`${row.productId}\0${row.languageCode}\0${row.fieldKey}`, row);
  }
  return {
    products,
    productsById,
    sourceCells,
    sourceCellsByKey,
    glossaryRows,
    glossaryByLanguage,
    existingByKey,
    catalogFingerprint: catalogSourceFingerprint(products),
    glossaryFingerprint: glossaryFingerprint(glossaryRows),
  };
}

export function classifyPreparedItem(item, ctx) {
  const product = ctx.productsById.get(String(item.productId || ""));
  if (!product) return "unknownProduct";
  const source = ctx.sourceCellsByKey.get(`${item.productId}\0${item.field}`);
  if (!source) return "staleSource";
  if (source.sourceHash !== String(item.sourceHash || "")) return "staleSource";
  const value = typeof item.value === "string" ? item.value : "";
  if (!value.trim()) return "emptyValue";
  const check = validateProductTranslationSemantics({
    sourceRu: source.sourceRu,
    targetValue: value,
    product,
    glossaryEntries: ctx.glossaryByLanguage.get(item.language) || [],
    context: PRODUCT_GLOSSARY_CONTEXTS[item.field] || "",
  });
  if (!check.ok) {
    if (check.code === "NUMERIC_MISMATCH") return "numericMismatch";
    if (check.code === "PROTECTED_TOKEN_MISMATCH" || check.code === "GLOSSARY_PROTECTED_MISMATCH") {
      return "protectedMismatch";
    }
    return "emptyValue";
  }
  const existing = ctx.existingByKey.get(`${item.productId}\0${item.language}\0${item.field}`);
  if (String(existing?.manualValue || "").trim()) return "wouldSkipMANUAL";
  if (existing?.autoValue === value && existing?.autoSourceHash === item.sourceHash) {
    return "alreadyIdentical";
  }
  if (String(existing?.autoValue || "").trim()) return "wouldUpdateAUTO";
  return "wouldInsertAUTO";
}

export function summarizeClassification(loaded, ctx) {
  validateUniqueCoverage(loaded.items, ctx.sourceCells);
  const counts = emptyAutoImportCounts();
  counts.products = ctx.products.length;
  counts.sourceFields = ctx.sourceCells.length;
  counts.targetCells = loaded.items.length;
  for (const item of loaded.items) {
    if (counts.languageCounts[item.language] !== undefined) {
      counts.languageCounts[item.language] += 1;
    }
    counts[classifyPreparedItem(item, ctx)] += 1;
  }
  return counts;
}

export function fingerprintMismatch(loaded, ctx) {
  if (String(loaded.manifest.wholeCatalogSourceFingerprint) !== ctx.catalogFingerprint) {
    return "CATALOG_SOURCE_MISMATCH";
  }
  if (String(loaded.manifest.glossaryFingerprint) !== ctx.glossaryFingerprint) {
    return "GLOSSARY_SOURCE_MISMATCH";
  }
  return "";
}

export { sourceHash };
