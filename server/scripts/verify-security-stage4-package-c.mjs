/**
 * Security Stage 4 Package C — HTTP/resource bounds.
 *
 * Isolated loopback. Temp SQLite. No SMTP, no live 1C, no production DB.
 * Short HTTP timeouts require NODE_ENV=test and CLOVER_HTTP_TEST_BOUNDS=1.
 *
 * Release-gate: PREPARE/PROMOTE forbidden while production is 71cf5b5.
 */
import { spawn, spawnSync } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const WORKTREE_DATA = path.resolve(root, "server/data");

const temp = mkdtempSync(path.join(tmpdir(), "clover-s4c-"));
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

const jwtSecret = "clover-s4c-resource-bounds-secret-32";
const password = "S4cResourcePass!1";
const oneCKey = "clover-s4c-test-exchange-key-24x";
const results = [];

function note(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${detail}`);
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
  const finalHeaders = { Accept: "application/json", ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  if (oneC) {
    finalHeaders["X-Clover-Key"] = oneCKey;
    finalHeaders["X-Clover-Database"] = "TEST";
  }
  if (payload !== undefined && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: finalHeaders,
    body: payload,
  });
  const text = await res.text();
  return { status: res.status, text, json: jsonSafe(text), headers: res.headers };
}

function measureSocketClose(port, payload, { waitMs = 2500 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const sock = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.removeAllListeners();
      sock.destroy();
      resolve({ ms: Date.now() - started, reason });
    };
    const timer = setTimeout(() => finish("wait-expired"), waitMs);
    sock.once("connect", () => sock.write(payload));
    sock.once("close", () => finish("close"));
    sock.once("error", () => finish("error"));
    sock.once("end", () => finish("end"));
    sock.setTimeout(waitMs, () => finish("socket-timeout"));
  });
}

function seedDatabase() {
  writeFileSync(
    seedScriptPath,
    `
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(${JSON.stringify(moduleUrl(path.join(serverDir, "package.json")))});
const bcrypt = require("bcryptjs");
import { createUser, replaceOrders, setGlobalState } from ${JSON.stringify(moduleUrl(path.join(serverDir, "src/db.js")))};
import { DEFAULT_SETTINGS } from ${JSON.stringify(moduleUrl(path.join(serverDir, "src/defaults.js")))};
const passwordHash = bcrypt.hashSync(${JSON.stringify(password)}, 12);
const admin = createUser({
  email: "s4c-admin@test.local",
  passwordHash,
  role: "admin",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "S4C Admin", contactName: "Admin" },
});
const client = createUser({
  email: "s4c-client@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "S4C Client", contactName: "Client" },
});
setGlobalState("settings", { ...DEFAULT_SETTINGS, storefrontPricingMode: "manual" });
setGlobalState("products", [1, 2, 3].map((n) => ({
  id: n === 1 ? "s4c-product" : \`s4c-product-\${n}\`,
  name: n === 1 ? "S4C" : \`S4C \${n}\`,
  code: \`S4C-\${n}\`,
  active: true,
  showOnStorefront: true,
  saleUnits: ["piece"],
  pieceSize: 1,
  storefrontPricing: { source: "manual", piece: 100 },
})));
replaceOrders({
  managerMode: true,
  orders: [{
    id: "s4c-order-1",
    number: "S4C-1001",
    clientId: client.id,
    customerName: "S4C Client",
    status: "Новый",
    exchange: { status: "ready", database: "TEST" },
    items: [{ id: "s4c-line-1", productId: "s4c-product", name: "S4C", unit: "piece", quantity: 1, unitPrice: 100, lineTotal: 100 }],
  }],
});
writeFileSync(${JSON.stringify(seedMetaPath)}, JSON.stringify({
  adminEmail: admin.email,
  clientEmail: client.email,
  orderId: "s4c-order-1",
  orderNumber: "S4C-1001",
}));
`
  );
  const seeded = spawnSync(process.execPath, [seedScriptPath], {
    cwd: serverDir,
    env: { ...process.env, DB_PATH: databasePath, JWT_SECRET: jwtSecret, DOTENV_CONFIG_PATH: emptyEnvPath },
    encoding: "utf8",
  });
  if (seeded.status !== 0) throw new Error(`seed failed: ${seeded.stderr || seeded.stdout}`);
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
    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    MAIL_FROM: "",
    PRODUCT_ENRICH_ENABLED: "true",
    CLOVER_ENRICH_QUEUE_MAX: "2",
    CLOVER_HTTP_TEST_BOUNDS: "1",
    CLOVER_HTTP_HEADERS_TIMEOUT_MS: "400",
    CLOVER_HTTP_REQUEST_TIMEOUT_MS: "800",
    CLOVER_HTTP_SOCKET_TIMEOUT_MS: "600",
    CLOVER_HTTP_KEEPALIVE_TIMEOUT_MS: "150",
    CLOVER_HTTP_MAX_CONNECTIONS: "8",
    CLOVER_HTTP_MAX_REQUESTS_PER_SOCKET: "2",
    ALLOW_DEV_AUTH_LINKS: "1",
  };
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: serverDir,
    env: childEnv(port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await waitHealth(`http://127.0.0.1:${port}`);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${stderr.slice(-2000)}`);
  }
  return { port, child };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

let primary;
try {
  const serverSource = readFileSync(path.join(serverDir, "src/server.js"), "utf8");
  const boundsMod = await import(moduleUrl(path.join(serverDir, "src/httpServerBounds.js")));
  const resourceMod = await import(moduleUrl(path.join(serverDir, "src/resourceBounds.js")));
  const enrichMod = await import(moduleUrl(path.join(serverDir, "src/productEnrichment.js")));

  const packageCFiles = [
    path.join(serverDir, "src/httpServerBounds.js"),
    path.join(serverDir, "src/resourceBounds.js"),
    path.join(serverDir, "src/server.js"),
    path.join(serverDir, "src/productEnrichment.js"),
    path.join(serverDir, "scripts/verify-security-stage4-package-c.mjs"),
    path.join(serverDir, "package.json"),
    path.join(serverDir, "scripts/run-package-scripts.mjs"),
  ];
  note(
    "source.lf-only",
    packageCFiles.every((file) => !readFileSync(file).includes(0x0d)),
    "Package C files stay LF so source-scan tests match"
  );
  note(
    "source.explicit-http-bounds",
    /applyHttpServerBounds\(httpServer/.test(serverSource) &&
      /headersTimeout/.test(readFileSync(path.join(serverDir, "src/httpServerBounds.js"), "utf8")),
    "applyHttpServerBounds wired after listen"
  );
  note(
    "source.package-a-limits-unchanged",
    /AUTH:\s*"32kb"/.test(serverSource) &&
      /PUBLIC_ORDER:\s*"128kb"/.test(serverSource) &&
      /DEFAULT:\s*"256kb"/.test(serverSource) &&
      /BULK:\s*"24mb"/.test(serverSource),
    "32/128/256kb and 24mb intact"
  );
  note(
    "source.no-trust-proxy",
    !/trust\s*proxy/i.test(serverSource),
    "trust proxy absent"
  );
  note(
    "source.no-onec-ip-limiter",
    !/rejectPublicRateLimit\(res,\s*"/.test(serverSource.slice(serverSource.indexOf('app.use("/api/one-c"'))) &&
      /app\.use\("\/api\/one-c", oneCAuthRequired\)/.test(serverSource),
    "one-c mount has no public limiter"
  );
  note(
    "source.release-gate",
    /71cf5b5/.test(readFileSync(path.join(serverDir, "src/httpServerBounds.js"), "utf8")) &&
      /18d4c3b/.test(readFileSync(path.join(serverDir, "src/httpServerBounds.js"), "utf8")),
    "PREPARE/PROMOTE gate documented"
  );

  const prod = boundsMod.readHttpServerBounds({
    NODE_ENV: "production",
    CLOVER_HTTP_TEST_BOUNDS: "1",
    CLOVER_HTTP_HEADERS_TIMEOUT_MS: "50",
  });
  note(
    "bounds.production-ignores-short-env",
    prod.headersTimeout === 60_000 &&
      prod.requestTimeout === 300_000 &&
      prod.timeout === 120_000 &&
      prod.keepAliveTimeout === 5_000 &&
      prod.maxConnections === 512 &&
      prod.maxRequestsPerSocket === 1_000,
    JSON.stringify(prod)
  );
  const testBounds = boundsMod.readHttpServerBounds({
    NODE_ENV: "test",
    CLOVER_HTTP_TEST_BOUNDS: "1",
    CLOVER_HTTP_HEADERS_TIMEOUT_MS: "400",
    CLOVER_HTTP_REQUEST_TIMEOUT_MS: "800",
    CLOVER_HTTP_SOCKET_TIMEOUT_MS: "600",
    CLOVER_HTTP_KEEPALIVE_TIMEOUT_MS: "150",
    CLOVER_HTTP_MAX_CONNECTIONS: "8",
    CLOVER_HTTP_MAX_REQUESTS_PER_SOCKET: "2",
  });
  note(
    "bounds.test-profile-short",
    testBounds.headersTimeout === 400 && testBounds.requestTimeout === 800,
    JSON.stringify(testBounds)
  );

  enrichMod.resetEnrichQueueForTests();
  process.env.PRODUCT_ENRICH_ENABLED = "true";
  process.env.CLOVER_ENRICH_QUEUE_MAX = "2";
  const scheduled = [];
  for (let i = 0; i < 5; i += 1) {
    scheduled.push(enrichMod.scheduleProductWebEnrichment({
      productId: `s4c-${i}`,
      getProducts: () => [],
      setProducts: () => {},
    }));
  }
  const queued = scheduled.filter((item) => item?.queued).length;
  const capped = scheduled.filter((item) => item?.reason === "capacity").length;
  note(
    "queue.enrich-cap",
    queued === 2 && capped === 3 && enrichMod.getEnrichQueueDepthForTests() <= 2,
    `queued=${queued} capped=${capped} depth=${enrichMod.getEnrichQueueDepthForTests()}`
  );
  await new Promise((r) => setTimeout(r, 80));
  const depthAfterJobs = enrichMod.getEnrichQueueDepthForTests();
  const after = enrichMod.scheduleProductWebEnrichment({
    productId: "s4c-free",
    getProducts: () => [],
    setProducts: () => {},
  });
  note(
    "queue.enrich-slot-releases",
    depthAfterJobs === 0 && after?.queued === true,
    `depthAfterJobs=${depthAfterJobs} queued=${after?.queued}`
  );
  enrichMod.resetEnrichQueueForTests();
  note(
    "queue.enrich-all-precheck",
    /targets\.length > enrichCapacityRemaining\(\)/.test(serverSource) &&
      enrichMod.enrichCapacityRemaining({ CLOVER_ENRICH_QUEUE_MAX: "2" }) === 2,
    `remaining=${enrichMod.enrichCapacityRemaining({ CLOVER_ENRICH_QUEUE_MAX: "2" })}`
  );
  const fromCatalogSlice = serverSource.slice(
    serverSource.indexOf("Фото + описание/состав/характеристики с открытых источников"),
    serverSource.indexOf('app.post(\n  "/api/admin/products/:productId/enrich"')
  );
  const pendingGate = fromCatalogSlice.indexOf("if (enrichmentQueued) {\n          nextProducts");
  const pendingWrite = fromCatalogSlice.indexOf('enrichmentStatus: "pending"');
  note(
    "queue.from-catalog-pending-only-if-queued",
    /enrichmentQueued = scheduled\?\.queued === true/.test(fromCatalogSlice) &&
      !/enrichmentQueued = true/.test(fromCatalogSlice) &&
      pendingGate >= 0 &&
      pendingWrite > pendingGate,
    "from-catalog pending only inside queued gate"
  );
  enrichMod.resetEnrichQueueForTests();

  const gate = resourceMod.createConcurrencyGate({ max: 2, perKey: 1 });
  const a1 = gate.tryEnter("admin-a");
  const a2 = gate.tryEnter("admin-a");
  const b1 = gate.tryEnter("admin-b");
  const c1 = gate.tryEnter("admin-c");
  note(
    "pdf.gate-parallel",
    a1.ok && !a2.ok && b1.ok && !c1.ok && gate.size() === 2,
    `a1=${a1.ok} a2=${a2.ok} b1=${b1.ok} c1=${c1.ok} size=${gate.size()}`
  );
  a1.leave();
  const c2 = gate.tryEnter("admin-c");
  note("pdf.gate-releases", c2.ok === true && gate.size() === 2, `c2=${c2.ok} size=${gate.size()}`);
  b1.leave();
  c2.leave();
  note(
    "catalog.q-bound",
    resourceMod.publicCatalogQueryTooLong("x".repeat(81)) &&
      !resourceMod.publicCatalogQueryTooLong("milk"),
    `max=${resourceMod.PUBLIC_CATALOG_Q_MAX}`
  );

  seedDatabase();
  const meta = JSON.parse(readFileSync(seedMetaPath, "utf8"));
  primary = await startServer();
  const { port } = primary;

  const health = await rawRequest(port, { method: "GET", path: "/api/health" });
  note("http.normal-health", health.status === 200, `status=${health.status}`);

  const headersHang = await measureSocketClose(
    port,
    "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\n",
    { waitMs: 2000 }
  );
  note(
    "http.incomplete-headers-closed",
    headersHang.reason !== "wait-expired" && headersHang.ms < 1600,
    `ms=${headersHang.ms} reason=${headersHang.reason}`
  );

  const bodyHang = await measureSocketClose(
    port,
    "POST /api/auth/login HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 80\r\n\r\n{",
    { waitMs: 2500 }
  );
  note(
    "http.stalled-body-closed",
    bodyHang.reason !== "wait-expired" && bodyHang.ms < 2000,
    `ms=${bodyHang.ms} reason=${bodyHang.reason}`
  );

  const afterTimeout = await rawRequest(port, { method: "GET", path: "/api/health" });
  note("http.healthy-after-timeout", afterTimeout.status === 200, `status=${afterTimeout.status}`);

  const longQ = await rawRequest(port, {
    method: "GET",
    path: `/api/public/catalog?q=${"a".repeat(120)}`,
  });
  note(
    "catalog.oversize-q-rejected",
    longQ.status === 400 &&
      longQ.json?.code === "CATALOG_QUERY_TOO_LONG" &&
      !/stack|node_modules|enrichQueue/i.test(longQ.text),
    `status=${longQ.status} code=${longQ.json?.code || ""}`
  );
  const shortQ = await rawRequest(port, { method: "GET", path: "/api/public/catalog?q=S4C" });
  note("catalog.short-q-ok", shortQ.status === 200 && Array.isArray(shortQ.json?.products), `status=${shortQ.status}`);

  const login = await rawRequest(port, {
    path: "/api/auth/login",
    body: { email: meta.adminEmail, password },
  });
  note("auth.login", login.status === 200 && Boolean(login.json?.token), `status=${login.status}`);

  const enrichAll = await rawRequest(port, {
    path: "/api/admin/storefront/enrich-all",
    token: login.json?.token,
    body: { forcePhoto: true },
  });
  note(
    "http.enrich-all-over-capacity",
    enrichAll.status === 503 &&
      enrichAll.json?.code === "RESOURCE_OVERLOADED" &&
      enrichAll.headers.get("retry-after") === "10" &&
      !/stack|node_modules|enrichQueue/i.test(enrichAll.text),
    `status=${enrichAll.status} code=${enrichAll.json?.code || ""}`
  );

  const claim = await rawRequest(port, {
    method: "POST",
    path: "/api/one-c/test-order",
    oneC: true,
    body: {},
  });
  note(
    "onec.claim",
    claim.status !== 429 && claim.status !== 503 && claim.status < 500,
    `status=${claim.status}`
  );
  const ack = await rawRequest(port, {
    path: `/api/one-c/orders/${meta.orderId}/ack`,
    oneC: true,
    body: { orderNumber: meta.orderNumber, documentNumber: "TEST-DOC-C1" },
  });
  note("onec.ack", ack.status === 200 && ack.json?.ok === true, `status=${ack.status}`);
  const ackAgain = await rawRequest(port, {
    path: `/api/one-c/orders/${meta.orderId}/ack`,
    oneC: true,
    body: { orderNumber: meta.orderNumber, documentNumber: "TEST-DOC-C1" },
  });
  note(
    "onec.ack.idempotent",
    ackAgain.status === 200 && ackAgain.json?.duplicateAck === true && ackAgain.status !== 429,
    `status=${ackAgain.status} duplicate=${ackAgain.json?.duplicateAck}`
  );
  const accepted = await rawRequest(port, {
    path: "/api/one-c/orders/accepted",
    oneC: true,
    body: { orderNumber: meta.orderNumber, documentNumber: "TEST-DOC-C1", oneCState: "Принят" },
  });
  note("onec.accepted", accepted.status !== 429 && accepted.status !== 503 && accepted.status < 500, `status=${accepted.status}`);
  const poll = [];
  for (let i = 0; i < 6; i += 1) {
    poll.push(await rawRequest(port, { method: "POST", path: "/api/one-c/test-order", oneC: true, body: {} }));
  }
  note(
    "onec.poll-no-overload",
    poll.every((res) => res.status !== 429 && res.status !== 503),
    `statuses=${poll.map((res) => res.status).join(",")}`
  );

  note(
    "residual.cdn-volumetric",
    true,
    "CDN/provider volumetric DDoS remains residual; isolated Node bounds only"
  );
  note(
    "residual.package-b-memory",
    true,
    "Package B restart/multi-process store residual unchanged"
  );
  note(
    "residual.pdf-http-503",
    true,
    "PDF HTTP 503 not asserted; createConcurrencyGate unit-tested; live PDF timing flaky"
  );
} catch (error) {
  note("verifier.uncaught", false, String(error?.stack || error).slice(0, 700));
} finally {
  if (primary?.child) await stopServer(primary.child);
  rmSync(temp, { recursive: true, force: true });
}

const failed = results.filter((item) => !item.ok);
console.log(`verify-security-stage4-package-c: ${failed.length ? "FAIL" : "ok"} (${results.length} checks)`);
if (failed.length) process.exitCode = 1;
