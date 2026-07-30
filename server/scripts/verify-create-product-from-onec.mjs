import assert from "node:assert/strict";
import {
  addProductIdToClientMatrix,
  createOrReuseCloverProductFromOneC,
  normalizeOneCProduct,
} from "../src/oneCProducts.js";

const catalogItem = normalizeOneCProduct({
  id: "onec-soup-1",
  code: "НФ-009999",
  name: "Суп-тест из каталога 1С 500 мл",
});

const empty = createOrReuseCloverProductFromOneC([], catalogItem, "2026-07-30T12:00:00.000Z");
assert.equal(empty.created, true);
assert.equal(empty.product.id, 1);
assert.equal(empty.product.oneCId, "onec-soup-1");
assert.equal(empty.product.category, "Из 1С");
assert.equal(empty.product.oneCLinkMode, "manual-from-catalog");
assert.equal(empty.products.length, 1);

const reused = createOrReuseCloverProductFromOneC(empty.products, catalogItem, "2026-07-30T12:01:00.000Z");
assert.equal(reused.created, false);
assert.equal(reused.product.id, empty.product.id);
assert.equal(reused.products.length, 1);

const matrixPending = addProductIdToClientMatrix({}, "client-1", empty.product.id);
assert.equal(matrixPending.clientLink.matrixMode, "selected");
assert.deepEqual(matrixPending.clientLink.matrixProductIds, [1]);

const matrixAgain = addProductIdToClientMatrix(matrixPending.clientLinks, "client-1", empty.product.id);
assert.deepEqual(matrixAgain.clientLink.matrixProductIds, [1]);

const matrixAll = addProductIdToClientMatrix(
  { "client-2": { matrixMode: "all", matrixProductIds: [] } },
  "client-2",
  empty.product.id
);
assert.equal(matrixAll.clientLink.matrixMode, "all");
assert.deepEqual(matrixAll.clientLink.matrixProductIds, []);

assert.throws(
  () => createOrReuseCloverProductFromOneC([], { id: "", name: "" }),
  /Не удалось определить выбранную позицию 1С/
);

console.log("verify-create-product-from-onec: ok");
