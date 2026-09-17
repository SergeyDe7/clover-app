/**
 * S2-NEW-002 migration contract on isolated SQLite.
 * Preview / apply / rollback / idempotency / C-blocker.
 * Counts only — no credential values.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  inspectPlaintextPasswordVaultCounts,
  migrateStripPlaintextPasswords,
  isStripPlaintextPasswordsFlagEnabled,
  STRIP_PLAINTEXT_PASSWORDS_FLAG,
} from "../src/passwordVaultMigrate.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(root, "server");
const OPT_TMP = "/opt/clover/.tmp";
mkdirSync(OPT_TMP, { recursive: true });
const require = createRequire(path.join(serverDir, "package.json"));
const { DatabaseSync } = require("node:sqlite");

function seedInto(databasePath, { withBlocker = false } = {}) {
  const seedPath = path.join(path.dirname(databasePath), "seed.mjs");
  writeFileSync(
    seedPath,
    `import { createUser, setGlobalState } from ${JSON.stringify(path.join(serverDir, "src/db.js"))};
import { hashPasswordSync } from ${JSON.stringify(path.join(serverDir, "src/passwordHash.js"))};
const goodHash = hashPasswordSync("GoodPass!1", 4);
const client = createUser({
  email: "s2n2-client@test.local",
  passwordHash: goodHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "Co", contactName: "C", phone: "", email: "s2n2-client@test.local" },
});
const manager = createUser({
  email: "s2n2-manager@test.local",
  passwordHash: goodHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
const mismatchUser = createUser({
  email: "s2n2-mismatch@test.local",
  passwordHash: goodHash,
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "Mis", contactName: "M", phone: "", email: "s2n2-mismatch@test.local" },
});
const clientVault = {
  [client.id]: {
    clientId: client.id,
    login: client.email,
    password: "GoodPass!1",
    companyName: "Co",
    updatedAt: new Date().toISOString(),
  },
  [mismatchUser.id]: {
    clientId: mismatchUser.id,
    login: mismatchUser.email,
    password: "OtherPass!9",
    companyName: "Mis",
    updatedAt: new Date().toISOString(),
  },
  "orphan-client-id": {
    clientId: "orphan-client-id",
    login: "orphan@test.local",
    password: "OrphanPass!1",
    companyName: "Orphan",
  },
};
${
  withBlocker
    ? `const blocked = createUser({
  email: "s2n2-blocked@test.local",
  passwordHash: "not-a-bcrypt-hash",
  role: "client",
  emailVerified: true,
  approvalStatus: "approved",
  profile: { companyName: "Blk", contactName: "B", phone: "", email: "s2n2-blocked@test.local" },
});
clientVault[blocked.id] = {
  clientId: blocked.id,
  login: blocked.email,
  password: "AnyPass!1",
  companyName: "Blk",
};`
    : ""
}
setGlobalState("clientAccessVault", clientVault);
setGlobalState("staffAccessVault", {
  [manager.id]: {
    userId: manager.id,
    login: manager.email,
    password: "GoodPass!1",
    role: "manager",
    updatedAt: new Date().toISOString(),
  },
});
console.log("SEEDED");
`
  );
  const run = spawnSync(process.execPath, [seedPath], {
    cwd: serverDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DB_PATH: databasePath,
      JWT_SECRET: "clover-s2-new-002-migrate-secret-32c!!",
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS: "",
      CLOVER_MIGRATE_LEGACY_STAFF_PERMISSIONS: "",
    },
  });
  if (run.status !== 0) {
    throw new Error(`seed failed: ${run.stderr || run.stdout}`);
  }
}

function seedAbcdFixture(databasePath) {
  const seedPath = path.join(path.dirname(databasePath), "seed-abcd.mjs");
  writeFileSync(
    seedPath,
    `import { createUser, setGlobalState } from ${JSON.stringify(path.join(serverDir, "src/db.js"))};
import { hashPasswordSync } from ${JSON.stringify(path.join(serverDir, "src/passwordHash.js"))};
const goodHash = hashPasswordSync("GoodPass!1", 4);
const clientA = createUser({
  email: "abcd-a@test.local", passwordHash: goodHash, role: "client",
  emailVerified: true, approvalStatus: "approved",
  profile: { companyName: "A", contactName: "A", phone: "", email: "abcd-a@test.local" },
});
const clientB = createUser({
  email: "abcd-b@test.local", passwordHash: goodHash, role: "client",
  emailVerified: true, approvalStatus: "approved",
  profile: { companyName: "B", contactName: "B", phone: "", email: "abcd-b@test.local" },
});
const clientC = createUser({
  email: "abcd-c@test.local", passwordHash: "not-a-bcrypt-hash", role: "client",
  emailVerified: true, approvalStatus: "approved",
  profile: { companyName: "C", contactName: "C", phone: "", email: "abcd-c@test.local" },
});
const managerA = createUser({
  email: "abcd-mgr@test.local", passwordHash: goodHash, role: "manager",
  emailVerified: true, approvalStatus: "approved",
});
setGlobalState("clientAccessVault", {
  [clientA.id]: { clientId: clientA.id, login: clientA.email, password: "GoodPass!1", companyName: "A" },
  [clientB.id]: { clientId: clientB.id, login: clientB.email, password: "OtherPass!9", companyName: "B" },
  [clientC.id]: { clientId: clientC.id, login: clientC.email, password: "AnyPass!1", companyName: "C" },
  "orphan-client-id": { clientId: "orphan-client-id", login: "orphan@test.local", password: "OrphanPass!1", companyName: "Orphan" },
});
setGlobalState("staffAccessVault", {
  [managerA.id]: { userId: managerA.id, login: managerA.email, password: "GoodPass!1", role: "manager" },
});
console.log("SEEDED_ABCD");
`
  );
  const run = spawnSync(process.execPath, [seedPath], {
    cwd: serverDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DB_PATH: databasePath,
      JWT_SECRET: "clover-s2-new-002-migrate-secret-32c!!",
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS: "",
      CLOVER_MIGRATE_LEGACY_STAFF_PERMISSIONS: "",
    },
  });
  if (run.status !== 0) throw new Error(`abcd seed failed: ${run.stderr || run.stdout}`);
}

function main() {
  // Exact A/B/C/D + real matchProbe (must not be stuck at 0/0/0/0)
  {
    const tempAbcd = mkdtempSync(path.join(OPT_TMP, "s2-new-002-abcd-"));
    const abcdPath = path.join(tempAbcd, "clover.sqlite");
    seedAbcdFixture(abcdPath);
    const abcdDb = new DatabaseSync(abcdPath);
    const probe = inspectPlaintextPasswordVaultCounts(abcdDb);
    assert.equal(probe.classification.A_match, 2, "match=2");
    assert.equal(probe.classification.B_mismatch, 1, "mismatch=1");
    assert.equal(probe.classification.C_blocker, 1, "blocker=1");
    assert.equal(probe.classification.D_orphan, 1, "orphan=1");
    assert.equal(probe.matchProbe.clientMatch + probe.matchProbe.staffMatch, 2);
    assert.equal(probe.matchProbe.clientMismatch + probe.matchProbe.staffMismatch, 1);
    assert.equal(probe.matchProbe.blocker, 1);
    assert.equal(probe.matchProbe.orphan, 1);
    assert.ok(
      !(
        probe.matchProbe.clientMatch === 0 &&
        probe.matchProbe.clientMismatch === 0 &&
        probe.matchProbe.staffMatch === 0 &&
        probe.matchProbe.staffMismatch === 0
      ),
      "matchProbe must not be stuck at 0/0/0/0"
    );
    console.log(
      "PASS matchProbe.A_B_C_D",
      JSON.stringify({
        classification: probe.classification,
        matchProbe: probe.matchProbe,
      })
    );
    abcdDb.close();
    rmSync(tempAbcd, { recursive: true, force: true });
  }

  const temp = mkdtempSync(path.join(OPT_TMP, "s2-new-002-migrate-"));
  const databasePath = path.join(temp, "clover.sqlite");
  seedInto(databasePath);

  const db = new DatabaseSync(databasePath);
  const before = inspectPlaintextPasswordVaultCounts(db);
  assert.ok(before.plaintext.total >= 3, "baseline plaintext expected");
  console.log(
    "PASS inventory.baseline",
    JSON.stringify({
      usersByRole: before.usersByRole,
      plaintext: before.plaintext,
      orphanVault: before.orphanVault,
      usableHash: before.usableHash,
      matchProbe: before.matchProbe,
    })
  );

  const preview = migrateStripPlaintextPasswords(db, { apply: false });
  assert.equal(preview.applied, false);
  assert.equal(preview.preview, true);
  const afterPreview = inspectPlaintextPasswordVaultCounts(db);
  assert.equal(afterPreview.plaintext.total, before.plaintext.total);
  console.log("PASS migration.preview", JSON.stringify(preview.classification));

  assert.equal(isStripPlaintextPasswordsFlagEnabled({ [STRIP_PLAINTEXT_PASSWORDS_FLAG]: "" }), false);
  assert.equal(
    isStripPlaintextPasswordsFlagEnabled({ [STRIP_PLAINTEXT_PASSWORDS_FLAG]: "true" }),
    true
  );

  let rolled = false;
  try {
    migrateStripPlaintextPasswords(db, {
      apply: true,
      _testBeforeCommit: () => {
        throw new Error("injected-failure");
      },
    });
  } catch {
    rolled = true;
  }
  assert.ok(rolled);
  assert.equal(inspectPlaintextPasswordVaultCounts(db).plaintext.total, before.plaintext.total);
  console.log("PASS migration.rollback");

  const applied = migrateStripPlaintextPasswords(db, { apply: true });
  assert.equal(applied.applied, true);
  assert.equal(applied.after.plaintext.total, 0);
  assert.ok(applied.stripped >= 3);
  assert.ok(applied.orphansRemoved >= 1);
  console.log(
    "PASS migration.apply",
    JSON.stringify({
      stripped: applied.stripped,
      orphansRemoved: applied.orphansRemoved,
      plaintextAfter: applied.after.plaintext.total,
    })
  );

  const again = migrateStripPlaintextPasswords(db, { apply: true });
  assert.equal(again.stripped, 0);
  assert.equal(again.after.plaintext.total, 0);
  console.log("PASS migration.idempotent");
  db.close();

  const temp2 = mkdtempSync(path.join(OPT_TMP, "s2-new-002-block-"));
  const blockPath = path.join(temp2, "clover.sqlite");
  seedInto(blockPath, { withBlocker: true });
  const blockDb = new DatabaseSync(blockPath);
  let blocked = false;
  try {
    migrateStripPlaintextPasswords(blockDb, { apply: true });
  } catch (error) {
    blocked = error?.code === "PASSWORD_VAULT_MIGRATE_BLOCKED";
  }
  assert.ok(blocked);
  assert.ok(inspectPlaintextPasswordVaultCounts(blockDb).plaintext.total >= 1);
  console.log("PASS migration.blocker");
  blockDb.close();

  // Separate DB: class C + unrelated upsert must preserve class-C plaintext
  const temp3 = mkdtempSync(path.join(OPT_TMP, "s2-new-002-silent-"));
  const silentPath = path.join(temp3, "clover.sqlite");
  seedInto(silentPath, { withBlocker: true });
  const silentSeed = path.join(temp3, "probe.mjs");
  writeFileSync(
    silentSeed,
    `import { getGlobalState } from ${JSON.stringify(path.join(serverDir, "src/db.js"))};
import { saveClientAccessCredentials } from ${JSON.stringify(path.join(serverDir, "src/clientAccessVault.js"))};
import { inspectPlaintextPasswordVaultCounts, migrateStripPlaintextPasswords } from ${JSON.stringify(
      path.join(serverDir, "src/passwordVaultMigrate.js")
    )};
import { db } from ${JSON.stringify(path.join(serverDir, "src/db.js"))};
const before = inspectPlaintextPasswordVaultCounts(db);
let migrateBlocked = false;
try {
  migrateStripPlaintextPasswords(db, { apply: true });
} catch (error) {
  migrateBlocked = error?.code === "PASSWORD_VAULT_MIGRATE_BLOCKED";
}
saveClientAccessCredentials(
  "unrelated-other-client",
  { login: "other@test.local", companyName: "Other" },
  { email: "admin@test.local" }
);
const after = inspectPlaintextPasswordVaultCounts(db);
const vault = getGlobalState("clientAccessVault", {});
const blockedEntry = Object.values(vault).find((e) => e && String(e.password || "").trim() && String(e.companyName) === "Blk");
console.log(JSON.stringify({
  migrateBlocked,
  plaintextBefore: before.plaintext.total,
  plaintextAfter: after.plaintext.total,
  classCPlaintextSurvived: Boolean(blockedEntry),
  unrelatedHasPasswordField: Boolean(String(vault["unrelated-other-client"]?.password || "").trim()),
}));
`
  );
  const silentRun = spawnSync(process.execPath, [silentSeed], {
    cwd: serverDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DB_PATH: silentPath,
      JWT_SECRET: "clover-s2-new-002-migrate-secret-32c!!",
      MANAGER_EMAIL: "",
      MANAGER_PASSWORD: "",
      CLOVER_MIGRATE_STRIP_PLAINTEXT_PASSWORDS: "",
      CLOVER_MIGRATE_LEGACY_STAFF_PERMISSIONS: "",
    },
  });
  assert.equal(silentRun.status, 0, silentRun.stderr || silentRun.stdout);
  const silentResult = JSON.parse(String(silentRun.stdout).trim().split("\n").pop());
  assert.equal(silentResult.migrateBlocked, true);
  assert.equal(silentResult.classCPlaintextSurvived, true);
  assert.equal(silentResult.unrelatedHasPasswordField, false);
  assert.ok(silentResult.plaintextAfter >= 1);
  console.log("PASS migration.no-silent-strip", JSON.stringify(silentResult));

  // Corrupt clientAccessVault JSON: preview blocker, apply throws, raw preserved
  for (const vaultKey of ["clientAccessVault", "staffAccessVault"]) {
    const tempCorrupt = mkdtempSync(path.join(OPT_TMP, `s2-new-002-corrupt-${vaultKey}-`));
    const corruptPath = path.join(tempCorrupt, "clover.sqlite");
    seedInto(corruptPath);
    const corruptDb = new DatabaseSync(corruptPath);
    const rawCorrupt = "{not-valid-json";
    corruptDb
      .prepare(
        `INSERT INTO app_state (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run(vaultKey, rawCorrupt, new Date().toISOString());

    const previewCorrupt = migrateStripPlaintextPasswords(corruptDb, { apply: false });
    assert.equal(previewCorrupt.applied, false);
    assert.ok(previewCorrupt.blockers >= 1, `${vaultKey} preview blockers`);
    assert.ok(
      previewCorrupt.parseErrors?.includes(vaultKey === "clientAccessVault" ? "client" : "staff"),
      `${vaultKey} parseErrors`
    );

    let applyBlocked = false;
    let applyCode = "";
    try {
      migrateStripPlaintextPasswords(corruptDb, { apply: true });
    } catch (error) {
      applyBlocked = error?.code === "PASSWORD_VAULT_MIGRATE_BLOCKED";
      applyCode = String(error?.code || "");
      assert.equal(
        /\{not-valid|SecretValue|GoodPass|raw json/i.test(String(error?.message || "")),
        false,
        "error must not contain secrets/raw json"
      );
      assert.equal(
        /password_hash\s*[:=]|value_json\s*[:=]/i.test(String(error?.message || "")),
        false,
        "error must not embed credential material"
      );
    }
    assert.ok(applyBlocked, `${vaultKey} apply blocked`);
    const preserved = corruptDb
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get(vaultKey)?.value_json;
    assert.equal(preserved, rawCorrupt, `${vaultKey} corrupt value preserved`);
    console.log(
      `PASS migration.corrupt-${vaultKey === "clientAccessVault" ? "client" : "staff"}`,
      JSON.stringify({ applyCode, blockers: previewCorrupt.blockers })
    );
    corruptDb.close();
    rmSync(tempCorrupt, { recursive: true, force: true });
  }

  rmSync(temp, { recursive: true, force: true });
  rmSync(temp2, { recursive: true, force: true });
  rmSync(temp3, { recursive: true, force: true });
  void pathToFileURL;
  console.log("verify-s2-new-002-migration: ok");
}

main();
