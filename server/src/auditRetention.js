import path from "node:path";
import { lstatSync, realpathSync } from "node:fs";
import {
  assertNoSymlinkPathComponents,
  isSymlinkOrJunction,
  nativeRealpath,
  sameCanonicalPath,
} from "./safeFsPath.js";

export const AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS = 365;
export const AUDIT_RETENTION_MAX_AGE_SOURCE_DEFAULT = "AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS";
export const AUDIT_RETENTION_MAX_AGE_SOURCE_CLI = "cli";
export const AUDIT_EMAIL_REDACTED = "";
export const PRODUCTION_REPOSITORY_ROOT = "/opt/clover/clover-app";
export const PRODUCTION_DATA_MARKER = "/opt/clover/clover-app/server/data";
export const PRODUCTION_LIVE_DB_RELATIVE = "server/data/clover.sqlite";

export function isExplicitApply(options = {}) {
  return options.apply === true;
}

export function productionLiveDbPath() {
  return path.resolve(PRODUCTION_REPOSITORY_ROOT, PRODUCTION_LIVE_DB_RELATIVE);
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

export function isPathProvenProductionRepositoryRoot(repositoryRoot) {
  if (!repositoryRoot) return false;
  return sameCanonicalPath(repositoryRoot, PRODUCTION_REPOSITORY_ROOT);
}

export function isExactLiveDbPath(candidate, repositoryRoot) {
  if (!repositoryRoot) return false;
  return sameCanonicalPath(
    candidate,
    path.resolve(repositoryRoot, PRODUCTION_LIVE_DB_RELATIVE)
  );
}

function denyRetentionPath(message) {
  const error = new Error(message);
  error.code = "AUDIT_RETENTION_DB_PATH_DENIED";
  throw error;
}

export function isExactProductionLiveException({
  candidate,
  repositoryRoot,
  allowProduction = false,
} = {}) {
  return (
    allowProduction === true &&
    isPathProvenProductionRepositoryRoot(repositoryRoot) &&
    isExactLiveDbPath(candidate, repositoryRoot) &&
    sameCanonicalPath(candidate, productionLiveDbPath())
  );
}

export function assertProvenProductionRepositoryRoot(repositoryRoot, { fs } = {}) {
  if (!isPathProvenProductionRepositoryRoot(repositoryRoot)) {
    denyRetentionPath("Refusing unproven production repository root");
  }
  const io = fs || { lstatSync, realpathSync };
  const resolved = path.resolve(repositoryRoot);
  try {
    assertNoSymlinkPathComponents(resolved, { allowMissing: false, fs: io });
  } catch (error) {
    if (error?.code === "SAFE_PATH_SYMLINK") {
      denyRetentionPath("Refusing symlink DB_PATH");
    }
    if (error?.code === "SAFE_PATH_MISSING") {
      denyRetentionPath("Refusing unproven production repository root");
    }
    throw error;
  }
  const stats = io.lstatSync(resolved);
  if (isSymlinkOrJunction(stats) || !stats.isDirectory()) {
    denyRetentionPath("Refusing unproven production repository root");
  }
  return resolved;
}

export function assertRetentionDbPathAllowed(
  candidate,
  { repositoryRoot, allowProduction = false, fs } = {}
) {
  if (!String(candidate || "").trim()) {
    denyRetentionPath("Refusing empty DB_PATH");
  }
  const resolved = path.resolve(String(candidate || ""));
  const io = fs || { lstatSync, realpathSync };
  const earlyException = isExactProductionLiveException({
    candidate: resolved,
    repositoryRoot,
    allowProduction,
  });
  if (!earlyException) {
    if (isProductionLookingDbPath(resolved)) {
      denyRetentionPath("Refusing production DB_PATH");
    }
    if (repositoryRoot && isWorktreeDataDbPath(resolved, repositoryRoot)) {
      denyRetentionPath("Refusing worktree DB_PATH");
    }
  }

  try {
    assertNoSymlinkPathComponents(resolved, { allowMissing: false, fs: io });
  } catch (error) {
    if (error?.code === "SAFE_PATH_SYMLINK") {
      denyRetentionPath("Refusing symlink DB_PATH");
    }
    if (error?.code === "SAFE_PATH_MISSING") {
      denyRetentionPath("DB_PATH does not exist");
    }
    throw error;
  }

  const stats = io.lstatSync(resolved);
  if (isSymlinkOrJunction(stats) || !stats.isFile()) {
    denyRetentionPath("DB_PATH must be a regular file");
  }

  const canonical = path.resolve(nativeRealpath(resolved, io));
  const canonicalParent = path.dirname(canonical);
  try {
    assertNoSymlinkPathComponents(canonical, { allowMissing: false, fs: io });
  } catch (_error) {
    denyRetentionPath("Refusing symlink DB_PATH");
  }
  const canonicalStats = io.lstatSync(canonical);
  if (isSymlinkOrJunction(canonicalStats) || !canonicalStats.isFile()) {
    denyRetentionPath("DB_PATH must be a regular file");
  }

  if (isExactProductionLiveException({
    candidate: canonical,
    repositoryRoot,
    allowProduction,
  })) {
    assertProvenProductionRepositoryRoot(repositoryRoot, { fs: io });
    return canonical;
  }
  if (isProductionLookingDbPath(canonical) || isProductionLookingDbPath(canonicalParent)) {
    denyRetentionPath("Refusing production DB_PATH");
  }
  if (
    repositoryRoot &&
    (isWorktreeDataDbPath(canonical, repositoryRoot) ||
      isWorktreeDataDbPath(canonicalParent, repositoryRoot))
  ) {
    denyRetentionPath("Refusing worktree DB_PATH");
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
