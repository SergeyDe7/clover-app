/**
 * Read-only audit of Clover backup archives for plaintext credential storage.
 * Prints only path/identifier + aggregate counts/fingerprint — never values.
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

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

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

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function walkVaultEntries(vault) {
  const entries = vault && typeof vault === "object" && !Array.isArray(vault) ? vault : {};
  let total = 0;
  let withPlaintextPassword = 0;
  for (const entry of Object.values(entries)) {
    total += 1;
    if (entry && typeof entry === "object") {
      const password = String(entry.password ?? "").trim();
      if (password) withPlaintextPassword += 1;
    }
  }
  return { total, withPlaintextPassword };
}

function extractVaultsFromSnapshot(snapshot) {
  const found = { clientAccessVault: null, staffAccessVault: null };
  if (!snapshot || typeof snapshot !== "object") return found;

  const consider = (key, value) => {
    if (key === "clientAccessVault") found.clientAccessVault = value;
    if (key === "staffAccessVault") found.staffAccessVault = value;
  };

  if (Array.isArray(snapshot.appState)) {
    for (const row of snapshot.appState) {
      const key = row?.key;
      const raw = row?.value_json ?? row?.valueJson ?? row?.value;
      const parsed = typeof raw === "string" ? parseJsonSafe(raw) : raw;
      consider(key, parsed);
    }
  }

  if (snapshot.app_state && typeof snapshot.app_state === "object") {
    for (const [key, value] of Object.entries(snapshot.app_state)) {
      consider(key, typeof value === "string" ? parseJsonSafe(value) : value);
    }
  }

  if (snapshot.state && typeof snapshot.state === "object") {
    for (const [key, value] of Object.entries(snapshot.state)) {
      consider(key, value);
    }
  }

  // Common Clover export shape: { appState: { key: value } } flattened via exportDatabaseSnapshot
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === "clientAccessVault" || key === "staffAccessVault") {
      consider(key, value);
    }
  }

  if (Array.isArray(snapshot.globalState)) {
    for (const row of snapshot.globalState) {
      const key = row?.key;
      const raw = row?.value_json ?? row?.value;
      consider(key, typeof raw === "string" ? parseJsonSafe(raw) : raw);
    }
  }

  return found;
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

function auditBackup(filePath) {
  const abs = path.resolve(filePath);
  let fp;
  try {
    fp = fingerprintFile(abs);
  } catch (error) {
    return {
      path: abs,
      fingerprint: null,
      ok: false,
      error: "unreadable",
      plaintextPasswordEntries: null,
      hasPlaintextCredentials: null,
    };
  }

  let zip;
  try {
    zip = new AdmZip(abs);
  } catch {
    return {
      path: abs,
      fingerprint: fp,
      ok: false,
      error: "unreadable/corrupt archive",
      plaintextPasswordEntries: null,
      hasPlaintextCredentials: null,
    };
  }

  let entry;
  try {
    entry = zip.getEntry("snapshot.json");
  } catch {
    return {
      path: abs,
      fingerprint: fp,
      ok: false,
      error: "unreadable/corrupt archive",
      plaintextPasswordEntries: null,
      hasPlaintextCredentials: null,
    };
  }

  if (!entry) {
    return {
      path: abs,
      fingerprint: fp,
      ok: false,
      error: "snapshot.json missing",
      plaintextPasswordEntries: null,
      hasPlaintextCredentials: null,
    };
  }

  let rawText = "";
  try {
    rawText = entry.getData().toString("utf8");
  } catch {
    return {
      path: abs,
      fingerprint: fp,
      ok: false,
      error: "snapshot.json unreadable",
      plaintextPasswordEntries: null,
      hasPlaintextCredentials: null,
    };
  }

  const snapshot = parseJsonSafe(rawText);
  if (!snapshot || typeof snapshot !== "object") {
    return {
      path: abs,
      fingerprint: fp,
      ok: false,
      error: "snapshot.json invalid",
      plaintextPasswordEntries: null,
      hasPlaintextCredentials: null,
    };
  }

  const vaults = extractVaultsFromSnapshot(snapshot);
  const client = walkVaultEntries(vaults.clientAccessVault);
  const staff = walkVaultEntries(vaults.staffAccessVault);
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
    } catch (error) {
      return {
        path: path.resolve(file),
        fingerprint: null,
        ok: false,
        error: "unreadable/corrupt archive",
        plaintextPasswordEntries: null,
        hasPlaintextCredentials: null,
      };
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
  // Exit 0 always for audit tool (informational). Callers decide cutover.
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { auditBackup, extractVaultsFromSnapshot, walkVaultEntries };
