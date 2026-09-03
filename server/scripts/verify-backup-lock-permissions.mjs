/**
 * Verifies Linux daily-backup lock + secure modes for new archives.
 * Fixture-only: never writes/deletes outside fixture.root; never reads production secrets.
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

/** Hard gate: every artifact path must resolve inside fixture.root. */
function assertInsideFixture(fixtureRoot, p, label) {
  const resolved = path.resolve(p);
  const root = path.resolve(fixtureRoot);
  const rel = path.relative(root, resolved);
  assert.ok(
    rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)),
    `${label}: artifact outside fixture (FAIL, not deleted by test): ${resolved}`
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

function dirListingMeta(dirPath) {
  if (!existsSync(dirPath)) return null;
  const entries = readdirSync(dirPath)
    .sort()
    .map((name) => {
      const full = path.join(dirPath, name);
      const st = statSync(full);
      return {
        name,
        size: st.size,
        mtimeMs: st.mtimeMs,
        mode: st.mode & 0o777,
        isDir: st.isDirectory(),
      };
    });
  return entries;
}

function snapshotProdFingerprints() {
  const fp = {};
  for (const p of [PROD_BACKUPS, PROD_ENV, PROD_DATA]) {
    try {
      const st = statSync(p);
      // Use mtimeMs (number) — avoid Stats.mtimeNs without bigint:true.
      fp[p] = {
        mtimeMs: st.mtimeMs,
        size: st.isFile() ? st.size : -1,
        mode: st.mode & 0o777,
      };
    } catch {
      fp[p] = null;
    }
  }
  fp.prodBackupListing = dirListingMeta(PROD_BACKUPS);
  fp.prodDailyListing = dirListingMeta(path.join(PROD_BACKUPS, "daily"));
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
  // Distinct non-700 mode so regression can detect unwanted chmod.
  if (!isWin) chmodSync(uploads, 0o775);
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

  const dbPath = path.join(dataDir, "clover.sqlite");
  process.env.DB_PATH = dbPath;
  process.env.MANAGER_EMAIL = "backup-fixture@clover.local";
  process.env.MANAGER_PASSWORD = "FixtureOnlyPassword!123";
  process.env.CLOVER_SERVER_BACKUP_DIR = backups;
  process.env.CLOVER_UPLOADS_DIR = uploads;
  return {
    root,
    server,
    dataDir,
    uploads,
    backups,
    daily,
    dbPath,
    uploadsModeBefore: isWin ? null : modeOf(uploads),
  };
}

/** Tracked fixture DatabaseSync handles — must all close before rmSync(fixture.root). */
const trackedFixtureDbs = new Set();

function assertFixtureDbPath(fixture) {
  const dbPath = process.env.DB_PATH || "";
  assert.ok(dbPath, "DB_PATH must be set to fixture before importing db/backups");
  assert.equal(
    path.resolve(dbPath),
    path.resolve(fixture.dbPath),
    "DB_PATH must point at fixture db (refusing production/default db import)"
  );
  assert.ok(
    path.resolve(dbPath).startsWith(path.resolve(fixture.root) + path.sep),
    "DB_PATH must stay inside fixture.root"
  );
}

function trackFixtureDb(db) {
  if (db && typeof db.close === "function") trackedFixtureDbs.add(db);
}

function closeTrackedFixtureDbs() {
  const errors = [];
  for (const db of trackedFixtureDbs) {
    try {
      db.close();
    } catch (error) {
      errors.push(error);
    }
  }
  trackedFixtureDbs.clear();
  return errors;
}

async function initFixtureDb(fixture) {
  process.env.DB_PATH = fixture.dbPath;
  process.env.CLOVER_SERVER_BACKUP_DIR = fixture.backups;
  process.env.CLOVER_UPLOADS_DIR = fixture.uploads;
  assertFixtureDbPath(fixture);
  // Ephemeral schema init module (query-unique); close immediately after bootstrap.
  const dbMod = await import(`../src/db.js?backupSafety=${Date.now()}-${Math.random()}`);
  trackFixtureDb(dbMod.db);
  dbMod.db.close();
  trackedFixtureDbs.delete(dbMod.db);
}

/** Import backups.js only after fixture DB_PATH is set; track the shared ./db.js handle. */
async function importFixtureBackups(fixture, tag) {
  assertFixtureDbPath(fixture);
  const backupsMod = await import(
    `../src/backups.js?${tag}=${Date.now()}-${Math.random()}`
  );
  // backups.js imports canonical ../src/db.js (no query) — track that handle for cleanup.
  const dbMod = await import("../src/db.js");
  assertFixtureDbPath(fixture);
  trackFixtureDb(dbMod.db);
  return backupsMod;
}

function runDailyBackup(fixture) {
  const env = {
    ...process.env,
    CLOVER_ROOT: fixture.root,
    CLOVER_BACKUP_DIR: fixture.daily,
    CLOVER_BACKUP_KEEP_DAYS: "14",
    CLOVER_SERVER_BACKUP_DIR: fixture.backups,
    CLOVER_UPLOADS_DIR: fixture.uploads,
    DB_PATH: fixture.dbPath,
  };
  delete env.JWT_SECRET;
  return spawnSync("bash", [DAILY_BACKUP], {
    encoding: "utf8",
    env,
    cwd: REPO_ROOT,
  });
}

function countDailyTgz(fixture) {
  return readdirSync(fixture.daily).filter(
    (n) => n.startsWith("clover-data-env.") && n.endsWith(".tgz")
  );
}

function countZips(fixture) {
  return readdirSync(fixture.backups).filter((n) => n.endsWith(".zip"));
}

function fixtureZipPaths(fixture) {
  return countZips(fixture).map((n) => {
    const p = path.join(fixture.backups, n);
    assertInsideFixture(fixture.root, p, "zip");
    return p;
  });
}

function assertUploadsModeUnchanged(fixture) {
  if (isWin) {
    console.log("SKIP uploads mode unchanged on win32 (POSIX mode N/A)");
    return;
  }
  const after = modeOf(fixture.uploads);
  assert.equal(
    after,
    fixture.uploadsModeBefore,
    `uploads mode must stay ${fixture.uploadsModeBefore.toString(8)}, got ${after.toString(8)}`
  );
}

async function testLockContention(fixture, prodBefore) {
  mkdirSync(fixture.backups, { recursive: true });
  const lockPath = path.join(fixture.backups, LOCK_NAME);
  assertInsideFixture(fixture.root, lockPath, "lock");
  const beforeTgz = countDailyTgz(fixture);
  const beforeZip = countZips(fixture);
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
  assertUploadsModeUnchanged(fixture);
  assertProdUntouched(prodBefore);
}

async function testPermissiveUmask(fixture, prodBefore) {
  const umaskRun = spawnSync(
    "bash",
    ["-c", `umask 000; bash "$SCRIPT"`],
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
  assert.equal(umaskRun.status, 0, `backup failed: ${umaskRun.stderr || umaskRun.stdout}`);
  assert.ok(countDailyTgz(fixture).length >= 1, "expected daily tgz");
  const zips = fixtureZipPaths(fixture);
  assert.ok(zips.length >= 1, "expected at least one zip inside fixture");

  assertMode(fixture.backups, 0o700, "backups dir");
  assertMode(fixture.daily, 0o700, "daily dir");
  const lockPath = path.join(fixture.backups, LOCK_NAME);
  assertInsideFixture(fixture.root, lockPath, "lock");
  if (existsSync(lockPath)) assertMode(lockPath, 0o600, "lock file");

  for (const name of countDailyTgz(fixture)) {
    const p = path.join(fixture.daily, name);
    assertInsideFixture(fixture.root, p, "tgz");
    assertMode(p, 0o600, `tgz ${name}`);
    listTgz(p);
  }
  for (const p of zips) {
    assertMode(p, 0o600, `zip ${path.basename(p)}`);
    listZip(p);
  }

  process.env.DB_PATH = fixture.dbPath;
  process.env.CLOVER_SERVER_BACKUP_DIR = fixture.backups;
  process.env.CLOVER_UPLOADS_DIR = fixture.uploads;
  const beforeManual = countZips(fixture);
  const backupsMod = await importFixtureBackups(fixture, "perm");
  const manual = backupsMod.createServerBackup({
    label: "manual",
    reason: "fixture manual backup",
  });
  const auto = backupsMod.createServerBackup({
    label: "auto-start",
    reason: "Автоматическая полная копия fixture",
  });
  const manualPath = path.join(fixture.backups, manual.fileName);
  const autoPath = path.join(fixture.backups, auto.fileName);
  assert.ok(existsSync(manualPath), `manual zip must be in fixture: ${manual.fileName}`);
  assert.ok(existsSync(autoPath), `auto-start zip must be in fixture: ${auto.fileName}`);
  assertInsideFixture(fixture.root, manualPath, "manual zip");
  assertInsideFixture(fixture.root, autoPath, "auto-start zip");
  assert.notEqual(manual.fileName, auto.fileName, "manual and auto-start zip names must differ");
  assertMode(manualPath, 0o600, "manual zip");
  assertMode(autoPath, 0o600, "auto-start zip");
  listZip(manualPath);
  listZip(autoPath);
  assert.ok(
    countZips(fixture).includes(manual.fileName) && countZips(fixture).includes(auto.fileName),
    "manual/auto zip filenames must appear in fixture backups listing"
  );
  void beforeManual;
  assertUploadsModeUnchanged(fixture);
  assertProdUntouched(prodBefore);
}

async function testSuccessfulLaterRun(fixture, prodBefore) {
  const lockPath = path.join(fixture.backups, LOCK_NAME);
  if (existsSync(lockPath)) {
    const fd = openSync(lockPath, "r+");
    closeSync(fd);
  }
  const beforeNames = new Set(countDailyTgz(fixture));
  spawnSync("sleep", ["1"]);
  const run = runDailyBackup(fixture);
  assert.equal(run.status, 0, `later run failed: ${run.stderr || run.stdout}`);
  assert.ok(!/SKIP|already running/i.test(`${run.stdout}\n${run.stderr}`), "unexpected skip");
  const afterNames = countDailyTgz(fixture);
  const created = afterNames.filter((n) => !beforeNames.has(n));
  assert.equal(created.length, 1, `exactly one new tgz, got ${created.join(",")}`);
  assert.ok(fixtureZipPaths(fixture).length >= 1, "expected scheduled zip in fixture");

  const lockCheck = spawnSync(
    "bash",
    ["-c", `exec 9>"$LOCK"; flock -n 9; echo OK`],
    { encoding: "utf8", env: { ...process.env, LOCK: lockPath } }
  );
  assert.equal(lockCheck.status, 0, "lock still held after successful run");
  assert.match(lockCheck.stdout || "", /OK/);

  const tgzPath = path.join(fixture.daily, created[0]);
  assertInsideFixture(fixture.root, tgzPath, "later tgz");
  listTgz(tgzPath);
  assertUploadsModeUnchanged(fixture);
  assertProdUntouched(prodBefore);
}

async function testFailureSafety(fixture, prodBefore) {
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

  writeFileSync(
    path.join(fixture.server, ".env"),
    "JWT_SECRET=fixture-jwt-secret-at-least-32-characters-long\nPORT=4100\n"
  );
  spawnSync("sleep", ["1"]);
  const ok = runDailyBackup(fixture);
  assert.equal(ok.status, 0, `recovery run failed: ${ok.stderr || ok.stdout}`);
  assert.ok(countDailyTgz(fixture).length > beforeTgz.length, "recovery should create tgz");
  for (const name of countDailyTgz(fixture)) {
    assertInsideFixture(fixture.root, path.join(fixture.daily, name), "recovery tgz");
  }
  assertUploadsModeUnchanged(fixture);
  assertProdUntouched(prodBefore);
}

/** Portable backups.js checks for win32 (and also run on Linux as extra coverage). */
async function testPortableBackupsJs(fixture, prodBefore) {
  process.env.DB_PATH = fixture.dbPath;
  process.env.CLOVER_SERVER_BACKUP_DIR = fixture.backups;
  process.env.CLOVER_UPLOADS_DIR = fixture.uploads;
  const uploadsBefore = isWin ? null : modeOf(fixture.uploads);

  const backupsMod = await importFixtureBackups(fixture, "portable");
  assert.equal(
    path.resolve(backupsMod.backupDirectory),
    path.resolve(fixture.backups),
    "backupDirectory must use fixture override"
  );
  assert.equal(
    path.resolve(backupsMod.uploadsDirectory),
    path.resolve(fixture.uploads),
    "uploadsDirectory must use fixture override"
  );

  const result = backupsMod.createServerBackup({
    label: "manual",
    reason: "portable fixture backup",
  });
  const zipPath = path.join(fixture.backups, result.fileName);
  assert.ok(existsSync(zipPath), "zip must exist in fixture");
  assertInsideFixture(fixture.root, zipPath, "portable zip");
  listZip(zipPath);
  if (!isWin) {
    assertMode(fixture.backups, 0o700, "portable backups dir");
    assertMode(zipPath, 0o600, "portable zip mode");
    assert.equal(modeOf(fixture.uploads), uploadsBefore, "portable: uploads mode unchanged");
  } else {
    console.log("SKIP POSIX mode assertions on win32 (portable path/list checks PASS)");
  }
  assertUploadsModeUnchanged(fixture);
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
  assert.doesNotMatch(
    src,
    /chmod\s+700\s+"\$CLOVER_UPLOADS_DIR"/,
    "daily-backup.sh must not chmod uploads dir"
  );
}

async function cleanupFixtureRoot(fixture) {
  const cleanupErrors = [];

  for (const error of closeTrackedFixtureDbs()) {
    cleanupErrors.push(error);
  }

  try {
    rmSync(fixture.root, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (existsSync(fixture.root)) {
    cleanupErrors.push(
      new Error(`fixture root still exists after rmSync: ${fixture.root}`)
    );
  }

  return cleanupErrors;
}

async function main() {
  assert.ok(existsSync(DAILY_BACKUP), "daily-backup.sh missing");
  assert.notEqual(REPO_ROOT, "/opt/clover/clover-app", "refusing to run from production worktree");

  // Fingerprints before any db import; never import db/backups before fixture DB_PATH.
  const prodBefore = snapshotProdFingerprints();
  const fixture = buildFixture();
  let failed = null;
  try {
    await initFixtureDb(fixture);

    console.log("TEST P — portable backups.js isolation + uploads unchanged");
    await testPortableBackupsJs(fixture, prodBefore);

    if (isWin) {
      console.log("SKIP TEST A — lock contention (Linux-only bash/flock)");
      console.log("SKIP TEST B — permissive umask (Linux-only bash/tar/flock)");
      console.log("SKIP TEST C — successful later run (Linux-only)");
      console.log("SKIP TEST D — failure safety (Linux-only)");
      console.log("verify-backup-lock-permissions: PASS (win32 portable + SKIP Linux-only)");
    } else {
      assertFlockPresent();

      console.log("TEST A — lock contention");
      await testLockContention(fixture, prodBefore);

      console.log("TEST B — permissive umask + zip modes");
      await testPermissiveUmask(fixture, prodBefore);

      console.log("TEST C — successful later run");
      await testSuccessfulLaterRun(fixture, prodBefore);

      console.log("TEST D — failure safety");
      await testFailureSafety(fixture, prodBefore);

      assertScriptMentions([/umask\s+077/, /flock/, /\.daily-backup\.lock/], "source");
      assertProdUntouched(prodBefore);
      console.log("verify-backup-lock-permissions: PASS");
    }
  } catch (err) {
    failed = err;
  }

  // Only fixture.root may be deleted by this verifier (never reviewer leftovers / prod).
  const cleanupErrors = await cleanupFixtureRoot(fixture);
  if (cleanupErrors.length) {
    for (const error of cleanupErrors) {
      console.error("cleanup error:", error);
    }
    if (failed) {
      console.error("primary test error:", failed);
      throw new Error(
        `test failed; fixture cleanup also failed: ${cleanupErrors
          .map((e) => e.message || String(e))
          .join("; ")}`,
        { cause: failed }
      );
    }
    throw cleanupErrors.length === 1
      ? cleanupErrors[0]
      : new AggregateError(cleanupErrors, "fixture cleanup failed");
  }

  if (failed) throw failed;
}

main().catch((err) => {
  console.error("verify-backup-lock-permissions: FAIL");
  console.error(err);
  process.exit(1);
});
