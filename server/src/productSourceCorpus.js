import { getGlobalState, setGlobalState } from "./db.js";
import { DEFAULT_PRODUCTS } from "./defaults.js";
import {
  PRODUCT_TRANSLATION_FIELDS,
  canonicalProductId,
  productFieldSource,
} from "../../src/shared/i18n/productLocalization.js";
import { bumpLocalizationCatalogVersion } from "./localizationVersion.js";

export function productTranslatableSourceRecord(product) {
  const id = canonicalProductId(product?.id);
  if (!id) return null;
  const record = { id };
  for (const field of PRODUCT_TRANSLATION_FIELDS) {
    record[field] = productFieldSource(product, field);
  }
  return record;
}

export function productListSourceMap(products = []) {
  const map = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const record = productTranslatableSourceRecord(product);
    if (!record) continue;
    map.set(record.id, record);
  }
  return map;
}

export function translatableProductSourceChanged(beforeList, afterList) {
  const before = productListSourceMap(beforeList);
  const after = productListSourceMap(afterList);
  if (before.size !== after.size) return true;
  for (const [id, record] of after) {
    const previous = before.get(id);
    if (!previous) return true;
    for (const field of PRODUCT_TRANSLATION_FIELDS) {
      if (previous[field] !== record[field]) return true;
    }
  }
  for (const id of before.keys()) {
    if (!after.has(id)) return true;
  }
  return false;
}

/**
 * Canonical product list write. Bumps catalogVersion exactly once when any
 * Stage 4 Russian source field is created, deleted, or changed.
 * Price/UOM/1C-ref-only mutations leave version unchanged.
 * Does not open a nested transaction.
 */
export function commitCanonicalProducts(nextProducts, actor = "") {
  const before = getGlobalState("products", DEFAULT_PRODUCTS);
  setGlobalState("products", nextProducts);
  if (translatableProductSourceChanged(before, nextProducts)) {
    bumpLocalizationCatalogVersion(actor || "product-source");
  }
  return nextProducts;
}
