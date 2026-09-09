import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");

function rejectSensitivePath(candidate, workRoot) {
  const resolved = path.resolve(candidate);
  const worktreeData = path.resolve(workRoot, "server/data");
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
  if (resolved === worktreeData || resolved.startsWith(`${worktreeData}${path.sep}`)) {
    throw new Error(`Refusing worktree DB path: ${resolved}`);
  }
}

function listenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function snapshotStore(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    const settingsRow = db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("localizationSettings");
    const settings = settingsRow ? JSON.parse(settingsRow.value_json) : {};
    const values = db
      .prepare(
        `SELECT entry_id, language_code, value, state, source_hash, updated_at, updated_by
         FROM translation_values
         ORDER BY entry_id, language_code`
      )
      .all();
    return {
      catalogVersion: Number(settings.catalogVersion || 0),
      settings,
      values,
    };
  } finally {
    db.close();
  }
}

function insertUsers(dbPath, users) {
  const db = new DatabaseSync(dbPath);
  try {
    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO users(
         id, email, password_hash, role, created_at,
         email_verified, approval_status, password_changed_at, last_login_at,
         disabled_at, permissions_json
       ) VALUES (?, ?, ?, ?, ?, 1, 'approved', '', '', '', ?)`
    );
    for (const user of users) {
      insert.run(
        user.id,
        user.email,
        user.passwordHash,
        user.role,
        now,
        JSON.stringify(user.permissions || {})
      );
    }
  } finally {
    db.close();
  }
}

function pickEntry(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    return db
      .prepare(
        `SELECT id, field_key, source_ru
         FROM translation_entries
         WHERE namespace = 'ui' AND field_key = 'shared.modal.confirmTitle'
         LIMIT 1`
      )
      .get();
  } finally {
    db.close();
  }
}

function pickPlaceholderEntry(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    return db
      .prepare(
        `SELECT id, field_key, source_ru
         FROM translation_entries
         WHERE namespace = 'ui' AND source_ru LIKE '%{count}%'
         LIMIT 1`
      )
      .get();
  } finally {
    db.close();
  }
}

async function waitForListen(child, timeoutMs = 45000) {
  const started = Date.now();
  let output = "";
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      output += String(chunk);
      if (/запущен/i.test(output) || /API: http:\/\//.test(output)) {
        cleanup();
        resolve(output);
      }
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`isolated server exited ${code}: ${output.slice(-2000)}`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`isolated server did not start in time: ${output.slice(-2000)}`));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.off("exit", onExit);
    }
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", onExit);
    void started;
  });
}

async function httpJson(baseUrl, method, route, { token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json, text };
}

export async function runTranslationAuthHttpTest({ workRoot }) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "clover-stage31-http-"));
  const dbPath = path.join(tempDir, "clover.sqlite");
  const backupDir = path.join(tempDir, "backups");
  const uploadDir = path.join(tempDir, "uploads");
  mkdirSync(backupDir, { recursive: true });
  mkdirSync(uploadDir, { recursive: true });
  rejectSensitivePath(dbPath, workRoot);
  rejectSensitivePath(backupDir, workRoot);

  const jwtSecret = `stage31-http-auth-test-secret-${randomUUID()}`;
  assert.equal(jwtSecret.length >= 32, true);
  const port = await listenPort();
  const host = "127.0.0.1";
  const baseUrl = `http://${host}:${port}`;

  const childEnv = {
    PATH: process.env.PATH,
    HOME: tempDir,
    NODE_ENV: "test",
    DB_PATH: dbPath,
    JWT_SECRET: jwtSecret,
    HOST: host,
    PORT: String(port),
    CLOVER_SERVER_BACKUP_DIR: backupDir,
    CLOVER_UPLOADS_DIR: uploadDir,
    APP_PUBLIC_URL: baseUrl,
    ALLOW_LAN_ORIGINS: "false",
    ONEC_PROD_EXCHANGE_ENABLED: "false",
    ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
    ONEC_API_KEY: "",
    SMTP_HOST: "",
    SMTP_PORT: "",
    SMTP_USER: "",
    SMTP_PASS: "",
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_CHAT_ID: "",
    MANAGER_EMAIL: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    NO_PROXY: "*",
  };

  const child = spawn(process.execPath, [path.join(workRoot, "server/src/server.js")], {
    cwd: tempDir,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let startupLog = "";
  try {
    startupLog = await waitForListen(child);
    if (/ECONNREFUSED|getaddrinfo|ENOTFOUND|api\.telegram|1c|smtp/i.test(startupLog) && /error|fail|unable/i.test(startupLog)) {
      throw new Error(`isolated server startup contacted external integration: ${startupLog.slice(-1500)}`);
    }

    const passwordHash = bcrypt.hashSync("stage31-http-pass", 8);
    const users = [
      { id: randomUUID(), email: "admin-http@clover.test", role: "admin", passwordHash, permissions: {} },
      { id: randomUUID(), email: "manager-http@clover.test", role: "manager", passwordHash, permissions: {} },
      {
        id: randomUUID(),
        email: "manager-full-http@clover.test",
        role: "manager",
        passwordHash,
        permissions: { fullAccess: true },
      },
      { id: randomUUID(), email: "client-http@clover.test", role: "client", passwordHash, permissions: {} },
    ];
    insertUsers(dbPath, users);

    const tokenFor = (user) =>
      jwt.sign(
        {
          sub: user.id,
          role: user.role,
          email: user.email,
          sessionEpoch: "",
        },
        jwtSecret,
        { expiresIn: "1h", issuer: "clover-server", audience: "clover-app" }
      );

    const tokens = {
      admin: tokenFor(users[0]),
      manager: tokenFor(users[1]),
      managerFull: tokenFor(users[2]),
      client: tokenFor(users[3]),
    };

    const health = await httpJson(baseUrl, "GET", "/api/health");
    assert.equal(health.status < 500, true, `health failed: ${health.status}`);

    const entry = pickEntry(dbPath);
    assert.ok(entry?.id, "seeded translation entry missing");
    const placeholderEntry = pickPlaceholderEntry(dbPath);
    assert.ok(placeholderEntry?.id, "placeholder entry missing");

    const routes = [
      ["GET", "/api/admin/localization"],
      ["PUT", "/api/admin/localization", { enabledLanguages: ["ru"] }],
      ["GET", "/api/admin/translations?language=en&view=interface"],
      ["PUT", `/api/admin/translations/${entry.id}/en`, { value: "Confirm action" }],
      ["POST", `/api/admin/translations/${entry.id}/en/reset-auto`, {}],
    ];

    const adminGet = await httpJson(baseUrl, "GET", "/api/admin/localization", { token: tokens.admin });
    assert.equal(adminGet.status, 200, `admin GET localization ${adminGet.status} ${adminGet.text}`);
    assert.ok(adminGet.json?.settings, "admin localization payload missing settings");

    const adminList = await httpJson(baseUrl, "GET", "/api/admin/translations?language=en&view=interface", {
      token: tokens.admin,
    });
    assert.equal(adminList.status, 200, `admin GET translations ${adminList.status}`);
    assert.equal(Array.isArray(adminList.json?.rows), true);

    const deniedActors = [
      ["manager", tokens.manager],
      ["managerFull", tokens.managerFull],
      ["client", tokens.client],
      ["unauthenticated", ""],
    ];
    for (const [name, token] of deniedActors) {
      const before = snapshotStore(dbPath);
      for (const [method, route, body] of routes) {
        const result = await httpJson(baseUrl, method, route, {
          token: token || undefined,
          body: method === "GET" ? undefined : body,
        });
        const expected = name === "unauthenticated" ? 401 : 403;
        assert.equal(
          result.status,
          expected,
          `${name} ${method} ${route} expected ${expected} got ${result.status} ${result.text}`
        );
      }
      const after = snapshotStore(dbPath);
      assert.equal(after.catalogVersion, before.catalogVersion, `${name} mutated catalogVersion`);
      assert.deepEqual(after.settings, before.settings, `${name} mutated localizationSettings`);
      assert.deepEqual(after.values, before.values, `${name} mutated translation rows`);
    }

    const beforeReject = snapshotStore(dbPath);
    const invalidLocale = await httpJson(baseUrl, "PUT", `/api/admin/translations/${entry.id}/fr`, {
      token: tokens.admin,
      body: { value: "Bonjour" },
    });
    assert.equal(invalidLocale.status, 400, `invalid locale ${invalidLocale.status} ${invalidLocale.text}`);

    const ruTarget = await httpJson(baseUrl, "PUT", `/api/admin/translations/${entry.id}/ru`, {
      token: tokens.admin,
      body: { value: "Подтвердите действие" },
    });
    assert.equal(ruTarget.status, 400, `RU target ${ruTarget.status} ${ruTarget.text}`);

    const unknownEntry = await httpJson(baseUrl, "PUT", `/api/admin/translations/${randomUUID()}/en`, {
      token: tokens.admin,
      body: { value: "Missing" },
    });
    assert.equal(unknownEntry.status, 404, `unknown entry ${unknownEntry.status} ${unknownEntry.text}`);

    const placeholderMismatch = await httpJson(
      baseUrl,
      "PUT",
      `/api/admin/translations/${placeholderEntry.id}/en`,
      {
        token: tokens.admin,
        body: { value: "Broken without placeholder" },
      }
    );
    assert.equal(
      placeholderMismatch.status,
      400,
      `placeholder mismatch ${placeholderMismatch.status} ${placeholderMismatch.text}`
    );

    const afterReject = snapshotStore(dbPath);
    assert.equal(afterReject.catalogVersion, beforeReject.catalogVersion, "rejected mutation changed catalogVersion");
    assert.deepEqual(afterReject.settings, beforeReject.settings, "rejected mutation changed settings");
    assert.deepEqual(afterReject.values, beforeReject.values, "rejected mutation changed rows");

    const adminSave = await httpJson(baseUrl, "PUT", `/api/admin/translations/${entry.id}/en`, {
      token: tokens.admin,
      body: { value: "Confirm action HTTP" },
    });
    assert.equal(adminSave.status, 200, `admin save ${adminSave.status} ${adminSave.text}`);
    assert.equal(adminSave.json?.ok, true);

    return {
      host,
      port,
      tempDir,
      startupLog,
    };
  } finally {
    if (child.pid && !child.killed) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          resolve();
        }, 3000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function isDirectExecution() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectExecution()) {
  const workRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  runTranslationAuthHttpTest({ workRoot })
    .then((result) => {
      assert.equal(result.host, "127.0.0.1");
      assert.equal(Number.isInteger(result.port) && result.port > 0, true);
      console.log("i18n-stage31-http-auth: ok");
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
