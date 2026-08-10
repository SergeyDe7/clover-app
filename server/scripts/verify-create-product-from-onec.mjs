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

const reusedByName = createOrReuseCloverProductFromOneC(
  [
    {
      id: 50,
      name: catalogItem.name,
      category: "Упаковка",
      code: "CL-0050",
    },
  ],
  catalogItem,
  "2026-07-30T12:01:30.000Z"
);
assert.equal(reusedByName.created, false);
assert.equal(reusedByName.product.id, 50);
assert.equal(reusedByName.product.oneCId, catalogItem.id);

const reusedByCode = createOrReuseCloverProductFromOneC(
  [
    {
      id: 51,
      name: "Другое имя",
      category: "Упаковка",
      oneCCode: catalogItem.code,
    },
  ],
  catalogItem,
  "2026-07-30T12:01:45.000Z"
);
assert.equal(reusedByCode.created, false);
assert.equal(reusedByCode.product.id, 51);

const reusedByExcelName = createOrReuseCloverProductFromOneC(
  [
    {
      id: 77,
      name: "Суп для матрицы Excel 500 мл",
      category: "Упаковка",
      code: "",
    },
  ],
  catalogItem,
  "2026-07-30T12:02:00.000Z",
  { preferredName: "Суп для матрицы Excel 500 мл" }
);
assert.equal(reusedByExcelName.created, false);
assert.equal(reusedByExcelName.product.id, 77);
assert.equal(reusedByExcelName.product.oneCId, catalogItem.id);

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
  "Уборочный инвентарь и оборудование"
);
assert.equal(
  inferCloverProductCategory("Банка суповая 500 мл Перинт (50/400)", []),
  "Упаковочные материалы"
);
assert.equal(
  inferCloverProductCategory("Салфетки белые PRO 24х24 1-сл. 100 листов", seed),
  "Уборочный инвентарь и оборудование"
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
  "Контейнеры"
);

const reusePlaceholder = createOrReuseCloverProductFromOneC(
  [...seed, placeholder],
  { id: "onec-box-1", code: "НФ-BOX", name: placeholder.name },
  "2026-07-30T12:03:00.000Z"
);
assert.equal(reusePlaceholder.created, false);
assert.equal(reusePlaceholder.product.category, "Контейнеры");

// Имя совпало, но oneCId уже другой — не переиспользуем чужую карточку.
const foreignNameConflict = createOrReuseCloverProductFromOneC(
  [
    {
      id: 200,
      name: "Контейнер универсальный 500 мл",
      category: "Контейнеры",
      subcategory: "Ланч-боксы",
      oneCId: "onec-other-sku",
      code: "НФ-OTHER",
    },
  ],
  {
    id: "onec-new-sku",
    code: "НФ-NEW",
    name: "Контейнер универсальный 500 мл",
  },
  "2026-07-30T12:04:00.000Z"
);
assert.equal(foreignNameConflict.created, true);
assert.equal(foreignNameConflict.product.id, 201);
assert.equal(foreignNameConflict.product.oneCId, "onec-new-sku");
assert.equal(
  foreignNameConflict.products.filter((p) => p.oneCId === "onec-other-sku").length,
  1
);

// Иерархическая группа: из имени выставляем subcategory.
const paperBox = createOrReuseCloverProductFromOneC(
  [],
  {
    id: "onec-paper-box",
    code: "НФ-PB",
    name: "Контейнер бумажный прямоугольный крафт 800 мл",
  },
  "2026-07-30T12:05:00.000Z"
);
assert.equal(paperBox.created, true);
assert.equal(paperBox.product.category, "Контейнеры");
assert.equal(paperBox.product.subcategory, "Бумажные контейнеры");

console.log("verify-create-product-from-onec: ok");
