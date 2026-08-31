/**
 * Граница доверия обмена с 1С и ограничение исходящих адресов.
 *
 * Обмен работает без учётной записи Clover, по ключу в заголовке, поэтому
 * ключ и имя контура — единственное, что отделяет тестовый контур от
 * боевой базы.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, seedAccessFixtures, TEST_ONEC_KEY } from "../helpers/testServer.mjs";
import { sanitizeOneCConfig, allowedOneCOrigins } from "../../src/oneC.js";

const PROD_CONTOUR = "VLAVKA";

let server;
let users;

test.before(async () => {
  server = await startTestServer({
    env: {
      ONEC_ALLOWED_DATABASES: `TEST,${PROD_CONTOUR}`,
      ONEC_PROD_EXCHANGE_ENABLED: "true",
      ONEC_API_KEY: "",
      ONEC_API_KEY_TEST: "test-contour-key-0123456789abcdef",
      ONEC_API_KEY_PROD: "prod-contour-key-0123456789abcdef",
    },
  });
  users = await seedAccessFixtures(server);
});

test.after(async () => {
  await server?.stop();
});

const priceTypes = (key, database) =>
  server.request("/api/one-c/price-types", {
    headers: {
      ...(key ? { "X-Clover-Key": key } : {}),
      ...(database ? { "X-Clover-Database": database } : {}),
    },
  });

test("без ключа обмен закрыт", async () => {
  const response = await priceTypes(null, "TEST");
  assert.equal(response.status, 401);
});

test("неверный ключ не проходит", async () => {
  const response = await priceTypes("wrong-key-but-long-enough-0123456789", "TEST");
  assert.equal(response.status, 401);
});

test("неизвестный контур отклоняется", async () => {
  for (const database of ["UNKNOWN_DB", "../TEST", "TEST;VLAVKA", ""]) {
    const response = await priceTypes("test-contour-key-0123456789abcdef", database);
    assert.equal(response.status, 403, `контур ${JSON.stringify(database)} не должен приниматься`);
  }
});

test("ключ контура TEST не достаёт до боевой базы", async () => {
  const response = await priceTypes("test-contour-key-0123456789abcdef", PROD_CONTOUR);
  assert.equal(response.status, 403);

  const payload = await response.json();
  assert.equal(payload.code, "ONEC_KEY_CONTOUR_MISMATCH");
});

test("ключ контура TEST работает со своей базой", async () => {
  const response = await priceTypes("test-contour-key-0123456789abcdef", "TEST");
  assert.equal(response.status, 200);
});

test("ключ боевого контура работает с боевой базой", async () => {
  const response = await priceTypes("prod-contour-key-0123456789abcdef", PROD_CONTOUR);
  assert.equal(response.status, 200);
});

test("ключ обмена не попадает в ответ и в журнал аудита", async () => {
  await priceTypes("prod-contour-key-0123456789abcdef", PROD_CONTOUR);
  await priceTypes("wrong-key-but-long-enough-0123456789", "TEST");

  const db = server.openDb();
  try {
    const rows = db.prepare("SELECT details_json FROM audit_log").all();
    for (const row of rows) {
      assert.equal(
        row.details_json.includes("contour-key"),
        false,
        "ключ обмена не должен попадать в журнал"
      );
    }
  } finally {
    db.close();
  }

  assert.equal(
    server.logs.join("").includes("contour-key"),
    false,
    "ключ обмена не должен попадать в вывод сервера"
  );
});

test("общий ключ без контура сохраняет прежнее поведение", async () => {
  const legacy = await startTestServer({
    env: {
      ONEC_ALLOWED_DATABASES: `TEST,${PROD_CONTOUR}`,
      ONEC_PROD_EXCHANGE_ENABLED: "true",
      ONEC_API_KEY: TEST_ONEC_KEY,
    },
  });
  try {
    for (const database of ["TEST", PROD_CONTOUR]) {
      const response = await legacy.request("/api/one-c/price-types", {
        headers: { "X-Clover-Key": TEST_ONEC_KEY, "X-Clover-Database": database },
      });
      assert.equal(response.status, 200, `общий ключ должен работать с ${database}`);
    }
  } finally {
    await legacy.stop();
  }
});

test("адрес 1С ограничен разрешёнными origin", () => {
  const previous = process.env.ONEC_ALLOWED_ORIGINS;
  process.env.ONEC_ALLOWED_ORIGINS = "http://10.0.0.20";
  const save = (baseUrl) =>
    sanitizeOneCConfig({ mode: "real", baseUrl }, { enforceAllowlist: true });
  try {
    assert.deepEqual(allowedOneCOrigins(), ["http://10.0.0.20"]);
    assert.equal(save("http://10.0.0.20/hs").baseUrl, "http://10.0.0.20/hs");

    for (const bad of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:4100/api/admin/audit",
      "https://evil.test/hs",
    ]) {
      assert.throws(() => save(bad), /разрешён только для/, `адрес ${bad} должен отклоняться`);
    }

    // Уже сохранённая конфигурация читается без проверки списка, иначе
    // страница настроек перестала бы открываться после смены адреса.
    assert.doesNotThrow(() => sanitizeOneCConfig({ mode: "real", baseUrl: "https://evil.test" }));
  } finally {
    if (previous === undefined) delete process.env.ONEC_ALLOWED_ORIGINS;
    else process.env.ONEC_ALLOWED_ORIGINS = previous;
  }
});

test("адрес 1С не принимает посторонние схемы и логин в URL", () => {
  const previous = process.env.ONEC_ALLOWED_ORIGINS;
  process.env.ONEC_ALLOWED_ORIGINS = "";
  try {
    for (const bad of ["file:///etc/passwd", "gopher://10.0.0.20", "ftp://10.0.0.20"]) {
      assert.throws(() => sanitizeOneCConfig({ mode: "real", baseUrl: bad }));
    }
    assert.throws(
      () => sanitizeOneCConfig({ mode: "real", baseUrl: "http://user:secret@10.0.0.20" }),
      /логин и пароль/
    );
  } finally {
    if (previous === undefined) delete process.env.ONEC_ALLOWED_ORIGINS;
    else process.env.ONEC_ALLOWED_ORIGINS = previous;
  }
});

test("настройки обмена 1С доступны только админу", async () => {
  const managerRead = await server.request("/api/admin/one-c/config", {
    token: users.fullManager.token,
  });
  assert.equal(managerRead.status, 403);

  const adminRead = await server.request("/api/admin/one-c/config", {
    token: users.admin.token,
  });
  assert.notEqual(adminRead.status, 403);
});
