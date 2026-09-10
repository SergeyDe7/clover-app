/**
 * Offline AUTO_MACHINE_DRAFT generator for Stage 4.
 * Requires explicit --source-db. Never defaults to production.
 * Generates into a temp sibling directory and promotes only after full validation.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { canonicalProductId } from "../../src/shared/i18n/productLocalization.js";
import {
  catalogSourceFingerprint,
  glossaryFingerprint,
  listProductSourceCells,
  sourceFieldCounts,
} from "../src/productCatalogFingerprint.js";
import {
  PRODUCT_GLOSSARY_CONTEXTS,
  extractImmutableIdentityTokens,
  validateProductTranslationSemantics,
} from "../src/productLocalizationSemantics.js";
import {
  loadAutoImportManifest,
  validateUniqueCoverage,
} from "../src/productAutoArtifact.js";
import { TARGETS, translateCatalogText } from "./lib/stage4Phrasebook.mjs";

const FORMAT = "clover-product-auto-import";
const here = path.dirname(fileURLToPath(import.meta.url));
const defaultOutDir = path.resolve(here, "../i18n-artifacts/stage4");

function parseArgs(argv) {
  const out = { sourceDb: "", outDir: defaultOutDir, baseMainSha: "", runId: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--source-db") {
      out.sourceDb = String(argv[++i] || "");
    } else if (token === "--out-dir") {
      out.outDir = path.resolve(String(argv[++i] || defaultOutDir));
    } else if (token === "--base-main-sha") {
      out.baseMainSha = String(argv[++i] || "");
    } else if (token === "--run-id") {
      out.runId = String(argv[++i] || "");
    }
  }
  if (!out.sourceDb) out.sourceDb = process.env.CLOVER_STAGE4_SOURCE_DB || "";
  return out;
}

function slimProduct(product) {
  return {
    id: product.id,
    name: product.name,
    code: product.code || "",
    oneCCode: product.oneCCode || "",
    oneCId: product.oneCId || "",
    active: product.active !== false,
    storefrontDetails: {
      description: product.storefrontDetails?.description || "",
      composition: product.storefrontDetails?.composition || "",
      characteristics: product.storefrontDetails?.characteristics || "",
    },
  };
}

function tableExists(db, name) {
  return Boolean(
    db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

function loadSource(sourceDb) {
  const db = new DatabaseSync(sourceDb, { readOnly: true });
  try {
    const row = db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("products");
    const products = JSON.parse(row.value_json).map(slimProduct);
    let glossary = [];
    if (tableExists(db, "translation_glossary")) {
      glossary = db
        .prepare(
          `SELECT source_ru AS sourceRu, language_code AS languageCode, target_value AS targetValue,
                  context, protected
           FROM translation_glossary`
        )
        .all();
    }
    return { products, glossary };
  } finally {
    db.close();
  }
}

function glossaryFor(language, glossary) {
  return glossary.filter((entry) => entry.languageCode === language);
}

function writeArtifactSet(outDir, manifest, itemsByLanguage, slimProducts) {
  mkdirSync(outDir, { recursive: true });
  for (const language of TARGETS) {
    const file = `chunk-${language}.json`;
    const payload = `${JSON.stringify({ language, items: itemsByLanguage[language] }, null, 2)}\n`;
    writeFileSync(path.join(outDir, file), payload);
  }
  writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    path.join(outDir, "source-products.slim.json"),
    `${JSON.stringify(slimProducts, null, 2)}\n`
  );
}

const args = parseArgs(process.argv.slice(2));
if (!args.sourceDb) {
  console.error("Usage: node generate-product-auto-artifact.mjs --source-db <sqlite> [--out-dir <dir>] [--base-main-sha <sha>] [--run-id <id>]");
  process.exit(2);
}

const { products, glossary } = loadSource(args.sourceDb);
const cells = listProductSourceCells(products);
const fingerprint = catalogSourceFingerprint(products);
const fieldCounts = sourceFieldCounts(products);
const generatedAt = new Date().toISOString();
const glossFp = glossaryFingerprint(glossary);
const runId =
  args.runId ||
  `stage4-initial-${(args.baseMainSha || "local").slice(0, 7)}-${fingerprint.slice(0, 12)}`;

const failures = [];
const itemsByLanguage = Object.fromEntries(TARGETS.map((code) => [code, []]));

for (const cell of cells) {
  const product = products.find((item) => canonicalProductId(item.id) === cell.productId);
  const protectedTokens = extractImmutableIdentityTokens(cell.sourceRu, product);
  for (const language of TARGETS) {
    const value = translateCatalogText(cell.sourceRu, language, {
      protectedTokens,
      glossaryEntries: glossaryFor(language, glossary),
      context: PRODUCT_GLOSSARY_CONTEXTS[cell.field] || "",
    });
    const check = validateProductTranslationSemantics({
      sourceRu: cell.sourceRu,
      targetValue: value,
      product,
      glossaryEntries: glossaryFor(language, glossary),
      context: PRODUCT_GLOSSARY_CONTEXTS[cell.field] || "",
    });
    if (!check.ok) {
      failures.push({
        productId: cell.productId,
        field: cell.field,
        language,
        code: check.code,
        message: check.message,
        sourceRu: cell.sourceRu,
        value,
      });
    }
    itemsByLanguage[language].push({
      productId: cell.productId,
      language,
      field: cell.field,
      sourceHash: cell.sourceHash,
      value,
    });
  }
}

const chunks = TARGETS.map((language) => {
  const file = `chunk-${language}.json`;
  const payload = `${JSON.stringify({ language, items: itemsByLanguage[language] }, null, 2)}\n`;
  return {
    file,
    language,
    count: itemsByLanguage[language].length,
    sha256: createHash("sha256").update(payload).digest("hex"),
  };
});

const languageCounts = Object.fromEntries(TARGETS.map((code) => [code, itemsByLanguage[code].length]));
const targetCellCount = TARGETS.reduce((sum, code) => sum + languageCounts[code], 0);
const manifest = {
  format: FORMAT,
  formatVersion: 1,
  quality: "AUTO_MACHINE_DRAFT",
  runId,
  baseMainSha: args.baseMainSha || "",
  generatedAt,
  productCount: products.length,
  sourceFieldCounts: fieldCounts,
  sourceCellCount: cells.length,
  targetCellCount,
  wholeCatalogSourceFingerprint: fingerprint,
  glossaryCount: glossary.length,
  glossaryFingerprint: glossFp,
  languageCounts,
  chunks,
};

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage4-artifact-"));
const stagingDir = path.join(
  path.dirname(args.outDir),
  `.${path.basename(args.outDir)}.next-${process.pid}`
);
const backupDir = path.join(
  path.dirname(args.outDir),
  `.${path.basename(args.outDir)}.prev-${process.pid}`
);
let promoted = false;
try {
  writeArtifactSet(tmpDir, manifest, itemsByLanguage, products);
  if (failures.length) {
    throw new Error(`semanticFailures=${failures.length}`);
  }
  const loaded = loadAutoImportManifest(path.join(tmpDir, "manifest.json"), {
    runId,
    baseMainSha: args.baseMainSha || undefined,
  });
  validateUniqueCoverage(loaded.items, cells);
  rmSync(stagingDir, { recursive: true, force: true });
  writeArtifactSet(stagingDir, manifest, itemsByLanguage, products);
  // Re-validate the on-disk staging tree before any rename into outDir.
  loadAutoImportManifest(path.join(stagingDir, "manifest.json"), {
    runId,
    baseMainSha: args.baseMainSha || undefined,
  });
  rmSync(backupDir, { recursive: true, force: true });
  if (existsSync(args.outDir)) {
    renameSync(args.outDir, backupDir);
  }
  renameSync(stagingDir, args.outDir);
  rmSync(backupDir, { recursive: true, force: true });
  promoted = true;
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: String(error.message || error),
    semanticFailures: failures.length,
    failureSample: failures.slice(0, 12),
  }, null, 2));
  process.exitCode = 2;
  // Recover previous artifact if mid-swap left outDir missing.
  if (!existsSync(args.outDir) && existsSync(backupDir)) {
    try {
      renameSync(backupDir, args.outDir);
    } catch {
      /* keep exitCode=2 */
    }
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(stagingDir, { recursive: true, force: true });
}

if (promoted) {
  console.log(JSON.stringify({
    ok: true,
    outDir: args.outDir,
    runId,
    productCount: products.length,
    sourceCellCount: cells.length,
    targetCellCount,
    languageCounts,
    wholeCatalogSourceFingerprint: fingerprint,
    glossaryFingerprint: glossFp,
    semanticFailures: 0,
    leftoverCyrillicTypes: 0,
    sourceDb: args.sourceDb,
    existingArtifactPreservedOnFailure: true,
  }, null, 2));
}
