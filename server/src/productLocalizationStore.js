import { randomUUID } from "node:crypto";
import {
  getGlobalState,
  runInTransaction,
  listProductTranslationRows,
  listProductTranslationRowsForProduct,
  listProductTranslationRowsForLanguage,
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
  ALLOWED_GLOSSARY_CONTEXTS,
  canonicalProductId,
  isProductTranslationField,
  isAllowedGlossaryContext,
  isTranslationRelevantProduct,
  productFieldSource,
  productTranslationRowId,
  normalizeGlossaryPhrase,
} from "../../src/shared/i18n/productLocalization.js";
import {
  PRODUCT_GLOSSARY_CONTEXTS,
  applyGlossaryPhrases,
  validateProductTranslationSemantics,
} from "./productLocalizationSemantics.js";
import { projectLocalizedProductDisplay } from "../../src/shared/i18n/productDisplayProjection.js";
import { bumpLocalizationCatalogVersion } from "./localizationVersion.js";
import {
  PRODUCT_ID_MAX_CHARS,
  MANUAL_NAME_MAX_CHARS,
  MANUAL_DETAIL_MAX_CHARS,
  GLOSSARY_SOURCE_MAX_CHARS,
  GLOSSARY_TARGET_MAX_CHARS,
  GLOSSARY_CONTEXT_MAX_CHARS,
  STAGE4_QUERY_MAX_CHARS,
  PRODUCT_WORKSPACE_DEFAULT_LIMIT,
  assertBoundedString,
  parseWorkspaceLimit,
  parseWorkspaceOffset,
} from "./productInputLimits.js";

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

export function translationRelevantProducts(products = listCanonicalProducts()) {
  return (Array.isArray(products) ? products : []).filter(isTranslationRelevantProduct);
}

export function findCanonicalProduct(productId) {
  const id = canonicalProductId(productId);
  if (!id) return null;
  return listCanonicalProducts().find((item) => canonicalProductId(item?.id) === id) || null;
}

function requireExistingProduct(productId) {
  assertBoundedString(canonicalProductId(productId), PRODUCT_ID_MAX_CHARS, { label: "productId" });
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

function requireGlossaryContext(context) {
  const value = String(context ?? "");
  assertBoundedString(value, GLOSSARY_CONTEXT_MAX_CHARS, { label: "context" });
  if (!isAllowedGlossaryContext(value)) {
    const error = new Error("Unknown glossary context.");
    error.status = 400;
    error.code = "INVALID_GLOSSARY_CONTEXT";
    throw error;
  }
  return value;
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
    autoRunId: row.autoRunId || "",
    autoGeneratedAt: row.autoGeneratedAt || "",
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
    autoRunId: "",
    autoGeneratedAt: "",
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
    autoSourceHash: decorated.autoSourceHash || "",
    autoRunId: decorated.autoRunId || "",
    autoGeneratedAt: decorated.autoGeneratedAt || "",
    manualValue: decorated.manualValue || "",
    manualSourceHash: decorated.manualSourceHash || "",
    updatedAt: decorated.updatedAt || "",
    updatedBy: decorated.updatedBy || "",
  };
}

function requestedInternalLanguage(language) {
  if (!language) return "";
  return requireTargetLocale(language);
}

export function buildProductWorkspaceRows(
  products = listCanonicalProducts(),
  options = {}
) {
  const internalOnly = options.language ? requestedInternalLanguage(options.language) : "";
  const publicOnly = internalOnly ? toPublicLocaleCode(internalOnly) : "";
  const storedRows = internalOnly
    ? listProductTranslationRowsForLanguage(internalOnly)
    : listProductTranslationRows();
  const rowsByProduct = new Map();
  for (const row of storedRows) {
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
      const languageCodes = publicOnly
        ? [publicOnly]
        : PUBLIC_LOCALE_CODES.filter((code) => code !== "ru");
      for (const code of languageCodes) {
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
        sourceHash: currentHash,
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

function requireCurrentSourceHash(currentHash, expectedSourceHash) {
  if (String(expectedSourceHash || "") !== String(currentHash || "")) {
    const error = new Error("Canonical Russian source changed. Reload before saving.");
    error.status = 409;
    error.code = "SOURCE_STALE";
    throw error;
  }
}

function validateWrite({ product, field, sourceRu, value, language }) {
  const check = validateProductTranslationSemantics({
    sourceRu,
    targetValue: value,
    product,
    glossaryEntries: glossaryForLanguage(language),
    context: PRODUCT_GLOSSARY_CONTEXTS[field] || "",
  });
  if (!check.ok) {
    const error = new Error(check.message);
    error.status = 400;
    error.code = check.code;
    throw error;
  }
}

function assertManualValueSize(fieldKey, text) {
  const max = fieldKey === "name" ? MANUAL_NAME_MAX_CHARS : MANUAL_DETAIL_MAX_CHARS;
  assertBoundedString(text, max, { label: fieldKey });
}

export function saveProductManualTranslation(
  productId,
  language,
  field,
  value,
  actor = "",
  expectedSourceHash = ""
) {
  const internal = requireTargetLocale(language);
  const fieldKey = requireField(field);
  const text = typeof value === "string" ? value : "";
  assertManualValueSize(fieldKey, text);
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
    const currentHash = sourceHash(sourceRu);
    requireCurrentSourceHash(currentHash, expectedSourceHash);
    validateWrite({ product, field: fieldKey, sourceRu, value: text, language: internal });
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
      autoValue: existing.autoValue || "",
      autoSourceHash: existing.autoSourceHash || "",
      autoRunId: existing.autoRunId || "",
      autoGeneratedAt: existing.autoGeneratedAt || "",
      manualValue: text,
      manualSourceHash: currentHash,
      updatedAt: nowIso(),
      updatedBy: String(actor || ""),
    };
    upsertProductTranslationRow(next);
    bumpLocalizationCatalogVersion(actor || "product-manual");
    return { changed: true, field: decorateRow(getProductTranslationRow(id, internal, fieldKey), currentHash) };
  });
}

export function resetProductTranslationToAuto(
  productId,
  language,
  field,
  actor = "",
  expectedSourceHash = ""
) {
  const internal = requireTargetLocale(language);
  const fieldKey = requireField(field);
  return runInTransaction(() => {
    const product = requireExistingProduct(productId);
    const id = canonicalProductId(product.id);
    const sourceRu = productFieldSource(product, fieldKey);
    const currentHash = sourceRu ? sourceHash(sourceRu) : "";
    requireCurrentSourceHash(currentHash, expectedSourceHash);
    const existing = getProductTranslationRow(id, internal, fieldKey);
    if (!existing || !String(existing.manualValue || "").trim()) {
      return {
        changed: false,
        field: decorateRow(existing || emptyStoredRow(id, internal, fieldKey), currentHash),
      };
    }
    const survivingAuto = String(existing.autoValue || "").trim();
    if (survivingAuto && sourceRu) {
      const check = validateProductTranslationSemantics({
        sourceRu,
        targetValue: survivingAuto,
        product,
        glossaryEntries: glossaryForLanguage(internal),
        context: PRODUCT_GLOSSARY_CONTEXTS[fieldKey] || "",
      });
      if (!check.ok) {
        const error = new Error(check.message);
        error.status = 400;
        error.code = check.code;
        throw error;
      }
    }
    const next = {
      ...existing,
      autoValue: existing.autoValue || "",
      autoSourceHash: existing.autoSourceHash || "",
      autoRunId: existing.autoRunId || "",
      autoGeneratedAt: existing.autoGeneratedAt || "",
      manualValue: "",
      manualSourceHash: "",
      updatedAt: nowIso(),
      updatedBy: String(actor || ""),
    };
    upsertProductTranslationRow(next);
    bumpLocalizationCatalogVersion(actor || "product-auto-reset");
    return { changed: true, field: decorateRow(getProductTranslationRow(id, internal, fieldKey), currentHash) };
  });
}

export function upsertProductAutoTranslation(item, actor = "auto-import", provenance = {}) {
  return runInTransaction(() => {
    const internal = requireTargetLocale(item.language);
    const fieldKey = requireField(item.field);
    const product = requireExistingProduct(item.productId);
    const id = canonicalProductId(product.id);
    const sourceRu = productFieldSource(product, fieldKey);
    if (!sourceRu) {
      return { changed: false, skipped: "EMPTY_SOURCE", kind: "" };
    }
    const currentHash = sourceHash(sourceRu);
    if (String(item.sourceHash || "") !== currentHash) {
      return { changed: false, skipped: "SOURCE_HASH_MISMATCH", kind: "" };
    }
    const text = typeof item.value === "string" ? item.value : "";
    if (!isNonEmptyText(text)) {
      return { changed: false, skipped: "EMPTY_VALUE", kind: "" };
    }
    const check = validateProductTranslationSemantics({
      sourceRu,
      targetValue: text,
      product,
      glossaryEntries: glossaryForLanguage(internal),
      context: PRODUCT_GLOSSARY_CONTEXTS[fieldKey] || "",
    });
    if (!check.ok) {
      return { changed: false, skipped: check.code, kind: "" };
    }
    const existing = getProductTranslationRow(id, internal, fieldKey) || emptyStoredRow(id, internal, fieldKey);
    if (String(existing.manualValue || "").trim()) {
      return { changed: false, skipped: "MANUAL_PROTECTED", kind: "" };
    }
    if (existing.autoValue === text && existing.autoSourceHash === currentHash) {
      return { changed: false, skipped: "UNCHANGED", kind: "" };
    }
    const hadAuto = Boolean(String(existing.autoValue || "").trim());
    upsertProductTranslationRow({
      ...existing,
      productId: id,
      languageCode: internal,
      fieldKey,
      autoValue: text,
      autoSourceHash: currentHash,
      autoRunId: provenance.runId || existing.autoRunId || "",
      autoGeneratedAt: provenance.generatedAt || existing.autoGeneratedAt || "",
      updatedAt: nowIso(),
      updatedBy: String(actor || "auto-import"),
    });
    bumpLocalizationCatalogVersion(actor || "product-auto");
    return { changed: true, skipped: "", kind: hadAuto ? "updated" : "inserted" };
  });
}

export function generateAutoCandidate(product, language, field) {
  const internal = requireTargetLocale(language);
  const fieldKey = requireField(field);
  const sourceRu = productFieldSource(product, fieldKey);
  return applyGlossaryPhrases(
    sourceRu,
    glossaryForLanguage(internal),
    PRODUCT_GLOSSARY_CONTEXTS[fieldKey] || ""
  );
}

export function buildProductTranslationCellMap(languageCode) {
  const internal = requireTargetLocale(languageCode);
  const map = new Map();
  for (const row of listProductTranslationRowsForLanguage(internal)) {
    if (!map.has(row.productId)) map.set(row.productId, {});
    map.get(row.productId)[row.fieldKey] = row;
  }
  return map;
}

export { projectLocalizedProductDisplay };

export function deleteProductLocalization(productId) {
  return deleteProductTranslationRows(canonicalProductId(productId));
}

export function productCompletenessItems(products = translationRelevantProducts()) {
  const items = [];
  for (const row of buildProductWorkspaceRows(products)) {
    for (const [language, cell] of Object.entries(row.languages || {})) {
      items.push({
        domain: "products",
        language,
        state: cell.stale ? "STALE" : cell.state,
        stale: cell.stale,
        critical: row.critical === true,
        value: cell.value,
        fieldKey: row.fieldKey,
      });
    }
  }
  return items;
}

function emptyFieldReport() {
  return { total: 0, current: 0, stale: 0, missing: 0 };
}

export function productFieldCompletenessByLanguage(products = translationRelevantProducts()) {
  const reports = {};
  for (const code of PUBLIC_LOCALE_CODES) {
    if (code === "ru") continue;
    reports[code] = {
      name: emptyFieldReport(),
      description: emptyFieldReport(),
      composition: emptyFieldReport(),
      characteristics: emptyFieldReport(),
    };
  }
  for (const row of buildProductWorkspaceRows(products)) {
    for (const [language, cell] of Object.entries(row.languages || {})) {
      const bucket = reports[language]?.[row.fieldKey];
      if (!bucket) continue;
      bucket.total += 1;
      if (cell.stale) bucket.stale += 1;
      else if (!String(cell.value || "").trim() || cell.state === "MISSING") bucket.missing += 1;
      else bucket.current += 1;
    }
  }
  for (const report of Object.values(reports)) {
    report.criticalComplete =
      report.name.total > 0 && report.name.current === report.name.total && report.name.stale === 0;
    report.detailReady = ["description", "composition", "characteristics"].every(
      (field) => report[field].current === report[field].total && report[field].stale === 0
    );
  }
  return reports;
}

function mapGlossaryEntry(row) {
  return {
    ...row,
    publicLanguage: toPublicLocaleCode(row.languageCode),
    protected: Number(row.protected) === 1,
  };
}

export function listGlossaryEntries(filters = {}) {
  return listGlossaryPage(filters).entries;
}

export function listGlossaryPage(filters = {}) {
  if (filters.query) {
    assertBoundedString(filters.query, STAGE4_QUERY_MAX_CHARS, { query: true, label: "query" });
  }
  const query = String(filters.query || "").trim().toLowerCase();
  let language = "";
  if (filters.language) language = requireTargetLocale(filters.language);
  const filtered = listGlossaryRows()
    .filter((row) => !language || row.languageCode === language)
    .filter((row) => {
      if (!query) return true;
      const hay = `${row.sourceRu} ${row.targetValue} ${row.context}`.toLowerCase();
      return hay.includes(query);
    })
    .map(mapGlossaryEntry);
  const total = filtered.length;
  const limit = parseWorkspaceLimit(filters.limit, PRODUCT_WORKSPACE_DEFAULT_LIMIT);
  const offset = parseWorkspaceOffset(filters.offset);
  const entries = filtered.slice(offset, offset + limit);
  return { entries, total, offset, limit, hasMore: offset + entries.length < total };
}

function glossaryUnchanged(current, next) {
  return (
    String(current.sourceRu || "") === String(next.sourceRu || "") &&
    String(current.targetValue || "") === String(next.targetValue || "") &&
    String(current.context || "") === String(next.context || "") &&
    String(current.languageCode || "") === String(next.languageCode || "") &&
    Number(current.protected) === Number(next.protected)
  );
}

export function saveGlossaryEntry(patch = {}, actor = "") {
  const sourceRu = String(patch.sourceRu || "").trim();
  const targetValue = String(patch.targetValue || "").trim();
  const context = requireGlossaryContext(patch.context || "");
  assertBoundedString(sourceRu, GLOSSARY_SOURCE_MAX_CHARS, { label: "sourceRu" });
  assertBoundedString(targetValue, GLOSSARY_TARGET_MAX_CHARS, { label: "targetValue" });
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
      const next = {
        id: existingId,
        sourceRu,
        normalizedSource,
        languageCode,
        targetValue,
        context,
        normalizedContext,
        protected: patch.protected ? 1 : 0,
        updatedAt: stamp,
        updatedBy: String(actor || ""),
      };
      if (glossaryUnchanged(current, next)) {
        return { changed: false, entry: current };
      }
      updateGlossaryRow(next);
      bumpLocalizationCatalogVersion(actor || "glossary-edit");
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
    bumpLocalizationCatalogVersion(actor || "glossary-add");
    return { changed: true, entry: getGlossaryRow(id) };
  });
}

export function removeGlossaryEntry(id, actor = "") {
  return runInTransaction(() => {
    const current = getGlossaryRow(id);
    if (!current) {
      const error = new Error("Glossary entry not found.");
      error.status = 404;
      error.code = "UNKNOWN_GLOSSARY";
      throw error;
    }
    deleteGlossaryRow(id);
    bumpLocalizationCatalogVersion(actor || "glossary-delete");
    return { changed: true, id: String(id) };
  });
}

export function assertNoAuthorityColumns(row) {
  const keys = Object.keys(row || {});
  return !keys.some((key) => FORBIDDEN_AUTHORITY_KEYS.includes(key));
}

export { ALLOWED_GLOSSARY_CONTEXTS };
