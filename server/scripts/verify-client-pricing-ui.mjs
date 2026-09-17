import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  projectRoot,
  readFrontendUiSource,
} from "./readFrontendUiSource.mjs";
import {
  buildClientLinkSavePayload,
  buildClientPriceTypeSelectionIntent,
  mergeManualPriceIntentIds,
  mergeSavedClientLinkResponse,
} from "../../src/screens/manager/matrixMembership.js";

const source = readFrontendUiSource();
const managerClientsSource = readFileSync(
  path.join(projectRoot, "src", "screens", "manager", "ManagerClients.jsx"),
  "utf8"
);

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
  source.includes("buildClientLinkSavePayload") &&
    source.includes("saveClientMatrix(client.id, link)") &&
    source.includes("mergeSavedClientLinkResponse") &&
    !source.includes("...(saved.clientLinks || {})"),
  "Матрица должна сохранять только текущего клиента и явно отмечать ручную ценовую настройку."
);

function assertSaveClientMatrixWiring(sourceText) {
  const start = sourceText.indexOf(
    "const saveClientMatrix = async"
  );
  const end = sourceText.indexOf("\n  return (", start);
  assert.ok(start >= 0 && end > start, "Блок saveClientMatrix не найден.");
  const handler = sourceText.slice(start, end);
  assert.ok(
    handler.includes("buildClientLinkSavePayload") &&
      handler.includes("savePayload.clientLinks") &&
      handler.includes("savePayload.manualPriceConfigClientIds") &&
      handler.includes("mergeSavedClientLinkResponse"),
    "saveClientMatrix обязан строить payload и применять ответ только production helpers."
  );
}

assertSaveClientMatrixWiring(managerClientsSource);
const saveHandlerStart = managerClientsSource.indexOf(
  "const saveClientMatrix = async"
);
const saveHandlerEnd = managerClientsSource.indexOf(
  "\n  return (",
  saveHandlerStart
);
const saveHandlerMutation = `${managerClientsSource.slice(
  0,
  saveHandlerStart
)}${managerClientsSource
  .slice(saveHandlerStart, saveHandlerEnd)
  .replaceAll("buildClientLinkSavePayload", "removedSavePayloadHelper")
  .replaceAll(
    "savePayload.manualPriceConfigClientIds",
    "removedManualPriceConfigClientIds"
  )}${managerClientsSource.slice(
  saveHandlerEnd
)}\n// unrelated markers: buildClientLinkSavePayload savePayload.manualPriceConfigClientIds`;
assert.throws(
  () => assertSaveClientMatrixWiring(saveHandlerMutation),
  /saveClientMatrix обязан/
);
const lostUpdateMutation = `${managerClientsSource.slice(
  0,
  saveHandlerStart
)}${managerClientsSource
  .slice(saveHandlerStart, saveHandlerEnd)
  .replaceAll(
    "mergeSavedClientLinkResponse",
    "Object.assign"
  )}${managerClientsSource.slice(
  saveHandlerEnd
)}\n// unrelated marker: mergeSavedClientLinkResponse`;
assert.throws(
  () => assertSaveClientMatrixWiring(lostUpdateMutation),
  /saveClientMatrix обязан/
);

function assertCategoryHandlerWiring(sourceText) {
  const start = sourceText.indexOf(
    "const priceTypeChange ="
  );
  const patchMarker = "priceTypeChange.patch";
  const patchIndex = sourceText.indexOf(patchMarker, start);
  assert.ok(start >= 0 && patchIndex > start, "Handler выбора категории не найден.");
  const handler = sourceText.slice(
    start,
    patchIndex + patchMarker.length
  );
  assert.ok(
    handler.includes("buildClientPriceTypeSelectionIntent") &&
      handler.includes("mergeManualPriceIntentIds") &&
      handler.includes("priceTypeChange.manualPriceConfigClientIds") &&
      handler.includes("updateLink"),
    "Handler категории обязан применить patch и intent одного production helper."
  );
}

assertCategoryHandlerWiring(managerClientsSource);
assert.throws(
  () =>
    assertCategoryHandlerWiring(
      `${managerClientsSource.replace(
        "priceTypeChange.manualPriceConfigClientIds",
        "[]"
      )}\npriceTypeChange.manualPriceConfigClientIds`
    ),
  /Handler категории обязан/
);

const managerNoteMarker = "managerNote: event.target.value";
const managerNoteIndex = managerClientsSource.indexOf(managerNoteMarker);
const managerNoteHandler = managerClientsSource.slice(
  managerClientsSource.lastIndexOf("onChange", managerNoteIndex),
  managerClientsSource.indexOf("/>", managerNoteIndex)
);
assert.ok(managerNoteIndex >= 0, "Handler непричастной заметки не найден.");
assert.doesNotMatch(
  managerNoteHandler,
  /manualPriceConfigClientIds|mergeManualPriceIntentIds/u,
  "Изменение непричастного поля не должно создавать price intent."
);
const managerNoteIntentMutation = managerClientsSource.replace(
  managerNoteMarker,
  `${managerNoteMarker}
                              manualPriceConfigClientIdsRef.current.add(client.id);`
);
const mutatedManagerNoteIndex =
  managerNoteIntentMutation.indexOf(managerNoteMarker);
const mutatedManagerNoteHandler = managerNoteIntentMutation.slice(
  managerNoteIntentMutation.lastIndexOf("onChange", mutatedManagerNoteIndex),
  managerNoteIntentMutation.indexOf("/>", mutatedManagerNoteIndex)
);
assert.throws(
  () =>
    assert.doesNotMatch(
      mutatedManagerNoteHandler,
      /manualPriceConfigClientIds|mergeManualPriceIntentIds/u,
      "Изменение непричастного поля не должно создавать price intent."
    ),
  /не должно создавать price intent/
);

function assertPriceTypeIntent(change, clientId) {
  assert.deepEqual(
    change.manualPriceConfigClientIds,
    [clientId],
    "Выбор или очистка категории обязаны создать intent только текущего клиента."
  );
}

const basePriceTypeLink = {
  oneCPriceTypeId: "type-old",
  oneCPriceTypeName: "Old type",
  defaultPricingMode: "one_c_price_type",
  defaultMarkupPercent: 0,
};
const selectedPriceType = buildClientPriceTypeSelectionIntent({
  clientId: "a",
  link: basePriceTypeLink,
  nextPriceTypeId: "type-new",
  oneCPriceTypes: [{ id: "type-new", name: "New type" }],
});
assert.deepEqual(selectedPriceType.patch, {
  oneCPriceTypeId: "type-new",
  oneCPriceTypeName: "New type",
  defaultPricingMode: "one_c_price_type",
});
assertPriceTypeIntent(selectedPriceType, "a");
assert.throws(
  () =>
    assertPriceTypeIntent(
      { ...selectedPriceType, manualPriceConfigClientIds: [] },
      "a"
    ),
  /создать intent/
);

const clearedPriceType = buildClientPriceTypeSelectionIntent({
  clientId: "a",
  link: basePriceTypeLink,
  nextPriceTypeId: "",
  oneCPriceTypes: [{ id: "type-new", name: "New type" }],
});
assert.deepEqual(clearedPriceType.patch, {
  oneCPriceTypeId: "",
  oneCPriceTypeName: "",
  defaultPricingMode: "base",
});
assertPriceTypeIntent(clearedPriceType, "a");
assert.throws(
  () =>
    assertPriceTypeIntent(
      { ...clearedPriceType, manualPriceConfigClientIds: [] },
      "a"
    ),
  /создать intent/
);

const selectedIntentIds = mergeManualPriceIntentIds(
  new Set(),
  selectedPriceType.manualPriceConfigClientIds
);
const selectedSavePayload = buildClientLinkSavePayload(
  "a",
  { ...basePriceTypeLink, ...selectedPriceType.patch },
  selectedIntentIds
);
assert.deepEqual(selectedSavePayload.manualPriceConfigClientIds, ["a"]);
assert.deepEqual(Object.keys(selectedSavePayload.clientLinks), ["a"]);

const unrelatedSavePayload = buildClientLinkSavePayload(
  "a",
  { ...basePriceTypeLink, managerNote: "Unrelated edit" },
  new Set()
);
assert.deepEqual(unrelatedSavePayload.manualPriceConfigClientIds, []);

const clientBChange = buildClientPriceTypeSelectionIntent({
  clientId: "b",
  link: basePriceTypeLink,
  nextPriceTypeId: "type-b",
  oneCPriceTypes: [{ id: "type-b", name: "Type B" }],
});
const clientBIntentIds = mergeManualPriceIntentIds(
  new Set(),
  clientBChange.manualPriceConfigClientIds
);
assert.deepEqual([...clientBIntentIds], ["b"]);
assert.equal(clientBIntentIds.has("a"), false);
const sequentialIntentIds = mergeManualPriceIntentIds(
  selectedIntentIds,
  clientBChange.manualPriceConfigClientIds
);
assert.deepEqual([...sequentialIntentIds], ["a", "b"]);
assert.deepEqual(
  buildClientLinkSavePayload("a", selectedPriceType.patch, sequentialIntentIds)
    .manualPriceConfigClientIds,
  ["a"]
);
assert.deepEqual(
  buildClientLinkSavePayload("b", clientBChange.patch, sequentialIntentIds)
    .manualPriceConfigClientIds,
  ["b"]
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
