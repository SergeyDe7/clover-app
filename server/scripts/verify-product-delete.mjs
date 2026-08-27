import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  uniqueMatrixProductIds,
  growMatrixIdList,
  toggleMatrixProductId,
  idsWithout,
  expandMatrixRemovalByOneCId,
} from "../../src/screens/manager/matrixIds.js";

const saved = uniqueMatrixProductIds([
  10,
  "10",
  11,
  "",
  null,
  12,
  11,
]);
assert.deepEqual(
  saved.map(String),
  ["10", "11", "12"],
  "Сохранение матрицы оставляет уникальные id, в том числе только что загруженные"
);

const empty = uniqueMatrixProductIds(undefined);
assert.deepEqual(empty, []);

const grown = growMatrixIdList(["10", "11"], ["11", "12"]);
assert.deepEqual(grown, ["10", "11", "12"], "Снимок матрицы только растёт");

const afterUncheck = toggleMatrixProductId(["10", "11", "12"], "11", false);
assert.deepEqual(
  afterUncheck.map(String),
  ["10", "12"],
  "Снятие галочки убирает только этот id"
);
const afterCheck = toggleMatrixProductId(afterUncheck, "11", true);
assert.deepEqual(
  afterCheck.map(String),
  ["10", "12", "11"],
  "Повторная галочка возвращает тот же id"
);

assert.deepEqual(
  idsWithout(["10", "11", "12"], ["11"]).map(String),
  ["10", "12"],
  "Удаление из матрицы снимает только отмеченные id"
);

const expandedByOneC = expandMatrixRemovalByOneCId(
  [{ id: "10", oneCId: "oc-1", name: "Сок" }],
  ["10", "20", "30"],
  [
    { id: "10", oneCId: "oc-1", name: "Сок" },
    { id: "20", oneCId: "oc-1", name: "Сок дубль" },
    { id: "30", oneCId: "oc-2", name: "Сок" },
  ]
);
assert.deepEqual(
  [...expandedByOneC].sort(),
  ["10", "20"],
  "Удаление убирает скрытые дубли с тем же oneCId, но не одноимённые с другим oneCId"
);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const clientsSource = await readFile(
  path.resolve(scriptDir, "../../src/screens/manager/ManagerClients.jsx"),
  "utf8"
);
assert.equal(
  clientsSource.includes("expandMatrixRemovalIds"),
  false,
  "Галочка матрицы не должна снимать одноимённые товары пакетом"
);
assert.equal(
  clientsSource.includes("expandMatrixRemovalByOneCId"),
  true,
  "Удаление из матрицы должно убирать скрытые дубли по oneCId"
);
assert.equal(
  clientsSource.includes("Галочка в списке матрицы — выбор для удаления, а не членство. Снятие не убирает товар из матрицы."),
  true,
  "Галочка в списке матрицы не должна сразу удалять товар из матрицы"
);
assert.equal(
  clientsSource.includes("setMatrixPickIds"),
  true,
  "Отметки в списке матрицы хранятся отдельно от состава матрицы"
);
assert.equal(
  clientsSource.includes("MatrixCloverCatalogAdd"),
  true,
  "В матрице должна быть кнопка добавления из каталога Clover"
);

const catalogAddSource = await readFile(
  path.resolve(scriptDir, "../../src/screens/manager/MatrixCloverCatalogAdd.jsx"),
  "utf8"
);
assert.equal(
  catalogAddSource.includes("Добавить из каталога"),
  true,
  "Кнопка добавления из каталога Clover есть в панели матрицы"
);
assert.equal(
  catalogAddSource.includes("createProductFromOneCCatalog") ||
    catalogAddSource.includes("deleteProduct"),
  false,
  "Добавление из каталога Clover не создаёт SKU и не удаляет товары"
);

console.log("Проверка сохранения id матрицы и удаления товара из каталога пройдена успешно.");
