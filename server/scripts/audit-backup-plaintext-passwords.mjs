/**
 * Read-only audit of Clover backup archives for plaintext credential storage.
 * Prints only path/identifier + aggregate counts/fingerprint — never values.
 *
 * Uses shared credentialVaultInspector (same rules as migration).
 *
 * Usage:
 *   node scripts/audit-backup-plaintext-passwords.mjs /path/to/backup.zip [more...]
 *   node scripts/audit-backup-plaintext-passwords.mjs --dir /path/to/backups
 *
 * Does not modify, delete, or encrypt backups.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  CLIENT_VAULT_KEY,
  STAFF_VAULT_KEY,
  SAFE_CREDENTIAL_METADATA_KEYS,
  entryHasForbiddenCredential,
  extractVaultsFromSnapshot,
  isForbiddenCredentialKey,
  parseVaultJsonStrict,
  walkVaultEntries,
} from "../src/credentialVaultInspector.js";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

/** Explicit list for tests/docs; detection uses isForbiddenCredentialKey. */
const VAULT_SECRET_FIELDS = [
  "password",
  "plainPassword",
  "plaintextPassword",
  "temporaryPassword",
  "currentPassword",
  "newPassword",
  "passphrase",
  "credential",
  "secret",
  "token",
  "passwordHash",
  "password_hash",
];

function fingerprintFile(filePath) {
  const st = statSync(filePath);
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return {
    size: st.size,
    mtimeMs: st.mtimeMs,
    sha256: hash.digest("hex"),
  };
}

function parseJsonStrict(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

function entryHasPlaintextSecret(entry) {
  return entryHasForbiddenCredential(entry);
}

function countUsers(snapshot) {
  const users = snapshot?.users || snapshot?.Users || [];
  if (!Array.isArray(users)) return { total: 0, withHashField: 0 };
  let withHashField = 0;
  for (const user of users) {
    if (user && Object.prototype.hasOwnProperty.call(user, "password_hash")) {
      withHashField += 1;
    }
  }
  return { total: users.length, withHashField };
}

function failReport(abs, fp, error) {
  return {
    path: abs,
    fingerprint: fp,
    ok: false,
    error,
    plaintextPasswordEntries: null,
    hasPlaintextCredentials: null,
    vaultEntries: null,
    users: null,
  };
}

function auditBackup(filePath) {
  const abs = path.resolve(filePath);
  let fp;
  try {
    fp = fingerprintFile(abs);
  } catch {
    return failReport(abs, null, "unreadable");
  }

  let zip;
  try {
    zip = new AdmZip(abs);
  } catch {
    return failReport(abs, fp, "unreadable/corrupt archive");
  }

  let entry;
  try {
    entry = zip.getEntry("snapshot.json");
  } catch {
    return failReport(abs, fp, "unreadable/corrupt archive");
  }

  if (!entry) {
    return failReport(abs, fp, "snapshot.json missing");
  }

  let rawText = "";
  try {
    rawText = entry.getData().toString("utf8");
  } catch {
    return failReport(abs, fp, "snapshot.json unreadable");
  }

  const snapshotParsed = parseJsonStrict(rawText);
  if (!snapshotParsed.ok || !snapshotParsed.value || typeof snapshotParsed.value !== "object") {
    return failReport(abs, fp, "snapshot.json invalid");
  }
  const snapshot = snapshotParsed.value;

  const vaults = extractVaultsFromSnapshot(snapshot);
  if (vaults.parseErrors.length > 0) {
    return failReport(
      abs,
      fp,
      `vault json invalid: ${[...new Set(vaults.parseErrors)].join(",")}`
    );
  }

  const client =
    vaults.clientAccessVault === undefined
      ? { total: 0, withPlaintextPassword: 0 }
      : walkVaultEntries(vaults.clientAccessVault || {});
  const staff =
    vaults.staffAccessVault === undefined
      ? { total: 0, withPlaintextPassword: 0 }
      : walkVaultEntries(vaults.staffAccessVault || {});
  const users = countUsers(snapshot);
  const plaintextPasswordEntries = client.withPlaintextPassword + staff.withPlaintextPassword;
  return {
    path: abs,
    fingerprint: fp,
    ok: true,
    users,
    vaultEntries: {
      client: client.total,
      staff: staff.total,
    },
    plaintextPasswordEntries: {
      client: client.withPlaintextPassword,
      staff: staff.withPlaintextPassword,
      total: plaintextPasswordEntries,
    },
    hasPlaintextCredentials: plaintextPasswordEntries > 0,
  };
}

function collectTargets(argv) {
  const args = [...argv];
  const files = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dir") {
      const dir = args[++i];
      if (!dir || !existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        if (name.endsWith(".zip")) files.push(path.join(dir, name));
      }
    } else if (!arg.startsWith("-")) {
      files.push(arg);
    }
  }
  return files;
}

function main() {
  const files = collectTargets(process.argv.slice(2));
  if (!files.length) {
    console.error(
      "Usage: node scripts/audit-backup-plaintext-passwords.mjs <backup.zip>|--dir <dir>"
    );
    process.exit(2);
  }
  const reports = files.map((file) => {
    try {
      return auditBackup(file);
    } catch {
      return failReport(path.resolve(file), null, "unreadable/corrupt archive");
    }
  });
  const withPlaintext = reports.filter((r) => r.hasPlaintextCredentials === true);
  const failed = reports.filter((r) => r.ok === false);
  const clean = reports.filter((r) => r.ok && r.hasPlaintextCredentials === false);
  console.log(
    JSON.stringify(
      {
        scanned: reports.length,
        withPlaintextCredentials: withPlaintext.length,
        clean: clean.length,
        failed: failed.length,
        backups: reports.map((r) => ({
          path: r.path,
          sha256: r.fingerprint?.sha256,
          size: r.fingerprint?.size,
          ok: r.ok,
          hasPlaintextCredentials: r.hasPlaintextCredentials,
          plaintextPasswordEntries: r.plaintextPasswordEntries,
          vaultEntries: r.vaultEntries,
          users: r.users,
          error: r.error || null,
        })),
      },
      null,
      2
    )
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export {
  auditBackup,
  extractVaultsFromSnapshot,
  walkVaultEntries,
  entryHasPlaintextSecret,
  isForbiddenCredentialKey,
  parseVaultJsonStrict,
  VAULT_SECRET_FIELDS,
  SAFE_CREDENTIAL_METADATA_KEYS,
  CLIENT_VAULT_KEY,
  STAFF_VAULT_KEY,
};
