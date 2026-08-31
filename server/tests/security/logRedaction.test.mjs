/**
 * Журнал сервера уходит в systemd и в архивы, поэтому в него не должны
 * попадать токены, ключи и содержимое форм входа.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { REDACTED, redactError, redactSecrets, redactString } from "../../src/logRedaction.js";
import { startTestServer } from "../helpers/testServer.mjs";

const SAMPLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZSI6ImFkbWluIn0.s3cr3tS1gnatur3"; // secret-scan:allow — образец для проверки затирания

test("токен в свободном тексте затирается", () => {
  const text = redactString(`не удалось проверить ${SAMPLE_JWT} для запроса`);
  assert.equal(text.includes("eyJ"), false);
  assert.equal(text.includes(REDACTED), true);
});

test("заголовок авторизации затирается", () => {
  for (const value of [`Authorization: Bearer ${SAMPLE_JWT}`, "Basic YWRtaW46cGFzc3dvcmQ="]) {
    const text = redactString(value);
    assert.equal(text.includes("eyJ"), false);
    assert.equal(text.includes("YWRtaW46"), false);
  }
});

test("логин и пароль внутри URL затираются", () => {
  const text = redactString("http://exchange:s3cret@10.0.0.20/hs"); // secret-scan:allow — вымышленный адрес
  assert.equal(text.includes("s3cret"), false);
  assert.equal(text.startsWith("http://"), true);
});

test("пары ключ-значение затираются", () => {
  for (const value of [
    'password="Very-Secret-1"',
    "ONEC_API_KEY=abcdef0123456789abcdef",
    "jwt_secret: 8f2c1d5e",
  ]) {
    const text = redactString(value);
    assert.equal(text.includes("Very-Secret-1"), false);
    assert.equal(text.includes("abcdef0123456789abcdef"), false);
    assert.equal(text.includes("8f2c1d5e"), false);
  }
});

test("поля объекта с чувствительными именами затираются", () => {
  const safe = redactSecrets({
    email: "client@example.test",
    password: "Very-Secret-1",
    headers: { authorization: `Bearer ${SAMPLE_JWT}`, cookie: "sid=1" },
    nested: { apiKey: "abcdef0123456789abcdef", quantity: 12 },
  });

  assert.equal(safe.email, "client@example.test", "обычные поля остаются читаемыми");
  assert.equal(safe.password, REDACTED);
  assert.equal(safe.headers.authorization, REDACTED);
  assert.equal(safe.headers.cookie, REDACTED);
  assert.equal(safe.nested.apiKey, REDACTED);
  assert.equal(safe.nested.quantity, 12);
});

test("тело запроса не переносится из ошибки разбора", () => {
  const parseError = Object.assign(new SyntaxError("Unexpected token in JSON"), {
    status: 400,
    type: "entity.parse.failed",
    body: '{"email":"client@example.test","password":"Very-Secret-1"}',
  });

  const safe = redactError(parseError);
  assert.equal("body" in safe, false, "исходное тело запроса в журнал не переносится");
  assert.equal(JSON.stringify(safe).includes("Very-Secret-1"), false);
  assert.equal(safe.status, 400);
  assert.equal(safe.type, "entity.parse.failed");
});

test("сломанное тело формы входа не попадает в вывод сервера", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"email":"client@example.test","password":"Very-Secret-1"',
    });
    assert.equal(response.status >= 400, true);

    const output = server.logs.join("\n");
    assert.equal(
      output.includes("Very-Secret-1"),
      false,
      "пароль из некорректного запроса не должен попадать в журнал"
    );
  } finally {
    await server.stop();
  }
});
