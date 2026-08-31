/**
 * Перенос состояния из localStorage (/api/migrate/*).
 *
 * Оба маршрута раскладывали тело запроса в состояние целиком, без списка
 * разрешённых полей.
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

const readState = (key) => {
  const db = server.openDb();
  try {
    const row = db.prepare("SELECT value_json FROM app_state WHERE key = ?").get(key);
    return row ? JSON.parse(row.value_json) : null;
  } finally {
    db.close();
  }
};

const readProfile = (userId) => {
  const db = server.openDb();
  try {
    const row = db.prepare("SELECT profile_json FROM client_state WHERE user_id = ?").get(userId);
    return row ? JSON.parse(row.profile_json) : null;
  } finally {
    db.close();
  }
};

test("клиент не подменяет email и служебные поля через перенос анкеты", async () => {
  const response = await server.request("/api/migrate/client", {
    method: "POST",
    token: users.client.token,
    body: {
      profile: {
        companyName: "ООО Ромашка",
        contactName: "Иван",
        phone: "+7 900 000-00-00",
        email: "attacker@evil.test",
        role: "admin",
        permissions: { tabs: ["backup"] },
        password_hash: "$2a$12$fake",
        sessionEpoch: "forged",
        isAdmin: true,
        id: "another-user",
      },
    },
  });
  assert.ok(response.ok, `перенос анкеты не должен падать: ${response.status}`);

  const profile = readProfile(users.client.id);
  assert.equal(profile.companyName, "ООО Ромашка", "разрешённые поля должны сохраняться");
  assert.equal(profile.email, users.client.email, "email должен остаться от учётной записи");

  for (const field of ["role", "permissions", "password_hash", "sessionEpoch", "isAdmin", "id"]) {
    assert.equal(field in profile, false, `служебное поле ${field} не должно попадать в анкету`);
  }
});

test("перенос не меняет роль и права учётной записи", async () => {
  const db = server.openDb();
  try {
    const row = db
      .prepare("SELECT role, permissions_json FROM users WHERE id = ?")
      .get(users.client.id);
    assert.equal(row.role, "client");
    assert.equal(row.permissions_json, "{}");
  } finally {
    db.close();
  }
});

test("менеджер не меняет настройки витрины через перенос", async () => {
  const before = readState("settings") || {};

  const response = await server.request("/api/migrate/manager", {
    method: "POST",
    token: users.fullManager.token,
    body: {
      settings: {
        managerFullName: "Менеджер",
        storefrontPricingMode: "purchase_markup",
        storefrontMarkupPercent: 1,
        storefrontPriceTypeId: "hacked",
      },
    },
  });
  assert.ok(response.ok, `перенос менеджера не должен падать: ${response.status}`);

  const after = readState("settings");
  assert.equal(after.managerFullName, "Менеджер", "обычные настройки менеджер менять может");
  assert.equal(
    after.storefrontMarkupPercent,
    before.storefrontMarkupPercent,
    "наценку витрины менеджер менять не должен"
  );
  assert.equal(
    after.storefrontPriceTypeId,
    before.storefrontPriceTypeId,
    "вид цен витрины менеджер менять не должен"
  );
});

test("админ по-прежнему меняет настройки витрины", async () => {
  const response = await server.request("/api/migrate/manager", {
    method: "POST",
    token: users.admin.token,
    body: { settings: { storefrontMarkupPercent: 33 } },
  });
  assert.ok(response.ok);

  assert.equal(readState("settings").storefrontMarkupPercent, 33);
});
