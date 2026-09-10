/** Pure helpers for ManagerLanguages / ProductTranslationEditor action gates. */

export function nextLoadMoreOffset({ acceptedOffset, limit, hasMore, inFlight }) {
  if (inFlight) return null;
  if (!hasMore) return null;
  const base = Number(acceptedOffset);
  const page = Number(limit);
  const safeBase = Number.isFinite(base) && base >= 0 ? Math.floor(base) : 0;
  const safeLimit = Number.isFinite(page) && page > 0 ? Math.floor(page) : 100;
  return safeBase + safeLimit;
}

export function shouldClearLoadingForRequest({ requestGeneration, currentGeneration }) {
  return Number(requestGeneration) === Number(currentGeneration);
}

export function canSaveGenericTranslation({ dirty, value }) {
  return dirty === true && String(value ?? "").trim() !== "";
}

/** Align with resetTranslationToAuto(): clean AUTO matching seed is a no-op. */
export function canShowGenericReset(cell) {
  if (!cell || typeof cell !== "object") return true;
  if (cell.state === "AUTO" && !cell.stale) return false;
  return true;
}

export function canSaveProductTranslationField({ dirty, value }) {
  return dirty === true && String(value ?? "").trim() !== "";
}

/** Overview refresh failure must not fabricate fake settings when a good snapshot exists. */
export function shouldReplaceOverviewOnFailure({ everLoadedSuccessfully }) {
  return everLoadedSuccessfully !== true;
}

export function shouldDisableTargetLanguageSelect({ view, glossaryEditing }) {
  return view === "glossary" && glossaryEditing === true;
}

/** Mutation follow-up GET only when still mounted on the same product. */
export function shouldContinueProductMutation({
  mounted,
  operationProductId,
  currentProductId,
}) {
  if (mounted !== true) return false;
  return String(operationProductId || "") === String(currentProductId || "");
}
