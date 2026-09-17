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

export function emptyStaffPermissionsPayload() {
  return { tabs: [], manageStaff: false };
}

export function explicitFullStaffPermissionsPayload(manageStaff = false) {
  return {
    tabs: [...STAFF_FEATURE_IDS],
    manageStaff: manageStaff === true,
  };
}

export function hasExplicitFullStaffTabs(tabs) {
  if (!Array.isArray(tabs) || tabs.length !== STAFF_FEATURE_IDS.length) return false;
  const unique = new Set(tabs.map((item) => String(item || "").trim()));
  return STAFF_FEATURE_IDS.every((id) => unique.has(id));
}

export function inspectStaffPermissions(raw) {
  if (raw == null || raw === "") {
    return { malformed: false, source: {}, missing: true };
  }
  if (typeof raw === "object") {
    if (Array.isArray(raw)) return { malformed: true, source: {}, missing: false };
    return { malformed: false, source: raw, missing: false };
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed == null) {
      return { malformed: true, source: {}, missing: false };
    }
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return { malformed: true, source: {}, missing: false };
    }
    return { malformed: false, source: parsed, missing: false };
  } catch {
    return { malformed: true, source: {}, missing: false };
  }
}

function denyPermissions(malformed = false) {
  return {
    tabs: [],
    manageStaff: false,
    fullAccess: false,
    malformed,
  };
}

export function parseStaffPermissions(raw) {
  const inspected = inspectStaffPermissions(raw);
  if (inspected.malformed) return denyPermissions(true);

  const source = inspected.source;
  if (
    Object.prototype.hasOwnProperty.call(source, "tabs") &&
    source.tabs != null &&
    !Array.isArray(source.tabs)
  ) {
    return denyPermissions(true);
  }

  const tabs = Array.isArray(source.tabs)
    ? [...new Set(source.tabs.map((item) => String(item || "").trim()).filter((id) => STAFF_FEATURE_IDS.includes(id)))]
    : [];

  return {
    tabs,
    manageStaff: source.manageStaff === true,
    fullAccess: hasExplicitFullStaffTabs(tabs),
    malformed: false,
  };
}

export function staffPermissionsPayload(input = {}) {
  const parsed = parseStaffPermissions(input);
  if (parsed.malformed) return emptyStaffPermissionsPayload();
  if (input?.fullAccess === true) {
    return explicitFullStaffPermissionsPayload(input.manageStaff === true);
  }
  return {
    tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
    manageStaff: parsed.manageStaff === true,
  };
}

export function staffHasFeature(userOrPermissions, featureId) {
  const role = userOrPermissions?.role;
  const id = String(featureId || "").trim();
  if (id === "storefront" || id === "languages") {
    return normalizeRole(role) === ROLES.ADMIN;
  }
  if (id !== "more" && !STAFF_FEATURE_IDS.includes(id)) {
    return false;
  }
  if (normalizeRole(role) === ROLES.ADMIN) return true;
  const permissions = parseStaffPermissions(
    userOrPermissions?.permissions ?? userOrPermissions?.permissions_json ?? userOrPermissions
  );
  if (permissions.malformed) return false;
  const tabs = Array.isArray(permissions.tabs) ? permissions.tabs : [];
  if (id === "more") {
    return MORE_FEATURE_IDS.some((item) => tabs.includes(item));
  }
  return tabs.includes(id);
}

export function staffHasAnyFeature(user) {
  if (normalizeRole(user?.role) === ROLES.ADMIN) return true;
  const permissions = parseStaffPermissions(user?.permissions ?? user?.permissions_json);
  if (permissions.malformed) return false;
  return Array.isArray(permissions.tabs) && permissions.tabs.length > 0;
}

export function staffCanManageStaff(user) {
  if (!isStaffRole(user?.role)) return false;
  if (normalizeRole(user.role) === ROLES.ADMIN) return true;
  const permissions = parseStaffPermissions(user.permissions ?? user.permissions_json);
  if (permissions.malformed) return false;
  return permissions.manageStaff === true;
}

/** Legacy implicit-full document: `{}` / missing tabs, not malformed. */
export function isLegacyImplicitManagerPermissions(raw) {
  const inspected = inspectStaffPermissions(raw);
  if (inspected.malformed) return false;
  if (inspected.missing) return true;
  const source = inspected.source;
  if (
    Object.prototype.hasOwnProperty.call(source, "tabs") &&
    source.tabs != null &&
    !Array.isArray(source.tabs)
  ) {
    return false;
  }
  return !Array.isArray(source.tabs);
}
