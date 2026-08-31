/**
 * Ограничение частоты запросов на неаутентифицированных маршрутах.
 *
 * Проверяется и сама блокировка, и то, что она не глобальная: разные
 * адреса и разные адресаты считаются раздельно, иначе один перебор
 * закрыл бы вход всем остальным.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "../helpers/testServer.mjs";

let server;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server?.stop();
});

const forgotPassword = (email, ip) =>
  server.request("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
    headers: { "X-Forwarded-For": ip },
  });

test("запросы в пределах лимита проходят", async () => {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await forgotPassword("limit-a@security.test", "203.0.113.10");
    assert.equal(response.status, 200, `попытка ${attempt} должна пройти`);
  }
});

test("превышение лимита по адресату даёт 429 и Retry-After", async () => {
  const response = await forgotPassword("limit-a@security.test", "203.0.113.10");
  assert.equal(response.status, 429);

  const retryAfter = Number(response.headers.get("retry-after"));
  assert.ok(retryAfter > 0, `ожидался Retry-After > 0, получено ${response.headers.get("retry-after")}`);
  assert.ok(retryAfter <= 3600, "Retry-After не должен превышать окно лимита");
});

test("другой адресат с того же IP считается отдельно", async () => {
  const response = await forgotPassword("limit-b@security.test", "203.0.113.10");
  assert.equal(response.status, 200);
});

test("тот же адресат с другого IP не наследует блокировку по IP", async () => {
  const response = await forgotPassword("limit-c@security.test", "203.0.113.99");
  assert.equal(response.status, 200);
});

test("лимит по IP срабатывает независимо от адресата", async () => {
  const ip = "203.0.113.50";
  let blockedAt = 0;

  for (let attempt = 1; attempt <= 15; attempt += 1) {
    const response = await forgotPassword(`ip-limit-${attempt}@security.test`, ip);
    if (response.status === 429) {
      blockedAt = attempt;
      break;
    }
  }

  assert.ok(blockedAt > 0, "перебор адресатов с одного IP должен упереться в лимит");
  assert.ok(blockedAt <= 11, `лимит по IP должен сработать не позже 11-й попытки, сработал на ${blockedAt}`);
});

test("ответ при превышении не раскрывает существование учётной записи", async () => {
  const existing = server.createUser({
    email: "known@security.test",
    password: "known-password-1",
    role: "client",
  });

  // Каждый адресат исчерпывает свой лимит с отдельного IP, чтобы счётчики
  // не пересекались и сравнивались строго одинаковые состояния.
  const exhaust = async (email, ip) => {
    let last;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      last = await forgotPassword(email, ip);
    }
    return last;
  };

  const known = await exhaust(existing.email, "198.51.100.1");
  const unknown = await exhaust("definitely-missing@security.test", "198.51.100.2");

  assert.equal(known.status, 429);
  assert.equal(unknown.status, 429);
  assert.deepEqual(await known.json(), await unknown.json());
});

test("истёкшее окно снимает блокировку", async () => {
  const db = server.openDb();
  try {
    // Сдвигаем начало окна на сутки назад — окно считается истёкшим.
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    db.prepare("UPDATE rate_limits SET window_started_at = ?, updated_at = ?").run(dayAgo, dayAgo);
  } finally {
    db.close();
  }

  const response = await forgotPassword("limit-a@security.test", "203.0.113.10");
  assert.equal(response.status, 200);
});

test("счётчик переживает перезапуск процесса", async () => {
  const ip = "203.0.113.77";
  const email = "restart@security.test";

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await forgotPassword(email, ip);
  }
  assert.equal((await forgotPassword(email, ip)).status, 429, "лимит должен быть исчерпан до перезапуска");

  const restarted = await startTestServer({ env: { DB_PATH: server.dbPath } });
  try {
    const response = await restarted.request("/api/auth/forgot-password", {
      method: "POST",
      body: { email },
      headers: { "X-Forwarded-For": ip },
    });
    assert.equal(response.status, 429, "после перезапуска блокировка должна сохраниться");
  } finally {
    await restarted.stop();
  }
});

test("таблица лимитов не хранит адреса и адресатов в открытом виде", async () => {
  const db = server.openDb();
  try {
    const rows = db.prepare("SELECT key FROM rate_limits").all();
    assert.ok(rows.length > 0, "ожидались записи счётчиков");
    for (const row of rows) {
      assert.match(row.key, /^[0-9a-f]{32}$/, "ключ должен быть хэшем, а не email или IP");
    }
  } finally {
    db.close();
  }
});
