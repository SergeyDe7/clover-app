export const DOCUMENT_ACTIONS = Object.freeze(["view", "create", "edit", "uploadSigned", "cancel", "delete", "restore", "archiveImport"]);

// Grants are trusted server configuration, never body/query/JWT claims.
// Existing manager tabs are not automatically document grants.
export function documentCapabilities(actor, clientId, { assignedManagerId, grants = {}, clientCreate = false } = {}) {
  const deny = Object.fromEntries(DOCUMENT_ACTIONS.map((action) => [action, false]));
  if (!actor?.id || actor.disabled_at) return deny;
  if (actor.role === "admin") return Object.fromEntries(DOCUMENT_ACTIONS.map((action) => [action, true]));
  if (actor.role === "client") {
    if (String(actor.id) !== String(clientId)) return deny;
    return { ...deny, view: true, create: clientCreate === true, edit: clientCreate === true };
  }
  if (actor.role !== "manager" || !assignedManagerId || String(actor.id) !== String(assignedManagerId)) return deny;
  const actions = Object.hasOwn(grants, actor.id) ? grants[actor.id] : [];
  if (!Array.isArray(actions)) return deny;
  return Object.fromEntries(DOCUMENT_ACTIONS.map((action) => [action, !["delete", "restore", "archiveImport"].includes(action) && actions.includes(action)]));
}
