import { sourceHash, normalizeSourceRu } from "../../src/shared/i18n/sourceHash.js";
import {
  PRODUCT_TRANSLATION_FIELDS,
  canonicalProductId,
  productFieldSource,
} from "../../src/shared/i18n/productLocalization.js";

export function listProductSourceCells(products = []) {
  const cells = [];
  const sorted = [...(Array.isArray(products) ? products : [])].sort((left, right) =>
    canonicalProductId(left?.id).localeCompare(canonicalProductId(right?.id), "en")
  );
  for (const product of sorted) {
    const productId = canonicalProductId(product?.id);
    if (!productId) continue;
    for (const field of PRODUCT_TRANSLATION_FIELDS) {
      const sourceRu = productFieldSource(product, field);
      if (!sourceRu) continue;
      cells.push({
        productId,
        field,
        sourceRu,
        normalizedSource: normalizeSourceRu(sourceRu),
        sourceHash: sourceHash(sourceRu),
      });
    }
  }
  return cells;
}

export function catalogSourceFingerprint(products = []) {
  const lines = listProductSourceCells(products).map(
    (cell) => `${cell.productId}\0${cell.field}\0${cell.normalizedSource}\0${cell.sourceHash}`
  );
  return sourceHash(lines.join("\n"));
}

export function sourceFieldCounts(products = []) {
  const counts = { name: 0, description: 0, composition: 0, characteristics: 0 };
  for (const cell of listProductSourceCells(products)) {
    counts[cell.field] += 1;
  }
  return counts;
}
