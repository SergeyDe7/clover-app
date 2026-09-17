/** Isolated legacy manager permissions_json='{}' upgrade. No production DB. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const OPT_TMP = "/opt/clover/.tmp";
mkdirSync(OPT_TMP, { recursive: true });
const temp = mkdtempSync(path.join(OPT_TMP, "s2-pkg2-legacy-perm-"));
const databasePath = path.join(temp, "clover.sqlite");
process.env.DB_PATH = databasePath;
process.env.JWT_SECRET = "legacy-perm-migrate-secret-32chars!!";
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
process.env.CLOVER_MIGRATE_LEGACY_STAFF_PERMISSIONS = "";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(serverDir, "package.json"));
const bcrypt = require("bcryptjs");
const { DatabaseSync } = await import("node:sqlite");
const { createUser, setStaffPermissions } = await import(
  pathToFileURL(path.join(serverDir, "src/db.js")).href
);
const { STAFF_FEATURE_IDS, explicitFullStaffPermissionsPayload } = await import(
  pathToFileURL(path.join(serverDir, "src/roles.js")).href
);
const {
  inspectLegacyManagerPermissionCounts,
  migrateLegacyManagerPermissions,
} = await import(pathToFileURL(path.join(serverDir, "src/staffPermissionsMigrate.js")).href);

const passwordHash = bcrypt.hashSync("LegacyPerm!1", 4);
const admin = createUser({
  email: "legacy-admin@test.local",
  passwordHash,
  role: "admin",
  emailVerified: true,
  approvalStatus: "approved",
});
const empty = createUser({
  email: "legacy-empty@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
const restricted = createUser({
  email: "legacy-restricted@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
setStaffPermissions(restricted.id, { tabs: ["orders"], manageStaff: false });
const malformed = createUser({
  email: "legacy-malformed@test.local",
  passwordHash,
  role: "manager",
  emailVerified: true,
  approvalStatus: "approved",
});
const db = new DatabaseSync(databasePath);
db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run("NOT_JSON{", malformed.id);
db.prepare("UPDATE users SET permissions_json = ? WHERE id = ?").run("{}", empty.id);

const before = inspectLegacyManagerPermissionCounts(db);
assert.equal(before.legacyEmpty, 1, JSON.stringify(before));
assert.equal(before.malformed, 1);
assert.equal(before.explicitRestricted, 1);
assert.equal(before.admins, 1);
assert.ok(!JSON.stringify(before).includes("@test.local"), "counts must not include PII");

const dry = migrateLegacyManagerPermissions(db, { apply: false });
assert.equal(dry.applied, false);
assert.equal(dry.upgraded, 0);
assert.equal(
  db.prepare("SELECT permissions_json FROM users WHERE id = ?").get(empty.id).permissions_json,
  "{}"
);

const snapshot = db.prepare("SELECT id, role, permissions_json FROM users ORDER BY id").all();
let injected;
try {
  migrateLegacyManagerPermissions(db, {
    apply: true,
    _testBeforeCommit: () => {
      throw new Error("injected-failure");
    },
  });
} catch (error) {
  injected = error;
}
assert.ok(injected, "injected failure must throw");
assert.equal(injected.upgraded, 0);
assert.equal(injected.applied, false);
assert.match(String(injected.message || ""), /rolled back/i);
assert.equal(injected.cause?.message, "injected-failure");
assert.deepEqual(
  db.prepare("SELECT id, role, permissions_json FROM users ORDER BY id").all(),
  snapshot
);
assert.equal(inspectLegacyManagerPermissionCounts(db).legacyEmpty, 1);

const first = migrateLegacyManagerPermissions(db, { apply: true });
assert.equal(first.applied, true);
assert.equal(first.upgraded, 1);
const emptyAfter = JSON.parse(
  db.prepare("SELECT permissions_json FROM users WHERE id = ?").get(empty.id).permissions_json
);
assert.deepEqual(emptyAfter.tabs, [...STAFF_FEATURE_IDS]);
assert.equal(emptyAfter.manageStaff, false);

const malformedAfter = db
  .prepare("SELECT permissions_json FROM users WHERE id = ?")
  .get(malformed.id).permissions_json;
assert.equal(malformedAfter, "NOT_JSON{");

const restrictedAfter = JSON.parse(
  db.prepare("SELECT permissions_json FROM users WHERE id = ?").get(restricted.id).permissions_json
);
assert.deepEqual(restrictedAfter.tabs, ["orders"]);

const adminAfter = db
  .prepare("SELECT permissions_json FROM users WHERE id = ?")
  .get(admin.id).permissions_json;
assert.equal(adminAfter, "{}");

const second = migrateLegacyManagerPermissions(db, { apply: true });
assert.equal(second.upgraded, 0);
assert.equal(second.after.legacyEmpty, 0);
assert.deepEqual(
  JSON.parse(
    db.prepare("SELECT permissions_json FROM users WHERE id = ?").get(empty.id).permissions_json
  ),
  explicitFullStaffPermissionsPayload(false)
);

const fingerprint = createHash("sha256").update(JSON.stringify(second.after)).digest("hex");
assert.equal(fingerprint.length, 64);
db.close();
console.log("verify-legacy-staff-permissions-migrate: ok", second.after);
