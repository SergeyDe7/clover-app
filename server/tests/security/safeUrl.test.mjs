/**
 * Ссылка на сертификат попадает в href карточки товара, поэтому схемы,
 * исполняемые браузером при клике, до разметки доходить не должны.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { safeLinkUrl } from "../../src/safeUrl.js";
import { startTestServer, seedAccessFixtures } from "../helpers/testServer.mjs";

test("исполняемые схемы отбрасываются", () => {
  for (const value of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "blob:https://example.test/abc",
  ]) {
    assert.equal(safeLinkUrl(value), "", `${value} должен отбрасываться`);
  }
});

test("обычные ссылки сохраняются как есть", () => {
  for (const value of [
    "https://example.test/cert.pdf",
    "http://10.0.0.20/files/cert.pdf",
    "/uploads/cert-1.pdf",
    "/uploads/файл сертификата.pdf",
  ]) {
    assert.equal(safeLinkUrl(value), value, `${value} должен сохраняться`);
  }
});

test("пустое значение остаётся пустым", () => {
  for (const value of ["", "   ", null, undefined, 0]) {
    assert.equal(safeLinkUrl(value), "");
  }
});

test("адрес без схемы на чужой хост не проходит", () => {
  assert.equal(safeLinkUrl("//evil.test/cert.pdf"), "");
  assert.equal(safeLinkUrl("не ссылка"), "");
});

test("витрина не отдаёт ссылку с исполняемой схемой", async () => {
  const server = await startTestServer();
  try {
    const users = await seedAccessFixtures(server);

    const save = await server.request("/api/state/products", {
      method: "PUT",
      token: users.admin.token,
      body: {
        products: [
          {
            id: "cert-test-1",
            code: "CERT-1",
            name: "Товар с сертификатом",
            category: "Прочее",
            showOnStorefront: true,
            certificateUrl: "javascript:alert(document.cookie)",
            imageUrl: "javascript:alert(1)",
          },
        ],
      },
    });
    assert.equal(save.status, 200);

    const saved = (await save.json()).products.find((item) => item.id === "cert-test-1");
    assert.equal(saved.certificateUrl, "", "ссылка не должна сохраняться");
    assert.equal(saved.imageUrl, "");

    const catalog = await server.request("/api/public/catalog");
    const published = (await catalog.json()).products.find((item) => item.id === "cert-test-1");
    if (published) {
      assert.equal(published.certificateUrl, "");
      assert.equal(published.imageUrl, "");
    }
  } finally {
    await server.stop();
  }
});
