/**
 * Offline AUTO candidate generator: glossary longest-match only.
 * Does not call a translator. Does not write the database unless imported later.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  PRODUCT_TRANSLATION_FIELDS,
  productFieldSource,
  canonicalProductId,
} from "../../src/shared/i18n/productLocalization.js";
import { sourceHash } from "../../src/shared/i18n/sourceHash.js";
import { TARGET_INTERNAL_LOCALES } from "../../src/shared/i18n/languageRegistry.js";

const dbPath = process.env.DB_PATH;
if (!dbPath) {
  console.error("DB_PATH is required.");
  process.exit(2);
}

const { listCanonicalProducts, generateAutoCandidate } = await import(
  "../src/productLocalizationStore.js"
);

const products = listCanonicalProducts();
const items = [];
for (const product of products) {
  for (const field of PRODUCT_TRANSLATION_FIELDS) {
    const sourceRu = productFieldSource(product, field);
    if (!sourceRu) continue;
    const hash = sourceHash(sourceRu);
    for (const language of TARGET_INTERNAL_LOCALES) {
      const value = generateAutoCandidate(product, language, field);
      if (!value || value === sourceRu) continue;
      items.push({
        productId: canonicalProductId(product.id),
        language,
        field,
        value,
        sourceHash: hash,
      });
    }
  }
}

const artifact = {
  format: "clover-product-auto-import",
  formatVersion: 1,
  runId: `glossary-offline-${new Date().toISOString()}`,
  generatedAt: new Date().toISOString(),
  items,
};

const out = process.argv[2] || path.resolve(process.cwd(), "product-auto-artifact.json");
writeFileSync(out, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ ok: true, out, count: items.length }, null, 2));
