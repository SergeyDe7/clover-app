/**
 * Security Stage 3 Package 3 — retention, preview artifacts, backup download, health temp.
 *
 * Behavioral RED/GREEN against live contracts. Harness crashes are not RED.
 * Fixture-only: temp SQLite, temp directories, synthetic PII, fake curl.
 * No production env, DB, 1C, email, Telegram, MAX, Web Push, or real backups.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";

import {
  AUDIT_EMAIL_REDACTED,
  AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS,
  AUDIT_RETENTION_MAX_AGE_SOURCE_DEFAULT,
  assertRetentionDbPathAllowed,
  auditRetentionCutoffIso,
  isExplicitApply,
  parseAuditRetentionArgs,
  runAuditRetention,
} from "../src/auditRetention.js";
import {
  BACKUP_DOWNLOAD_CACHE_CONTROL,
  buildBackupDownloadAuditDetails,
  executeBackupDownload,
} from "../src/backups.js";
import {
  CLIENT_PREVIEW_FILE,
  PREVIEW_FILE_MODE,
  cleanupStalePreviewArtifacts,
  toClientPreviewItem,
  toClientPreviewItems,
  writePreviewArtifact,
} from "../src/previewArtifact.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const WORKTREE_DATA = path.resolve(repositoryRoot, "server/data");
const RETENTION_CLI = path.join(scriptDirectory, "run-audit-retention.mjs");
const HEALTH_SCRIPT = path.join(
  repositoryRoot,
  "releases/dc-prep-ac44dcf/scripts/health-check.sh"
);
const LINUX_HEALTH_SCRIPT = path.join(repositoryRoot, "scripts/linux/health-check.sh");

const MARKER_EMAIL = "pii.user@example.invalid";
const MARKER_PHONE = "+70005553535";
const MARKER_SECRET = "sec3pkg3secret";
const MARKER_PATH = "/opt/clover/clover-app/server/backups/clover-secret.zip";
const MARKER_BODY = "PK-BACKUP-BODY-MARKER";
const MARKER_RE = /pii\.user@example\.invalid|\+70005553535|sec3pkg3secret|clover-secret\.zip|PK-BACKUP-BODY-MARKER|\/opt\/clover/u;

function rejectUnsafePath(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error("Refusing production DB path");
  }
  if (resolved === WORKTREE_DATA || resolved.startsWith(`${WORKTREE_DATA}${path.sep}`)) {
    throw new Error("Refusing worktree DB path");
  }
}

function normalizeSourceNewlines(text) {
  return String(text).replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
}

function readRepoSource(relativePath) {
  const normalized = normalizeSourceNewlines(
    readFileSync(path.join(repositoryRoot, relativePath), "utf8")
  );
  assert.ok(normalized.length > 0);
  return normalized;
}

function assertNoMarker(value, label) {
  const blob = typeof value === "string" ? value : JSON.stringify(value);
  assert.equal(MARKER_RE.test(blob), false, `${label} leaked`);
}

function makeTempRoot(label) {
  const root = mkdtempSync(path.join(tmpdir(), `clover-sec3p3-${label}-`));
  rejectUnsafePath(root);
  return root;
}

function openAuditDb(filePath) {
  rejectUnsafePath(filePath);
  const database = new DatabaseSync(filePath);
  database.exec(`
    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_email TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    ) STRICT;
  `);
  return database;
}

function insertAudit(database, row) {
  database.prepare(`
    INSERT INTO audit_log(id, user_id, user_email, user_role, action, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.userId,
    row.userEmail,
    row.userRole,
    row.action,
    JSON.stringify(row.details || { count: 1 }),
    row.createdAt
  );
}

function allAudit(database) {
  return database.prepare(`
    SELECT id, user_id AS userId, user_email AS userEmail, user_role AS userRole,
           action, details_json AS detailsJson, created_at AS createdAt
    FROM audit_log
    ORDER BY id
  `).all();
}

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = String(value);
    },
    piped: null,
    pipeFrom(stream) {
      this.piped = stream;
    },
  };
}

function cacheControlOf(headers) {
  return String(headers["cache-control"] || "");
}

function assertPrivateNoStore(headers) {
  const value = cacheControlOf(headers).toLowerCase();
  assert.match(value, /no-store/u);
  assert.match(value, /private/u);
}

function fileDigest(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sqliteMaster(filePath) {
  const database = new DatabaseSync(filePath, { readOnly: true });
  try {
    return database.prepare(
      "SELECT type, name, sql FROM sqlite_master ORDER BY name"
    ).all();
  } finally {
    database.close();
  }
}

function previewNames(directory) {
  return readdirSync(directory).sort();
}

function localServerImports(serverSource) {
  return [...serverSource.matchAll(/from\s+"(\.\/[^"]+\.js)"/gu)].map((match) => match[1]);
}

function spawnRetentionCli({ dbPath, args = [], extraEnv = {} }) {
  const env = { ...process.env, ...extraEnv };
  if (dbPath === undefined) delete env.DB_PATH;
  else env.DB_PATH = dbPath;
  delete env.CLOVER_AUDIT_RETENTION_ALLOW_PRODUCTION;
  if (Object.prototype.hasOwnProperty.call(extraEnv, "CLOVER_AUDIT_RETENTION_ALLOW_PRODUCTION")) {
    env.CLOVER_AUDIT_RETENTION_ALLOW_PRODUCTION = extraEnv.CLOVER_AUDIT_RETENTION_ALLOW_PRODUCTION;
  }
  return spawnSync(process.execPath, [RETENTION_CLI, ...args], {
    cwd: path.join(repositoryRoot, "server"),
    env,
    encoding: "utf8",
  });
}

function resolveBash() {
  if (process.platform !== "win32") return "bash";
  const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
  if (existsSync(gitBash)) return gitBash;
  return "bash";
}

function trySymlink(target, linkPath) {
  try {
    symlinkSync(target, linkPath);
    return lstatSync(linkPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function tryDirSymlink(target, linkPath) {
  try {
    symlinkSync(target, linkPath, "dir");
    return existsSync(linkPath);
  } catch {
    try {
      symlinkSync(target, linkPath, "junction");
      return existsSync(linkPath);
    } catch {
      return false;
    }
  }
}

function statsFor(kind) {
  return {
    isSymbolicLink: () => kind === "symlink",
    isFile: () => kind === "file",
    isDirectory: () => kind === "dir" || kind === "junction",
  };
}

function injectedFs(filePath, { kind = "file", realpath = "", override = {} } = {}) {
  const resolved = path.resolve(filePath);
  const table = new Map();
  const { root } = path.parse(resolved);
  if (root) table.set(path.resolve(root), { kind: "dir", realpath: path.resolve(root) });
  let acc = root;
  for (const part of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
    acc = path.join(acc, part);
    table.set(acc, { kind: "dir", realpath: acc });
  }
  table.set(resolved, { kind, realpath: realpath || resolved });
  for (const [key, value] of Object.entries(override)) {
    table.set(path.resolve(key), value);
  }
  const lstatSyncFn = (candidate) => {
    const row = table.get(path.resolve(candidate));
    if (!row) {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    }
    return statsFor(row.kind);
  };
  const realpathSyncFn = (candidate) => {
    const row = table.get(path.resolve(candidate));
    if (!row) {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    }
    return path.resolve(row.realpath || candidate);
  };
  realpathSyncFn.native = realpathSyncFn;
  return { lstatSync: lstatSyncFn, realpathSync: realpathSyncFn };
}

test("SEC3-008: dry-run retention does not mutate rows", () => {
  const root = makeTempRoot("audit-dry");
  const dbPath = path.join(root, "audit.sqlite");
  const database = openAuditDb(dbPath);
  try {
    const now = new Date("2026-09-18T12:00:00.000Z");
    insertAudit(database, {
      id: "old-1",
      userId: "user-old",
      userEmail: MARKER_EMAIL,
      userRole: "admin",
      action: "backup.create",
      details: { count: 1 },
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    const before = allAudit(database);
    const dryMissing = runAuditRetention({ db: database, now });
    const dryFalse = runAuditRetention({ db: database, apply: false, now });
    const dryString = runAuditRetention({ db: database, apply: "true", now });
    const after = allAudit(database);
    assert.equal(dryMissing.dryRun, true);
    assert.equal(dryFalse.dryRun, true);
    assert.equal(dryString.dryRun, true);
    assert.equal(dryString.apply, false);
    assert.equal(isExplicitApply({}), false);
    assert.equal(isExplicitApply({ apply: true }), true);
    assert.deepEqual(after, before);
    assert.equal(after[0].userEmail, MARKER_EMAIL);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("SEC3-008: retention TTL is the exported 365-day library default", () => {
  const parsed = parseAuditRetentionArgs([]);
  assert.equal(AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS, 365);
  assert.equal(parsed.maxAgeDays, 365);
  assert.equal(parsed.maxAgeDaysSource, AUDIT_RETENTION_MAX_AGE_SOURCE_DEFAULT);
  assert.equal(parsed.apply, false);
  const now = new Date("2026-09-18T12:00:00.000Z");
  assert.equal(
    auditRetentionCutoffIso(now, AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS),
    "2025-09-18T12:00:00.000Z"
  );
  const cliParsed = parseAuditRetentionArgs(["--max-age-days", "90"]);
  assert.equal(cliParsed.maxAgeDays, 90);
  assert.equal(cliParsed.maxAgeDaysSource, "cli");
  assert.equal(isExplicitApply(parseAuditRetentionArgs(["--apply"])), true);
  assert.equal(isExplicitApply(parseAuditRetentionArgs(["--apply=true"])), false);
});

test("SEC3-008: retention CLI dry-run does not mutate SQLite", () => {
  const root = makeTempRoot("cli-dry");
  const dbPath = path.join(root, "audit.sqlite");
  const database = openAuditDb(dbPath);
  try {
    insertAudit(database, {
      id: "old-1",
      userId: "user-old",
      userEmail: MARKER_EMAIL,
      userRole: "admin",
      action: "backup.create",
      details: { count: 1 },
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  } finally {
    database.close();
  }
  const beforeDigest = fileDigest(dbPath);
  const beforeSchema = sqliteMaster(dbPath);
  const beforeStat = statSync(dbPath);
  try {
    const result = spawnRetentionCli({ dbPath });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(String(result.stdout).trim());
    assert.equal(payload.dryRun, true);
    assert.equal(payload.apply, false);
    assert.equal(payload.maxAgeDays, 365);
    assert.equal(payload.maxAgeDaysSource, AUDIT_RETENTION_MAX_AGE_SOURCE_DEFAULT);
    assert.equal(payload.anonymized, 0);
    assert.deepEqual(sqliteMaster(dbPath), beforeSchema);
    assert.equal(fileDigest(dbPath), beforeDigest);
    assert.equal(statSync(dbPath).mtimeMs, beforeStat.mtimeMs);
    const databaseAfter = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(
        databaseAfter.prepare("SELECT user_email AS email FROM audit_log WHERE id = ?").get("old-1").email,
        MARKER_EMAIL
      );
    } finally {
      databaseAfter.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SEC3-008: retention CLI apply on fixture anonymizes old email", () => {
  const root = makeTempRoot("cli-apply");
  const dbPath = path.join(root, "audit.sqlite");
  const database = openAuditDb(dbPath);
  try {
    insertAudit(database, {
      id: "old-1",
      userId: "user-old",
      userEmail: MARKER_EMAIL,
      userRole: "admin",
      action: "backup.create",
      details: { count: 1 },
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    insertAudit(database, {
      id: "fresh-1",
      userId: "user-fresh",
      userEmail: "fresh.user@example.invalid",
      userRole: "manager",
      action: "orders.save",
      details: { count: 2 },
      createdAt: new Date().toISOString(),
    });
  } finally {
    database.close();
  }
  try {
    const denied = spawnRetentionCli({ dbPath, args: ["--apply=true"] });
    assert.equal(denied.status, 0, denied.stderr || denied.stdout);
    const deniedPayload = JSON.parse(String(denied.stdout).trim());
    assert.equal(deniedPayload.apply, false);
    const applied = spawnRetentionCli({ dbPath, args: ["--apply"] });
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const payload = JSON.parse(String(applied.stdout).trim());
    assert.equal(payload.apply, true);
    assert.ok(payload.anonymized >= 1);
    const databaseAfter = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const oldRow = databaseAfter.prepare("SELECT user_email AS email FROM audit_log WHERE id = ?").get("old-1");
      const freshRow = databaseAfter.prepare("SELECT user_email AS email FROM audit_log WHERE id = ?").get("fresh-1");
      assert.equal(oldRow.email, AUDIT_EMAIL_REDACTED);
      assert.equal(freshRow.email, "fresh.user@example.invalid");
    } finally {
      databaseAfter.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SEC3-008: retention CLI denies production-looking DB path before open", () => {
  const productionPath = path.join(PRODUCTION_DATA, "clover.sqlite");
  assert.throws(
    () => assertRetentionDbPathAllowed(productionPath, { repositoryRoot }),
    (error) => error?.code === "AUDIT_RETENTION_DB_PATH_DENIED"
  );
  assert.throws(
    () => assertRetentionDbPathAllowed(path.join(WORKTREE_DATA, "clover.sqlite"), { repositoryRoot }),
    (error) => error?.code === "AUDIT_RETENTION_DB_PATH_DENIED"
  );
  const existedBefore = existsSync(productionPath);
  const result = spawnRetentionCli({ dbPath: "/opt/clover/clover-app/server/data/clover.sqlite" });
  assert.equal(result.status, 2);
  assert.match(String(result.stderr), /Refusing production DB_PATH/u);
  assert.equal(existsSync(productionPath), existedBefore);
  const cliSource = readRepoSource("server/scripts/run-audit-retention.mjs");
  const dbImportIndex = cliSource.search(/from\s+"\.\.\/src\/db\.js"/u);
  const denyIndex = cliSource.indexOf("assertRetentionDbPathAllowed");
  assert.equal(dbImportIndex, -1);
  assert.ok(denyIndex >= 0);
  assert.match(cliSource, /DatabaseSync\(canonicalPath/u);
  assert.ok(denyIndex < cliSource.indexOf("new DatabaseSync"));
});

test("SEC3-008: retention path deny stops file and parent symlinks before open", () => {
  const worktreeDb = path.join(WORKTREE_DATA, "clover.sqlite");
  const productionDb = path.join(PRODUCTION_DATA, "clover.sqlite");
  const root = makeTempRoot("ret-symlink");
  const aliasFile = path.join(root, "alias.sqlite");
  const aliasDir = path.join(root, "alias-dir");
  const nestedDb = path.join(aliasDir, "audit.sqlite");
  const canonFile = path.join(root, "canonical.sqlite");
  const visibleFile = path.join(root, "visible.sqlite");

  assert.throws(
    () => assertRetentionDbPathAllowed(aliasFile, {
      repositoryRoot,
      fs: injectedFs(aliasFile, { kind: "symlink", realpath: worktreeDb }),
    }),
    (error) => error?.code === "AUDIT_RETENTION_DB_PATH_DENIED"
  );
  assert.throws(
    () => assertRetentionDbPathAllowed(aliasFile, {
      repositoryRoot,
      fs: injectedFs(aliasFile, { kind: "symlink", realpath: productionDb }),
    }),
    (error) => error?.code === "AUDIT_RETENTION_DB_PATH_DENIED"
  );
  assert.throws(
    () => assertRetentionDbPathAllowed(nestedDb, {
      repositoryRoot,
      fs: injectedFs(nestedDb, {
        kind: "file",
        realpath: worktreeDb,
        override: {
          [aliasDir]: { kind: "symlink", realpath: WORKTREE_DATA },
        },
      }),
    }),
    (error) => error?.code === "AUDIT_RETENTION_DB_PATH_DENIED"
  );
  const junctionFs = injectedFs(nestedDb, {
    kind: "file",
    override: {
      [aliasDir]: { kind: "junction", realpath: PRODUCTION_DATA },
    },
  });
  assert.throws(
    () => assertRetentionDbPathAllowed(nestedDb, { repositoryRoot, fs: junctionFs }),
    (error) => error?.code === "AUDIT_RETENTION_DB_PATH_DENIED"
  );

  const opened = assertRetentionDbPathAllowed(visibleFile, {
    repositoryRoot,
    fs: injectedFs(visibleFile, {
      kind: "file",
      realpath: canonFile,
      override: {
        [canonFile]: { kind: "file", realpath: canonFile },
      },
    }),
  });
  assert.equal(opened, path.resolve(canonFile));

  const secret = path.join(root, "secret.sqlite");
  const database = openAuditDb(secret);
  insertAudit(database, {
    id: "old-1",
    userId: "user-old",
    userEmail: MARKER_EMAIL,
    userRole: "admin",
    action: "backup.create",
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  database.close();
  const before = fileDigest(secret);
  const link = path.join(root, "link.sqlite");
  const linked = trySymlink(secret, link);
  try {
    if (linked) {
      assert.throws(
        () => assertRetentionDbPathAllowed(link, { repositoryRoot }),
        (error) => error?.code === "AUDIT_RETENTION_DB_PATH_DENIED"
      );
      const cli = spawnRetentionCli({ dbPath: link });
      assert.equal(cli.status, 2);
      assert.equal(fileDigest(secret), before);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SEC3-008: apply requires boolean true and anonymizes only old PII", () => {
  const root = makeTempRoot("audit-apply");
  const dbPath = path.join(root, "audit.sqlite");
  const database = openAuditDb(dbPath);
  try {
    const now = new Date("2026-09-18T12:00:00.000Z");
    insertAudit(database, {
      id: "old-1",
      userId: "user-old",
      userEmail: MARKER_EMAIL,
      userRole: "admin",
      action: "backup.create",
      details: { count: 7, note: "server-owned" },
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    insertAudit(database, {
      id: "fresh-1",
      userId: "user-fresh",
      userEmail: "fresh.user@example.invalid",
      userRole: "manager",
      action: "orders.save",
      details: { count: 2 },
      createdAt: "2026-09-18T11:00:00.000Z",
    });
    const result = runAuditRetention({
      db: database,
      apply: true,
      maxAgeDays: AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS,
      now,
    });
    assert.equal(result.dryRun, false);
    assert.equal(result.apply, true);
    assert.ok(result.anonymized >= 1);
    const rows = allAudit(database);
    const oldRow = rows.find((row) => row.id === "old-1");
    const freshRow = rows.find((row) => row.id === "fresh-1");
    assert.equal(oldRow.userEmail, AUDIT_EMAIL_REDACTED);
    assert.equal(oldRow.userId, "user-old");
    assert.equal(oldRow.userRole, "admin");
    assert.equal(oldRow.action, "backup.create");
    assert.equal(oldRow.createdAt, "2024-01-01T00:00:00.000Z");
    assert.equal(oldRow.detailsJson, JSON.stringify({ count: 7, note: "server-owned" }));
    assert.equal(freshRow.userEmail, "fresh.user@example.invalid");
    assert.equal(freshRow.action, "orders.save");
    assert.equal(rows.length, 2);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("SEC3-008: API startup import path does not run retention or preview cleanup", () => {
  const serverSource = readRepoSource("server/src/server.js");
  assert.doesNotMatch(serverSource, /runAuditRetention\s*\(/u);
  assert.doesNotMatch(serverSource, /cleanupStalePreviewArtifacts\s*\(/u);
  assert.doesNotMatch(serverSource, /from\s+"\.\/auditRetention\.js"/u);
  assert.doesNotMatch(serverSource, /AUDIT_EMAIL_REDACTED/u);
  const previewImport = serverSource.match(
    /import\s*\{([^}]+)\}\s*from\s*"\.\/previewArtifact\.js"/u
  );
  assert.ok(previewImport);
  assert.doesNotMatch(previewImport[1], /cleanupStalePreviewArtifacts/u);
  assert.doesNotMatch(previewImport[1], /runAuditRetention/u);

  const imports = localServerImports(serverSource);
  assert.ok(imports.includes("./previewArtifact.js"));
  assert.equal(imports.includes("./auditRetention.js"), false);
  for (const spec of imports) {
    const source = readRepoSource(`server/src/${spec.slice(2)}`);
    assert.doesNotMatch(source, /runAuditRetention\s*\(/u);
    if (spec !== "./previewArtifact.js") {
      assert.doesNotMatch(source, /cleanupStalePreviewArtifacts\s*\(/u);
    }
  }
  const previewSource = readRepoSource("server/src/previewArtifact.js");
  assert.equal(
    previewSource.split("cleanupStalePreviewArtifacts").length - 1,
    1
  );
  const cliSource = readRepoSource("server/scripts/run-audit-retention.mjs");
  assert.doesNotMatch(cliSource, /from\s+"\.\.\/src\/db\.js"/u);
  assert.doesNotMatch(cliSource, /from\s+"\.\/db\.js"/u);
});

test("SEC3-008: client preview drops contact fields and keeps matching fields", () => {
  const preview = toClientPreviewItem({
    id: "onec-1",
    code: "C-1",
    name: "ACME",
    inn: "7700000000",
    email: MARKER_EMAIL,
    phone: MARKER_PHONE,
    extraContact: "telegram",
    priceTypeId: "pt-1",
    priceTypeName: "Опт",
    priceTypeCode: "OPT",
  });
  assert.equal(preview.id, "onec-1");
  assert.equal(preview.code, "C-1");
  assert.equal(preview.name, "ACME");
  assert.equal(preview.inn, "7700000000");
  assert.equal(preview.priceTypeId, "pt-1");
  assert.equal(preview.email, undefined);
  assert.equal(preview.phone, undefined);
  assert.equal(preview.extraContact, undefined);
  const blob = JSON.stringify(toClientPreviewItems([{ email: MARKER_EMAIL, phone: MARKER_PHONE, id: "x", name: "n" }]));
  assert.equal(blob.includes(MARKER_EMAIL), false);
  assert.equal(blob.includes(MARKER_PHONE), false);
});

test("SEC3-008: preview artifact is atomic, mode 600, and refuses symlinks", () => {
  const root = makeTempRoot("preview");
  const previewDir = path.join(root, "one-c-preview");
  const target = path.join(previewDir, CLIENT_PREVIEW_FILE);
  const canary = path.join(root, "canary.txt");
  writeFileSync(canary, "original-canary", "utf8");
  try {
    writePreviewArtifact(target, {
      receivedAt: "2026-09-18T12:00:00.000Z",
      data: { items: toClientPreviewItems([{ id: "1", name: "A", email: MARKER_EMAIL }]) },
    });
    const raw = readFileSync(target, "utf8");
    assert.equal(raw.includes(MARKER_EMAIL), false);
    if (process.platform !== "win32") {
      const mode = lstatSync(target).mode & 0o777;
      assert.equal(mode, PREVIEW_FILE_MODE);
    }
    assert.deepEqual(previewNames(previewDir), [CLIENT_PREVIEW_FILE]);
    const symlinkOk = trySymlink(canary, path.join(previewDir, "clients-preview-link.json"));
    if (symlinkOk) {
      const linkPath = path.join(previewDir, "clients-preview-link.json");
      assert.throws(
        () => writePreviewArtifact(linkPath, { data: { items: [{ id: "2" }] } }),
        (error) => error?.code === "PREVIEW_SYMLINK"
      );
      assert.equal(readFileSync(canary, "utf8"), "original-canary");
      assert.equal(lstatSync(linkPath).isSymbolicLink(), true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SEC3-008: failed preview rename leaves no leftover tmp", () => {
  const root = makeTempRoot("preview-fail");
  const previewDir = path.join(root, "one-c-preview");
  const target = path.join(previewDir, CLIENT_PREVIEW_FILE);
  try {
    assert.throws(
      () => writePreviewArtifact(
        target,
        { data: { items: toClientPreviewItems([{ id: "1", name: "A" }]) } },
        {
          renameFn: () => {
            const error = new Error("rename failed");
            error.code = "PREVIEW_RENAME_FAILED";
            throw error;
          },
        }
      ),
      (error) => error?.code === "PREVIEW_RENAME_FAILED"
    );
    assert.equal(existsSync(previewDir), true);
    assert.deepEqual(
      previewNames(previewDir).filter((name) => name.endsWith(".tmp")),
      []
    );
    assert.equal(existsSync(target), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SEC3-008: preview directory symlink does not receive the artifact", () => {
  const root = makeTempRoot("preview-dirlink");
  const realDir = path.join(root, "real-preview");
  const linkDir = path.join(root, "one-c-preview");
  mkdirSync(realDir, { recursive: true });
  const canary = path.join(realDir, "canary.txt");
  writeFileSync(canary, "keep-preview-target", "utf8");
  let mkdirCalls = 0;
  const linkFs = injectedFs(path.join(linkDir, CLIENT_PREVIEW_FILE), {
    kind: "file",
    override: {
      [linkDir]: { kind: "symlink", realpath: realDir },
    },
  });
  // Injected directory symlink always runs. Real OS symlink is extra coverage.
  try {
    assert.throws(
      () => writePreviewArtifact(
        path.join(linkDir, CLIENT_PREVIEW_FILE),
        { data: { items: [{ id: "1", name: "A" }] } },
        {
          ...linkFs,
          mkdirSync: (...args) => {
            mkdirCalls += 1;
            return mkdirSync(...args);
          },
        }
      ),
      (error) => error?.code === "PREVIEW_SYMLINK"
    );
    assert.equal(mkdirCalls, 0);
    assert.equal(existsSync(path.join(realDir, CLIENT_PREVIEW_FILE)), false);
    assert.equal(readFileSync(canary, "utf8"), "keep-preview-target");

    const parentLink = path.join(root, "parent-link");
    const nestedPreview = path.join(parentLink, "one-c-preview", CLIENT_PREVIEW_FILE);
    assert.throws(
      () => writePreviewArtifact(
        nestedPreview,
        { data: { items: [{ id: "1", name: "A" }] } },
        injectedFs(nestedPreview, {
          kind: "file",
          override: {
            [parentLink]: { kind: "junction", realpath: realDir },
          },
        })
      ),
      (error) => error?.code === "PREVIEW_SYMLINK"
    );
    assert.equal(existsSync(path.join(realDir, CLIENT_PREVIEW_FILE)), false);

    const linked = tryDirSymlink(realDir, linkDir);
    if (linked) {
      assert.throws(
        () => writePreviewArtifact(
          path.join(linkDir, CLIENT_PREVIEW_FILE),
          { data: { items: [{ id: "1", name: "A" }] } }
        ),
        (error) => error?.code === "PREVIEW_SYMLINK"
      );
      assert.equal(existsSync(path.join(realDir, CLIENT_PREVIEW_FILE)), false);
      assert.equal(readFileSync(canary, "utf8"), "keep-preview-target");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SEC3-008: stale preview artifact is cleaned without following a symlink", () => {
  const root = makeTempRoot("preview-stale");
  const previewDir = path.join(root, "one-c-preview");
  mkdirSync(previewDir, { recursive: true });
  const stale = path.join(previewDir, CLIENT_PREVIEW_FILE);
  const canary = path.join(root, "canary.txt");
  writeFileSync(stale, JSON.stringify({ email: MARKER_EMAIL }), "utf8");
  writeFileSync(canary, "keep-me", "utf8");
  const old = new Date("2020-01-01T00:00:00.000Z");
  utimesSync(stale, old, old);
  try {
    const result = cleanupStalePreviewArtifacts(previewDir, {
      now: new Date("2026-09-18T12:00:00.000Z"),
      maxAgeMs: 24 * 60 * 60 * 1000,
    });
    assert.ok(result.removed >= 1);
    assert.equal(existsSync(stale), false);

    const linkPath = path.join(previewDir, CLIENT_PREVIEW_FILE);
    const symlinkOk = trySymlink(canary, linkPath);
    if (symlinkOk) {
      const skipped = cleanupStalePreviewArtifacts(previewDir, {
        now: new Date("2026-09-18T12:00:00.000Z"),
        maxAgeMs: 1,
      });
      assert.ok(skipped.skippedSymlinks >= 1);
      assert.equal(lstatSync(linkPath).isSymbolicLink(), true);
      assert.equal(readFileSync(canary, "utf8"), "keep-me");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SEC3-008: clients-preview route writes minimized artifact helper", () => {
  const serverSource = readRepoSource("server/src/server.js");
  const start = serverSource.indexOf('app.post("/api/one-c/clients-preview"');
  assert.ok(start >= 0);
  const next = serverSource.indexOf('\napp.post("', start + 10);
  const slice = serverSource.slice(start, next === -1 ? undefined : next);
  assert.match(slice, /writePreviewArtifact\(/u);
  assert.match(slice, /toClientPreviewItems\(/u);
  assert.doesNotMatch(slice, /items:\s*allOneCClients/u);
});

test("SEC3-009: backup download success and error set private no-store", () => {
  const successRes = mockRes();
  const success = executeBackupDownload({
    fileName: "clover-fixture.zip",
    res: successRes,
    openStream: () => {
      const stream = Readable.from([Buffer.from("zip")]);
      stream.pipe = (dest) => {
        dest.piped = true;
        return dest;
      };
      return stream;
    },
  });
  assert.equal(success.ok, true);
  assertPrivateNoStore(successRes.headers);
  assert.match(String(successRes.headers["content-disposition"] || ""), /attachment/u);
  assert.equal(successRes.headers["content-type"], "application/zip");
  assert.match(BACKUP_DOWNLOAD_CACHE_CONTROL, /no-store/iu);
  assert.match(BACKUP_DOWNLOAD_CACHE_CONTROL, /private/iu);

  const errorRes = mockRes();
  const failure = executeBackupDownload({
    fileName: "missing.zip",
    res: errorRes,
    openStream: () => {
      const error = new Error(`cannot read ${MARKER_PATH} ${MARKER_EMAIL}`);
      error.code = "BACKUP_NOT_FOUND";
      error.status = 404;
      error.path = MARKER_PATH;
      error.body = MARKER_BODY;
      throw error;
    },
  });
  assert.equal(failure.ok, false);
  assertPrivateNoStore(errorRes.headers);
  assert.equal(errorRes.headers["content-disposition"], undefined);
  assert.notEqual(String(errorRes.headers["content-type"] || "").toLowerCase(), "application/zip");
});

test("SEC3-009: backup download audit is server-owned and leak-free", () => {
  const success = buildBackupDownloadAuditDetails({
    result: "success",
    fileName: "clover-fixture.zip",
  });
  assert.equal(success.result, "success");
  assert.equal(success.fileName, "clover-fixture.zip");
  assert.equal(success.path, undefined);
  assert.equal(success.body, undefined);
  assert.equal(success.message, undefined);

  const failure = buildBackupDownloadAuditDetails({
    result: "error",
    fileName: "clover-fixture.zip",
    code: "BACKUP_NOT_FOUND",
    error: {
      message: `failed ${MARKER_PATH} ${MARKER_EMAIL} ${MARKER_SECRET} ${MARKER_BODY}`,
      path: MARKER_PATH,
      body: MARKER_BODY,
    },
  });
  assert.equal(failure.result, "error");
  assert.equal(failure.code, "BACKUP_NOT_FOUND");
  assertNoMarker(failure, "backup audit");
  assert.equal(Object.prototype.hasOwnProperty.call(failure, "path"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(failure, "body"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(failure, "message"), false);
});

test("SEC3-009: live backup download route wires headers and audit", () => {
  const serverSource = readRepoSource("server/src/server.js");
  const start = serverSource.indexOf('"/api/admin/backups/:fileName/download"');
  assert.ok(start >= 0);
  const next = serverSource.indexOf("app.post(", start);
  const slice = serverSource.slice(start, next === -1 ? undefined : next);
  assert.match(slice, /executeBackupDownload\(/u);
  assert.match(slice, /auditFromRequest\(req,\s*"backup\.download"/u);
  assert.match(slice, /roleRequired\("admin"\)/u);
  assert.doesNotMatch(slice, /roleRequired\("manager"\)/u);
});

test("SEC3-009: live Express success and error keep no-store without error attachment", async () => {
  const app = express();
  app.get("/api/admin/backups/:fileName/download", (req, res, next) => {
    const outcome = executeBackupDownload({
      fileName: req.params.fileName,
      res,
      openStream: (fileName) => {
        if (String(fileName).includes("missing")) {
          const error = new Error("Резервная копия не найдена.");
          error.status = 404;
          error.code = "BACKUP_NOT_FOUND";
          error.path = MARKER_PATH;
          throw error;
        }
        const stream = Readable.from([Buffer.from("PK")]);
        return stream;
      },
    });
    if (!outcome.ok) next(outcome.error);
  });
  app.use((error, req, res, _next) => {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    res.status(status).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
  });

  const server = await new Promise((resolve) => {
    const httpServer = app.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  try {
    const { port } = server.address();
    const success = await fetch(
      `http://127.0.0.1:${port}/api/admin/backups/clover-fixture.zip/download`
    );
    assert.equal(success.status, 200);
    assert.match(String(success.headers.get("cache-control") || ""), /no-store/iu);
    assert.match(String(success.headers.get("cache-control") || ""), /private/iu);
    assert.equal(success.headers.get("content-type"), "application/zip");
    assert.match(String(success.headers.get("content-disposition") || ""), /attachment/u);
    await success.arrayBuffer();

    const failure = await fetch(
      `http://127.0.0.1:${port}/api/admin/backups/missing.zip/download`
    );
    assert.equal(failure.status, 404);
    assert.match(String(failure.headers.get("cache-control") || ""), /no-store/iu);
    assert.match(String(failure.headers.get("cache-control") || ""), /private/iu);
    assert.equal(failure.headers.get("content-disposition"), null);
    const failType = String(failure.headers.get("content-type") || "").toLowerCase();
    assert.equal(failType.includes("application/zip"), false);
    const failBody = await failure.text();
    assert.equal(failBody.includes("attachment"), false);
    assert.equal(failBody.includes("filename="), false);
    assertNoMarker(failBody, "express error body");
    assert.equal(failBody.includes(MARKER_PATH), false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("SEC3-011: tracked health script uses mktemp, mode 600, and trap cleanup", () => {
  assert.equal(existsSync(LINUX_HEALTH_SCRIPT), false);
  const source = readRepoSource("releases/dc-prep-ac44dcf/scripts/health-check.sh");
  assert.match(source, /\bmktemp\b/u);
  assert.match(source, /\btrap\b/u);
  assert.match(source, /chmod 600/u);
  assert.doesNotMatch(source, /\/tmp\/clover-health\.json/u);
  const restart = readRepoSource("scripts/linux/restart-api-ui.sh");
  assert.doesNotMatch(restart, /\/tmp\/clover-health\.json/u);
  assert.match(restart, /wait_for_health/u);
});

function toBashPath(filePath) {
  const resolved = path.resolve(filePath);
  if (process.platform !== "win32") return resolved;
  return resolved
    .replace(/\\/gu, "/")
    .replace(/^([A-Za-z]):/u, (_, drive) => `/${String(drive).toLowerCase()}`);
}

test("SEC3-011: health script leaves a hostile symlink untouched", () => {
  const root = makeTempRoot("health");
  const canary = path.join(root, "canary.txt");
  writeFileSync(canary, "health-canary", "utf8");
  const hostile = path.join(root, "clover-health.json");
  const fakeCurl = path.join(root, "fake-curl.sh");
  writeFileSync(
    fakeCurl,
    [
      "#!/usr/bin/env bash",
      "if [[ \"$*\" == *'%{http_code}'* ]]; then",
      "  printf '200'",
      "  exit 0",
      "fi",
      "printf '%s\\n' '{\"ok\":true,\"service\":\"clover-server\",\"version\":\"4.0.4\"}'",
      "",
    ].join("\n"),
    "utf8"
  );
  chmodSync(fakeCurl, 0o755);
  try {
    const symlinkOk = trySymlink(canary, hostile);
    const bash = resolveBash();
    const result = spawnSync(
      bash,
      [toBashPath(HEALTH_SCRIPT)],
      {
        cwd: root,
        env: {
          ...process.env,
          TMPDIR: toBashPath(root),
          TMP: toBashPath(root),
          CLOVER_API_URL: "http://127.0.0.1:9/api/health",
          CLOVER_UI_URL: "http://127.0.0.1:9/",
          CLOVER_HEALTH_CURL: toBashPath(fakeCurl),
        },
        encoding: "utf8",
      }
    );
    if (result.error && result.error.code === "ENOENT") {
      assert.match(readRepoSource("releases/dc-prep-ac44dcf/scripts/health-check.sh"), /\bmktemp\b/u);
      return;
    }
    assert.equal(result.status, 0, result.stderr || result.stdout);
    if (symlinkOk) {
      assert.equal(lstatSync(hostile).isSymbolicLink(), true);
      assert.equal(readFileSync(canary, "utf8"), "health-canary");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
