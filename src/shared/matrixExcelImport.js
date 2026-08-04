import * as XLSX from "xlsx";

const NAME_HEADERS = [
  "название",
  "наименование",
  "товар",
  "номенклатура",
  "продукт",
  "name",
  "product",
  "item",
];
const CODE_HEADERS = [
  "код",
  "артикул",
  "код1с",
  "код 1с",
  "article",
  "sku",
  "code",
];

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
}

function pickColumn(headers, aliases) {
  const indexed = headers.map((header, index) => ({
    index,
    key: normalizeHeader(header),
  }));
  for (const alias of aliases) {
    const hit = indexed.find((entry) => entry.key === alias || entry.key.includes(alias));
    if (hit) return hit.index;
  }
  return -1;
}

/**
 * Читает Excel/CSV и возвращает строки { name, code }.
 * Колонки: Название/Товар/Номенклатура (+ опционально Код/Артикул).
 * Если заголовков нет — первая колонка = название, вторая = код.
 */
export async function parseMatrixExcelFile(file) {
  if (!file) {
    throw new Error("Файл не выбран.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("В файле нет листов.");
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const rows = (Array.isArray(matrix) ? matrix : [])
    .map((row) => (Array.isArray(row) ? row : []))
    .filter((row) => row.some((cell) => String(cell ?? "").trim()));

  if (!rows.length) {
    throw new Error("Файл пустой.");
  }

  const header = rows[0].map((cell) => normalizeHeader(cell));
  let nameIdx = pickColumn(header, NAME_HEADERS);
  let codeIdx = pickColumn(header, CODE_HEADERS);
  let dataRows = rows;

  if (nameIdx >= 0) {
    dataRows = rows.slice(1);
  } else {
    nameIdx = 0;
    codeIdx = rows[0].length > 1 ? 1 : -1;
  }

  const parsed = [];
  const seen = new Set();

  for (const row of dataRows) {
    const name = String(row[nameIdx] ?? "").trim();
    const code = codeIdx >= 0 ? String(row[codeIdx] ?? "").trim() : "";
    if (!name && !code) continue;
    const key = `${name.toLocaleLowerCase("ru-RU")}::${code.toLocaleLowerCase("ru-RU")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({ name, code });
  }

  if (!parsed.length) {
    throw new Error(
      "Не найдено ни одной строки с названием. Ожидаются колонки «Название»/«Товар» и опционально «Код»."
    );
  }

  return {
    sheetName,
    rows: parsed,
  };
}
