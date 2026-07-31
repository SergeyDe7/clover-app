import assert from "node:assert/strict";
import { readFrontendUiSource } from "./readFrontendUiSource.mjs";

const source = readFrontendUiSource();

for (const required of [
  'defaultPricingMode: "base"',
  'defaultMarkupPercent: 0',
  'value="inherit"',
  'Фиксированная цена вручную',
  'Индивидуальный процент',
  'Общая наценка для клиента',
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
  source.includes("prefillManualPriceFromProduct") &&
    source.includes("hasManualUnitValue") &&
    source.includes("выбрана фиксированная цена, но сумма не указана"),
  "Фиксированная цена должна подставлять базу каталога и не сохраняться пустой."
);

assert.ok(
  source.includes("await api.saveClientLinks(nextLinks)") &&
    source.includes("saveClientMatrix(client.id, link)"),
  "Матрица должна иметь явную кнопку сохранения на сервер."
);

assert.ok(
  !source.includes("scheduleSync(() => api.saveClientLinks(clientLinks))"),
  "Матрица не должна автосохраняться в обход кнопки «Сохранить матрицу»."
);

console.log("Проверка интерфейса общей наценки, исключений и явного сохранения матрицы прошла успешно.");
