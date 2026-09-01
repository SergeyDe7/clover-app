import assert from "node:assert/strict";
import {
  autoLinkCloverProducts,
  buildOneCProductCandidates,
  linkCloverProduct,
  mergeProductsPreservingOneCLinks,
  preserveCatalogImageFields,
  removeCloverProductFromState,
  normalizeOneCProducts,
  preserveOneCProductPricingFields,
  selectRelevantOneCProducts,
  upsertManagerCatalogProduct,
} from "../src/oneCProducts.js";

const exactProducts = Array.from({ length: 26 }, (_, index) => ({
  id: index + 1,
  code: `CL-${String(index + 1).padStart(4, "0")}`,
  name: `Точный товар ${index + 1} 500 мл (${index + 10} шт.)`,
  oneCId: index < 2 ? `onec-exact-${index + 1}` : "",
  oneCCode: index < 2 ? `НФ-${String(index + 1).padStart(8, "0")}` : "",
  oneCName: index < 2 ? `Точный товар ${index + 1} 500 мл (${index + 10} шт.)` : "",
}));

const aestheticProducts = [
  "Пакеты для мусора 240 л, 65 мкм, 100×140 (50 шт.)",
  "Вакуумный пакет 300×400 мм, 70 мкм (100 шт.)",
  "Вакуумный пакет 200×300 мм, 60 мкм (100 шт.)",
  "Контейнер бумажный OneClick 800 крафт, дно (50/300)",
  "Набор: щетка для пола и совок-ловушка с высокой ручкой",
  "Бутылка прозрачная круглая с пробкой 500 мл (100 шт.)",
  "МОП плоский 40×13 см, ухо-карман, арт. BF30562",
  "Пульверизатор ручной черный 500 мл",
  "Швабра: рукоять 130 см + держатель мопов 40×11 см, арт. 636234",
  "Пергамент для выпечки силиконизированный 38 см × 50 м, крафт (15)",
  "Трубочки для коктейля толстые черные 8×240 мм (250 шт.)",
  "Салфетка для стекол Эксперт 35×40 см HQ",
  "Пипидастр",
  "Вафельное полотно 40 см × 50 м, 110 г/м²",
].map((name, index) => ({
  id: 27 + index,
  code: `CL-${String(27 + index).padStart(4, "0")}`,
  name,
  oneCId: "",
}));

const cloverProducts = [...exactProducts, ...aestheticProducts];
const exactCatalog = exactProducts.map((product, index) => ({
  id: `onec-exact-${index + 1}`,
  code: `НФ-${String(index + 1).padStart(8, "0")}`,
  name: product.name,
}));
const aestheticCatalog = [
  "Мешки мусорные ПВД 240л 65мкм 100х140 50шт черные",
  "Пакет вакуумный 300х400 70 мкм 100 шт",
  "Пакет вакуумный 200х300 60 мкм 100 шт",
  "OneClick контейнер 800 мл крафт дно 50/300",
  "Щетка половая с совком ловушкой высокая ручка",
  "Бутылка ПЭТ круглая прозрачная 500 мл с пробкой 100 шт",
  "Моп плоский 40х13 ухо карман BF30562",
  "Распылитель ручной черный 500 мл",
  "Швабра рукоять 130 см держатель мопа 40х11 636234",
  "Пергамент силиконизированный крафт 38см 50м 15 рулонов",
  "Трубочки черные толстые 8х240 250 шт",
  "Салфетка стекло Эксперт 35х40 HQ",
  "Щетка для пыли Пипидастр",
  "Полотно вафельное 40см 50м 110г м2",
].map((name, index) => ({
  id: `onec-candidate-${index + 1}`,
  code: `НФ-C${String(index + 1).padStart(7, "0")}`,
  name,
}));

const distractors = Array.from({ length: 3589 }, (_, index) => ({
  id: `distractor-${index + 1}`,
  code: `Д-${String(index + 1).padStart(7, "0")}`,
  name: `Посторонняя номенклатура ${index + 1} размер ${index % 97} упаковка ${index % 33}`,
}));
const fullCatalog = normalizeOneCProducts([
  ...exactCatalog,
  ...aestheticCatalog,
  ...distractors,
]);
assert.equal(fullCatalog.length, 3629);

const candidates = buildOneCProductCandidates(cloverProducts, fullCatalog);
const candidateProductIds = Object.keys(candidates);
assert.ok(candidateProductIds.length >= 10, "Для большинства отличающихся названий должны быть найдены варианты");
assert.ok((candidates["27"] || []).some((item) => item.id === "onec-candidate-1"));
assert.ok((candidates["28"] || []).some((item) => item.id === "onec-candidate-2"));

const retained = selectRelevantOneCProducts(cloverProducts, fullCatalog, candidates);
assert.ok(retained.length < 220, "Релевантный список кандидатов остаётся выборочным");
assert.ok(retained.some((item) => item.id === "onec-candidate-1"));
assert.ok(!retained.some((item) => item.id === "distractor-3500"));

// Для поиска менеджера хранится полная выгрузка TEST.
const storedForSearch = fullCatalog;
assert.equal(storedForSearch.length, 3629);
assert.ok(storedForSearch.some((item) => item.id === "distractor-3500"));
const searchHit = storedForSearch.filter((item) =>
  `${item.name} ${item.code} ${item.id}`
    .toLocaleLowerCase("ru-RU")
    .includes("посторонняя номенклатура 3500")
);
assert.equal(searchHit.length, 1);

const linked = autoLinkCloverProducts(
  cloverProducts,
  fullCatalog,
  "2026-07-24T22:00:00.000Z"
);
assert.equal(linked.report.linked, 26);
assert.equal(linked.report.autoLinked, 24);
assert.equal(linked.oneCProducts.length, 3629);
assert.equal(linked.products.find((item) => item.id === 1).oneCId, "onec-exact-1");
assert.equal(linked.products.find((item) => item.id === 27).oneCId, "");

const manuallyLinked = linkCloverProduct(
  linked.products,
  27,
  storedForSearch.find((item) => item.id === "onec-candidate-1"),
  "2026-07-24T22:01:00.000Z"
);
assert.equal(manuallyLinked.find((item) => item.id === 27).oneCId, "onec-candidate-1");
assert.equal(manuallyLinked.find((item) => item.id === 27).name, aestheticProducts[0].name);
assert.equal(manuallyLinked.find((item) => item.id === 27).oneCName, aestheticCatalog[0].name);


const requested = cloverProducts.map((item) =>
  item.id === 27
    ? { ...item, oneCSearchQuery: "мешки мусорные 240 л 65 мкм", oneCSearchRequestedAt: "2026-07-24T22:02:00.000Z" }
    : item
);
const staleFrontendSave = cloverProducts.map((item) => ({ ...item }));
delete staleFrontendSave.find((item) => item.id === 27).oneCSearchQuery;
delete staleFrontendSave.find((item) => item.id === 27).oneCSearchRequestedAt;
const mergedRequest = mergeProductsPreservingOneCLinks(staleFrontendSave, requested);
assert.equal(mergedRequest.find((item) => item.id === 27).oneCSearchQuery, "мешки мусорные 240 л 65 мкм");

const clearedLink = mergeProductsPreservingOneCLinks(
  manuallyLinked.map((item) => item.id === 27 ? { ...item, oneCId: "", oneCLinkMode: "manual-cleared" } : item),
  manuallyLinked
);
assert.equal(clearedLink.find((item) => item.id === 27).oneCId, "");

const partialSave = mergeProductsPreservingOneCLinks(
  [{ id: 27, name: "Частичное сохранение" }],
  cloverProducts
);
assert.ok(partialSave.length >= cloverProducts.length);
assert.equal(partialSave.find((item) => item.id === 27).name, "Частичное сохранение");
assert.ok(partialSave.some((item) => item.id === cloverProducts[0].id));

const withPhoto = {
  id: 99,
  name: "С фото",
  imageUrl: "/uploads/product-99.jpg",
  imageUpdatedAt: "2026-09-01T12:00:00.000Z",
};
const staleSave = upsertManagerCatalogProduct([withPhoto], {
  id: 99,
  name: "С фото (обновлено)",
  imageUrl: "",
});
assert.equal(staleSave.product.imageUrl, "/uploads/product-99.jpg");
assert.equal(staleSave.product.imageUpdatedAt, "2026-09-01T12:00:00.000Z");

const bulkStale = mergeProductsPreservingOneCLinks(
  [{ id: 99, name: "С фото (bulk)", imageUrl: "" }],
  [withPhoto]
);
assert.equal(bulkStale.find((item) => item.id === 99).imageUrl, "/uploads/product-99.jpg");
assert.equal(
  preserveCatalogImageFields({ imageUrl: "" }, withPhoto).imageUrl,
  "/uploads/product-99.jpg"
);

const removed = removeCloverProductFromState(27, {
  products: [
    { id: 1, name: "Оставить" },
    { id: 27, name: "Удалить", showOnStorefront: true },
  ],
  clientLinks: {
    "client-a": {
      matrixProductIds: [1, 27, "27"],
      personalPrices: { 27: { source: "manual" }, 1: { source: "inherit" } },
    },
  },
});
assert.equal(removed.found, true);
assert.equal(removed.products.length, 1);
assert.equal(removed.products[0].id, 1);
assert.deepEqual(removed.clientLinks["client-a"].matrixProductIds, [1]);
assert.equal(removed.clientLinks["client-a"].personalPrices[27], undefined);
assert.equal(removed.matricesChanged, 1);

const missing = removeCloverProductFromState("no-such", {
  products: [{ id: 1, name: "Оставить" }],
  clientLinks: {},
});
assert.equal(missing.found, false);

const preservedPurchase = preserveOneCProductPricingFields(
  [
    {
      id: "onec-keep",
      purchasePrice: 100,
      purchasePriceReceivedAt: "2026-08-09T12:38:45.318Z",
      purchasePriceUpdatedAt: "2026-08-09T12:38:45.318Z",
      salePricesByType: { "type-zakup": { piece: 99 } },
    },
  ],
  [
    {
      id: "onec-keep",
      name: "Салфетки",
      purchasePrice: 80,
      purchasePriceReceivedAt: "2026-08-13T15:00:00.000Z",
    },
  ]
);
assert.equal(preservedPurchase[0].purchasePrice, 100);
assert.equal(preservedPurchase[0].purchasePriceReceivedAt, "2026-08-09T12:38:45.318Z");
assert.equal(preservedPurchase[0].salePricesByType["type-zakup"].piece, 99);

console.log("Проверка точного и адресного сопоставления номенклатуры 1С пройдена успешно.");
console.log(
  `Просканировано: ${fullCatalog.length}; для поиска сохраняется полный каталог: ${storedForSearch.length}; релевантных кандидатов: ${retained.length}; товаров с кандидатами: ${candidateProductIds.length}.`
);
