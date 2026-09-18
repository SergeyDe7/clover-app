import path from "node:path";
import { lstatSync, realpathSync } from "node:fs";
import {
  assertNoSymlinkPathComponents,
  isSymlinkOrJunction,
  nativeRealpath,
} from "./safeFsPath.js";

export const AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS = 365;
export const AUDIT_RETENTION_MAX_AGE_SOURCE_DEFAULT = "AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS";
export const AUDIT_RETENTION_MAX_AGE_SOURCE_CLI = "cli";
export const AUDIT_EMAIL_REDACTED = "";
export const PRODUCTION_DATA_MARKER = "/opt/clover/clover-app/server/data";

export function isExplicitApply(options = {}) {
  return options.apply === true;
}

export function auditRetentionCutoffIso(now, maxAgeDays = AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS) {
  const when = now instanceof Date ? now : new Date(now);
  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) {
    const error = new Error("maxAgeDays must be a positive number");
    error.code = "AUDIT_RETENTION_MAX_AGE_INVALID";
    throw error;
  }
  return new Date(when.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function posixResolved(candidate) {
  return path.resolve(candidate).replaceAll("\\", "/");
}

export function isProductionLookingDbPath(candidate) {
  const posix = posixResolved(candidate);
  return (
    posix === PRODUCTION_DATA_MARKER ||
    posix.endsWith(PRODUCTION_DATA_MARKER) ||
    posix.includes(`${PRODUCTION_DATA_MARKER}/`)
  );
}

export function isWorktreeDataDbPath(candidate, repositoryRoot) {
  const worktreeData = posixResolved(path.resolve(repositoryRoot, "server/data"));
  const posix = posixResolved(candidate);
  return posix === worktreeData || posix.startsWith(`${worktreeData}/`);
}

export function assertRetentionDbPathAllowed(
  candidate,
  { repositoryRoot, allowProduction = false, fs } = {}
) {
  const resolved = path.resolve(String(candidate || ""));
  if (!String(candidate || "").trim()) {
    const error = new Error("Refusing empty DB_PATH");
    error.code = "AUDIT_RETENTION_DB_PATH_DENIED";
    throw error;
  }
  if (isProductionLookingDbPath(resolved) && allowProduction !== true) {
    const error = new Error("Refusing production DB_PATH");
    error.code = "AUDIT_RETENTION_DB_PATH_DENIED";
    throw error;
  }
  if (repositoryRoot && isWorktreeDataDbPath(resolved, repositoryRoot)) {
    const error = new Error("Refusing worktree DB_PATH");
    error.code = "AUDIT_RETENTION_DB_PATH_DENIED";
    throw error;
  }

  const io = fs || { lstatSync, realpathSync };
  try {
    assertNoSymlinkPathComponents(resolved, { allowMissing: false, fs: io });
  } catch (error) {
    if (error?.code === "SAFE_PATH_SYMLINK") {
      const denied = new Error("Refusing symlink DB_PATH");
      denied.code = "AUDIT_RETENTION_DB_PATH_DENIED";
      throw denied;
    }
    if (error?.code === "SAFE_PATH_MISSING") {
      const missing = new Error("DB_PATH does not exist");
      missing.code = "AUDIT_RETENTION_DB_PATH_DENIED";
      throw missing;
    }
    throw error;
  }

  const stats = io.lstatSync(resolved);
  if (isSymlinkOrJunction(stats) || !stats.isFile()) {
    const error = new Error("DB_PATH must be a regular file");
    error.code = "AUDIT_RETENTION_DB_PATH_DENIED";
    throw error;
  }

  const canonical = path.resolve(nativeRealpath(resolved, io));
  const canonicalParent = path.dirname(canonical);
  try {
    assertNoSymlinkPathComponents(canonical, { allowMissing: false, fs: io });
  } catch (_error) {
    const denied = new Error("Refusing symlink DB_PATH");
    denied.code = "AUDIT_RETENTION_DB_PATH_DENIED";
    throw denied;
  }
  const canonicalStats = io.lstatSync(canonical);
  if (isSymlinkOrJunction(canonicalStats) || !canonicalStats.isFile()) {
    const error = new Error("DB_PATH must be a regular file");
    error.code = "AUDIT_RETENTION_DB_PATH_DENIED";
    throw error;
  }

  if (
    allowProduction !== true &&
    (isProductionLookingDbPath(canonical) || isProductionLookingDbPath(canonicalParent))
  ) {
    const error = new Error("Refusing production DB_PATH");
    error.code = "AUDIT_RETENTION_DB_PATH_DENIED";
    throw error;
  }
  if (
    repositoryRoot &&
    (isWorktreeDataDbPath(canonical, repositoryRoot) ||
      isWorktreeDataDbPath(canonicalParent, repositoryRoot))
  ) {
    const error = new Error("Refusing worktree DB_PATH");
    error.code = "AUDIT_RETENTION_DB_PATH_DENIED";
    throw error;
  }
  return canonical;
}

export function parseAuditRetentionArgs(argv) {
  const options = {
    apply: false,
    maxAgeDays: AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS,
    maxAgeDaysSource: AUDIT_RETENTION_MAX_AGE_SOURCE_DEFAULT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--max-age-days") {
      options.maxAgeDays = Number(argv[index + 1]);
      options.maxAgeDaysSource = AUDIT_RETENTION_MAX_AGE_SOURCE_CLI;
      index += 1;
    }
  }
  return options;
}

export function runAuditRetention({
  db,
  apply,
  maxAgeDays = AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS,
  now = new Date(),
} = {}) {
  if (!db || typeof db.prepare !== "function") {
    const error = new Error("audit retention requires an injected database");
    error.code = "AUDIT_RETENTION_DB_REQUIRED";
    throw error;
  }

  const when = now instanceof Date ? now : new Date(now);
  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) {
    const error = new Error("maxAgeDays must be a positive number");
    error.code = "AUDIT_RETENTION_MAX_AGE_INVALID";
    throw error;
  }

  const cutoff = auditRetentionCutoffIso(when, days);
  const rows = db.prepare(`
    SELECT id, user_id, user_email, user_role, action, details_json, created_at
    FROM audit_log
    WHERE created_at < ?
  `).all(cutoff);

  const wouldAnonymize = rows.filter(
    (row) => String(row.user_email || "") !== AUDIT_EMAIL_REDACTED
  );
  const explicitApply = isExplicitApply({ apply });
  let anonymized = 0;

  if (explicitApply && wouldAnonymize.length) {
    const updated = db.prepare(`
      UPDATE audit_log
      SET user_email = ?
      WHERE created_at < ?
        AND IFNULL(user_email, '') != ?
    `).run(AUDIT_EMAIL_REDACTED, cutoff, AUDIT_EMAIL_REDACTED);
    anonymized = Number(updated.changes) || 0;
  }

  return {
    dryRun: !explicitApply,
    apply: explicitApply,
    cutoff,
    scanned: rows.length,
    wouldAnonymize: wouldAnonymize.length,
    anonymized,
    unchanged: rows.length - wouldAnonymize.length,
  };
}
