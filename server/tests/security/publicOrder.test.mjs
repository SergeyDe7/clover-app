/**
 * Гостевой заказ с витрины — единственный неаутентифицированный маршрут,
 * который пишет в БД. Проверяется, что цену считает сервер, что границы
 * полей заданы, и что отклонённый запрос не доходит ни до базы, ни до
 * уведомления менеджеру.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { storefrontOrderSchema } from "../../src/storefrontPublic.js";
import { startTestServer } from "../helpers/testServer.mjs";

const validInput = () => ({
  contactName: "Иван Иванов",
  phone: "+7 900 000-00-00",
  address: "Санкт-Петербург, Невский проспект, 1",
  items: [{ productId: "p-1", unit: "piece", qty: 2 }],
});

test("схема не принимает цену от клиента", () => {
  const parsed = storefrontOrderSchema.parse({
    ...validInput(),
    total: 1,
    amount: 1,
    items: [{ productId: "p-1", unit: "piece", qty: 2, unitPrice: 1, lineTotal: 1, price: 1 }],
  });

  assert.equal(parsed.total, undefined, "поле total не должно проходить из тела запроса");
  assert.equal(parsed.amount, undefined, "поле amount не должно проходить из тела запроса");
  for (const key of ["unitPrice", "lineTotal", "price"]) {
    assert.equal(parsed.items[0][key], undefined, `поле ${key} не должно проходить из тела запроса`);
  }
});

test("схема задаёт границы всех строковых полей", () => {
  const tooLong = (length) => "я".repeat(length);
  const cases = [
    ["contactName", { contactName: "и" }],
    ["contactName", { contactName: tooLong(121) }],
    ["phone", { phone: "123" }],
    ["phone", { phone: tooLong(51) }],
    ["address", { address: "дом" }],
    ["address", { address: tooLong(501) }],
    ["comment", { comment: tooLong(2001) }],
    ["companyName", { companyName: tooLong(161) }],
    ["email", { email: "не-почта" }],
  ];

  for (const [field, patch] of cases) {
    assert.throws(
      () => storefrontOrderSchema.parse({ ...validInput(), ...patch }),
      `поле ${field} должно отклоняться: ${JSON.stringify(patch)}`
    );
  }
});

test("схема задаёт границы состава заказа", () => {
  const line = { productId: "p-1", unit: "piece", qty: 1 };

  assert.throws(() => storefrontOrderSchema.parse({ ...validInput(), items: [] }), "пустой заказ");
  assert.throws(
    () => storefrontOrderSchema.parse({ ...validInput(), items: Array(201).fill(line) }),
    "больше 200 позиций"
  );
  assert.throws(
    () => storefrontOrderSchema.parse({ ...validInput(), items: [{ ...line, qty: 0 }] }),
    "нулевое количество"
  );
  assert.throws(
    () => storefrontOrderSchema.parse({ ...validInput(), items: [{ ...line, qty: -5 }] }),
    "отрицательное количество"
  );
  assert.throws(
    () => storefrontOrderSchema.parse({ ...validInput(), items: [{ ...line, qty: 1.5 }] }),
    "дробное количество"
  );
  assert.throws(
    () => storefrontOrderSchema.parse({ ...validInput(), items: [{ ...line, qty: 100001 }] }),
    "количество сверх предела"
  );
  assert.throws(
    () => storefrontOrderSchema.parse({ ...validInput(), items: [{ ...line, unit: "вагон" }] }),
    "неизвестная единица измерения"
  );
  assert.throws(
    () => storefrontOrderSchema.parse({ ...validInput(), items: [{ ...line, productId: "x".repeat(121) }] }),
    "неограниченный идентификатор товара"
  );
});

test("отклонённый заказ не создаёт ни заказа, ни уведомления менеджеру", async () => {
  const server = await startTestServer();
  try {
    const before = server.openDb();
    const ordersBefore = before.prepare("SELECT COUNT(*) AS total FROM orders").get().total;
    const notificationsBefore = before
      .prepare("SELECT COUNT(*) AS total FROM manager_notifications")
      .get().total;
    before.close();

    const rejected = [
      { ...validInput(), items: [{ productId: "не-существует", unit: "piece", qty: 1 }] },
      { ...validInput(), contactName: "и" },
      { ...validInput(), items: [] },
    ];

    for (const body of rejected) {
      const response = await server.request("/api/public/orders", { method: "POST", body });
      assert.ok(
        response.status >= 400 && response.status < 500,
        `ожидался отказ, получено ${response.status}`
      );
    }

    const after = server.openDb();
    try {
      assert.equal(
        after.prepare("SELECT COUNT(*) AS total FROM orders").get().total,
        ordersBefore,
        "отклонённый заказ не должен попадать в базу"
      );
      assert.equal(
        after.prepare("SELECT COUNT(*) AS total FROM manager_notifications").get().total,
        notificationsBefore,
        "отклонённый заказ не должен уведомлять менеджера"
      );
    } finally {
      after.close();
    }
  } finally {
    await server.stop();
  }
});

test("гостевой заказ ограничен по частоте", async () => {
  const server = await startTestServer();
  try {
    let blocked = false;
    for (let attempt = 1; attempt <= 25; attempt += 1) {
      const response = await server.request("/api/public/orders", {
        method: "POST",
        body: validInput(),
        headers: { "X-Forwarded-For": "203.0.113.200" },
      });
      if (response.status === 429) {
        blocked = true;
        assert.ok(Number(response.headers.get("retry-after")) > 0, "ожидался Retry-After");
        break;
      }
    }
    assert.ok(blocked, "поток гостевых заказов с одного адреса должен упереться в лимит");
  } finally {
    await server.stop();
  }
});
