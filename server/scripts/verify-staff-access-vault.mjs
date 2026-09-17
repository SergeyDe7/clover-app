/** Проверка: staff vault хранит только metadata, без plaintext password. */
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const temp = mkdtempSync(path.join(tmpdir(), "clover-staff-vault-"));
process.env.DB_PATH = path.join(temp, "clover.sqlite");
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
process.env.JWT_SECRET = "verify-staff-access-vault-secret-0123456789";

const { createUser, deleteStaffUser } = await import("../src/db.js");
const {
  attachStaffAccess,
  readStaffAccessVault,
  removeStaffAccessEntry,
  saveStaffAccessCredentials,
} = await import("../src/staffAccessVault.js");

const login = `staff.vault.verify.${Date.now()}@example.com`;
const plainPassword = "StaffSavePass1";
let userId = "";

try {
  const user = createUser({
    email: login,
    passwordHash: bcrypt.hashSync(plainPassword, 4),
    role: "manager",
    emailVerified: true,
    approvalStatus: "approved",
  });
  userId = String(user.id);

  const access = saveStaffAccessCredentials(
    userId,
    {
      login,
      password: plainPassword,
      role: "manager",
    },
    { email: "admin@verify.test" }
  );

  assert.equal(access.login, login);
  assert.equal(access.hasPassword, true, "hasPassword должен браться из users.password_hash");
  assert.equal(Object.prototype.hasOwnProperty.call(access, "password"), false);

  const stored = readStaffAccessVault()[userId];
  assert.ok(stored, "запись vault должна существовать");
  assert.equal(stored.login, login);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, "password"), false);
  assert.notEqual(stored.password, plainPassword);
  assert.ok(!JSON.stringify(stored).includes(plainPassword), "vault не должен содержать plaintext");

  const attached = attachStaffAccess([
    { id: userId, email: login, role: "manager", disabled: false },
  ]);
  assert.equal(attached.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(attached[0], "password"), false);
  assert.equal(attached[0].hasPassword, true);
  assert.equal(attached[0].login, login);
  assert.ok(attached[0].passwordUpdatedAt || attached[0].passwordUpdatedAt === "");

  const orphanId = `staff-vault-orphan-${Date.now()}`;
  const orphan = saveStaffAccessCredentials(
    orphanId,
    { login: "orphan.staff@example.com", role: "manager" },
    { email: "admin@verify.test" }
  );
  assert.equal(orphan.hasPassword, false, "без users.password_hash hasPassword=false");
  assert.equal(Object.prototype.hasOwnProperty.call(readStaffAccessVault()[orphanId] || {}, "password"), false);
  removeStaffAccessEntry(orphanId);

  console.log("verify-staff-access-vault: ok");
} finally {
  if (userId) {
    removeStaffAccessEntry(userId);
    deleteStaffUser(userId);
  }
  rmSync(temp, { recursive: true, force: true });
}
