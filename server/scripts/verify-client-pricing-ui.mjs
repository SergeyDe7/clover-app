import assert from "node:assert/strict";
import { readFrontendUiSource } from "./readFrontendUiSource.mjs";
import { mergeSavedClientLinkResponse } from "../../src/screens/manager/matrixMembership.js";

const source = readFrontendUiSource();

for (const required of [
  'defaultPricingMode: "base"',
  'defaultMarkupPercent: 0',
  'value="inherit"',
  'Фиксированная цена вручную',
  'Индивидуальный процент',
  'Общая наценка клиента',
  'Индивидуальных исключений',
  'Сохранить матрицу',
  'getDefaultMarkupDraft',
  'getIndividualMarkupDraft',
]) {
  assert.ok(source.includes(required), `В интерфейсе отсутствует обязательный элемент: ${required}`);
}

const inheritIndex = source.indexOf('<option value="inherit">');
const manualIndex = source.indexOf('<option value="manual">', inheritIndex);
const percentIndex = source.indexOf('<option value="purchase_markup">', manualIndex);
assert.ok(inheritIndex >= 0 && manualIndex > inheritIndex && percentIndex > manualIndex);

assert.ok(
  source.includes('if (nextPrice.source === "inherit")') &&
    source.includes('delete nextPrices[key]'),
  "Сброс индивидуального исключения должен возвращать товар к общей схеме клиента."
);

assert.ok(
  source.includes('event.target.value') &&
    source.includes('setDefaultMarkupDrafts') &&
    source.includes('setIndividualMarkupDrafts'),
  "Процентные поля должны позволять удалить начальный ноль перед вводом нового значения."
);

assert.ok(
  source.includes("pickPurchaseMarkupCostForUi") &&
    source.includes("purchase_markup_from_price_type") &&
    source.includes('costKind === "one_c_price_type"'),
  "Превью наценки у менеджера должно брать свежий вид цен, как у клиента."
);

assert.ok(
  source.includes("pickProductCardOneCCost") &&
    source.includes("Из «Обновить цены» (вид цен)") &&
    source.includes("findZakupPriceType") &&
    source.includes("settingsPriceLabel(product, oneCPriceTypes)"),
  "Карточка товара должна показывать свежий вид «Закупочная», а не устаревший purchase-prices."
);

assert.ok(
  source.includes("prefillManualPriceFromProduct") &&
    source.includes("hasManualUnitValue") &&
    source.includes("выбрана фиксированная цена, но сумма не указана"),
  "Фиксированная цена должна подставлять базу каталога и не сохраняться пустой."
);

assert.ok(
  source.includes("{ [clientId]: nextLink }") &&
    source.includes("{ manualPriceConfigClientIds }") &&
    source.includes("manualPriceConfigClientIdsRef.current.add") &&
    source.includes("saveClientMatrix(client.id, link)") &&
    source.includes("mergeSavedClientLinkResponse") &&
    !source.includes("...(saved.clientLinks || {})"),
  "Матрица должна сохранять только текущего клиента и явно отмечать ручную ценовую настройку."
);

const dirtyClientA = {
  managerNote: "A unsaved",
  oneCPriceTypeId: "type-a-local",
};
const currentLinks = {
  a: dirtyClientA,
  b: { managerNote: "B local" },
};
const reconciled = mergeSavedClientLinkResponse(
  currentLinks,
  "b",
  {
    a: { managerNote: "A stale from DB", oneCPriceTypeId: "type-a-stale" },
    b: { managerNote: "B saved", matrixProductIds: ["p1"] },
  },
  currentLinks.b
);
assert.strictEqual(
  reconciled.a,
  dirtyClientA,
  "Сохранение B не должно заменять dirty-состояние A полным server snapshot."
);
assert.equal(reconciled.b.managerNote, "B saved");
assert.deepEqual(reconciled.b.matrixProductIds, ["p1"]);

const missingSavedClient = mergeSavedClientLinkResponse(
  currentLinks,
  "b",
  { a: { managerNote: "A stale from DB" } },
  { managerNote: "B fallback", matrixProductIds: ["p2"] }
);
assert.strictEqual(missingSavedClient.a, dirtyClientA);
assert.equal(missingSavedClient.b.managerNote, "B fallback");
assert.deepEqual(missingSavedClient.b.matrixProductIds, ["p2"]);

assert.ok(
  !source.includes("scheduleSync(() => api.saveClientLinks(clientLinks))"),
  "Матрица не должна автосохраняться в обход кнопки «Сохранить матрицу»."
);

console.log("Проверка интерфейса общей наценки, исключений и явного сохранения матрицы прошла успешно.");
