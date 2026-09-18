/**
 * Manual audit PII retention. Dry-run by default.
 * Does not import db.js (no schema-ensure / worktree DB open).
 *
 * TTL default is AUDIT_RETENTION_DEFAULT_MAX_AGE_DAYS (365) in auditRetention.js.
 * That is a library default, not a hidden production policy. Apply still needs --apply.
 *
 * Usage:
 *   DB_PATH=/tmp/fixture.sqlite node scripts/run-audit-retention.mjs
 *   DB_PATH=/tmp/fixture.sqlite node scripts/run-audit-retention.mjs --apply
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  assertRetentionDbPathAllowed,
  isExplicitApply,
  parseAuditRetentionArgs,
  runAuditRetention,
} from "../src/auditRetention.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

const dbPath = String(process.env.DB_PATH || "").trim();
if (!dbPath) {
  fail("Refusing to run without DB_PATH");
}

let canonicalPath;
try {
  canonicalPath = assertRetentionDbPathAllowed(dbPath, {
    repositoryRoot,
    allowProduction: process.env.CLOVER_AUDIT_RETENTION_ALLOW_PRODUCTION === "1",
  });
} catch (error) {
  fail(error.message);
}

const options = parseAuditRetentionArgs(process.argv.slice(2));
const explicitApply = isExplicitApply({ apply: options.apply });

if (!existsSync(canonicalPath)) {
  fail("DB_PATH does not exist");
}

const database = new DatabaseSync(canonicalPath, { readOnly: !explicitApply });
try {
  const result = runAuditRetention({
    db: database,
    apply: explicitApply,
    maxAgeDays: options.maxAgeDays,
  });
  console.log(JSON.stringify({
    dryRun: result.dryRun,
    apply: result.apply,
    maxAgeDays: options.maxAgeDays,
    maxAgeDaysSource: options.maxAgeDaysSource,
    cutoff: result.cutoff,
    scanned: result.scanned,
    wouldAnonymize: result.wouldAnonymize,
    anonymized: result.anonymized,
    unchanged: result.unchanged,
  }));
} finally {
  database.close();
}
