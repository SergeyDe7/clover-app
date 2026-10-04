import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const temp = mkdtempSync(path.join(tmpdir(), "clover-bootstrap-live-"));
const serverDir = path.resolve(import.meta.dirname, "..");
const databasePath = path.join(temp, "test.sqlite");
mkdirSync(path.join(temp, "backups"));
process.env.DB_PATH = databasePath;
process.env.JWT_SECRET = "bootstrap-live-test-secret-32-characters";
process.env.TEST_DB_ISOLATED = "YES";

const { createUser, updateUserRole, setGlobalState, db } = await import("../src/db.js");
const { hashPasswordSync } = await import("../src/passwordHash.js");
const { staffPermissionsPayload } = await import("../src/roles.js");
const password = "SyntheticBootstrapLivePass!1";
const passwordHash = hashPasswordSync(password, 4);
const admin = createUser({
  email: "bootstrap-admin@test.local", passwordHash, role: "manager",
  emailVerified: true, approvalStatus: "approved",
});
updateUserRole(admin.id, "admin");
const restricted = createUser({
  email: "bootstrap-restricted@test.local", passwordHash, role: "manager",
  emailVerified: true, approvalStatus: "approved",
});
db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run(
  JSON.stringify(staffPermissionsPayload({ tabs: ["orders"], manageStaff: false })),
  restricted.id
);
const client = createUser({
  email: "bootstrap-client@test.local", passwordHash, role: "client",
  emailVerified: true, approvalStatus: "approved",
});
setGlobalState("products", Array.from({ length: 200 }, (_, index) => ({
  id: `test-${index}`, name: `Synthetic product ${index}`, active: true,
  category: "Synthetic", price: 10,
})));
setGlobalState("catalogPricesVersion", "synthetic-v1");
for (const [id, userId] of [["admin-order", admin.id], ["client-order", client.id]]) {
  db.prepare(
    "INSERT INTO orders (id, user_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, userId, JSON.stringify({ id, userId, status: "Новый", items: [] }),
    "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
}

const port = await new Promise((resolve) => {
  const listener = createServer();
  listener.listen(0, "127.0.0.1", () => {
    const selectedPort = listener.address().port;
    listener.close(() => resolve(selectedPort));
  });
});
const base = `http://127.0.0.1:${port}`;
const runtime = spawn(process.execPath, [path.join(serverDir, "src/server.js")], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(port), HOST: "127.0.0.1", BACKUP_DIR: path.join(temp, "backups"),
    MANAGER_EMAIL: "", MANAGER_PASSWORD: "", SMTP_HOST: "", TELEGRAM_BOT_TOKEN: "",
    ONEC_WRITE_ENABLED: "0", ONEC_PROD_EXCHANGE_ENABLED: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let startupLog = "";
runtime.stdout.on("data", (chunk) => { startupLog += chunk.toString(); });
runtime.stderr.on("data", (chunk) => { startupLog += chunk.toString(); });

async function get(route, token, acceptEncoding = "gzip") {
  const response = await fetch(base + route, {
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "accept-encoding": acceptEncoding,
    },
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function login(email) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { ready = (await fetch(`${base}/api/health`)).ok; } catch { /* startup */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(ready, true, `isolated server did not start: ${startupLog.slice(-600)}`);
  assert.equal((await get("/api/bootstrap/live")).status, 401);

  for (const [email, role] of [
    [admin.email, "admin"], [restricted.email, "manager"], [client.email, "client"],
  ]) {
    const token = await login(email);
    const full = await get("/api/bootstrap", token);
    const live = await get("/api/bootstrap/live", token);
    assert.equal(full.status, 200);
    assert.equal(live.status, 200);
    assert.equal(full.headers.get("content-encoding"), "gzip");
    assert.equal(live.headers.get("content-encoding"), "gzip");
    assert.equal(live.body.user.role, role);
    assert.equal(Object.hasOwn(live.body, "products"), false);
    assert.equal(Object.hasOwn(live.body, "fullCatalogProducts"), false);
    assert.deepEqual(live.body.orders, full.body.orders);
    if (role === "client") {
      assert.deepEqual(live.body.orders.map((order) => order.id), ["client-order"]);
    }
    assert.equal(live.body.catalogPricesVersion, full.body.catalogPricesVersion);
    assert.ok(JSON.stringify(live.body).length < JSON.stringify(full.body).length);
    assert.ok(Number(full.headers.get("content-length")) < JSON.stringify(full.body).length);
    if (role === "manager") {
      assert.deepEqual(live.body.clientLinks, full.body.clientLinks);
      assert.deepEqual(live.body.clients, full.body.clients);
      assert.deepEqual(live.body.settings, full.body.settings);
    }
  }

  const identity = await get("/api/bootstrap", await login(admin.email), "identity");
  assert.equal(identity.status, 200);
  assert.equal(identity.headers.get("content-encoding"), null);

  const before = (await get("/api/bootstrap/live", await login(client.email))).body.catalogPricesVersion;
  await new Promise((resolve) => setTimeout(resolve, 20));
  setGlobalState("catalogPricesVersion", "synthetic-v2");
  const after = (await get("/api/bootstrap/live", await login(client.email))).body.catalogPricesVersion;
  assert.notEqual(after, before, "live response must signal catalog changes");
  console.log("verify-bootstrap-live: ok");
} finally {
  runtime.kill();
  if (runtime.exitCode == null) {
    await new Promise((resolve) => runtime.once("exit", resolve));
  }
  db.close();
  rmSync(temp, { recursive: true, force: true });
}
