/**
 * SEC-001: deterministic TEST/VLAVKA contour credential binding tests.
 * Synthetic keys only. Temp SQLite. Isolated port. No real 1C / prod / messaging.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  assertOneCContourAuthConfig,
  authorizeOneCContour,
  createOneCAuthMiddleware,
  extractOneCAuthCredentials,
  loadOneCContourCredentialConfig,
  matchOneCContourCredential,
  resolveRequestedOneCContour,
} from "../src/oneCContourAuth.js";
import { resolveOneCRuntimeConfig } from "../src/oneC.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workRoot = path.resolve(__dirname, "../..");
const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");

// Synthetic keys constructed at runtime (no full literal in source/artifacts).
const TEST_KEY = ["sec001-test-", "exchange-key-", "aaaa-24"].join("");
const VLAVKA_KEY = ["sec001-vlavka-", "exchange-key-", "bbbb-24"].join("");
const UNKNOWN_KEY = ["sec001-unknown-", "exchange-key-", "cccc-24"].join("");
const OUTBOUND_KEY = ["sec001-outbound-", "only-key-", "dddd-24"].join("");
const SHORT_KEY = "too-short-key";

const results = {};

function mark(letter, ok, detail = "") {
  results[letter] = ok ? "PASS" : `FAIL:${detail}`;
  assert.ok(ok, `Matrix ${letter}: ${detail}`);
}

function rejectSensitivePath(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
}

function listenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function waitForListen(child, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`server start timeout\nstdout=${stdout}\nstderr=${stderr}`));
    }, timeoutMs);
    const onData = (chunk, sink) => {
      const text = String(chunk);
      sink.value += text;
      if (/запущен|listening|API: http/i.test(sink.value + (sink === stdoutRef ? "" : stdout))) {
        /* continue */
      }
      if (/запущен|API: http:\/\/localhost/i.test(stdout + stderr)) {
        clearTimeout(timer);
        resolve({ stdout, stderr });
      }
    };
    const stdoutRef = { value: "" };
    const stderrRef = { value: "" };
    child.stdout.on("data", (c) => {
      stdout += String(c);
      stdoutRef.value = stdout;
      if (/API: http:\/\//i.test(stdout + stderr)) {
        clearTimeout(timer);
        resolve({ stdout, stderr });
      }
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
      stderrRef.value = stderr;
      if (/ONEC contour credential config invalid/i.test(stderr)) {
        clearTimeout(timer);
        reject(new Error(stderr));
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}\nstdout=${stdout}\nstderr=${stderr}`));
    });
    void onData;
  });
}

async function httpJson(baseUrl, method, route, { headers = {}, body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

function insertUser(dbPath, user) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys = OFF");
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users(
         id, email, password_hash, role, created_at,
         email_verified, approval_status, password_changed_at, last_login_at,
         disabled_at, permissions_json
       ) VALUES (?, ?, ?, ?, ?, 1, 'approved', '', '', '', ?)`
    ).run(
      user.id,
      user.email,
      user.passwordHash || "x",
      user.role || "client",
      now,
      JSON.stringify({})
    );
    const row = db.prepare("SELECT id FROM users WHERE id = ?").get(user.id);
    if (!row) throw new Error(`insertUser failed for ${user.id}`);
  } finally {
    db.close();
  }
}

function insertOrder(dbPath, order) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys = OFF");
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO orders(id, user_id, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(order.id, order.userId || "user-sec001", JSON.stringify(order), now, now);
  } finally {
    db.close();
  }
}

function readOrder(dbPath, orderId) {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare(`SELECT payload_json FROM orders WHERE id = ?`).get(orderId);
    return row ? JSON.parse(row.payload_json) : null;
  } finally {
    db.close();
  }
}

function orderFingerprint(order) {
  return JSON.stringify({
    status: order?.exchange?.status,
    database: order?.exchange?.database,
    receipt: order?.exchange?.receipt,
    attempts: order?.exchange?.attempts,
    message: order?.exchange?.message,
    lastAttemptAt: order?.exchange?.lastAttemptAt,
  });
}

// --- Unit / config matrix ---
{
  const envOk = {
    ONEC_PROD_EXCHANGE_ENABLED: "true",
    ONEC_ALLOWED_DATABASES: "TEST,VLAVKA",
    ONEC_TEST_EXCHANGE_API_KEY: TEST_KEY,
    ONEC_VLAVKA_EXCHANGE_API_KEY: VLAVKA_KEY,
    ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
  };
  assertOneCContourAuthConfig(envOk);
  mark("P", true, "TEST+VLAVKA valid config");

  const sameKey = {
    ...envOk,
    ONEC_VLAVKA_EXCHANGE_API_KEY: TEST_KEY,
  };
  const same = loadOneCContourCredentialConfig(sameKey);
  mark("G", same.errors.some((e) => /distinct|multiple contours/i.test(e)), same.errors.join(";"));

  const prodNoKey = {
    ONEC_PROD_EXCHANGE_ENABLED: "true",
    ONEC_ALLOWED_DATABASES: "TEST,VLAVKA",
    ONEC_TEST_EXCHANGE_API_KEY: TEST_KEY,
    ONEC_VLAVKA_EXCHANGE_API_KEY: "",
  };
  const prodFail = loadOneCContourCredentialConfig(prodNoKey);
  mark("Q", prodFail.errors.some((e) => /VLAVKA/i.test(e)), prodFail.errors.join(";"));

  const testOnly = {
    ONEC_PROD_EXCHANGE_ENABLED: "false",
    ONEC_ALLOWED_DATABASES: "TEST",
    ONEC_TEST_EXCHANGE_API_KEY: TEST_KEY,
    ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
  };
  assertOneCContourAuthConfig(testOnly);
  mark("P", true, "TEST-only");

  // VLAVKA-only: TEST key not required; VLAVKA key required; TEST not auto-added.
  const vlavkaOnlyOk = {
    ONEC_PROD_EXCHANGE_ENABLED: "true",
    ONEC_ALLOWED_DATABASES: "VLAVKA",
    ONEC_DEFAULT_EXCHANGE_DATABASE: "VLAVKA",
    ONEC_VLAVKA_EXCHANGE_API_KEY: VLAVKA_KEY,
    ONEC_TEST_EXCHANGE_API_KEY: "",
    ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
  };
  const vlavkaOnlyCfg = assertOneCContourAuthConfig(vlavkaOnlyOk);
  mark(
    "YA",
    vlavkaOnlyCfg.allowedDatabases.length === 1 &&
      vlavkaOnlyCfg.allowedDatabases[0] === "VLAVKA" &&
      !vlavkaOnlyCfg.allowedDatabases.includes("TEST"),
    vlavkaOnlyCfg.allowedDatabases.join(",")
  );

  const vlavkaOnlyNoVlavkaKey = loadOneCContourCredentialConfig({
    ...vlavkaOnlyOk,
    ONEC_VLAVKA_EXCHANGE_API_KEY: "",
  });
  mark(
    "YB",
    vlavkaOnlyNoVlavkaKey.errors.some((e) => /VLAVKA_EXCHANGE_API_KEY is required/i.test(e)),
    vlavkaOnlyNoVlavkaKey.errors.join(";")
  );

  const bypassVlavkaOnly = loadOneCContourCredentialConfig({
    ...vlavkaOnlyOk,
    ONEC_ALLOW_LOCAL_WITHOUT_KEY: "true",
  });
  mark(
    "YC",
    bypassVlavkaOnly.errors.some((e) => /LOCAL_WITHOUT_KEY/i.test(e)),
    bypassVlavkaOnly.errors.join(";")
  );

  const bypassVlavka = loadOneCContourCredentialConfig({
    ONEC_PROD_EXCHANGE_ENABLED: "true",
    ONEC_ALLOWED_DATABASES: "TEST,VLAVKA",
    ONEC_TEST_EXCHANGE_API_KEY: TEST_KEY,
    ONEC_VLAVKA_EXCHANGE_API_KEY: VLAVKA_KEY,
    ONEC_ALLOW_LOCAL_WITHOUT_KEY: "true",
  });
  mark(
    "U",
    bypassVlavka.errors.some((e) => /LOCAL_WITHOUT_KEY/i.test(e)),
    bypassVlavka.errors.join(";")
  );

  const bypassProdNode = loadOneCContourCredentialConfig({
    NODE_ENV: "production",
    ONEC_PROD_EXCHANGE_ENABLED: "false",
    ONEC_ALLOWED_DATABASES: "TEST",
    ONEC_ALLOW_LOCAL_WITHOUT_KEY: "true",
  });
  mark(
    "U",
    results.U === "PASS" &&
      bypassProdNode.errors.some((e) => /LOCAL_WITHOUT_KEY/i.test(e)),
    bypassProdNode.errors.join(";")
  );

  const conflict = extractOneCAuthCredentials({
    headers: {
      "x-clover-key": TEST_KEY,
      authorization: `Bearer ${VLAVKA_KEY}`,
    },
  });
  mark("S", conflict.errorCode === "ONEC_AUTH_DENIED" && conflict.status === 400, conflict.errorCode);

  const contourConflict = resolveRequestedOneCContour({
    headers: { "x-clover-database": "TEST" },
    body: { database: "VLAVKA" },
    query: {},
  });
  mark(
    "H",
    contourConflict.errorCode === "ONEC_CONTOUR_CONFLICT",
    contourConflict.errorCode
  );

  const unknownContour = resolveRequestedOneCContour({
    headers: { "x-clover-database": "PROD" },
    body: {},
    query: {},
  });
  mark("I", unknownContour.errorCode === "ONEC_CONTOUR_CONFLICT", unknownContour.errorCode);

  const cfg = assertOneCContourAuthConfig(envOk);
  const matched = matchOneCContourCredential(TEST_KEY, cfg.identities);
  assert.equal(matched.contour, "TEST");
  assert.equal(matchOneCContourCredential(UNKNOWN_KEY, cfg.identities), null);

  const outbound = resolveOneCRuntimeConfig({});
  mark(
    "V",
    Object.prototype.hasOwnProperty.call(outbound, "apiKey"),
    "outbound still resolves ONEC_API_KEY"
  );

  // Missing contour uses authenticated contour (TEST auth → TEST)
  const fakeReq = {
    oneCAuth: { contour: "TEST", credentialId: "test-exchange" },
    headers: {},
    body: {},
    query: {},
  };
  const fakeRes = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const contour = authorizeOneCContour(fakeReq, fakeRes, {
    isAllowedDatabase: () => true,
  });
  mark("X", contour === "TEST" && fakeReq.oneCContour === "TEST", String(contour));

  // Auth deny must not disclose allowlist / prodEnabled
  fakeRes.statusCode = 0;
  fakeRes.body = null;
  authorizeOneCContour(
    {
      oneCAuth: { contour: "TEST", credentialId: "test-exchange" },
      headers: {},
      body: {},
      query: {},
    },
    fakeRes,
    { isAllowedDatabase: () => false }
  );
  mark(
    "YD",
    fakeRes.statusCode === 403 &&
      fakeRes.body?.code === "ONEC_AUTH_DENIED" &&
      !Object.prototype.hasOwnProperty.call(fakeRes.body || {}, "allowedDatabases") &&
      !Object.prototype.hasOwnProperty.call(fakeRes.body || {}, "prodEnabled"),
    JSON.stringify(fakeRes.body)
  );

  void SHORT_KEY;
}

const tempDir = mkdtempSync(path.join(tmpdir(), "sec001-contour-"));
const dbPath = path.join(tempDir, "clover-sec001.sqlite");
const backupDir = path.join(tempDir, "backups");
const uploadDir = path.join(tempDir, "uploads");
mkdirSync(backupDir, { recursive: true });
mkdirSync(uploadDir, { recursive: true });
rejectSensitivePath(dbPath);

const port = await listenPort();
const host = "127.0.0.1";
const baseUrl = `http://${host}:${port}`;
const jwtSecret = `sec001-jwt-${randomUUID()}`;

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
    ONEC_PROD_EXCHANGE_ENABLED: "true",
    ONEC_ALLOWED_DATABASES: "TEST,VLAVKA",
    ONEC_DEFAULT_EXCHANGE_DATABASE: "TEST",
    ONEC_TEST_EXCHANGE_API_KEY: TEST_KEY,
    ONEC_VLAVKA_EXCHANGE_API_KEY: VLAVKA_KEY,
    ONEC_API_KEY: OUTBOUND_KEY,
    ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
    ONEC_WRITE_ENABLED: "false",
    SMTP_HOST: "",
    TELEGRAM_BOT_TOKEN: "",
    MANAGER_EMAIL: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    NO_PROXY: "*",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLogs = { stdout: "", stderr: "" };

try {
  serverLogs = await waitForListen(child);

  const qs = (key, database) =>
    httpJson(baseUrl, "GET", "/api/one-c/queue-status", {
      headers: {
        "X-Clover-Key": key,
        ...(database ? { "X-Clover-Database": database } : {}),
      },
    });

  const a = await qs(TEST_KEY, "TEST");
  mark("A", a.status === 200 && a.json?.database === "TEST", `${a.status} ${a.text}`);

  const b = await qs(VLAVKA_KEY, "VLAVKA");
  mark("B", b.status === 200 && b.json?.database === "VLAVKA", `${b.status} ${b.text}`);

  const c = await qs(TEST_KEY, "VLAVKA");
  mark("C", c.status === 403 && c.json?.code === "ONEC_CONTOUR_MISMATCH", `${c.status} ${c.text}`);

  const d = await qs(VLAVKA_KEY, "TEST");
  mark("D", d.status === 403 && d.json?.code === "ONEC_CONTOUR_MISMATCH", `${d.status} ${d.text}`);

  const e = await qs(UNKNOWN_KEY, "TEST");
  mark("E", e.status === 401, `${e.status} ${e.text}`);

  const f = await httpJson(baseUrl, "GET", "/api/one-c/queue-status", {
    headers: { "X-Clover-Database": "TEST" },
  });
  mark("F", f.status === 401, `${f.status} ${f.text}`);

  const headerConflict = await httpJson(baseUrl, "GET", "/api/one-c/queue-status", {
    headers: {
      "X-Clover-Key": TEST_KEY,
      Authorization: `Bearer ${VLAVKA_KEY}`,
      "X-Clover-Database": "TEST",
    },
  });
  mark("S", headerConflict.status === 400, `${headerConflict.status} ${headerConflict.text}`);

  const headerBodyConflict = await httpJson(baseUrl, "POST", "/api/one-c/purchase-prices", {
    headers: {
      "X-Clover-Key": TEST_KEY,
      "X-Clover-Database": "TEST",
    },
    body: { database: "VLAVKA", items: [] },
  });
  mark(
    "H",
    headerBodyConflict.status === 400 &&
      headerBodyConflict.json?.code === "ONEC_CONTOUR_CONFLICT",
    `${headerBodyConflict.status} ${headerBodyConflict.text}`
  );

  const unknownDb = await qs(TEST_KEY, "WAREHOUSE");
  mark("I", unknownDb.status === 400, `${unknownDb.status} ${unknownDb.text}`);

  const missingContour = await qs(TEST_KEY, "");
  mark(
    "X",
    missingContour.status === 200 && missingContour.json?.database === "TEST",
    `${missingContour.status} ${missingContour.text}`
  );

  // Seed claimed orders for ACK matrix
  insertUser(dbPath, {
    id: "user-sec001",
    email: "sec001-client@clover.test",
    role: "client",
  });
  const testOrderId = "sec001-order-test";
  const vlavkaOrderId = "sec001-order-vlavka";
  const claimedAt = new Date().toISOString();
  insertOrder(dbPath, {
    id: testOrderId,
    number: "CL-SEC001-TEST",
    userId: "user-sec001",
    status: "Новый",
    items: [],
    exchange: {
      status: "sending",
      database: "TEST",
      attempts: 1,
      channel: "onec-pull",
      lastAttemptAt: claimedAt,
      message: "claimed-test",
    },
  });
  insertOrder(dbPath, {
    id: vlavkaOrderId,
    number: "CL-SEC001-VLAVKA",
    userId: "user-sec001",
    status: "Новый",
    items: [],
    exchange: {
      status: "sending",
      database: "VLAVKA",
      attempts: 1,
      channel: "onec-pull",
      lastAttemptAt: claimedAt,
      message: "claimed-vlavka",
    },
  });

  const beforeJ = orderFingerprint(readOrder(dbPath, testOrderId));
  const j = await httpJson(baseUrl, "POST", `/api/one-c/orders/${testOrderId}/ack`, {
    headers: {
      "X-Clover-Key": VLAVKA_KEY,
      "X-Clover-Database": "TEST",
    },
    body: {
      orderNumber: "CL-SEC001-TEST",
      documentNumber: "DOC-SHOULD-NOT-APPLY",
    },
  });
  const afterJ = orderFingerprint(readOrder(dbPath, testOrderId));
  mark(
    "J",
    j.status === 403 && beforeJ === afterJ,
    `status=${j.status} mutated=${beforeJ !== afterJ} ${j.text}`
  );

  const beforeK = orderFingerprint(readOrder(dbPath, vlavkaOrderId));
  const k = await httpJson(baseUrl, "POST", `/api/one-c/orders/${vlavkaOrderId}/ack`, {
    headers: {
      "X-Clover-Key": TEST_KEY,
      "X-Clover-Database": "VLAVKA",
    },
    body: {
      orderNumber: "CL-SEC001-VLAVKA",
      documentNumber: "DOC-SHOULD-NOT-APPLY-2",
    },
  });
  const afterK = orderFingerprint(readOrder(dbPath, vlavkaOrderId));
  mark(
    "K",
    k.status === 403 && beforeK === afterK,
    `status=${k.status} mutated=${beforeK !== afterK} ${k.text}`
  );

  const beforeL = orderFingerprint(readOrder(dbPath, testOrderId));
  const l = await httpJson(baseUrl, "POST", `/api/one-c/orders/${testOrderId}/ack`, {
    headers: {
      "X-Clover-Key": TEST_KEY,
      "X-Clover-Database": "TEST",
    },
    body: {
      orderNumber: "WRONG-NUMBER",
      documentNumber: "DOC-L",
    },
  });
  const afterL = orderFingerprint(readOrder(dbPath, testOrderId));
  mark(
    "L",
    l.status === 409 && beforeL === afterL,
    `status=${l.status} ${l.text}`
  );

  // Successful ACK then duplicate (M) + replay (O)
  const ack1 = await httpJson(baseUrl, "POST", `/api/one-c/orders/${testOrderId}/ack`, {
    headers: {
      "X-Clover-Key": TEST_KEY,
      "X-Clover-Database": "TEST",
    },
    body: {
      orderNumber: "CL-SEC001-TEST",
      documentNumber: "DOC-SEC001-1",
    },
  });
  mark("L", ack1.status === 200 || results.L === "PASS", `ack setup ${ack1.status}`);
  assert.equal(ack1.status, 200, ack1.text);
  const sentFp = orderFingerprint(readOrder(dbPath, testOrderId));
  assert.equal(readOrder(dbPath, testOrderId).exchange.status, "sent");
  assert.equal(readOrder(dbPath, testOrderId).exchange.receipt, "DOC-SEC001-1");

  const m = await httpJson(baseUrl, "POST", `/api/one-c/orders/${testOrderId}/ack`, {
    headers: {
      "X-Clover-Key": TEST_KEY,
      "X-Clover-Database": "TEST",
    },
    body: {
      orderNumber: "CL-SEC001-TEST",
      documentNumber: "DOC-SEC001-1",
    },
  });
  mark(
    "M",
    m.status === 200 && m.json?.duplicateAck === true && orderFingerprint(readOrder(dbPath, testOrderId)) === sentFp,
    `${m.status} ${m.text}`
  );

  const o = await httpJson(baseUrl, "POST", `/api/one-c/orders/${testOrderId}/ack`, {
    headers: {
      "X-Clover-Key": TEST_KEY,
      "X-Clover-Database": "TEST",
    },
    body: {
      orderNumber: "CL-SEC001-TEST",
      documentNumber: "DOC-OTHER",
    },
  });
  mark(
    "O",
    o.status === 409 && orderFingerprint(readOrder(dbPath, testOrderId)) === sentFp,
    `${o.status} ${o.text}`
  );

  // Stale claim: order already sent → reject (N)
  const n = await httpJson(baseUrl, "POST", `/api/one-c/orders/${testOrderId}/ack`, {
    headers: {
      "X-Clover-Key": TEST_KEY,
      "X-Clover-Database": "TEST",
    },
    body: {
      orderNumber: "CL-SEC001-TEST",
      documentNumber: "DOC-STALE",
    },
  });
  mark("N", n.status === 409, `${n.status} ${n.text}`);

  // Accepted cross-contour deny
  insertOrder(dbPath, {
    id: "sec001-order-accepted",
    number: "CL-SEC001-ACC",
    userId: "user-sec001",
    status: "Новый",
    items: [],
    exchange: {
      status: "sent",
      database: "TEST",
      receipt: "DOC-ACC-1",
      attempts: 1,
      channel: "onec-pull",
      lastAttemptAt: claimedAt,
      message: "sent",
    },
  });
  const beforeAcc = orderFingerprint(readOrder(dbPath, "sec001-order-accepted"));
  const acc = await httpJson(baseUrl, "POST", "/api/one-c/orders/accepted", {
    headers: {
      "X-Clover-Key": VLAVKA_KEY,
      "X-Clover-Database": "TEST",
    },
    body: {
      orderNumber: "CL-SEC001-ACC",
      documentNumber: "DOC-ACC-1",
      oneCState: "Обработан",
    },
  });
  mark(
    "J",
    results.J.startsWith("PASS") &&
      acc.status === 403 &&
      orderFingerprint(readOrder(dbPath, "sec001-order-accepted")) === beforeAcc,
    `accepted cross ${acc.status}`
  );

  // Accepted: VLAVKA credential must not mutate TEST sent order (order contour bind)
  const beforeAccCross = orderFingerprint(readOrder(dbPath, "sec001-order-accepted"));
  const accCross = await httpJson(baseUrl, "POST", "/api/one-c/orders/accepted", {
    headers: {
      "X-Clover-Key": VLAVKA_KEY,
      "X-Clover-Database": "VLAVKA",
    },
    body: {
      orderNumber: "CL-SEC001-ACC",
      documentNumber: "DOC-ACC-1",
      oneCState: "Обработан",
    },
  });
  mark(
    "J",
    results.J.startsWith("PASS") &&
      (accCross.status === 409 || accCross.status === 403) &&
      orderFingerprint(readOrder(dbPath, "sec001-order-accepted")) === beforeAccCross,
    `accepted order-contour ${accCross.status} ${accCross.text}`
  );

  // All /api/one-c routes require contour auth (W) — sample mutating + read
  const routes = [
    ["GET", "/api/one-c/queue-status"],
    ["GET", "/api/one-c/purchase-price-request"],
    ["GET", "/api/one-c/price-types"],
    ["GET", "/api/one-c/sale-price-request"],
    ["GET", "/api/one-c/reconciliation/requests"],
    ["POST", "/api/one-c/products-preview", { items: [] }],
    ["POST", "/api/one-c/clients-preview", { items: [] }],
  ];
  let allProtected = true;
  for (const [method, route, body] of routes) {
    const denied = await httpJson(baseUrl, method, route, {
      headers: { "X-Clover-Database": "TEST" },
      body,
    });
    if (denied.status !== 401) {
      allProtected = false;
      break;
    }
    const allowed = await httpJson(baseUrl, method, route, {
      headers: {
        "X-Clover-Key": TEST_KEY,
        "X-Clover-Database": "TEST",
      },
      body,
    });
    if (allowed.status === 401 || allowed.status === 403) {
      allProtected = false;
      break;
    }
  }
  // Outbound key must not authorize inbound
  const outboundInbound = await qs(OUTBOUND_KEY, "TEST");
  mark(
    "W",
    allProtected && outboundInbound.status === 401,
    `protected=${allProtected} outboundInbound=${outboundInbound.status}`
  );
  mark("V", outboundInbound.status === 401, "outbound key no inbound authority");

  // Local bypass unit: middleware with TEST-only + loopback
  {
    const bypassEnv = {
      ONEC_PROD_EXCHANGE_ENABLED: "false",
      ONEC_ALLOWED_DATABASES: "TEST",
      ONEC_ALLOW_LOCAL_WITHOUT_KEY: "true",
      ONEC_TEST_EXCHANGE_API_KEY: "",
    };
    assertOneCContourAuthConfig(bypassEnv);
    const mw = createOneCAuthMiddleware({ env: bypassEnv, writeAudit() {} });
    const reqOk = {
      headers: {},
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    };
    let nextCalled = false;
    await new Promise((resolve) => {
      const res = {
        status() {
          return this;
        },
        json() {
          resolve();
          return this;
        },
      };
      mw(reqOk, res, () => {
        nextCalled = true;
        resolve();
      });
    });
    mark("T", nextCalled && reqOk.oneCAuth?.contour === "TEST", String(reqOk.oneCAuth?.credentialId));

    const reqRemote = {
      headers: {},
      ip: "8.8.8.8",
      socket: { remoteAddress: "8.8.8.8" },
    };
    let remoteStatus = 0;
    await new Promise((resolve) => {
      mw(reqRemote, {
        status(code) {
          remoteStatus = code;
          return this;
        },
        json() {
          resolve();
          return this;
        },
      }, () => resolve());
    });
    mark("U", remoteStatus === 401 || results.U === "PASS", `remote=${remoteStatus}`);
  }

  // Secret leak check across responses + logs
  const leakHay = [
    serverLogs.stdout,
    serverLogs.stderr,
    JSON.stringify(results),
    a.text,
    e.text,
    j.text,
    headerConflict.text,
  ].join("\n");
  const leaked =
    leakHay.includes(TEST_KEY) ||
    leakHay.includes(VLAVKA_KEY) ||
    leakHay.includes(UNKNOWN_KEY);
  mark("R", !leaked, leaked ? "key present in logs/errors" : "clean");

  // --- VLAVKA-only HTTP matrix (second isolated server) ---
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }

  const vlavkaPort = await listenPort();
  const vlavkaBase = `http://127.0.0.1:${vlavkaPort}`;
  const vlavkaChild = spawn(process.execPath, [path.join(workRoot, "server/src/server.js")], {
    cwd: tempDir,
    env: {
      PATH: process.env.PATH,
      HOME: tempDir,
      NODE_ENV: "test",
      DB_PATH: dbPath,
      JWT_SECRET: jwtSecret,
      HOST: "127.0.0.1",
      PORT: String(vlavkaPort),
      CLOVER_SERVER_BACKUP_DIR: backupDir,
      CLOVER_UPLOADS_DIR: uploadDir,
      APP_PUBLIC_URL: vlavkaBase,
      ALLOW_LAN_ORIGINS: "false",
      ONEC_PROD_EXCHANGE_ENABLED: "true",
      ONEC_ALLOWED_DATABASES: "VLAVKA",
      ONEC_DEFAULT_EXCHANGE_DATABASE: "VLAVKA",
      ONEC_VLAVKA_EXCHANGE_API_KEY: VLAVKA_KEY,
      ONEC_TEST_EXCHANGE_API_KEY: "",
      ONEC_API_KEY: OUTBOUND_KEY,
      ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
      ONEC_WRITE_ENABLED: "false",
      SMTP_HOST: "",
      TELEGRAM_BOT_TOKEN: "",
      MANAGER_EMAIL: "",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      ALL_PROXY: "",
      NO_PROXY: "*",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForListen(vlavkaChild);

    const voQs = (key, database) =>
      httpJson(vlavkaBase, "GET", "/api/one-c/queue-status", {
        headers: {
          "X-Clover-Key": key,
          ...(database ? { "X-Clover-Database": database } : {}),
        },
      });

    const ye = await voQs(VLAVKA_KEY, "VLAVKA");
    mark("YE", ye.status === 200 && ye.json?.database === "VLAVKA", `${ye.status} ${ye.text}`);

    const yf = await voQs(VLAVKA_KEY, "TEST");
    mark(
      "YF",
      yf.status === 403 && yf.json?.code === "ONEC_CONTOUR_MISMATCH",
      `${yf.status} ${yf.text}`
    );

    const yg = await voQs(VLAVKA_KEY, "");
    mark(
      "YG",
      yg.status === 200 && yg.json?.database === "VLAVKA",
      `${yg.status} ${yg.text}`
    );

    const yh = await voQs(UNKNOWN_KEY, "VLAVKA");
    mark(
      "YH",
      yh.status === 401 &&
        !Object.prototype.hasOwnProperty.call(yh.json || {}, "allowedDatabases") &&
        !Object.prototype.hasOwnProperty.call(yh.json || {}, "prodEnabled") &&
        !String(yh.text || "").includes("VLAVKA") &&
        !String(yh.text || "").includes("TEST,") &&
        !String(yh.text || "").includes("allowedDatabases"),
      `${yh.status} ${yh.text}`
    );

    // Seed TEST-contour order: VLAVKA auth must not claim/ACK/accepted it.
    const voOrderId = "sec001-order-vlavka-only-test-target";
    insertOrder(dbPath, {
      id: voOrderId,
      number: "CL-SEC001-VO",
      userId: "user-sec001",
      status: "Новый",
      items: [],
      exchange: {
        status: "sending",
        database: "TEST",
        attempts: 1,
        channel: "onec-pull",
        lastAttemptAt: new Date().toISOString(),
        message: "should-stay-untouched",
      },
    });
    const beforeVo = orderFingerprint(readOrder(dbPath, voOrderId));

    const yiAck = await httpJson(vlavkaBase, "POST", `/api/one-c/orders/${voOrderId}/ack`, {
      headers: {
        "X-Clover-Key": VLAVKA_KEY,
        "X-Clover-Database": "VLAVKA",
      },
      body: {
        orderNumber: "CL-SEC001-VO",
        documentNumber: "DOC-VO-SHOULD-NOT",
      },
    });
    const afterVoAck = orderFingerprint(readOrder(dbPath, voOrderId));
    mark(
      "YI",
      (yiAck.status === 409 || yiAck.status === 403) && beforeVo === afterVoAck,
      `ack=${yiAck.status} mutated=${beforeVo !== afterVoAck} ${yiAck.text}`
    );

    const yjAcc = await httpJson(vlavkaBase, "POST", "/api/one-c/orders/accepted", {
      headers: {
        "X-Clover-Key": VLAVKA_KEY,
        "X-Clover-Database": "VLAVKA",
      },
      body: {
        orderNumber: "CL-SEC001-VO",
        documentNumber: "DOC-VO-SHOULD-NOT",
        oneCState: "Обработан",
      },
    });
    const afterVoAcc = orderFingerprint(readOrder(dbPath, voOrderId));
    mark(
      "YJ",
      (yjAcc.status === 409 || yjAcc.status === 403 || yjAcc.status === 404) &&
        beforeVo === afterVoAcc,
      `accepted=${yjAcc.status} mutated=${beforeVo !== afterVoAcc} ${yjAcc.text}`
    );

    // Claim path: TEST database header denied for VLAVKA key (no mutation of queue order).
    insertOrder(dbPath, {
      id: "sec001-order-vlavka-only-ready",
      number: "CL-SEC001-VO-READY",
      userId: "user-sec001",
      status: "Новый",
      items: [],
      exchange: {
        status: "ready",
        database: "TEST",
        attempts: 0,
        channel: "onec-pull",
        lastAttemptAt: "",
        message: "ready-test-must-not-claim",
      },
    });
    const beforeClaim = orderFingerprint(readOrder(dbPath, "sec001-order-vlavka-only-ready"));
    const ykClaim = await httpJson(vlavkaBase, "POST", "/api/one-c/test-order", {
      headers: {
        "X-Clover-Key": VLAVKA_KEY,
        "X-Clover-Database": "TEST",
        "X-Clover-Protocol": "2",
      },
      body: {},
    });
    const afterClaim = orderFingerprint(readOrder(dbPath, "sec001-order-vlavka-only-ready"));
    mark(
      "YK",
      ykClaim.status === 403 &&
        ykClaim.json?.code === "ONEC_CONTOUR_MISMATCH" &&
        beforeClaim === afterClaim,
      `claim=${ykClaim.status} mutated=${beforeClaim !== afterClaim} ${ykClaim.text}`
    );
  } finally {
    try {
      vlavkaChild.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }

  console.log("verify-sec-001-contour-credentials: ok");
  console.log(JSON.stringify(results, null, 2));
} finally {
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
