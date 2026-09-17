/** Права менеджера: UI и парсер permissions. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyStaffPermissionsPayload,
  explicitFullStaffPermissionsPayload,
  parseStaffPermissions,
  staffHasFeature,
  staffPermissionsPayload,
  STAFF_FEATURE_IDS,
} from "../src/roles.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const screen = readFileSync(path.join(root, "src/screens/manager/ManagerScreen.jsx"), "utf8");
const helpers = readFileSync(path.join(root, "src/shared/appHelpers.js"), "utf8");
const adminPanel = readFileSync(path.join(root, "src/components/AdminRolePanel.jsx"), "utf8");

assert.ok(screen.includes("staffHasFeature(authUser"), "ManagerScreen: нет проверки прав на вкладки");
assert.ok(
  helpers.includes("Array.isArray(permissions.tabs) ? permissions.tabs : []"),
  "UI не должен трактовать отсутствие tabs как полный доступ"
);
assert.ok(
  adminPanel.includes("tabs: [...STAFF_FEATURE_IDS]"),
  "UI полного доступа должен отправлять явный список STAFF_FEATURE_IDS"
);
assert.doesNotMatch(
  adminPanel,
  /tabs: draftPermissions\.tabs\.length \? draftPermissions\.tabs : \[\.\.\.STAFF_FEATURE_IDS\]/,
  "отсутствие выбора не должно записывать полный список вкладок"
);

const restricted = parseStaffPermissions({ tabs: ["clients", "settings"] });
assert.equal(restricted.fullAccess, false);
assert.deepEqual(restricted.tabs, ["clients", "settings"]);

const manager = {
  role: "manager",
  permissions: { tabs: ["clients", "settings"], manageStaff: false },
};

assert.equal(staffHasFeature(manager, "clients"), true);
assert.equal(staffHasFeature(manager, "orders"), false);
assert.equal(staffHasFeature(manager, "more"), true);
assert.equal(staffHasFeature(manager, "backup"), false);
assert.equal(staffHasFeature({ role: "admin" }, "storefront"), true);
assert.equal(staffHasFeature({ role: "manager" }, "storefront"), false);
assert.equal(staffHasFeature({ role: "admin" }, "languages"), true);
assert.equal(staffHasFeature({ role: "manager" }, "languages"), false);
assert.equal(
  staffHasFeature({ role: "manager", permissions: { fullAccess: true } }, "languages"),
  false
);
assert.equal(STAFF_FEATURE_IDS.includes("languages"), false);

const empty = parseStaffPermissions({});
assert.equal(empty.fullAccess, false);
assert.deepEqual(empty.tabs, []);
assert.equal(empty.manageStaff, false);
assert.equal(
  staffHasFeature({ role: "manager", permissions: empty }, "orders"),
  false
);
assert.equal(parseStaffPermissions(null).fullAccess, false);
assert.equal(parseStaffPermissions("").fullAccess, false);
assert.equal(staffHasFeature({ role: "manager" }, "orders"), false);

const explicitFull = parseStaffPermissions(explicitFullStaffPermissionsPayload(false));
assert.equal(explicitFull.fullAccess, true);
assert.equal(
  staffHasFeature({ role: "manager", permissions: explicitFull }, "orders"),
  true
);

assert.deepEqual(emptyStaffPermissionsPayload(), { tabs: [], manageStaff: false });
assert.deepEqual(staffPermissionsPayload({ fullAccess: true, manageStaff: true }).tabs, [
  ...STAFF_FEATURE_IDS,
]);
assert.equal(staffPermissionsPayload({ fullAccess: true, manageStaff: true }).manageStaff, true);
assert.deepEqual(staffPermissionsPayload({ tabs: [] }).tabs, []);

assert.equal(STAFF_FEATURE_IDS.includes("storefront"), false);

const malformed = parseStaffPermissions("{not json");
assert.equal(malformed.fullAccess, false);
assert.equal(malformed.malformed, true);
assert.equal(
  staffHasFeature({ role: "manager", permissions: "{not json" }, "orders"),
  false
);
assert.equal(
  staffHasFeature({ role: "manager", permissions: { tabs: "orders" } }, "orders"),
  false
);
assert.equal(
  staffHasFeature({ role: "manager", permissions: { fullAccess: true } }, "not-a-feature"),
  false
);
assert.equal(
  staffHasFeature({ role: "manager", permissions: { fullAccess: true } }, "orders"),
  false
);

console.log("verify-manager-permissions: ok");
