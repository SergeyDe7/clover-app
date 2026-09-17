/**
 * S2-NEW-003/004/005 baseline proof on isolated SQLite.
 *
 * Exit 1 = at least one vulnerability present (expected on clean origin/main).
 * Exit 0 = all three attacks blocked (expected after Package 2 hardening).
 * Exit 2 = harness/setup failure.
 *
 * Never touches production DB/env. Temp artifacts under /opt/clover/.tmp.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const OPT_TMP = "/opt/clover/.tmp";
mkdirSync(OPT_TMP, { recursive: true });
const temp = mkdtempSync(path.join(OPT_TMP, "s2-pkg2-basefail-"));
const databasePath = path.join(temp, "clover.sqlite");
const uploadsDir = path.join(temp, "uploads");
const backupDir = path.join(temp, "backups");
mkdirSync(uploadsDir);
mkdirSync(backupDir);

const PROD_DB = "/opt/clover/clover-app/server/data/clover.sqlite";
const PROD_ENV = "/opt/clover/clover-app/server/.env";
const jwtSecret = "clover-s2-pkg2-base-fail-secret-32ch!!";
const password = "S2Pkg2BaseFail!1";
const require = createRequire(path.join(serverDir, "package.json"));

function fingerprint(p) {
  try {
    const st = statSync(p);
    return { mtimeMs: st.mtimeMs, size: st.isFile() ? st.size : -1 };
  } catch {
    return null;
  }
}

const prodBefore = {
  db: fingerprint(PROD_DB),
  env: fingerprint(PROD_ENV),
};

if (databasePath.startsWith("/opt/clover/clover-app/server/data")) {
  throw new Error("refusing production DB_PATH");
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
  return { status: res.status, json, text };
}

async function login(base, email) {
  const res = await api(base, "/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(`login failed ${email} ${res.status} ${JSON.stringify(res.json)}`);
  }
  return res.json.token;
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
const { createUser, setStaffPermissions, setGlobalState, getGlobalState } = await import(${JSON.stringify(
      pathToFileURL(path.join(serverDir, "src/db.js")).href
    )});
const { saveClientAccessCredentials } = await import(${JSON.stringify(
      pathToFileURL(path.join(serverDir, "src/clientAccessVault.js")).href
    )});
const { DEFAULT_SETTINGS, DEFAULT_PRODUCTS } = await import(${JSON.stringify(
      pathToFileURL(path.join(serverDir, "src/defaults.js")).href
    )});
const passwordHash = bcrypt.hashSync(${JSON.stringify(password)}, 4);
createUser({
  email: "s2-admin@test.local",
  passwordHash,
  role: "admin",
  emailVerified: true,
  approvalStatus: "approved",
});
const restricted = createUser({
  email: "s2-restricted@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
setStaffPermissions(restricted.id, { tabs: ["orders"], manageStaff: false });
createUser({
  email: "s2-allowed@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
const client = createUser({
  email: "s2-client@test.local",
  passwordHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
});
setGlobalState("settings", {
  ...DEFAULT_SETTINGS,
  ...getGlobalState("settings", DEFAULT_SETTINGS),
  storefrontHeroTitle: "BASELINE-HERO-KEEP",
  showPrices: true,
});
const products = Array.isArray(getGlobalState("products", DEFAULT_PRODUCTS))
  ? getGlobalState("products", DEFAULT_PRODUCTS)
  : DEFAULT_PRODUCTS;
setGlobalState("products", products);
saveClientAccessCredentials(
  client.id,
  { login: client.email, password: "VaultSecretPass!9", companyName: "VaultCo" },
  { email: "s2-admin@test.local" }
);
console.log("RESTRICTED_ID", restricted.id);
console.log("CLIENT_ID", client.id);
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
  const restrictedId = (run.stdout.match(/RESTRICTED_ID (\S+)/) || [])[1];
  const clientId = (run.stdout.match(/CLIENT_ID (\S+)/) || [])[1];
  return { restrictedId, clientId };
}

function assertProdUntouched() {
  const after = {
    db: fingerprint(PROD_DB),
    env: fingerprint(PROD_ENV),
  };
  if (JSON.stringify(after) !== JSON.stringify(prodBefore)) {
    throw new Error("production db/env fingerprint changed");
  }
}

const findings = [];

function finding(id, vulnerable, detail) {
  findings.push({ id, vulnerable, detail });
  console.log(`${vulnerable ? "VULN" : "BLOCKED"} ${id}: ${detail}`);
}

async function main() {
  const { clientId } = seed();
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
    await waitHealth(base);
    const anonProducts = await api(base, "/api/state/products", {
      method: "PUT",
      body: { products: [{ id: "p-anon", name: "nope" }] },
    });
    finding(
      "anon.products",
      anonProducts.status < 400,
      `anonymous PUT /api/state/products → ${anonProducts.status}`
    );

    const clientToken = await login(base, "s2-client@test.local");
    const clientProducts = await api(base, "/api/state/products", {
      method: "PUT",
      token: clientToken,
      body: { products: [{ id: "p-client", name: "nope" }] },
    });
    finding(
      "client.products",
      clientProducts.status < 400,
      `client PUT /api/state/products → ${clientProducts.status}`
    );

    const restrictedToken = await login(base, "s2-restricted@test.local");
    const markerName = `S2-PKG2-RESTRICTED-WRITE-${Date.now()}`;
    const productWrite = await api(base, "/api/state/products", {
      method: "PUT",
      token: restrictedToken,
      body: {
        products: [
          {
            id: "s2-pkg2-restricted-product",
            name: markerName,
            category: "Тест",
            active: true,
            saleUnits: ["piece"],
          },
        ],
      },
    });
    const productApplied =
      productWrite.status < 400 &&
      JSON.stringify(productWrite.json || {}).includes(markerName);
    finding(
      "S2-NEW-003",
      productWrite.status < 400,
      `restricted manager (tabs=orders) PUT /api/state/products → ${productWrite.status} applied=${productApplied}`
    );

    const settingsWrite = await api(base, "/api/state/settings", {
      method: "PUT",
      token: restrictedToken,
      body: { settings: { showPrices: false, role: "admin" } },
    });
    finding(
      "S2-NEW-003.settings",
      settingsWrite.status < 400,
      `restricted manager PUT /api/state/settings → ${settingsWrite.status}`
    );

    const accessRead = await api(base, "/api/admin/client-access", {
      token: restrictedToken,
    });
    const accessHasPassword = JSON.stringify(accessRead.json || "").includes(
      "VaultSecretPass!9"
    );
    finding(
      "S2-NEW-003.access",
      accessRead.status < 400 && accessHasPassword,
      `restricted manager GET /api/admin/client-access → ${accessRead.status} passwordLeak=${accessHasPassword}`
    );

    const escalate = await api(base, "/api/state/products", {
      method: "PUT",
      token: restrictedToken,
      body: {
        role: "admin",
        permissions: { fullAccess: true, tabs: ["products"] },
        products: [{ id: "s2-pkg2-escalation", name: "via-body-role", active: true }],
      },
    });
    finding(
      "S2-NEW-003.body-role",
      escalate.status < 400,
      `restricted manager body.role=admin PUT products → ${escalate.status}`
    );

    const migrate = await api(base, "/api/migrate/manager", {
      method: "POST",
      token: restrictedToken,
      body: {
        settings: {
          storefrontHeroTitle: "S2-PKG2-MIGRATE-STOREFRONT-HIJACK",
          storefrontContactEmail: "hijack@evil.test",
        },
        role: "admin",
        permissions: { fullAccess: true },
      },
    });
    const boot = await api(base, "/api/bootstrap", { token: restrictedToken });
    const hero = boot.json?.settings?.storefrontHeroTitle || "";
    const migrateApplied = hero === "S2-PKG2-MIGRATE-STOREFRONT-HIJACK";
    finding(
      "S2-NEW-004",
      migrate.status < 400 && migrateApplied,
      `POST /api/migrate/manager → ${migrate.status} storefrontHeroTitle=${JSON.stringify(hero)}`
    );

    const backupsList = await api(base, "/api/admin/backups", {
      token: restrictedToken,
    });
    const backupsCreate = await api(base, "/api/admin/backups", {
      method: "POST",
      token: restrictedToken,
      body: { label: "s2-pkg2-restricted", reason: "baseline" },
    });
    let secretInDownload = false;
    let downloadStatus = null;
    if (backupsCreate.status < 400 && backupsCreate.json?.backup?.fileName) {
      const fileName = backupsCreate.json.backup.fileName;
      const dl = await fetch(
        `${base}/api/admin/backups/${encodeURIComponent(fileName)}/download`,
        { headers: { Authorization: `Bearer ${restrictedToken}` } }
      );
      downloadStatus = dl.status;
      if (dl.ok) {
        const buf = Buffer.from(await dl.arrayBuffer());
        const outZip = path.join(temp, "restricted-download.zip");
        writeFileSync(outZip, buf);
        const AdmZip = require("adm-zip");
        const zip = new AdmZip(outZip);
        const snap = zip.getEntry("snapshot.json");
        const text = snap ? snap.getData().toString("utf8") : buf.toString("utf8");
        secretInDownload =
          /password_hash|"password"\s*:|staffAccessVault|clientAccessVault|VaultSecretPass/.test(
            text
          );
      }
    }
    finding(
      "S2-NEW-005",
      (backupsList.status < 400 || backupsCreate.status < 400) &&
        (secretInDownload || backupsCreate.status < 400),
      `restricted manager backups list=${backupsList.status} create=${backupsCreate.status} download=${downloadStatus} secrets=${secretInDownload}`
    );

    const restoreName = backupsCreate.json?.backup?.fileName;
    if (restoreName) {
      const restore = await api(
        base,
        `/api/admin/backups/${encodeURIComponent(restoreName)}/restore`,
        { method: "POST", token: restrictedToken, body: {} }
      );
      finding(
        "S2-NEW-005.restore",
        restore.status < 400,
        `restricted manager POST restore → ${restore.status}`
      );
    }
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    if (!findings.length) {
      process.stderr.write(log.slice(-2000));
    }
  }

  assertProdUntouched();
  const vulns = findings.filter((f) => f.vulnerable);
  console.log("TEMP", temp);
  console.log(
    "SUMMARY",
    JSON.stringify({
      vulns: vulns.map((f) => f.id),
      blocked: findings.filter((f) => !f.vulnerable).map((f) => f.id),
    })
  );

  const required = ["S2-NEW-003", "S2-NEW-004", "S2-NEW-005"];
  const confirmed = required.filter((id) =>
    findings.some((f) => f.id === id && f.vulnerable)
  );
  if (confirmed.length === required.length) {
    console.log("BASE_VULNERABILITY_CONFIRMED", confirmed.join(","));
    process.exit(1);
  }
  if (confirmed.length === 0 && findings.some((f) => !f.vulnerable)) {
    console.log("PROTECTED: package-2 attacks blocked");
    process.exit(0);
  }
  console.log("PARTIAL", confirmed.join(",") || "(none)");
  process.exit(1);
}

main().catch((error) => {
  console.error("HARNESS_FAIL", error);
  try {
    assertProdUntouched();
  } catch (prodError) {
    console.error(prodError);
  }
  process.exit(2);
});
