import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { addProductIdToClientMatrix } from "../src/oneCProducts.js";
import { clientMayOrderCatalogProduct } from "../src/matrixGuard.js";
import { projectRoot } from "./readFrontendUiSource.mjs";

const pending = addProductIdToClientMatrix({}, "client-1", 682);
assert.equal(pending.clientLink.matrixMode, "selected");
assert.deepEqual(pending.clientLink.matrixProductIds, [682]);
assert.equal(pending.addedToMatrix, true);
assert.equal(pending.alreadyInMatrix, false);
assert.equal(
  clientMayOrderCatalogProduct(pending.clientLink, 682, [{ id: 682, active: true }]),
  true,
  "После добавления клиент может заказать товар из матрицы."
);
assert.equal(
  clientMayOrderCatalogProduct(pending.clientLink, 1, [{ id: 1, active: true }]),
  false,
  "Товар вне матрицы заказать нельзя."
);

const again = addProductIdToClientMatrix(pending.clientLinks, "client-1", 682);
assert.equal(again.alreadyInMatrix, true);
assert.equal(again.addedToMatrix, false);
assert.equal(again.clientLink.matrixProductIds.length, 1);

const allMode = addProductIdToClientMatrix(
  { "client-1": { matrixMode: "all", matrixProductIds: [] } },
  "client-1",
  10
);
assert.equal(allMode.addedToMatrix, false);
assert.equal(allMode.clientLink.matrixMode, "all");

const pinAll = addProductIdToClientMatrix(
  { "client-1": { matrixMode: "all", matrixProductIds: [] } },
  "client-1",
  10,
  { pinAllMode: true }
);
assert.equal(pinAll.addedToMatrix, true);
assert.equal(pinAll.clientLink.matrixMode, "selected");
assert.deepEqual(pinAll.clientLink.matrixProductIds, [10]);

const clientScreen = readFileSync(
  path.join(projectRoot, "src/screens/client/ClientScreen.jsx"),
  "utf8"
);
assert.ok(clientScreen.includes("ClientCatalogAddPanel"));
assert.ok(clientScreen.includes('tab === "catalog"'));

const addPanel = readFileSync(
  path.join(projectRoot, "src/screens/client/ClientCatalogAddPanel.jsx"),
  "utf8"
);
assert.ok(addPanel.includes("В матрицу"));
assert.ok(addPanel.includes("catalogAddPrice"));
assert.ok(addPanel.includes("client-matrix-grid"));
assert.ok(addPanel.includes("client-matrix-card"));
assert.ok(addPanel.includes("client-catalog-add-price"));
assert.ok(addPanel.includes("Заказ оформляется"));
assert.ok(!addPanel.includes("setCart"));

const helpers = readFileSync(
  path.join(projectRoot, "src/shared/appHelpers.js"),
  "utf8"
);
assert.ok(helpers.includes('["matrix", "Моя матрица"]'));
assert.ok(helpers.includes('["catalog", "Добавить товары из каталога"]'));

const server = readFileSync(
  path.join(projectRoot, "server/src/server.js"),
  "utf8"
);
assert.ok(server.includes('"/api/state/my-matrix/add"'));
assert.ok(server.includes("client.matrix.self-add"));
assert.ok(
  !server.includes("matrixProducts = activeProducts;"),
  "Матрица клиента не должна подменять пустой список всем каталогом."
);

const orderEditor = readFileSync(
  path.join(projectRoot, "src/screens/client/OrderEditor.jsx"),
  "utf8"
);
assert.ok(
  !orderEditor.includes("catalog-scope-switch"),
  "Дубль кнопок матрицы/каталога в верхнем блоке убран."
);
assert.ok(
  orderEditor.includes("cart-sheet-item-controls"),
  "Корзина: единица измерения должна быть над количеством."
);

const managerOrders = readFileSync(
  path.join(projectRoot, "src/screens/manager/ManagerOrders.jsx"),
  "utf8"
);
assert.ok(managerOrders.includes("runBulkTrash"));

console.log("verify-client-self-matrix: ok");
