/**
 * S2-NEW-001 concurrency: mid-request manager accept must win over client
 * omit / stale draft body. Latest DB state inside replaceOrders txn is
 * authoritative. Isolated temp SQLite.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const temp = mkdtempSync(path.join(tmpdir(), "clover-s2-001-conc-"));
const databasePath = path.join(temp, "clover.sqlite");
const uploadsDir = path.join(temp, "uploads");
const backupDir = path.join(temp, "backups");
mkdirSync(uploadsDir);
mkdirSync(backupDir);

const jwtSecret = "clover-s2-001-concurrency-secret-32ch!!";
const password = "S2ConcPass!1";

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
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

function assertManagerSnapshot(order, label) {
  assert.ok(order, `${label}: missing`);
  assert.equal(order.status, "Принят", `${label}: status`);
  assert.equal(order.oneCDocumentId, "1C-MGR-LATEST", `${label}: oneCDocumentId`);
  assert.equal(order.exchange?.documentId, "1C-MGR-LATEST", `${label}: exchange.documentId`);
  assert.equal(order.exchange?.oneCNumber, "UNF-MGR-9", `${label}: oneCNumber`);
  assert.equal(order.exchange?.status, "not_sent", `${label}: exchange.status`);
  assert.equal(order.items?.[0]?.quantity, 7, `${label}: qty`);
  assert.equal(Number(order.items?.[0]?.unitPrice), 150, `${label}: price`);
  assert.equal(Number(order.total), 1050, `${label}: total`);
  assert.notEqual(order.status, "Новый", `${label}: must not be draft`);
}

async function runDbUnit() {
  process.env.DB_PATH = databasePath;
  process.env.JWT_SECRET = jwtSecret;
  process.env.MANAGER_EMAIL = "";
  process.env.MANAGER_PASSWORD = "";

  const require = createRequire(path.join(serverDir, "package.json"));
  const bcrypt = require("bcryptjs");
  const dbMod = await import(pathToFileURL(path.join(serverDir, "src/db.js")).href);
  const {
    createUser,
    replaceOrders,
    listOrders,
    setGlobalState,
  } = dbMod;

  const passwordHash = bcrypt.hashSync(password, 4);
  const client = createUser({
    email: "conc-a@test.local",
    passwordHash,
    role: "client",
    emailVerified: true,
    approvalStatus: "approved",
  });
  setGlobalState("settings", {
    showPrices: true,
    allowClientEdit: true,
    allowClientDelete: true,
  });

  const nowIso = "2026-09-16T12:00:00.000Z";
  const draft = {
    id: "o-race",
    number: "R-1",
    clientId: client.id,
    customerName: "Conc Co",
    status: "Новый",
    exchange: { status: "not_sent" },
    items: [
      {
        id: "line-r",
        productId: "prod-1",
        name: "P1",
        quantity: 1,
        unit: "piece",
        unitPrice: 10,
        lineTotal: 10,
      },
    ],
    customItems: [],
    deliveryFee: 0,
    total: 10,
    amount: 10,
    firstDeliveryDate: "2026-09-25",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const keeper = {
    id: "o-keep",
    number: "K-1",
    clientId: client.id,
    customerName: "Conc Co",
    status: "Новый",
    exchange: { status: "not_sent" },
    items: [
      {
        id: "line-k",
        productId: "prod-1",
        name: "P1",
        quantity: 1,
        unit: "piece",
        unitPrice: 10,
        lineTotal: 10,
      },
    ],
    customItems: [],
    deliveryFee: 0,
    firstDeliveryDate: "2026-09-26",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const accepted = {
    ...draft,
    status: "Принят",
    exchange: {
      status: "not_sent",
      documentId: "1C-MGR-LATEST",
      oneCNumber: "UNF-MGR-9",
    },
    oneCDocumentId: "1C-MGR-LATEST",
    items: [
      {
        id: "line-r",
        productId: "prod-1",
        name: "P1",
        quantity: 7,
        unit: "piece",
        unitPrice: 150,
        lineTotal: 1050,
      },
    ],
    total: 1050,
    amount: 1050,
    updatedAt: "2026-09-16T12:05:00.000Z",
  };

  function forceWriteOrders(orders) {
    // Bypass client preserve (managerMode) for fixture resets only.
    replaceOrders({ orders, userId: client.id, managerMode: true });
  }

  forceWriteOrders([draft, keeper]);

  // A→B simulated: client still holds draft; manager accepted before write.
  forceWriteOrders([accepted, keeper]);
  // Client omit of o-race after accept
  replaceOrders({
    orders: [keeper],
    userId: client.id,
    managerMode: false,
  });
  let after = listOrders(client.id);
  assertManagerSnapshot(
    after.find((o) => o.id === "o-race"),
    "unit.omit"
  );
  console.log("PASS unit.omit: accepted survives omit after manager accept");

  // Reset to draft then accept via hook during replace with stale body
  forceWriteOrders([draft, keeper]);

  // Use raw payload update inside hook (same DB connection / txn visibility).
  const { db } = dbMod;
  dbMod.replaceOrdersTestHooks.beforeClientMerge = () => {
    const row = db.prepare("SELECT payload_json FROM orders WHERE id = ?").get("o-race");
    assert.ok(row);
    const payload = JSON.parse(row.payload_json);
    assert.equal(payload.status, "Новый");
    const next = {
      ...payload,
      ...accepted,
      clientId: client.id,
    };
    db.prepare(
      "UPDATE orders SET payload_json = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(
      JSON.stringify(next),
      next.updatedAt,
      "o-race",
      client.id
    );
  };

  try {
    replaceOrders({
      orders: [{ ...draft, items: [{ ...draft.items[0], quantity: 99 }] }, keeper],
      userId: client.id,
      managerMode: false,
    });
  } finally {
    dbMod.replaceOrdersTestHooks.beforeClientMerge = null;
  }

  after = listOrders(client.id);
  assertManagerSnapshot(
    after.find((o) => o.id === "o-race"),
    "unit.stale-body"
  );
  assert.notEqual(
    after.find((o) => o.id === "o-race")?.items?.[0]?.quantity,
    99
  );
  console.log("PASS unit.stale-body: DB accepted beats client draft body");

  // Hook + omit
  forceWriteOrders([draft, keeper]);
  dbMod.replaceOrdersTestHooks.beforeClientMerge = () => {
    const row = db.prepare("SELECT payload_json FROM orders WHERE id = ?").get("o-race");
    const payload = JSON.parse(row.payload_json);
    const next = { ...payload, ...accepted, clientId: client.id };
    db.prepare(
      "UPDATE orders SET payload_json = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(JSON.stringify(next), next.updatedAt, "o-race", client.id);
  };
  try {
    replaceOrders({
      orders: [keeper],
      userId: client.id,
      managerMode: false,
    });
  } finally {
    dbMod.replaceOrdersTestHooks.beforeClientMerge = null;
  }
  after = listOrders(client.id);
  assertManagerSnapshot(
    after.find((o) => o.id === "o-race"),
    "unit.hook-omit"
  );
  console.log("PASS unit.hook-omit: mid-txn accept preserved on omit");
}

function seedHttp() {
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  const seedPath = path.join(temp, "seed.mjs");
  writeFileSync(
    seedPath,
    `
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(${JSON.stringify(path.join(serverDir, "package.json"))});
const bcrypt = require("bcryptjs");
process.env.DB_PATH = ${JSON.stringify(databasePath)};
process.env.JWT_SECRET = ${JSON.stringify(jwtSecret)};
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
const {
  createUser, replaceOrders, setGlobalState, setClientStateField, db,
} = await import(${JSON.stringify(pathToFileURL(path.join(serverDir, "src/db.js")).href)});
const dbMod = await import(${JSON.stringify(pathToFileURL(path.join(serverDir, "src/db.js")).href)});

const passwordHash = bcrypt.hashSync(${JSON.stringify(password)}, 4);
const client = createUser({
  email: "conc-http@test.local", passwordHash, role: "client",
  emailVerified: true, approvalStatus: "approved",
});
setClientStateField(client.id, "addresses", [{ id: "addr-a", label: "A", street: "A1" }]);
setGlobalState("products", [{
  id: "prod-1", name: "P1", active: true, pricePiece: 100,
  purchasePrices: { piece: 40 }, purchasePriceUpdatedAt: "2026-09-01T00:00:00.000Z",
}]);
setGlobalState("oneCProducts", [{
  id: "1c-p1", cloverProductId: "prod-1",
  purchasePrices: { piece: 40 }, purchasePriceUpdatedAt: "2026-09-01T00:00:00.000Z",
}]);
setGlobalState("clientLinks", {
  [client.id]: {
    matrixMode: "selected", matrixProductIds: ["prod-1"], allowFullCatalog: false,
    defaultPricingMode: "manual", personalPrices: { "prod-1": { piece: 120 } },
  },
});
setGlobalState("settings", {
  showPrices: true, allowClientEdit: true, allowClientDelete: true,
});
const nowIso = "2026-09-16T12:00:00.000Z";
const draft = {
  id: "o-race", number: "R-1", clientId: client.id, customerName: "Conc Co",
  customerEmail: client.email, status: "Новый", exchange: { status: "not_sent" },
  items: [{ id: "line-r", productId: "prod-1", name: "P1", quantity: 1, unit: "piece", unitPrice: 120, lineTotal: 120 }],
  customItems: [], deliveryFee: 0, firstDeliveryDate: "2026-09-25",
  createdAt: nowIso, updatedAt: nowIso, total: 120, amount: 120,
};
const other = {
  id: "o-keep", number: "K-1", clientId: client.id, customerName: "Conc Co",
  customerEmail: client.email, status: "Новый", exchange: { status: "not_sent" },
  items: [{ id: "line-k", productId: "prod-1", name: "P1", quantity: 1, unit: "piece", unitPrice: 120, lineTotal: 120 }],
  customItems: [], deliveryFee: 0, firstDeliveryDate: "2026-09-26",
  createdAt: nowIso, updatedAt: nowIso,
};
replaceOrders({ orders: [draft, other], userId: client.id, managerMode: false });

// Install process-global hook file the server child will load via env path
writeFileSync(${JSON.stringify(path.join(temp, "hook-flag.json"))}, JSON.stringify({ arm: true }));
writeFileSync(${JSON.stringify(path.join(temp, "seed.json"))}, JSON.stringify({ client, draft, other }));
`
  );
  const seeded = spawnSync(process.execPath, [seedPath], {
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
  if (seeded.status !== 0) {
    throw new Error(`seed failed: ${seeded.stderr || seeded.stdout}`);
  }
  return JSON.parse(readFileSync(path.join(temp, "seed.json"), "utf8"));
}

async function runHttp(seeded) {
  const hookFlag = path.join(temp, "hook-arm.json");
  writeFileSync(hookFlag, JSON.stringify({ arm: true }));

  const preload = path.join(temp, "preload-hook.mjs");
  writeFileSync(
    preload,
    `
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
const flagPath = ${JSON.stringify(hookFlag)};
const dbUrl = pathToFileURL(${JSON.stringify(path.join(serverDir, "src/db.js"))}).href;
const dbMod = await import(dbUrl);
dbMod.replaceOrdersTestHooks.beforeClientMerge = ({ userId }) => {
  if (!existsSync(flagPath)) return;
  let arm = false;
  try {
    arm = Boolean(JSON.parse(readFileSync(flagPath, "utf8")).arm);
  } catch {
    return;
  }
  if (!arm) return;
  writeFileSync(flagPath, JSON.stringify({ arm: false }));
  const { db } = dbMod;
  const row = db.prepare("SELECT payload_json FROM orders WHERE id = ?").get("o-race");
  if (!row) return;
  const payload = JSON.parse(row.payload_json);
  if (String(payload.status) !== "Новый") return;
  const accepted = {
    ...payload,
    status: "Принят",
    exchange: {
      status: "not_sent",
      documentId: "1C-MGR-LATEST",
      oneCNumber: "UNF-MGR-9",
    },
    oneCDocumentId: "1C-MGR-LATEST",
    items: [{
      id: "line-r", productId: "prod-1", name: "P1",
      quantity: 7, unit: "piece", unitPrice: 150, lineTotal: 1050,
    }],
    total: 1050,
    amount: 1050,
    updatedAt: "2026-09-16T12:05:00.000Z",
    clientId: userId,
  };
  db.prepare(
    "UPDATE orders SET payload_json = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).run(JSON.stringify(accepted), accepted.updatedAt, "o-race", userId);
};
`
  );

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    ["--import", preload, "src/server.js"],
    {
      cwd: serverDir,
      env: {
        ...process.env,
        DB_PATH: databasePath,
        JWT_SECRET: jwtSecret,
        PORT: String(port),
        HOST: "127.0.0.1",
        CLOVER_UPLOADS_DIR: uploadsDir,
        CLOVER_SERVER_BACKUP_DIR: backupDir,
        ALLOW_DEV_AUTH_LINKS: "false",
        MANAGER_EMAIL: "",
        MANAGER_PASSWORD: "",
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let stderr = "";
  child.stderr.on("data", (c) => {
    stderr += String(c);
  });

  try {
    await waitHealth(base);
    const login = await api(base, "/api/auth/login", {
      method: "POST",
      body: { email: seeded.client.email, password },
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const token = login.json.token;
    const boot1 = await api(base, "/api/bootstrap", { token });
    assert.equal(boot1.status, 200);
    const draftView = (boot1.json.orders || []).find((o) => o.id === "o-race");
    assert.equal(draftView.status, "Новый");

    const putOmit = await api(base, "/api/state/orders", {
      method: "PUT",
      token,
      body: {
        orders: (boot1.json.orders || []).filter((o) => o.id !== "o-race"),
      },
    });
    assert.equal(putOmit.status, 200, JSON.stringify(putOmit.json));
    assertManagerSnapshot(
      (putOmit.json.orders || []).find((o) => o.id === "o-race"),
      "http.put-omit-response"
    );
    const boot2 = await api(base, "/api/bootstrap", { token });
    assertManagerSnapshot(
      (boot2.json.orders || []).find((o) => o.id === "o-race"),
      "http.bootstrap-after-omit"
    );
    console.log("PASS http.omit: mid-request accept preserved; not deleted/draft");

    // Disarm hook, reset fixture to draft via SQL (same file, committed).
    writeFileSync(hookFlag, JSON.stringify({ arm: false }));
    const reset = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
process.env.DB_PATH = ${JSON.stringify(databasePath)};
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
const m = await import(${JSON.stringify(pathToFileURL(path.join(serverDir, "src/db.js")).href)});
const draft = ${JSON.stringify(seeded.draft)};
const keep = m.listOrders(${JSON.stringify(seeded.client.id)}).find((o) => o.id === "o-keep");
if (!keep) throw new Error("missing o-keep");
m.replaceOrders({
  orders: [draft, keep],
  userId: ${JSON.stringify(seeded.client.id)},
  managerMode: true,
});
const race = m.listOrders(${JSON.stringify(seeded.client.id)}).find((o) => o.id === "o-race");
if (!race || race.status !== "Новый") {
  throw new Error("reset failed status=" + (race && race.status));
}
console.log("RESET_OK", race.status);
`,
      ],
      { cwd: serverDir, encoding: "utf8" }
    );
    assert.equal(reset.status, 0, reset.stderr + reset.stdout);
    assert.match(reset.stdout, /RESET_OK Новый/);

    writeFileSync(hookFlag, JSON.stringify({ arm: true }));
    const boot3 = await api(base, "/api/bootstrap", { token });
    const stale = (boot3.json.orders || []).find((o) => o.id === "o-race");
    assert.equal(stale?.status, "Новый", JSON.stringify(stale));
    const putStale = await api(base, "/api/state/orders", {
      method: "PUT",
      token,
      body: {
        orders: (boot3.json.orders || []).map((o) =>
          o.id === "o-race"
            ? {
                ...o,
                items: [
                  {
                    ...o.items[0],
                    quantity: 99,
                    unitPrice: 1,
                    lineTotal: 99,
                  },
                ],
              }
            : o
        ),
      },
    });
    assert.equal(putStale.status, 200, JSON.stringify(putStale.json));
    assertManagerSnapshot(
      (putStale.json.orders || []).find((o) => o.id === "o-race"),
      "http.put-stale-response"
    );
    const boot4 = await api(base, "/api/bootstrap", { token });
    assertManagerSnapshot(
      (boot4.json.orders || []).find((o) => o.id === "o-race"),
      "http.bootstrap-after-stale"
    );
    console.log("PASS http.stale-body: manager DB version wins over draft body");
  } catch (error) {
    console.error(stderr.slice(-2500));
    throw error;
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  console.log("TEMP_DB", databasePath);
  try {
    // Fresh DB for unit
    rmSync(databasePath, { force: true });
    await runDbUnit();
    const seeded = seedHttp();
    await runHttp(seeded);
    console.log("\n=== verify-s2-new-001-concurrency: OK ===");
  } catch (error) {
    console.error("VERIFY_FAIL", error);
    process.exitCode = 1;
  }
}

main();
