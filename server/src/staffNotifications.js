/**
 * Feature-scoped manager notifications.
 * One projector for bootstrap and /api/admin/notifications*.
 *
 * Mapping is explicit. Unknown types are admin-only.
 */
import { ROLES, normalizeRole } from "./roles.js";
import { staffAllowsFeature } from "./staffPolicy.js";
import { publicManagerNotificationStatus } from "./managerNotifications.js";

/** type → STAFF_FEATURE_ID or "admin" (admin-only). */
export const NOTIFICATION_FEATURE_BY_TYPE = Object.freeze({
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
});

export function requiredFeatureForNotification(notification) {
  const type = String(notification?.type || "")
    .trim()
    .toLowerCase();
  if (!type) return "admin";
  return NOTIFICATION_FEATURE_BY_TYPE[type] || "admin";
}

export function staffCanSeeNotification(user, notification) {
  if (!notification || typeof notification !== "object") return false;
  const role = normalizeRole(user?.role);
  if (role === ROLES.ADMIN) return true;
  if (role !== ROLES.MANAGER) return false;
  const feature = requiredFeatureForNotification(notification);
  if (!feature || feature === "admin") return false;
  return staffAllowsFeature(user, feature);
}

export function projectManagerNotifications(user, notifications) {
  return (Array.isArray(notifications) ? notifications : []).filter((item) =>
    staffCanSeeNotification(user, item)
  );
}

export function projectManagerNotificationStatus(user, settings) {
  if (normalizeRole(user?.role) === ROLES.ADMIN) {
    return publicManagerNotificationStatus(settings);
  }
  const full = publicManagerNotificationStatus(settings);
  return {
    inApp: { enabled: Boolean(full.inApp?.enabled) },
    email: { configured: Boolean(full.email?.configured) },
    telegram: { configured: Boolean(full.telegram?.configured) },
    push: {
      enabled: full.push?.enabled !== false,
      configured: Boolean(full.push?.configured),
    },
  };
}

export function visibleUnreadNotificationIds(user, notifications) {
  return projectManagerNotifications(user, notifications)
    .filter((item) => !item.readAt)
    .map((item) => String(item.id || ""))
    .filter(Boolean);
}

export function staffRecipientsForNotification(users, notification) {
  return (Array.isArray(users) ? users : []).filter((user) =>
    staffCanSeeNotification(user, notification)
  );
}
