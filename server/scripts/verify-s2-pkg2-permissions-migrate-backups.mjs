/**
 * S2-NEW-003/004/005 HTTP matrix on isolated SQLite under /opt.
 * Direct API, not UI. Production DB/env are not used.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const OPT_TMP = "/opt/clover/.tmp";
mkdirSync(OPT_TMP, { recursive: true });
const temp = mkdtempSync(path.join(OPT_TMP, "s2-pkg2-verify-"));
const databasePath = path.join(temp, "clover.sqlite");
const uploadsDir = path.join(temp, "uploads");
const backupDir = path.join(temp, "backups");
mkdirSync(uploadsDir);
mkdirSync(backupDir);

const PROD_DB = "/opt/clover/clover-app/server/data/clover.sqlite";
const PROD_ENV = "/opt/clover/clover-app/server/.env";
const jwtSecret = "clover-s2-pkg2-verify-secret-32chars!!";
const password = "S2Pkg2VerifyPass!1";
const require = createRequire(path.join(serverDir, "package.json"));
const results = [];

function fingerprint(p) {
  try {
    const st = statSync(p);
    return { mtimeMs: st.mtimeMs, size: st.isFile() ? st.size : -1 };
  } catch {
    return null;
  }
}

const prodBefore = { db: fingerprint(PROD_DB), env: fingerprint(PROD_ENV) };

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

async function waitHealth(base, attempts = 1000) {
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
    json = { raw: text.slice(0, 800) };
  }
  return { status: res.status, json, text };
}

async function login(base, email) {
  const res = await api(base, "/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(res.status, 200, `login ${email} → ${res.status}`);
  return res.json.token;
}

function backupNames() {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir).filter((name) => name.endsWith(".zip") || name.endsWith(".json")).sort();
}

function settingsHeroFromDb() {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const row = db.prepare("SELECT value_json FROM app_state WHERE key = 'settings'").get();
  db.close();
  const parsed = row ? JSON.parse(row.value_json) : {};
  return parsed.storefrontHeroTitle || "";
}

function productNamesFromDb() {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const row = db.prepare("SELECT value_json FROM app_state WHERE key = 'products'").get();
  db.close();
  const parsed = row ? JSON.parse(row.value_json) : [];
  return (Array.isArray(parsed) ? parsed : []).map((item) => String(item?.name || ""));
}

function clientLinkFromDb(clientId) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const row = db.prepare("SELECT value_json FROM app_state WHERE key = 'clientLinks'").get();
  db.close();
  const parsed = row ? JSON.parse(row.value_json) : {};
  return parsed?.[clientId] || {};
}

function permissionsJsonFromDb(email) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const row = db.prepare("SELECT permissions_json FROM users WHERE email = ?").get(email);
  db.close();
  return row?.permissions_json;
}

function notificationFromDb(id) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const row = db.prepare(
    "SELECT id, type, body, read_at FROM manager_notifications WHERE id = ?"
  ).get(id);
  db.close();
  return row;
}

function notificationTypes(json) {
  return (json?.notifications || []).map((item) => item.type).sort();
}

function channelStatusLeaks(status) {
  const raw = JSON.stringify(status || {});
  return Boolean(
    status?.email?.recipient ||
      status?.telegram?.chatId ||
      status?.email?.smtpConfigured != null ||
      status?.telegram?.tokenConfigured != null ||
      /pkg2-notify-secret@example.com|999111222333/.test(raw)
  );
}

function payloadHasHiddenPii(json) {
  const raw = JSON.stringify(json || {});
  return /ContactPII|\+79990001122|unknown-secret|pkg2-notify-secret@example.com|999111222333/.test(
    raw
  );
}

function assertProdUntouched() {
  const after = { db: fingerprint(PROD_DB), env: fingerprint(PROD_ENV) };
  assert.deepEqual(after, prodBefore, "production db/env changed");
}

function extractManagerRoutes(source) {
  const routes = [];
  const re = /app\.(get|post|put|patch|delete)\(\s*(?:\n\s*)?"([^"]+)"([\s\S]*?)(?=\napp\.|$)/g;
  let match;
  while ((match = re.exec(source))) {
    const prelude = match[3];
    const handlerStart = prelude.search(/\n\s*(?:async\s*)?\(/);
    const middleware = handlerStart >= 0 ? prelude.slice(0, handlerStart) : prelude.slice(0, 400);
    if (!middleware.includes("roleRequired(")) continue;
    const roleMatch = middleware.match(/roleRequired\("(manager|admin)"\)/);
    if (!roleMatch) continue;
    routes.push({
      method: match[1].toUpperCase(),
      path: match[2],
      role: roleMatch[1],
    });
  }
  return routes;
}

function seed() {
  const seedPath = path.join(temp, "seed.mjs");
  writeFileSync(
    seedPath,
    `
process.env.DB_PATH = ${JSON.stringify(databasePath)};
process.env.JWT_SECRET = ${JSON.stringify(jwtSecret)};
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
const { createRequire } = await import("node:module");
const require = createRequire(${JSON.stringify(path.join(serverDir, "package.json"))});
const bcrypt = require("bcryptjs");
const { DatabaseSync } = await import("node:sqlite");
const { createUser, setStaffPermissions, setGlobalState, getGlobalState, createManagerNotification } = await import(${JSON.stringify(
      pathToFileURL(path.join(serverDir, "src/db.js")).href
    )});
const { STAFF_FEATURE_IDS } = await import(${JSON.stringify(
      pathToFileURL(path.join(serverDir, "src/roles.js")).href
    )});
const { saveClientAccessCredentials } = await import(${JSON.stringify(
      pathToFileURL(path.join(serverDir, "src/clientAccessVault.js")).href
    )});
const { DEFAULT_SETTINGS } = await import(${JSON.stringify(
      pathToFileURL(path.join(serverDir, "src/defaults.js")).href
    )});
const { initializeLocalizationCatalog } = await import(${JSON.stringify(
      pathToFileURL(path.join(serverDir, "src/localizationStore.js")).href
    )});
initializeLocalizationCatalog();
const passwordHash = bcrypt.hashSync(${JSON.stringify(password)}, 4);
createUser({
  email: "pkg2-admin@test.local",
  passwordHash,
  role: "admin",
  emailVerified: true,
  approvalStatus: "approved",
});
const restricted = createUser({
  email: "pkg2-restricted@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
setStaffPermissions(restricted.id, { tabs: ["orders"], manageStaff: false });
const allowed = createUser({
  email: "pkg2-allowed@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
setStaffPermissions(allowed.id, {
  tabs: ["products", "settings", "clients", "access"],
  manageStaff: false,
});
createUser({
  email: "pkg2-full@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
const explicit = createUser({
  email: "pkg2-explicit@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
setStaffPermissions(explicit.id, { tabs: [...STAFF_FEATURE_IDS], manageStaff: false });
const productsOnly = createUser({
  email: "pkg2-products@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
setStaffPermissions(productsOnly.id, { tabs: ["products"], manageStaff: false });
const clientsOnly = createUser({
  email: "pkg2-clients@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
setStaffPermissions(clientsOnly.id, { tabs: ["clients"], manageStaff: false });
const settingsOnly = createUser({
  email: "pkg2-settings@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
setStaffPermissions(settingsOnly.id, { tabs: ["settings"], manageStaff: false });
const malformed = createUser({
  email: "pkg2-malformed@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
const legacyEmpty = createUser({
  email: "pkg2-legacy-empty@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
const blankPerms = createUser({
  email: "pkg2-blank@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
const db = new DatabaseSync(${JSON.stringify(databasePath)});
db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run("NOT_JSON{", malformed.id);
db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run("{}", legacyEmpty.id);
db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run("", blankPerms.id);
db.close();
const client = createUser({
  email: "pkg2-client@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
});
setGlobalState("settings", {
  ...DEFAULT_SETTINGS,
  ...getGlobalState("settings", DEFAULT_SETTINGS),
  storefrontHeroTitle: "PKG2-HERO-KEEP",
  showPrices: true,
  managerNotificationEmail: "pkg2-notify-secret@example.com",
  managerTelegramChatId: "999111222333",
  managerNotifyEmail: true,
  managerNotifyTelegram: true,
});
const nReg = createManagerNotification({
  type: "client_registration",
  title: "Новая регистрация",
  body: "VaultCo · ContactPII · +79990001122",
  sourceId: "seed-reg",
});
const nOrder = createManagerNotification({
  type: "new_order",
  title: "Новый заказ",
  body: "order-ok",
  sourceId: "seed-order",
});
const nUnknown = createManagerNotification({
  type: "mystery_type",
  title: "Hidden admin event",
  body: "unknown-secret",
  sourceId: "seed-unknown",
});
console.log("NOTIF_REG", nReg.notification.id);
console.log("NOTIF_ORDER", nOrder.notification.id);
console.log("NOTIF_UNKNOWN", nUnknown.notification.id);
saveClientAccessCredentials(
  client.id,
  { login: client.email, password: "VaultSecretPass!9", companyName: "VaultCo" },
  { email: "pkg2-admin@test.local" }
);
setGlobalState("clientLinks", {
  [client.id]: {
    personalPrices: { "1": 42 },
    matrixProductIds: ["1"],
    oneCId: "1C-SECRET-LINK",
  },
});
console.log("CLIENT_ID", client.id);
console.log("RESTRICTED_ID", restricted.id);
console.log("ALLOWED_ID", allowed.id);
`
  );
  const run = spawnSync(process.execPath, [seedPath], {
    cwd: serverDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DB_PATH: databasePath,
      JWT_SECRET: jwtSecret,
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      CLOVER_SERVER_BACKUP_DIR: backupDir,
      CLOVER_UPLOADS_DIR: uploadsDir,
    },
  });
  process.stdout.write(run.stdout || "");
  if (run.status !== 0) {
    process.stderr.write(run.stderr || "");
    throw new Error("seed failed");
  }
  return {
    clientId: (run.stdout.match(/CLIENT_ID (\S+)/) || [])[1],
    restrictedId: (run.stdout.match(/RESTRICTED_ID (\S+)/) || [])[1],
    allowedId: (run.stdout.match(/ALLOWED_ID (\S+)/) || [])[1],
    notifReg: (run.stdout.match(/NOTIF_REG (\S+)/) || [])[1],
    notifOrder: (run.stdout.match(/NOTIF_ORDER (\S+)/) || [])[1],
    notifUnknown: (run.stdout.match(/NOTIF_UNKNOWN (\S+)/) || [])[1],
  };
}

async function coverageCheck() {
  const policySource = readFileSync(path.join(serverDir, "src/staffPolicy.js"), "utf8");
  const STAFF_ROUTE_POLICIES = [];
  const policyRe =
    /\{\s*method:\s*"([A-Z]+)"\s*,\s*path:\s*"([^"]+)"\s*,\s*kind:\s*"(feature|admin|staff|custom|manageStaff|notify|migrate)"/g;
  let policyMatch;
  while ((policyMatch = policyRe.exec(policySource))) {
    STAFF_ROUTE_POLICIES.push({
      method: policyMatch[1],
      path: policyMatch[2],
      kind: policyMatch[3],
    });
  }
  const source = readFileSync(path.join(serverDir, "src/server.js"), "utf8");
  const routes = extractManagerRoutes(source);
  const policyKeys = new Set(
    STAFF_ROUTE_POLICIES.map((item) => `${item.method} ${item.path}`)
  );
  const managerRoutes = routes.filter((item) => item.role === "manager");
  const missing = managerRoutes.filter(
    (item) => !policyKeys.has(`${item.method} ${item.path}`)
  );
  note(
    "coverage.manager-routes",
    missing.length === 0 && managerRoutes.length >= 62,
    missing.length
      ? `unmapped ${missing.map((item) => `${item.method} ${item.path}`).join(", ")}`
      : `${managerRoutes.length} manager routes mapped`
  );
  note(
    "coverage.no-blanket-staff-kind",
    STAFF_ROUTE_POLICIES.every(
      (item) => item.kind !== "staff" && item.kind !== "custom"
    ) &&
      !policySource.includes('kind: "staff"') &&
      !policySource.includes('kind: "custom"'),
    `kinds=${[...new Set(STAFF_ROUTE_POLICIES.map((item) => item.kind))].join(",")}`
  );
  const backupAdmin = [
    ["GET", "/api/admin/backups"],
    ["POST", "/api/admin/backups"],
    ["POST", "/api/admin/backups/cleanup"],
    ["GET", "/api/admin/backups/:fileName/download"],
    ["POST", "/api/admin/backups/:fileName/restore"],
    ["POST", "/api/admin/reset"],
  ];
  for (const [method, routePath] of backupAdmin) {
    const found = routes.some(
      (item) => item.method === method && item.path === routePath && item.role === "admin"
    );
    note(
      `coverage.admin.${method}.${routePath}`,
      found,
      found ? "admin-gated" : "missing admin gate"
    );
  }
  note(
    "coverage.policy-uses-roles",
    source.includes("applyStaffRoutePolicy") && source.includes("evaluateManagerMigrate"),
    "server uses shared staff policy"
  );
  const notifySource = readFileSync(
    path.join(serverDir, "src/staffNotifications.js"),
    "utf8"
  );
  const pushSource = readFileSync(
    path.join(serverDir, "src/managerNotifications.js"),
    "utf8"
  );
  note(
    "coverage.notify-feature-map",
    notifySource.includes("requiredFeatureForNotification") &&
      notifySource.includes('client_registration: "clients"') &&
      !policySource.includes("staffHasAnyFeature") &&
      source.includes("projectManagerNotifications") &&
      source.includes("staffCanSeeNotification") &&
      pushSource.includes("staffCanSeeNotification") &&
      pushSource.includes("projectManagerNotifications"),
    "notifications use explicit feature mapping"
  );
}

async function main() {
  await coverageCheck();
  const ids = seed();
  const port = await freePort();
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
      CLOVER_SERVER_BACKUP_DIR: backupDir,
      CLOVER_UPLOADS_DIR: uploadsDir,
      ALLOW_ADMIN_FULL_RESET: "false",
      CLOVER_SKIP_NOTIFICATION_DELIVERY: "true",
      SMTP_HOST: "",
      TELEGRAM_BOT_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => {
    log += d.toString();
  });
  child.stderr.on("data", (d) => {
    log += d.toString();
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    try {
      await waitHealth(base);
    } catch (error) {
      console.error("SERVER_LOG", log.slice(-6000));
      throw error;
    }
    const tokens = {
      client: await login(base, "pkg2-client@test.local"),
      restricted: await login(base, "pkg2-restricted@test.local"),
      allowed: await login(base, "pkg2-allowed@test.local"),
      full: await login(base, "pkg2-full@test.local"),
      explicit: await login(base, "pkg2-explicit@test.local"),
      productsOnly: await login(base, "pkg2-products@test.local"),
      clientsOnly: await login(base, "pkg2-clients@test.local"),
      settingsOnly: await login(base, "pkg2-settings@test.local"),
      malformed: await login(base, "pkg2-malformed@test.local"),
      legacyEmpty: await login(base, "pkg2-legacy-empty@test.local"),
      blank: await login(base, "pkg2-blank@test.local"),
      admin: await login(base, "pkg2-admin@test.local"),
    };

    const productBody = {
      products: [
        {
          id: "pkg2-probe-product",
          name: "PKG2-RESTRICTED-SHOULD-FAIL",
          category: "Тест",
          active: true,
          saleUnits: ["piece"],
        },
      ],
    };

    const anon = await api(base, "/api/state/products", { method: "PUT", body: productBody });
    note("anon.products", anon.status === 401, `status=${anon.status}`);

    const clientProducts = await api(base, "/api/state/products", {
      method: "PUT",
      token: tokens.client,
      body: productBody,
    });
    note("client.products", clientProducts.status === 403, `status=${clientProducts.status}`);

    const heroBefore = settingsHeroFromDb();
    const backupsBefore = backupNames();
    const restrictedProducts = await api(base, "/api/state/products", {
      method: "PUT",
      token: tokens.restricted,
      body: productBody,
    });
    note(
      "restricted.products",
      restrictedProducts.status === 403 &&
        restrictedProducts.json?.code === "FEATURE_FORBIDDEN" &&
        !productNamesFromDb().includes("PKG2-RESTRICTED-SHOULD-FAIL"),
      `status=${restrictedProducts.status} code=${restrictedProducts.json?.code}`
    );

    const altProduct = await api(base, "/api/admin/products", {
      method: "POST",
      token: tokens.restricted,
      body: { name: "ALT-WRITE", category: "Тест", saleUnits: ["piece"] },
    });
    note("restricted.products.alt", altProduct.status === 403, `status=${altProduct.status}`);

    const restrictedSettings = await api(base, "/api/state/settings", {
      method: "PUT",
      token: tokens.restricted,
      body: { settings: { showPrices: false }, role: "admin" },
    });
    note("restricted.settings", restrictedSettings.status === 403, `status=${restrictedSettings.status}`);

    const restrictedAccess = await api(base, "/api/admin/client-access", {
      token: tokens.restricted,
    });
    note(
      "restricted.access",
      restrictedAccess.status === 403 &&
        !JSON.stringify(restrictedAccess.json || {}).includes("VaultSecretPass!9"),
      `status=${restrictedAccess.status}`
    );

    const bodyEscalation = await api(base, "/api/state/products", {
      method: "PUT",
      token: tokens.restricted,
      body: {
        role: "admin",
        permissions: { fullAccess: true },
        ...productBody,
      },
    });
    note("restricted.body-role", bodyEscalation.status === 403, `status=${bodyEscalation.status}`);

    const queryEscalation = await fetch(
      `${base}/api/admin/backups?role=admin&permissions=fullAccess`,
      { headers: { Authorization: `Bearer ${tokens.restricted}` } }
    );
    note("restricted.query-role", queryEscalation.status === 403, `status=${queryEscalation.status}`);

    const selfGrant = await api(base, `/api/admin/staff/${ids.restrictedId}/permissions`, {
      method: "PATCH",
      token: tokens.restricted,
      body: { fullAccess: true, tabs: ["products", "backup"] },
    });
    note("restricted.self-grant", selfGrant.status === 403, `status=${selfGrant.status}`);

    const migrateStorefront = await api(base, "/api/migrate/manager", {
      method: "POST",
      token: tokens.restricted,
      body: {
        settings: { storefrontHeroTitle: "PKG2-HIJACK" },
        role: "admin",
      },
    });
    note(
      "restricted.migrate.storefront",
      migrateStorefront.status === 403 && settingsHeroFromDb() === heroBefore,
      `status=${migrateStorefront.status} hero=${settingsHeroFromDb()}`
    );

    const migratePartial = await api(base, "/api/migrate/manager", {
      method: "POST",
      token: tokens.allowed,
      body: {
        products: [{ id: "pkg2-partial", name: "SHOULD-NOT-COMMIT", active: true }],
        settings: { storefrontHeroTitle: "PKG2-PARTIAL-HIJACK" },
      },
    });
    note(
      "allowed.migrate.partial-reject",
      migratePartial.status === 403 &&
        settingsHeroFromDb() === heroBefore &&
        !productNamesFromDb().includes("SHOULD-NOT-COMMIT"),
      `status=${migratePartial.status}`
    );

    const migrateOk = await api(base, "/api/migrate/manager", {
      method: "POST",
      token: tokens.allowed,
      body: { settings: { showPrices: false } },
    });
    const bootAllowed = await api(base, "/api/bootstrap", { token: tokens.allowed });
    note(
      "allowed.migrate.settings",
      migrateOk.status === 200 &&
        bootAllowed.json?.settings?.showPrices === false &&
        bootAllowed.json?.settings?.storefrontHeroTitle == null &&
        settingsHeroFromDb() === heroBefore,
      `status=${migrateOk.status} showPrices=${bootAllowed.json?.settings?.showPrices}`
    );

    const allowedProducts = await api(base, "/api/state/products", {
      method: "PUT",
      token: tokens.allowed,
      body: {
        products: [
          {
            id: "pkg2-allowed-product",
            name: "PKG2-ALLOWED-PRODUCT",
            category: "Тест",
            active: true,
            saleUnits: ["piece"],
          },
        ],
      },
    });
    note(
      "allowed.products",
      allowedProducts.status === 200 && productNamesFromDb().includes("PKG2-ALLOWED-PRODUCT"),
      `status=${allowedProducts.status}`
    );

    const allowedAccess = await api(base, "/api/admin/client-access", { token: tokens.allowed });
    note(
      "allowed.access",
      allowedAccess.status === 200 &&
        JSON.stringify(allowedAccess.json || {}).includes("VaultSecretPass!9"),
      `status=${allowedAccess.status}`
    );

    const malformedProducts = await api(base, "/api/state/products", {
      method: "PUT",
      token: tokens.malformed,
      body: productBody,
    });
    note(
      "malformed.products",
      malformedProducts.status === 403 && malformedProducts.json?.code === "PERMISSION_MALFORMED",
      `status=${malformedProducts.status} code=${malformedProducts.json?.code}`
    );

    const fullBackup = await api(base, "/api/admin/backups", { token: tokens.full });
    note("full.backup.list", fullBackup.status === 403, `status=${fullBackup.status}`);

    const restrictedBackupCreate = await api(base, "/api/admin/backups", {
      method: "POST",
      token: tokens.restricted,
      body: { label: "restricted" },
    });
    note(
      "restricted.backup.create",
      restrictedBackupCreate.status === 403 &&
        JSON.stringify(backupNames()) === JSON.stringify(backupsBefore),
      `status=${restrictedBackupCreate.status}`
    );

    const traversal = await api(base, "/api/admin/backups/..%2F..%2Fetc%2Fpasswd/download", {
      token: tokens.admin,
    });
    note(
      "admin.backup.traversal",
      traversal.status >= 400 && traversal.status < 500,
      `status=${traversal.status}`
    );

    const adminCreate = await api(base, "/api/admin/backups", {
      method: "POST",
      token: tokens.admin,
      body: { label: "pkg2-admin", reason: "verify" },
    });
    note("admin.backup.create", adminCreate.status === 201, `status=${adminCreate.status}`);
    const createdName = adminCreate.json?.backup?.fileName;
    const list = await api(base, "/api/admin/backups", { token: tokens.admin });
    note(
      "admin.backup.list.no-secrets",
      list.status === 200 &&
        !/password|vault|token|apiKey|secret/i.test(JSON.stringify(list.json)),
      `status=${list.status}`
    );
    note(
      "admin.backup.metadata",
      Boolean(createdName) &&
        (list.json?.backups || []).some((item) => item.fileName === createdName) &&
        !Object.keys(adminCreate.json?.backup || {}).some((key) =>
          /password|vault|token|secret/i.test(key)
        ),
      `fileName=${createdName}`
    );

    const restrictedDownload = await fetch(
      `${base}/api/admin/backups/${encodeURIComponent(createdName)}/download`,
      { headers: { Authorization: `Bearer ${tokens.restricted}` } }
    );
    note(
      "restricted.backup.download",
      restrictedDownload.status === 403,
      `status=${restrictedDownload.status}`
    );

    const adminDownload = await fetch(
      `${base}/api/admin/backups/${encodeURIComponent(createdName)}/download`,
      { headers: { Authorization: `Bearer ${tokens.admin}` } }
    );
    note("admin.backup.download", adminDownload.status === 200, `status=${adminDownload.status}`);
    if (adminDownload.ok) {
      const buf = Buffer.from(await adminDownload.arrayBuffer());
      const zipPath = path.join(temp, "admin-download.zip");
      writeFileSync(zipPath, buf);
      const AdmZip = require("adm-zip");
      const zip = new AdmZip(zipPath);
      const snap = zip.getEntry("snapshot.json");
      const text = snap ? snap.getData().toString("utf8") : "";
      note(
        "admin.backup.zip-has-snapshot",
        /password_hash|clientAccessVault/.test(text),
        "admin zip remains a full restore artifact"
      );
    }

    const restoreDenied = await api(
      base,
      `/api/admin/backups/${encodeURIComponent(createdName)}/restore`,
      { method: "POST", token: tokens.allowed, body: {} }
    );
    note("allowed.backup.restore", restoreDenied.status === 403, `status=${restoreDenied.status}`);

    const missingRestore = await api(base, "/api/admin/backups/missing-file.zip/restore", {
      method: "POST",
      token: tokens.admin,
      body: {},
    });
    note(
      "admin.backup.restore.missing",
      missingRestore.status === 404 && missingRestore.json?.code === "BACKUP_NOT_FOUND",
      `status=${missingRestore.status}`
    );

    const adminMigrate = await api(base, "/api/migrate/manager", {
      method: "POST",
      token: tokens.admin,
      body: { settings: { storefrontHeroTitle: "PKG2-ADMIN-HERO" } },
    });
    note(
      "admin.migrate.storefront",
      adminMigrate.status === 200 && settingsHeroFromDb() === "PKG2-ADMIN-HERO",
      `status=${adminMigrate.status} hero=${settingsHeroFromDb()}`
    );

    const restrictedOrders = await api(base, "/api/state/orders", {
      method: "PUT",
      token: tokens.restricted,
      body: { orders: [] },
    });
    note("restricted.orders.allowed", restrictedOrders.status === 200, `status=${restrictedOrders.status}`);

    const restrictedAudit = await api(base, "/api/admin/audit", { token: tokens.restricted });
    note("restricted.audit", restrictedAudit.status === 403, `status=${restrictedAudit.status}`);

    const restrictedNotify = await api(base, "/api/admin/notifications", {
      token: tokens.restricted,
    });
    note(
      "restricted.notifications",
      restrictedNotify.status === 200 &&
        notificationTypes(restrictedNotify.json).join(",") === "new_order" &&
        !payloadHasHiddenPii(restrictedNotify.json) &&
        !channelStatusLeaks(restrictedNotify.json?.status),
      `status=${restrictedNotify.status} types=${notificationTypes(restrictedNotify.json)}`
    );

    const clientsNotify = await api(base, "/api/admin/notifications", {
      token: tokens.clientsOnly,
    });
    note(
      "clients.notifications.registration",
      clientsNotify.status === 200 &&
        notificationTypes(clientsNotify.json).includes("client_registration") &&
        !notificationTypes(clientsNotify.json).includes("new_order") &&
        !notificationTypes(clientsNotify.json).includes("mystery_type") &&
        !channelStatusLeaks(clientsNotify.json?.status) &&
        JSON.stringify(clientsNotify.json || {}).includes("ContactPII"),
      `status=${clientsNotify.status} types=${notificationTypes(clientsNotify.json)}`
    );

    const explicitNotify = await api(base, "/api/admin/notifications", {
      token: tokens.explicit,
    });
    note(
      "explicit.notifications.features-only",
      explicitNotify.status === 200 &&
        notificationTypes(explicitNotify.json).includes("client_registration") &&
        notificationTypes(explicitNotify.json).includes("new_order") &&
        !notificationTypes(explicitNotify.json).includes("mystery_type") &&
        !channelStatusLeaks(explicitNotify.json?.status),
      `status=${explicitNotify.status} types=${notificationTypes(explicitNotify.json)}`
    );

    const adminNotify = await api(base, "/api/admin/notifications", {
      token: tokens.admin,
    });
    note(
      "admin.notifications.all",
      adminNotify.status === 200 &&
        notificationTypes(adminNotify.json).includes("client_registration") &&
        notificationTypes(adminNotify.json).includes("new_order") &&
        notificationTypes(adminNotify.json).includes("mystery_type") &&
        String(adminNotify.json?.status?.email?.recipient || "").includes(
          "pkg2-notify-secret@example.com"
        ),
      `status=${adminNotify.status} types=${notificationTypes(adminNotify.json)}`
    );

    const hiddenGet = await api(base, `/api/admin/notifications/${ids.notifReg}`, {
      token: tokens.restricted,
    });
    note(
      "restricted.notifications.direct-get-hidden",
      hiddenGet.status >= 400 &&
        !String(hiddenGet.text || "").includes("ContactPII") &&
        !String(hiddenGet.text || "").includes("+79990001122"),
      `status=${hiddenGet.status}`
    );

    const hiddenPatch = await api(
      base,
      `/api/admin/notifications/${ids.notifReg}/read`,
      { method: "PATCH", token: tokens.restricted, body: {} }
    );
    const hiddenAfter = notificationFromDb(ids.notifReg);
    note(
      "restricted.notifications.patch-hidden",
      hiddenPatch.status === 404 &&
        !String(hiddenPatch.text || "").includes("ContactPII") &&
        hiddenAfter &&
        !hiddenAfter.read_at,
      `status=${hiddenPatch.status} read_at=${hiddenAfter?.read_at || ""}`
    );

    const unknownPatch = await api(
      base,
      `/api/admin/notifications/${ids.notifUnknown}/read`,
      { method: "PATCH", token: tokens.restricted, body: {} }
    );
    note(
      "restricted.notifications.patch-unknown",
      unknownPatch.status === 404 && !notificationFromDb(ids.notifUnknown)?.read_at,
      `status=${unknownPatch.status}`
    );

    const readAll = await api(base, "/api/admin/notifications/read-all", {
      method: "POST",
      token: tokens.restricted,
      body: {},
    });
    note(
      "restricted.notifications.read-all-scoped",
      readAll.status === 200 &&
        readAll.json?.changed === 1 &&
        Boolean(notificationFromDb(ids.notifOrder)?.read_at) &&
        !notificationFromDb(ids.notifReg)?.read_at &&
        !notificationFromDb(ids.notifUnknown)?.read_at,
      `status=${readAll.status} changed=${readAll.json?.changed} order=${notificationFromDb(ids.notifOrder)?.read_at || ""} reg=${notificationFromDb(ids.notifReg)?.read_at || ""}`
    );

    const orderPatch = await api(
      base,
      `/api/admin/notifications/${ids.notifOrder}/read`,
      { method: "PATCH", token: tokens.restricted, body: {} }
    );
    note(
      "restricted.notifications.patch-order",
      orderPatch.status === 200 && Boolean(notificationFromDb(ids.notifOrder)?.read_at),
      `status=${orderPatch.status}`
    );

    const managerTest = await api(base, "/api/admin/notifications/test", {
      method: "POST",
      token: tokens.restricted,
      body: {},
    });
    note(
      "restricted.notifications.test-deny",
      managerTest.status === 403 && managerTest.json?.code === "ADMIN_REQUIRED",
      `status=${managerTest.status} code=${managerTest.json?.code}`
    );
    const adminTest = await api(base, "/api/admin/notifications/test", {
      method: "POST",
      token: tokens.admin,
      body: {},
    });
    const adminDelivery = JSON.stringify(adminTest.json?.result?.delivery || []);
    note(
      "admin.notifications.test-allow-dry-run",
      adminTest.status === 200 &&
        adminDelivery.includes("dry-run") &&
        !adminDelivery.includes("\"sent\":true"),
      `status=${adminTest.status} delivery=${adminDelivery}`
    );

    const restrictedStaff = await api(base, "/api/admin/staff", { token: tokens.restricted });
    note("restricted.staff-list", restrictedStaff.status === 403, `status=${restrictedStaff.status}`);

    const emptyProducts = await api(base, "/api/state/products", {
      method: "PUT",
      token: tokens.full,
      body: productBody,
    });
    note(
      "empty.permissions.products",
      emptyProducts.status === 403,
      `status=${emptyProducts.status}`
    );
    const emptyAccess = await api(base, "/api/admin/client-access", { token: tokens.full });
    note(
      "empty.permissions.access",
      emptyAccess.status === 403 &&
        !JSON.stringify(emptyAccess.json || {}).includes("VaultSecretPass!9"),
      `status=${emptyAccess.status}`
    );
    const emptyNotify = await api(base, "/api/admin/notifications", { token: tokens.full });
    note(
      "empty.permissions.notify",
      emptyNotify.status === 200 &&
        notificationTypes(emptyNotify.json).length === 0 &&
        !payloadHasHiddenPii(emptyNotify.json) &&
        !channelStatusLeaks(emptyNotify.json?.status),
      `status=${emptyNotify.status} types=${notificationTypes(emptyNotify.json)}`
    );
    const malformedNotify = await api(base, "/api/admin/notifications", {
      token: tokens.malformed,
    });
    note(
      "malformed.permissions.notify",
      malformedNotify.status === 403 &&
        malformedNotify.json?.code === "PERMISSION_MALFORMED",
      `status=${malformedNotify.status}`
    );
    note(
      "empty.permissions.stored-not-implicit-object",
      permissionsJsonFromDb("pkg2-full@test.local") === JSON.stringify({ tabs: [], manageStaff: false }),
      `json=${permissionsJsonFromDb("pkg2-full@test.local")}`
    );

    const legacyEmptyProducts = await api(base, "/api/state/products", {
      method: "PUT",
      token: tokens.legacyEmpty,
      body: productBody,
    });
    note(
      "legacy-empty.permissions.products",
      legacyEmptyProducts.status === 403 &&
        legacyEmptyProducts.json?.code === "FEATURE_FORBIDDEN" &&
        permissionsJsonFromDb("pkg2-legacy-empty@test.local") === "{}",
      `status=${legacyEmptyProducts.status} stored=${permissionsJsonFromDb("pkg2-legacy-empty@test.local")}`
    );
    const blankProducts = await api(base, "/api/state/products", {
      method: "PUT",
      token: tokens.blank,
      body: productBody,
    });
    note(
      "blank.permissions.products",
      blankProducts.status === 403,
      `status=${blankProducts.status}`
    );

    const unknownPerms = await api(base, `/api/admin/staff/${ids.restrictedId}/permissions`, {
      method: "PATCH",
      token: tokens.admin,
      body: { tabs: ["orders"], role: "admin", extra: true },
    });
    note(
      "permissions.unknown-fields",
      unknownPerms.status === 400,
      `status=${unknownPerms.status}`
    );
    const unknownTab = await api(base, `/api/admin/staff/${ids.restrictedId}/permissions`, {
      method: "PATCH",
      token: tokens.admin,
      body: { tabs: ["orders", "root"] },
    });
    note("permissions.unknown-tab", unknownTab.status === 400, `status=${unknownTab.status}`);
    const createWithPerms = await api(base, "/api/admin/managers", {
      method: "POST",
      token: tokens.admin,
      body: {
        email: "pkg2-injected@test.local",
        password: "InjectedPerms!1",
        permissions: { fullAccess: true, tabs: ["backup"] },
      },
    });
    note(
      "managers.create.rejects-permissions",
      createWithPerms.status === 400,
      `status=${createWithPerms.status}`
    );

    const nestedLinks = await api(base, "/api/migrate/manager", {
      method: "POST",
      token: tokens.allowed,
      body: {
        clientLinks: {
          [ids.clientId]: {
            role: "admin",
            permissions: { fullAccess: true },
            password: "nested-pass",
            passwordHash: "nested-hash",
          },
        },
      },
    });
    const dbLinkAfterNested = clientLinkFromDb(ids.clientId);
    const bootAfterNested = await api(base, "/api/bootstrap", { token: tokens.admin });
    const nestedLink = bootAfterNested.json?.clientLinks?.[ids.clientId] || {};
    note(
      "migrate.nested.clientLinks.auth",
      (nestedLinks.status === 403 || nestedLinks.status === 422) &&
        nestedLink.role == null &&
        nestedLink.password == null &&
        nestedLink.passwordHash == null &&
        dbLinkAfterNested.role == null &&
        dbLinkAfterNested.password == null &&
        dbLinkAfterNested.passwordHash == null &&
        settingsHeroFromDb() === "PKG2-ADMIN-HERO",
      `status=${nestedLinks.status} role=${nestedLink.role}`
    );

    const nestedUnknown = await api(base, "/api/migrate/manager", {
      method: "POST",
      token: tokens.allowed,
      body: {
        products: [
          {
            id: "pkg2-unknown-nested",
            name: "UNKNOWN-NESTED-SHOULD-FAIL",
            storefrontDetails: { description: "ok", unknownNested: true },
          },
        ],
      },
    });
    note(
      "migrate.nested.unknown-key",
      nestedUnknown.status === 422 &&
        !productNamesFromDb().includes("UNKNOWN-NESTED-SHOULD-FAIL"),
      `status=${nestedUnknown.status}`
    );

    const legitMigrate = await api(base, "/api/migrate/manager", {
      method: "POST",
      token: tokens.allowed,
      body: {
        products: [
          {
            id: "pkg2-legit-product",
            name: "PKG2-LEGIT-MIGRATE",
            category: "Тест",
            active: true,
            saleUnits: ["piece"],
            pricePiece: 12,
            showOnStorefront: false,
          },
        ],
      },
    });
    note(
      "migrate.products.legitimate",
      legitMigrate.status === 200 && productNamesFromDb().includes("PKG2-LEGIT-MIGRATE"),
      `status=${legitMigrate.status}`
    );

    const SECRET_KEY_RE =
      /^(password|passwordHash|password_hash|token|apiKey|api_key|secret|vault|clientAccessVault|staffAccessVault|privateKey|resetToken)$/i;
    function walkSecrets(node, trail, hits) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach((item, i) => walkSecrets(item, `${trail}[${i}]`, hits));
        return;
      }
      for (const [key, child] of Object.entries(node)) {
        const next = trail ? `${trail}.${key}` : key;
        if (SECRET_KEY_RE.test(key) && child) hits.push(next);
        if (typeof child === "string" && /VaultSecretPass!9|nested-pass|nested-hash/.test(child)) {
          hits.push(`${next}=value`);
        }
        walkSecrets(child, next, hits);
      }
    }
    function assertBootstrap(name, json, expect) {
      const hits = [];
      walkSecrets(json, "bootstrap", hits);
      const settings = json?.settings || {};
      const hasStorefront = Boolean(settings.storefrontHeroTitle);
      const clientCount = (json?.clients || []).length;
      const linkCount = Object.keys(json?.clientLinks || {}).length;
      const ok =
        hits.length === 0 &&
        hasStorefront === Boolean(expect.storefront) &&
        (expect.clients ? clientCount > 0 : clientCount === 0) &&
        (expect.links ? linkCount > 0 : linkCount === 0) &&
        (expect.orders ? (json?.orders || []).length >= 0 : (json?.orders || []).length === 0 || expect.orders === true);
      note(
        `bootstrap.${name}`,
        hits.length === 0 &&
          hasStorefront === Boolean(expect.storefront) &&
          (expect.clients ? clientCount > 0 : clientCount === 0) &&
          (expect.links ? linkCount > 0 : linkCount === 0) &&
          Boolean(expect.storefront) === hasStorefront,
        `secrets=${hits.join(",") || "none"} storefront=${hasStorefront} clients=${clientCount} links=${linkCount}`
      );
      return ok;
    }

    const bootClient = await api(base, "/api/bootstrap", { token: tokens.client });
    note(
      "bootstrap.client",
      bootClient.status === 200 &&
        (bootClient.json?.clients || []).length === 0 &&
        !bootClient.json?.managerNotifications &&
        !bootClient.json?.services?.managerNotifications &&
        !JSON.stringify(bootClient.json || {}).includes("VaultSecretPass!9"),
      `status=${bootClient.status} clients=${(bootClient.json?.clients || []).length}`
    );
    const bootRestricted = await api(base, "/api/bootstrap", { token: tokens.restricted });
    assertBootstrap("orders-only", bootRestricted.json, { storefront: false, clients: false, links: false, orders: true });
    note(
      "bootstrap.orders-only.orders",
      Array.isArray(bootRestricted.json?.orders),
      "orders key present"
    );
    note(
      "bootstrap.orders-only.notifications",
      (bootRestricted.json?.managerNotifications || []).every((item) => item.type === "new_order") &&
        !(bootRestricted.json?.managerNotifications || []).some(
          (item) => item.type === "client_registration"
        ) &&
        !payloadHasHiddenPii({
          notifications: bootRestricted.json?.managerNotifications,
          status: bootRestricted.json?.services?.managerNotifications,
        }) &&
        !channelStatusLeaks(bootRestricted.json?.services?.managerNotifications),
      `types=${(bootRestricted.json?.managerNotifications || []).map((item) => item.type)}`
    );
    const bootAnon = await api(base, "/api/bootstrap", {});
    note(
      "bootstrap.anonymous",
      bootAnon.status === 401 && !bootAnon.json?.managerNotifications,
      `status=${bootAnon.status}`
    );
    const bootProducts = await api(base, "/api/bootstrap", { token: tokens.productsOnly });
    assertBootstrap("products-only", bootProducts.json, { storefront: false, clients: false, links: false });
    note(
      "bootstrap.products-only.catalog",
      (bootProducts.json?.products || []).length > 0 &&
        (bootProducts.json?.clients || []).length === 0,
      `products=${(bootProducts.json?.products || []).length}`
    );
    const bootClients = await api(base, "/api/bootstrap", { token: tokens.clientsOnly });
    assertBootstrap("clients-only", bootClients.json, { storefront: false, clients: true, links: true });
    note(
      "bootstrap.clients-only.notifications",
      (bootClients.json?.managerNotifications || []).some(
        (item) => item.type === "client_registration"
      ) &&
        !(bootClients.json?.managerNotifications || []).some(
          (item) => item.type === "mystery_type"
        ) &&
        !channelStatusLeaks(bootClients.json?.services?.managerNotifications),
      `types=${(bootClients.json?.managerNotifications || []).map((item) => item.type)}`
    );
    const bootSettings = await api(base, "/api/bootstrap", { token: tokens.settingsOnly });
    assertBootstrap("settings-only", bootSettings.json, { storefront: false, clients: false, links: false });
    note(
      "bootstrap.settings-only.showPrices",
      bootSettings.json?.settings?.showPrices === false &&
        bootSettings.json?.settings?.storefrontHeroTitle == null,
      `showPrices=${bootSettings.json?.settings?.showPrices}`
    );
    const bootExplicit = await api(base, "/api/bootstrap", { token: tokens.explicit });
    assertBootstrap("explicit-full", bootExplicit.json, { storefront: false, clients: true, links: true });
    note(
      "bootstrap.explicit-full.notifications",
      (bootExplicit.json?.managerNotifications || []).some(
        (item) => item.type === "client_registration"
      ) &&
        (bootExplicit.json?.managerNotifications || []).some((item) => item.type === "new_order") &&
        !(bootExplicit.json?.managerNotifications || []).some(
          (item) => item.type === "mystery_type" || item.type === "test"
        ) &&
        !channelStatusLeaks(bootExplicit.json?.services?.managerNotifications),
      `types=${(bootExplicit.json?.managerNotifications || []).map((item) => item.type)}`
    );
    const bootAdmin = await api(base, "/api/bootstrap", { token: tokens.admin });
    assertBootstrap("admin", bootAdmin.json, { storefront: true, clients: true, links: true });
    note(
      "bootstrap.admin.notifications",
      (bootAdmin.json?.managerNotifications || []).some((item) => item.type === "mystery_type") &&
        String(bootAdmin.json?.services?.managerNotifications?.email?.recipient || "").includes(
          "pkg2-notify-secret@example.com"
        ),
      `types=${(bootAdmin.json?.managerNotifications || []).map((item) => item.type)}`
    );

    const outside = path.join(temp, "outside-secret.zip");
    writeFileSync(outside, "not-a-backup");
    const linkName = "clover-symlink-escape.zip";
    symlinkSync(outside, path.join(backupDir, linkName));
    const backupsBeforeSymlink = backupNames();
    const symlinkDownload = await api(base, `/api/admin/backups/${linkName}/download`, {
      token: tokens.admin,
    });
    const symlinkRestore = await api(base, `/api/admin/backups/${linkName}/restore`, {
      method: "POST",
      token: tokens.admin,
      body: {},
    });
    note(
      "backup.symlink.download",
      symlinkDownload.status >= 400 &&
        symlinkDownload.status < 500 &&
        !String(symlinkDownload.json?.error || "").includes(temp) &&
        !String(symlinkDownload.json?.error || "").includes("/opt/"),
      `status=${symlinkDownload.status}`
    );
    note(
      "backup.symlink.restore",
      symlinkRestore.status >= 400 &&
        symlinkRestore.status < 500 &&
        (symlinkRestore.json?.code === "BACKUP_SYMLINK" || symlinkRestore.status === 400) &&
        JSON.stringify(backupNames()) === JSON.stringify(backupsBeforeSymlink),
      `status=${symlinkRestore.status} code=${symlinkRestore.json?.code}`
    );
    const absDownload = await api(base, "/api/admin/backups/%2Fetc%2Fpasswd/download", {
      token: tokens.admin,
    });
    note(
      "backup.absolute-path",
      absDownload.status >= 400 &&
        absDownload.status < 500 &&
        !String(absDownload.json?.error || "").includes("/etc/passwd"),
      `status=${absDownload.status}`
    );

    const session = await api(base, "/api/bootstrap", { token: tokens.restricted });
    note(
      "restricted.session",
      session.status === 200 && session.json?.user?.role === "manager",
      `status=${session.status} role=${session.json?.user?.role}`
    );

    assertProdUntouched();
    note("prod.untouched", true, "production db/env fingerprints unchanged");
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 400));
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  console.log("TEMP", temp);
  console.log("verify-s2-pkg2-permissions-migrate-backups: ok", results.length);
}

main().catch((error) => {
  console.error(error);
  try {
    assertProdUntouched();
  } catch (prodError) {
    console.error(prodError);
  }
  process.exit(1);
});
