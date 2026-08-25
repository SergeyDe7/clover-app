/** Проверка: логин/пароль staff обязаны сохраняться в vault при upsert credentials. */
import assert from "node:assert/strict";
import {
  attachStaffAccess,
  readStaffAccessVault,
  removeStaffAccessEntry,
  saveStaffAccessCredentials,
} from "../src/staffAccessVault.js";

const testId = `staff-vault-verify-${Date.now()}`;
const login = "staff.vault.verify@example.com";
const password = "StaffSavePass1";

try {
  const access = saveStaffAccessCredentials(
    testId,
    {
      login,
      password,
      role: "manager",
    },
    { email: "admin@verify.test" }
  );
  assert.equal(access.hasPassword, true);
  assert.equal(access.login, login);
  const stored = readStaffAccessVault()[testId];
  assert.ok(stored);
  assert.equal(stored.password, password);

  const attached = attachStaffAccess([
    { id: testId, email: login, role: "manager", disabled: false },
  ]);
  assert.equal(attached.length, 1);
  assert.equal(attached[0].password, password);
  assert.equal(attached[0].hasPassword, true);

  console.log("verify-staff-access-vault: ok");
} finally {
  removeStaffAccessEntry(testId);
}
