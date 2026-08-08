import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { readFrontendUiSource } from "./readFrontendUiSource.mjs";

const projectDirectory = path.resolve(import.meta.dirname, "../..");
const serverSource = readFileSync(path.join(projectDirectory, "server/src/server.js"), "utf8");
const dbSource = readFileSync(path.join(projectDirectory, "server/src/db.js"), "utf8");
const appSource = readFrontendUiSource(projectDirectory);
const apiSource = readFileSync(path.join(projectDirectory, "src/serverApi.js"), "utf8");
const manifestSource = readFileSync(path.join(projectDirectory, "public/manifest.webmanifest"), "utf8");
const workerSource = readFileSync(path.join(projectDirectory, "public/sw.js"), "utf8");

const requiredServerFragments = [
  "/api/auth/register",
  "/api/auth/verify-email",
  "/api/auth/forgot-password",
  "/api/auth/change-password",
  "/api/auth/logout-other-sessions",
  "/api/admin/managers",
  "/api/passkeys/registration/options",
  "/api/passkeys/authentication/verify",
  "/api/reconciliation",
  "/api/push/subscribe",
  "/api/one-c/reconciliation/requests",
  "/api/one-c/reconciliation/:requestId/result",
  "oneCAuthRequired",
  "orderItemsSignature",
];
for (const fragment of requiredServerFragments) assert.ok(serverSource.includes(fragment), `Missing server route ${fragment}`);
for (const table of ["auth_tokens", "reconciliation_requests", "push_subscriptions", "passkey_credentials"]) {
  assert.ok(dbSource.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `Missing DB table ${table}`);
}
for (const fragment of [
  "Доступ в личный кабинет Вы можете получить у менеджера",
  "Войти по Face ID / отпечатку",
  "Запросить акт сверки",
  "1 квартал",
  "За весь период",
  "Связаться с менеджером",
]) assert.ok(appSource.includes(fragment), `Missing UI fragment ${fragment}`);
assert.equal(
  appSource.includes("Установить Clover"),
  false,
  "PWA install banner text «Установить Clover» must stay removed"
);
for (const method of ["getPasskeyAuthenticationOptions", "createReconciliation", "subscribePush", "logoutOtherSessions"]) {
  assert.ok(apiSource.includes(method), `Missing API method ${method}`);
}

const { buildOneCAuthHeaders } = await import("../src/oneC.js");
const oneCHeaders = buildOneCAuthHeaders({
  apiKey: "test-api-key-01234567890123456789",
  username: "CloverExchange",
  password: "test-password",
});
assert.equal(oneCHeaders["X-Clover-Key"], "test-api-key-01234567890123456789");
assert.ok(oneCHeaders.Authorization.startsWith("Basic "));

const manifest = JSON.parse(manifestSource);
assert.equal(manifest.display, "standalone");
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
assert.ok(workerSource.includes('self.addEventListener("push"'));
assert.ok(workerSource.includes('self.addEventListener("notificationclick"'));

const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "clover-v18-test-"));
const databasePath = path.join(tempDirectory, "clover.sqlite");
process.env.DB_PATH = databasePath;
process.env.MANAGER_EMAIL = "manager-v18-test@clover.local";
process.env.MANAGER_PASSWORD = "TemporaryTestPassword!";

const dbModule = await import(`../src/db.js?v18=${Date.now()}`);
const {
  createUser,
  findUserByEmail,
  setUserEmailVerified,
  setUserApprovalStatus,
  createAuthToken,
  consumeAuthToken,
  createReconciliationRequest,
  updateReconciliationRequest,
  listReconciliationRequests,
  upsertPushSubscription,
  listPushSubscriptions,
  savePasskey,
  listPasskeys,
  updatePasskeyCounter,
  createWebAuthnChallenge,
  consumeWebAuthnChallenge,
  exportDatabaseSnapshot,
  revokeOtherSessions,
  db,
} = dbModule;

const client = createUser({
  email: "v18-client@example.local",
  passwordHash: "test-hash",
  role: "client",
  emailVerified: false,
  approvalStatus: "pending",
  profile: { companyName: "V18 Test", contactName: "Иван", phone: "+70000000000", email: "v18-client@example.local" },
});
assert.equal(Boolean(findUserByEmail(client.email).email_verified), false);
setUserEmailVerified(client.id, true);
setUserApprovalStatus(client.id, "approved");
assert.equal(findUserByEmail(client.email).approval_status, "approved");

createAuthToken({ userId: client.id, type: "verify_email", tokenHash: "test-token-hash", expiresAt: new Date(Date.now() + 60000).toISOString() });
assert.equal(consumeAuthToken({ type: "verify_email", tokenHash: "test-token-hash" }).userId, client.id);
assert.equal(consumeAuthToken({ type: "verify_email", tokenHash: "test-token-hash" }), null);

const act = createReconciliationRequest({ userId: client.id, periodType: "q2", year: 2026, dateFrom: "2026-04-01", dateTo: "2026-06-30" });
assert.equal(listReconciliationRequests(client.id).length, 1);
assert.equal(updateReconciliationRequest(act.id, { status: "ready", managerComment: "Готово" }).status, "ready");

upsertPushSubscription({
  userId: client.id,
  subscription: { endpoint: "https://push.example.test/subscription", keys: { p256dh: "key", auth: "auth" } },
  preferences: { orderEvents: false, promotions: true },
});
assert.equal(listPushSubscriptions(client.id).length, 1);
assert.equal(listPushSubscriptions(client.id)[0].orderEvents, true);
assert.equal(listPushSubscriptions(null, "promotions").length, 1);

const sessionUserBefore = findUserByEmail(client.email);
const sessionUserAfter = revokeOtherSessions(client.id);
assert.notEqual(sessionUserAfter.password_changed_at, sessionUserBefore.password_changed_at);

savePasskey({
  id: "passkey-test-id",
  userId: client.id,
  publicKey: new Uint8Array([1, 2, 3, 4]),
  counter: 1,
  transports: ["internal"],
  deviceType: "multiDevice",
  backedUp: true,
  webauthnUserID: client.id,
});
assert.equal(listPasskeys(client.id).length, 1);
updatePasskeyCounter("passkey-test-id", 2);
assert.equal(listPasskeys(client.id)[0].counter, 2);
const ceremony = createWebAuthnChallenge({ userId: client.id, type: "authentication", challenge: "challenge", expiresAt: new Date(Date.now() + 60000).toISOString() });
assert.equal(consumeWebAuthnChallenge(ceremony.id, "authentication").challenge, "challenge");
assert.equal(consumeWebAuthnChallenge(ceremony.id, "authentication"), null);

const snapshot = exportDatabaseSnapshot();
assert.ok(snapshot.users.some((user) => user.id === client.id));
assert.ok(snapshot.reconciliationRequests.some((request) => request.id === act.id));
assert.ok(snapshot.pushSubscriptions.length === 1);
assert.ok(snapshot.passkeys.length === 1);
db.close();

// Verify that a V17-style users table is upgraded in place without losing its account.
const legacyDatabasePath = path.join(tempDirectory, "legacy.sqlite");
const legacy = new DatabaseSync(legacyDatabasePath);
legacy.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;
`);
legacy.prepare("INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)")
  .run("legacy-manager", "legacy@clover.local", "hash", "manager", "2026-01-01T00:00:00.000Z");
legacy.close();
process.env.DB_PATH = legacyDatabasePath;
const legacyModule = await import(`../src/db.js?legacy=${Date.now()}`);
const legacyUser = legacyModule.findUserByEmail("legacy@clover.local");
assert.equal(legacyUser.id, "legacy-manager");
assert.equal(Boolean(legacyUser.email_verified), true);
assert.equal(legacyUser.approval_status, "approved");
legacyModule.db.close();

rmSync(tempDirectory, { recursive: true, force: true });
console.log("Clover V18.1 verification passed: auth, session revocation, protected 1C routes, acts, mandatory order push, PWA and passkeys.");
