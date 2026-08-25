/** Права менеджера: UI и парсер permissions. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStaffPermissions, staffHasFeature, STAFF_FEATURE_IDS } from "../src/roles.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const screen = readFileSync(path.join(root, "src/screens/manager/ManagerScreen.jsx"), "utf8");

assert.ok(screen.includes("staffHasFeature(authUser"), "ManagerScreen: нет проверки прав на вкладки");

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

const legacyFull = parseStaffPermissions({});
assert.equal(legacyFull.fullAccess, true);
assert.equal(
  staffHasFeature({ role: "manager", permissions: legacyFull }, "orders"),
  true
);

assert.equal(STAFF_FEATURE_IDS.includes("storefront"), false);

console.log("verify-manager-permissions: ok");
