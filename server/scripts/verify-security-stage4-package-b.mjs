/**
 * Security Stage 4 Package B — public abuse rate limits.
 *
 * Isolated loopback only. Temp SQLite + temp dirs. SMTP unset.
 * No production/TEST 1C, mail, or external network.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
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

const EXPECTED = Object.freeze({
  login: { max: 20, windowSec: 600 },
  register: { max: 8, windowSec: 600 },
  forgotPassword: { max: 5, windowSec: 900 },
  resendVerification: { max: 5, windowSec: 900 },
  verifyEmail: { max: 8, windowSec: 600 },
  resetPassword: { max: 8, windowSec: 600 },
  passkeyAuthOptions: { max: 10, windowSec: 600 },
  passkeyAuthVerify: { max: 10, windowSec: 600 },
  guestOrder: { max: 6, windowSec: 600 },
});

const temp = mkdtempSync(path.join(tmpdir(), "clover-s4b-"));
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

const jwtSecret = "clover-s4b-rate-limit-secret-32ch!!";
const password = "S4bRateLimitPass!1";
const oneCKey = "clover-s4b-test-exchange-key-24x";
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

function applySetCookie(jar, headers) {
  if (!jar) return;
  const listed = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const items = listed.length ? listed : String(headers.get("set-cookie") || "").split(/,(?=\s*[^;=]+=)/);
  for (const item of items) {
    const match = String(item).match(/^clover_rl_client=([^;]+)/i);
    if (match) jar.cookie = `clover_rl_client=${match[1]}`;
  }
}

async function rawRequest(port, {
  method = "POST",
  path: pathname,
  headers = {},
  body,
  token,
  oneC,
  cookieJar,
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
  if (cookieJar?.cookie && !finalHeaders.Cookie && !finalHeaders.cookie) {
    finalHeaders.Cookie = cookieJar.cookie;
  }
  if (payload !== undefined && !finalHeaders["Content-Type"] && !finalHeaders["content-type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: finalHeaders,
    body: payload,
  });
  applySetCookie(cookieJar, res.headers);
  const text = await res.text();
  return {
    status: res.status,
    text,
    json: jsonSafe(text),
    headers: res.headers,
  };
}

function sqlCount(table) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n || 0);
  } finally {
    db.close();
  }
}

function assertSafe429(res, label) {
  const retryAfter = Number(res.headers.get("retry-after"));
  const cache = String(res.headers.get("cache-control") || "");
  const blob = `${res.text}\n${JSON.stringify(res.json || {})}`;
  note(
    `${label}.429`,
    res.status === 429 && res.json?.code === "AUTH_RATE_LIMITED",
    `status=${res.status} code=${res.json?.code || ""}`
  );
  note(
    `${label}.retry-after`,
    Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 900,
    `retryAfter=${res.headers.get("retry-after") || ""}`
  );
  note(
    `${label}.cache`,
    cache.includes("no-store"),
    `cache=${cache}`
  );
  note(
    `${label}.safe-body`,
    !/stack/i.test(blob) &&
      !/node_modules/i.test(blob) &&
      !blob.includes(jwtSecret) &&
      !blob.includes(oneCKey) &&
      !blob.includes(password) &&
      !/s4b-[a-z0-9.+-]+@test\.local/i.test(blob) &&
      !/\+7999\d{7}/.test(blob) &&
      !/bucket|hmac|digest|tracked|capacity/i.test(blob),
    `chars=${blob.length}`
  );
}

function guestBody(phone = "+79990000001") {
  return {
    contactName: "Гость S4B",
    companyName: "S4B Guest",
    phone,
    email: "",
    address: "Санкт-Петербург, Невский 1",
    comment: "isolated",
    items: [{
      productId: "s4b-product",
      code: "S4B-1",
      unit: "piece",
      qty: 1,
    }],
  };
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

const passwordHash = bcrypt.hashSync(${JSON.stringify(password)}, 12);
const admin = createUser({
  email: "s4b-admin@test.local",
  passwordHash,
  role: "admin",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "S4B Admin", contactName: "Admin" },
});
const client = createUser({
  email: "s4b-client@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "S4B Client", contactName: "Client", phone: "+79990001111" },
});
setGlobalState("settings", {
  ...DEFAULT_SETTINGS,
  storefrontPricingMode: "manual",
  deliveryOneCId: "s4b-delivery-1",
  deliveryOneCCode: "НФ-DELIVERY",
  deliveryOneCName: "Доставка",
});
const receivedAt = new Date().toISOString();
setGlobalState("products", [{
  id: "s4b-product",
  name: "S4B витрина",
  code: "S4B-1",
  active: true,
  showOnStorefront: true,
  oneCId: "s4b-onec-1",
  oneCCode: "НФ-S4B",
  saleUnits: ["piece"],
  pieceSize: 1,
  storefrontPricing: { source: "manual", piece: 100 },
}]);
setGlobalState("oneCProducts", [{
  id: "s4b-onec-1",
  code: "НФ-S4B",
  name: "S4B витрина",
  purchasePrice: 50,
  purchasePricePiece: 50,
  purchasePriceReceivedAt: receivedAt,
}, {
  id: "s4b-delivery-1",
  code: "НФ-DELIVERY",
  name: "Доставка",
  purchasePrice: 0,
  purchasePricePiece: 0,
  purchasePriceReceivedAt: receivedAt,
}]);
replaceOrders({
  managerMode: true,
  orders: [{
    id: "s4b-order-1",
    number: "S4B-1001",
    clientId: client.id,
    customerName: "S4B Client",
    customerEmail: client.email,
    status: "Новый",
    exchange: { status: "ready", database: "TEST" },
    items: [{
      id: "s4b-line-1",
      productId: "s4b-product",
      name: "S4B витрина",
      unit: "piece",
      quantity: 1,
      unitPrice: 100,
      lineTotal: 100,
      oneCId: "s4b-onec-1",
      oneCCode: "НФ-S4B",
    }],
  }],
});
writeFileSync(${JSON.stringify(seedMetaPath)}, JSON.stringify({
  adminEmail: admin.email,
  clientEmail: client.email,
  orderId: "s4b-order-1",
  orderNumber: "S4B-1001",
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

function childEnv(port, extra = {}) {
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
    CLOVER_RATE_LIMIT_MAX_ENTRIES: extra.maxEntries || "64",
    ALLOW_DEV_AUTH_LINKS: "1",
    ...extra.env,
  };
}

async function startServer(extra = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: serverDir,
    env: childEnv(port, extra),
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
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${stderr.slice(-2000)}`);
  }
  return { port, child, stderr: () => stderr };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function burst(port, pathname, bodies) {
  const out = [];
  for (const body of bodies) {
    out.push(await rawRequest(port, { path: pathname, body }));
  }
  return out;
}

async function proveLimitedRoute({
  port,
  id,
  pathname,
  allowedBodies,
  extraBody,
  otherBody,
  spoofBody,
  casePath,
  slashPath,
  expectAllowedStatus,
  beforeCounts,
  afterLimitedCounts,
  cookieJar,
}) {
  const allowed = [];
  for (const body of allowedBodies) {
    allowed.push(await rawRequest(port, { path: pathname, body, cookieJar }));
  }
  const allowedOk = allowed.every((res) => {
    if (typeof expectAllowedStatus === "function") return expectAllowedStatus(res);
    if (Array.isArray(expectAllowedStatus)) return expectAllowedStatus.includes(res.status);
    return res.status !== 429;
  });
  note(
    `${id}.allowed-reach-handler`,
    allowedOk && allowed.length === allowedBodies.length,
    `n=${allowed.length} statuses=${allowed.map((res) => res.status).join(",")}`
  );

  const started = Date.now();
  const limited = await rawRequest(port, { path: pathname, body: extraBody, cookieJar });
  const limitedMs = Date.now() - started;
  assertSafe429(limited, id);
  note(`${id}.before-side-effects`, limitedMs < 150, `ms=${limitedMs}`);

  if (beforeCounts && afterLimitedCounts) {
    afterLimitedCounts();
  }

  const other = await rawRequest(port, { path: pathname, body: otherBody });
  note(
    `${id}.other-subject-not-blocked`,
    other.status !== 429,
    `status=${other.status}`
  );

  const spoofed = await rawRequest(port, {
    path: pathname,
    headers: {
      "X-Forwarded-For": "203.0.113.9, 198.51.100.2",
      Forwarded: "for=2001:db8::1;proto=https",
      "X-Real-IP": "198.51.100.77",
    },
    body: spoofBody || extraBody,
    cookieJar,
  });
  assertSafe429(spoofed, `${id}.spoofed-proxy`);

  if (casePath) {
    const mixed = await rawRequest(port, { path: casePath, body: extraBody, cookieJar });
    assertSafe429(mixed, `${id}.mixed-case`);
  }
  if (slashPath) {
    const slash = await rawRequest(port, { path: slashPath, body: extraBody, cookieJar });
    note(
      `${id}.trailing-slash-same-bucket`,
      slash.status === 429,
      `status=${slash.status}`
    );
    if (slash.status === 429) assertSafe429(slash, `${id}.trailing-slash`);
  }
}

async function runStoreUnitTests() {
  let mod;
  try {
    mod = await import(moduleUrl(path.join(serverDir, "src/publicRateLimit.js")));
  } catch (error) {
    note("store.module", false, `missing or invalid publicRateLimit.js: ${error.message}`);
    return;
  }

  const nowRef = { t: 1_000_000 };
  const store = mod.createBoundedRateLimitStore({
    maxEntries: 8,
    now: () => nowRef.t,
  });
  for (let i = 0; i < 20; i += 1) {
    store.consume(`k${i}`, { max: 3, windowMs: 1000 });
  }
  note("store.bound", store.size() <= 8, `size=${store.size()}`);

  nowRef.t += 5_000;
  const pruned = store.pruneExpired();
  note("store.cleanup-expired", pruned >= 1 && store.size() === 0, `pruned=${pruned} size=${store.size()}`);

  const hashed = mod.hashRateLimitSubject({
    secret: jwtSecret,
    version: "1",
    scope: "login",
    subject: "s4b-client@test.local",
  });
  note(
    "store.key-not-pii",
    typeof hashed === "string" &&
      hashed.length >= 32 &&
      !hashed.includes("@") &&
      !hashed.includes("s4b-client"),
    `keyLen=${String(hashed || "").length}`
  );
  note(
    "store.email-normalize",
    mod.normalizeRateLimitEmail("  A.B@Test.Local ") === "a.b@test.local",
    mod.normalizeRateLimitEmail("  A.B@Test.Local ")
  );
  const phoneA = mod.normalizeRateLimitPhone("+7 (999) 000-00-01");
  note(
    "store.phone-normalize",
    phoneA === mod.normalizeRateLimitPhone("89990000001") &&
      phoneA === mod.normalizeRateLimitPhone("9990000001") &&
      phoneA === mod.normalizeRateLimitPhone("+799900000010"),
    `${phoneA} vs 8/10/12-digit variants`
  );

  const lockStore = mod.createBoundedRateLimitStore({ maxEntries: 8, now: () => 1 });
  lockStore.consume("keep", { max: 2, windowMs: 10_000 });
  lockStore.consume("keep", { max: 2, windowMs: 10_000 });
  lockStore.consume("keep", { max: 2, windowMs: 10_000 });
  for (let i = 0; i < 20; i += 1) {
    lockStore.consume(`flood${i}`, { max: 3, windowMs: 10_000 });
  }
  const kept = lockStore.consume("keep", { max: 2, windowMs: 10_000 });
  note(
    "store.evict-preserves-lock",
    kept.allowed === false && lockStore.size() <= 8,
    `allowed=${kept.allowed} size=${lockStore.size()}`
  );

  const victimStore = mod.createBoundedRateLimitStore({ maxEntries: 8, now: () => 2_000_000 });
  let victim19;
  for (let i = 0; i < 19; i += 1) {
    victim19 = victimStore.consume("victim", { max: 20, windowMs: 10_000 });
  }
  note("store.b2.victim-19", victim19?.count === 19 && victim19.allowed === true, `count=${victim19?.count}`);
  const inspectCaps = [];
  for (let i = 0; i < 24; i += 1) {
    const sprayed = victimStore.consume(`unique-${i}`, { max: 20, windowMs: 10_000 });
    if (victimStore.size() >= 8) inspectCaps.push(sprayed.inspected);
  }
  const twentieth = victimStore.consume("victim", { max: 20, windowMs: 10_000 });
  const twentyFirst = victimStore.consume("victim", { max: 20, windowMs: 10_000 });
  note(
    "store.b2.victim-20-keeps-count",
    twentieth.allowed === true && twentieth.count === 20,
    `allowed=${twentieth.allowed} count=${twentieth.count}`
  );
  note(
    "store.b2.victim-21-blocks",
    twentyFirst.allowed === false && twentyFirst.count === 21,
    `allowed=${twentyFirst.allowed} count=${twentyFirst.count}`
  );
  note(
    "store.b2.size-capped",
    victimStore.size() <= 8,
    `size=${victimStore.size()}`
  );
  note(
    "store.b2.active-not-evicted",
    twentieth.count === 20 && twentyFirst.count === 21,
    `20=${twentieth.count} 21=${twentyFirst.count}`
  );

  const blockedStore = mod.createBoundedRateLimitStore({ maxEntries: 4, now: () => 3_000_000 });
  blockedStore.consume("blocked", { max: 1, windowMs: 10_000 });
  blockedStore.consume("blocked", { max: 1, windowMs: 10_000 });
  const atMaxStore = mod.createBoundedRateLimitStore({ maxEntries: 4, now: () => 3_000_000 });
  atMaxStore.consume("at-max", { max: 2, windowMs: 10_000 });
  atMaxStore.consume("at-max", { max: 2, windowMs: 10_000 });
  const belowStore = mod.createBoundedRateLimitStore({ maxEntries: 4, now: () => 3_000_000 });
  belowStore.consume("below", { max: 5, windowMs: 10_000 });
  belowStore.consume("below", { max: 5, windowMs: 10_000 });
  for (let i = 0; i < 8; i += 1) {
    blockedStore.consume(`spray-b-${i}`, { max: 5, windowMs: 10_000 });
    atMaxStore.consume(`spray-m-${i}`, { max: 5, windowMs: 10_000 });
    belowStore.consume(`spray-l-${i}`, { max: 5, windowMs: 10_000 });
  }
  const blockedAfter = blockedStore.consume("blocked", { max: 1, windowMs: 10_000 });
  const atMaxAfter = atMaxStore.consume("at-max", { max: 2, windowMs: 10_000 });
  const belowAfter = belowStore.consume("below", { max: 5, windowMs: 10_000 });
  note(
    "store.b2.blocked-preserved",
    blockedAfter.allowed === false && blockedAfter.count === 3,
    `allowed=${blockedAfter.allowed} count=${blockedAfter.count}`
  );
  note(
    "store.b2.count-eq-max-preserved",
    atMaxAfter.allowed === false && atMaxAfter.count === 3,
    `allowed=${atMaxAfter.allowed} count=${atMaxAfter.count}`
  );
  note(
    "store.b2.below-max-preserved",
    belowAfter.allowed === true && belowAfter.count === 3,
    `allowed=${belowAfter.allowed} count=${belowAfter.count}`
  );
  note(
    "store.b2.no-full-scan-when-full",
    inspectCaps.length >= 1 && inspectCaps.every((n) => Number.isInteger(n) && n <= 64),
    `n=${inspectCaps.length} inspected=${inspectCaps.slice(-5).join(",")}`
  );

  const raceStore = mod.createBoundedRateLimitStore({ maxEntries: 16, now: () => 1 });
  const race = Array.from({ length: 30 }, () => raceStore.consume("same", { max: 5, windowMs: 1000 }));
  const allowed = race.filter((item) => item.allowed).length;
  const denied = race.filter((item) => !item.allowed).length;
  note("store.atomic-n-plus-one", allowed === 5 && denied === 25, `allowed=${allowed} denied=${denied}`);

  const anonId = mod.createAnonymousClientId();
  const encoded = mod.encodeAnonymousClientCookie(anonId, jwtSecret);
  note(
    "store.anon-cookie-roundtrip",
    /^[0-9a-f]{32}$/.test(anonId) && mod.decodeAnonymousClientCookie(encoded, jwtSecret) === anonId,
    `idLen=${anonId.length}`
  );
  note(
    "store.anon-cookie-forged",
    mod.decodeAnonymousClientCookie(`${anonId}.${"00".repeat(32)}`, jwtSecret) === null,
    "forged hmac rejected"
  );
  const cookieHeader = mod.buildAnonymousClientCookieHeader(anonId, jwtSecret);
  note(
    "store.anon-cookie-flags",
    cookieHeader.includes("HttpOnly") &&
      cookieHeader.includes("SameSite=Lax") &&
      cookieHeader.includes("Path=/") &&
      !cookieHeader.includes("Secure"),
    cookieHeader
  );
  const fullStore = mod.createBoundedRateLimitStore({ maxEntries: 2, now: () => 4_000_000 });
  fullStore.consume("keep-a", { max: 5, windowMs: 10_000 });
  fullStore.consume("keep-b", { max: 5, windowMs: 10_000 });
  const failOpen = fullStore.consume("spray-new", { max: 5, windowMs: 10_000 });
  note(
    "store.residual.unique-subject-spray-fail-open",
    failOpen.allowed === true &&
      failOpen.tracked === false &&
      failOpen.capacity === true &&
      fullStore.size() === 2,
    `allowed=${failOpen.allowed} tracked=${failOpen.tracked} capacity=${failOpen.capacity} size=${fullStore.size()}`
  );
}

let primary;

try {
  seedDatabase();
  const meta = JSON.parse(readFileSync(seedMetaPath, "utf8"));

  primary = await startServer();
  const { port } = primary;

  const source = readFileSync(path.join(serverDir, "src/server.js"), "utf8");
  note(
    "source.no-trust-proxy",
    !/trust\s*proxy/i.test(source) && !/loginAttemptsByIp|\bipAttempts\b/.test(source),
    "trust proxy / IP attempt maps absent"
  );
  note(
    "source.no-xff-bucket",
    !/X-Forwarded-For|X-Real-IP|req\.ip/.test(source.slice(
      source.indexOf("publicRateLimit") >= 0 ? source.indexOf("publicRateLimit") : 0
    )) || !/loginAttemptsByIp/.test(source),
    "no IP bucket fields"
  );

  const usersBefore = sqlCount("users");
  const registerEmail = "s4b-register@test.local";
  const registerBody = {
    email: registerEmail,
    password,
    companyName: "S4B Co",
    contactName: "Reg User",
    phone: "+79990002222",
  };
  await proveLimitedRoute({
    port,
    id: "register",
    pathname: "/api/auth/register",
    allowedBodies: Array.from({ length: EXPECTED.register.max }, () => ({ ...registerBody })),
    extraBody: { ...registerBody },
    otherBody: { ...registerBody, email: "s4b-register-other@test.local" },
    casePath: "/API/auth/Register",
    slashPath: "/api/auth/register/",
    expectAllowedStatus: (res) => res.status === 201 || res.status === 409,
  });
  note(
    "register.no-extra-user-on-429",
    sqlCount("users") === usersBefore + 2,
    `users=${sqlCount("users")} before=${usersBefore}`
  );

  const tokensBeforeForgot = sqlCount("auth_tokens");
  await proveLimitedRoute({
    port,
    id: "forgot",
    pathname: "/api/auth/forgot-password",
    allowedBodies: Array.from({ length: EXPECTED.forgotPassword.max }, () => ({
      email: meta.clientEmail,
    })),
    extraBody: { email: meta.clientEmail },
    otherBody: { email: "s4b-unknown-forgot@test.local" },
    casePath: "/API/auth/Forgot-Password",
    slashPath: "/api/auth/forgot-password/",
    expectAllowedStatus: [200],
  });
  const tokensAfterForgot = sqlCount("auth_tokens");
  note(
    "forgot.no-token-on-429",
    tokensAfterForgot === tokensBeforeForgot + 1,
    `tokens=${tokensAfterForgot} before=${tokensBeforeForgot}`
  );

  const unknownForgot = await burst(
    port,
    "/api/auth/forgot-password",
    Array.from({ length: EXPECTED.forgotPassword.max + 1 }, () => ({
      email: "s4b-unknown-same@test.local",
    }))
  );
  note(
    "forgot.unknown-same-external",
    unknownForgot.slice(0, EXPECTED.forgotPassword.max).every((res) => res.status === 200) &&
      unknownForgot[EXPECTED.forgotPassword.max].status === 429 &&
      unknownForgot[0].json?.message === unknownForgot[EXPECTED.forgotPassword.max - 1].json?.message,
    `statuses=${unknownForgot.map((res) => res.status).join(",")}`
  );

  await proveLimitedRoute({
    port,
    id: "resend",
    pathname: "/api/auth/resend-verification",
    allowedBodies: Array.from({ length: EXPECTED.resendVerification.max }, () => ({
      email: "s4b-resend@test.local",
    })),
    extraBody: { email: "s4b-resend@test.local" },
    otherBody: { email: "s4b-resend-other@test.local" },
    casePath: "/API/auth/Resend-Verification",
    slashPath: "/api/auth/resend-verification/",
    expectAllowedStatus: [200],
  });

  const verifyToken = "s4b-verify-token-value-20ch";
  await proveLimitedRoute({
    port,
    id: "verify-email",
    pathname: "/api/auth/verify-email",
    allowedBodies: Array.from({ length: EXPECTED.verifyEmail.max }, () => ({ token: verifyToken })),
    extraBody: { token: verifyToken },
    otherBody: { token: "s4b-verify-other-token-20ch" },
    casePath: "/API/auth/Verify-Email",
    slashPath: "/api/auth/verify-email/",
    expectAllowedStatus: [400],
  });

  const resetToken = "s4b-reset-token-value-20chxx";
  await proveLimitedRoute({
    port,
    id: "reset-password",
    pathname: "/api/auth/reset-password",
    allowedBodies: Array.from({ length: EXPECTED.resetPassword.max }, () => ({
      token: resetToken,
      password,
    })),
    extraBody: { token: resetToken, password },
    otherBody: { token: "s4b-reset-other-token-20chxx", password },
    casePath: "/API/auth/Reset-Password",
    slashPath: "/api/auth/reset-password/",
    expectAllowedStatus: [400],
  });

  const challengesBefore = sqlCount("webauthn_challenges");
  const passkeyOptionsJar = {};
  await proveLimitedRoute({
    port,
    id: "passkey-options",
    pathname: "/api/passkeys/authentication/options",
    allowedBodies: Array.from({ length: EXPECTED.passkeyAuthOptions.max }, () => ({})),
    extraBody: {},
    otherBody: { email: "s4b-passkey-other@test.local" },
    casePath: "/API/passkeys/authentication/Options",
    slashPath: "/api/passkeys/authentication/options/",
    expectAllowedStatus: [200],
    cookieJar: passkeyOptionsJar,
  });
  note(
    "passkey-options.no-ceremony-on-429",
    sqlCount("webauthn_challenges") === challengesBefore + EXPECTED.passkeyAuthOptions.max,
    `challenges=${sqlCount("webauthn_challenges")} before=${challengesBefore}`
  );

  const rateLimitSource = readFileSync(path.join(serverDir, "src/publicRateLimit.js"), "utf8");
  note(
    "passkey-options.no-shared-discoverable-subject",
    !/email\s*\|\|\s*"discoverable"/.test(source) &&
      !/\|\|\s*"discoverable"/.test(rateLimitSource) &&
      !/return\s+"discoverable"/.test(rateLimitSource),
    "shared discoverable subject absent"
  );
  const jarA = passkeyOptionsJar;
  const jarB = {};
  const clientAAgain = await rawRequest(port, {
    path: "/api/passkeys/authentication/options",
    body: {},
    cookieJar: jarA,
    headers: {
      "X-Forwarded-For": "203.0.113.50",
      "X-Real-IP": "198.51.100.50",
    },
  });
  note(
    "passkey-options.b1.client-a-limited",
    clientAAgain.status === 429,
    `status=${clientAAgain.status}`
  );
  const challengesAfterA = sqlCount("webauthn_challenges");
  const discoverableB = await rawRequest(port, {
    path: "/api/passkeys/authentication/options",
    body: {},
    cookieJar: jarB,
    headers: {
      "X-Forwarded-For": "203.0.113.50",
      Forwarded: "for=203.0.113.50;proto=https",
      "X-Real-IP": "198.51.100.50",
    },
  });
  note(
    "passkey-options.b1.client-b-independent",
    discoverableB.status === 200 &&
      discoverableB.json?.mode === "discoverable" &&
      Boolean(discoverableB.json?.ceremonyId),
    `status=${discoverableB.status} mode=${discoverableB.json?.mode || ""}`
  );
  note(
    "passkey-options.b1.client-b-has-ceremony",
    sqlCount("webauthn_challenges") === challengesAfterA + 1,
    `challenges=${sqlCount("webauthn_challenges")} afterA=${challengesAfterA}`
  );
  note(
    "passkey-options.b1.jars-differ",
    Boolean(jarA.cookie) &&
      Boolean(jarB.cookie) &&
      jarA.cookie !== jarB.cookie &&
      !/@/.test(jarA.cookie) &&
      !/@/.test(jarB.cookie),
    `a=${Boolean(jarA.cookie)} b=${Boolean(jarB.cookie)} same=${jarA.cookie === jarB.cookie}`
  );
  const forgedJar = { cookie: "clover_rl_client=deadbeefdeadbeefdeadbeefdeadbeef.00" };
  const forged = await rawRequest(port, {
    path: "/api/passkeys/authentication/options",
    body: {},
    cookieJar: forgedJar,
  });
  note(
    "passkey-options.b1.forged-rejected",
    forged.status === 200 &&
      Boolean(forgedJar.cookie) &&
      forgedJar.cookie !== "clover_rl_client=deadbeefdeadbeefdeadbeefdeadbeef.00" &&
      forgedJar.cookie !== jarA.cookie,
    `status=${forged.status} rotated=${forgedJar.cookie !== jarA.cookie}`
  );
  const setCookies = typeof forged.headers.getSetCookie === "function"
    ? forged.headers.getSetCookie()
    : [String(forged.headers.get("set-cookie") || "")];
  const issued = setCookies.join("\n");
  note(
    "passkey-options.b1.cookie-flags",
    /HttpOnly/i.test(issued) && /SameSite=Lax/i.test(issued) && /Path=\//i.test(issued),
    issued.slice(0, 160)
  );

  const ceremonyId = "11111111-1111-4111-8111-111111111111";
  await proveLimitedRoute({
    port,
    id: "passkey-verify",
    pathname: "/api/passkeys/authentication/verify",
    allowedBodies: Array.from({ length: EXPECTED.passkeyAuthVerify.max }, () => ({
      ceremonyId,
      email: meta.clientEmail,
      response: { id: "s4b-cred", rawId: "s4b-cred", type: "public-key", response: {} },
    })),
    extraBody: {
      ceremonyId,
      email: meta.clientEmail,
      response: { id: "s4b-cred", rawId: "s4b-cred", type: "public-key", response: {} },
    },
    otherBody: {
      ceremonyId: "22222222-2222-4222-8222-222222222222",
      email: "s4b-passkey-verify-other@test.local",
      response: { id: "s4b-cred", rawId: "s4b-cred", type: "public-key", response: {} },
    },
    casePath: "/API/passkeys/authentication/Verify",
    slashPath: "/api/passkeys/authentication/verify/",
    expectAllowedStatus: (res) => res.status >= 400 && res.status !== 429,
  });

  const ordersBefore = sqlCount("orders");
  await proveLimitedRoute({
    port,
    id: "guest-order",
    pathname: "/api/public/orders",
    allowedBodies: Array.from({ length: EXPECTED.guestOrder.max }, () => guestBody("+79990000001")),
    extraBody: guestBody("+79990000001"),
    otherBody: guestBody("+79990000099"),
    spoofBody: guestBody("+79990000001"),
    casePath: "/API/public/Orders",
    slashPath: "/api/public/orders/",
    expectAllowedStatus: [201],
  });
  note(
    "guest-order.no-create-on-429",
    sqlCount("orders") === ordersBefore + EXPECTED.guestOrder.max + 1, // +1 other subject
    `orders=${sqlCount("orders")} before=${ordersBefore}`
  );

  const plus7 = await rawRequest(port, { path: "/api/public/orders", body: guestBody("+7 (999) 000-00-01") });
  assertSafe429(plus7, "guest-order.normalized-phone");
  const tenDigit = await rawRequest(port, { path: "/api/public/orders", body: guestBody("9990000001") });
  assertSafe429(tenDigit, "guest-order.normalized-phone-10");
  const extraDigit = await rawRequest(port, { path: "/api/public/orders", body: guestBody("+799900000010") });
  assertSafe429(extraDigit, "guest-order.normalized-phone-extra");

  const loginUnknown = "s4b-login-unknown@test.local";
  const loginAllowed = [];
  for (let i = 0; i < EXPECTED.login.max; i += 1) {
    const started = Date.now();
    const res = await rawRequest(port, {
      path: "/api/auth/login",
      body: { email: loginUnknown, password: "WrongAttempt!9" },
    });
    loginAllowed.push({ res, ms: Date.now() - started });
  }
  note(
    "login.unknown-allowed",
    loginAllowed.every((item) => item.res.status === 401 && item.res.json?.code === "AUTH_INVALID_CREDENTIALS"),
    `statuses=${loginAllowed.map((item) => item.res.status).join(",")}`
  );
  const loginLimitedStarted = Date.now();
  const loginLimited = await rawRequest(port, {
    path: "/api/auth/login",
    body: { email: loginUnknown, password: "WrongAttempt!9" },
  });
  const loginLimitedMs = Date.now() - loginLimitedStarted;
  assertSafe429(loginLimited, "login.unknown");
  note("login.unknown.before-bcrypt", loginLimitedMs < 150, `ms=${loginLimitedMs}`);

  const loginKnownAllowed = [];
  let lastKnown401Ms = 0;
  for (let i = 0; i < EXPECTED.login.max; i += 1) {
    const started = Date.now();
    loginKnownAllowed.push(await rawRequest(port, {
      path: "/api/auth/login",
      body: { email: meta.clientEmail, password: "WrongAttempt!9" },
    }));
    lastKnown401Ms = Date.now() - started;
  }
  const knownLimitedStarted = Date.now();
  const loginKnownLimited = await rawRequest(port, {
    path: "/api/auth/login",
    body: { email: meta.clientEmail, password },
  });
  const knownLimitedMs = Date.now() - knownLimitedStarted;
  note(
    "login.known-unknown-same-429",
    loginKnownAllowed.every((res) => res.status === 401) &&
      loginKnownLimited.status === 429 &&
      loginKnownLimited.json?.error === loginLimited.json?.error &&
      loginKnownLimited.json?.code === loginLimited.json?.code,
    `knownLimited=${loginKnownLimited.status}`
  );
  note(
    "login.known.before-bcrypt-fast",
    loginKnownLimited.status === 429 &&
      knownLimitedMs < 150 &&
      knownLimitedMs < lastKnown401Ms,
    `limitedMs=${knownLimitedMs} last401Ms=${lastKnown401Ms}`
  );

  const parallelForgot = await Promise.all(Array.from({ length: 12 }, () => rawRequest(port, {
    path: "/api/auth/forgot-password",
    body: { email: "s4b-parallel@test.local" },
  })));
  const parallelAllowed = parallelForgot.filter((res) => res.status === 200).length;
  const parallelDenied = parallelForgot.filter((res) => res.status === 429).length;
  note(
    "forgot.parallel-atomic",
    parallelAllowed === EXPECTED.forgotPassword.max && parallelDenied === 12 - EXPECTED.forgotPassword.max,
    `allowed=${parallelAllowed} denied=${parallelDenied}`
  );

  const floodBodies = Array.from({ length: 80 }, (_, index) => ({
    email: `s4b-flood-${index}@test.local`,
  }));
  const flood = await burst(port, "/api/auth/forgot-password", floodBodies);
  note(
    "flood.unique-email.server-alive",
    flood.every((res) => res.status === 200 || res.status === 429) &&
      (await rawRequest(port, { path: "/api/health", method: "GET" })).status === 200,
    `ok=${flood.filter((res) => res.status === 200).length} limited=${flood.filter((res) => res.status === 429).length}`
  );

  const claim = await rawRequest(port, {
    path: "/api/one-c/test-order",
    method: "POST",
    oneC: true,
    body: {},
  });
  note(
    "onec.claim.not-429",
    claim.status === 200 && claim.status !== 429,
    `status=${claim.status}`
  );
  const ack = await rawRequest(port, {
    path: `/api/one-c/orders/${meta.orderId}/ack`,
    oneC: true,
    body: { orderNumber: meta.orderNumber, documentNumber: "TEST-DOC-1" },
  });
  note("onec.ack.not-429", ack.status === 200 && ack.json?.ok === true, `status=${ack.status}`);
  const ackAgain = await rawRequest(port, {
    path: `/api/one-c/orders/${meta.orderId}/ack`,
    oneC: true,
    body: { orderNumber: meta.orderNumber, documentNumber: "TEST-DOC-1" },
  });
  note(
    "onec.ack.idempotent",
    ackAgain.status === 200 && ackAgain.json?.duplicateAck === true && ackAgain.status !== 429,
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
  note("onec.accepted.not-429", accepted.status !== 429 && accepted.status < 500, `status=${accepted.status}`);

  const pollBurst = [];
  for (let i = 0; i < 12; i += 1) {
    pollBurst.push(await rawRequest(port, {
      path: "/api/one-c/test-order",
      method: "POST",
      oneC: true,
      body: {},
    }));
  }
  note(
    "onec.poll.no-new-429",
    pollBurst.every((res) => res.status !== 429),
    `statuses=${pollBurst.map((res) => res.status).join(",")}`
  );

  const stateRes = await rawRequest(port, {
    path: "/api/state/products",
    method: "PUT",
    token: (await rawRequest(port, {
      path: "/api/auth/login",
      body: { email: meta.adminEmail, password },
    })).json?.token,
    body: {
      products: [{
        id: "s4b-product",
        name: "S4B витрина",
        code: "S4B-1",
        active: true,
        showOnStorefront: true,
        saleUnits: ["piece"],
        pieceSize: 1,
        storefrontPricing: { source: "manual", piece: 100 },
      }],
    },
  });
  note("state.products.not-429", stateRes.status !== 429, `status=${stateRes.status}`);

  await stopServer(primary.child);
  primary = null;

  const restarted = await startServer();
  const afterRestart = await rawRequest(restarted.port, {
    path: "/api/auth/login",
    body: { email: meta.clientEmail, password: "WrongAttempt!9" },
  });
  note(
    "restart.login-limit.residual-cleared",
    afterRestart.status === 401 && afterRestart.json?.code === "AUTH_INVALID_CREDENTIALS",
    `status=${afterRestart.status} (in-memory residual)`
  );
  await stopServer(restarted.child);

  const procA = await startServer();
  const procB = await startServer();
  for (let i = 0; i < 12; i += 1) {
    await rawRequest(procA.port, {
      path: "/api/auth/login",
      body: { email: "s4b-multi@test.local", password: "WrongAttempt!9" },
    });
    await rawRequest(procB.port, {
      path: "/api/auth/login",
      body: { email: "s4b-multi@test.local", password: "WrongAttempt!9" },
    });
  }
  const stillA = await rawRequest(procA.port, {
    path: "/api/auth/login",
    body: { email: "s4b-multi@test.local", password: "WrongAttempt!9" },
  });
  const stillB = await rawRequest(procB.port, {
    path: "/api/auth/login",
    body: { email: "s4b-multi@test.local", password: "WrongAttempt!9" },
  });
  note(
    "multiprocess.login-limit.residual-independent",
    stillA.status === 401 && stillB.status === 401,
    `A=${stillA.status} B=${stillB.status} (12+12 < 20 per process; shared store would already 429)`
  );
  await stopServer(procA.child);
  await stopServer(procB.child);

  await runStoreUnitTests();
} catch (error) {
  note("verifier.uncaught", false, String(error?.stack || error).slice(0, 500));
} finally {
  if (primary?.child) await stopServer(primary.child);
  rmSync(temp, { recursive: true, force: true });
}

const failed = results.filter((item) => !item.ok);
console.log(`verify-security-stage4-package-b: ${failed.length ? "FAIL" : "ok"} (${results.length} checks)`);
if (failed.length) process.exitCode = 1;
