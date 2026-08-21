import { getGlobalState, setGlobalState, writeAudit } from "../src/db.js";
import { DEFAULT_PRODUCTS } from "../src/defaults.js";
import { reassignAllCloverTaxonomy } from "../src/oneCProducts.js";
import { CLOVER_PRODUCT_GROUPS } from "../../src/screens/storefront/productGroups.js";

const products = getGlobalState("products", DEFAULT_PRODUCTS);
const { products: next, changed } = reassignAllCloverTaxonomy(products);
if (changed) {
  setGlobalState("products", next);
  writeAudit({
    action: "catalog.taxonomy.reassign",
    details: { changed, total: next.length },
  });
}

const counts = new Map();
for (const product of next) {
  const key = `${product.category} / ${product.subcategory || "—"}`;
  counts.set(key, (counts.get(key) || 0) + 1);
}

console.log(`Раскладка каталога: изменено ${changed} из ${next.length}.`);
console.log(`Категории витрины: ${CLOVER_PRODUCT_GROUPS.join("; ")}`);
for (const [key, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(count).padStart(4)}  ${key}`);
}
