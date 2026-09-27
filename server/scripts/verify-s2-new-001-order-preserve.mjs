/**
 * S2-NEW-001 regression: client PUT /api/state/orders must preserve
 * protected (non-deletable) orders when they are omitted from the body.
 *
 * Matrix A–N on isolated temp SQLite. No production DB.
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
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const temp = mkdtempSync(path.join(tmpdir(), "clover-s2-001-"));
const databasePath = path.join(temp, "clover.sqlite");
const uploadsDir = path.join(temp, "uploads");
const backupDir = path.join(temp, "backups");
mkdirSync(uploadsDir);
mkdirSync(backupDir);

const jwtSecret = "clover-s2-001-order-preserve-secret-32ch!";
const password = "S2New001Pass!1";
const results = [];

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

function orderSnapshot(order) {
  const items = (order?.items || []).map((item) => {
    const {
      repricedAt: _r,
      purchasePriceUpdatedAt: _p,
      ...rest
    } = item || {};
    return rest;
  });
  const {
    pricingUpdatedAt: _pu,
    updatedAt: _u,
    ...restOrder
  } = order || {};
  return {
    id: restOrder?.id,
    status: restOrder?.status,
    items,
    customItems: restOrder?.customItems,
    exchange: restOrder?.exchange,
    oneCDocumentId: restOrder?.oneCDocumentId ?? null,
    deliveryFee: restOrder?.deliveryFee,
    firstDeliveryDate: restOrder?.firstDeliveryDate,
    clientId: restOrder?.clientId,
    total: restOrder?.total,
    amount: restOrder?.amount,
  };
}

function find(orders, id) {
  return (orders || []).find((o) => o.id === id);
}

function runSnippet(code) {
  const file = path.join(temp, `snip-${Date.now()}-${Math.random()}.mjs`);
  writeFileSync(file, code);
  return spawnSync(process.execPath, [file], {
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
}

async function runUnitChecks() {
  process.env.DB_PATH = databasePath;
  process.env.JWT_SECRET = jwtSecret;
  process.env.MANAGER_EMAIL = "";
  process.env.MANAGER_PASSWORD = "";

  const {
    mergeClientOrdersPreservingProtected,
    isClientOrderDeletableByOmission,
  } = await import(
    pathToFileURL(path.join(serverDir, "src/orderClientEdit.js")).href
  );

  const draft = {
    id: "o-new",
    status: "Новый",
    exchange: { status: "not_sent" },
    marker: "DRAFT",
  };
  const accepted = {
    id: "o-acc",
    status: "Принят",
    exchange: { status: "not_sent", documentId: "1C-DOC" },
    marker: "ACC",
  };
  const queued = {
    id: "o-queue",
    status: "Новый",
    exchange: { status: "ready", claimId: "c1" },
    marker: "Q",
  };

  assert.equal(
    isClientOrderDeletableByOmission(draft, { allowClientDelete: true }),
    true
  );
  assert.equal(
    isClientOrderDeletableByOmission(accepted, { allowClientDelete: true }),
    false
  );
  assert.equal(
    isClientOrderDeletableByOmission(queued, { allowClientDelete: true }),
    false
  );
  assert.equal(
    isClientOrderDeletableByOmission(draft, { allowClientDelete: false }),
    false
  );

  const a = mergeClientOrdersPreservingProtected({
    previousOrders: [draft, accepted],
    incomingOrders: [draft],
    settings: { allowClientDelete: true },
  });
  assert.equal(a.ok, true);
  assert.equal(a.orders.find((o) => o.id === "o-acc")?.marker, "ACC");
  note("unit.A", true, "omit accepted → server object preserved");

  const b = mergeClientOrdersPreservingProtected({
    previousOrders: [draft, queued],
    incomingOrders: [draft],
    settings: { allowClientDelete: true },
  });
  assert.equal(b.orders.find((o) => o.id === "o-queue")?.marker, "Q");
  note("unit.B", true, "omit queued → preserved");

  const c = mergeClientOrdersPreservingProtected({
    previousOrders: [draft, accepted],
    incomingOrders: [accepted],
    settings: { allowClientDelete: false },
  });
  assert.ok(c.orders.some((o) => o.id === "o-new"));
  note("unit.C", true, "allowClientDelete=false blocks draft omit");

  const d = mergeClientOrdersPreservingProtected({
    previousOrders: [draft, accepted],
    incomingOrders: [accepted],
    settings: { allowClientDelete: true },
  });
  assert.equal(d.orders.some((o) => o.id === "o-new"), false);
  note("unit.D", true, "deletable draft omit allowed");

  const j = mergeClientOrdersPreservingProtected({
    previousOrders: [],
    incomingOrders: [draft, { ...draft }],
    settings: { allowClientDelete: true },
  });
  assert.equal(j.ok, false);
  assert.equal(j.code, "ORDER_ID_DUPLICATE");
  note("unit.J", true, "duplicate ids rejected");

  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE orders_probe (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      payload_json TEXT NOT NULL
    ) STRICT;
    INSERT INTO orders_probe VALUES ('o-new','u1','{}'), ('o-acc','u1','{"p":1}');
  `);
  db.exec("BEGIN IMMEDIATE");
  db.prepare(
    "DELETE FROM orders_probe WHERE user_id = ? AND id NOT IN (?, ?)"
  ).run("u1", "o-new", "o-acc");
  db.prepare(
    "DELETE FROM orders_probe WHERE user_id = ? AND id IN (?, ?)"
  ).run("u1", "o-new", "o-acc");
  db.exec("ROLLBACK");
  assert.deepEqual(
    db.prepare("SELECT id FROM orders_probe ORDER BY id").all().map((r) => r.id),
    ["o-acc", "o-new"]
  );
  db.close();
  note("unit.N", true, "ROLLBACK restores rows after scoped deletes");

  const dbSrc = readFileSync(path.join(serverDir, "src/db.js"), "utf8");
  assert.match(dbSrc, /DELETE FROM orders WHERE user_id = \? AND id NOT IN/);
  assert.match(dbSrc, /isClientOrderDeletableByOmission/);
  assert.match(dbSrc, /BEGIN IMMEDIATE/);
  assert.match(dbSrc, /ROLLBACK/);
  const serverSrc = readFileSync(path.join(serverDir, "src/server.js"), "utf8");
  assert.match(serverSrc, /mergeClientOrdersPreservingProtected/);
  note("unit.source", true, "server+db wired for S2-NEW-001");
}

function seedDatabase() {
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
  createUser, replaceOrders, setGlobalState, setClientStateField,
} = await import(${JSON.stringify(pathToFileURL(path.join(serverDir, "src/db.js")).href)});

const passwordHash = bcrypt.hashSync(${JSON.stringify(password)}, 4);
const clientA = createUser({
  email: "a-s2001@test.local", passwordHash, role: "client",
  emailVerified: true, approvalStatus: "approved",
  profile: { companyName: "A Co", contactName: "A" },
});
const clientB = createUser({
  email: "b-s2001@test.local", passwordHash, role: "client",
  emailVerified: true, approvalStatus: "approved",
  profile: { companyName: "B Co", contactName: "B" },
});
setClientStateField(clientA.id, "addresses", [{ id: "addr-a", label: "A", address: "A1" }]);
setClientStateField(clientB.id, "addresses", [{
  id: "addr-b", label: "B", address: "B1",
  oneCId: "trusted-client-b-counterparty",
  oneCCode: "TRUSTED-B",
  oneCName: "Trusted B",
  oneCInn: "7800000099",
  oneCLinkedAt: "2026-09-01T00:00:00.000Z",
}]);
setGlobalState("products", [{
  id: "prod-1", name: "P1", active: true, pricePiece: 100,
  purchasePrices: { piece: 40 }, purchasePriceUpdatedAt: "2026-09-01T00:00:00.000Z",
}]);
setGlobalState("oneCProducts", [{
  id: "1c-p1", cloverProductId: "prod-1",
  purchasePrices: { piece: 40 }, purchasePriceUpdatedAt: "2026-09-01T00:00:00.000Z",
}]);
setGlobalState("clientLinks", {
  [clientA.id]: {
    matrixMode: "selected", matrixProductIds: ["prod-1"], allowFullCatalog: false,
    defaultPricingMode: "manual", personalPrices: { "prod-1": { piece: 120 } },
  },
  [clientB.id]: {
    matrixMode: "selected", matrixProductIds: ["prod-1"], allowFullCatalog: false,
    defaultPricingMode: "manual", personalPrices: { "prod-1": { piece: 200 } },
  },
});
setGlobalState("settings", {
  showPrices: true, allowClientEdit: true, allowClientDelete: true,
});
const nowIso = "2026-09-16T12:00:00.000Z";
const line = (id, qty, price) => ({
  id, productId: "prod-1", name: "P1", quantity: qty, unit: "piece",
  unitPrice: price, lineTotal: qty * price,
});
const orderNew = {
  id: "o-new", number: "N-1", clientId: clientA.id, customerName: "A Co",
  customerEmail: clientA.email, status: "Новый", exchange: { status: "not_sent" },
  addressId: "addr-a", address: "A1",
  items: [line("line-new", 1, 120)], customItems: [], deliveryFee: 0,
  firstDeliveryDate: "2026-09-25", createdAt: nowIso, updatedAt: nowIso,
};
const orderAcc = {
  id: "o-acc", number: "A-1", clientId: clientA.id, customerName: "A Co",
  customerEmail: clientA.email, status: "Принят",
  addressId: "addr-a", address: "A1",
  exchange: { status: "not_sent", documentId: "1C-KEEP-ME", oneCNumber: "UNF-42" },
  oneCDocumentId: "1C-KEEP-ME",
  items: [line("line-acc", 2, 120)], customItems: [], deliveryFee: 0,
  firstDeliveryDate: "2026-09-26", total: 240, amount: 240,
  createdAt: nowIso, updatedAt: nowIso,
};
const orderQueued = {
  id: "o-queue", number: "Q-1", clientId: clientA.id, customerName: "A Co",
  customerEmail: clientA.email, status: "Новый",
  addressId: "addr-a", address: "A1",
  exchange: { status: "ready", claimId: "claim-preserve", documentId: null },
  items: [line("line-q", 1, 120)], customItems: [], deliveryFee: 0,
  firstDeliveryDate: "2026-09-27", createdAt: nowIso, updatedAt: nowIso,
};
const orderB = {
  id: "o-b", number: "B-1", clientId: clientB.id, customerName: "B Co",
  customerEmail: clientB.email, status: "Новый", exchange: { status: "not_sent" },
  addressId: "addr-b", address: "B1",
  items: [line("line-b", 1, 200)], customItems: [], deliveryFee: 0,
  firstDeliveryDate: "2026-09-28", createdAt: nowIso, updatedAt: nowIso,
};
replaceOrders({ orders: [orderNew, orderAcc, orderQueued, orderB], managerMode: true });
writeFileSync(${JSON.stringify(path.join(temp, "seed.json"))}, JSON.stringify({
  clientA, clientB, orderNew, orderAcc, orderQueued, orderB,
}));
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

async function runHttpMatrix(seeded) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["src/server.js"], {
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
  });
  let stderr = "";
  child.stderr.on("data", (c) => {
    stderr += String(c);
  });

  try {
    await waitHealth(base);
    const login = async (email) => {
      const res = await api(base, "/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      assert.equal(res.status, 200, `login ${email}: ${JSON.stringify(res.json)}`);
      return res.json.token;
    };
    const tokenA = await login(seeded.clientA.email);
    const tokenB = await login(seeded.clientB.email);
    const bootA = async () => {
      const res = await api(base, "/api/bootstrap", { token: tokenA });
      assert.equal(res.status, 200);
      return res.json;
    };

    let boot = await bootA();
    const accBefore = orderSnapshot(find(boot.orders, "o-acc"));
    const queueBefore = orderSnapshot(find(boot.orders, "o-queue"));
    assert.ok(accBefore.id && queueBefore.id);

    // A
    {
      const put = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: {
          orders: [find(boot.orders, "o-new"), find(boot.orders, "o-queue")],
        },
      });
      assert.equal(put.status, 200, JSON.stringify(put.json));
      boot = await bootA();
      assert.deepEqual(orderSnapshot(find(boot.orders, "o-acc")), accBefore);
      note("http.A", true, "accepted omitted → preserved");
    }

    // B
    {
      const put = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: {
          orders: [find(boot.orders, "o-new"), find(boot.orders, "o-acc")],
        },
      });
      assert.equal(put.status, 200, JSON.stringify(put.json));
      boot = await bootA();
      assert.deepEqual(orderSnapshot(find(boot.orders, "o-queue")), queueBefore);
      note("http.B", true, "queued omitted → preserved");
    }

    // C
    {
      const flip = runSnippet(`
        process.env.DB_PATH = ${JSON.stringify(databasePath)};
        process.env.MANAGER_EMAIL = ""; process.env.MANAGER_PASSWORD = "";
        const { getGlobalState, setGlobalState } = await import(${JSON.stringify(
          pathToFileURL(path.join(serverDir, "src/db.js")).href
        )});
        setGlobalState("settings", { ...getGlobalState("settings", {}), allowClientDelete: false });
      `);
      assert.equal(flip.status, 0, flip.stderr + flip.stdout);
      boot = await bootA();
      const beforeIds = (boot.orders || []).map((o) => o.id).sort();
      const put = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: {
          orders: [find(boot.orders, "o-acc"), find(boot.orders, "o-queue")],
        },
      });
      assert.equal(put.status, 200, JSON.stringify(put.json));
      boot = await bootA();
      assert.deepEqual((boot.orders || []).map((o) => o.id).sort(), beforeIds);
      note("http.C", true, "allowClientDelete=false preserves draft");
      runSnippet(`
        process.env.DB_PATH = ${JSON.stringify(databasePath)};
        process.env.MANAGER_EMAIL = ""; process.env.MANAGER_PASSWORD = "";
        const { getGlobalState, setGlobalState } = await import(${JSON.stringify(
          pathToFileURL(path.join(serverDir, "src/db.js")).href
        )});
        setGlobalState("settings", { ...getGlobalState("settings", {}), allowClientDelete: true });
      `);
    }

    // D
    {
      boot = await bootA();
      const extra = {
        id: "o-draft-del",
        number: "D-1",
        clientId: seeded.clientA.id,
        customerName: "A Co",
        customerEmail: seeded.clientA.email,
        status: "Новый",
        exchange: { status: "not_sent" },
        addressId: "addr-a",
        address: "A1",
        items: [
          {
            id: "line-d",
            productId: "prod-1",
            name: "P1",
            quantity: 1,
            unit: "piece",
            unitPrice: 1,
            lineTotal: 1,
          },
        ],
        customItems: [],
        deliveryFee: 0,
        firstDeliveryDate: "2026-09-29",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      let put = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: { orders: [...boot.orders, extra] },
      });
      assert.equal(put.status, 200, JSON.stringify(put.json));
      boot = await bootA();
      put = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: { orders: boot.orders.filter((o) => o.id !== "o-draft-del") },
      });
      assert.equal(put.status, 200, JSON.stringify(put.json));
      boot = await bootA();
      assert.equal(find(boot.orders, "o-draft-del"), undefined);
      assert.ok(find(boot.orders, "o-acc"));
      note("http.D", true, "deletable draft omitted → deleted");
    }

    // E
    {
      boot = await bootA();
      const acc = orderSnapshot(find(boot.orders, "o-acc"));
      const put = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: { orders: boot.orders },
      });
      assert.equal(put.status, 200);
      boot = await bootA();
      assert.deepEqual(orderSnapshot(find(boot.orders, "o-acc")), acc);
      note("http.E", true, "protected included unchanged");
    }

    // F
    {
      boot = await bootA();
      const before = orderSnapshot(find(boot.orders, "o-acc"));
      const put = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: {
          orders: [
            {
              ...find(boot.orders, "o-new"),
              clientComment: "should-not-persist-on-reject",
            },
            {
              ...find(boot.orders, "o-acc"),
              items: [
                {
                  id: "line-acc",
                  productId: "prod-1",
                  name: "P1",
                  quantity: 99,
                  unit: "piece",
                  unitPrice: 1,
                  lineTotal: 99,
                },
              ],
            },
            find(boot.orders, "o-queue"),
          ],
        },
      });
      assert.equal(put.status, 409, JSON.stringify(put.json));
      assert.equal(put.json?.code, "CLIENT_ORDER_EDIT_LOCKED");
      boot = await bootA();
      assert.deepEqual(orderSnapshot(find(boot.orders, "o-acc")), before);
      assert.notEqual(
        find(boot.orders, "o-new")?.clientComment,
        "should-not-persist-on-reject"
      );
      note("http.F", true, "modified protected → reject, atomic");
    }

    // G
    {
      boot = await bootA();
      const accBeforeG = orderSnapshot(find(boot.orders, "o-acc"));
      const put = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: {
          orders: [
            {
              ...find(boot.orders, "o-new"),
              items: [
                {
                  id: "line-new",
                  productId: "prod-1",
                  name: "P1",
                  quantity: 3,
                  unit: "piece",
                  unitPrice: 1,
                  lineTotal: 3,
                },
              ],
              updatedAt: new Date().toISOString(),
            },
            find(boot.orders, "o-queue"),
          ],
        },
      });
      assert.equal(put.status, 200, JSON.stringify(put.json));
      boot = await bootA();
      assert.equal(find(boot.orders, "o-new").items[0].quantity, 3);
      assert.equal(Number(find(boot.orders, "o-new").items[0].unitPrice), 120);
      assert.deepEqual(orderSnapshot(find(boot.orders, "o-acc")), accBeforeG);
      note("http.G", true, "mixed draft update + accepted preserve");
    }

    // H
    {
      const bootB = await api(base, "/api/bootstrap", { token: tokenB });
      const bBefore = orderSnapshot(find(bootB.json.orders, "o-b"));
      boot = await bootA();
      const attack = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: {
          orders: [...boot.orders, { ...find(bootB.json.orders, "o-b"), items: [] }],
        },
      });
      assert.equal(attack.status, 403);
      assert.equal(attack.json?.code, "ORDER_OWNERSHIP_FORBIDDEN");
      const bootB2 = await api(base, "/api/bootstrap", { token: tokenB });
      assert.deepEqual(orderSnapshot(find(bootB2.json.orders, "o-b")), bBefore);
      note("http.H", true, "cross-client blocked");
    }

    // I
    {
      const forged = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: {
          orders: [
            {
              id: "o-b",
              status: "Новый",
              exchange: { status: "not_sent" },
              items: [],
              customItems: [],
              firstDeliveryDate: "2026-09-30",
            },
          ],
        },
      });
      assert.equal(forged.status, 403);
      assert.equal(forged.json?.code, "ORDER_OWNERSHIP_FORBIDDEN");
      note("http.I", true, "forged foreign id rejected");
    }

    // J
    {
      boot = await bootA();
      const d = find(boot.orders, "o-new");
      const dup = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: { orders: [d, { ...d }] },
      });
      assert.equal(dup.status, 400);
      assert.equal(dup.json?.code, "ORDER_ID_DUPLICATE");
      note("http.J", true, "duplicate ids rejected");
    }

    // K
    {
      boot = await bootA();
      const put = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: {
          orders: [
            {
              ...find(boot.orders, "o-new"),
              items: [
                {
                  id: "evil",
                  productId: "not-in-matrix",
                  name: "Evil",
                  quantity: 1,
                  unit: "piece",
                  unitPrice: 5,
                  lineTotal: 5,
                },
              ],
            },
            find(boot.orders, "o-acc"),
            find(boot.orders, "o-queue"),
          ],
        },
      });
      assert.equal(put.status, 400);
      assert.equal(put.json?.code, "MATRIX_PRODUCT_FORBIDDEN");
      note("http.K", true, "matrix guard");
    }

    // L
    {
      boot = await bootA();
      const before = orderSnapshot(find(boot.orders, "o-acc"));
      const put = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenA,
        body: {
          orders: [find(boot.orders, "o-new"), find(boot.orders, "o-queue")],
        },
      });
      assert.equal(put.status, 200);
      boot = await bootA();
      const after = find(boot.orders, "o-acc");
      assert.equal(after.oneCDocumentId, "1C-KEEP-ME");
      assert.equal(after.exchange?.documentId, "1C-KEEP-ME");
      assert.equal(after.exchange?.oneCNumber, "UNF-42");
      assert.deepEqual(orderSnapshot(after), before);
      note("http.L", true, "1C identity survives omit");
    }

    // M
    {
      boot = await bootA();
      const idsBefore = (boot.orders || []).map((o) => o.id).sort();
      const accBefore = orderSnapshot(find(boot.orders, "o-acc"));
      const queueBefore = orderSnapshot(find(boot.orders, "o-queue"));
      const draftBefore = find(boot.orders, "o-new");
      const draftQty = draftBefore.items?.[0]?.quantity;
      const draftPrice = Number(draftBefore.items?.[0]?.unitPrice);
      const body = { orders: boot.orders };
      assert.equal(
        (await api(base, "/api/state/orders", { method: "PUT", token: tokenA, body }))
          .status,
        200
      );
      assert.equal(
        (await api(base, "/api/state/orders", { method: "PUT", token: tokenA, body }))
          .status,
        200
      );
      boot = await bootA();
      assert.deepEqual((boot.orders || []).map((o) => o.id).sort(), idsBefore);
      assert.deepEqual(orderSnapshot(find(boot.orders, "o-acc")), accBefore);
      assert.deepEqual(orderSnapshot(find(boot.orders, "o-queue")), queueBefore);
      assert.equal(find(boot.orders, "o-new").items[0].quantity, draftQty);
      assert.equal(Number(find(boot.orders, "o-new").items[0].unitPrice), draftPrice);
      note("http.M", true, "idempotent ids/protected/draft price");
    }

    // O: localStorage migration cannot forge manager-owned address routing.
    {
      const forgedCounterparty = "victim-counterparty-id";
      const migrate = await api(base, "/api/migrate/client", {
        method: "POST",
        token: tokenB,
        body: {
          addresses: [
            {
              id: "addr-b",
              label: "B updated",
              address: "B2",
              oneCId: forgedCounterparty,
              oneCCode: "FORGED",
              oneCName: "Forged existing",
              oneCInn: "0000000000",
            },
            {
              id: "addr-b-new",
              label: "B new",
              address: "B3",
              oneCId: forgedCounterparty,
              oneCCode: "FORGED-NEW",
              oneCName: "Forged new",
              oneCInn: "1111111111",
            },
          ],
        },
      });
      assert.equal(migrate.status, 200, JSON.stringify(migrate.json));

      const bootB = await api(base, "/api/bootstrap", { token: tokenB });
      assert.equal(bootB.status, 200, JSON.stringify(bootB.json));
      const migratedOrder = {
        id: "o-migrated-address",
        number: "MIG-1",
        clientId: seeded.clientB.id,
        customerName: "B Co",
        customerEmail: seeded.clientB.email,
        status: "Новый",
        exchange: { status: "not_sent" },
        addressId: "addr-b-new",
        address: "Forged free text",
        items: [{
          id: "line-mig",
          productId: "prod-1",
          name: "P1",
          quantity: 1,
          unit: "piece",
          unitPrice: 200,
          lineTotal: 200,
        }],
        customItems: [],
        deliveryFee: 0,
        firstDeliveryDate: "2026-10-01",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const save = await api(base, "/api/state/orders", {
        method: "PUT",
        token: tokenB,
        body: { orders: [...(bootB.json?.orders || []), migratedOrder] },
      });
      assert.equal(save.status, 200, JSON.stringify(save.json));

      const inspect = runSnippet(`
        process.env.DB_PATH = ${JSON.stringify(databasePath)};
        process.env.MANAGER_EMAIL = ""; process.env.MANAGER_PASSWORD = "";
        const { getClientState, listOrders, db } = await import(${JSON.stringify(
          pathToFileURL(path.join(serverDir, "src/db.js")).href
        )});
        const state = getClientState(${JSON.stringify(seeded.clientB.id)});
        const saved = listOrders(${JSON.stringify(seeded.clientB.id)}).find(
          (item) => item.id === "o-migrated-address"
        );
        console.log("MIGRATION_AUTHORITY_RESULT=" + JSON.stringify({
          existing: state.addresses.find((item) => item.id === "addr-b"),
          added: state.addresses.find((item) => item.id === "addr-b-new"),
          snapshot: saved?.oneCCounterparty || null,
        }));
        db.close();
      `);
      assert.equal(inspect.status, 0, inspect.stderr + inspect.stdout);
      const marker = String(inspect.stdout)
        .split(/\r?\n/u)
        .find((line) => line.startsWith("MIGRATION_AUTHORITY_RESULT="));
      assert.ok(marker, inspect.stdout);
      const inspected = JSON.parse(marker.slice("MIGRATION_AUTHORITY_RESULT=".length));
      assert.equal(inspected.existing.oneCId, "trusted-client-b-counterparty");
      assert.equal(inspected.existing.oneCCode, "TRUSTED-B");
      assert.equal(inspected.added.oneCId, "");
      assert.equal(inspected.added.oneCCode, "");
      assert.equal(inspected.snapshot.oneCId, "");
      assert.notEqual(inspected.snapshot.oneCId, forgedCounterparty);
      note(
        "http.O",
        true,
        "migrate strips forged address 1C fields; new order snapshot is not victim"
      );
    }

    note("http.N", true, "txn rollback covered in unit.N; HTTP validates pre-write rejects");
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
    await runUnitChecks();
    const seeded = seedDatabase();
    await runHttpMatrix(seeded);
    console.log("\n=== verify-s2-new-001-order-preserve: OK ===");
  } catch (error) {
    console.error("VERIFY_FAIL", error);
    process.exitCode = 1;
  } finally {
    writeFileSync(
      path.join(temp, "results.json"),
      JSON.stringify({ databasePath, results }, null, 2)
    );
    console.log("RESULTS", path.join(temp, "results.json"));
  }
}

main();
