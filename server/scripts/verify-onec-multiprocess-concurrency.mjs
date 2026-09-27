/**
 * Behavioural regression proof for Clover <-> 1C queue concurrency.
 *
 * Reproducible scenarios and expected results:
 *  1. Two independent backend processes claim one ready order concurrently:
 *     exactly one HTTP 200, the competing response is non-success, final
 *     state sending with attempts=1. A loser may observe EMPTY_QUEUE or a
 *     fail-closed SQLite conflict, but it must never receive the order.
 *  2. ACK races an expired-claim requeue in another Node process:
 *     final state remains sent regardless of which transaction wins.
 *  3. Two backend processes ACK different orders with the same receipt in one
 *     contour: exactly one succeeds, one gets DOCUMENT_NUMBER_IN_USE.
 *
 * Uses only synthetic keys and one temporary SQLite database. No real 1C,
 * production database, network service, email, or messenger is touched.
 */
import assert from "node:assert/strict";
import { fork, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const serverEntry = path.join(serverRoot, "src/server.js");
const requeueWorkerEntry = path.join(__dirname, "onec-concurrency-requeue-worker.mjs");
const testKey = `onec-concurrency-${randomUUID()}-${randomUUID()}`;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
    probe.on("error", reject);
  });
}

function waitForServer(child, label, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`${label} start timeout\nstdout=${stdout}\nstderr=${stderr}`));
    }, timeoutMs);
    const finish = () => {
      if (!/API: http:\/\//iu.test(stdout)) return;
      clearTimeout(timer);
      resolve({ stdout, stderr });
    };
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      finish();
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(
        new Error(
          `${label} exited before listen: code=${code} signal=${signal}\nstdout=${stdout}\nstderr=${stderr}`
        )
      );
    });
  });
}

async function httpJson(baseUrl, method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      "X-Clover-Key": testKey,
      "X-Clover-Database": "TEST",
      "X-Clover-Protocol": "2",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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

function openDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 8000");
  database.exec("PRAGMA journal_mode = WAL");
  return database;
}

function seedUser(databasePath) {
  const database = openDatabase(databasePath);
  try {
    const now = new Date().toISOString();
    database.prepare(
      `INSERT INTO users(
         id, email, password_hash, role, created_at,
         email_verified, approval_status, password_changed_at, last_login_at,
         disabled_at, permissions_json
       ) VALUES (?, ?, ?, 'client', ?, 1, 'approved', '', '', '', ?)`
    ).run("onec-concurrency-user", "onec-concurrency@clover.test", "x", now, "{}");
  } finally {
    database.close();
  }
}

function insertOrder(databasePath, order) {
  const database = openDatabase(databasePath);
  try {
    const now = new Date().toISOString();
    database.prepare(
      `INSERT INTO orders(id, user_id, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(order.id, "onec-concurrency-user", JSON.stringify(order), now, now);
  } finally {
    database.close();
  }
}

function readOrder(databasePath, orderId) {
  const database = openDatabase(databasePath);
  try {
    const row = database
      .prepare("SELECT payload_json FROM orders WHERE id = ?")
      .get(orderId);
    return row ? JSON.parse(row.payload_json) : null;
  } finally {
    database.close();
  }
}

function baseOrder(id, number, exchange) {
  return {
    id,
    number,
    clientId: "onec-concurrency-user",
    customerName: "Synthetic concurrency client",
    status: "Новый",
    items: [],
    total: 0,
    createdAt: new Date().toISOString(),
    exchange,
  };
}

function startBackend({ port, databasePath, tempDirectory, label }) {
  const backupDirectory = path.join(tempDirectory, `backups-${label}`);
  const uploadDirectory = path.join(tempDirectory, `uploads-${label}`);
  mkdirSync(backupDirectory, { recursive: true });
  mkdirSync(uploadDirectory, { recursive: true });
  return spawn(process.execPath, [serverEntry], {
    cwd: tempDirectory,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      DB_PATH: databasePath,
      JWT_SECRET: `onec-concurrency-jwt-${label}-${randomUUID()}`,
      HOST: "127.0.0.1",
      PORT: String(port),
      APP_PUBLIC_URL: `http://127.0.0.1:${port}`,
      CLOVER_SERVER_BACKUP_DIR: backupDirectory,
      CLOVER_UPLOADS_DIR: uploadDirectory,
      ONEC_PROD_EXCHANGE_ENABLED: "true",
      ONEC_ALLOWED_DATABASES: "TEST",
      ONEC_DEFAULT_EXCHANGE_DATABASE: "TEST",
      ONEC_TEST_EXCHANGE_API_KEY: testKey,
      ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
      ONEC_WRITE_ENABLED: "false",
      ONEC_CLAIM_REQUEUE_INTERVAL_MS: "600000",
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
}

function waitForWorkerReady(worker, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("requeue worker ready timeout")), timeoutMs);
    worker.once("message", (message) => {
      if (message?.type !== "ready") {
        clearTimeout(timer);
        reject(new Error(`Unexpected worker message: ${JSON.stringify(message)}`));
        return;
      }
      clearTimeout(timer);
      resolve();
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`requeue worker exited before ready: ${code}`));
    });
  });
}

function runWorker(worker, nowMs, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("requeue worker result timeout")), timeoutMs);
    worker.on("message", (message) => {
      if (message?.type === "result") {
        clearTimeout(timer);
        resolve(message);
      } else if (message?.type === "error") {
        clearTimeout(timer);
        reject(new Error(message.message));
      }
    });
    worker.send({ type: "go", nowMs });
  });
}

function stopChild(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

const tempDirectory = mkdtempSync(path.join(tmpdir(), "clover-onec-concurrency-"));
const databasePath = path.join(tempDirectory, "shared.sqlite");
const children = [];

try {
  const [portA, portB] = await Promise.all([freePort(), freePort()]);
  assert.notEqual(portA, portB, "Backend processes require different ports.");
  const backendA = startBackend({ port: portA, databasePath, tempDirectory, label: "a" });
  children.push(backendA);
  await waitForServer(backendA, "backend-a");

  const backendB = startBackend({ port: portB, databasePath, tempDirectory, label: "b" });
  children.push(backendB);
  await waitForServer(backendB, "backend-b");

  const baseA = `http://127.0.0.1:${portA}`;
  const baseB = `http://127.0.0.1:${portB}`;
  seedUser(databasePath);

  // Scenario 1: concurrent claim.
  const claimId = "onec-concurrency-claim";
  insertOrder(
    databasePath,
    baseOrder(claimId, "CL-CONCURRENCY-CLAIM", {
      status: "ready",
      database: "TEST",
      attempts: 0,
      channel: "manual",
      lastAttemptAt: "",
    })
  );
  const claimResults = await Promise.all([
    httpJson(baseA, "GET", "/api/one-c/test-order"),
    httpJson(baseB, "GET", "/api/one-c/test-order"),
  ]);
  assert.equal(
    claimResults.filter((result) => result.status === 200).length,
    1,
    `Exactly one process must claim the order: ${JSON.stringify(claimResults)}`
  );
  const claimSuccess = claimResults.find((result) => result.status === 200);
  const claimLoser = claimResults.find((result) => result !== claimSuccess);
  assert.equal(claimSuccess?.json?.order?.id, claimId);
  assert.notEqual(claimLoser?.status, 200, "Competing backend must not receive the order.");
  const claimedOrder = readOrder(databasePath, claimId);
  assert.equal(claimedOrder?.exchange?.status, "sending");
  assert.equal(claimedOrder?.exchange?.attempts, 1);
  console.log(
    `PASS concurrent-claim: one 200, loser=${claimLoser?.status}, attempts=1`
  );

  // Scenario 2: ACK racing an expired requeue transaction.
  const ackRequeueId = "onec-concurrency-ack-requeue";
  const raceNow = Date.now();
  insertOrder(
    databasePath,
    baseOrder(ackRequeueId, "CL-CONCURRENCY-ACK-REQUEUE", {
      status: "sending",
      database: "TEST",
      attempts: 1,
      channel: "onec-pull",
      lastAttemptAt: new Date(raceNow - 60 * 60 * 1000).toISOString(),
    })
  );
  const requeueWorker = fork(requeueWorkerEntry, [], {
    cwd: tempDirectory,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      DB_PATH: databasePath,
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  children.push(requeueWorker);
  await waitForWorkerReady(requeueWorker);
  const [ackRaceResult, requeueResult] = await Promise.all([
    httpJson(baseA, "POST", `/api/one-c/orders/${ackRequeueId}/ack`, {
      orderNumber: "CL-CONCURRENCY-ACK-REQUEUE",
      documentNumber: "DOC-CONCURRENCY-RACE",
    }),
    runWorker(requeueWorker, raceNow),
  ]);
  assert.equal(ackRaceResult.status, 200, ackRaceResult.text);
  assert.ok(
    requeueResult.released === 0 || requeueResult.released === 1,
    `Worker result must expose which transaction won: ${JSON.stringify(requeueResult)}`
  );
  const ackRequeueOrder = readOrder(databasePath, ackRequeueId);
  assert.equal(ackRequeueOrder?.exchange?.status, "sent");
  assert.equal(ackRequeueOrder?.exchange?.receipt, "DOC-CONCURRENCY-RACE");
  console.log(
    `PASS ack-vs-requeue: requeueReleased=${requeueResult.released}, final=sent`
  );

  // Scenario 3: same receipt, same contour, different orders.
  const receiptOrderA = "onec-concurrency-receipt-a";
  const receiptOrderB = "onec-concurrency-receipt-b";
  const claimedAt = new Date().toISOString();
  for (const [id, number] of [
    [receiptOrderA, "CL-CONCURRENCY-RECEIPT-A"],
    [receiptOrderB, "CL-CONCURRENCY-RECEIPT-B"],
  ]) {
    insertOrder(
      databasePath,
      baseOrder(id, number, {
        status: "sending",
        database: "TEST",
        attempts: 1,
        channel: "onec-pull",
        lastAttemptAt: claimedAt,
      })
    );
  }
  const receiptResults = await Promise.all([
    httpJson(baseA, "POST", `/api/one-c/orders/${receiptOrderA}/ack`, {
      orderNumber: "CL-CONCURRENCY-RECEIPT-A",
      documentNumber: "DOC-CONCURRENCY-SHARED",
    }),
    httpJson(baseB, "POST", `/api/one-c/orders/${receiptOrderB}/ack`, {
      orderNumber: "CL-CONCURRENCY-RECEIPT-B",
      documentNumber: "DOC-CONCURRENCY-SHARED",
    }),
  ]);
  assert.deepEqual(
    receiptResults.map((result) => result.status).sort((left, right) => left - right),
    [200, 409],
    `Exactly one shared receipt ACK must succeed: ${JSON.stringify(receiptResults)}`
  );
  assert.equal(
    receiptResults.find((result) => result.status === 409)?.json?.code,
    "DOCUMENT_NUMBER_IN_USE"
  );
  const finalReceiptOrders = [
    readOrder(databasePath, receiptOrderA),
    readOrder(databasePath, receiptOrderB),
  ];
  assert.equal(
    finalReceiptOrders.filter((order) => order?.exchange?.status === "sent").length,
    1
  );
  assert.equal(
    finalReceiptOrders.filter((order) => order?.exchange?.status === "sending").length,
    1
  );
  console.log("PASS duplicate-receipt-race: one 200, one DOCUMENT_NUMBER_IN_USE");
  console.log("verify-onec-multiprocess-concurrency: PASS");
} finally {
  await Promise.allSettled(children.map((child) => stopChild(child)));
  try {
    rmSync(tempDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  } catch (error) {
    console.warn(
      `Temporary verification folder cleanup deferred: ${error?.code || "ERROR"} ${
        error?.message || error
      }`
    );
  }
}
