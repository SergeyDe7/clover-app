/**
 * Stage 4 HTTP auth: actual admin product/glossary routes on a TEMP runtime.
 * Unauthenticated 401, client/manager 403, admin allowed. No production login.
 */
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
import { sourceHash } from "../../src/shared/i18n/sourceHash.js";

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
      insert.run(user.id, user.email, user.passwordHash, user.role, now, JSON.stringify(user.permissions || {}));
    }
  } finally {
    db.close();
  }
}

function firstProduct(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("products");
    const products = JSON.parse(row.value_json);
    return products[0];
  } finally {
    db.close();
  }
}

function listAuditActions(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    if (
      !db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'audit_log'").get() &&
      !db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'audit'").get()
    ) {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
      return { tables, rows: [] };
    }
    const table = db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'audit_log'").get()
      ? "audit_log"
      : "audit";
    return { tables: [table], rows: db.prepare(`SELECT action, details_json FROM ${table} ORDER BY rowid`).all() };
  } finally {
    db.close();
  }
}

async function waitForListen(child, timeoutMs = 45000) {
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
  });
}

async function httpJson(baseUrl, method, route, { token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
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

export async function runStage4AuthHttpTest({ workRoot }) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "clover-stage4-http-"));
  const dbPath = path.join(tempDir, "clover.sqlite");
  const backupDir = path.join(tempDir, "backups");
  const uploadDir = path.join(tempDir, "uploads");
  mkdirSync(backupDir, { recursive: true });
  mkdirSync(uploadDir, { recursive: true });
  rejectSensitivePath(dbPath, workRoot);
  rejectSensitivePath(backupDir, workRoot);

  const jwtSecret = `stage4-http-auth-test-secret-${randomUUID()}`;
  const port = await listenPort();
  const host = "127.0.0.1";
  const baseUrl = `http://${host}:${port}`;
  const child = spawn(process.execPath, [path.join(workRoot, "server/src/server.js")], {
    cwd: tempDir,
    env: {
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForListen(child);
    const passwordHash = bcrypt.hashSync("stage4-http-pass", 8);
    const users = [
      { id: randomUUID(), email: "admin-s4@clover.test", role: "admin", passwordHash, permissions: {} },
      { id: randomUUID(), email: "manager-s4@clover.test", role: "manager", passwordHash, permissions: {} },
      { id: randomUUID(), email: "client-s4@clover.test", role: "client", passwordHash, permissions: {} },
    ];
    insertUsers(dbPath, users);
    const tokenFor = (user) =>
      jwt.sign(
        { sub: user.id, role: user.role, email: user.email, sessionEpoch: "" },
        jwtSecret,
        { expiresIn: "1h", issuer: "clover-server", audience: "clover-app" }
      );
    const tokens = {
      admin: tokenFor(users[0]),
      manager: tokenFor(users[1]),
      client: tokenFor(users[2]),
    };
    const product = firstProduct(dbPath);
    assert.ok(product?.id, "default product missing");
    const productId = String(product.id);
    const nameHash = sourceHash(product.name);
    const routes = [
      ["GET", `/api/admin/product-translations/${productId}`],
      [
        "PUT",
        `/api/admin/product-translations/${productId}/en/name`,
        { value: `${product.name} EN`, expectedSourceHash: nameHash },
      ],
      [
        "POST",
        `/api/admin/product-translations/${productId}/en/name/reset-auto`,
        { expectedSourceHash: nameHash },
      ],
      ["GET", "/api/admin/glossary?language=en"],
      ["PUT", "/api/admin/glossary", { sourceRu: "стакан", language: "en", targetValue: "cup", context: "" }],
      ["DELETE", "/api/admin/glossary/not-a-real-id"],
    ];

    const denied = [
      ["unauthenticated", "", 401],
      ["client", tokens.client, 403],
      ["manager", tokens.manager, 403],
    ];
    for (const [name, token, expected] of denied) {
      for (const [method, route, body] of routes) {
        const result = await httpJson(baseUrl, method, route, {
          token: token || undefined,
          body: method === "GET" ? undefined : body,
        });
        assert.equal(
          result.status,
          expected,
          `${name} ${method} ${route} expected ${expected} got ${result.status} ${result.text}`
        );
      }
    }

    const missingBulk = await httpJson(baseUrl, "POST", "/api/admin/product-translations/import-auto", {
      token: tokens.admin,
      body: {},
    });
    assert.equal(missingBulk.status, 404, `bulk AUTO HTTP ${missingBulk.status} ${missingBulk.text}`);

    const workspace = await httpJson(baseUrl, "GET", `/api/admin/product-translations/${productId}`, {
      token: tokens.admin,
    });
    assert.equal(workspace.status, 200, `admin workspace ${workspace.status} ${workspace.text}`);

    const glossaryGet = await httpJson(baseUrl, "GET", "/api/admin/glossary?language=en", { token: tokens.admin });
    assert.equal(glossaryGet.status, 200, `admin glossary ${glossaryGet.status}`);

    const glossarySave = await httpJson(baseUrl, "PUT", "/api/admin/glossary", {
      token: tokens.admin,
      body: { sourceRu: "стакан", language: "en", targetValue: "cup", context: "product.name", protected: true },
    });
    assert.equal(glossarySave.status, 200, `admin glossary save ${glossarySave.status} ${glossarySave.text}`);
    const glossaryId = glossarySave.json?.entry?.id;
    assert.ok(glossaryId);

    const glossaryDelete = await httpJson(baseUrl, "DELETE", `/api/admin/glossary/${glossaryId}`, {
      token: tokens.admin,
    });
    assert.equal(glossaryDelete.status, 200, `admin glossary delete ${glossaryDelete.status}`);

    const manual = await httpJson(baseUrl, "PUT", `/api/admin/product-translations/${productId}/en/name`, {
      token: tokens.admin,
      body: { value: `${product.name} EN`, expectedSourceHash: nameHash },
    });
    assert.equal(manual.status, 200, `admin MANUAL ${manual.status} ${manual.text}`);

    const reset = await httpJson(baseUrl, "POST", `/api/admin/product-translations/${productId}/en/name/reset-auto`, {
      token: tokens.admin,
      body: { expectedSourceHash: nameHash },
    });
    assert.equal(reset.status, 200, `admin reset ${reset.status} ${reset.text}`);

    const audit = listAuditActions(dbPath);
    const hay = JSON.stringify(audit.rows);
    assert.match(hay, /localization\.product\.manual\.save/);
    assert.match(hay, /localization\.product\.auto\.reset/);
    assert.match(hay, /localization\.glossary\.save/);
    assert.match(hay, /localization\.glossary\.delete/);
    assert.doesNotMatch(hay, /Перчатки нитриловые/);
    assert.doesNotMatch(hay, /password|secret|smtp/i);

    return { host, port, tempDir };
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
  runStage4AuthHttpTest({ workRoot })
    .then(() => console.log("i18n-stage4-http-auth: ok"))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
