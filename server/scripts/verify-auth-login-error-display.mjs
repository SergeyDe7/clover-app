/**
 * API error → login form message. Isolated, no HTTP server, no secrets.
 * Also checks login 403 order in source: credentials before account status.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_KEY_BY_CODE,
  errorDisplayMessage,
  hasCatalogKey,
  RU_DICTIONARY,
} from "../../src/shared/i18n/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const t = (key) => RU_DICTIONARY[key] || key;

for (const code of AUTH_ERROR_CODES) {
  const key = AUTH_ERROR_KEY_BY_CODE[code];
  assert.equal(hasCatalogKey(key), true, `missing catalog key for ${code}`);
  assert.equal(typeof RU_DICTIONARY[key], "string");
  assert.ok(RU_DICTIONARY[key].trim(), `empty RU for ${key}`);
}

const invalid = errorDisplayMessage(
  {
    code: "AUTH_INVALID_CREDENTIALS",
    status: 401,
    message: "SQLException: relation users does not exist",
    payload: { error: "SQLException: relation users does not exist" },
  },
  t
);
assert.equal(invalid, "Неверная почта или пароль");
assert.doesNotMatch(invalid, /SQLException|users does not exist/i);

const missingAccount = errorDisplayMessage(
  { code: "AUTH_INVALID_CREDENTIALS", status: 401, message: "account missing" },
  t
);
const wrongPassword = errorDisplayMessage(
  { code: "AUTH_INVALID_CREDENTIALS", status: 401, message: "bad password for existing user" },
  t
);
assert.equal(missingAccount, wrongPassword);
assert.equal(missingAccount, "Неверная почта или пароль");

const rateLimited = errorDisplayMessage(
  {
    code: "AUTH_RATE_LIMITED",
    status: 429,
    message: "Слишком много попыток входа. Попробуйте через несколько минут.",
    retryAfterSeconds: 573,
  },
  t
);
assert.equal(rateLimited, "Слишком много попыток. Попробуйте позже");
assert.doesNotMatch(rateLimited, /573|минут|секунд/i);

const timeout = errorDisplayMessage({ code: "TIMEOUT", message: "aborted after 12000ms" }, t);
assert.equal(timeout, RU_DICTIONARY["shared.error.timeout"]);
assert.doesNotMatch(timeout, /12000/);

const network = errorDisplayMessage({ code: "NETWORK", message: "fetch failed ECONNREFUSED" }, t);
assert.equal(network, RU_DICTIONARY["shared.error.network"]);
assert.doesNotMatch(network, /ECONNREFUSED/);

const unavailable = errorDisplayMessage(
  { code: "API_UNAVAILABLE", status: 503, message: "AUTH_PUBLIC_URL_REQUIRED" },
  t
);
assert.equal(unavailable, RU_DICTIONARY["shared.error.apiUnavailable"]);
assert.doesNotMatch(unavailable, /AUTH_PUBLIC_URL/);

const unknownRaw = errorDisplayMessage(
  { status: 500, message: "Неизвестная сырая ошибка сервера XYZ" },
  t
);
assert.equal(unknownRaw, RU_DICTIONARY["shared.error.requestFailed"]);
assert.doesNotMatch(unknownRaw, /XYZ/);

assert.equal(
  errorDisplayMessage({ code: "EMAIL_NOT_VERIFIED", message: "leak-status" }, t),
  RU_DICTIONARY["auth.error.emailNotVerified"]
);
assert.equal(
  errorDisplayMessage({ code: "ACCOUNT_DISABLED", message: "leak-disabled" }, t),
  RU_DICTIONARY["auth.error.accountDisabled"]
);

const server = readFileSync(path.join(root, "server/src/server.js"), "utf8");
const loginStart = server.indexOf('app.post("/api/auth/login"');
const loginEnd = server.indexOf('app.post("/api/auth/change-password"');
assert.ok(loginStart >= 0 && loginEnd > loginStart, "login handler bounds");
const loginFn = server.slice(loginStart, loginEnd);
const credentialsIdx = loginFn.indexOf("AUTH_INVALID_CREDENTIALS");
const verifiedIdx = loginFn.indexOf("EMAIL_NOT_VERIFIED");
const disabledIdx = loginFn.indexOf("ACCOUNT_DISABLED");
const pendingIdx = loginFn.indexOf("ACCOUNT_PENDING");
assert.ok(credentialsIdx >= 0, "login 401 must send AUTH_INVALID_CREDENTIALS");
assert.ok(credentialsIdx < verifiedIdx, "403 EMAIL_NOT_VERIFIED must follow credentials check");
assert.ok(verifiedIdx < disabledIdx, "ACCOUNT_DISABLED must follow email verification check");
assert.ok(disabledIdx < pendingIdx, "ACCOUNT_PENDING must follow disabled check");
assert.match(loginFn, /verifyPassword/);
assert.ok(loginFn.indexOf("verifyPassword") < credentialsIdx, "password verify before 401 return");
assert.match(loginFn, /sendAuthRateLimited/);
assert.match(server, /AUTH_RATE_LIMITED/);
assert.match(server, /Retry-After/);

const forgotStart = server.indexOf('app.post("/api/auth/forgot-password"');
const resetStart = server.indexOf('app.post("/api/auth/reset-password"');
assert.ok(forgotStart >= 0 && resetStart > forgotStart);
assert.equal(
  server.slice(forgotStart, resetStart).includes("clearLoginLimit"),
  false,
  "public forgot-password must not clear login limiter"
);
assert.equal(
  /loginAttemptsByIp|\bipAttempts\b/.test(server),
  false,
  "no independent IP login limiter to clear"
);

console.log("verify-auth-login-error-display: ok");
