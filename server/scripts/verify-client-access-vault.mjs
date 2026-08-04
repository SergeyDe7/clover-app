/** Проверка: логин/пароль обязаны сохраняться в vault при upsert credentials. */
import assert from "node:assert/strict";
import {
  readClientAccessVault,
  removeClientAccessEntry,
  saveClientAccessCredentials,
} from "../src/clientAccessVault.js";

const testId = `vault-verify-${Date.now()}`;
const login = "vault.verify@example.com";
const password = "AutoSavePass1";

try {
  const access = saveClientAccessCredentials(
    testId,
    {
      login,
      password,
      companyName: "Vault Verify",
      contactName: "QA",
    },
    { email: "manager@verify.test" }
  );
  assert.equal(access.hasPassword, true);
  assert.equal(access.login, login);
  const stored = readClientAccessVault()[testId];
  assert.ok(stored);
  assert.equal(stored.password, password);
  console.log("verify-client-access-vault: ok");
} finally {
  removeClientAccessEntry(testId);
}
