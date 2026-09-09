/**
 * Offline AUTO_MACHINE_DRAFT generator for Stage 4.
 * Reads a product snapshot (read-only) and writes a committed artifact set.
 * Does not call network translators. Does not write any application database.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { canonicalProductId } from "../../src/shared/i18n/productLocalization.js";
import {
  catalogSourceFingerprint,
  listProductSourceCells,
  sourceFieldCounts,
} from "../src/productCatalogFingerprint.js";
import { validateProductTranslationSemantics, PRODUCT_GLOSSARY_CONTEXTS } from "../src/productLocalizationSemantics.js";
import { leftoverCyrillic, TARGETS, translateCatalogText } from "./lib/stage4Phrasebook.mjs";

const EXPECTED_BASE_MAIN_SHA = "cbd1d0e3ac831fd41126d4e6b0e7af446d436d42";
const FORMAT = "clover-product-auto-import";
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../i18n-artifacts/stage4");
const productionDb = "/opt/clover/clover-app/server/data/clover.sqlite";

function slimProduct(product) {
  return {
    id: product.id,
    name: product.name,
    code: product.code || "",
    oneCCode: product.oneCCode || "",
    oneCId: product.oneCId || "",
    storefrontDetails: {
      description: product.storefrontDetails?.description || "",
      composition: product.storefrontDetails?.composition || "",
      characteristics: product.storefrontDetails?.characteristics || "",
    },
  };
}

function loadProducts() {
  const db = new DatabaseSync(productionDb, { readOnly: true });
  const row = db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("products");
  db.close();
  return JSON.parse(row.value_json).map(slimProduct);
}

const products = loadProducts();
const cells = listProductSourceCells(products);
const fingerprint = catalogSourceFingerprint(products);
const fieldCounts = sourceFieldCounts(products);
const generatedAt = new Date().toISOString();

const leftovers = new Map();
const failures = [];
const itemsByLanguage = Object.fromEntries(TARGETS.map((code) => [code, []]));

for (const cell of cells) {
  const product = products.find((item) => canonicalProductId(item.id) === cell.productId);
  for (const language of TARGETS) {
    const value = translateCatalogText(cell.sourceRu, language);
    const check = validateProductTranslationSemantics({
      sourceRu: cell.sourceRu,
      targetValue: value,
      product,
      glossaryEntries: [],
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
    if (language === "en" || language === "uz" || language === "zh-CN" || language === "ar") {
      for (const token of leftoverCyrillic(value)) {
        if (/^(нф|кл)$/i.test(token) || token.length <= 1) continue;
        leftovers.set(`${language}:${token}`, (leftovers.get(`${language}:${token}`) || 0) + 1);
      }
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

mkdirSync(outDir, { recursive: true });
const chunks = [];
for (const language of TARGETS) {
  const file = `chunk-${language}.json`;
  const payload = `${JSON.stringify({ language, items: itemsByLanguage[language] }, null, 2)}\n`;
  writeFileSync(path.join(outDir, file), payload);
  chunks.push({
    file,
    language,
    count: itemsByLanguage[language].length,
    sha256: createHash("sha256").update(payload).digest("hex"),
  });
}

const languageCounts = Object.fromEntries(TARGETS.map((code) => [code, itemsByLanguage[code].length]));
const targetCellCount = TARGETS.reduce((sum, code) => sum + languageCounts[code], 0);
const manifest = {
  format: FORMAT,
  formatVersion: 1,
  baseMainSha: EXPECTED_BASE_MAIN_SHA,
  generatedAt,
  quality: "AUTO_MACHINE_DRAFT",
  productCount: products.length,
  sourceFieldCounts: fieldCounts,
  sourceCellCount: cells.length,
  targetCellCount,
  wholeCatalogSourceFingerprint: fingerprint,
  languageCounts,
  chunks,
};

writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  ok: failures.length === 0,
  outDir,
  productCount: products.length,
  sourceCellCount: cells.length,
  targetCellCount,
  languageCounts,
  wholeCatalogSourceFingerprint: fingerprint,
  semanticFailures: failures.length,
  leftoverCyrillicTypes: leftovers.size,
  leftoverSample: [...leftovers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
  failureSample: failures.slice(0, 12),
}, null, 2));
if (failures.length) process.exitCode = 2;
