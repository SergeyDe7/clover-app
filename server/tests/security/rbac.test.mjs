/**
 * Разграничение доступа к manager-маршрутам по разделам кабинета.
 *
 * До этой правки permissions.tabs ограничивали только интерфейс: менеджер
 * с одной вкладкой мог обратиться к любому /api/admin/* напрямую.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, seedAccessFixtures } from "../helpers/testServer.mjs";

let server;
let users;

test.before(async () => {
  server = await startTestServer();
  users = await seedAccessFixtures(server);
});

test.after(async () => {
  await server?.stop();
});

/**
 * Маршруты, закрытые разделами. limited-менеджер имеет только tabs:["orders"],
 * поэтому всё, кроме заказов, должно отвечать 403.
 */
const FEATURE_ROUTES = [
  { name: "продукты", method: "POST", path: "/api/admin/products", body: { product: { name: "x" } } },
  { name: "обмен 1С", method: "GET", path: "/api/admin/exchange" },
  { name: "обмен: список товаров 1С", method: "GET", path: "/api/admin/one-c/products" },
  { name: "клиенты", method: "PUT", path: "/api/state/client-links", body: { clientLinks: [] } },
  { name: "рассылка", method: "POST", path: "/api/admin/push/promotion", body: { title: "x", body: "y" } },
];

const ADMIN_ONLY_ROUTES = [
  { name: "список бэкапов", method: "GET", path: "/api/admin/backups" },
  { name: "создание бэкапа", method: "POST", path: "/api/admin/backups", body: {} },
  { name: "восстановление из бэкапа", method: "POST", path: "/api/admin/backups/any.zip/restore", body: {} },
  { name: "журнал аудита", method: "GET", path: "/api/admin/audit" },
  { name: "конфигурация 1С", method: "GET", path: "/api/admin/one-c/config" },
];

const ALL_GUARDED_ROUTES = [...FEATURE_ROUTES, ...ADMIN_ONLY_ROUTES];

test("без токена все защищённые маршруты отвечают 401", async () => {
  for (const route of ALL_GUARDED_ROUTES) {
    const response = await server.request(route.path, {
      method: route.method,
      body: route.body,
    });
    assert.equal(response.status, 401, `${route.name}: ${route.method} ${route.path}`);
  }
});

test("клиент не проходит ни на один staff-маршрут", async () => {
  for (const route of ALL_GUARDED_ROUTES) {
    const response = await server.request(route.path, {
      method: route.method,
      body: route.body,
      token: users.client.token,
    });
    assert.equal(response.status, 403, `${route.name}: ${route.method} ${route.path}`);
  }
});

test("менеджер без раздела получает 403 с кодом FEATURE_FORBIDDEN", async () => {
  for (const route of FEATURE_ROUTES) {
    const response = await server.request(route.path, {
      method: route.method,
      body: route.body,
      token: users.limitedManager.token,
    });
    assert.equal(response.status, 403, `${route.name}: ${route.method} ${route.path}`);
    const payload = await response.json().catch(() => ({}));
    assert.equal(payload.code, "FEATURE_FORBIDDEN", `${route.name}: код ответа`);
  }
});

test("менеджер со своим разделом проходит guard", async () => {
  // tabs:["orders"] — заказы доступны. 404 на несуществующий заказ означает,
  // что запрос дошёл до обработчика, то есть guard пропустил.
  const response = await server.request("/api/admin/orders/no-such-order", {
    method: "DELETE",
    token: users.limitedManager.token,
  });
  assert.notEqual(response.status, 403, "заказы должны быть доступны менеджеру с tabs:['orders']");
});

test("менеджер без ограничений (fullAccess) проходит все feature-маршруты", async () => {
  for (const route of FEATURE_ROUTES) {
    const response = await server.request(route.path, {
      method: route.method,
      body: route.body,
      token: users.fullManager.token,
    });
    assert.notEqual(
      response.status,
      403,
      `${route.name}: менеджер без ограничения tabs не должен получать 403`
    );
  }
});

test("бэкапы, аудит и конфигурация 1С закрыты от менеджера и открыты админу", async () => {
  for (const route of ADMIN_ONLY_ROUTES) {
    const managerResponse = await server.request(route.path, {
      method: route.method,
      body: route.body,
      token: users.fullManager.token,
    });
    assert.equal(
      managerResponse.status,
      403,
      `${route.name}: менеджер (даже с полным доступом) не должен проходить`
    );

    const adminResponse = await server.request(route.path, {
      method: route.method,
      body: route.body,
      token: users.admin.token,
    });
    assert.notEqual(adminResponse.status, 403, `${route.name}: админ должен проходить`);
  }
});

test("отказ по разделу попадает в журнал аудита", async () => {
  await server.request("/api/admin/exchange", {
    token: users.limitedManager.token,
  });

  const db = server.openDb();
  try {
    const row = db
      .prepare("SELECT COUNT(*) AS total FROM audit_log WHERE action = 'staff.feature.denied'")
      .get();
    assert.ok(row.total > 0, "ожидалась запись staff.feature.denied в audit_log");
  } finally {
    db.close();
  }
});

test("подсистема выдачи доступов намеренно не изменена", async () => {
  // Отложено пользователем: менеджер по-прежнему видит журнал доступов.
  // Тест фиксирует текущее поведение, чтобы правка не проехала незамеченной.
  const response = await server.request("/api/admin/client-access", {
    token: users.limitedManager.token,
  });
  assert.equal(response.status, 200, "поведение /api/admin/client-access должно остаться прежним");
});
