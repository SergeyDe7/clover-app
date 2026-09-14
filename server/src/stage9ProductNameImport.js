/**
 * Narrow Stage 9 import: exactly the prepared product-name gap cells.
 * Never overwrites MANUAL. Refuses unexpected AUTO conflicts.
 * Does not talk to translation providers.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { sourceHash } from "../../src/shared/i18n/sourceHash.js";
import {
  exactTranslationTargetInternal,
  isExactTranslationTargetLocale,
} from "../../src/shared/i18n/languageRegistry.js";
import { canonicalProductId } from "../../src/shared/i18n/productLocalization.js";
import {
  PRODUCT_GLOSSARY_CONTEXTS,
  validateProductTranslationSemantics,
} from "./productLocalizationSemantics.js";
import {
  getProductTranslationRow,
  listGlossaryRows,
  runInTransaction,
  upsertProductTranslationRow,
  writeAudit,
} from "./db.js";
import { findCanonicalProduct, listCanonicalProducts } from "./productLocalizationStore.js";
import {
  bumpLocalizationCatalogVersion,
  readLocalizationCatalogSettings,
} from "./localizationVersion.js";

export const STAGE9_NAME_GAP_FORMAT = "clover-stage9-product-name-gap";
export const STAGE9_NAME_GAP_FORMAT_VERSION = 1;
export const STAGE9_NAME_GAP_QUALITY = "AUTO_MACHINE_DRAFT";
export const STAGE9_EXPECTED_CELL_COUNT = 18;
export const STAGE9_EXPECTED_PRODUCT_IDS = Object.freeze(["723", "724", "725"]);
export const STAGE9_EXPECTED_LANGUAGES = Object.freeze([
  "en",
  "uz",
  "ky",
  "tg",
  "zh-CN",
  "ar",
]);

function importError(code, message, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function loadStage9ProductNameArtifact(filePath) {
  const resolved = path.resolve(filePath);
  let raw;
  try {
    raw = JSON.parse(readFileSync(resolved, "utf8"));
  } catch (error) {
    throw importError("INVALID_ARTIFACT", `Cannot read artifact: ${error.message}`, 400);
  }
  const doc = asObject(raw);
  if (!doc) throw importError("INVALID_ARTIFACT", "Artifact must be an object.", 400);
  if (
    doc.format !== STAGE9_NAME_GAP_FORMAT ||
    Number(doc.formatVersion) !== STAGE9_NAME_GAP_FORMAT_VERSION
  ) {
    throw importError("INVALID_ARTIFACT", "Unsupported Stage 9 name-gap artifact format.", 400);
  }
  if (doc.quality !== STAGE9_NAME_GAP_QUALITY) {
    throw importError("INVALID_ARTIFACT", "Artifact quality must be AUTO_MACHINE_DRAFT.", 400);
  }
  if (!Array.isArray(doc.items) || doc.items.length !== STAGE9_EXPECTED_CELL_COUNT) {
    throw importError(
      "INVALID_ARTIFACT",
      `Artifact must contain exactly ${STAGE9_EXPECTED_CELL_COUNT} items.`,
      400
    );
  }
  if (Number(doc.targetCellCount) !== STAGE9_EXPECTED_CELL_COUNT) {
    throw importError("INVALID_ARTIFACT", "targetCellCount must equal 18.", 400);
  }

  const seen = new Set();
  const items = [];
  for (const item of doc.items) {
    if (!asObject(item)) throw importError("INVALID_ARTIFACT", "Each item must be an object.", 400);
    const productId = canonicalProductId(item.productId);
    const field = String(item.field || "");
    const language = exactTranslationTargetInternal(item.language);
    const value = typeof item.value === "string" ? item.value.trim() : "";
    const itemHash = String(item.sourceHash || "");
    const sourceRu = typeof item.sourceRu === "string" ? item.sourceRu : "";
    if (!STAGE9_EXPECTED_PRODUCT_IDS.includes(productId)) {
      throw importError("INVALID_ARTIFACT", `Unexpected productId ${productId}.`, 400);
    }
    if (field !== "name") {
      throw importError("INVALID_ARTIFACT", "Only field=name is allowed.", 400);
    }
    if (!language || !isExactTranslationTargetLocale(item.language)) {
      throw importError("INVALID_ARTIFACT", `Invalid language ${item.language}.`, 400);
    }
    if (!STAGE9_EXPECTED_LANGUAGES.includes(language)) {
      throw importError("INVALID_ARTIFACT", `Unexpected language ${language}.`, 400);
    }
    if (!value) throw importError("INVALID_ARTIFACT", "Empty translation value.", 400);
    if (!itemHash) throw importError("INVALID_ARTIFACT", "sourceHash is required.", 400);
    if (item.quality && item.quality !== STAGE9_NAME_GAP_QUALITY) {
      throw importError("INVALID_ARTIFACT", "Item quality must be AUTO_MACHINE_DRAFT.", 400);
    }
    const key = `${productId}\0${language}\0${field}`;
    if (seen.has(key)) throw importError("INVALID_ARTIFACT", `Duplicate cell ${key}.`, 400);
    seen.add(key);
    items.push({ productId, field, language, value, sourceHash: itemHash, sourceRu });
  }
  for (const productId of STAGE9_EXPECTED_PRODUCT_IDS) {
    for (const language of STAGE9_EXPECTED_LANGUAGES) {
      if (!seen.has(`${productId}\0${language}\0name`)) {
        throw importError("INVALID_ARTIFACT", `Missing cell ${productId}/${language}.`, 400);
      }
    }
  }
  return {
    path: resolved,
    runId: String(doc.runId || ""),
    baseMainSha: String(doc.baseMainSha || ""),
    generatedAt: String(doc.generatedAt || ""),
    quality: STAGE9_NAME_GAP_QUALITY,
    nativeSpeakerVerified: false,
    sources: Array.isArray(doc.sources) ? doc.sources : [],
    items,
  };
}

function glossaryByLanguage(rows) {
  const map = new Map();
  for (const entry of rows) {
    const language = entry.languageCode || entry.language_code;
    const list = map.get(language) || [];
    list.push(entry);
    map.set(language, list);
  }
  return map;
}

function classifyItem(item, glossaryMap) {
  const product = findCanonicalProduct(item.productId);
  if (!product) return { code: "unknownProduct", fatal: true };
  const liveRu = String(product.name || "").trim();
  if (!liveRu) return { code: "staleSource", fatal: true };
  const liveHash = sourceHash(liveRu);
  if (liveHash !== item.sourceHash) return { code: "staleSource", fatal: true };
  if (item.sourceRu && item.sourceRu !== liveRu) return { code: "staleSource", fatal: true };

  const semantics = validateProductTranslationSemantics({
    sourceRu: liveRu,
    targetValue: item.value,
    product,
    glossaryEntries: glossaryMap.get(item.language) || [],
    context: PRODUCT_GLOSSARY_CONTEXTS.name,
  });
  if (!semantics.ok) {
    return {
      code: semantics.code === "NUMERIC_MISMATCH" ? "numericMismatch" : "protectedMismatch",
      fatal: true,
      detail: semantics.code,
    };
  }

  const existing = getProductTranslationRow(item.productId, item.language, item.field);
  if (String(existing?.manualValue || "").trim()) {
    return { code: "wouldSkipMANUAL", fatal: false, existing };
  }
  const autoValue = String(existing?.autoValue || "").trim();
  if (autoValue) {
    if (autoValue === item.value && String(existing.autoSourceHash || "") === item.sourceHash) {
      return { code: "alreadyIdentical", fatal: false, existing };
    }
    return { code: "unexpectedConflict", fatal: true, existing };
  }
  return { code: "wouldInsertAUTO", fatal: false, existing };
}

function summarize(loaded, glossaryMap) {
  const counts = {
    wouldInsertAUTO: 0,
    wouldSkipMANUAL: 0,
    alreadyIdentical: 0,
    staleSource: 0,
    unknownProduct: 0,
    numericMismatch: 0,
    protectedMismatch: 0,
    unexpectedConflict: 0,
  };
  const decisions = [];
  for (const item of loaded.items) {
    const result = classifyItem(item, glossaryMap);
    counts[result.code] = (counts[result.code] || 0) + 1;
    decisions.push({ item, result });
  }
  const fatal =
    counts.staleSource +
    counts.unknownProduct +
    counts.numericMismatch +
    counts.protectedMismatch +
    counts.unexpectedConflict;
  return { counts, decisions, fatal };
}

export function dryRunStage9ProductNameImport(artifactPath) {
  const loaded = loadStage9ProductNameArtifact(artifactPath);
  const glossaryMap = glossaryByLanguage(listGlossaryRows());
  const { counts, decisions, fatal } = summarize(loaded, glossaryMap);
  return {
    mode: "dry-run",
    writes: 0,
    runId: loaded.runId,
    quality: loaded.quality,
    nativeSpeakerVerified: false,
    targetCells: loaded.items.length,
    fatal,
    counts,
    decisions: decisions.map(({ item, result }) => ({
      productId: item.productId,
      language: item.language,
      field: item.field,
      decision: result.code,
      value: item.value,
    })),
    productCount: listCanonicalProducts().filter((p) =>
      STAGE9_EXPECTED_PRODUCT_IDS.includes(canonicalProductId(p?.id))
    ).length,
  };
}

export function applyStage9ProductNameImport(artifactPath, actor = "stage9-name-gap-import") {
  const loaded = loadStage9ProductNameArtifact(artifactPath);
  return runInTransaction(() => {
    const glossaryMap = glossaryByLanguage(listGlossaryRows());
    const { decisions, fatal } = summarize(loaded, glossaryMap);
    if (fatal > 0) {
      const sample = decisions.find((d) => d.result.fatal);
      throw importError(
        "ARTIFACT_VALIDATION_FAILED",
        `Fatal Stage 9 name-gap defects: ${fatal} (first=${sample.result.code} ${sample.item.productId}/${sample.item.language})`
      );
    }

    let inserted = 0;
    let skippedManual = 0;
    let identical = 0;
    const stamp = new Date().toISOString();
    for (const { item, result } of decisions) {
      if (result.code === "wouldSkipMANUAL") {
        skippedManual += 1;
        continue;
      }
      if (result.code === "alreadyIdentical") {
        identical += 1;
        continue;
      }
      const existing = result.existing || {
        productId: item.productId,
        languageCode: item.language,
        fieldKey: item.field,
        manualValue: "",
        manualSourceHash: "",
      };
      upsertProductTranslationRow({
        ...existing,
        productId: item.productId,
        languageCode: item.language,
        fieldKey: item.field,
        autoValue: item.value,
        autoSourceHash: item.sourceHash,
        autoRunId: loaded.runId,
        autoGeneratedAt: loaded.generatedAt || stamp,
        manualValue: existing.manualValue || "",
        manualSourceHash: existing.manualSourceHash || "",
        updatedAt: stamp,
        updatedBy: actor,
      });
      inserted += 1;
    }

    const changed = inserted > 0;
    const settings = changed
      ? bumpLocalizationCatalogVersion(actor)
      : readLocalizationCatalogSettings();

    writeAudit({
      action: "localization.product.stage9.name_gap.import",
      details: {
        runId: loaded.runId,
        inserted,
        skippedManual,
        identical,
        changed,
        catalogVersion: settings.catalogVersion,
      },
    });

    return {
      mode: "apply",
      runId: loaded.runId,
      imported: inserted,
      inserted,
      skippedManual,
      identical,
      catalogVersionBumped: changed,
      catalogVersion: settings.catalogVersion,
      quality: loaded.quality,
      nativeSpeakerVerified: false,
    };
  });
}
