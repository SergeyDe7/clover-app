import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const temp = mkdtempSync(path.join(tmpdir(), "clover-provision-"));
process.env.DB_PATH = path.join(temp, "clover.sqlite");
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
process.env.JWT_SECRET = "verify-client-provision-secret-0123456789";

const {
  createUser,
  findUserByEmail,
  findUserById,
  listClients,
  setUserApprovalStatus,
  setUserEmailVerified,
  updateUserPassword,
} = await import("../src/db.js");

try {
  const manager = createUser({
    email: "manager-provision@clover.local",
    passwordHash: bcrypt.hashSync("ManagerProvision1!", 4),
    role: "manager",
    emailVerified: true,
    approvalStatus: "approved",
  });
  assert.equal(manager.role, "manager");

  const email = `client-provision-${Date.now()}@clover.local`;
  const password = "ClientAccess9";
  assert.ok(!findUserByEmail(email), "client email must be free before provision");

  const passwordHash = bcrypt.hashSync(password, 4);
  const user = createUser({
    email,
    passwordHash,
    role: "client",
    emailVerified: true,
    approvalStatus: "approved",
    profile: {
      companyName: "ООО Прованс",
      contactName: "Иван Тест",
      phone: "+7 900 111-22-33",
      email,
    },
  });

  const clients = listClients();
  const client = clients.find((item) => String(item.id) === String(user.id));
  assert.ok(client, "provisioned client missing from listClients");
  assert.equal(client.companyName, "ООО Прованс");
  const stored = findUserByEmail(email);
  assert.equal(Boolean(stored.email_verified), true);
  assert.equal(stored.approval_status, "approved");
  assert.equal(bcrypt.compareSync(password, stored.password_hash), true);

  const newPassword = "ClientAccessNew9";
  updateUserPassword(user.id, bcrypt.hashSync(newPassword, 4));
  setUserEmailVerified(user.id, true);
  setUserApprovalStatus(user.id, "approved");
  const afterPassword = findUserByEmail(email);
  assert.equal(bcrypt.compareSync(password, afterPassword.password_hash), false);
  assert.equal(bcrypt.compareSync(newPassword, afterPassword.password_hash), true);

  assert.ok(findUserById(user.id));
  console.log("verify-client-provision: ok");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
