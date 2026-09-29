import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  executeClientRegistration,
  executeForgotPassword,
  executeResendVerification,
} from "../src/authIssuance.js";
import {
  hasRole,
  parseStaffPermissions,
  staffCanManageStaff,
} from "../src/roles.js";
import { passkeyConfiguration } from "../src/passkeys.js";
import {
  isPasswordProofAllowed,
  isWritePasswordAllowed,
  WRITE_PASSWORD_MAX_LENGTH,
  WRITE_PASSWORD_MAX_UTF8_BYTES,
  WRITE_PASSWORD_MIN_LENGTH,
} from "../src/passwordPolicy.js";
import {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
} from "../src/passwordHash.js";
import {
  isValidNewPassword,
  PASSWORD_MAX_UTF8_BYTES,
} from "../../src/shared/passwordPolicy.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "..");
const SERVER_SOURCE = readFileSync(path.join(SERVER_DIRECTORY, "src", "server.js"), "utf8");
const DB_SOURCE = readFileSync(path.join(SERVER_DIRECTORY, "src", "db.js"), "utf8");

function declaration(name, nextName) {
  const start = SERVER_SOURCE.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `${name} declaration is missing`);
  const end = SERVER_SOURCE.indexOf(`const ${nextName} =`, start + 1);
  assert.notEqual(end, -1, `${nextName} boundary is missing after ${name}`);
  return SERVER_SOURCE.slice(start, end);
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function routeStart(pathname) {
  const pattern = new RegExp(
    `app\\.(?:get|post|put|patch|delete)\\s*\\(\\s*["']${regexEscape(pathname)}["']`,
    "u"
  );
  return SERVER_SOURCE.search(pattern);
}

function methodRouteStart(method, pathname) {
  const pattern = new RegExp(
    `app\\.${regexEscape(method.toLowerCase())}\\s*\\(\\s*["']${regexEscape(pathname)}["']`,
    "u"
  );
  return SERVER_SOURCE.search(pattern);
}

function methodRouteBetween(method, pathname, nextMethod, nextPathname) {
  const start = methodRouteStart(method, pathname);
  assert.notEqual(start, -1, `${method.toUpperCase()} ${pathname} route is missing`);
  const end = methodRouteStart(nextMethod, nextPathname);
  assert.notEqual(end, -1, `${nextMethod.toUpperCase()} ${nextPathname} boundary is missing`);
  assert.ok(end > start, `${nextMethod.toUpperCase()} ${nextPathname} must follow ${method.toUpperCase()} ${pathname}`);
  return SERVER_SOURCE.slice(start, end);
}

function methodRouteBlock(method, pathname) {
  const start = methodRouteStart(method, pathname);
  assert.notEqual(start, -1, `${method.toUpperCase()} ${pathname} route is missing`);
  const routePattern = /app\.(?:get|post|put|patch|delete)\s*\(/gu;
  routePattern.lastIndex = start + 1;
  const next = routePattern.exec(SERVER_SOURCE);
  return SERVER_SOURCE.slice(start, next?.index ?? SERVER_SOURCE.length);
}

function balancedFunctionBlock(source, start) {
  const signature = source.slice(start).match(/\)\s*\{/u);
  const open = signature ? start + signature.index + signature[0].lastIndexOf("{") : -1;
  assert.notEqual(open, -1, "function opening brace is missing");
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail("function closing brace is missing");
}

function atomicPasswordResetHelper() {
  const declarations = [...DB_SOURCE.matchAll(/export\s+function\s+([A-Za-z0-9_]+)\s*\(/gu)];
  for (const declaration of declarations) {
    const body = balancedFunctionBlock(DB_SOURCE, declaration.index);
    if (
      /(?:immediateTransaction|runInTransaction)\s*\(/u.test(body)
      && /auth_tokens/u.test(body)
      && /UPDATE\s+users/iu.test(body)
      && /used_at/iu.test(body)
    ) {
      return { name: declaration[1], body };
    }
  }
  assert.fail("no exported atomic password-reset token helper found");
}

function currentPasswordHelper() {
  const start = SERVER_SOURCE.indexOf("async function assertCurrentPassword");
  assert.notEqual(start, -1, "assertCurrentPassword helper is missing");
  return balancedFunctionBlock(SERVER_SOURCE, start);
}

function route(pathname, nextPathname) {
  const start = routeStart(pathname);
  assert.notEqual(start, -1, `${pathname} route is missing`);
  const end = routeStart(nextPathname);
  assert.notEqual(end, -1, `${nextPathname} boundary is missing after ${pathname}`);
  assert.ok(end > start, `${nextPathname} must follow ${pathname}`);
  return SERVER_SOURCE.slice(start, end);
}

function fixtureAuthDeps(existingUser) {
  const calls = {
    createAuthToken: 0,
    createUser: 0,
    hashPassword: 0,
    mail: 0,
    notify: 0,
    audit: 0,
  };
  const user = existingUser
    ? {
        id: "fixture-user",
        email: "fixture@example.invalid",
        role: "client",
        email_verified: false,
        approval_status: "pending",
      }
    : null;
  let clockMs = 1_000;
  const waits = [];
  return {
    calls,
    waits,
    deps: {
      env: { NODE_ENV: "production", PUBLIC_APP_URL: "https://fixture.example.invalid" },
      now: () => clockMs,
      wait: async (delayMs) => {
        waits.push(delayMs);
        clockMs += delayMs;
      },
      publicCabinetUrl: () => "https://fixture.example.invalid/lk",
      allowDevelopmentAuthLinks: () => false,
      findUserByEmail: () => user,
      hashPassword: async () => {
        calls.hashPassword += 1;
        return "$2b$12$fixture-only-not-a-real-hash";
      },
      createUser: (input) => {
        calls.createUser += 1;
        return { ...user, ...input, id: "created-user", email: input.email };
      },
      createPlainToken: () => "fixture-token-with-sufficient-length",
      tokenHash: () => "fixture-token-hash",
      createAuthToken: () => {
        calls.createAuthToken += 1;
      },
      verificationEmail: () => ({ subject: "fixture", text: "fixture", html: "fixture" }),
      resetPasswordEmail: () => ({ subject: "fixture", text: "fixture", html: "fixture" }),
      sendCloverMail: async () => {
        calls.mail += 1;
        return { sent: true };
      },
      writeAudit: () => {
        calls.audit += 1;
      },
      queueManagerNotification: () => {
        calls.notify += 1;
      },
      getClientState: () => ({ profile: { companyName: "Fixture" } }),
      isClientRole: (role) => role === "client",
      publicMailStatus: () => "fixture",
    },
  };
}

function publicResponse(value) {
  return JSON.parse(JSON.stringify(value));
}

test("SEC10B-ID-001 password writes enforce the shared Unicode code-point policy", () => {
  assert.equal(WRITE_PASSWORD_MIN_LENGTH, 12);
  assert.equal(WRITE_PASSWORD_MAX_LENGTH, 200);
  for (const [value, allowed, label] of [
    ["a".repeat(11), false, "11 BMP code points"],
    ["a".repeat(12), true, "12 BMP code points"],
    ["a".repeat(200), false, "200 BMP code points exceed the bcrypt byte limit"],
    ["a".repeat(201), false, "201 BMP code points"],
    ["😀".repeat(11), false, "11 astral code points"],
    ["😀".repeat(12), true, "12 astral code points"],
    ["😀".repeat(200), false, "200 astral code points exceed the bcrypt byte limit"],
    ["😀".repeat(201), false, "201 astral code points"],
    [" ".repeat(12), false, "whitespace-only password"],
  ]) {
    assert.equal(isWritePasswordAllowed(value), allowed, label);
  }

  for (const [value, allowed, label] of [
    ["", false, "empty password proof"],
    ["😀", true, "1 astral code point password proof"],
    ["😀".repeat(200), true, "200 astral code point password proof"],
    ["😀".repeat(201), false, "201 astral code point password proof"],
  ]) {
    assert.equal(isPasswordProofAllowed(value), allowed, label);
  }

  const schemas = [
    ["registerSchema", "managerClientProvisionSchema", "password"],
    ["managerClientPasswordSchema", "managerCreateSchema", "password"],
    ["managerCreateSchema", "staffContactSchema", "password"],
    ["staffPasswordSchema", "staffFeatureId", "password"],
    ["resetPasswordSchema", "changePasswordSchema", "password"],
    ["changePasswordSchema", "currentPasswordProofSchema", "newPassword"],
  ];
  for (const [name, nextName, field] of schemas) {
    const contract = new RegExp(
      `${regexEscape(field)}:\\s*z\\.string\\(\\)\\.refine\\(isWritePasswordAllowed,\\s*WRITE_PASSWORD_MESSAGE\\)`,
      "u"
    );
    assert.match(declaration(name, nextName), contract, `${name}.${field} bypasses the shared write-password policy`);
  }
  const proofSchemas = [
    ["loginSchema", "tokenSchema", "password"],
    ["changePasswordSchema", "currentPasswordProofSchema", "currentPassword"],
    ["currentPasswordProofSchema", "passkeyAuthenticationOptionsSchema", "currentPassword"],
  ];
  for (const [name, nextName, field] of proofSchemas) {
    const contract = new RegExp(
      `${regexEscape(field)}:\\s*z\\.string\\(\\)\\.refine\\(isPasswordProofAllowed,\\s*PASSWORD_PROOF_MESSAGE\\)`,
      "u"
    );
    assert.match(declaration(name, nextName), contract, `${name}.${field} bypasses the shared password-proof policy`);
  }
});

test("SEC10B-ID-001B password writes enforce bcrypt's 72-byte UTF-8 boundary without credential aliasing", async () => {
  assert.equal(WRITE_PASSWORD_MAX_UTF8_BYTES, 72);
  assert.equal(PASSWORD_MAX_UTF8_BYTES, WRITE_PASSWORD_MAX_UTF8_BYTES);

  const byteBoundaryCases = [
    ["a".repeat(71), 71, true, "71-byte ASCII/BMP"],
    ["a".repeat(72), 72, true, "72-byte ASCII/BMP"],
    ["a".repeat(73), 73, false, "73-byte ASCII/BMP"],
    ["я".repeat(35) + "a", 71, true, "71-byte Cyrillic/BMP"],
    ["я".repeat(36), 72, true, "72-byte Cyrillic/BMP"],
    ["я".repeat(36) + "a", 73, false, "73-byte Cyrillic/BMP"],
    ["😀".repeat(17) + "abc", 71, true, "71-byte astral"],
    ["😀".repeat(18), 72, true, "72-byte astral"],
    ["😀".repeat(18) + "a", 73, false, "73-byte astral"],
  ];
  for (const [value, expectedBytes, allowed, label] of byteBoundaryCases) {
    assert.equal(Buffer.byteLength(value, "utf8"), expectedBytes, `${label} fixture has the wrong byte length`);
    assert.equal(isWritePasswordAllowed(value), allowed, `${label} server policy mismatch`);
    assert.equal(isValidNewPassword(value), allowed, `${label} UI policy mismatch`);
  }

  const credentialA = `${"a".repeat(71)}A`;
  const credentialB = `${"a".repeat(71)}B`;
  assert.equal(Buffer.byteLength(credentialA, "utf8"), 72);
  assert.equal(Buffer.byteLength(credentialB, "utf8"), 72);
  assert.equal(isWritePasswordAllowed(credentialA), true);
  assert.equal(isWritePasswordAllowed(credentialB), true);
  const hashA = await hashPassword(credentialA, 4);
  const hashB = await hashPassword(credentialB, 4);
  assert.equal(await verifyPassword(credentialA, hashA), true);
  assert.equal(await verifyPassword(credentialB, hashB), true);
  assert.equal(await verifyPassword(credentialA, hashB), false);
  assert.equal(await verifyPassword(credentialB, hashA), false);

  const syncHashA = hashPasswordSync(credentialA, 4);
  assert.equal(verifyPasswordSync(credentialA, syncHashA), true);
  assert.equal(verifyPasswordSync(credentialB, syncHashA), false);

  const overLimit = "😀".repeat(18) + "a";
  assert.equal(isPasswordProofAllowed(overLimit), true, "login proof must remain compatible with legacy >72-byte passwords");
  await assert.rejects(() => hashPassword(overLimit, 4), /password_exceeds_bcrypt_limit/u);
  assert.throws(() => hashPasswordSync(overLimit, 4), /password_exceeds_bcrypt_limit/u);
});

test("SEC10B-ID-002 forgot-password response is neutral for existing and missing accounts", async () => {
  const existing = fixtureAuthDeps(true);
  const missing = fixtureAuthDeps(false);
  const input = { email: "fixture@example.invalid", req: { headers: {} } };
  const existingResponse = await executeForgotPassword(input, existing.deps);
  const missingResponse = await executeForgotPassword(input, missing.deps);
  assert.deepEqual(publicResponse(existingResponse), publicResponse(missingResponse));
  assert.equal(existing.calls.createAuthToken, 1);
  assert.equal(missing.calls.createAuthToken, 0);
  assert.equal(existing.calls.mail, 1);
  assert.equal(missing.calls.mail, 0);
});

test("SEC10B-ID-003 resend-verification response is neutral for existing and missing accounts", async () => {
  const existing = fixtureAuthDeps(true);
  const missing = fixtureAuthDeps(false);
  const input = { email: "fixture@example.invalid", req: { headers: {} } };
  const existingResponse = await executeResendVerification(input, existing.deps);
  const missingResponse = await executeResendVerification(input, missing.deps);
  assert.deepEqual(publicResponse(existingResponse), publicResponse(missingResponse));
  assert.equal(existing.calls.createAuthToken, 1);
  assert.equal(missing.calls.createAuthToken, 0);
});

test("SEC10B-ID-004 registration response is neutral while a new account keeps required side effects", async () => {
  const duplicate = fixtureAuthDeps(true);
  const fresh = fixtureAuthDeps(false);
  const input = {
    email: "fixture@example.invalid",
    password: "fixture-password-long",
    companyName: "Fixture",
    contactName: "Fixture User",
    phone: "+70000000000",
    req: { headers: {} },
  };
  const duplicateResult = await executeClientRegistration(input, duplicate.deps);
  const freshResult = await executeClientRegistration(input, fresh.deps);
  assert.equal(duplicateResult.status, 202);
  assert.equal(freshResult.status, 202);
  assert.deepEqual(publicResponse(duplicateResult), publicResponse(freshResult));
  assert.deepEqual(duplicate.waits, fresh.waits, "duplicate and fresh registration timing floors differ");
  assert.deepEqual(duplicate.waits, [300]);
  assert.equal(duplicateResult.body?.ok, true);
  assert.equal(Object.hasOwn(duplicateResult.body || {}, "error"), false);
  assert.equal(Object.hasOwn(duplicateResult.body || {}, "code"), false);
  assert.doesNotMatch(JSON.stringify(duplicateResult.body), /already[_ -]?exists|account[_ -]?exists|уже\s+существует/iu);
  assert.deepEqual(duplicate.calls, {
    createAuthToken: 0,
    createUser: 0,
    hashPassword: 1,
    mail: 0,
    notify: 0,
    audit: 0,
  });
  assert.deepEqual(fresh.calls, {
    createAuthToken: 1,
    createUser: 1,
    hashPassword: 1,
    mail: 1,
    notify: 1,
    audit: 1,
  });
});

test("SEC10B-ID-004B a concurrent duplicate registration race keeps the neutral public contract", async () => {
  const duplicate = fixtureAuthDeps(true);
  const concurrent = fixtureAuthDeps(false);
  let lookupCount = 0;
  concurrent.deps.findUserByEmail = () => {
    lookupCount += 1;
    return lookupCount === 1 ? null : {
      id: "concurrent-user",
      email: "fixture@example.invalid",
      role: "client",
    };
  };
  concurrent.deps.createUser = () => {
    concurrent.calls.createUser += 1;
    const error = new Error("UNIQUE constraint failed: users.email");
    error.code = "SQLITE_CONSTRAINT_UNIQUE";
    throw error;
  };
  const input = {
    email: "fixture@example.invalid",
    password: "fixture-password-long",
    companyName: "Fixture",
    contactName: "Fixture User",
    phone: "+70000000000",
    req: { headers: {} },
  };
  const duplicateResult = await executeClientRegistration(input, duplicate.deps);
  const concurrentResult = await executeClientRegistration(input, concurrent.deps);
  assert.equal(concurrentResult.status, 202);
  assert.deepEqual(publicResponse(concurrentResult), publicResponse(duplicateResult));
  assert.deepEqual(concurrent.waits, duplicate.waits);
  assert.equal(concurrent.calls.hashPassword, 1);
  assert.equal(concurrent.calls.createUser, 1);
  assert.equal(concurrent.calls.createAuthToken, 0);
  assert.equal(concurrent.calls.mail, 0);
  assert.equal(concurrent.calls.audit, 0);
  assert.equal(concurrent.calls.notify, 0);
});

test("SEC10B-ID-005 invalid password login does not disclose account existence", () => {
  const login = route("/api/auth/login", "/api/auth/change-password");
  assert.match(login, /if\s*\(!user\s*\|\|\s*!\(await verifyPassword\(input\.password,\s*user\.password_hash\)\)\)/u);
  assert.match(login, /AUTH_INVALID_CREDENTIALS/u);
  assert.match(login, /Неверная почта или пароль/u);
  assert.doesNotMatch(login, /USER_NOT_FOUND|ACCOUNT_NOT_FOUND/u);
});

test("SEC10B-ID-006 JWT is HS256-only, audience-bound, issuer-bound and expires within two hours", () => {
  const signStart = SERVER_SOURCE.indexOf("function signToken(user)");
  const authStart = SERVER_SOURCE.indexOf("function authRequired", signStart);
  const rolesStart = SERVER_SOURCE.indexOf("function roleRequired", authStart);
  assert.ok(signStart >= 0 && authStart > signStart && rolesStart > authStart);
  const sign = SERVER_SOURCE.slice(signStart, authStart);
  const verify = SERVER_SOURCE.slice(authStart, rolesStart);
  assert.match(sign, /algorithm:\s*["']HS256["']/u, "JWT signing algorithm is not pinned to HS256");
  assert.match(verify, /algorithms:\s*\[\s*["']HS256["']\s*\]/u, "JWT verification algorithm allowlist is missing");
  assert.match(sign, /issuer:\s*["']clover-server["']/u);
  assert.match(sign, /audience:\s*["']clover-app["']/u);
  assert.match(verify, /issuer:\s*["']clover-server["']/u);
  assert.match(verify, /audience:\s*["']clover-app["']/u);
  const ttl = sign.match(/expiresIn:\s*["'](\d+)([smhd])["']/u);
  assert.ok(ttl, "JWT expiry is not a literal bounded duration");
  const factors = { s: 1, m: 60, h: 3600, d: 86400 };
  assert.ok(Number(ttl[1]) * factors[ttl[2]] <= 2 * 3600, `JWT TTL ${ttl[1]}${ttl[2]} exceeds 2h`);
});

test("SEC10B-ID-007 password changes and explicit revoke invalidate older JWT sessions", () => {
  const signStart = SERVER_SOURCE.indexOf("function signToken(user)");
  const authStart = SERVER_SOURCE.indexOf("function authRequired", signStart);
  const rolesStart = SERVER_SOURCE.indexOf("function roleRequired", authStart);
  const sign = SERVER_SOURCE.slice(signStart, authStart);
  const verify = SERVER_SOURCE.slice(authStart, rolesStart);
  const logout = route("/api/auth/logout-other-sessions", "/api/admin/managers");
  assert.match(sign, /sessionEpoch:\s*String\(user\.password_changed_at\s*\|\|\s*["']["']\)/u);
  assert.match(verify, /payload\.sessionEpoch[\s\S]*user\.password_changed_at/u);
  assert.match(verify, /findUserById\(payload\.sub\)/u);
  assert.match(logout, /authRequired/u);
  assert.match(logout, /revokeOtherSessions\(req\.user\.id\)/u);
  assert.match(logout, /token:\s*signToken\(updatedUser\)/u);
});

test("SEC10B-ID-008 role hierarchy and malformed staff permissions fail closed", () => {
  assert.equal(hasRole("admin", ["manager"]), true);
  assert.equal(hasRole("manager", ["admin"]), false);
  assert.equal(hasRole("client", ["manager"]), false);
  assert.deepEqual(parseStaffPermissions("not-json"), {
    tabs: [], manageStaff: false, fullAccess: false, malformed: true,
  });
  assert.equal(staffCanManageStaff({ role: "manager", permissions: "not-json" }), false);
  assert.equal(staffCanManageStaff({ role: "admin", permissions: "not-json" }), true);
});

test("SEC10B-ID-009 representative client resources are bound to req.user.id", () => {
  const profile = route("/api/state/profile", "/api/state/addresses");
  const addresses = route("/api/state/addresses", "/api/state/favorites");
  const passkeyDelete = methodRouteBlock("post", "/api/passkeys/:credentialId/delete");
  const reconciliationFile = route("/api/reconciliation/:requestId/file", "/api/admin/clients/:clientId/approval");
  for (const [name, source] of [["profile", profile], ["addresses", addresses]]) {
    assert.match(source, /authRequired/u, `${name} lacks authentication`);
    assert.match(source, /roleRequired\("client"\)/u, `${name} lacks client role gate`);
    assert.match(source, /req\.user\.id/u, `${name} is not scoped to the authenticated user`);
  }
  assert.match(passkeyDelete, /credential\.userId\s*!==\s*String\(req\.user\.id\)/u);
  assert.match(passkeyDelete, /deletePasskey\(req\.user\.id,\s*credential\.id\)/u);
  assert.match(reconciliationFile, /String\(request\.user_id\)\s*!==\s*String\(req\.user\.id\)/u);
  assert.match(reconciliationFile, /return res\.status\(403\)/u);
});

test("SEC10B-ID-010 destructive administrative operations require explicit admin gates", () => {
  const resetStart = routeStart("/api/admin/reset");
  const resetEnd = SERVER_SOURCE.indexOf("app.use((error", resetStart);
  assert.ok(resetStart >= 0 && resetEnd > resetStart, "admin reset route boundary is missing");
  const reset = SERVER_SOURCE.slice(resetStart, resetEnd);
  assert.match(reset, /authRequired/u);
  assert.match(reset, /roleRequired\("admin"\)/u);
  assert.match(reset, /isAdminFullResetAllowed\(req\)/u);
  assert.match(reset, /req\.body\?\.confirm[\s\S]*!==\s*["']RESET["']/u);
  assert.match(reset, /createServerBackup\(/u);
  assert.ok(reset.indexOf("createServerBackup(") < reset.indexOf("resetServerData()"));

  const adminDelete = route(
    "/api/admin/reconciliation/:requestId",
    "/api/admin/reconciliation/:requestId/file"
  );
  assert.match(adminDelete, /authRequired/u);
  assert.match(adminDelete, /roleRequired\("admin"\)/u);
});

test("SEC10B-AUTH-001 passkey registration options require current-password proof", () => {
  const registration = route(
    "/api/passkeys/registration/options",
    "/api/passkeys/registration/verify"
  );
  assert.match(registration, /currentPassword/u, "passkey registration accepts a bearer token without reauthentication");
  assert.match(registration, /assertCurrentPassword\(req,\s*input\.currentPassword\)/u);
  const helper = currentPasswordHelper();
  assert.match(helper, /findUserByEmail\(req\.user\?\.email\)/u);
  assert.match(helper, /verifyPassword\(currentPassword,\s*user\.password_hash\)/u);
  assert.match(helper, /consumePublicRateLimit\(/u);
  assert.match(helper, /(?:REAUTH|CURRENT_PASSWORD|INVALID_CREDENTIALS)/u);
  assert.ok(
    registration.indexOf("assertCurrentPassword(") < registration.indexOf("registrationOptions("),
    "passkey registration options are created before current-password verification"
  );
});

test("SEC10B-AUTH-002 passkey removal uses a reauthenticated POST contract", () => {
  const removal = methodRouteBetween(
    "post",
    "/api/passkeys/:credentialId/delete",
    "post",
    "/api/passkeys/authentication/options"
  );
  assert.match(removal, /authRequired/u);
  assert.match(removal, /currentPassword/u);
  assert.match(removal, /assertCurrentPassword\(req,\s*input\.currentPassword\)/u);
  assert.match(currentPasswordHelper(), /verifyPassword\(currentPassword,\s*user\.password_hash\)/u);
  assert.match(removal, /credential\.userId\s*!==\s*String\(req\.user\.id\)/u);
  assert.ok(removal.indexOf("assertCurrentPassword(") < removal.indexOf("deletePasskey("));
  assert.ok(removal.indexOf("credential.userId") < removal.indexOf("deletePasskey("));
});

test("SEC10B-AUTH-003 legacy DELETE passkey endpoint is non-mutating and explicitly rejected", () => {
  const legacy = methodRouteBlock("delete", "/api/passkeys/:credentialId");
  assert.doesNotMatch(legacy, /deletePasskey\(/u);
  assert.match(legacy, /res\.status\((?:405|410)\)/u);
});

test("SEC10B-AUTH-004 logout-other-sessions requires current-password proof", () => {
  const logout = route("/api/auth/logout-other-sessions", "/api/admin/managers");
  assert.match(logout, /currentPassword/u);
  assert.match(logout, /assertCurrentPassword\(req,\s*input\.currentPassword\)/u);
  assert.match(currentPasswordHelper(), /verifyPassword\(currentPassword,\s*user\.password_hash\)/u);
  assert.ok(logout.indexOf("assertCurrentPassword(") < logout.indexOf("revokeOtherSessions("));
});

test("SEC10B-AUTH-005 administrators cannot set their own password through the staff-target route", () => {
  const start = SERVER_SOURCE.indexOf("function assertCanSetStaffPassword");
  const end = SERVER_SOURCE.indexOf("function auditFromRequest", start);
  assert.ok(start >= 0 && end > start);
  const guard = SERVER_SOURCE.slice(start, end);
  assert.match(guard, /String\(target\.id\)\s*===\s*String\(req\.user\.id\)/u);
  assert.match(guard, /STAFF_SELF_(?:PASSWORD_)?FORBIDDEN/u);
  assert.match(guard, /(?:status\s*=\s*409|status:\s*409)/u);
});

test("SEC10B-AUTH-006 password recovery consumes the token and updates the password atomically", () => {
  const reset = route("/api/auth/reset-password", "/api/auth/login");
  assert.doesNotMatch(reset, /consumeAuthToken\(/u, "route burns the reset token before the password write");
  assert.doesNotMatch(reset, /updateUserPassword\(/u, "route performs the password write outside the token transaction");
  const helper = atomicPasswordResetHelper();
  assert.match(reset, new RegExp(`${regexEscape(helper.name)}\\s*\\(`, "u"));
  if (/runInTransaction\s*\(/u.test(helper.body)) {
    const transactionStart = DB_SOURCE.indexOf("export function runInTransaction");
    assert.notEqual(transactionStart, -1, "runInTransaction helper is missing");
    assert.match(balancedFunctionBlock(DB_SOURCE, transactionStart), /BEGIN IMMEDIATE/u);
  }
  assert.match(helper.body, /WHERE[\s\S]*type\s*=\s*(?:\?|["']reset_password["'])[\s\S]*token_hash\s*=\s*\?/iu);
  assert.match(helper.body, /used_at\s*=\s*["']?["']?/iu);
  assert.match(helper.body, /expires_at/iu);
  assert.match(helper.body, /UPDATE\s+auth_tokens[\s\S]*used_at/iu);
  assert.match(helper.body, /UPDATE\s+users[\s\S]*password_hash/iu);
  assert.match(
    helper.body,
    /DELETE\s+FROM\s+passkey_credentials\s+WHERE\s+user_id\s*=\s*\?/iu,
    "password recovery leaves passkeys usable after the account credential is reset"
  );
});

test("SEC10B-AUTH-007 passkey authentication denies disabled accounts before verification and issuance", () => {
  const options = route(
    "/api/passkeys/authentication/options",
    "/api/passkeys/authentication/verify"
  );
  const verifyStart = methodRouteStart("post", "/api/passkeys/authentication/verify");
  const verifyEnd = routeStart("/api/bootstrap");
  assert.ok(verifyStart >= 0 && verifyEnd > verifyStart);
  const verify = SERVER_SOURCE.slice(verifyStart, verifyEnd);
  assert.match(options, /(?:candidate|user)\.(?:disabled_at|disabled)/u);
  assert.match(verify, /user\.(?:disabled_at|disabled)/u);
  assert.match(verify, /ACCOUNT_DISABLED/u);
  const disabledIndex = Math.min(
    ...[verify.indexOf("user.disabled_at"), verify.indexOf("user.disabled")].filter((value) => value >= 0)
  );
  assert.ok(disabledIndex < verify.indexOf("verifyPasskeyAuthentication("));
  assert.ok(disabledIndex < verify.indexOf("signToken("));
});

test("SEC10B-AUTH-008 production passkey configuration fails closed without explicit identity", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PASSKEY_ORIGIN: process.env.PASSKEY_ORIGIN,
    PASSKEY_RP_ID: process.env.PASSKEY_RP_ID,
    PASSKEY_RP_NAME: process.env.PASSKEY_RP_NAME,
    APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
  };
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  const request = {
    protocol: "https",
    hostname: "attacker.example.invalid",
    get: () => "attacker.example.invalid",
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.PASSKEY_ORIGIN;
    delete process.env.PASSKEY_RP_ID;
    process.env.APP_PUBLIC_URL = "https://clover.example.invalid";
    assert.throws(() => passkeyConfiguration(request), /PASSKEY_(?:ORIGIN|RP_ID).*required|configuration/iu);

    process.env.PASSKEY_ORIGIN = "https://clover.example.invalid";
    process.env.PASSKEY_RP_ID = "clover.example.invalid";
    const configured = passkeyConfiguration(request);
    assert.equal(configured.origin, "https://clover.example.invalid");
    assert.equal(configured.rpID, "clover.example.invalid");
  } finally {
    restore();
  }
});

test("SEC10B-AUTH-009 exhausted reauthentication is rejected before password verification", () => {
  const helper = currentPasswordHelper();
  const limiterIndex = helper.indexOf("consumePublicRateLimit(");
  const exhaustedIndex = helper.search(/if\s*\(\s*!reauthLimit\.allowed\s*\)/u);
  const verifyIndex = helper.indexOf("verifyPassword(");
  assert.ok(limiterIndex >= 0, "reauthentication does not consume its dedicated rate limit");
  assert.ok(exhaustedIndex > limiterIndex, "reauthentication does not reject an exhausted limiter");
  assert.ok(verifyIndex > exhaustedIndex, "password hashing occurs before the exhausted limiter rejects the request");
  const exhaustedBranch = helper.slice(exhaustedIndex, verifyIndex);
  assert.match(exhaustedBranch, /status\s*=\s*429/u);
  assert.match(exhaustedBranch, /AUTH_RATE_LIMITED/u);
  assert.match(exhaustedBranch, /throw\s+error/u);
});

console.log("SECURITY_STAGE10B_JWT_STORAGE=RESOLVED_BY_STAGE10D_SESSION_STORAGE");
