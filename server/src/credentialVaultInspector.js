/**
 * Unified credential vault inspector for clientAccessVault / staffAccessVault.
 * Used by audit, migration preview/apply, and vault strip helpers.
 *
 * Never logs or returns credential values — only counts, kinds, and field names.
 */
import { isUsablePasswordHash, verifyPasswordSync } from "./passwordHash.js";

export const CLIENT_VAULT_KEY = "clientAccessVault";
export const STAFF_VAULT_KEY = "staffAccessVault";

/** Safe metadata keys (case-insensitive). Everything password-like else is secret. */
export const SAFE_CREDENTIAL_METADATA_KEYS = Object.freeze([
  "hasPassword",
  "passwordUpdatedAt",
  "passwordChangedAt",
  "resetRequired",
]);

const SAFE_METADATA_NORMALIZED = new Set(
  SAFE_CREDENTIAL_METADATA_KEYS.map((k) => k.toLowerCase())
);

/** Explicit forbidden keys (normalized). */
const EXPLICIT_FORBIDDEN_NORMALIZED = new Set([
  "password",
  "plainpassword",
  "plaintextpassword",
  "temporarypassword",
  "currentpassword",
  "newpassword",
  "passphrase",
  "credential",
  "secret",
  "token",
  "passwordhash",
  "password_hash",
]);

export function normalizeCredentialKey(key) {
  return String(key ?? "")
    .trim()
    .toLowerCase();
}

export function isSafeCredentialMetadataKey(key) {
  return SAFE_METADATA_NORMALIZED.has(normalizeCredentialKey(key));
}

/**
 * Forbidden credential-like field name at any depth inside a vault entry.
 * Allowlisted metadata is never forbidden. Unknown password-like → secret.
 */
export function isForbiddenCredentialKey(key) {
  const n = normalizeCredentialKey(key);
  if (!n) return false;
  if (SAFE_METADATA_NORMALIZED.has(n)) return false;
  if (EXPLICIT_FORBIDDEN_NORMALIZED.has(n)) return true;
  if (n.includes("password")) return true;
  return false;
}

/**
 * Strict JSON parse for vault blobs. Never coerces corrupt input to {}.
 * @returns {{ ok: true, value: object } | { ok: false, code: string }}
 */
export function parseVaultJsonStrict(raw) {
  if (raw == null || raw === "") {
    return { ok: true, value: {} };
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ok: true, value: raw };
  }
  if (typeof raw !== "string") {
    return { ok: false, code: "VAULT_JSON_INVALID" };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, code: "VAULT_JSON_INVALID" };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, code: "VAULT_JSON_INVALID" };
  }
}

/**
 * Recursively walk objects/arrays. Invokes visit(key, value, path) for each own key.
 */
export function walkCredentialTree(node, visit, path = []) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const child = node[i];
      walkCredentialTree(child, visit, path.concat(String(i)));
    }
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    visit(key, value, path.concat(String(key)));
    if (value && typeof value === "object") {
      walkCredentialTree(value, visit, path.concat(String(key)));
    }
  }
}

/**
 * True if entry contains any forbidden credential field at any depth.
 */
export function entryHasForbiddenCredential(entry) {
  if (!entry || typeof entry !== "object") return false;
  let found = false;
  walkCredentialTree(entry, (key, value) => {
    if (found) return;
    if (!isForbiddenCredentialKey(key)) return;
    if (value == null) return;
    if (typeof value === "object") {
      // empty object/array under forbidden key still counts as presence
      found = true;
      return;
    }
    if (String(value).trim()) found = true;
  });
  return found;
}

/** Collect forbidden field names present (names only, never values). */
export function listForbiddenCredentialFields(entry) {
  const names = new Set();
  if (!entry || typeof entry !== "object") return [];
  walkCredentialTree(entry, (key, value) => {
    if (!isForbiddenCredentialKey(key)) return;
    if (value == null) return;
    if (typeof value === "object" || String(value).trim()) {
      names.add(String(key));
    }
  });
  return [...names];
}

/**
 * Extract a plaintext password candidate for A/B verify (prefer exact "password").
 * Does not return the value to callers of aggregate APIs — used only internally.
 */
function extractPasswordCandidate(entry) {
  if (!entry || typeof entry !== "object") return "";
  const preferred = [];
  const others = [];
  walkCredentialTree(entry, (key, value) => {
    if (value == null || typeof value === "object") return;
    const text = String(value).trim();
    if (!text) return;
    const n = normalizeCredentialKey(key);
    if (n === "password") preferred.push(text);
    else if (
      n === "plainpassword" ||
      n === "plaintextpassword" ||
      n === "temporarypassword" ||
      n === "currentpassword" ||
      n === "newpassword" ||
      n === "passphrase"
    ) {
      others.push(text);
    }
  });
  return preferred[0] || others[0] || "";
}

/**
 * Deep-strip forbidden credential fields. Preserves allowlisted metadata and other keys.
 */
export function stripForbiddenCredentialFields(entry) {
  if (Array.isArray(entry)) {
    return entry.map((item) => stripForbiddenCredentialFields(item));
  }
  if (!entry || typeof entry !== "object") return entry;
  const next = {};
  for (const [key, value] of Object.entries(entry)) {
    if (isForbiddenCredentialKey(key)) continue;
    if (value && typeof value === "object") {
      next[key] = stripForbiddenCredentialFields(value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

/**
 * Read vault row from app_state with strict parse.
 * @returns {{
 *   exists: boolean,
 *   parseOk: boolean,
 *   code?: string,
 *   vault: object|null
 * }}
 */
export function readVaultStateStrict(database, key) {
  const row = database.prepare("SELECT value_json FROM app_state WHERE key = ?").get(key);
  if (!row) {
    return { exists: false, parseOk: true, vault: {} };
  }
  const parsed = parseVaultJsonStrict(row.value_json);
  if (!parsed.ok) {
    return { exists: true, parseOk: false, code: parsed.code, vault: null };
  }
  return { exists: true, parseOk: true, vault: parsed.value };
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

/**
 * Classify one vault entry: A_match | B_mismatch | C_blocker | D_orphan | clean | parse_error
 */
export function classifyVaultEntry(database, id, entry, vaultName) {
  if (entry === null && arguments.length >= 3) {
    // reserved
  }
  const row = userRowById(database, id);
  const hasSecret = entryHasForbiddenCredential(entry);
  if (!row) {
    return {
      kind: "D_orphan",
      id: String(id),
      vault: vaultName,
      hasSecret,
    };
  }
  if (!hasSecret) {
    return { kind: "clean", id: String(id), vault: vaultName, hasSecret: false };
  }
  const usable = isUsablePasswordHash(row.password_hash);
  const plain = extractPasswordCandidate(entry);
  if (!usable) {
    return {
      kind: "C_blocker",
      id: String(id),
      vault: vaultName,
      role: row.role,
      inactive: !isActiveAccount(row),
      hasSecret: true,
    };
  }
  if (!plain) {
    // Forbidden hash/token/secret present but no verifiable password string → treat as mismatch strip candidate
    return { kind: "B_mismatch", id: String(id), vault: vaultName, hasSecret: true };
  }
  const matched = verifyPasswordSync(plain, row.password_hash);
  return {
    kind: matched ? "A_match" : "B_mismatch",
    id: String(id),
    vault: vaultName,
    hasSecret: true,
  };
}

/**
 * Full classification of both vaults. Corrupt vault JSON → parse_error blocker (no erase).
 */
export function classifyCredentialVaults(database) {
  const classifications = [];
  const parseErrors = [];

  for (const [key, vaultName] of [
    [CLIENT_VAULT_KEY, "client"],
    [STAFF_VAULT_KEY, "staff"],
  ]) {
    const state = readVaultStateStrict(database, key);
    if (!state.parseOk) {
      parseErrors.push(vaultName);
      classifications.push({
        kind: "parse_error",
        id: key,
        vault: vaultName,
        hasSecret: null,
      });
      continue;
    }
    for (const [id, entry] of Object.entries(state.vault || {})) {
      classifications.push(classifyVaultEntry(database, id, entry, vaultName));
    }
  }

  const counts = {
    A_match: 0,
    B_mismatch: 0,
    C_blocker: 0,
    D_orphan: 0,
    clean: 0,
    parse_error: 0,
  };
  for (const item of classifications) {
    counts[item.kind] = (counts[item.kind] || 0) + 1;
  }
  return { counts, classifications, parseErrors };
}

/**
 * Aggregate inventory with real matchProbe counts (same classifier).
 */
export function inspectCredentialVaultCounts(database) {
  const users = database
    .prepare(`SELECT id, role, password_hash, disabled_at FROM users`)
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

  const classified = classifyCredentialVaults(database);
  let clientPlaintext = 0;
  let staffPlaintext = 0;
  let clientOrphan = 0;
  let staffOrphan = 0;
  let clientMatch = 0;
  let clientMismatch = 0;
  let staffMatch = 0;
  let staffMismatch = 0;
  let clientBlocker = 0;
  let staffBlocker = 0;
  let clientHashMissingWithPlain = 0;
  let staffHashMissingWithPlain = 0;
  let clientEntries = 0;
  let staffEntries = 0;

  for (const item of classified.classifications) {
    if (item.kind === "parse_error") continue;
    if (item.vault === "client") clientEntries += 1;
    if (item.vault === "staff") staffEntries += 1;
    if (item.kind === "D_orphan") {
      if (item.vault === "client") clientOrphan += 1;
      else staffOrphan += 1;
    }
    if (item.kind === "A_match") {
      if (item.vault === "client") clientMatch += 1;
      else staffMatch += 1;
    }
    if (item.kind === "B_mismatch") {
      if (item.vault === "client") clientMismatch += 1;
      else staffMismatch += 1;
    }
    if (item.kind === "C_blocker") {
      if (item.vault === "client") {
        clientBlocker += 1;
        clientHashMissingWithPlain += 1;
      } else {
        staffBlocker += 1;
        staffHashMissingWithPlain += 1;
      }
    }
    if (item.hasSecret) {
      if (item.vault === "client") clientPlaintext += 1;
      else staffPlaintext += 1;
    }
  }

  // Orphans with secrets also count toward plaintext
  // (already included via hasSecret on D_orphan)

  return {
    usersByRole: byRole,
    usableHash,
    missingOrMalformedHash,
    hashAlgorithm: meta,
    clientVaultEntries: clientEntries,
    staffVaultEntries: staffEntries,
    plaintext: {
      client: clientPlaintext,
      staff: staffPlaintext,
      total: clientPlaintext + staffPlaintext,
    },
    orphanVault: { client: clientOrphan, staff: staffOrphan },
    parseErrors: classified.parseErrors,
    matchProbe: {
      clientMatch,
      clientMismatch,
      staffMatch,
      staffMismatch,
      clientBlocker,
      staffBlocker,
      blocker: clientBlocker + staffBlocker + classified.counts.parse_error,
      orphan: clientOrphan + staffOrphan,
      clientHashMissingWithPlain,
      staffHashMissingWithPlain,
    },
    classification: classified.counts,
  };
}

/**
 * Walk vault map → entry totals + forbidden counts (for audit).
 */
export function walkVaultEntries(vault) {
  const entries = vault && typeof vault === "object" && !Array.isArray(vault) ? vault : {};
  let total = 0;
  let withPlaintextPassword = 0;
  for (const entry of Object.values(entries)) {
    total += 1;
    if (entryHasForbiddenCredential(entry)) withPlaintextPassword += 1;
  }
  return { total, withPlaintextPassword };
}

/**
 * Extract vaults from backup snapshot. Corrupt vault JSON → parseErrors (never clean).
 */
export function extractVaultsFromSnapshot(snapshot) {
  const found = {
    clientAccessVault: undefined,
    staffAccessVault: undefined,
    parseErrors: [],
  };
  if (!snapshot || typeof snapshot !== "object") return found;

  const consider = (key, raw) => {
    if (key !== CLIENT_VAULT_KEY && key !== STAFF_VAULT_KEY) return;
    if (raw == null) {
      found[key] = {};
      return;
    }
    const parsed = parseVaultJsonStrict(raw);
    if (!parsed.ok) {
      found.parseErrors.push(String(key));
      found[key] = null;
      return;
    }
    found[key] = parsed.value;
  };

  if (Array.isArray(snapshot.appState)) {
    for (const row of snapshot.appState) {
      consider(row?.key, row?.value_json ?? row?.valueJson ?? row?.value);
    }
  }
  if (snapshot.app_state && typeof snapshot.app_state === "object") {
    for (const [key, value] of Object.entries(snapshot.app_state)) {
      consider(key, value);
    }
  }
  if (snapshot.state && typeof snapshot.state === "object") {
    for (const [key, value] of Object.entries(snapshot.state)) {
      consider(key, value);
    }
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === CLIENT_VAULT_KEY || key === STAFF_VAULT_KEY) {
      consider(key, value);
    }
  }
  if (Array.isArray(snapshot.globalState)) {
    for (const row of snapshot.globalState) {
      consider(row?.key, row?.value_json ?? row?.value);
    }
  }
  return found;
}

export {
  extractPasswordCandidate as _extractPasswordCandidateForTests,
  cleanText as _cleanTextForTests,
};
