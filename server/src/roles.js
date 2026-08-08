/**
 * Роли Clover: client / manager / admin.
 * admin имеет права менеджера (иерархия), отдельный UI admin пока не обязателен.
 */

export const ROLES = Object.freeze({
  CLIENT: "client",
  MANAGER: "manager",
  ADMIN: "admin",
});

export const KNOWN_ROLES = Object.freeze([
  ROLES.CLIENT,
  ROLES.MANAGER,
  ROLES.ADMIN,
]);

/** Разделы кабинета менеджера, которыми можно ограничить доступ. */
export const STAFF_FEATURE_IDS = Object.freeze([
  "orders",
  "clients",
  "products",
  "exchange",
  "acts",
  "access",
  "settings",
  "backup",
  "audit",
]);

export const MORE_FEATURE_IDS = Object.freeze([
  "access",
  "settings",
  "backup",
  "audit",
]);

export function normalizeRole(value) {
  const role = String(value ?? "").trim().toLowerCase();
  return KNOWN_ROLES.includes(role) ? role : "";
}

/** Менеджерский контур: manager или admin. */
export function isStaffRole(role) {
  const normalized = normalizeRole(role);
  return normalized === ROLES.MANAGER || normalized === ROLES.ADMIN;
}

export function isClientRole(role) {
  return normalizeRole(role) === ROLES.CLIENT;
}

export function hasRole(userRole, allowedRoles) {
  const role = normalizeRole(userRole);
  if (!role) return false;
  const allowed = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
    .map(normalizeRole)
    .filter(Boolean);
  if (allowed.includes(role)) return true;
  // admin закрывает любой staff-маршрут, где требуется manager
  if (role === ROLES.ADMIN && allowed.includes(ROLES.MANAGER)) return true;
  return false;
}

export function parseStaffPermissions(raw) {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw
      : (() => {
          try {
            const parsed = JSON.parse(String(raw || "{}"));
            return parsed && typeof parsed === "object" ? parsed : {};
          } catch {
            return {};
          }
        })();

  const hasTabs = Array.isArray(source.tabs);
  const tabs = hasTabs
    ? [...new Set(source.tabs.map((item) => String(item || "").trim()).filter((id) => STAFF_FEATURE_IDS.includes(id)))]
    : null;

  return {
    tabs,
    manageStaff: source.manageStaff !== false,
    fullAccess: !hasTabs,
  };
}

export function staffPermissionsPayload(input = {}) {
  const parsed = parseStaffPermissions(input);
  if (parsed.fullAccess) {
    return {
      manageStaff: parsed.manageStaff !== false,
    };
  }
  return {
    tabs: parsed.tabs?.length ? parsed.tabs : [...STAFF_FEATURE_IDS],
    manageStaff: parsed.manageStaff !== false,
  };
}

export function staffHasFeature(userOrPermissions, featureId) {
  const role = userOrPermissions?.role;
  const id = String(featureId || "").trim();
  if (id === "storefront") {
    return normalizeRole(role) === ROLES.ADMIN;
  }
  if (normalizeRole(role) === ROLES.ADMIN) return true;
  const permissions = parseStaffPermissions(
    userOrPermissions?.permissions ?? userOrPermissions?.permissions_json ?? userOrPermissions
  );
  if (permissions.fullAccess) return true;
  if (id === "more") {
    return MORE_FEATURE_IDS.some((item) => permissions.tabs.includes(item));
  }
  return permissions.tabs.includes(id);
}

export function staffCanManageStaff(user) {
  if (!isStaffRole(user?.role)) return false;
  if (normalizeRole(user.role) === ROLES.ADMIN) return true;
  const permissions = parseStaffPermissions(user.permissions ?? user.permissions_json);
  return permissions.manageStaff !== false;
}
