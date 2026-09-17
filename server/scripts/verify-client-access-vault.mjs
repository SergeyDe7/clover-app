/** S2-NEW-002: vault stores metadata only — never plaintext password. */
import assert from "node:assert/strict";
import {
  readClientAccessVault,
  removeClientAccessEntry,
  saveClientAccessCredentials,
  listClientAccessEntries,
} from "../src/clientAccessVault.js";

const testId = `vault-verify-${Date.now()}`;
const login = "vault.verify@example.com";

try {
  const access = saveClientAccessCredentials(
    testId,
    {
      login,
      password: "AutoSavePass1",
      companyName: "Vault Verify",
      contactName: "QA",
    },
    { email: "manager@verify.test" }
  );
  assert.equal(access.login, login);
  assert.equal(access.password, undefined);
  const stored = readClientAccessVault()[testId];
  assert.ok(stored);
  assert.equal(stored.password, undefined);
  assert.equal(cleanMissing(stored.password), "");
  const listed = listClientAccessEntries([
    { id: testId, email: login, companyName: "Vault Verify", contactName: "QA" },
  ]);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].password, undefined);
  assert.ok(!Object.prototype.hasOwnProperty.call(listed[0], "password") || !listed[0].password);
  console.log("verify-client-access-vault: ok");
} finally {
  removeClientAccessEntry(testId);
}

function cleanMissing(value) {
  return String(value ?? "").trim();
}
