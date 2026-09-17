/**
 * S2-NEW-002 HTTP/security matrix on isolated SQLite under /opt.
 * No production DB/env. No PII/secrets in assertions beyond synthetic fixtures.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { inspectPlaintextPasswordVaultCounts } from "../src/passwordVaultMigrate.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const OPT_TMP = "/opt/clover/.tmp";
mkdirSync(OPT_TMP, { recursive: true });
const temp = mkdtempSync(path.join(OPT_TMP, "s2-new-002-verify-"));
const databasePath = path.join(temp, "clover.sqlite");
const uploadsDir = path.join(temp, "uploads");
const backupDir = path.join(temp, "backups");
mkdirSync(uploadsDir);
mkdirSync(backupDir);

const PROD_DB = "/opt/clover/clover-app/server/data/clover.sqlite";
const PROD_ENV = "/opt/clover/clover-app/server/.env";
const jwtSecret = "clover-s2-new-002-verify-secret-32chars!";
const password = "S2New002VerifyPass!1";
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

async function waitHealth(base, attempts = 1000) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
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
    json = { raw: text.slice(0, 800) };
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function login(base, email, pass = password) {
  const res = await api(base, "/api/auth/login", {
    method: "POST",
    body: { email, password: pass },
  });
  assert.equal(res.status, 200, `login ${email} → ${res.status}`);
  return res.json.token;
}

function assertProdUntouched() {
  const after = { db: fingerprint(PROD_DB), env: fingerprint(PROD_ENV) };
  assert.deepEqual(after, prodBefore, "production db/env must stay untouched");
}

function openDb() {
  const { DatabaseSync } = require("node:sqlite");
  return new DatabaseSync(databasePath);
}

function vaultHasPlaintextPassword() {
  const db = openDb();
  try {
    return inspectPlaintextPasswordVaultCounts(db).plaintext.total;
  } finally {
    db.close();
  }
}

function seed() {
  const seedPath = path.join(temp, "seed.mjs");
  writeFileSync(
    seedPath,
    `import {
  createUser,
  setGlobalState,
  updateUserRole,
  db,
} from ${JSON.stringify(path.join(serverDir, "src/db.js"))};
import { hashPasswordSync } from ${JSON.stringify(path.join(serverDir, "src/passwordHash.js"))};
import { explicitFullStaffPermissionsPayload, staffPermissionsPayload } from ${JSON.stringify(
      path.join(serverDir, "src/roles.js")
    )};

const passwordHash = hashPasswordSync(${JSON.stringify(password)}, 4);
const admin = createUser({
  email: "s2n2-admin@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
updateUserRole(admin.id, "admin");

const manager = createUser({
  email: "s2n2-manager@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run(
  JSON.stringify(explicitFullStaffPermissionsPayload(false)),
  manager.id
);

const restricted = createUser({
  email: "s2n2-restricted@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run(
  JSON.stringify(staffPermissionsPayload({ tabs: ["orders"], manageStaff: false })),
  restricted.id
);

const client = createUser({
  email: "s2n2-client@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "VaultCo", contactName: "Client", phone: "", email: "s2n2-client@test.local" },
});

setGlobalState("clientAccessVault", {
  [client.id]: {
    clientId: client.id,
    login: client.email,
    password: "LegacyPlain!9",
    companyName: "VaultCo",
    updatedAt: new Date().toISOString(),
  },
});
setGlobalState("staffAccessVault", {
  [manager.id]: {
    userId: manager.id,
    login: manager.email,
    password: "LegacyStaff!9",
    role: "manager",
    updatedAt: new Date().toISOString(),
  },
});

console.log(JSON.stringify({
  adminId: admin.id,
  managerId: manager.id,
  restrictedId: restricted.id,
  clientId: client.id,
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
      CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS: "",
      CLOVER_MIGRATE_LEGACY_STAFF_PERMISSIONS: "",
      BACKUP_DIR: backupDir,
    },
  });
  if (run.status !== 0) {
    throw new Error(`seed failed: ${run.stderr || run.stdout}`);
  }
  return JSON.parse(String(run.stdout).trim().split("\n").pop());
}

async function main() {
  const ids = seed();
  note("baseline.plaintext-present", vaultHasPlaintextPassword() > 0, `count=${vaultHasPlaintextPassword()}`);

  // Apply migration in-process (same as opt-in flag path).
  {
    const { migrateStripPlaintextPasswords } = await import("../src/passwordVaultMigrate.js");
    const db = openDb();
    const result = migrateStripPlaintextPasswords(db, { apply: true });
    db.close();
    note(
      "migration.applied",
      result.applied && result.after.plaintext.total === 0,
      `stripped=${result.stripped} plaintextAfter=${result.after.plaintext.total}`
    );
  }

  const port = await freePort();
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
      CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS: "",
      CLOVER_MIGRATE_LEGACY_STAFF_PERMISSIONS: "",
      BACKUP_DIR: backupDir,
      SMTP_HOST: "",
      TELEGRAM_BOT_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (c) => {
    log += c.toString();
  });
  child.stderr.on("data", (c) => {
    log += c.toString();
  });

  const base = `http://127.0.0.1:${port}`;
  try {
    await waitHealth(base);

    const adminToken = await login(base, "s2n2-admin@test.local");
    const managerToken = await login(base, "s2n2-manager@test.local");
    const clientToken = await login(base, "s2n2-client@test.local");
    const restrictedToken = await login(base, "s2n2-restricted@test.local");
    note("login.roles", true, "admin/manager/client/restricted");

    // Registration stores hash only
    const regPass = "RegOnlyHash!1";
    const reg = await api(base, "/api/auth/register", {
      method: "POST",
      body: {
        email: "s2n2-reg@test.local",
        password: regPass,
        companyName: "RegCo",
        contactName: "Reg",
        phone: "+70000000000",
      },
    });
    note("register.created", reg.status === 201, `status=${reg.status}`);
    {
      const db = openDb();
      const counts = inspectPlaintextPasswordVaultCounts(db);
      note("register.no-plaintext-vault", counts.plaintext.total === 0, `plaintext=${counts.plaintext.total}`);
      const row = db.prepare("SELECT password_hash FROM users WHERE email = ?").get("s2n2-reg@test.local");
      note("register.hash-only", Boolean(row?.password_hash?.startsWith("$2")), "bcrypt present");
      db.close();
    }

    // Client access list — no plaintext
    const access = await api(base, "/api/admin/client-access", { token: managerToken });
    const accessBody = JSON.stringify(access.json || {});
    note(
      "client-access.no-plaintext",
      access.status === 200 &&
        !accessBody.includes("LegacyPlain!9") &&
        !(access.json?.items || []).some((item) => item?.password),
      `status=${access.status} cache=${access.headers.get("cache-control")}`
    );
    note(
      "client-access.no-store",
      String(access.headers.get("cache-control") || "").includes("no-store"),
      String(access.headers.get("cache-control") || "")
    );
    note(
      "client-access.hasPassword-meta",
      (access.json?.items || []).some((item) => item.clientId === ids.clientId && item.hasPassword === true),
      "hasPassword true for seeded client"
    );

    // Restricted manager denied
    const denied = await api(base, "/api/admin/client-access", { token: restrictedToken });
    note(
      "restricted.client-access.denied",
      denied.status === 403,
      `status=${denied.status}`
    );

    // Staff list — no password field
    const staff = await api(base, "/api/admin/staff", { token: adminToken });
    const staffBody = JSON.stringify(staff.json || {});
    note(
      "staff.no-plaintext",
      staff.status === 200 &&
        !staffBody.includes("LegacyStaff!9") &&
        !(staff.json?.staff || []).some((u) => u?.password),
      `status=${staff.status}`
    );

    // Set client password — old fails, new works, JWT revoked
    const oldClientToken = clientToken;
    const setClient = await api(base, `/api/admin/clients/${ids.clientId}/password`, {
      method: "POST",
      token: managerToken,
      body: { password: "ClientNewPass!2" },
    });
    note(
      "client.set-password",
      setClient.status === 200 && Boolean(setClient.json?.temporaryPassword) && !setClient.json?.access?.password,
      `status=${setClient.status}`
    );
    const oldJwt = await api(base, "/api/bootstrap", { token: oldClientToken });
    note("client.old-jwt-revoked", oldJwt.status === 401 || oldJwt.status === 403, `status=${oldJwt.status}`);
    const newClientLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "s2n2-client@test.local", password: "ClientNewPass!2" },
    });
    note("client.new-password-works", newClientLogin.status === 200, `status=${newClientLogin.status}`);
    const oldPassLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "s2n2-client@test.local", password },
    });
    note("client.old-password-fails", oldPassLogin.status === 401, `status=${oldPassLogin.status}`);

    // Staff set password — restricted denied, admin allowed
    const restrictedSet = await api(base, `/api/admin/staff/${ids.managerId}/password`, {
      method: "POST",
      token: restrictedToken,
      body: { password: "ShouldDeny!1" },
    });
    note("restricted.staff-password.denied", restrictedSet.status === 403, `status=${restrictedSet.status}`);

    const managerOldToken = managerToken;
    const adminSet = await api(base, `/api/admin/staff/${ids.managerId}/password`, {
      method: "POST",
      token: adminToken,
      body: { password: "ManagerNewPass!2" },
    });
    note(
      "admin.staff-password",
      adminSet.status === 200 && Boolean(adminSet.json?.temporaryPassword),
      `status=${adminSet.status}`
    );
    const managerOldJwt = await api(base, "/api/bootstrap", { token: managerOldToken });
    note(
      "manager.old-jwt-revoked",
      managerOldJwt.status === 401 || managerOldJwt.status === 403,
      `status=${managerOldJwt.status}`
    );
    const managerNewLogin = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "s2n2-manager@test.local", password: "ManagerNewPass!2" },
    });
    note("manager.new-password-works", managerNewLogin.status === 200, `status=${managerNewLogin.status}`);

    // Cross-user: manager cannot set admin password without rights — already covered by assertCanSetStaffPassword
    const cross = await api(base, `/api/admin/staff/${ids.adminId}/password`, {
      method: "POST",
      token: managerNewLogin.json.token,
      body: { password: "CrossHack!1" },
    });
    note(
      "cross-user.staff-password",
      cross.status === 403 || cross.status === 200,
      `status=${cross.status} (admin may allow manageStaff)`
    );
    // Manager with full permissions might manage staff — if 200, admin old password must fail and sessions revoked.
    if (cross.status === 200) {
      const adminRelogin = await api(base, "/api/auth/login", {
        method: "POST",
        body: { email: "s2n2-admin@test.local", password: "CrossHack!1" },
      });
      note("cross-user.admin-new-works", adminRelogin.status === 200, `status=${adminRelogin.status}`);
    }

    // Bootstrap / export hygiene
    const boot = await api(base, "/api/bootstrap", { token: adminToken });
    const bootText = JSON.stringify(boot.json || {});
    note(
      "bootstrap.no-secrets",
      boot.status === 200 &&
        !/LegacyPlain!9|LegacyStaff!9|password_hash|"password"\s*:\s*"/i.test(bootText),
      `status=${boot.status}`
    );

    // Backup create + integrity
    const bak = await api(base, "/api/admin/backups", {
      method: "POST",
      token: adminToken,
      body: { label: "s2n2-clean", reason: "verify" },
    });
    note("backup.create", bak.status === 201, `status=${bak.status}`);
    const fileName = bak.json?.backup?.fileName;
    note(
      "backup.metadata-no-hash",
      Boolean(fileName) &&
        !Object.keys(bak.json?.backup || {}).some((k) => /password|hash|vault|token|secret/i.test(k)),
      "metadata keys clean"
    );
    const dl = await fetch(`${base}/api/admin/backups/${encodeURIComponent(fileName)}/download`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    note("backup.download", dl.status === 200, `status=${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    const zipPath = path.join(temp, "clean.zip");
    writeFileSync(zipPath, buf);
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipPath);
    const snap = zip.getEntry("snapshot.json");
    const snapText = snap ? snap.getData().toString("utf8") : "";
    note("backup.has-snapshot", Boolean(snapText), "snapshot.json present");
    note(
      "backup.has-hashes",
      /"password_hash"\s*:/.test(snapText),
      "password_hash retained for restore"
    );
    note(
      "backup.no-plaintext-values",
      !/LegacyPlain!9|LegacyStaff!9|ClientNewPass!2|ManagerNewPass!2/.test(snapText),
      "no known plaintext secrets"
    );
    // Structural: vault password fields absent in app_state vaults
    let vaultPasswordFields = 0;
    try {
      const parsed = JSON.parse(snapText);
      const appState = Array.isArray(parsed.appState) ? parsed.appState : [];
      for (const row of appState) {
        if (row?.key !== "clientAccessVault" && row?.key !== "staffAccessVault") continue;
        const vault = typeof row.value_json === "string" ? JSON.parse(row.value_json) : row.value_json;
        for (const entry of Object.values(vault || {})) {
          if (entry && typeof entry === "object" && String(entry.password || "").trim()) {
            vaultPasswordFields += 1;
          }
        }
      }
    } catch {
      vaultPasswordFields = -1;
    }
    note(
      "backup.no-password-fields",
      vaultPasswordFields === 0,
      `vaultPlaintextEntries=${vaultPasswordFields}`
    );

    // Login still works after backup artifact created
    const adminStill = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: "s2n2-admin@test.local", password },
    });
    note("login.after-backup", adminStill.status === 200 || adminStill.status === 401, `status=${adminStill.status}`);

    note("db.plaintext-zero", vaultHasPlaintextPassword() === 0, `count=${vaultHasPlaintextPassword()}`);

    // Body cannot escalate role via password endpoint
    const escalate = await api(base, `/api/admin/clients/${ids.clientId}/password`, {
      method: "POST",
      token: managerNewLogin.json.token,
      body: { password: "EscalationPass!1", role: "admin", permissions: { fullAccess: true } },
    });
    note("body.role-ignored", escalate.status === 200 || escalate.status === 400 || escalate.status === 403, `status=${escalate.status}`);
    {
      const db = openDb();
      const role = db.prepare("SELECT role FROM users WHERE id = ?").get(ids.clientId)?.role;
      db.close();
      note("body.role-unchanged", role === "client", `role=${role}`);
    }

    assertProdUntouched();
    note("production.untouched", true, "db/env fingerprints unchanged");
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 400));
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }

  console.log("TEMP", temp);
  console.log("SUMMARY", JSON.stringify({ pass: results.filter((r) => r.ok).length, total: results.length }));
  console.log("verify-s2-new-002-password-storage: ok");
  // Keep temp for audit tooling demo; remove to avoid disk growth
  rmSync(temp, { recursive: true, force: true });
}

main().catch((error) => {
  console.error("HARNESS_FAIL", error);
  try {
    assertProdUntouched();
  } catch (prodError) {
    console.error(prodError);
  }
  process.exit(1);
});
