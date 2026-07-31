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
