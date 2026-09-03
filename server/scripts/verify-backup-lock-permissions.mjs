/**
 * Verifies Linux daily-backup lock + secure modes for new archives.
 * Fixture-only: never touches production /opt/clover/clover-app/server/{backups,data,.env}.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const DAILY_BACKUP = path.join(REPO_ROOT, "scripts/linux/daily-backup.sh");
const PROD_BACKUPS = "/opt/clover/clover-app/server/backups";
const PROD_ENV = "/opt/clover/clover-app/server/.env";
const PROD_DATA = "/opt/clover/clover-app/server/data";
const LOCK_NAME = ".daily-backup.lock";
const isWin = process.platform === "win32";

function modeOf(p) {
  return statSync(p).mode & 0o777;
}

function assertMode(p, expected, label) {
  if (isWin) {
    console.log(`SKIP mode check on win32: ${label}`);
    return;
  }
  const got = modeOf(p);
  assert.equal(
    got,
    expected,
    `${label}: expected mode ${expected.toString(8)}, got ${got.toString(8)} (${p})`
  );
}

function listTgz(filePath) {
  const r = spawnSync("tar", ["-tzf", filePath], { encoding: "utf8" });
  assert.equal(r.status, 0, `tar list failed: ${r.stderr || r.stdout}`);
  assert.ok((r.stdout || "").trim().length > 0, "tgz empty listing");
}

function listZip(filePath) {
  const require = createRequire(import.meta.url);
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(filePath);
  const names = zip.getEntries().map((e) => e.entryName);
  assert.ok(names.length > 0, "zip empty");
  return names;
}

function snapshotProdFingerprints() {
  const fp = {};
  for (const p of [PROD_BACKUPS, PROD_ENV, PROD_DATA]) {
    try {
      const st = statSync(p);
      fp[p] = { mtimeNs: st.mtimeNs, size: st.isFile() ? st.size : -1 };
    } catch {
      fp[p] = null;
    }
  }
  // shallow file count in prod backups daily if present
  try {
    fp.prodBackupNames = readdirSync(PROD_BACKUPS).sort().join("\n");
  } catch {
    fp.prodBackupNames = null;
  }
  return fp;
}

function assertProdUntouched(before) {
  const after = snapshotProdFingerprints();
  assert.deepEqual(after, before, "production backup/data/.env metadata changed");
}

function buildFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "clover-backup-safety-"));
  const server = path.join(root, "server");
  const dataDir = path.join(server, "data");
  const uploads = path.join(server, "uploads");
  const backups = path.join(server, "backups");
  const daily = path.join(backups, "daily");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(uploads, { recursive: true });
  mkdirSync(daily, { recursive: true });
  // minimal placeholder data file (tar needs data/ + .env)
  writeFileSync(path.join(dataDir, "README.fixture"), "fixture-data\n");
  writeFileSync(
    path.join(server, ".env"),
    [
      "JWT_SECRET=fixture-jwt-secret-at-least-32-characters-long",
      "PORT=4100",
      "HOST=127.0.0.1",
      "",
    ].join("\n")
  );

  // Minimal sqlite via db module into fixture path (not production).
  const dbPath = path.join(dataDir, "clover.sqlite");
  process.env.DB_PATH = dbPath;
  process.env.MANAGER_EMAIL = "backup-fixture@clover.local";
  process.env.MANAGER_PASSWORD = "FixtureOnlyPassword!123";
  process.env.CLOVER_SERVER_BACKUP_DIR = backups;
  process.env.CLOVER_UPLOADS_DIR = uploads;
  // Isolate module init paths for backups.js / db.js
  return { root, server, dataDir, uploads, backups, daily, dbPath };
}

async function initFixtureDb(fixture) {
  process.env.DB_PATH = fixture.dbPath;
  process.env.CLOVER_SERVER_BACKUP_DIR = fixture.backups;
  process.env.CLOVER_UPLOADS_DIR = fixture.uploads;
  const dbMod = await import(`../src/db.js?backupSafety=${Date.now()}-${Math.random()}`);
  dbMod.db.close();
}

function runDailyBackup(fixture, extraEnv = {}) {
  const env = {
    ...process.env,
    CLOVER_ROOT: fixture.root,
    CLOVER_BACKUP_DIR: fixture.daily,
    CLOVER_BACKUP_KEEP_DAYS: "14",
    CLOVER_SERVER_BACKUP_DIR: fixture.backups,
    CLOVER_UPLOADS_DIR: fixture.uploads,
    DB_PATH: fixture.dbPath,
    ...extraEnv,
  };
  // Strip secrets-adjacent prod paths from env noise
  delete env.JWT_SECRET;
  return spawnSync("bash", [DAILY_BACKUP], {
    encoding: "utf8",
    env,
    cwd: REPO_ROOT,
  });
}

function countDailyTgz(fixture) {
  return readdirSync(fixture.daily).filter((n) => n.startsWith("clover-data-env.") && n.endsWith(".tgz"));
}

function countZips(fixture) {
  return readdirSync(fixture.backups).filter((n) => n.endsWith(".zip"));
}

function worktreeBackupZips() {
  const dir = path.join(REPO_ROOT, "server/backups");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".zip"))
    .map((n) => path.join(dir, n));
}

const createdWorktreeZips = new Set();

function trackNewWorktreeZips(before) {
  const after = worktreeBackupZips();
  for (const p of after) {
    if (!before.includes(p)) createdWorktreeZips.add(p);
  }
}

function cleanupTrackedWorktreeZips() {
  for (const p of createdWorktreeZips) {
    try {
      rmSync(p, { force: true });
    } catch {
      /* ignore */
    }
  }
  createdWorktreeZips.clear();
}

function assertNoProdPath(p) {
  const resolved = path.resolve(p);
  assert.ok(!resolved.startsWith(PROD_BACKUPS), `touched prod backups: ${resolved}`);
  assert.ok(resolved !== PROD_ENV, "touched prod .env");
  assert.ok(!resolved.startsWith(PROD_DATA + path.sep) && resolved !== PROD_DATA, "touched prod data");
}

async function testLockContention(fixture, prodBefore) {
  mkdirSync(fixture.backups, { recursive: true });
  const lockPath = path.join(fixture.backups, LOCK_NAME);
  const beforeTgz = countDailyTgz(fixture);
  const beforeZip = countZips(fixture);
  // Parent holds exclusive flock; child daily-backup must controlled-skip.
  const locker = spawnSync(
    "bash",
    [
      "-c",
      `
set -euo pipefail
exec 9>"$LOCK"
chmod 600 "$LOCK" 2>/dev/null || true
if ! flock -n 9; then echo "test-harness failed to acquire lock"; exit 97; fi
set +e
bash "$SCRIPT"
status=$?
set -e
exit "$status"
`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        LOCK: lockPath,
        SCRIPT: DAILY_BACKUP,
        CLOVER_ROOT: fixture.root,
        CLOVER_BACKUP_DIR: fixture.daily,
        CLOVER_BACKUP_KEEP_DAYS: "14",
        CLOVER_SERVER_BACKUP_DIR: fixture.backups,
        CLOVER_UPLOADS_DIR: fixture.uploads,
        DB_PATH: fixture.dbPath,
      },
    }
  );

  const afterTgz = countDailyTgz(fixture);
  const afterZip = countZips(fixture);
  const out = `${locker.stdout || ""}\n${locker.stderr || ""}`;
  assert.match(
    out,
    /SKIP|already running|lock/i,
    `expected controlled skip, got status=${locker.status} out=${out}`
  );
  assert.equal(afterTgz.length, beforeTgz.length, "lock contention must not create daily tgz");
  assert.equal(afterZip.length, beforeZip.length, "lock contention must not create zip");
  assertProdUntouched(prodBefore);
}

async function testPermissiveUmask(fixture, prodBefore) {
  const beforeWt = worktreeBackupZips();
  const r = runDailyBackup(fixture, { ...process.env });
  // Force umask in subshell
  const umaskRun = spawnSync(
    "bash",
    [
      "-c",
      `umask 000; bash "$SCRIPT"`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SCRIPT: DAILY_BACKUP,
        CLOVER_ROOT: fixture.root,
        CLOVER_BACKUP_DIR: fixture.daily,
        CLOVER_BACKUP_KEEP_DAYS: "14",
        CLOVER_SERVER_BACKUP_DIR: fixture.backups,
        CLOVER_UPLOADS_DIR: fixture.uploads,
        DB_PATH: fixture.dbPath,
      },
    }
  );
  trackNewWorktreeZips(beforeWt);
  assert.equal(umaskRun.status, 0, `backup failed: ${umaskRun.stderr || umaskRun.stdout}`);
  assert.ok(countDailyTgz(fixture).length >= 1, "expected daily tgz");
  // Prefer fixture zips; if zip landed in worktree (pre-fix), track & check those modes too
  let zips = countZips(fixture).map((n) => path.join(fixture.backups, n));
  if (zips.length === 0) {
    zips = [...createdWorktreeZips];
  }
  assert.ok(zips.length >= 1, "expected at least one zip from scheduled backup");

  assertMode(fixture.backups, 0o700, "backups dir");
  assertMode(fixture.daily, 0o700, "daily dir");
  const lockPath = path.join(fixture.backups, LOCK_NAME);
  if (existsSync(lockPath)) assertMode(lockPath, 0o600, "lock file");

  for (const name of countDailyTgz(fixture)) {
    const p = path.join(fixture.daily, name);
    assertNoProdPath(p);
    assertMode(p, 0o600, `tgz ${name}`);
    listTgz(p);
  }
  for (const p of zips) {
    assertNoProdPath(p);
    assertMode(p, 0o600, `zip ${path.basename(p)}`);
    listZip(p);
  }

  // Direct backups.js manual + auto-start labels
  process.env.DB_PATH = fixture.dbPath;
  process.env.CLOVER_SERVER_BACKUP_DIR = fixture.backups;
  process.env.CLOVER_UPLOADS_DIR = fixture.uploads;
  const beforeManual = countZips(fixture);
  const backupsMod = await import(`../src/backups.js?perm=${Date.now()}-${Math.random()}`);
  const manual = backupsMod.createServerBackup({
    label: "manual",
    reason: "fixture manual backup",
  });
  const auto = backupsMod.createServerBackup({
    label: "auto-start",
    reason: "Автоматическая полная копия fixture",
  });
  backupsMod.db?.close?.();
  // db is separate module; close via reopen path not required
  const manualPath = path.join(fixture.backups, manual.fileName);
  const autoPath = path.join(fixture.backups, auto.fileName);
  // If env override unsupported, files may be in worktree backups
  const resolveCreated = (fileName, preferred) => {
    if (existsSync(preferred)) return preferred;
    const alt = path.join(REPO_ROOT, "server/backups", fileName);
    if (existsSync(alt)) {
      createdWorktreeZips.add(alt);
      return alt;
    }
    assert.fail(`backup zip missing: ${fileName}`);
  };
  const mp = resolveCreated(manual.fileName, manualPath);
  const ap = resolveCreated(auto.fileName, autoPath);
  assertMode(mp, 0o600, "manual zip");
  assertMode(ap, 0o600, "auto-start zip");
  listZip(mp);
  listZip(ap);
  assert.ok(countZips(fixture).length >= beforeManual.length || createdWorktreeZips.size > 0);
  assertProdUntouched(prodBefore);
  void r;
}

async function testSuccessfulLaterRun(fixture, prodBefore) {
  const lockPath = path.join(fixture.backups, LOCK_NAME);
  // Ensure lock not held: open and release
  if (existsSync(lockPath)) {
    const fd = openSync(lockPath, "r+");
    closeSync(fd);
  }
  const beforeNames = new Set(countDailyTgz(fixture));
  const beforeWt = worktreeBackupZips();
  // Avoid same-second stamp collision with prior TGZ name.
  spawnSync("sleep", ["1"]);
  const run = runDailyBackup(fixture);
  trackNewWorktreeZips(beforeWt);
  assert.equal(run.status, 0, `later run failed: ${run.stderr || run.stdout}`);
  assert.ok(!/SKIP|already running/i.test(`${run.stdout}\n${run.stderr}`), "unexpected skip");
  const afterNames = countDailyTgz(fixture);
  const created = afterNames.filter((n) => !beforeNames.has(n));
  assert.equal(created.length, 1, `exactly one new tgz, got ${created.join(",")}`);
  assert.ok(
    countZips(fixture).length >= 1 || createdWorktreeZips.size >= 1,
    "expected scheduled zip"
  );

  // lock not held: another flock -n must succeed
  const lockCheck = spawnSync(
    "bash",
    ["-c", `exec 9>"$LOCK"; flock -n 9; echo OK`],
    { encoding: "utf8", env: { ...process.env, LOCK: lockPath } }
  );
  assert.equal(lockCheck.status, 0, "lock still held after successful run");
  assert.match(lockCheck.stdout || "", /OK/);

  listTgz(path.join(fixture.daily, created[0]));
  assertProdUntouched(prodBefore);
}

async function testFailureSafety(fixture, prodBefore) {
  // Break tar inputs
  rmSync(path.join(fixture.server, ".env"), { force: true });
  const lockPath = path.join(fixture.backups, LOCK_NAME);
  const beforeTgz = countDailyTgz(fixture);
  const run = runDailyBackup(fixture);
  assert.notEqual(run.status, 0, "expected non-zero on backup failure");
  assert.equal(countDailyTgz(fixture).length, beforeTgz.length, "failed run must not add tgz");

  const lockCheck = spawnSync(
    "bash",
    ["-c", `exec 9>"$LOCK"; flock -n 9; echo OK`],
    { encoding: "utf8", env: { ...process.env, LOCK: lockPath } }
  );
  assert.equal(lockCheck.status, 0, "lock must release after failure");

  // Restore .env and confirm next run allowed
  writeFileSync(
    path.join(fixture.server, ".env"),
    "JWT_SECRET=fixture-jwt-secret-at-least-32-characters-long\nPORT=4100\n"
  );
  const beforeWt = worktreeBackupZips();
  spawnSync("sleep", ["1"]);
  const ok = runDailyBackup(fixture);
  trackNewWorktreeZips(beforeWt);
  assert.equal(ok.status, 0, `recovery run failed: ${ok.stderr || ok.stdout}`);
  assert.ok(countDailyTgz(fixture).length > beforeTgz.length, "recovery should create tgz");
  assertProdUntouched(prodBefore);
}

function assertFlockPresent() {
  const r = spawnSync("bash", ["-c", "command -v flock"], { encoding: "utf8" });
  assert.equal(r.status, 0, "flock must exist on Linux CI/host");
}

function assertScriptMentions(patterns, label) {
  const src = readFileSync(DAILY_BACKUP, "utf8");
  for (const re of patterns) {
    assert.match(src, re, `${label}: daily-backup.sh missing ${re}`);
  }
}

async function main() {
  assert.ok(existsSync(DAILY_BACKUP), "daily-backup.sh missing");
  assert.notEqual(REPO_ROOT, "/opt/clover/clover-app", "refusing to run from production worktree");
  if (!isWin) assertFlockPresent();

  const prodBefore = snapshotProdFingerprints();
  const fixture = buildFixture();
  let failed = null;
  try {
    await initFixtureDb(fixture);

    console.log("TEST A — lock contention");
    await testLockContention(fixture, prodBefore);

    console.log("TEST B — permissive umask + zip modes");
    await testPermissiveUmask(fixture, prodBefore);

    console.log("TEST C — successful later run");
    await testSuccessfulLaterRun(fixture, prodBefore);

    console.log("TEST D — failure safety");
    await testFailureSafety(fixture, prodBefore);

    // Supplementary source checks (not sole evidence)
    if (!isWin) {
      assertScriptMentions([/umask\s+077/, /flock/, /\.daily-backup\.lock/], "source");
    }

    assertProdUntouched(prodBefore);
    console.log("verify-backup-lock-permissions: PASS");
  } catch (err) {
    failed = err;
    throw err;
  } finally {
    cleanupTrackedWorktreeZips();
    try {
      rmSync(fixture.root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  if (failed) throw failed;
}

main().catch((err) => {
  console.error("verify-backup-lock-permissions: FAIL");
  console.error(err);
  process.exit(1);
});
