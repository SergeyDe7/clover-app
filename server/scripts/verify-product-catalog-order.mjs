import assert from "node:assert/strict";
import {
  extractParenthesesSpec,
  extractProductFamilyKey,
  isProductContainerOrBank,
  isProductLid,
  sortProductsWithLidsGrouped,
} from "../../src/shared/productCatalogOrder.js";

const bank = {
  id: 2,
  name: "Банка суповая 500 мл Перинт (50/400)",
};
const bankLid = {
  id: 4,
  name: "ВЫШНИЙ В. - Крышка к банкам Перинт (50/800)",
};
const container = {
  id: 8,
  name: "Контейнер бумажный OneClick 800 крафт, дно (50/300)",
};
const containerLid = {
  id: 15,
  name: "Крышка плоская к контейнеру OneClick 800 (50/300)",
};
const gloves = {
  id: 1,
  name: "Перчатки нитриловые черные XL (100 шт.)",
};
const k144a = {
  id: 20,
  name: "К-144 Контейнер круглый 500 мл черный !!! ВЗЛП !!! (50/300)",
};
const k144b = {
  id: 21,
  name: "К-144 Контейнер круглый 750 мл черный СТП (50/300)",
};
const k144LidV = {
  id: 22,
  name: "Крышка к контейнеру К-144 !!! ВЗЛП !!! (50/300)",
};
const k144LidS = {
  id: 23,
  name: "Крышка к контейнеру К-144 СТП (50/300)",
};
const lotok = {
  id: 30,
  name: "Лоток 5 секций черное дно (110)",
};
const lotokLid = {
  id: 31,
  name: "Крышка к 5 секционному лотку (110)",
};
const ipBase = {
  id: 40,
  name: "ИП-409с4 дно ПЭТ (225)",
};
const ipLid = {
  id: 41,
  name: "ИП-409с4 крышка ПЭТ (225)",
};
const ip1500 = {
  id: 42,
  name: "Контейнер пластиковый черный ИП 1500 (140)",
};
const ip1500Lid = {
  id: 43,
  name: "Крышка к контейнерам ИП 1500 (140)",
};
const prms350 = {
  id: 50,
  name: "ПРМС-350мл контейнер черный (60/480)",
};
const prmsLid = {
  id: 51,
  name: "Крышка к контейнеру ПРМС (60/480)",
};
const alForm = {
  id: 60,
  name: "Форма алюминиевая 450 мл (100/1200)",
};
const alLid = {
  id: 61,
  name: "Крышка к алюминиевой форме 450 мл (100/1200)",
};
const shakerCup = {
  id: 70,
  name: "Стакан для шейкера ПЭТ 300 мл Veggo (50/800)",
};
const shakerLid = {
  id: 71,
  name: "Крышка купольная для стакана шейкера VEGGO (100/800)",
};
const paper330 = {
  id: 80,
  name: "Контейнер бумажный 330мл крафт БЕЗ КРЫШКИ d114 (50/500)",
};
const paper330Lid = {
  id: 81,
  name: "Крышка прозрачная к контейнеру 330мл d114 (50/500)",
};
const paper330CupLid = {
  id: 82,
  name: "Крышка к чаше одноразовой 330 мл",
};
const rb500 = {
  id: 90,
  name: "Контейнер круглый Round Bowl 500 крафт без крышки (30/600)",
};
const rbMultiLid = {
  id: 91,
  name: "Крышка прозрачная плоская Round Bowl 300/400/500 (30/600)",
};
const rb750 = {
  id: 92,
  name: "Контейнер картонный круглый Round Bowl 750 БЕЛЫЙ (45/270)",
};
const rbMultiLid2 = {
  id: 93,
  name: "Крышка плоская для контейнера Round Bowl 620/750/1000 ПП ANTIFOG OSQ (45/270)",
};
const oc250Base = {
  id: 100,
  name: "Контейнер бумажный OneClick 250 крафт 100х85х45мм (крышка арт. 3310)",
};
const oc250Dome = {
  id: 101,
  name: "Крышка купольная к контейнеру OneClick 250",
};
const oc500Base = {
  id: 102,
  name: "Контейнер бумажный OneClick 500 крафт 160х120х45мм (крышка арт. 3181)",
};
const oc500Dome = {
  id: 103,
  name: "Крышка купольная к контейнеру OneClick 500",
};
const oc500Flat = {
  id: 104,
  name: "Крышка плоская к контейнеру OneClick 500",
};
const oc800Base = {
  id: 105,
  name: "Контейнер бумажный OneClick 800 крафт 200х180х55мм (крышка арт. 3259)",
};
const oc800Flat = {
  id: 106,
  name: "Крышка плоская к контейнеру OneClick 800",
};

assert.equal(isProductContainerOrBank(bank), true);
assert.equal(isProductLid(bankLid), true);
assert.equal(isProductLid(bank), false);
assert.equal(isProductLid(ipLid), true);
assert.equal(isProductContainerOrBank(ipBase), true);
assert.equal(isProductContainerOrBank(lotok), true);
assert.equal(extractProductFamilyKey(k144a.name), "k:144");
assert.equal(extractProductFamilyKey(lotokLid.name), "lotok:5sect");

const ordered = sortProductsWithLidsGrouped([
  bankLid,
  gloves,
  containerLid,
  bank,
  container,
]);

assert.deepEqual(
  ordered.map((item) => item.id),
  [2, 4, 8, 15, 1],
  "крышки должны идти сразу после своей банки/контейнера"
);

const k144Ordered = sortProductsWithLidsGrouped([
  k144LidS,
  k144LidV,
  gloves,
  k144b,
  k144a,
]).map((item) => item.id);

assert.deepEqual(
  k144Ordered,
  [20, 21, 22, 23, 1],
  "K-144: все контейнеры, затем крышки"
);

const lotOrdered = sortProductsWithLidsGrouped([lotokLid, lotok, gloves]).map(
  (item) => item.id
);
assert.deepEqual(lotOrdered, [30, 31, 1], "лоток 5 секций: дно, затем крышка");

const ipOrdered = sortProductsWithLidsGrouped([ipLid, ipBase, ip1500Lid, ip1500]).map(
  (item) => item.id
);
assert.deepEqual(ipOrdered, [40, 41, 42, 43], "ИП: дно/крышка и ИП 1500 парами");

const prmsOrdered = sortProductsWithLidsGrouped([prmsLid, prms350, gloves]).map(
  (item) => item.id
);
assert.deepEqual(prmsOrdered, [1, 50, 51], "ПРМС: контейнер, затем крышка");

const alOrdered = sortProductsWithLidsGrouped([alLid, alForm, gloves]).map(
  (item) => item.id
);
assert.deepEqual(alOrdered, [60, 61, 1], "Алюминиевая форма: форма, затем крышка");

const shakerOrdered = sortProductsWithLidsGrouped([shakerLid, shakerCup, gloves]).map(
  (item) => item.id
);
assert.ok(
  shakerOrdered.indexOf(70) < shakerOrdered.indexOf(71),
  "шейкер: стакан перед крышкой"
);

assert.equal(extractProductFamilyKey(paper330.name), "paper:330:d114");
const paperOrdered = sortProductsWithLidsGrouped([
  paper330CupLid,
  paper330Lid,
  paper330,
  gloves,
]).map((item) => item.id);
assert.deepEqual(paperOrdered, [80, 81, 82, 1], "бумажный 330 d114: контейнер, крышка");

const rbOrdered = sortProductsWithLidsGrouped([
  rbMultiLid2,
  rbMultiLid,
  rb750,
  rb500,
  gloves,
]).map((item) => item.id);
assert.deepEqual(
  rbOrdered,
  [92, 93, 90, 91, 1],
  "Round Bowl: блоки по spec, контейнеры затем крышки"
);

assert.equal(extractParenthesesSpec(oc250Base.name), "");
const ocOrdered = sortProductsWithLidsGrouped([
  oc800Flat,
  oc500Flat,
  oc500Dome,
  oc250Dome,
  oc800Base,
  oc500Base,
  oc250Base,
  gloves,
]).map((item) => item.id);
assert.deepEqual(
  ocOrdered,
  [100, 101, 102, 103, 104, 105, 106, 1],
  "OneClick витрина: контейнеры и крышки (плоская/куполная) блоками по размеру"
);

console.log("verify-product-catalog-order: OK");
