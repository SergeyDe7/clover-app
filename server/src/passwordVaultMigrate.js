/**
 * S2-NEW-002: strip plaintext passwords from clientAccessVault / staffAccessVault.
 *
 * Opt-in flag: CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS=true|1|yes
 * Without the flag, nothing changes.
 *
 * Classification:
 *   A usable hash + plaintext match  → strip plaintext
 *   B usable hash + mismatch         → hash is authority; strip plaintext
 *   C missing/malformed hash (active)→ STOP / ROLLBACK (no random passwords)
 *   D orphan vault entry             → remove after proving no user row
 *
 * Logs/returns only aggregate counts — never credential values.
 */
import { isUsablePasswordHash, verifyPasswordSync } from "./passwordHash.js";

export const STRIP_PLAINTEXT_PASSWORDS_FLAG = "CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS";

const CLIENT_VAULT_KEY = "clientAccessVault";
const STAFF_VAULT_KEY = "staffAccessVault";

function cleanText(value) {
  return String(value ?? "").trim();
}

function parseVaultJson(raw) {
  if (raw == null || raw === "") return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readAppState(database, key) {
  const row = database.prepare("SELECT value_json FROM app_state WHERE key = ?").get(key);
  return parseVaultJson(row?.value_json);
}

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
  return database
    .prepare(
      `SELECT id, role, password_hash, disabled_at, email_verified, approval_status
       FROM users WHERE id = ?`
    )
    .get(String(id || ""));
}

function isActiveAccount(row) {
  if (!row) return false;
  if (row.disabled_at) return false;
  return true;
}

function entryHasPlaintextPassword(entry) {
  if (!entry || typeof entry !== "object") return false;
  return Boolean(cleanText(entry.password));
}

function stripPasswordFields(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const next = { ...entry };
  delete next.password;
  delete next.passwordHash;
  delete next.password_hash;
  delete next.plainPassword;
  delete next.temporaryPassword;
  return next;
}

/**
 * Aggregate inventory — counts only, no PII/secrets.
 */
export function inspectPlaintextPasswordVaultCounts(database) {
  const users = database
    .prepare(
      `SELECT id, role, password_hash, disabled_at FROM users`
    )
    .all();
  const byRole = { client: 0, manager: 0, admin: 0, other: 0 };
  let usableHash = 0;
  let missingOrMalformedHash = 0;
  const meta = { bcrypt: 0, otherOrEmpty: 0, costHistogram: {} };

  for (const row of users) {
    const role = String(row.role || "");
    if (role === "client" || role === "manager" || role === "admin") byRole[role] += 1;
    else byRole.other += 1;
    if (isUsablePasswordHash(row.password_hash)) {
      usableHash += 1;
      meta.bcrypt += 1;
      const costMatch = String(row.password_hash).match(/^\$2[aby]?\$(\d{2})\$/);
      const cost = costMatch ? costMatch[1] : "?";
      meta.costHistogram[cost] = (meta.costHistogram[cost] || 0) + 1;
    } else {
      missingOrMalformedHash += 1;
      meta.otherOrEmpty += 1;
    }
  }

  const clientVault = readAppState(database, CLIENT_VAULT_KEY);
  const staffVault = readAppState(database, STAFF_VAULT_KEY);

  let clientPlaintext = 0;
  let staffPlaintext = 0;
  let clientOrphan = 0;
  let staffOrphan = 0;
  let clientMatch = 0;
  let clientMismatch = 0;
  let staffMatch = 0;
  let staffMismatch = 0;
  let clientHashMissingWithPlain = 0;
  let staffHashMissingWithPlain = 0;

  for (const [id, entry] of Object.entries(clientVault)) {
    const row = userRowById(database, id);
    const hasPlain = entryHasPlaintextPassword(entry);
    if (!row) {
      clientOrphan += 1;
      if (hasPlain) clientPlaintext += 1;
      continue;
    }
    if (hasPlain) {
      clientPlaintext += 1;
      if (!isUsablePasswordHash(row.password_hash)) {
        clientHashMissingWithPlain += 1;
      }
    }
  }

  for (const [id, entry] of Object.entries(staffVault)) {
    const row = userRowById(database, id);
    const hasPlain = entryHasPlaintextPassword(entry);
    if (!row) {
      staffOrphan += 1;
      if (hasPlain) staffPlaintext += 1;
      continue;
    }
    if (hasPlain) {
      staffPlaintext += 1;
      if (!isUsablePasswordHash(row.password_hash)) {
        staffHashMissingWithPlain += 1;
      }
    }
  }

  return {
    usersByRole: byRole,
    usableHash,
    missingOrMalformedHash,
    hashAlgorithm: meta,
    clientVaultEntries: Object.keys(clientVault).length,
    staffVaultEntries: Object.keys(staffVault).length,
    plaintext: {
      client: clientPlaintext,
      staff: staffPlaintext,
      total: clientPlaintext + staffPlaintext,
    },
    orphanVault: { client: clientOrphan, staff: staffOrphan },
    /** Match/mismatch vs hash requires async verify — filled by classifyAsync. */
    matchProbe: {
      clientMatch,
      clientMismatch,
      staffMatch,
      staffMismatch,
      clientHashMissingWithPlain,
      staffHashMissingWithPlain,
    },
  };
}

function classifyClientEntry(database, id, entry) {
  const row = userRowById(database, id);
  const plain = cleanText(entry?.password);
  if (!row) {
    return { kind: "D_orphan", id, vault: "client" };
  }
  const usable = isUsablePasswordHash(row.password_hash);
  if (!plain) {
    return { kind: "clean", id, vault: "client" };
  }
  if (!usable) {
    return {
      kind: "C_blocker",
      id,
      vault: "client",
      role: row.role,
      inactive: !isActiveAccount(row),
    };
  }
  const matched = verifyPasswordSync(plain, row.password_hash);
  return { kind: matched ? "A_match" : "B_mismatch", id, vault: "client" };
}

function classifyStaffEntry(database, id, entry) {
  const row = userRowById(database, id);
  const plain = cleanText(entry?.password);
  if (!row) {
    return { kind: "D_orphan", id, vault: "staff" };
  }
  const usable = isUsablePasswordHash(row.password_hash);
  if (!plain) {
    return { kind: "clean", id, vault: "staff" };
  }
  if (!usable) {
    return { kind: "C_blocker", id, vault: "staff", role: row.role };
  }
  const matched = verifyPasswordSync(plain, row.password_hash);
  return { kind: matched ? "A_match" : "B_mismatch", id, vault: "staff" };
}

export function classifyPlaintextPasswordVault(database) {
  const clientVault = readAppState(database, CLIENT_VAULT_KEY);
  const staffVault = readAppState(database, STAFF_VAULT_KEY);
  const classifications = [];
  for (const [id, entry] of Object.entries(clientVault)) {
    classifications.push(classifyClientEntry(database, id, entry));
  }
  for (const [id, entry] of Object.entries(staffVault)) {
    classifications.push(classifyStaffEntry(database, id, entry));
  }
  const counts = {
    A_match: 0,
    B_mismatch: 0,
    C_blocker: 0,
    D_orphan: 0,
    clean: 0,
  };
  for (const item of classifications) {
    counts[item.kind] = (counts[item.kind] || 0) + 1;
  }
  return { counts, classifications };
}

/**
 * @param {{ apply?: boolean, _testBeforeCommit?: Function }} options
 * apply=false → preview only (no writes).
 */
export function migrateStripPlaintextPasswords(
  database,
  { apply = false, _testBeforeCommit } = {}
) {
  const before = inspectPlaintextPasswordVaultCounts(database);
  const classified = classifyPlaintextPasswordVault(database);
  const blockers = classified.classifications.filter((c) => c.kind === "C_blocker");

  if (!apply) {
    return {
      applied: false,
      preview: true,
      before,
      classification: classified.counts,
      blockers: blockers.length,
      stripped: 0,
      orphansRemoved: 0,
      after: before,
    };
  }

  if (blockers.length > 0) {
    const err = new Error("plaintext password migration blocked: missing/malformed hash");
    err.code = "PASSWORD_VAULT_MIGRATE_BLOCKED";
    err.blockers = blockers.length;
    err.before = before;
    err.classification = classified.counts;
    throw err;
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    const clientVault = readAppState(database, CLIENT_VAULT_KEY);
    const staffVault = readAppState(database, STAFF_VAULT_KEY);
    let stripped = 0;
    let orphansRemoved = 0;

    const nextClient = {};
    for (const [id, entry] of Object.entries(clientVault)) {
      const row = userRowById(database, id);
      if (!row) {
        orphansRemoved += 1;
        continue;
      }
      const hadPlain = entryHasPlaintextPassword(entry);
      const cleaned = stripPasswordFields(entry);
      if (hadPlain) stripped += 1;
      nextClient[id] = cleaned;
    }

    const nextStaff = {};
    for (const [id, entry] of Object.entries(staffVault)) {
      const row = userRowById(database, id);
      if (!row) {
        orphansRemoved += 1;
        continue;
      }
      const hadPlain = entryHasPlaintextPassword(entry);
      const cleaned = stripPasswordFields(entry);
      if (hadPlain) stripped += 1;
      nextStaff[id] = cleaned;
    }

    writeAppState(database, CLIENT_VAULT_KEY, nextClient);
    writeAppState(database, STAFF_VAULT_KEY, nextStaff);

    if (typeof _testBeforeCommit === "function") {
      _testBeforeCommit({ stripped, orphansRemoved });
    }

    database.exec("COMMIT");
    const after = inspectPlaintextPasswordVaultCounts(database);
    return {
      applied: true,
      preview: false,
      before,
      classification: classified.counts,
      blockers: 0,
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
