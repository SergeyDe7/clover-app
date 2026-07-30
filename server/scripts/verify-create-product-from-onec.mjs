import assert from "node:assert/strict";
import {
  addProductIdToClientMatrix,
  applyInferredCategories,
  createOrReuseCloverProductFromOneC,
  inferCloverProductCategory,
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
assert.equal(empty.product.category, "Новые товары");
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

const seed = [
  {
    id: 1,
    category: "Перчатки",
    name: "Перчатки нитриловые черные XL (100 шт.)",
  },
  {
    id: 2,
    category: "Упаковка",
    name: "Банка суповая 500 мл Перинт (50/400)",
  },
  {
    id: 3,
    category: "Пакеты и пленка",
    name: "Пакеты для мусора 240 л, 65 мкм, 100×140 (50 шт.)",
  },
  {
    id: 4,
    category: "Уборка",
    name: "Пульверизатор ручной черный 500 мл",
  },
];

assert.equal(
  inferCloverProductCategory("Перчатки BEN FATTO нитриловые черные L (100 шт.)", seed),
  "Перчатки"
);
assert.equal(
  inferCloverProductCategory("Мешки мусорные ПВД 240л 65мкм 100х140 50шт", seed),
  "Пакеты и пленка"
);
assert.equal(
  inferCloverProductCategory("Распылитель ручной черный 500 мл", seed),
  "Уборка"
);
assert.equal(
  inferCloverProductCategory("Влажные чистящие салфетки в банке", seed),
  "Уборка"
);
assert.equal(
  inferCloverProductCategory("Банка суповая 500 мл Перинт (50/400)", []),
  "Упаковка"
);
assert.equal(
  inferCloverProductCategory("Салфетки белые PRO 24х24 1-сл. 100 листов", seed),
  "Уборка"
);

const gloves = createOrReuseCloverProductFromOneC(
  seed,
  {
    id: "onec-gloves-99",
    code: "НФ-GLOVE",
    name: "Перчатки нитриловые синие M (100 шт.)",
  },
  "2026-07-30T12:02:00.000Z"
);
assert.equal(gloves.created, true);
assert.equal(gloves.product.category, "Перчатки");

const placeholder = {
  id: 99,
  category: "Из 1С",
  name: "Контейнер бумажный OneClick 800 крафт, дно (50/300)",
  oneCId: "onec-box-1",
};
const fixed = applyInferredCategories([...seed, placeholder]);
assert.equal(fixed.changed, 1);
assert.equal(
  fixed.products.find((item) => item.id === 99).category,
  "Упаковка"
);

const reusePlaceholder = createOrReuseCloverProductFromOneC(
  [...seed, placeholder],
  { id: "onec-box-1", code: "НФ-BOX", name: placeholder.name },
  "2026-07-30T12:03:00.000Z"
);
assert.equal(reusePlaceholder.created, false);
assert.equal(reusePlaceholder.product.category, "Упаковка");

console.log("verify-create-product-from-onec: ok");
