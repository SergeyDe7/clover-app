import { randomUUID } from "node:crypto";
import {
  getGlobalState,
  runInTransaction,
  listProductTranslationRows,
  listProductTranslationRowsForProduct,
  getProductTranslationRow,
  upsertProductTranslationRow,
  deleteProductTranslationRows,
  listGlossaryRows,
  getGlossaryRow,
  findGlossaryByIdentity,
  insertGlossaryRow,
  updateGlossaryRow,
  deleteGlossaryRow,
} from "./db.js";
import { DEFAULT_PRODUCTS } from "./defaults.js";
import {
  TARGET_INTERNAL_LOCALES,
  exactTranslationTargetInternal,
  isExactTranslationTargetLocale,
  toPublicLocaleCode,
  PUBLIC_LOCALE_CODES,
} from "../../src/shared/i18n/languageRegistry.js";
import { sourceHash } from "../../src/shared/i18n/sourceHash.js";
import { isNonEmptyText } from "../../src/shared/i18n/placeholderValidation.js";
import {
  PRODUCT_TRANSLATION_FIELDS,
  PRODUCT_TRANSLATION_NAMESPACE,
  canonicalProductId,
  isProductTranslationField,
  productFieldSource,
  productTranslationRowId,
  normalizeGlossaryPhrase,
} from "../../src/shared/i18n/productLocalization.js";
import {
  applyGlossaryPhrases,
  validateProductTranslationSemantics,
} from "./productLocalizationSemantics.js";

const FORBIDDEN_AUTHORITY_KEYS = Object.freeze([
  "price",
  "cost",
  "markup",
  "matrix",
  "saleUnits",
  "oneCId",
  "oneCCode",
  "oneCName",
  "category",
]);

function nowIso() {
  return new Date().toISOString();
}

function invalidLocaleError(message = "Unsupported translation language.") {
  const error = new Error(message);
  error.status = 400;
  error.code = "UNSUPPORTED_LOCALE";
  return error;
}

function requireTargetLocale(language) {
  if (!isExactTranslationTargetLocale(language)) {
    throw invalidLocaleError();
  }
  const internal = exactTranslationTargetInternal(language);
  if (!internal) throw invalidLocaleError();
  return internal;
}

export function listCanonicalProducts() {
  const products = getGlobalState("products", DEFAULT_PRODUCTS);
  return Array.isArray(products) ? products : [];
}

export function findCanonicalProduct(productId) {
  const id = canonicalProductId(productId);
  if (!id) return null;
  return listCanonicalProducts().find((item) => canonicalProductId(item?.id) === id) || null;
}

function requireExistingProduct(productId) {
  const product = findCanonicalProduct(productId);
  if (!product) {
    const error = new Error("Product not found.");
    error.status = 404;
    error.code = "UNKNOWN_PRODUCT";
    throw error;
  }
  return product;
}

function requireField(field) {
  if (!isProductTranslationField(field)) {
    const error = new Error("Unsupported product translation field.");
    error.status = 400;
    error.code = "UNSUPPORTED_FIELD";
    throw error;
  }
  return field;
}

function emptyCell() {
  return {
    value: "",
    state: "MISSING",
    stale: false,
    autoValue: "",
    autoSourceHash: "",
    manualValue: "",
    manualSourceHash: "",
    updatedAt: "",
    updatedBy: "",
  };
}

export function deriveProductFieldState(row, currentSourceHash) {
  const manual = String(row?.manualValue || "").trim();
  const auto = String(row?.autoValue || "").trim();
  if (manual) {
    const stale = Boolean(
      currentSourceHash && row.manualSourceHash && row.manualSourceHash !== currentSourceHash
    );
    return {
      value: row.manualValue,
      state: stale ? "STALE" : "MANUAL",
      stale,
      effectiveOrigin: "MANUAL",
    };
  }
  if (auto) {
    const stale = Boolean(
      currentSourceHash && row.autoSourceHash && row.autoSourceHash !== currentSourceHash
    );
    return {
      value: row.autoValue,
      state: stale ? "STALE" : "AUTO",
      stale,
      effectiveOrigin: "AUTO",
    };
  }
  return { value: "", state: "MISSING", stale: false, effectiveOrigin: "" };
}

function decorateRow(row, currentSourceHash) {
  const derived = deriveProductFieldState(row, currentSourceHash);
  return {
    productId: row.productId,
    languageCode: row.languageCode,
    fieldKey: row.fieldKey,
    autoValue: row.autoValue || "",
    autoSourceHash: row.autoSourceHash || "",
    manualValue: row.manualValue || "",
    manualSourceHash: row.manualSourceHash || "",
    updatedAt: row.updatedAt || "",
    updatedBy: row.updatedBy || "",
    ...derived,
  };
}

function emptyStoredRow(productId, languageCode, fieldKey) {
  return {
    productId,
    languageCode,
    fieldKey,
    autoValue: "",
    autoSourceHash: "",
    manualValue: "",
    manualSourceHash: "",
    updatedAt: "",
    updatedBy: "",
  };
}

export function readProductFieldTranslation(product, language, field) {
  const productId = canonicalProductId(product.id);
  const internal = requireTargetLocale(language);
  const fieldKey = requireField(field);
  const sourceRu = productFieldSource(product, fieldKey);
  const currentHash = sourceRu ? sourceHash(sourceRu) : "";
  const row =
    getProductTranslationRow(productId, internal, fieldKey) ||
    emptyStoredRow(productId, internal, fieldKey);
  return {
    sourceRu,
    sourceHash: currentHash,
    ...decorateRow(row, currentHash),
  };
}

function cellFromDecorated(decorated) {
  return {
    value: decorated.value || "",
    state: decorated.state,
    stale: decorated.stale === true,
    autoValue: decorated.autoValue || "",
    manualValue: decorated.manualValue || "",
    updatedAt: decorated.updatedAt || "",
    updatedBy: decorated.updatedBy || "",
  };
}

export function buildProductWorkspaceRows(products = listCanonicalProducts()) {
  const rowsByProduct = new Map();
  for (const row of listProductTranslationRows()) {
    const key = `${row.productId}\0${row.fieldKey}`;
    if (!rowsByProduct.has(key)) rowsByProduct.set(key, []);
    rowsByProduct.get(key).push(row);
  }

  const workspace = [];
  for (const product of products) {
    const productId = canonicalProductId(product?.id);
    if (!productId) continue;
    for (const field of PRODUCT_TRANSLATION_FIELDS) {
      const sourceRu = productFieldSource(product, field);
      if (!sourceRu) continue;
      const currentHash = sourceHash(sourceRu);
      const stored = rowsByProduct.get(`${productId}\0${field}`) || [];
      const byLanguage = {};
      for (const code of PUBLIC_LOCALE_CODES) {
        if (code === "ru") continue;
        const internal = exactTranslationTargetInternal(code === "zh" ? "zh" : code);
        const match =
          stored.find((item) => item.languageCode === internal) ||
          emptyStoredRow(productId, internal, field);
        const decorated = decorateRow(match, currentHash);
        byLanguage[code] = cellFromDecorated(decorated);
      }
      workspace.push({
        id: productTranslationRowId(productId, field),
        kind: "product",
        namespace: PRODUCT_TRANSLATION_NAMESPACE,
        entityType: "product",
        entityId: productId,
        fieldKey: field,
        sourceRu,
        critical: field === "name",
        languages: byLanguage,
      });
    }
  }
  return workspace;
}

export function getProductTranslationWorkspace(productId) {
  const product = requireExistingProduct(productId);
  const id = canonicalProductId(product.id);
  const stored = listProductTranslationRowsForProduct(id);
  const fields = {};
  for (const field of PRODUCT_TRANSLATION_FIELDS) {
    const sourceRu = productFieldSource(product, field);
    const currentHash = sourceRu ? sourceHash(sourceRu) : "";
    const languages = {};
    for (const internal of TARGET_INTERNAL_LOCALES) {
      const row =
        stored.find((item) => item.languageCode === internal && item.fieldKey === field) ||
        emptyStoredRow(id, internal, field);
      languages[toPublicLocaleCode(internal)] = {
        sourceRu,
        sourceHash: currentHash,
        ...decorateRow(row, currentHash),
      };
    }
    fields[field] = { sourceRu, sourceHash: currentHash, languages };
  }
  return {
    productId: id,
    name: String(product.name || ""),
    fields,
  };
}

function glossaryForLanguage(internal) {
  return listGlossaryRows().filter((row) => row.languageCode === internal);
}

function validateWrite({ product, field, sourceRu, value, language }) {
  const check = validateProductTranslationSemantics({
    sourceRu,
    targetValue: value,
    product,
    glossaryEntries: glossaryForLanguage(language),
  });
  if (!check.ok) {
    const error = new Error(check.message);
    error.status = 400;
    error.code = check.code;
    throw error;
  }
}

export function saveProductManualTranslation(productId, language, field, value, actor = "") {
  const internal = requireTargetLocale(language);
  const fieldKey = requireField(field);
  const text = typeof value === "string" ? value : "";
  if (!isNonEmptyText(text)) {
    const error = new Error("Translation value cannot be empty.");
    error.status = 400;
    error.code = "EMPTY_VALUE";
    throw error;
  }
  return runInTransaction(() => {
    const product = requireExistingProduct(productId);
    const id = canonicalProductId(product.id);
    const sourceRu = productFieldSource(product, fieldKey);
    if (!sourceRu) {
      const error = new Error("Canonical Russian source is empty.");
      error.status = 400;
      error.code = "EMPTY_SOURCE";
      throw error;
    }
    validateWrite({ product, field: fieldKey, sourceRu, value: text, language: internal });
    const currentHash = sourceHash(sourceRu);
    const existing = getProductTranslationRow(id, internal, fieldKey) || emptyStoredRow(id, internal, fieldKey);
    const unchanged =
      existing.manualValue === text &&
      existing.manualSourceHash === currentHash &&
      String(existing.updatedBy || "") === String(actor || "");
    if (unchanged) {
      return { changed: false, field: decorateRow(existing, currentHash) };
    }
    const next = {
      ...existing,
      productId: id,
      languageCode: internal,
      fieldKey,
      manualValue: text,
      manualSourceHash: currentHash,
      updatedAt: nowIso(),
      updatedBy: String(actor || ""),
    };
    upsertProductTranslationRow(next);
    return { changed: true, field: decorateRow(getProductTranslationRow(id, internal, fieldKey), currentHash) };
  });
}

export function resetProductTranslationToAuto(productId, language, field, actor = "") {
  const internal = requireTargetLocale(language);
  const fieldKey = requireField(field);
  return runInTransaction(() => {
    const product = requireExistingProduct(productId);
    const id = canonicalProductId(product.id);
    const sourceRu = productFieldSource(product, fieldKey);
    const currentHash = sourceRu ? sourceHash(sourceRu) : "";
    const existing = getProductTranslationRow(id, internal, fieldKey);
    if (!existing || !String(existing.manualValue || "").trim()) {
      return {
        changed: false,
        field: decorateRow(existing || emptyStoredRow(id, internal, fieldKey), currentHash),
      };
    }
    const next = {
      ...existing,
      manualValue: "",
      manualSourceHash: "",
      updatedAt: nowIso(),
      updatedBy: String(actor || ""),
    };
    upsertProductTranslationRow(next);
    return { changed: true, field: decorateRow(getProductTranslationRow(id, internal, fieldKey), currentHash) };
  });
}

export function upsertProductAutoTranslation(item, actor = "auto-import") {
  const internal = requireTargetLocale(item.language);
  const fieldKey = requireField(item.field);
  const product = requireExistingProduct(item.productId);
  const id = canonicalProductId(product.id);
  const sourceRu = productFieldSource(product, fieldKey);
  if (!sourceRu) {
    return { changed: false, skipped: "EMPTY_SOURCE" };
  }
  const currentHash = sourceHash(sourceRu);
  if (String(item.sourceHash || "") !== currentHash) {
    return { changed: false, skipped: "SOURCE_HASH_MISMATCH" };
  }
  const text = typeof item.value === "string" ? item.value : "";
  if (!isNonEmptyText(text)) {
    return { changed: false, skipped: "EMPTY_VALUE" };
  }
  const check = validateProductTranslationSemantics({
    sourceRu,
    targetValue: text,
    product,
    glossaryEntries: glossaryForLanguage(internal),
  });
  if (!check.ok) {
    return { changed: false, skipped: check.code };
  }
  const existing = getProductTranslationRow(id, internal, fieldKey) || emptyStoredRow(id, internal, fieldKey);
  if (String(existing.manualValue || "").trim()) {
    return { changed: false, skipped: "MANUAL_PROTECTED" };
  }
  if (existing.autoValue === text && existing.autoSourceHash === currentHash) {
    return { changed: false, skipped: "UNCHANGED" };
  }
  upsertProductTranslationRow({
    ...existing,
    productId: id,
    languageCode: internal,
    fieldKey,
    autoValue: text,
    autoSourceHash: currentHash,
    updatedAt: nowIso(),
    updatedBy: String(actor || "auto-import"),
  });
  return { changed: true, skipped: "" };
}

export function importProductAutoArtifact(artifact, actor = "auto-import") {
  if (!artifact || artifact.format !== "clover-product-auto-import" || Number(artifact.formatVersion) !== 1) {
    const error = new Error("Unsupported product AUTO import artifact.");
    error.status = 400;
    error.code = "INVALID_ARTIFACT";
    throw error;
  }
  const items = Array.isArray(artifact.items) ? artifact.items : [];
  return runInTransaction(() => {
    const results = [];
    for (const item of items) {
      results.push(upsertProductAutoTranslation(item, actor));
    }
    return {
      runId: String(artifact.runId || ""),
      imported: results.filter((item) => item.changed).length,
      skipped: results.filter((item) => !item.changed).length,
      results,
    };
  });
}

export function generateAutoCandidate(product, language, field) {
  const internal = requireTargetLocale(language);
  const fieldKey = requireField(field);
  const sourceRu = productFieldSource(product, fieldKey);
  return applyGlossaryPhrases(sourceRu, glossaryForLanguage(internal));
}

export function deleteProductLocalization(productId) {
  return deleteProductTranslationRows(canonicalProductId(productId));
}

export function projectLocalizedProductDisplay(product, language, enabledLanguages = ["ru"]) {
  if (!product || typeof product !== "object") return product;
  const requested = String(language || "").trim();
  if (!requested || requested === "ru") return product;
  let internal = "";
  try {
    internal = requireTargetLocale(requested);
  } catch {
    return product;
  }
  const publicCode = toPublicLocaleCode(internal);
  const enabled = Array.isArray(enabledLanguages) ? enabledLanguages : ["ru"];
  if (!enabled.includes(publicCode)) return product;

  const overlay = { ...product };
  const details =
    product.storefrontDetails && typeof product.storefrontDetails === "object"
      ? { ...product.storefrontDetails }
      : { description: "", composition: "", characteristics: "" };
  for (const field of PRODUCT_TRANSLATION_FIELDS) {
    const sourceRu = productFieldSource(product, field);
    const currentHash = sourceRu ? sourceHash(sourceRu) : "";
    const row = getProductTranslationRow(canonicalProductId(product.id), internal, field);
    const derived = deriveProductFieldState(row, currentHash);
    if (!derived.value) continue;
    if (field === "name") overlay.name = derived.value;
    else details[field] = derived.value;
  }
  overlay.storefrontDetails = details;
  return overlay;
}

export function productCompletenessItems(products = listCanonicalProducts()) {
  const items = [];
  for (const row of buildProductWorkspaceRows(products)) {
    if (row.critical !== true) continue;
    for (const [language, cell] of Object.entries(row.languages || {})) {
      items.push({
        domain: "products",
        language,
        state: cell.stale ? "STALE" : cell.state,
        stale: cell.stale,
        critical: true,
        value: cell.value,
      });
    }
  }
  return items;
}

export function listGlossaryEntries(filters = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  let language = "";
  if (filters.language) language = requireTargetLocale(filters.language);
  return listGlossaryRows()
    .filter((row) => (!language || row.languageCode === language))
    .filter((row) => {
      if (!query) return true;
      const hay = `${row.sourceRu} ${row.targetValue} ${row.context}`.toLowerCase();
      return hay.includes(query);
    })
    .map((row) => ({
      ...row,
      publicLanguage: toPublicLocaleCode(row.languageCode),
      protected: Number(row.protected) === 1,
    }));
}

export function saveGlossaryEntry(patch = {}, actor = "") {
  const sourceRu = String(patch.sourceRu || "").trim();
  const targetValue = String(patch.targetValue || "").trim();
  const context = String(patch.context || "").trim();
  if (!sourceRu || !targetValue) {
    const error = new Error("Glossary source and target are required.");
    error.status = 400;
    error.code = "EMPTY_VALUE";
    throw error;
  }
  const languageCode = requireTargetLocale(patch.language || patch.languageCode);
  const normalizedSource = normalizeGlossaryPhrase(sourceRu);
  const normalizedContext = normalizeGlossaryPhrase(context);
  const stamp = nowIso();
  return runInTransaction(() => {
    const existingId = String(patch.id || "").trim();
    const clash = findGlossaryByIdentity(normalizedSource, languageCode, normalizedContext);
    if (clash && clash.id !== existingId) {
      const error = new Error("Glossary entry already exists for this phrase and context.");
      error.status = 409;
      error.code = "GLOSSARY_DUPLICATE";
      throw error;
    }
    if (existingId) {
      const current = getGlossaryRow(existingId);
      if (!current) {
        const error = new Error("Glossary entry not found.");
        error.status = 404;
        error.code = "UNKNOWN_GLOSSARY";
        throw error;
      }
      updateGlossaryRow({
        id: existingId,
        sourceRu,
        normalizedSource,
        languageCode,
        targetValue,
        context,
        normalizedContext,
        protected: Boolean(patch.protected),
        updatedAt: stamp,
        updatedBy: String(actor || ""),
      });
      return { changed: true, entry: getGlossaryRow(existingId) };
    }
    const id = randomUUID();
    insertGlossaryRow({
      id,
      sourceRu,
      normalizedSource,
      languageCode,
      targetValue,
      context,
      normalizedContext,
      protected: Boolean(patch.protected),
      createdAt: stamp,
      updatedAt: stamp,
      updatedBy: String(actor || ""),
    });
    return { changed: true, entry: getGlossaryRow(id) };
  });
}

export function removeGlossaryEntry(id) {
  const current = getGlossaryRow(id);
  if (!current) {
    const error = new Error("Glossary entry not found.");
    error.status = 404;
    error.code = "UNKNOWN_GLOSSARY";
    throw error;
  }
  deleteGlossaryRow(id);
  return { changed: true, id: String(id) };
}

export function assertNoAuthorityColumns(row) {
  const keys = Object.keys(row || {});
  return !keys.some((key) => FORBIDDEN_AUTHORITY_KEYS.includes(key));
}
