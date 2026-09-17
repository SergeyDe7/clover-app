/**
 * S2-NEW-002: strip plaintext/credential fields from clientAccessVault / staffAccessVault.
 *
 * Opt-in flag: CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS=true|1|yes
 * Without the flag, nothing changes.
 *
 * Classification (shared credentialVaultInspector):
 *   A usable hash + plaintext match  → strip secrets
 *   B usable hash + mismatch         → hash is authority; strip secrets
 *   C missing/malformed hash (active)→ STOP / ROLLBACK (no random passwords)
 *   D orphan vault entry             → remove after proving no user row
 *   parse_error (corrupt vault JSON) → STOP / ROLLBACK (never coerce to {})
 *
 * Logs/returns only aggregate counts — never credential values.
 */
import {
  CLIENT_VAULT_KEY,
  STAFF_VAULT_KEY,
  classifyCredentialVaults,
  entryHasForbiddenCredential,
  inspectCredentialVaultCounts,
  readVaultStateStrict,
  stripForbiddenCredentialFields,
} from "./credentialVaultInspector.js";

export const STRIP_PLAINTEXT_PASSWORDS_FLAG = "CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS";

function writeAppState(database, key, value) {
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO app_state (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .run(key, JSON.stringify(value && typeof value === "object" ? value : {}), now);
}

function userRowById(database, id) {
  return database.prepare(`SELECT id FROM users WHERE id = ?`).get(String(id || ""));
}

/** Aggregate inventory — counts only, no PII/secrets. Real matchProbe. */
export function inspectPlaintextPasswordVaultCounts(database) {
  return inspectCredentialVaultCounts(database);
}

export function classifyPlaintextPasswordVault(database) {
  return classifyCredentialVaults(database);
}

function assertVaultsWritable(database) {
  const client = readVaultStateStrict(database, CLIENT_VAULT_KEY);
  const staff = readVaultStateStrict(database, STAFF_VAULT_KEY);
  const parseErrors = [];
  if (!client.parseOk) parseErrors.push("client");
  if (!staff.parseOk) parseErrors.push("staff");
  if (parseErrors.length) {
    const err = new Error("plaintext password migration blocked: vault json invalid");
    err.code = "PASSWORD_VAULT_MIGRATE_BLOCKED";
    err.reason = "vault_json_invalid";
    err.blockers = parseErrors.length;
    err.parseErrors = parseErrors;
    // Never attach raw JSON or secrets.
    throw err;
  }
  return { client, staff };
}

/**
 * @param {{ apply?: boolean, _testBeforeCommit?: Function }} options
 * apply=false → preview only (no writes).
 */
export function migrateStripPlaintextPasswords(
  database,
  { apply = false, _testBeforeCommit } = {}
) {
  const before = inspectCredentialVaultCounts(database);
  const classified = classifyCredentialVaults(database);
  const blockers = classified.classifications.filter(
    (c) => c.kind === "C_blocker" || c.kind === "parse_error"
  );

  if (!apply) {
    return {
      applied: false,
      preview: true,
      before,
      classification: classified.counts,
      blockers: blockers.length,
      parseErrors: classified.parseErrors,
      stripped: 0,
      orphansRemoved: 0,
      after: before,
    };
  }

  // Fail-closed BEFORE any write: corrupt JSON or class-C.
  assertVaultsWritable(database);

  if (blockers.length > 0) {
    const err = new Error("plaintext password migration blocked: missing/malformed hash");
    err.code = "PASSWORD_VAULT_MIGRATE_BLOCKED";
    err.blockers = blockers.length;
    err.before = before;
    err.classification = classified.counts;
    err.parseErrors = classified.parseErrors;
    throw err;
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    // Re-read inside transaction; still fail-closed on corrupt.
    const { client, staff } = assertVaultsWritable(database);
    let stripped = 0;
    let orphansRemoved = 0;

    const nextClient = {};
    for (const [id, entry] of Object.entries(client.vault || {})) {
      const row = userRowById(database, id);
      if (!row) {
        orphansRemoved += 1;
        continue;
      }
      const hadSecret = entryHasForbiddenCredential(entry);
      const cleaned = stripForbiddenCredentialFields(entry);
      if (hadSecret) stripped += 1;
      nextClient[id] = cleaned;
    }

    const nextStaff = {};
    for (const [id, entry] of Object.entries(staff.vault || {})) {
      const row = userRowById(database, id);
      if (!row) {
        orphansRemoved += 1;
        continue;
      }
      const hadSecret = entryHasForbiddenCredential(entry);
      const cleaned = stripForbiddenCredentialFields(entry);
      if (hadSecret) stripped += 1;
      nextStaff[id] = cleaned;
    }

    writeAppState(database, CLIENT_VAULT_KEY, nextClient);
    writeAppState(database, STAFF_VAULT_KEY, nextStaff);

    if (typeof _testBeforeCommit === "function") {
      _testBeforeCommit({ stripped, orphansRemoved });
    }

    database.exec("COMMIT");
    const after = inspectCredentialVaultCounts(database);
    return {
      applied: true,
      preview: false,
      before,
      classification: classified.counts,
      blockers: 0,
      parseErrors: [],
      stripped,
      orphansRemoved,
      after,
    };
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (error?.code === "PASSWORD_VAULT_MIGRATE_BLOCKED") throw error;
    const wrapped = new Error("plaintext password migration rolled back");
    wrapped.cause = error;
    wrapped.applied = false;
    wrapped.before = before;
    throw wrapped;
  }
}

export function isStripPlaintextPasswordsFlagEnabled(env = process.env) {
  const enabled = String(env[STRIP_PLAINTEXT_PASSWORDS_FLAG] || "")
    .trim()
    .toLowerCase();
  return enabled === "true" || enabled === "1" || enabled === "yes";
}

export function maybeApplyStripPlaintextPasswordsMigration(database) {
  if (!isStripPlaintextPasswordsFlagEnabled()) {
    return { applied: false, skipped: "flag-off" };
  }
  const result = migrateStripPlaintextPasswords(database, { apply: true });
  console.info(
    "[s2-new-002] strip plaintext passwords migration",
    JSON.stringify({
      applied: result.applied,
      stripped: result.stripped,
      orphansRemoved: result.orphansRemoved,
      plaintextAfter: result.after?.plaintext?.total,
      classification: result.classification,
    })
  );
  return result;
}
