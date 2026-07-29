import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "clover-v25-db-test-"));
const databasePath = path.join(tempDirectory, "clover-test.sqlite");
process.env.DB_PATH = databasePath;
process.env.MANAGER_EMAIL = "manager-test@clover.local";
process.env.MANAGER_PASSWORD = "TemporaryTestPassword!";

const dbModule = await import(`../src/db.js?test=${Date.now()}`);
const {
  createUser,
  db,
  getGlobalState,
  listOrders,
  replaceOrders,
  setClientStateField,
  setGlobalState,
} = dbModule;

const client = createUser({
  email: "client-test@example.local",
  passwordHash: "test-hash",
  role: "client",
  profile: {
    companyName: "Тестовый клиент",
    contactName: "Иван",
    phone: "+70000000000",
    email: "client-test@example.local",
  },
});
setClientStateField(client.id, "addresses", ["Тестовый адрес"]);
setGlobalState("testSettings", { preserved: true });
replaceOrders({
  userId: client.id,
  managerMode: false,
  orders: [
    {
      id: "order-preservation-test",
      number: "CL-TEST-001",
      clientId: client.id,
      customerName: "Тестовый клиент",
      items: [],
      createdAt: "2026-07-24T00:00:00.000Z",
    },
  ],
});
assert.equal(getGlobalState("testSettings", {}).preserved, true);
assert.equal(listOrders(client.id).length, 1);
db.close();

const reopened = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
const userCount = reopened.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'client'").get().count;
const orderCount = reopened.prepare("SELECT COUNT(*) AS count FROM orders WHERE id = ?").get("order-preservation-test").count;
const stateRow = reopened.prepare("SELECT value_json FROM app_state WHERE key = ?").get("testSettings");
assert.equal(Number(userCount), 1);
assert.equal(Number(orderCount), 1);
assert.equal(JSON.parse(stateRow.value_json).preserved, true);
reopened.close();
rmSync(tempDirectory, { recursive: true, force: true });

console.log("Проверка сохранности пользователей, заказов и локальной базы пройдена успешно.");
