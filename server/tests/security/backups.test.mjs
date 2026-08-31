/**
 * Резервные копии: права доступа к API, права на файл архива и его состав.
 *
 * Архив содержит выгрузку БД и все загруженные файлы, поэтому утечка одного
 * файла равнозначна утечке базы клиентов целиком.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { statSync, readdirSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
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

test("создание, скачивание и восстановление бэкапа закрыты от менеджера", async () => {
  const routes = [
    { method: "GET", path: "/api/admin/backups" },
    { method: "POST", path: "/api/admin/backups", body: {} },
    { method: "POST", path: "/api/admin/backups/cleanup", body: {} },
    { method: "GET", path: "/api/admin/backups/whatever.zip/download" },
    { method: "POST", path: "/api/admin/backups/whatever.zip/restore", body: {} },
  ];

  for (const route of routes) {
    const response = await server.request(route.path, {
      method: route.method,
      body: route.body,
      token: users.fullManager.token,
    });
    assert.equal(response.status, 403, `${route.method} ${route.path} должен быть закрыт`);
  }
});

test("админ создаёт бэкап, файл доступен только владельцу", async () => {
  const response = await server.request("/api/admin/backups", {
    method: "POST",
    body: { label: "security-test", reason: "security test" },
    token: users.admin.token,
  });
  assert.equal(response.status, 201);

  const payload = await response.json();
  const fileName = payload.backup?.fileName || payload.fileName;
  assert.ok(fileName, `в ответе нет имени файла: ${JSON.stringify(payload)}`);

  const filePath = path.join(server.backupDir, fileName);
  const mode = statSync(filePath).mode & 0o777;
  assert.equal(
    mode.toString(8),
    "600",
    `права на архив должны быть 0600, получено 0${mode.toString(8)}`
  );
});

test("бэкап пишется только в свой каталог и не содержит секретов", async () => {
  const files = readdirSync(server.backupDir).filter((name) => name.endsWith(".zip"));
  assert.ok(files.length > 0, "ожидался хотя бы один архив во временном каталоге");

  const zip = new AdmZip(path.join(server.backupDir, files[0]));
  const entries = zip.getEntries().map((entry) => entry.entryName);

  const allowed = entries.every(
    (name) => name === "manifest.json" || name === "snapshot.json" || name.startsWith("uploads/")
  );
  assert.ok(allowed, `в архиве неожиданные записи: ${entries.filter((n) => !n.startsWith("uploads/")).join(", ")}`);

  const secretLike = entries.filter((name) => /(^|\/)\.?env(\.|$)|\.pem$|\.key$/i.test(name));
  assert.deepEqual(secretLike, [], "в архиве не должно быть env-файлов и ключевого материала");
});

test("имя файла бэкапа не позволяет выйти за каталог", async () => {
  for (const name of ["..%2F..%2Fetc%2Fpasswd", "%2Fetc%2Fpasswd", "..%2F.env"]) {
    const response = await server.request(`/api/admin/backups/${name}/download`, {
      token: users.admin.token,
    });
    assert.ok(
      response.status >= 400,
      `traversal ${name} должен отклоняться, получено ${response.status}`
    );
  }
});
