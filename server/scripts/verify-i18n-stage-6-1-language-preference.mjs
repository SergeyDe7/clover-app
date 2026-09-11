/**
 * Stage 6.1 — language preference persistence / profile sync.
 * Temp DB + isolated modules. No production mutation.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");

function rejectSensitivePath(candidate, workRoot) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
  const worktreeData = path.resolve(workRoot, "server/data");
  if (resolved === worktreeData || resolved.startsWith(`${worktreeData}${path.sep}`)) {
    throw new Error(`Refusing worktree DB path: ${resolved}`);
  }
}

function listenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function api(base, route, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function waitForHealth(base, attempts = 60) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = async () => {
      n += 1;
      try {
        const res = await fetch(`${base}/api/health`);
        if (res.ok) return resolve();
      } catch {
        // retry
      }
      if (n >= attempts) return reject(new Error("health timeout"));
      setTimeout(tick, 250);
    };
    tick();
  });
}

/**
 * Minimal env for Stage 6.1 temp HTTP server.
 * Must NOT inherit the full parent process environment.
 * @param {{ port: number|string, dbPath: string, jwtSecret: string, workRoot: string }} opts
 * @param {NodeJS.ProcessEnv} [parentEnv] — only for unit-testing leak rejection
 */
function buildStage61TempServerEnv(opts, parentEnv = process.env) {
  const backupDir = path.join(opts.workRoot, "backups");
  const uploadDir = path.join(opts.workRoot, "uploads");
  const baseUrl = `http://127.0.0.1:${opts.port}`;
  // Neutral runtime keys only — never spread parentEnv.
  const env = {
    PATH: parentEnv.PATH || "/usr/bin:/bin",
    HOME: opts.workRoot,
    NODE_ENV: "test",
    PORT: String(opts.port),
    HOST: "127.0.0.1",
    DB_PATH: opts.dbPath,
    JWT_SECRET: opts.jwtSecret,
    CLOVER_SERVER_BACKUP_DIR: backupDir,
    CLOVER_UPLOADS_DIR: uploadDir,
    CLOVER_SITEMAP_RUNTIME_WRITE: "0",
    APP_PUBLIC_URL: baseUrl,
    ALLOW_LAN_ORIGINS: "false",
    ALLOW_DEV_AUTH_LINKS: "false",
    MANAGER_EMAIL: "",
    MANAGER_PASSWORD: "",
    ONEC_WRITE_ENABLED: "0",
    ONEC_PROD_EXCHANGE_ENABLED: "0",
    ONEC_ALLOW_LOCAL_WITHOUT_KEY: "false",
    ONEC_API_KEY: "",
    ONEC_USERNAME: "",
    ONEC_PASSWORD: "",
    ONEC_BASE_URL: "",
    SMTP_HOST: "",
    SMTP_PORT: "",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    MAIL_FROM: "",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_MANAGER_CHAT_ID: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    NO_PROXY: "*",
  };
  if (parentEnv.TZ) env.TZ = parentEnv.TZ;
  if (parentEnv.LANG) env.LANG = parentEnv.LANG;
  if (parentEnv.LC_ALL) env.LC_ALL = parentEnv.LC_ALL;
  return env;
}

// --- Static architecture contract ---
{
  const prefSrc = readFileSync(path.join(root, "src/shared/i18n/languagePreference.js"), "utf8");
  assert.match(prefSrc, /clover-language-preference/);
  assert.match(prefSrc, /readLanguagePreference/);
  assert.match(prefSrc, /writeLanguagePreference/);
  const providerSrc = readFileSync(path.join(root, "src/shared/i18n/LocalizationProvider.jsx"), "utf8");
  assert.equal(/localStorage|sessionStorage/.test(providerSrc), false);
  const resolverSrc = readFileSync(path.join(root, "src/shared/i18n/languageResolver.js"), "utf8");
  assert.match(resolverSrc, /enabledLanguages/);
  console.log("STATIC_CONTRACT:PASS");
}

const {
  canonicalizeLocale,
  isSupportedPublicLocale,
  toPublicLocaleCode,
  DEFAULT_LOCALE,
  PUBLIC_LOCALE_CODES,
} = await import(pathToFileURL(path.join(root, "src/shared/i18n/languageRegistry.js")).href);
const { resolveLocale } = await import(
  pathToFileURL(path.join(root, "src/shared/i18n/languageResolver.js")).href
);
const {
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  readLanguagePreference,
  writeLanguagePreference,
  clearLanguagePreference,
  normalizeLanguagePreference,
} = await import(pathToFileURL(path.join(root, "src/shared/i18n/languagePreference.js")).href);

assert.equal(LANGUAGE_PREFERENCE_STORAGE_KEY, "clover-language-preference-v1");

// Fake localStorage for Node
function installMemoryStorage() {
  const map = new Map();
  const storage = {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(String(k), String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  };
  globalThis.localStorage = storage;
  return storage;
}

function installThrowingStorage() {
  globalThis.localStorage = {
    getItem() {
      throw new Error("storage blocked");
    },
    setItem() {
      throw new Error("storage blocked");
    },
    removeItem() {
      throw new Error("storage blocked");
    },
  };
}

{
  installMemoryStorage();
  clearLanguagePreference();
  assert.equal(readLanguagePreference(), null);
  assert.equal(writeLanguagePreference("en"), "en");
  assert.equal(readLanguagePreference(), "en");
  assert.equal(writeLanguagePreference("ZH"), "zh");
  assert.equal(readLanguagePreference(), "zh");
  assert.equal(canonicalizeLocale(readLanguagePreference()), "zh-CN");
  assert.equal(writeLanguagePreference("not-a-locale"), null);
  assert.equal(readLanguagePreference(), "zh");
  assert.equal(writeLanguagePreference(""), null);
  assert.equal(writeLanguagePreference(null), null);
  assert.equal(normalizeLanguagePreference("en-US"), null);
  assert.equal(normalizeLanguagePreference("en"), "en");
  assert.equal(isSupportedPublicLocale("en"), true);
  localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, "garbage");
  assert.equal(readLanguagePreference(), null);

  // Public persistence matrix (zh / zh-CN must both persist as public zh).
  const matrix = [
    ["ru", "ru", "ru"],
    ["en", "en", "en"],
    ["uz", "uz", "uz"],
    ["ky", "ky", "ky"],
    ["tg", "tg", "tg"],
    ["zh", "zh", "zh-CN"],
    ["zh-CN", "zh", "zh-CN"],
    ["ar", "ar", "ar"],
  ];
  for (const [input, publicCode, internal] of matrix) {
    clearLanguagePreference();
    assert.equal(normalizeLanguagePreference(input), publicCode, `public ${input}`);
    assert.equal(writeLanguagePreference(input), publicCode, `write ${input}`);
    assert.equal(readLanguagePreference(), publicCode, `read ${input}`);
    assert.equal(canonicalizeLocale(readLanguagePreference()), internal, `internal ${input}`);
  }
  for (const bad of ["invalid", "", null, undefined]) {
    clearLanguagePreference();
    writeLanguagePreference("en");
    assert.equal(writeLanguagePreference(bad), null);
    assert.equal(readLanguagePreference(), "en");
  }

  // Reinitialization: destroy memory map context and restore snapshot.
  clearLanguagePreference();
  writeLanguagePreference("zh-CN");
  const snap = localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
  assert.equal(snap, "zh");
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
  localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, snap);
  assert.equal(readLanguagePreference(), "zh");
  assert.equal(canonicalizeLocale(readLanguagePreference()), "zh-CN");
  console.log("BROWSER_PREFERENCE:PASS");
}

{
  installThrowingStorage();
  assert.equal(readLanguagePreference(), null);
  assert.equal(writeLanguagePreference("en"), null);
  assert.doesNotThrow(() => clearLanguagePreference());
  console.log("STORAGE_FAILURE:PASS");
}

{
  // Stage 1 compatibility: without enabledLanguages, foreign preferred stays RU.
  assert.equal(
    resolveLocale({ preferredLanguage: "en", storedLanguage: "zh" }),
    "ru"
  );
  // Stage 6.1: with enabledLanguages, preference is honored.
  assert.equal(
    resolveLocale({
      preferredLanguage: "en",
      storedLanguage: "zh",
      enabledLanguages: ["ru", "en", "zh"],
    }),
    "en"
  );
  assert.equal(
    resolveLocale({
      preferredLanguage: null,
      storedLanguage: "zh",
      enabledLanguages: ["ru", "zh"],
    }),
    "zh-CN"
  );
  assert.equal(
    resolveLocale({
      preferredLanguage: "en",
      storedLanguage: "zh",
      enabledLanguages: ["ru"],
    }),
    "ru"
  );
  console.log("RESOLVER_PREFERENCE:PASS");
}

// --- Child process env must not inherit production secrets ---
{
  const syntheticParent = {
    PATH: "/usr/bin:/bin",
    HOME: "/tmp/stage61-home",
    NODE_ENV: "production",
    DB_PATH: "/opt/clover/clover-app/server/data/clover.sqlite",
    JWT_SECRET: "production-jwt-secret-must-not-leak-into-child",
    ONEC_USERNAME: "prod-onec-user",
    ONEC_PASSWORD: "prod-onec-password",
    ONEC_API_KEY: "prod-onec-api-key",
    ONEC_BASE_URL: "https://onec.example.internal",
    ONEC_WRITE_ENABLED: "1",
    ONEC_PROD_EXCHANGE_ENABLED: "1",
    SMTP_HOST: "smtp.production.example",
    SMTP_USER: "mailer@production.example",
    SMTP_PASSWORD: "smtp-prod-secret",
    VAPID_PRIVATE_KEY: "vapid-prod-private",
    TELEGRAM_BOT_TOKEN: "telegram-prod-token",
    MANAGER_EMAIL: "manager@production.example",
    MANAGER_PASSWORD: "manager-prod-password",
    WEBHOOK_SECRET: "webhook-prod-secret",
  };
  const tempDb = "/tmp/stage61-isolated.sqlite";
  const tempJwt = `stage61-jwt-secret-${"a".repeat(40)}`;
  const tempWork = "/tmp/stage61-work";
  const childEnv = buildStage61TempServerEnv(
    { port: 54321, dbPath: tempDb, jwtSecret: tempJwt, workRoot: tempWork },
    syntheticParent
  );

  assert.equal(childEnv.DB_PATH, tempDb);
  assert.equal(childEnv.HOST, "127.0.0.1");
  assert.equal(childEnv.PORT, "54321");
  assert.equal(childEnv.JWT_SECRET, tempJwt);
  assert.equal(childEnv.ONEC_WRITE_ENABLED, "0");
  assert.equal(childEnv.ONEC_PROD_EXCHANGE_ENABLED, "0");
  assert.ok(childEnv.PATH, "PATH required for node binary resolution");

  const forbiddenKeys = [
    "ONEC_USERNAME",
    "ONEC_PASSWORD",
    "ONEC_API_KEY",
    "ONEC_BASE_URL",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "VAPID_PRIVATE_KEY",
    "TELEGRAM_BOT_TOKEN",
    "WEBHOOK_SECRET",
    "MANAGER_EMAIL",
    "MANAGER_PASSWORD",
  ];
  for (const key of forbiddenKeys) {
    const value = childEnv[key];
    assert.ok(
      value === undefined || value === "",
      `child env must not inherit production ${key}=${JSON.stringify(value)}`
    );
    if (Object.prototype.hasOwnProperty.call(syntheticParent, key)) {
      assert.notEqual(
        value,
        syntheticParent[key],
        `child env must not copy parent ${key}`
      );
    }
  }
  assert.notEqual(childEnv.DB_PATH, syntheticParent.DB_PATH);
  assert.notEqual(childEnv.JWT_SECRET, syntheticParent.JWT_SECRET);
  assert.equal(
    childEnv.WEBHOOK_SECRET,
    undefined,
    "WEBHOOK_SECRET must be absent from child env (not inherited)"
  );
  assert.equal(
    Object.keys(childEnv).some((k) => k === "WEBHOOK_SECRET"),
    false
  );
  // Prove we did not spread the synthetic parent object.
  assert.equal(
    Object.keys(childEnv).includes("WEBHOOK_SECRET") ||
      childEnv.ONEC_USERNAME === "prod-onec-user",
    false
  );
  console.log("CHILD_ENV_SAFETY:PASS");
}

// --- HTTP profile persistence ---
const workRoot = mkdtempSync(path.join(tmpdir(), "clover-stage61-"));
const dbPath = path.join(workRoot, "stage61.sqlite");
rejectSensitivePath(dbPath, root);
mkdirSync(path.dirname(dbPath), { recursive: true });
mkdirSync(path.join(workRoot, "backups"), { recursive: true });
mkdirSync(path.join(workRoot, "uploads"), { recursive: true });

const jwtSecret = `stage61-jwt-secret-${randomUUID()}-${randomUUID()}`;
const clientPassword = "Stage61-Client-Pass!";
const clientHash = bcrypt.hashSync(clientPassword, 4);
const clientId = randomUUID();
const clientEmail = `stage61-client-${randomUUID().slice(0, 8)}@example.com`;

const port = await listenPort();
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["src/server.js"], {
  cwd: path.join(root, "server"),
  env: buildStage61TempServerEnv({ port, dbPath, jwtSecret, workRoot }),
  stdio: ["ignore", "pipe", "pipe"],
});

let childErr = "";
child.stderr.on("data", (chunk) => {
  childErr += String(chunk);
});

try {
  await waitForHealth(base);

  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users(
       id, email, password_hash, role, created_at,
       email_verified, approval_status, password_changed_at, last_login_at,
       disabled_at, permissions_json
     ) VALUES (?, ?, ?, 'client', ?, 1, 'approved', '', '', '', ?)`
  ).run(clientId, clientEmail, clientHash, now, "{}");
  db.prepare(
    `INSERT INTO client_state(user_id, profile_json, addresses_json, favorites_json, updated_at)
     VALUES (?, ?, '[]', '[]', ?)`
  ).run(
    clientId,
    JSON.stringify({
      companyName: "Stage61 Co",
      contactName: "Test",
      phone: "+79990001122",
      email: clientEmail,
      contacts: [
        {
          id: "c1",
          name: "Test",
          label: "Основной",
          phone: "+79990001122",
          isPrimary: true,
        },
      ],
    }),
    now
  );
  db.close();

  const unauth = await api(base, "/api/state/profile", {
    method: "PUT",
    body: { profile: { locale: "en" } },
  });
  assert.equal(unauth.status, 401);

  const login = await api(base, "/api/auth/login", {
    method: "POST",
    body: { email: clientEmail, password: clientPassword },
  });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  const token = login.json.token;
  assert.ok(token);

  const boot1 = await api(base, "/api/bootstrap", { token });
  assert.equal(boot1.status, 200);
  assert.equal(boot1.json?.profile?.locale ?? null, null);

  const saveEn = await api(base, "/api/state/profile", {
    method: "PUT",
    token,
    body: {
      profile: {
        companyName: "Stage61 Co",
        contactName: "Test",
        phone: "+79990001122",
        email: clientEmail,
        locale: "en",
        role: "admin",
        permissions: { all: true },
      },
    },
  });
  assert.equal(saveEn.status, 200, JSON.stringify(saveEn.json));
  assert.equal(saveEn.json.profile.locale, "en");
  assert.equal(saveEn.json.profile.role, undefined);
  assert.equal(saveEn.json.profile.permissions, undefined);
  assert.equal(saveEn.json.profile.email, clientEmail);

  const boot2 = await api(base, "/api/bootstrap", { token });
  assert.equal(boot2.status, 200);
  assert.equal(boot2.json.profile.locale, "en");

  const bad = await api(base, "/api/state/profile", {
    method: "PUT",
    token,
    body: {
      profile: {
        companyName: "Stage61 Co",
        contactName: "Test",
        phone: "+79990001122",
        locale: "xx-invalid",
      },
    },
  });
  assert.equal(bad.status, 400, `invalid locale must be 400, got ${bad.status}`);
  assert.equal(
    (await api(base, "/api/bootstrap", { token })).json.profile.locale,
    "en",
    "invalid locale must not overwrite stored preference"
  );

  // Partial update without locale key must preserve locale + contacts.
  const partial = await api(base, "/api/state/profile", {
    method: "PUT",
    token,
    body: {
      profile: {
        companyName: "Stage61 Renamed",
      },
    },
  });
  assert.equal(partial.status, 200, JSON.stringify(partial.json));
  assert.equal(partial.json.profile.companyName, "Stage61 Renamed");
  assert.equal(partial.json.profile.locale, "en");
  assert.equal(partial.json.profile.phone, "+79990001122");
  assert.ok(Array.isArray(partial.json.profile.contacts));
  assert.equal(partial.json.profile.contacts[0]?.phone, "+79990001122");

  // Persist supported-but-disabled preference (enabled policy is UI/runtime, not storage).
  const saveZh = await api(base, "/api/state/profile", {
    method: "PUT",
    token,
    body: { profile: { locale: "zh-CN" } },
  });
  assert.equal(saveZh.status, 200, JSON.stringify(saveZh.json));
  assert.equal(saveZh.json.profile.locale, "zh");
  assert.equal(saveZh.json.profile.companyName, "Stage61 Renamed");

  const clearLoc = await api(base, "/api/state/profile", {
    method: "PUT",
    token,
    body: {
      profile: {
        companyName: "Stage61 Co",
        contactName: "Test",
        phone: "+79990001122",
        locale: "",
      },
    },
  });
  assert.equal(clearLoc.status, 200);
  assert.ok(!clearLoc.json.profile.locale);

  // Old-shape profile without locale: update one Stage 5 field, preserve the rest.
  const db2 = new DatabaseSync(dbPath);
  db2.prepare(`UPDATE client_state SET profile_json = ? WHERE user_id = ?`).run(
    JSON.stringify({
      companyName: "Legacy Co",
      contactName: "Old Contact",
      phone: "+79990000000",
      email: clientEmail,
      contacts: [
        {
          id: "legacy-1",
          name: "Old Contact",
          label: "Основной",
          phone: "+79990000000",
          isPrimary: true,
        },
      ],
    }),
    clientId
  );
  db2.close();
  const bootLegacy = await api(base, "/api/bootstrap", { token });
  assert.equal(bootLegacy.status, 200);
  assert.ok(bootLegacy.json.profile);
  assert.equal(bootLegacy.json.profile.locale ?? null, null);
  assert.equal(bootLegacy.json.profile.companyName, "Legacy Co");
  assert.equal(bootLegacy.json.profile.contacts?.[0]?.phone, "+79990000000");

  const legacyUpdate = await api(base, "/api/state/profile", {
    method: "PUT",
    token,
    body: { profile: { companyName: "Legacy Co Updated" } },
  });
  assert.equal(legacyUpdate.status, 200);
  assert.equal(legacyUpdate.json.profile.companyName, "Legacy Co Updated");
  assert.equal(legacyUpdate.json.profile.locale ?? null, null);
  assert.equal(legacyUpdate.json.profile.contacts?.[0]?.phone, "+79990000000");
  assert.equal(legacyUpdate.json.profile.contactName, "Old Contact");

  console.log("PROFILE_API:PASS");
} finally {
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 300));
  try {
    child.kill("SIGKILL");
  } catch {
    // ignore
  }
  rmSync(workRoot, { recursive: true, force: true });
}

// Sync helper contract (pure)
{
  const { syncBrowserPreferenceFromProfile } = await import(
    pathToFileURL(path.join(root, "src/shared/i18n/languagePreference.js")).href
  );
  installMemoryStorage();
  clearLanguagePreference();
  assert.equal(syncBrowserPreferenceFromProfile({ locale: "uz" }), "uz");
  assert.equal(readLanguagePreference(), "uz");
  assert.equal(syncBrowserPreferenceFromProfile({}), null);
  assert.equal(readLanguagePreference(), "uz");
  assert.equal(syncBrowserPreferenceFromProfile(null), null);
  assert.equal(readLanguagePreference(), "uz");

  // A: profile authoritative over browser
  writeLanguagePreference("en");
  assert.equal(syncBrowserPreferenceFromProfile({ locale: "ru" }), "ru");
  assert.equal(readLanguagePreference(), "ru");

  // B: absent profile locale does not wipe browser
  writeLanguagePreference("en");
  assert.equal(syncBrowserPreferenceFromProfile({ companyName: "X" }), null);
  assert.equal(readLanguagePreference(), "en");

  // C: corrupt profile locale does not overwrite valid browser preference
  writeLanguagePreference("en");
  assert.equal(syncBrowserPreferenceFromProfile({ locale: "INVALID" }), null);
  assert.equal(readLanguagePreference(), "en");

  // Cross-user: A en → logout keeps browser → B ru wins on bootstrap sync
  writeLanguagePreference("en");
  assert.equal(syncBrowserPreferenceFromProfile({ locale: "en" }), "en");
  // logout does not clear preference (call-path + helper contract)
  assert.equal(readLanguagePreference(), "en");
  assert.equal(syncBrowserPreferenceFromProfile({ locale: "ru" }), "ru");
  assert.equal(readLanguagePreference(), "ru");
  console.log("PROFILE_BROWSER_SYNC:PASS");
}

// Logout call-path: preference must not be cleared with auth cleanup.
{
  const appSrc = readFileSync(path.join(root, "src/App.jsx"), "utf8");
  const logoutIdx = appSrc.indexOf("const logout = () =>");
  assert.ok(logoutIdx >= 0, "logout function missing");
  const logoutBlock = appSrc.slice(logoutIdx, logoutIdx + 1200);
  assert.equal(/clearLanguagePreference\s*\(/.test(logoutBlock), false);
  assert.equal(/localStorage\.clear\s*\(/.test(logoutBlock), false);
  assert.match(logoutBlock, /clearApiToken\s*\(/);
  console.log("LOGOUT_CALL_PATH:PASS");
}

void PUBLIC_LOCALE_CODES;
void toPublicLocaleCode;
void DEFAULT_LOCALE;
void childErr;

console.log("I18N_STAGE_6_1_LANGUAGE_PREFERENCE_VERIFY_PASS");
