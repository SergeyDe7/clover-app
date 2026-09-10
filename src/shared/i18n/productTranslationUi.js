/** Pure helpers for ProductTranslationEditor load/UI decisions. */

export function shouldStartProductTranslationFetch({ hasWorkspace, inFlight, force = false }) {
  if (inFlight) return false;
  if (force) return true;
  if (hasWorkspace) return false;
  return true;
}

/** Return-to-AUTO only when a MANUAL override actually exists. */
export function canShowReturnToAuto(cell) {
  if (!cell || typeof cell !== "object") return false;
  return String(cell.manualValue || "").trim() !== "";
}

/**
 * Field row presentation after expand.
 * Avoids false notApplicable while workspace is still loading.
 */
export function productTranslationFieldPresentation({ loading, workspaceLoaded, sourceRu }) {
  if (loading || !workspaceLoaded) return { kind: "loading" };
  if (!String(sourceRu || "").trim()) return { kind: "notApplicable" };
  return { kind: "ready" };
}
