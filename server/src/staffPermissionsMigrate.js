/**
 * One-shot server-owned upgrade of legacy manager permissions_json='{}'
 * (missing tabs) to an explicit STAFF_FEATURE_IDS list.
 *
 * Production: do not run unless CLOVER_MIGRATE_LEGACY_STAFF_PERMISSIONS=true
 * after an admin backup. Isolated tests call apply:true directly.
 */
import {
  STAFF_FEATURE_IDS,
  explicitFullStaffPermissionsPayload,
  inspectStaffPermissions,
  isLegacyImplicitManagerPermissions,
} from "./roles.js";

function classifyRow(row) {
  const inspected = inspectStaffPermissions(row.permissions_json);
  if (inspected.malformed) return "malformed";
  if (String(row.role) === "admin") return "admin";
  if (String(row.role) !== "manager") return "other";
  if (isLegacyImplicitManagerPermissions(row.permissions_json)) return "legacyEmpty";
  const tabs = Array.isArray(inspected.source.tabs) ? inspected.source.tabs : [];
  const unique = new Set(
    tabs.map((item) => String(item || "").trim()).filter((id) => STAFF_FEATURE_IDS.includes(id))
  );
  if (unique.size === STAFF_FEATURE_IDS.length) return "explicitFull";
  return "explicitRestricted";
}

export function inspectLegacyManagerPermissionCounts(database) {
  const rows = database
    .prepare(
      `SELECT role, permissions_json FROM users WHERE role IN ('manager', 'admin')`
    )
    .all();
  const counts = {
    managers: 0,
    admins: 0,
    legacyEmpty: 0,
    explicitFull: 0,
    explicitRestricted: 0,
    malformed: 0,
  };
  for (const row of rows) {
    const kind = classifyRow(row);
    if (kind === "admin") counts.admins += 1;
    if (String(row.role) === "manager") counts.managers += 1;
    if (kind === "legacyEmpty") counts.legacyEmpty += 1;
    if (kind === "explicitFull") counts.explicitFull += 1;
    if (kind === "explicitRestricted") counts.explicitRestricted += 1;
    if (kind === "malformed") counts.malformed += 1;
  }
  return counts;
}

export function migrateLegacyManagerPermissions(
  database,
  { apply = false, _testBeforeCommit } = {}
) {
  const before = inspectLegacyManagerPermissionCounts(database);
  if (!apply) {
    return { applied: false, upgraded: 0, before, after: before };
  }
  const payload = JSON.stringify(explicitFullStaffPermissionsPayload(false));
  database.exec("BEGIN IMMEDIATE");
  try {
    const rows = database
      .prepare(`SELECT id, role, permissions_json FROM users WHERE role = 'manager'`)
      .all();
    let upgraded = 0;
    const update = database.prepare(
      `UPDATE users SET permissions_json = ? WHERE id = ? AND role = 'manager'`
    );
    for (const row of rows) {
      if (!isLegacyImplicitManagerPermissions(row.permissions_json)) continue;
      update.run(payload, row.id);
      upgraded += 1;
    }
    if (typeof _testBeforeCommit === "function") {
      _testBeforeCommit({ upgraded });
    }
    database.exec("COMMIT");
    const after = inspectLegacyManagerPermissionCounts(database);
    return { applied: true, upgraded, before, after };
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    const after = inspectLegacyManagerPermissionCounts(database);
    const wrapped = new Error("legacy staff permissions migration rolled back");
    wrapped.cause = error;
    wrapped.upgraded = 0;
    wrapped.applied = false;
    wrapped.before = before;
    wrapped.after = after;
    throw wrapped;
  }
}

export function maybeApplyLegacyManagerPermissionsMigration(database) {
  const enabled = String(process.env.CLOVER_MIGRATE_LEGACY_STAFF_PERMISSIONS || "")
    .trim()
    .toLowerCase();
  if (enabled !== "true" && enabled !== "1" && enabled !== "yes") {
    return { applied: false, skipped: "flag-off" };
  }
  return migrateLegacyManagerPermissions(database, { apply: true });
}
