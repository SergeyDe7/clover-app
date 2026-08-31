/**
 * Экранирование формул в CSV-выгрузке.
 *
 * Часть значений приходит из гостевого заказа с сайта, а файл открывает
 * менеджер в Excel — то есть это путь от анонимного ввода до исполнения
 * кода на машине сотрудника.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, sanitizeCsvValue } from "../../src/csv.js";
import { payloadToCsv } from "../../src/exchange.js";

test("значения, начинающиеся с формулы, обезвреживаются", () => {
  const dangerous = [
    "=1+1",
    "+SUM(A1:A2)",
    "-2+3",
    "@SUM(A1:A2)",
    "=cmd|'/c calc'!A0",
    "  =1+1",
    "\t=1+1",
    "\r=HYPERLINK(\"http://evil.test\")",
  ];

  for (const value of dangerous) {
    const result = sanitizeCsvValue(value);
    assert.equal(result.startsWith("'"), true, `не обезврежено: ${JSON.stringify(value)}`);
    assert.match(
      result,
      /^'[\s]*[=+\-@]/,
      `после апострофа должно остаться исходное значение: ${JSON.stringify(result)}`
    );
  }
});

test("обычный текст не меняется", () => {
  const safe = [
    "Стакан бумажный 250 мл",
    "ООО «Ромашка»",
    "Комментарий: доставить до 12:00",
    "CL-1234",
    "1+1",
    "Тел. +7 900 000-00-00".replace(/^\+/, ""),
    "",
  ];

  for (const value of safe) {
    assert.equal(sanitizeCsvValue(value), value, `текст не должен меняться: ${JSON.stringify(value)}`);
  }
});

test("числа не трогаются — выгрузка уходит в 1С", () => {
  for (const value of [0, 1, -5, 12.5, -0.01]) {
    assert.equal(sanitizeCsvValue(value), String(value), `число не должно меняться: ${value}`);
  }
});

test("кавычки, точки с запятой и переводы строк экранируются", () => {
  assert.equal(csvCell('Товар "Люкс"'), '"Товар ""Люкс"""');
  assert.equal(csvCell("Строка;с;разделителями"), '"Строка;с;разделителями"');
  assert.equal(csvCell("Первая\r\nвторая"), '"Первая\r\nвторая"');
  assert.equal(csvCell('=1+1";cmd'), '"\'=1+1"";cmd"');
});

test("выгрузка заказа обезвреживает данные из гостевой формы", () => {
  const csv = payloadToCsv({
    order: {
      number: "WS-1",
      externalId: "ext-1",
      deliveryDate: "2026-09-01",
    },
    client: {
      oneCId: "c-1",
      // Ровно то, что может прислать аноним через форму заказа на сайте.
      companyName: '=HYPERLINK("http://evil.test","Счёт")',
    },
    items: [
      {
        oneCId: "p-1",
        code: "CL-1",
        name: "@SUM(A1:A2)",
        unitName: "штука",
        quantity: 2,
        multiplier: 1,
        totalPieces: 2,
        unitPrice: 100,
        lineTotal: 200,
      },
    ],
  });

  assert.match(csv, /"'=HYPERLINK/, "название компании должно быть обезврежено");
  assert.match(csv, /"'@SUM/, "название товара должно быть обезврежено");
  assert.match(csv, /;"100";"200"/, "числовые столбцы должны остаться нетронутыми");
});
