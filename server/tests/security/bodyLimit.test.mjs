/**
 * Лимиты размера тела запроса.
 *
 * До правки любой маршрут принимал 24 МБ JSON, включая форму входа —
 * достаточно нескольких параллельных запросов, чтобы занять память.
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

const padding = (bytes) => "x".repeat(bytes);

test("обычный вход работает", async () => {
  const response = await server.request("/api/auth/login", {
    method: "POST",
    body: { email: users.admin.email, password: users.admin.password },
  });
  assert.equal(response.status, 200);
});

test("раздутое тело входа отклоняется с 413", async () => {
  const response = await server.request("/api/auth/login", {
    method: "POST",
    body: {
      email: users.admin.email,
      password: users.admin.password,
      filler: padding(200 * 1024),
    },
  });
  assert.equal(response.status, 413);
});

test("обычный гостевой заказ проходит парсер", async () => {
  const response = await server.request("/api/public/orders", {
    method: "POST",
    body: {
      contact: { name: "Тест", phone: "+70000000000" },
      items: [{ productId: "missing", quantity: 1 }],
    },
  });
  // Заказ может быть отклонён по составу, но не по размеру тела.
  assert.notEqual(response.status, 413);
});

test("раздутый гостевой заказ отклоняется с 413", async () => {
  const response = await server.request("/api/public/orders", {
    method: "POST",
    body: {
      contact: { name: "Тест", phone: "+70000000000" },
      items: [],
      comment: padding(300 * 1024),
    },
  });
  assert.equal(response.status, 413);
});

test("маршрут с легитимно большим телом принимает мегабайты", async () => {
  const products = Array.from({ length: 4000 }, (_, index) => ({
    id: `bulk-${index}`,
    name: `Товар ${index} ${padding(200)}`,
    price: 100,
  }));

  const response = await server.request("/api/state/products", {
    method: "PUT",
    body: { products },
    token: users.admin.token,
  });
  assert.notEqual(response.status, 413, "массовое сохранение каталога не должно упираться в лимит");
});

test("обычный admin-маршрут не принимает многомегабайтное тело", async () => {
  const response = await server.request("/api/admin/notifications/test", {
    method: "POST",
    body: { filler: padding(2 * 1024 * 1024) },
    token: users.admin.token,
  });
  assert.equal(response.status, 413);
});
