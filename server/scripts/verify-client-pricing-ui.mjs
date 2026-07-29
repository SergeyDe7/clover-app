import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const appPath = path.resolve(path.dirname(currentFile), "..", "..", "src", "App.jsx");
const source = readFileSync(appPath, "utf8");

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
  source.includes('await api.saveClientLinks(nextLinks)') &&
    source.includes('saveClientMatrix(client.id, link)'),
  "Матрица должна иметь явную кнопку сохранения на сервер."
);

console.log("Проверка интерфейса общей наценки, исключений и явного сохранения матрицы прошла успешно.");
