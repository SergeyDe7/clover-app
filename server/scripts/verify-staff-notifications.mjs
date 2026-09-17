/** Feature-scoped notification mapping. Isolated SQLite. No production DB. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OPT_TMP = "/opt/clover/.tmp";
mkdirSync(OPT_TMP, { recursive: true });
const temp = mkdtempSync(path.join(OPT_TMP, "s2-staff-notifications-"));
process.env.DB_PATH = path.join(temp, "clover.sqlite");
process.env.JWT_SECRET = "staff-notify-unit-secret-32chars!!";
process.env.MANAGER_EMAIL = "";
process.env.MANAGER_PASSWORD = "";
process.env.CLOVER_SKIP_NOTIFICATION_DELIVERY = "true";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  NOTIFICATION_FEATURE_BY_TYPE,
  requiredFeatureForNotification,
  staffCanSeeNotification,
  projectManagerNotifications,
  projectManagerNotificationStatus,
  staffRecipientsForNotification,
} = await import(pathToFileURL(path.join(serverDir, "src/staffNotifications.js")).href);

const expected = {
  client_registration: "clients",
  client_access: "clients",
  order_new: "orders",
  new_order: "orders",
  order_changed: "orders",
  order_deleted: "orders",
  custom_item: "orders",
  reconciliation_request: "acts",
  onec_error: "exchange",
  product: "products",
  catalog: "products",
  test: "admin",
  backup: "admin",
  staff: "admin",
  security: "admin",
  settings: "admin",
};
assert.deepEqual({ ...NOTIFICATION_FEATURE_BY_TYPE }, expected);

for (const [type, feature] of Object.entries(expected)) {
  assert.equal(requiredFeatureForNotification({ type }), feature, type);
}
assert.equal(requiredFeatureForNotification({ type: "mystery_type" }), "admin");
assert.equal(requiredFeatureForNotification({ type: "" }), "admin");
assert.equal(requiredFeatureForNotification(null), "admin");

const ordersOnly = { role: "manager", permissions: { tabs: ["orders"], manageStaff: false } };
const clientsOnly = { role: "manager", permissions: { tabs: ["clients"], manageStaff: false } };
const admin = { role: "admin" };
const client = { role: "client" };

assert.equal(staffCanSeeNotification(ordersOnly, { type: "client_registration" }), false);
assert.equal(staffCanSeeNotification(ordersOnly, { type: "new_order" }), true);
assert.equal(staffCanSeeNotification(clientsOnly, { type: "client_registration" }), true);
assert.equal(staffCanSeeNotification(clientsOnly, { type: "new_order" }), false);
assert.equal(staffCanSeeNotification(ordersOnly, { type: "mystery_type" }), false);
assert.equal(staffCanSeeNotification(admin, { type: "mystery_type" }), true);
assert.equal(staffCanSeeNotification(client, { type: "new_order" }), false);

const mixed = [
  { id: "1", type: "client_registration", body: "VaultCo · ContactPII · +79990001122" },
  { id: "2", type: "new_order", body: "order-ok" },
  { id: "3", type: "mystery_type", body: "unknown-secret" },
];
assert.deepEqual(
  projectManagerNotifications(ordersOnly, mixed).map((item) => item.id),
  ["2"]
);
assert.deepEqual(
  projectManagerNotifications(clientsOnly, mixed).map((item) => item.id),
  ["1"]
);
assert.deepEqual(
  projectManagerNotifications(admin, mixed).map((item) => item.id),
  ["1", "2", "3"]
);

const leakSettings = {
  managerNotificationsEnabled: true,
  managerNotifyEmail: true,
  managerNotifyTelegram: true,
  managerNotificationEmail: "leak-recipient@example.com",
  managerTelegramChatId: "1234567890123",
};
const managerStatus = projectManagerNotificationStatus(ordersOnly, leakSettings);
assert.equal(managerStatus.email.recipient, undefined);
assert.equal(managerStatus.telegram.chatId, undefined);
assert.equal(managerStatus.email.smtpConfigured, undefined);
assert.equal(managerStatus.telegram.tokenConfigured, undefined);
assert.equal(typeof managerStatus.email.configured, "boolean");
assert.ok(!JSON.stringify(managerStatus).includes("leak-recipient@example.com"));
assert.ok(!JSON.stringify(managerStatus).includes("1234567890123"));

const adminStatus = projectManagerNotificationStatus(admin, leakSettings);
assert.equal(adminStatus.email.recipient, "leak-recipient@example.com");

const recipients = staffRecipientsForNotification(
  [ordersOnly, clientsOnly, admin, client],
  { type: "client_registration" }
);
assert.deepEqual(
  recipients.map((user) => user.role + (user.permissions?.tabs || []).join(",")),
  ["managerclients", "admin"]
);

console.log("verify-staff-notifications: ok", expected);
