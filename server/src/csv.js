/**
 * Экранирование ячеек CSV.
 *
 * Кавычки экранировались и раньше, но кавычки не защищают от того, что
 * Excel и LibreOffice трактуют ячейку, начинающуюся с `= + - @`, как
 * формулу. Часть значений приходит из неаутентифицированного гостевого
 * заказа (название компании, комментарий), а выгрузку открывает менеджер —
 * то есть текст из формы на сайте исполнялся бы у него на машине.
 *
 * Числа не трогаются вовсе: выгрузка идёт в 1С, и подпорченный числовой
 * столбец сломал бы импорт. Опасен только строковый ввод.
 */

// eslint-disable-next-line no-control-regex -- управляющие символы ищутся намеренно
const FORMULA_PREFIX = /^[\s\u0000-\u001F]*[=+\-@]/;

/**
 * Апостроф перед значением заставляет табличный редактор считать ячейку
 * текстом и сам при этом не отображается.
 */
export function sanitizeCsvValue(value) {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const text = String(value ?? "");
  if (!text) return text;

  // Управляющие символы в начале маскируют формулу от простой проверки.
  // eslint-disable-next-line no-control-regex -- управляющие символы ищутся намеренно
  const withoutLeadingControls = text.replace(/^[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/, "");
  if (FORMULA_PREFIX.test(withoutLeadingControls)) {
    return `'${withoutLeadingControls}`;
  }
  return withoutLeadingControls === text ? text : withoutLeadingControls;
}

/** Готовая ячейка: обезврежена, закавычена, внутренние кавычки удвоены. */
export function csvCell(value) {
  return `"${sanitizeCsvValue(value).replaceAll('"', '""')}"`;
}
