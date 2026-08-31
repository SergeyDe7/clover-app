/**
 * Endpoint-level ownership proof for дозаказ / PUT /api/state/orders.
 *
 * Client A must not mutate Client B's existing NEW order
 * (status=Новый, exchange=not_sent, allowClientEdit=true).
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const temp = mkdtempSync(path.join(tmpdir(), "clover-addendum-own-"));
const databasePath = path.join(temp, "clover.sqlite");
const seedMetaPath = path.join(temp, "seed.json");
const seedScriptPath = path.join(temp, "seed.mjs");
const jwtSecret = "clover-addendum-ownership-verify-secret-32chars!";
const password = "AddendumOwnVerify!1";

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

async function waitHealth(base, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
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
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

function seedDatabase() {
  writeFileSync(
    seedScriptPath,
    `
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(${JSON.stringify(path.join(serverDir, "package.json"))});
const bcrypt = require("bcryptjs");
import {
  createUser,
  replaceOrders,
  getGlobalState,
  setGlobalState,
} from ${JSON.stringify(path.join(serverDir, "src/db.js"))};

const password = ${JSON.stringify(password)};
const passwordHash = bcrypt.hashSync(password, 4);
const metaPath = ${JSON.stringify(seedMetaPath)};

function makeOrder({ id, number, clientId, email, customItems }) {
  const nowIso = "2026-08-31T12:00:00.000Z";
  return {
    id,
    number,
    clientId,
    customerName: "Client " + clientId,
    customerEmail: email,
    status: "Новый",
    exchange: { status: "not_sent" },
    items: [],
    customItems,
    deliveryFee: 0,
    deliveryNote: "",
    firstDeliveryDate: "2026-09-05",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

const clientA = createUser({
  email: "a-addendum-own@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "Client A Co", contactName: "A" },
});
const clientB = createUser({
  email: "b-addendum-own@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "Client B Co", contactName: "B" },
});

const orderA = makeOrder({
  id: "order-a-new",
  number: "CL-A-1",
  clientId: clientA.id,
  email: clientA.email,
  customItems: [{ id: "ca1", name: "A custom", quantity: 1, unit: "шт.", unitPrice: 100 }],
});
const orderB = makeOrder({
  id: "order-b-new",
  number: "CL-B-1",
  clientId: clientB.id,
  email: clientB.email,
  customItems: [{ id: "cb1", name: "B custom", quantity: 2, unit: "шт.", unitPrice: 200 }],
});

replaceOrders({ userId: clientA.id, orders: [orderA], managerMode: false });
replaceOrders({ userId: clientB.id, orders: [orderB], managerMode: false });

const settings = {
  ...getGlobalState("settings", {}),
  allowClientEdit: true,
  showPrices: true,
};
setGlobalState("settings", settings);

writeFileSync(
  metaPath,
  JSON.stringify(
    {
      clientA: { id: clientA.id, email: clientA.email },
      clientB: { id: clientB.id, email: clientB.email },
      orderA,
      orderB,
    },
    null,
    2
  )
);
`
  );

  const result = spawnSync(process.execPath, [seedScriptPath], {
    cwd: serverDir,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      JWT_SECRET: jwtSecret,
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`seed failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(readFileSync(seedMetaPath, "utf8"));
}

async function main() {
  const seeded = seedDatabase();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      PORT: String(port),
      HOST: "127.0.0.1",
      JWT_SECRET: jwtSecret,
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      SMTP_HOST: "",
      TELEGRAM_BOT_TOKEN: "",
      ONEC_BASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.stdout.on("data", () => {});

  try {
    await waitHealth(base);

    const loginA = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: seeded.clientA.email, password },
    });
    assert.equal(loginA.status, 200, `login A failed: ${JSON.stringify(loginA.json)}`);
    const tokenA = loginA.json.token;

    const loginB = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: seeded.clientB.email, password },
    });
    assert.equal(loginB.status, 200, `login B failed: ${JSON.stringify(loginB.json)}`);
    const tokenB = loginB.json.token;

    const ownUpdated = {
      ...seeded.orderA,
      customItems: [
        ...seeded.orderA.customItems,
        {
          id: "ca-add",
          name: "A addendum",
          quantity: 1,
          unit: "шт.",
          unitPrice: 50,
        },
      ],
      updatedAt: "2026-08-31T13:00:00.000Z",
    };
    const ownPut = await api(base, "/api/state/orders", {
      method: "PUT",
      token: tokenA,
      body: { orders: [ownUpdated] },
    });
    assert.equal(ownPut.status, 200, `own put: ${JSON.stringify(ownPut.json)}`);
    assert.equal(ownPut.json?.ok, true);
    const ownSaved = (ownPut.json.orders || []).find((o) => o.id === "order-a-new");
    assert.ok(ownSaved, "own order returned");
    assert.equal(ownSaved.id, "order-a-new");
    assert.ok(
      (ownSaved.customItems || []).some((item) => item.id === "ca-add"),
      "addendum item persisted on own order"
    );

    const bootB = await api(base, "/api/bootstrap", { token: tokenB });
    assert.equal(bootB.status, 200);
    const foreignBefore = (bootB.json.orders || []).find((o) => o.id === "order-b-new");
    assert.ok(foreignBefore, "B order present before attack");
    const foreignBeforeJson = JSON.stringify({
      id: foreignBefore.id,
      status: foreignBefore.status,
      customItems: foreignBefore.customItems,
      items: foreignBefore.items,
      clientId: foreignBefore.clientId,
    });

    const forgedB = {
      ...seeded.orderB,
      customItems: [
        ...seeded.orderB.customItems,
        {
          id: "stolen",
          name: "Injected by A",
          quantity: 9,
          unit: "шт.",
          unitPrice: 1,
        },
      ],
      updatedAt: "2026-08-31T14:00:00.000Z",
    };

    const attackPut = await api(base, "/api/state/orders", {
      method: "PUT",
      token: tokenA,
      body: { orders: [ownUpdated, forgedB] },
    });
    assert.equal(
      attackPut.status,
      403,
      `foreign put should be 403, got ${attackPut.status}: ${JSON.stringify(attackPut.json)}`
    );
    assert.equal(attackPut.json?.code, "ORDER_OWNERSHIP_FORBIDDEN");

    const stealPut = await api(base, "/api/state/orders", {
      method: "PUT",
      token: tokenA,
      body: { orders: [forgedB] },
    });
    assert.equal(stealPut.status, 403);
    assert.equal(stealPut.json?.code, "ORDER_OWNERSHIP_FORBIDDEN");

    const bootBAfter = await api(base, "/api/bootstrap", { token: tokenB });
    assert.equal(bootBAfter.status, 200);
    const foreignAfter = (bootBAfter.json.orders || []).find((o) => o.id === "order-b-new");
    assert.ok(foreignAfter, "B order still present");
    const foreignAfterJson = JSON.stringify({
      id: foreignAfter.id,
      status: foreignAfter.status,
      customItems: foreignAfter.customItems,
      items: foreignAfter.items,
      clientId: foreignAfter.clientId,
    });
    assert.equal(foreignAfterJson, foreignBeforeJson, "foreign order must be unchanged");
    assert.equal(String(foreignAfter.status), "Новый");
    assert.ok(
      !(foreignAfter.customItems || []).some((item) => item.id === "stolen"),
      "stolen item must not appear on B"
    );

    const bootA = await api(base, "/api/bootstrap", { token: tokenA });
    const aOrders = bootA.json.orders || [];
    assert.ok(aOrders.every((o) => o.id !== "order-b-new"), "A must not own B order");
    assert.ok(aOrders.some((o) => o.id === "order-a-new"), "A keeps own order");

    console.log("verify-order-addendum-ownership: ok");
  } catch (error) {
    if (stderr) console.error(stderr.slice(-2000));
    throw error;
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 400));
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
    try {
      rmSync(temp, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

main().catch((error) => {
  console.error("verify-order-addendum-ownership: FAIL", error);
  process.exitCode = 1;
});
