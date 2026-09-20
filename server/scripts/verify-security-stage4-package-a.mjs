/**
 * Security Stage 4 Package A — route-specific JSON body limits.
 *
 * Isolated loopback only. Temp SQLite + temp dirs. Synthetic fixtures.
 * No production/TEST 1C, mail, or external network.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { createServer } from "node:net";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const WORKTREE_DATA = path.resolve(root, "server/data");

const temp = mkdtempSync(path.join(tmpdir(), "clover-s4a-"));
const databasePath = path.join(temp, "clover.sqlite");
const emptyEnvPath = path.join(temp, "empty.env");
const seedScriptPath = path.join(temp, "seed.mjs");
const seedMetaPath = path.join(temp, "seed.json");
writeFileSync(emptyEnvPath, "");

function rejectUnsafePath(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
  if (resolved === WORKTREE_DATA || resolved.startsWith(`${WORKTREE_DATA}${path.sep}`)) {
    throw new Error(`Refusing worktree DB path: ${resolved}`);
  }
}
rejectUnsafePath(databasePath);

const jwtSecret = "clover-s4a-payload-limits-secret-32ch!";
const password = "S4aPayloadLimitsPass!1";
const oneCKey = "clover-s4a-test-exchange-key-24x";
const results = [];

const AUTH_OVERSIZE = 40 * 1024;
const DEFAULT_OVERSIZE = 300 * 1024;
const BULK_OVERSIZE = 25 * 1024 * 1024;

function note(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${detail}`);
  if (!ok) throw new Error(`ASSERT_FAIL ${id}: ${detail}`);
}

function moduleUrl(absolutePath) {
  return pathToFileURL(absolutePath).href;
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

async function waitHealth(base, attempts = 200) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server health timeout");
}

function jsonSafe(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: String(text || "").slice(0, 400) };
  }
}

async function rawRequest(port, {
  method = "POST",
  path: pathname,
  headers = {},
  body,
  token,
  oneC,
} = {}) {
  const payload = body === undefined || Buffer.isBuffer(body) || typeof body === "string"
    ? body
    : JSON.stringify(body);
  const finalHeaders = {
    Accept: "application/json",
    ...headers,
  };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  if (oneC) {
    finalHeaders["X-Clover-Key"] = oneCKey;
    finalHeaders["X-Clover-Database"] = "TEST";
  }
  if (payload !== undefined && !finalHeaders["Content-Type"] && !finalHeaders["content-type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: finalHeaders,
    body: payload,
  });
  const text = await res.text();
  return {
    status: res.status,
    text,
    json: jsonSafe(text),
    headers: res.headers,
  };
}

function jsonRaw(port, {
  method = "POST",
  pathname,
  token,
  oneC,
  body,
} = {}) {
  const payload = Buffer.from(
    body === undefined || Buffer.isBuffer(body) || typeof body === "string"
      ? body ?? ""
      : JSON.stringify(body)
  );
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Content-Length": String(payload.length),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (oneC) {
    headers["X-Clover-Key"] = oneCKey;
    headers["X-Clover-Database"] = "TEST";
  }
  return httpRaw({ port, method, pathname, headers, chunks: [payload] });
}

function httpRaw({ port, method, pathname, headers, chunks }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: pathname,
        headers,
      },
      (res) => {
        const parts = [];
        res.on("data", (chunk) => parts.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(parts).toString("utf8");
          resolve({
            status: res.statusCode,
            text,
            json: jsonSafe(text),
          });
        });
      }
    );
    req.on("error", reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

function assertSafe413(res, label) {
  note(
    `${label}.413`,
    res.status === 413 && res.json?.code === "PAYLOAD_TOO_LARGE",
    `status=${res.status} code=${res.json?.code || ""}`
  );
  assertSafeErrorBody(res, `${label}.safe-body`);
}

function assertSafe415(res, label) {
  note(
    `${label}.415`,
    res.status === 415 && res.json?.code === "UNSUPPORTED_MEDIA_TYPE",
    `status=${res.status} code=${res.json?.code || ""}`
  );
  assertSafeErrorBody(res, `${label}.safe-body`);
}

function assertSafeErrorBody(res, label) {
  const blob = `${res.text}\n${JSON.stringify(res.json || {})}`;
  note(
    label,
    !/x{20,}/i.test(blob) &&
      !/stack/i.test(blob) &&
      !/node_modules/i.test(blob) &&
      !blob.includes(jwtSecret) &&
      !blob.includes(oneCKey) &&
      !blob.includes(password) &&
      !blob.includes("s4a-admin@test.local"),
    `chars=${blob.length}`
  );
}

function seedDatabase() {
  writeFileSync(
    seedScriptPath,
    `
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(${JSON.stringify(moduleUrl(path.join(serverDir, "package.json")))});
const bcrypt = require("bcryptjs");
import {
  createUser,
  replaceOrders,
  setGlobalState,
} from ${JSON.stringify(moduleUrl(path.join(serverDir, "src/db.js")))};
import { DEFAULT_SETTINGS } from ${JSON.stringify(moduleUrl(path.join(serverDir, "src/defaults.js")))};

const passwordHash = bcrypt.hashSync(${JSON.stringify(password)}, 4);
const admin = createUser({
  email: "s4a-admin@test.local",
  passwordHash,
  role: "admin",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "S4A Admin", contactName: "Admin" },
});
const client = createUser({
  email: "s4a-client@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "S4A Client", contactName: "Client" },
});
setGlobalState("settings", {
  ...DEFAULT_SETTINGS,
  storefrontPricingMode: "manual",
  deliveryOneCId: "s4a-delivery-1",
  deliveryOneCCode: "НФ-DELIVERY",
  deliveryOneCName: "Доставка",
});
const receivedAt = new Date().toISOString();
setGlobalState("products", [{
  id: "s4a-product",
  name: "S4A витрина",
  code: "S4A-1",
  active: true,
  showOnStorefront: true,
  oneCId: "s4a-onec-1",
  oneCCode: "НФ-S4A",
  saleUnits: ["piece"],
  pieceSize: 1,
  storefrontPricing: { source: "manual", piece: 100 },
}]);
setGlobalState("oneCProducts", [{
  id: "s4a-onec-1",
  code: "НФ-S4A",
  name: "S4A витрина",
  purchasePrice: 50,
  purchasePricePiece: 50,
  purchasePriceReceivedAt: receivedAt,
}, {
  id: "s4a-delivery-1",
  code: "НФ-DELIVERY",
  name: "Доставка",
  purchasePrice: 0,
  purchasePricePiece: 0,
  purchasePriceReceivedAt: receivedAt,
}]);
replaceOrders({
  managerMode: true,
  orders: [{
    id: "s4a-order-1",
    number: "S4A-1001",
    clientId: client.id,
    customerName: "S4A Client",
    customerEmail: client.email,
    status: "Новый",
    exchange: { status: "ready", database: "TEST" },
    items: [{
      id: "s4a-line-1",
      productId: "s4a-product",
      name: "S4A витрина",
      unit: "piece",
      quantity: 1,
      unitPrice: 100,
      lineTotal: 100,
      oneCId: "s4a-onec-1",
      oneCCode: "НФ-S4A",
    }],
  }],
});
writeFileSync(${JSON.stringify(seedMetaPath)}, JSON.stringify({
  adminEmail: admin.email,
  clientEmail: client.email,
  orderId: "s4a-order-1",
  orderNumber: "S4A-1001",
}));
`
  );
  const seeded = spawnSync(process.execPath, [seedScriptPath], {
    cwd: serverDir,
    env: {
      ...process.env,
      DB_PATH: databasePath,
      JWT_SECRET: jwtSecret,
      DOTENV_CONFIG_PATH: emptyEnvPath,
    },
    encoding: "utf8",
  });
  if (seeded.status !== 0) {
    throw new Error(`seed failed: ${seeded.stderr || seeded.stdout}`);
  }
}

function childEnv(port) {
  return {
    ...process.env,
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(port),
    DB_PATH: databasePath,
    JWT_SECRET: jwtSecret,
    DOTENV_CONFIG_PATH: emptyEnvPath,
    ONEC_PROD_EXCHANGE_ENABLED: "false",
    ONEC_ALLOWED_DATABASES: "TEST",
    ONEC_TEST_EXCHANGE_API_KEY: oneCKey,
    ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
    ALLOW_LAN_ORIGINS: "false",
    APP_PUBLIC_URL: `http://127.0.0.1:${port}`,
    CLOVER_SERVER_BACKUP_DIR: path.join(temp, "backups"),
    CLOVER_UPLOADS_DIR: path.join(temp, "uploads"),
    MANAGER_EMAIL: "",
    MANAGER_PASSWORD: "",
  };
}

function maxGuestOrder() {
  return {
    contactName: "А".repeat(120),
    companyName: "Б".repeat(160),
    phone: "+79990000000".padEnd(50, "0"),
    email: `${"c".repeat(40)}@example.com`,
    address: "Г".repeat(500),
    comment: "Д".repeat(2000),
    items: Array.from({ length: 200 }, (_, index) => ({
      productId: "s4a-product",
      code: `S4A-${String(index).padStart(3, "0")}`.padEnd(80, "X"),
      unit: "piece",
      qty: 1,
    })),
  };
}

function typicalPasskeyBody(ceremonyId = "11111111-1111-4111-8111-111111111111") {
  return {
    ceremonyId,
    email: "s4a-client@test.local",
    response: {
      id: "s4a-cred",
      rawId: "s4a-cred",
      type: "public-key",
      response: {
        clientDataJSON: "e30",
        authenticatorData: "A".repeat(256),
        signature: "B".repeat(256),
        userHandle: "C".repeat(64),
        attestationObject: "D".repeat(4096),
      },
    },
  };
}

let child;
let port;
const meta = {};

try {
  seedDatabase();
  Object.assign(meta, JSON.parse(readFileSync(seedMetaPath, "utf8")));
  port = await freePort();
  child = spawn(process.execPath, ["src/server.js"], {
    cwd: serverDir,
    env: childEnv(port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      stderr += `\nexit ${code} ${signal || ""}`;
    }
  });
  try {
    await waitHealth(`http://127.0.0.1:${port}`);
  } catch (error) {
    throw new Error(`${error.message}\n${stderr.slice(-2000)}`);
  }

  const loginOk = await rawRequest(port, {
    path: "/api/auth/login",
    body: { email: meta.adminEmail, password },
  });
  note(
    "login.small.not-413",
    loginOk.status === 200 && Boolean(loginOk.json?.token),
    `status=${loginOk.status}`
  );
  const adminToken = loginOk.json.token;

  const overLoginStarted = Date.now();
  const overLogin = await rawRequest(port, {
    path: "/api/auth/login",
    body: { email: meta.adminEmail, password, filler: "x".repeat(AUTH_OVERSIZE) },
  });
  const overLoginMs = Date.now() - overLoginStarted;
  note(
    "login.oversize.red-or-green",
    overLogin.status === 413,
    `status=${overLogin.status} ms=${overLoginMs} (RED if not 413)`
  );
  assertSafe413(overLogin, "login.oversize");
  note("login.oversize.before-bcrypt", overLoginMs < 400, `ms=${overLoginMs}`);

  const caseLoginSmall = await rawRequest(port, {
    path: "/API/auth/login",
    body: { email: meta.adminEmail, password },
  });
  note(
    "login.case-api.small",
    caseLoginSmall.status === 200 && Boolean(caseLoginSmall.json?.token),
    `status=${caseLoginSmall.status}`
  );
  const caseApiOver = await rawRequest(port, {
    path: "/API/auth/login",
    body: { email: meta.adminEmail, password, filler: "x".repeat(AUTH_OVERSIZE) },
  });
  assertSafe413(caseApiOver, "login.case-api.oversize");
  const caseLoginOver = await rawRequest(port, {
    path: "/api/auth/Login",
    body: { email: meta.adminEmail, password, filler: "x".repeat(AUTH_OVERSIZE) },
  });
  assertSafe413(caseLoginOver, "login.case-login.oversize");

  for (const route of ["/api/auth/register", "/api/auth/forgot-password"]) {
    const res = await rawRequest(port, {
      path: route,
      body: {
        email: "s4a-extra@test.local",
        password,
        companyName: "Co",
        contactName: "Name",
        phone: "+79990000001",
        filler: "x".repeat(AUTH_OVERSIZE),
      },
    });
    assertSafe413(res, route.slice(1).replaceAll("/", "."));
  }

  const passkeySmall = typicalPasskeyBody();
  const passkeyBytes = Buffer.byteLength(JSON.stringify(passkeySmall));
  note("passkey.fixture-size", passkeyBytes < 32 * 1024, `bytes=${passkeyBytes}`);
  const passkeyOk = await rawRequest(port, {
    path: "/api/passkeys/authentication/options",
    body: {},
  });
  note(
    "passkey.options.small",
    passkeyOk.status === 200 && Boolean(passkeyOk.json?.ceremonyId),
    `status=${passkeyOk.status}`
  );
  const passkeyVerify = await rawRequest(port, {
    path: "/api/passkeys/authentication/verify",
    body: typicalPasskeyBody(passkeyOk.json.ceremonyId),
  });
  note(
    "passkey.verify.small-not-413",
    passkeyVerify.status !== 413 && passkeyVerify.status >= 400,
    `status=${passkeyVerify.status} bytes=${passkeyBytes}`
  );
  const passkeyOver = await rawRequest(port, {
    path: "/api/passkeys/authentication/verify",
    body: { ...typicalPasskeyBody(), filler: "x".repeat(AUTH_OVERSIZE) },
  });
  assertSafe413(passkeyOver, "passkey.verify.oversize");

  const guest = maxGuestOrder();
  const guestBytes = Buffer.byteLength(JSON.stringify(guest));
  note("public-order.max-valid-size", guestBytes < 128 * 1024, `bytes=${guestBytes}`);
  const guestOk = await rawRequest(port, {
    path: "/api/public/orders",
    body: guest,
  });
  note(
    "public-order.max-valid",
    guestOk.status !== 413 && (guestOk.status === 200 || guestOk.status === 201),
    `status=${guestOk.status} bytes=${guestBytes}`
  );
  const guestOver = await rawRequest(port, {
    path: "/api/public/orders",
    body: { ...guest, filler: "x".repeat(150 * 1024) },
  });
  assertSafe413(guestOver, "public-order.oversize");
  const guestCaseOver = await rawRequest(port, {
    path: "/api/public/Orders",
    body: { ...guest, filler: "x".repeat(150 * 1024) },
  });
  assertSafe413(guestCaseOver, "public-order.case.oversize");

  const adminSmall = await rawRequest(port, {
    path: "/api/admin/notifications/read-all",
    token: adminToken,
    body: {},
  });
  note("admin.small", adminSmall.status === 200, `status=${adminSmall.status}`);
  const adminOver = await rawRequest(port, {
    path: "/api/admin/notifications/test",
    token: adminToken,
    body: { filler: "x".repeat(DEFAULT_OVERSIZE) },
  });
  assertSafe413(adminOver, "admin.default-oversize");

  const bulkOk = await rawRequest(port, {
    path: "/api/state/products",
    method: "PUT",
    token: adminToken,
    body: {
      products: [{
        id: "s4a-product",
        name: "S4A витрина",
        code: "S4A-1",
        active: true,
        showOnStorefront: true,
        saleUnits: ["piece"],
        pieceSize: 1,
        storefrontPricing: { source: "manual", piece: 100 },
        filler: "y".repeat(300 * 1024),
      }],
    },
  });
  note(
    "bulk.state-products.above-default",
    bulkOk.status !== 413,
    `status=${bulkOk.status}`
  );
  const bulkOver = await rawRequest(port, {
    path: "/api/state/products",
    method: "PUT",
    token: adminToken,
    body: { products: [], filler: "x".repeat(BULK_OVERSIZE) },
  });
  assertSafe413(bulkOver, "bulk.state-products.oversize");

  const bulkAboveDefault = {
    products: [{
      id: "s4a-product",
      name: "S4A витрина",
      code: "S4A-1",
      active: true,
      showOnStorefront: true,
      saleUnits: ["piece"],
      pieceSize: 1,
      storefrontPricing: { source: "manual", piece: 100 },
      filler: "y".repeat(300 * 1024),
    }],
  };
  const defaultOversize = { filler: "x".repeat(DEFAULT_OVERSIZE) };

  function assertBulkProductsRoute(res, label) {
    note(
      `${label}.bulk-route`,
      res.status === 200 && res.json?.ok === true && !res.json?.code,
      `status=${res.status} ok=${res.json?.ok} code=${res.json?.code || ""}`
    );
  }

  assertBulkProductsRoute(
    await jsonRaw(port, {
      method: "PUT",
      pathname: "/api/state/products",
      token: adminToken,
      body: bulkAboveDefault,
    }),
    "selector.products.exact"
  );
  assertBulkProductsRoute(
    await jsonRaw(port, {
      method: "PUT",
      pathname: "/api/state/products/",
      token: adminToken,
      body: bulkAboveDefault,
    }),
    "selector.products.one-trailing-slash"
  );
  assertBulkProductsRoute(
    await jsonRaw(port, {
      method: "PUT",
      pathname: "/api/state/products?x=1",
      token: adminToken,
      body: bulkAboveDefault,
    }),
    "selector.products.query"
  );

  const encodedSlash = await jsonRaw(port, {
    method: "PUT",
    pathname: "/api%2Fstate%2Fproducts",
    token: adminToken,
    body: defaultOversize,
  });
  assertSafe413(encodedSlash, "selector.products.encoded-slashes");
  note(
    "selector.products.encoded-slashes.not-bulk-404",
    encodedSlash.status !== 404 && encodedSlash.status !== 200,
    `status=${encodedSlash.status}`
  );

  const encodedLetter = await jsonRaw(port, {
    method: "PUT",
    pathname: "/api/state/%70roducts",
    token: adminToken,
    body: defaultOversize,
  });
  assertSafe413(encodedLetter, "selector.products.encoded-letter");
  note(
    "selector.products.encoded-letter.not-bulk-route",
    encodedLetter.status !== 200,
    `status=${encodedLetter.status}`
  );

  const doubleSlash = await jsonRaw(port, {
    method: "PUT",
    pathname: "/api/state/products//",
    token: adminToken,
    body: defaultOversize,
  });
  assertSafe413(doubleSlash, "selector.products.double-trailing-slash");
  note(
    "selector.products.double-trailing-slash.not-bulk-route",
    doubleSlash.status !== 200,
    `status=${doubleSlash.status}`
  );

  const fakeOneCBulk = await jsonRaw(port, {
    method: "POST",
    pathname: "/api/one-c/products-preview-extra",
    oneC: true,
    body: defaultOversize,
  });
  assertSafe413(fakeOneCBulk, "selector.onec.lookalike-bulk");
  note(
    "selector.onec.lookalike-bulk.not-404",
    fakeOneCBulk.status !== 404,
    `status=${fakeOneCBulk.status}`
  );

  const reconLookalike = await jsonRaw(port, {
    method: "POST",
    pathname: "/api/one-c/reconciliation/s4a-missing/results",
    oneC: true,
    body: defaultOversize,
  });
  assertSafe413(reconLookalike, "selector.reconciliation.lookalike");
  note(
    "selector.reconciliation.lookalike.not-404",
    reconLookalike.status !== 404,
    `status=${reconLookalike.status}`
  );

  const reconReal = await jsonRaw(port, {
    method: "POST",
    pathname: "/api/one-c/reconciliation/s4a-missing/result",
    oneC: true,
    body: { fileBase64: "", filler: "y".repeat(300 * 1024) },
  });
  note(
    "selector.reconciliation.real-shape.bulk",
    reconReal.status !== 413 &&
      reconReal.status === 404 &&
      String(reconReal.json?.error || "").includes("не найден"),
    `status=${reconReal.status} error=${reconReal.json?.error || ""}`
  );

  const claim = await rawRequest(port, {
    path: "/api/one-c/test-order",
    method: "POST",
    oneC: true,
    body: {},
  });
  const claimedId = String(
    claim.json?.orderId ||
      claim.json?.id ||
      claim.json?.order?.id ||
      ""
  );
  const claimedNumber = String(
    claim.json?.orderNumber ||
      claim.json?.number ||
      claim.json?.order?.number ||
      ""
  );
  note(
    "onec.claim",
    claim.status === 200 && (claimedId === meta.orderId || claimedNumber === meta.orderNumber),
    `status=${claim.status} body=${JSON.stringify(claim.json || {}).slice(0, 240)}`
  );

  const ack = await rawRequest(port, {
    path: `/api/one-c/orders/${meta.orderId}/ack`,
    oneC: true,
    body: {
      orderNumber: meta.orderNumber,
      documentNumber: "TEST-DOC-1",
    },
  });
  note(
    "onec.ack.first",
    ack.status === 200 && ack.json?.ok === true,
    `status=${ack.status} duplicate=${ack.json?.duplicateAck || false}`
  );
  const ackAgain = await rawRequest(port, {
    path: `/api/one-c/orders/${meta.orderId}/ack`,
    oneC: true,
    body: {
      orderNumber: meta.orderNumber,
      documentNumber: "TEST-DOC-1",
    },
  });
  note(
    "onec.ack.idempotent",
    ackAgain.status === 200 && ackAgain.json?.duplicateAck === true,
    `status=${ackAgain.status} duplicate=${ackAgain.json?.duplicateAck}`
  );
  const accepted = await rawRequest(port, {
    path: "/api/one-c/orders/accepted",
    oneC: true,
    body: {
      orderNumber: meta.orderNumber,
      documentNumber: "TEST-DOC-1",
      oneCState: "Принят",
    },
  });
  note(
    "onec.accepted",
    accepted.status !== 413 && accepted.status < 500,
    `status=${accepted.status}`
  );
  const ackOver = await rawRequest(port, {
    path: `/api/one-c/orders/${meta.orderId}/ack`,
    oneC: true,
    body: {
      orderNumber: meta.orderNumber,
      documentNumber: "TEST-DOC-1",
      filler: "x".repeat(DEFAULT_OVERSIZE),
    },
  });
  assertSafe413(ackOver, "onec.ack.oversize");

  const loginBody = { email: meta.adminEmail, password };
  const loginOverBody = { ...loginBody, filler: "x".repeat(AUTH_OVERSIZE) };
  const encodings = [
    ["gzip", gzipSync],
    ["deflate", deflateSync],
    ["br", brotliCompressSync],
  ];
  for (const [encoding, compress] of encodings) {
    const small = await rawRequest(port, {
      path: "/api/auth/login",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": encoding,
      },
      body: compress(Buffer.from(JSON.stringify(loginBody))),
    });
    note(
      `login.${encoding}.small`,
      small.status === 200 && Boolean(small.json?.token) && !small.json?.token.includes(password),
      `status=${small.status}`
    );
    const over = await rawRequest(port, {
      path: "/api/auth/login",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": encoding,
      },
      body: compress(Buffer.from(JSON.stringify(loginOverBody))),
    });
    assertSafe413(over, `login.${encoding}.oversize`);
  }

  const textPlain = await rawRequest(port, {
    path: "/api/auth/login",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(loginBody),
  });
  note(
    "login.text-plain.not-authorized",
    textPlain.status !== 200 && !textPlain.json?.token,
    `status=${textPlain.status} token=${Boolean(textPlain.json?.token)}`
  );

  const gzipPlain = await rawRequest(port, {
    path: "/api/auth/login",
    headers: {
      "Content-Type": "text/plain",
      "Content-Encoding": "gzip",
    },
    body: gzipSync(Buffer.from(JSON.stringify(loginBody))),
  });
  note(
    "login.gzip-text-plain.not-authorized",
    gzipPlain.status !== 200 && !gzipPlain.json?.token,
    `status=${gzipPlain.status} token=${Boolean(gzipPlain.json?.token)}`
  );

  const latin1 = await rawRequest(port, {
    path: "/api/auth/login",
    headers: { "Content-Type": "application/json; charset=iso-8859-1" },
    body: loginBody,
  });
  assertSafe415(latin1, "login.charset-iso-8859-1");

  const badEncoding = await rawRequest(port, {
    path: "/api/auth/login",
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "compress",
    },
    body: JSON.stringify(loginBody),
  });
  assertSafe415(badEncoding, "login.unsupported-encoding");

  const chunked = await httpRaw({
    port,
    method: "POST",
    pathname: "/api/auth/login",
    headers: {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
    },
    chunks: [Buffer.from(`{"email":"${meta.adminEmail}","password":"${password}","filler":"`), Buffer.alloc(AUTH_OVERSIZE, 0x78), Buffer.from('"}')],
  });
  assertSafe413(chunked, "login.chunked-oversize");

  const lyingCl = await httpRaw({
    port,
    method: "POST",
    pathname: "/api/auth/login",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "32",
    },
    chunks: [Buffer.from(JSON.stringify({
      email: meta.adminEmail,
      password,
      filler: "x".repeat(AUTH_OVERSIZE),
    }))],
  });
  note(
    "login.lying-content-length",
    lyingCl.status !== 200 && lyingCl.status !== 401,
    `status=${lyingCl.status}`
  );

  const malformed = await rawRequest(port, {
    path: "/api/auth/login",
    headers: { "Content-Type": "application/json" },
    body: '{"email":',
  });
  note("login.malformed-400", malformed.status === 400, `status=${malformed.status}`);

  const slash = await rawRequest(port, {
    path: "/api/auth/login/",
    body: { email: meta.adminEmail, password, filler: "x".repeat(AUTH_OVERSIZE) },
  });
  note(
    "login.trailing-slash-same-bucket",
    slash.status === 413 || slash.status === 404,
    `status=${slash.status}`
  );
  if (slash.status === 413) assertSafe413(slash, "login.trailing-slash");

  const query = await rawRequest(port, {
    path: "/api/auth/login?x=1",
    body: { email: meta.adminEmail, password, filler: "x".repeat(AUTH_OVERSIZE) },
  });
  assertSafe413(query, "login.query");

  const getLogin = await httpRaw({
    port,
    method: "GET",
    pathname: "/api/auth/login",
    headers: { "Content-Type": "application/json" },
    chunks: [Buffer.from(JSON.stringify({ filler: "x".repeat(AUTH_OVERSIZE) }))],
  });
  note(
    "login.get-no-wide-bucket",
    getLogin.status !== 200,
    `status=${getLogin.status}`
  );

  const previewOverOnAckPath = await rawRequest(port, {
    path: "/api/one-c/orders/not-an-ack/products-preview",
    oneC: true,
    body: { items: [], filler: "x".repeat(DEFAULT_OVERSIZE) },
  });
  note(
    "onec.no-prefix-bypass",
    previewOverOnAckPath.status === 413 || previewOverOnAckPath.status === 404,
    `status=${previewOverOnAckPath.status}`
  );
} finally {
  if (child && !child.killed) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  rmSync(temp, { recursive: true, force: true });
}

const failed = results.filter((item) => !item.ok);
console.log(`verify-security-stage4-package-a: ${failed.length ? "FAIL" : "ok"} (${results.length} checks)`);
if (failed.length) process.exitCode = 1;
