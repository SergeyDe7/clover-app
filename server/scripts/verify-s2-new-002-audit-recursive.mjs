/**
 * Recursive credential audit fixtures — must exit non-zero if any forbidden field is missed.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  auditBackup,
  entryHasPlaintextSecret,
} from "./audit-backup-plaintext-passwords.mjs";
import {
  entryHasForbiddenCredential,
  isForbiddenCredentialKey,
  isSafeCredentialMetadataKey,
} from "../src/credentialVaultInspector.js";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");
const OPT_TMP = "/opt/clover/.tmp";
mkdirSync(OPT_TMP, { recursive: true });
const temp = mkdtempSync(path.join(OPT_TMP, "s2-audit-recursive-"));

function zipSnapshot(name, snapshot) {
  const zipPath = path.join(temp, name);
  const zip = new AdmZip();
  zip.addFile("snapshot.json", Buffer.from(JSON.stringify(snapshot), "utf8"));
  zip.writeZip(zipPath);
  return zipPath;
}

function mustDetect(label, entryOrSnapshotBuilder) {
  if (typeof entryOrSnapshotBuilder === "function") {
    const p = zipSnapshot(`${label}.zip`, entryOrSnapshotBuilder());
    const r = auditBackup(p);
    assert.equal(r.ok, true, `${label} ok`);
    assert.equal(r.hasPlaintextCredentials, true, `${label} detected=true`);
    console.log(`PASS audit.forbidden.${label} detected=true`);
    return;
  }
  assert.equal(entryHasForbiddenCredential(entryOrSnapshotBuilder), true, `${label} unit`);
  console.log(`PASS unit.forbidden.${label} detected=true`);
}

function mustNotDetect(label, snapshotBuilder) {
  const p = zipSnapshot(`${label}.zip`, snapshotBuilder());
  const r = auditBackup(p);
  assert.equal(r.ok, true, `${label} ok`);
  assert.equal(r.hasPlaintextCredentials, false, `${label} detected=false`);
  console.log(`PASS audit.safe.${label} detected=false`);
}

try {
  // Forbidden keys — top-level
  for (const field of [
    "password",
    "Password",
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
  ]) {
    mustDetect(field, () => ({
      appState: [
        {
          key: "clientAccessVault",
          value_json: JSON.stringify({
            c1: { login: "a@t.l", [field]: "SecretValue!1", companyName: "X" },
          }),
        },
      ],
      users: [],
    }));
  }

  // Nested object / array / mixed case
  mustDetect("nested_object", () => ({
    appState: [
      {
        key: "clientAccessVault",
        value_json: JSON.stringify({
          c1: { login: "a@t.l", nested: { password: "Secret!1" }, companyName: "X" },
        }),
      },
    ],
    users: [],
  }));
  mustDetect("nested_array", () => ({
    appState: [
      {
        key: "staffAccessVault",
        value_json: JSON.stringify({
          s1: { login: "m@t.l", items: [{ token: "tok" }], role: "manager" },
        }),
      },
    ],
    users: [],
  }));
  mustDetect("mixed_case_Password", () => ({
    appState: [
      {
        key: "clientAccessVault",
        value_json: JSON.stringify({
          c1: { login: "a@t.l", PaSsWoRd: "Secret!1", companyName: "X" },
        }),
      },
    ],
    users: [],
  }));

  // Corrupt vaults
  {
    const p = zipSnapshot("corrupt-client.zip", {
      appState: [{ key: "clientAccessVault", value_json: "{broken" }],
      users: [],
    });
    const r = auditBackup(p);
    assert.equal(r.ok, false);
    assert.equal(r.hasPlaintextCredentials, null);
    assert.match(String(r.error || ""), /clientAccessVault/);
    console.log("PASS audit.corrupt.client ok=false has=null");
  }
  {
    const p = zipSnapshot("corrupt-staff.zip", {
      appState: [{ key: "staffAccessVault", value_json: "{broken" }],
      users: [],
    });
    const r = auditBackup(p);
    assert.equal(r.ok, false);
    assert.equal(r.hasPlaintextCredentials, null);
    assert.match(String(r.error || ""), /staffAccessVault/);
    console.log("PASS audit.corrupt.staff ok=false has=null");
  }

  // Safe metadata — must NOT detect
  mustNotDetect("safe_metadata", () => ({
    appState: [
      {
        key: "clientAccessVault",
        value_json: JSON.stringify({
          c1: {
            login: "a@t.l",
            companyName: "Safe",
            hasPassword: true,
            passwordUpdatedAt: "2026-01-01T00:00:00.000Z",
            passwordChangedAt: "2026-01-01T00:00:00.000Z",
            resetRequired: false,
          },
        }),
      },
    ],
    users: [{ id: "u1", password_hash: "$2a$04$abcdefghijklmnopqrstuv" }],
  }));

  mustNotDetect("users_password_hash_outside_vault", () => ({
    appState: [],
    users: [
      { id: "u1", email: "a@t.l", password_hash: "$2a$04$abcdefghijklmnopqrstuv" },
      { id: "u2", email: "b@t.l", password_hash: "$2a$04$bcdefghijklmnopqrstuvw" },
    ],
  }));

  assert.equal(isSafeCredentialMetadataKey("hasPassword"), true);
  assert.equal(isForbiddenCredentialKey("hasPassword"), false);
  assert.equal(isForbiddenCredentialKey("Password"), true);
  assert.equal(entryHasPlaintextSecret({ nested: { secret: "x" } }), true);

  // Artificial violation must fail the harness (self-check of assert path)
  let selfFail = false;
  try {
    assert.equal(entryHasForbiddenCredential({ login: "x" }), true);
  } catch {
    selfFail = true;
  }
  assert.ok(selfFail, "assert path must fail when forbidden missing");

  console.log("verify-s2-new-002-audit-recursive: ok");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
