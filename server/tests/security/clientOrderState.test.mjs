/**
 * Целостность заказов клиента при полной замене состояния
 * (PUT /api/state/orders).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, seedAccessFixtures } from "../helpers/testServer.mjs";

let server;
let users;

const makeOrder = (id, overrides = {}) => ({
  id,
  number: id.toUpperCase(),
  status: "Новый",
  items: [
    {
      id: `${id}-line-1`,
      productId: "p-1",
      name: "Товар",
      unit: "piece",
      quantity: 10,
      price: 100,
      lineTotal: 1000,
    },
  ],
  customItems: [],
  total: 1000,
  amount: 1000,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

test.before(async () => {
  server = await startTestServer();
  users = await seedAccessFixtures(server);
});

test.after(async () => {
  await server?.stop();
});

const saveOrders = (token, orders) =>
  server.request("/api/state/orders", { method: "PUT", body: { orders }, token });

test("клиент не может переписать цену принятого заказа", async () => {
  const accepted = makeOrder("locked-price", { status: "Принят" });
  server.insertOrder(users.client.id, accepted);

  const response = await saveOrders(users.client.token, [
    makeOrder("locked-price", {
      status: "Принят",
      items: [{ ...accepted.items[0], price: 1, lineTotal: 10 }],
      total: 10,
      amount: 10,
    }),
  ]);
  assert.ok(response.ok, `сохранение не должно падать: ${response.status}`);

  const stored = server.readOrders(users.client.id).find((order) => order.id === "locked-price");
  assert.equal(stored.items[0].price, 100, "цена принятого заказа должна остаться серверной");
  assert.equal(stored.total, 1000, "сумма принятого заказа должна остаться серверной");
});

test("клиент не может изменить статус заказа", async () => {
  server.insertOrder(users.client.id, makeOrder("status-tamper"));

  const response = await saveOrders(users.client.token, [
    makeOrder("status-tamper", { status: "Выполнен" }),
  ]);

  if (response.ok) {
    const stored = server.readOrders(users.client.id).find((order) => order.id === "status-tamper");
    assert.equal(stored.status, "Новый", "статус не должен меняться клиентом");
  } else {
    assert.equal(response.status, 409, `ожидался отказ по статусу, получено ${response.status}`);
  }
});

test("клиент не может удалить заказ, ушедший в работу", async () => {
  server.insertOrder(users.client.id, makeOrder("locked-delete", { status: "Собирается" }));

  const response = await saveOrders(users.client.token, []);
  assert.ok(response.ok, `сохранение не должно падать: ${response.status}`);

  const stored = server.readOrders(users.client.id).find((order) => order.id === "locked-delete");
  assert.ok(stored, "заказ в работе не должен исчезать при пустом списке");
  assert.equal(stored.status, "Собирается");
});

test("клиент не может удалить заказ, уже отправленный в 1С", async () => {
  server.insertOrder(
    users.client.id,
    makeOrder("locked-sent", { exchange: { status: "sent" } })
  );

  const response = await saveOrders(users.client.token, []);
  assert.ok(response.ok);

  const stored = server.readOrders(users.client.id).find((order) => order.id === "locked-sent");
  assert.ok(stored, "отправленный в 1С заказ не должен исчезать");
});

test("новый заказ клиента по-прежнему сохраняется и правится", async () => {
  const created = await saveOrders(users.client.token, [makeOrder("editable-1", { items: [] })]);
  assert.ok(created.ok, `создание заказа сломано: ${created.status} ${await created.text()}`);

  let stored = server.readOrders(users.client.id).find((order) => order.id === "editable-1");
  assert.ok(stored, "новый заказ должен сохраниться");

  const edited = await saveOrders(users.client.token, [
    makeOrder("editable-1", { items: [], comment: "Правка клиента" }),
  ]);
  assert.ok(edited.ok, "правка нового заказа должна проходить");

  stored = server.readOrders(users.client.id).find((order) => order.id === "editable-1");
  assert.equal(stored.comment, "Правка клиента");
});

test("новый заказ клиента по-прежнему удаляется", async () => {
  await saveOrders(users.client.token, [makeOrder("editable-2", { items: [] })]);
  assert.ok(server.readOrders(users.client.id).some((order) => order.id === "editable-2"));

  const response = await saveOrders(users.client.token, []);
  assert.ok(response.ok);
  assert.equal(
    server.readOrders(users.client.id).some((order) => order.id === "editable-2"),
    false,
    "новый заказ должен удаляться, эта возможность не отбиралась"
  );
});

test("клиент не может записать заказ на чужую учётную запись", async () => {
  const other = server.createUser({
    email: "other-client@security.test",
    password: "other-password-1",
    role: "client",
  });
  server.insertOrder(other.id, makeOrder("foreign-1"));

  const response = await saveOrders(users.client.token, [
    makeOrder("foreign-1", { items: [], clientId: other.id, total: 5 }),
  ]);
  assert.ok(response.ok);

  const foreign = server.readOrders(other.id).find((order) => order.id === "foreign-1");
  assert.ok(foreign, "чужой заказ должен остаться у своего владельца");
  assert.equal(foreign.total, 1000, "чужой заказ не должен переписываться");
});

test("менеджерский путь сохранения заказов не изменился", async () => {
  server.insertOrder(users.client.id, makeOrder("manager-editable", { status: "Принят" }));

  const response = await server.request("/api/state/orders", {
    method: "PUT",
    body: {
      orders: server
        .readOrders()
        .map((order) =>
          order.id === "manager-editable" ? { ...order, managerComment: "Комментарий менеджера" } : order
        ),
    },
    token: users.admin.token,
  });
  assert.ok(response.ok, `менеджер должен сохранять заказы: ${response.status} ${await response.text()}`);

  const stored = server.readOrders(users.client.id).find((order) => order.id === "manager-editable");
  assert.equal(stored.managerComment, "Комментарий менеджера");
});
