import assert from "node:assert/strict";
import {
  CLOVER_PRODUCT_GROUPS,
  getGroupChildren,
  groupRequiresSubgroup,
  assignCloverTaxonomy,
} from "../../src/screens/storefront/productGroups.js";

assert.deepEqual(CLOVER_PRODUCT_GROUPS, [
  "Одноразовая посуда",
  "Хозяйственные товары",
  "Химия, чистящие средства",
  "Барные аксессуары",
  "Бумажная продукция",
  "Пакеты, упаковочные материалы",
  "Канцелярские товары",
  "Прочее",
]);

assert.ok(groupRequiresSubgroup("Одноразовая посуда"));
assert.equal(groupRequiresSubgroup("Барные аксессуары"), false);
assert.ok(
  getGroupChildren("Одноразовая посуда").some((item) => item.name === "Ланч-боксы")
);
assert.ok(
  getGroupChildren("Хозяйственные товары").some((item) => item.name === "Перчатки")
);

const cases = [
  ["Ланч-бокс 3-х секционный Премиум (100)", "Одноразовая посуда", "Ланч-боксы"],
  ["Контейнер бумажный прямоугольный крафт 800 мл", "Одноразовая посуда", "Бумажная упаковка"],
  ["Стакан прозрачный 500 мл Интеко", "Одноразовая посуда", "Стаканы"],
  ["Коробка для пиццы 32 см", "Одноразовая посуда", "Коробки для пиццы"],
  ["Перчатки нитриловые синие M (100 шт.)", "Хозяйственные товары", "Перчатки"],
  ["Пакеты для мусора 60 л (50шт)", "Хозяйственные товары", "Мешки для мусора"],
  ["Шуманит BAGI - жироудалитель спрей 400 мл", "Химия, чистящие средства", "Жироудалители"],
  ["Туалетная бумага Focus 2-сл. 170м", "Бумажная продукция", "Туалетная бумага"],
  ["Трубочки для коктейля прямые черные 8 х 240 мм", "Барные аксессуары", ""],
  ["Вакуумный пакет 400 х 600мм 70мкм (100)", "Пакеты, упаковочные материалы", "Пакеты вакуумные"],
  ["Кассовая лента 80х12х80 (5/120)", "Канцелярские товары", ""],
];

for (const [name, category, subcategory] of cases) {
  const assigned = assignCloverTaxonomy(name);
  assert.equal(assigned.category, category, `${name} → category`);
  assert.equal(assigned.subcategory, subcategory, `${name} → subcategory`);
}

console.log("verify-clover-taxonomy: ok");
