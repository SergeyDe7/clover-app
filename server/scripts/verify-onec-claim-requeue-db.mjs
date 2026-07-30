import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ONEC_CLAIM_EXPIRED_REQUEUE_MESSAGE,
  ONEC_CLAIM_LEASE_MS,
  normalizeExchangeState,
} from "../src/exchange.js";

const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "clover-claim-requeue-"));
const databasePath = path.join(tempDirectory, "clover-test.sqlite");
process.env.DB_PATH = databasePath;
process.env.MANAGER_EMAIL = "manager-requeue@clover.local";
process.env.MANAGER_PASSWORD = "TemporaryTestPassword!";

const stamp = Date.now();
let dbModule;

try {
  dbModule = await import(`../src/db.js?test=${stamp}`);
  const {
    createUser,
    listAudit,
    listOrders,
    replaceOrders,
    setClientStateField,
  } = dbModule;
  const { releaseExpiredOneCClaims } = await import(
    `../src/onecClaimRequeue.js?test=${stamp}`
  );

  const client = createUser({
    email: "client-requeue@example.local",
    passwordHash: "test-hash",
    role: "client",
    profile: {
      companyName: "Клиент requeue",
      contactName: "Тест",
      phone: "+70000000001",
      email: "client-requeue@example.local",
    },
  });
  setClientStateField(client.id, "addresses", ["Адрес requeue"]);

  const nowMs = Date.now();
  const expiredId = "order-claim-expired-requeue";
  const activeId = "order-claim-active-keep";

  replaceOrders({
    userId: client.id,
    managerMode: false,
    orders: [
      {
        id: expiredId,
        number: "CL-REQUEUE-EXPIRED",
        clientId: client.id,
        customerName: "Клиент requeue",
        items: [],
        createdAt: "2026-07-30T00:00:00.000Z",
        exchange: {
          status: "sending",
          attempts: 3,
          channel: "onec-pull",
          lastAttemptAt: new Date(nowMs - ONEC_CLAIM_LEASE_MS - 5_000).toISOString(),
          message: "claimed",
        },
      },
      {
        id: activeId,
        number: "CL-REQUEUE-ACTIVE",
        clientId: client.id,
        customerName: "Клиент requeue",
        items: [],
        createdAt: "2026-07-30T00:01:00.000Z",
        exchange: {
          status: "sending",
          attempts: 1,
          channel: "onec-pull",
          lastAttemptAt: new Date(nowMs).toISOString(),
          message: "claimed",
        },
      },
    ],
  });

  const released = releaseExpiredOneCClaims(nowMs);
  assert.equal(released, 1, "Должен requeue только истёкший claim.");

  const orders = Object.fromEntries(listOrders().map((order) => [order.id, order]));
  assert.equal(normalizeExchangeState(orders[expiredId].exchange).status, "ready");
  assert.equal(orders[expiredId].exchange.attempts, 3);
  assert.equal(orders[expiredId].exchange.message, ONEC_CLAIM_EXPIRED_REQUEUE_MESSAGE);
  assert.equal(normalizeExchangeState(orders[activeId].exchange).status, "sending");
  assert.equal(orders[activeId].exchange.attempts, 1);

  const audits = listAudit(50).filter(
    (entry) => entry.action === "one-c.claim.expired-requeue"
  );
  assert.equal(audits.length, 1, "Один audit на первый requeue.");
  assert.equal(audits[0].details.orderId, expiredId);
  assert.equal(audits[0].details.previousStatus, "sending");
  assert.equal(audits[0].details.nextStatus, "ready");

  const secondPass = releaseExpiredOneCClaims(nowMs + 1_000);
  assert.equal(secondPass, 0, "Повторный tick не должен трогать ready/active.");
  assert.equal(
    listAudit(50).filter((entry) => entry.action === "one-c.claim.expired-requeue").length,
    1,
    "Повторный tick не должен писать второй audit."
  );

  console.log("verify-onec-claim-requeue-db: ok");
} finally {
  try {
    dbModule?.db?.close?.();
  } catch (error) {
    console.warn(`Temporary verification database close warning: ${error?.message || error}`);
  }

  try {
    rmSync(tempDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250,
    });
  } catch (error) {
    console.warn(
      `Temporary verification folder cleanup deferred: ${error?.code || "ERROR"} ${error?.message || error}`
    );
  }
}
