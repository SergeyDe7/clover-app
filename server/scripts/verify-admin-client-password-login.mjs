/**
 * Admin set-password → client login. Isolated SQLite only.
 * Covers rate-limit unlock after authorized reset, persistence, roles, lookup.
 * Never prints secrets. Synthetic fixtures only.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const OPT_TMP = "/opt/clover/.tmp";
mkdirSync(OPT_TMP, { recursive: true });
const temp = mkdtempSync(path.join(OPT_TMP, "admin-client-password-login-"));
const databasePath = path.join(temp, "clover.sqlite");
const uploadsDir = path.join(temp, "uploads");
const backupDir = path.join(temp, "backups");
mkdirSync(uploadsDir);
mkdirSync(backupDir);

const PROD_DB = "/opt/clover/clover-app/server/data/clover.sqlite";
const PROD_ENV = "/opt/clover/clover-app/server/.env";
const jwtSecret = "clover-admin-client-pw-login-secret-32ch!";
const oldPassword = "OldClientLoginPass!1";
const newPassword = "NewClientLoginPass!2";
const require = createRequire(path.join(serverDir, "package.json"));
const results = [];

function fingerprint(p) {
  try {
    const st = statSync(p);
    return { mtimeMs: st.mtimeMs, size: st.isFile() ? st.size : -1 };
  } catch {
    return null;
  }
}

const prodBefore = { db: fingerprint(PROD_DB), env: fingerprint(PROD_ENV) };

function note(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${detail}`);
  if (!ok) throw new Error(`ASSERT_FAIL ${id}: ${detail}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitHealth(base, attempts = 400) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("server health timeout");
}

async function api(base, route, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, text, headers: res.headers };
}

function assertProdUntouched() {
  const after = { db: fingerprint(PROD_DB), env: fingerprint(PROD_ENV) };
  assert.deepEqual(after, prodBefore, "production db/env must stay untouched");
}

function seed() {
  const seedPath = path.join(temp, "seed.mjs");
  writeFileSync(
    seedPath,
    `import {
  createUser,
  updateUserRole,
  db,
} from ${JSON.stringify(path.join(serverDir, "src/db.js"))};
import { hashPasswordSync } from ${JSON.stringify(path.join(serverDir, "src/passwordHash.js"))};
import {
  explicitFullStaffPermissionsPayload,
  staffPermissionsPayload,
} from ${JSON.stringify(path.join(serverDir, "src/roles.js"))};

const passwordHash = hashPasswordSync(${JSON.stringify(oldPassword)}, 4);
const admin = createUser({
  email: "pwfix-admin@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
updateUserRole(admin.id, "admin");
db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run(
  JSON.stringify(explicitFullStaffPermissionsPayload(true)),
  admin.id
);

const restricted = createUser({
  email: "pwfix-restricted@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run(
  JSON.stringify(staffPermissionsPayload({ tabs: ["orders", "access"], manageStaff: false })),
  restricted.id
);

const client = createUser({
  email: "pwfix-client@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: {
    companyName: "PWFix Co",
    contactName: "Client One",
    phone: "+79990001122",
    email: "pwfix-client@test.local",
  },
});

const limited = createUser({
  email: "pwfix-limited@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: {
    companyName: "PWFix Limited",
    contactName: "Client Two",
    phone: "+79990003344",
    email: "pwfix-limited@test.local",
  },
});

const pending = createUser({
  email: "pwfix-pending@test.local",
  passwordHash,
  role: "client",
  emailVerified: false,
  approvalStatus: "pending",
  profile: {
    companyName: "PWFix Pending",
    contactName: "Client Three",
    phone: "+79990005566",
    email: "pwfix-pending@test.local",
  },
});

const unverified = createUser({
  email: "pwfix-unverified@test.local",
  passwordHash,
  role: "client",
  emailVerified: false,
  approvalStatus: "pending",
  profile: {
    companyName: "PWFix Unverified",
    contactName: "Client Four",
    phone: "+79990007788",
    email: "pwfix-unverified@test.local",
  },
});

const disabled = createUser({
  email: "pwfix-disabled@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: {
    companyName: "PWFix Disabled",
    contactName: "Client Five",
    phone: "+79990009900",
    email: "pwfix-disabled@test.local",
  },
});
db.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(new Date().toISOString(), disabled.id);

console.log(JSON.stringify({
  adminId: admin.id,
  restrictedId: restricted.id,
  clientId: client.id,
  limitedId: limited.id,
  pendingId: pending.id,
  unverifiedId: unverified.id,
  disabledId: disabled.id,
}));
`
  );
  const run = spawnSync(process.execPath, [seedPath], {
    cwd: serverDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DB_PATH: databasePath,
      JWT_SECRET: jwtSecret,
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
    },
  });
  if (run.status !== 0) {
    throw new Error(`seed failed: ${run.stderr || run.stdout}`);
  }
  return JSON.parse(String(run.stdout).trim().split("\n").pop());
}

function startServer(port) {
  const child = spawn(process.execPath, [path.join(serverDir, "src/server.js")], {
    cwd: serverDir,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      JWT_SECRET: jwtSecret,
      PORT: String(port),
      HOST: "127.0.0.1",
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      BACKUP_DIR: backupDir,
      SMTP_HOST: "",
      TELEGRAM_BOT_TOKEN: "",
      APP_PUBLIC_URL: `http://127.0.0.1:${port}`,
      ALLOW_DEV_AUTH_LINKS: "1",
      CABINET_PATH: "/lk",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    log += chunk.toString();
  });
  return {
    child,
    getLog: () => log,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode != null) {
          resolve();
          return;
        }
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.exitCode == null) child.kill("SIGKILL");
        }, 2000);
      }),
  };
}

function secretLeak(text, extras = []) {
  const hay = String(text || "");
  const needles = [oldPassword, newPassword, jwtSecret, ...extras];
  return needles.filter((item) => item && hay.includes(item));
}

function loginErrorSafe(json) {
  const error = String(json?.error || "");
  return (
    json?.code === "AUTH_INVALID_CREDENTIALS" &&
    error === "Неверная почта или пароль." &&
    !/существует|не найден|pwfix-/i.test(JSON.stringify(json))
  );
}

async function main() {
  const ids = seed();
  const port = await freePort();
  let runtime = startServer(port);
  const base = `http://127.0.0.1:${port}`;

  try {
    await waitHealth(base);

    const adminLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-admin@test.local", password: oldPassword },
    });
    note("admin.login", adminLogin.status === 200, `status=${adminLogin.status}`);
    const adminToken = adminLogin.json.token;

    const baselineLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-client@test.local", password: oldPassword },
    });
    note("client.old-password-before", baselineLogin.status === 200, `status=${baselineLogin.status}`);

    const unauth = await api(base, `/api/admin/clients/${ids.clientId}/password`, {
      method: "POST",
      body: { password: newPassword },
    });
    note("password.unauthenticated", unauth.status === 401, `status=${unauth.status}`);

    const restrictedLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-restricted@test.local", password: oldPassword },
    });
    const restrictedSet = await api(base, `/api/admin/clients/${ids.clientId}/password`, {
      method: "POST",
      token: restrictedLogin.json.token,
      body: { password: newPassword },
    });
    note(
      "password.restricted-no-clients-feature",
      restrictedSet.status === 403,
      `status=${restrictedSet.status}`
    );

    const clientSelf = await api(base, `/api/admin/clients/${ids.clientId}/password`, {
      method: "POST",
      token: baselineLogin.json.token,
      body: { password: newPassword },
    });
    note("password.client-forbidden", clientSelf.status === 403, `status=${clientSelf.status}`);

    const wrongClient = await api(base, `/api/admin/clients/${ids.adminId}/password`, {
      method: "POST",
      token: adminToken,
      body: { password: newPassword },
    });
    note(
      "password.wrong-role-target",
      wrongClient.status === 404,
      `status=${wrongClient.status}`
    );

    const setClient = await api(base, `/api/admin/clients/${ids.clientId}/password`, {
      method: "POST",
      token: adminToken,
      body: { password: newPassword },
    });
    note(
      "password.set.ok",
      setClient.status === 200 &&
        setClient.json?.ok === true &&
        setClient.json?.login === "pwfix-client@test.local" &&
        setClient.json?.temporaryPassword === newPassword &&
        !setClient.json?.access?.password &&
        !setClient.json?.user?.password_hash,
      `status=${setClient.status} login=${Boolean(setClient.json?.login)}`
    );
    note(
      "password.set.no-store",
      String(setClient.headers.get("cache-control") || "").includes("no-store"),
      String(setClient.headers.get("cache-control") || "")
    );

    const accessList = await api(base, "/api/admin/client-access", { token: adminToken });
    const accessItem = (accessList.json?.items || []).find(
      (item) => String(item.clientId) === String(ids.clientId)
    );
    note(
      "vault.login-matches-user",
      accessItem?.login === "pwfix-client@test.local" && accessItem?.hasPassword === true,
      `login-ok=${accessItem?.login === "pwfix-client@test.local"} hasPassword=${accessItem?.hasPassword}`
    );
    note(
      "vault.no-secret-fields",
      !(accessList.text || "").includes(newPassword) &&
        !(accessList.json?.items || []).some((item) => item?.password || item?.password_hash),
      "list omits plaintext/hash"
    );

    const newLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-client@test.local", password: newPassword },
    });
    note("client.new-password-works", newLogin.status === 200 && Boolean(newLogin.json?.token), `status=${newLogin.status}`);

    const oldLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-client@test.local", password: oldPassword },
    });
    note("client.old-password-rejected", oldLogin.status === 401 && loginErrorSafe(oldLogin.json), `status=${oldLogin.status}`);

    const unknownLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "nobody-pwfix@test.local", password: newPassword },
    });
    note(
      "login.unknown-email-generic",
      unknownLogin.status === 401 &&
        unknownLogin.json?.error === oldLogin.json?.error &&
        unknownLogin.json?.code === oldLogin.json?.code &&
        loginErrorSafe(unknownLogin.json),
      `status=${unknownLogin.status}`
    );

    const unverifiedWrong = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-unverified@test.local", password: "WrongAttempt!9" },
    });
    note(
      "login.unverified-wrong-password-generic",
      unverifiedWrong.status === 401 &&
        loginErrorSafe(unverifiedWrong.json) &&
        unverifiedWrong.json?.error === unknownLogin.json?.error,
      `status=${unverifiedWrong.status} code=${unverifiedWrong.json?.code || ""}`
    );
    const unverifiedOk = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-unverified@test.local", password: oldPassword },
    });
    note(
      "login.unverified-correct-password-403",
      unverifiedOk.status === 403 && unverifiedOk.json?.code === "EMAIL_NOT_VERIFIED",
      `status=${unverifiedOk.status} code=${unverifiedOk.json?.code || ""}`
    );

    const disabledWrong = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-disabled@test.local", password: "WrongAttempt!9" },
    });
    note(
      "login.disabled-wrong-password-generic",
      disabledWrong.status === 401 && loginErrorSafe(disabledWrong.json),
      `status=${disabledWrong.status} code=${disabledWrong.json?.code || ""}`
    );
    const disabledOk = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-disabled@test.local", password: oldPassword },
    });
    note(
      "login.disabled-correct-password-403",
      disabledOk.status === 403 && disabledOk.json?.code === "ACCOUNT_DISABLED",
      `status=${disabledOk.status} code=${disabledOk.json?.code || ""}`
    );

    const phoneLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "+79990001122", password: newPassword },
    });
    note(
      "login.phone-not-accepted",
      phoneLogin.status === 400 &&
        !/существует|не найден|pwfix-client/i.test(phoneLogin.text || ""),
      `status=${phoneLogin.status}`
    );

    const pendingSet = await api(base, `/api/admin/clients/${ids.pendingId}/password`, {
      method: "POST",
      token: adminToken,
      body: { password: newPassword },
    });
    note("pending.set.ok", pendingSet.status === 200, `status=${pendingSet.status}`);
    const pendingLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-pending@test.local", password: newPassword },
    });
    note(
      "pending.new-password-approved",
      pendingLogin.status === 200,
      `status=${pendingLogin.status}`
    );

    for (let i = 0; i < 21; i += 1) {
      await api(base, "/api/auth/login", {
        method: "POST",
        body: { email: "pwfix-limited@test.local", password: "WrongAttempt!9" },
      });
    }
    const limitedBlocked = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-limited@test.local", password: oldPassword },
    });
    note(
      "ratelimit.old-password-blocked",
      limitedBlocked.status === 429 &&
        limitedBlocked.json?.code === "AUTH_RATE_LIMITED" &&
        limitedBlocked.json?.error === "Слишком много попыток. Попробуйте позже.",
      `status=${limitedBlocked.status} code=${limitedBlocked.json?.code || ""}`
    );
    const retryAfter = Number(limitedBlocked.headers.get("retry-after"));
    note(
      "ratelimit.retry-after-from-window",
      Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 600,
      `retryAfter=${limitedBlocked.headers.get("retry-after") || ""}`
    );
    note(
      "ratelimit.message-has-no-invented-time",
      !/\d+\s*(мин|сек|minute|second)/i.test(String(limitedBlocked.json?.error || "")),
      String(limitedBlocked.json?.error || "")
    );

    const unauthWhileLimited = await api(base, `/api/admin/clients/${ids.limitedId}/password`, {
      method: "POST",
      body: { password: newPassword },
    });
    note("ratelimit.unauth-does-not-clear", unauthWhileLimited.status === 401, `status=${unauthWhileLimited.status}`);
    const stillLimitedAfter401 = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-limited@test.local", password: oldPassword },
    });
    note("ratelimit.still-429-after-unauth", stillLimitedAfter401.status === 429, `status=${stillLimitedAfter401.status}`);

    const forbiddenWhileLimited = await api(base, `/api/admin/clients/${ids.limitedId}/password`, {
      method: "POST",
      token: restrictedLogin.json.token,
      body: { password: newPassword },
    });
    note("ratelimit.forbidden-does-not-clear", forbiddenWhileLimited.status === 403, `status=${forbiddenWhileLimited.status}`);
    const stillLimitedAfter403 = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-limited@test.local", password: oldPassword },
    });
    note("ratelimit.still-429-after-403", stillLimitedAfter403.status === 429, `status=${stillLimitedAfter403.status}`);

    const invalidWhileLimited = await api(base, `/api/admin/clients/${ids.limitedId}/password`, {
      method: "POST",
      token: adminToken,
      body: { password: "x" },
    });
    note("ratelimit.validation-does-not-clear", invalidWhileLimited.status === 400, `status=${invalidWhileLimited.status}`);
    const stillLimitedAfter400 = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-limited@test.local", password: oldPassword },
    });
    note("ratelimit.still-429-after-validation", stillLimitedAfter400.status === 429, `status=${stillLimitedAfter400.status}`);

    const forgotWhileLimited = await api(base, "/api/auth/forgot-password", {
      method: "POST",
      body: { email: "pwfix-limited@test.local" },
    });
    note("ratelimit.forgot-does-not-bypass", forgotWhileLimited.status === 200, `status=${forgotWhileLimited.status}`);
    const stillLimitedAfterForgot = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-limited@test.local", password: oldPassword },
    });
    note("ratelimit.still-429-after-forgot", stillLimitedAfterForgot.status === 429, `status=${stillLimitedAfterForgot.status}`);

    const otherAccountLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-client@test.local", password: newPassword },
    });
    note(
      "ratelimit.other-account-untouched",
      otherAccountLogin.status === 200 && stillLimitedAfterForgot.status === 429,
      `other=${otherAccountLogin.status} limited=${stillLimitedAfterForgot.status}`
    );

    const limitedSet = await api(base, `/api/admin/clients/${ids.limitedId}/password`, {
      method: "POST",
      token: adminToken,
      body: { password: newPassword },
    });
    note("ratelimit.set.ok", limitedSet.status === 200, `status=${limitedSet.status}`);
    note(
      "password.set.warnings-have-no-secrets",
      (limitedSet.json?.warnings || []).every((item) =>
        ["AUDIT_WRITE_FAILED", "ACCESS_VAULT_UPDATE_FAILED"].includes(String(item))
      ) &&
        !secretLeak(JSON.stringify(limitedSet.json?.warnings || [])).length &&
        !(limitedSet.json?.access && (limitedSet.json.access.password || limitedSet.json.access.password_hash)),
      `warnings=${JSON.stringify(limitedSet.json?.warnings || [])}`
    );
    const limitedNew = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-limited@test.local", password: newPassword },
    });
    note(
      "ratelimit.unlocked-after-admin-reset",
      limitedNew.status === 200 && Boolean(limitedNew.json?.token),
      `status=${limitedNew.status}`
    );
    const limitedOld = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-limited@test.local", password: oldPassword },
    });
    note("ratelimit.old-still-rejected", limitedOld.status === 401, `status=${limitedOld.status}`);

    const migrate = await api(base, "/api/migrate/client", {
      method: "POST",
      token: limitedNew.json.token,
      body: {
        profile: {
          companyName: "Imported Name",
          email: "imported-login@test.local",
        },
      },
    });
    note("migrate.ok", migrate.status === 200, `status=${migrate.status}`);
    const boot = await api(base, "/api/bootstrap", { token: limitedNew.json.token });
    note(
      "migrate.cannot-steal-login",
      boot.json?.profile?.email === "pwfix-limited@test.local",
      `profileEmailKept=${boot.json?.profile?.email === "pwfix-limited@test.local"}`
    );

    const clients = await api(base, "/api/admin/client-access", { token: adminToken });
    const listed = (clients.json?.items || []).find(
      (item) => String(item.clientId) === String(ids.limitedId)
    );
    note(
      "list.login-is-users-email",
      listed?.login === "pwfix-limited@test.local" && listed?.email === "pwfix-limited@test.local",
      `login-match=${listed?.login === "pwfix-limited@test.local"}`
    );

    await runtime.stop();
    runtime = startServer(port);
    await waitHealth(base);
    const afterRestart = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-client@test.local", password: newPassword },
    });
    note(
      "persist.new-password-after-restart",
      afterRestart.status === 200,
      `status=${afterRestart.status}`
    );
    const afterRestartOld = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "pwfix-client@test.local", password: oldPassword },
    });
    note(
      "persist.old-password-after-restart",
      afterRestartOld.status === 401,
      `status=${afterRestartOld.status}`
    );

    const sqlite = require("node:sqlite");
    const db = new sqlite.DatabaseSync(databasePath, { readOnly: true });
    try {
      const row = db
        .prepare("SELECT password_hash FROM users WHERE email = ?")
        .get("pwfix-client@test.local");
      note(
        "db.hash-usable-not-double",
        Boolean(row?.password_hash?.startsWith("$2")) &&
          !String(row.password_hash).startsWith("!"),
        "bcrypt stored"
      );
    } finally {
      db.close();
    }

    const leaked = secretLeak(runtime.getLog());
    note("logs.no-secrets", leaked.length === 0, leaked.length ? "secret substring present" : "clean");

    assertProdUntouched();
    note("prod.untouched", true, "production db/env fingerprints unchanged");
    console.log("verify-admin-client-password-login: ok");
  } finally {
    await runtime.stop();
    rmSync(temp, { recursive: true, force: true });
    assertProdUntouched();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
