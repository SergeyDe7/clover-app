/** Per-entry, per-public-language translation editor drafts.
 * Store ONLY dirty user edits — never mirror clean server values.
 */

export function translationDraftKey(entryId, language) {
  return `${String(entryId || "")}\u0000${String(language || "")}`;
}

export function shouldApplyWorkspaceResponse({
  requestGeneration,
  currentGeneration,
  requestLanguage,
  currentLanguage,
  requestView,
  currentView,
  requestProductId,
  currentProductId,
  requestOffset,
  currentOffset,
}) {
  return (
    Number(requestGeneration) === Number(currentGeneration) &&
    String(requestLanguage || "") === String(currentLanguage || "") &&
    (requestView === undefined || String(requestView || "") === String(currentView || "")) &&
    (requestProductId === undefined || String(requestProductId || "") === String(currentProductId || "")) &&
    (requestOffset === undefined || Number(requestOffset) === Number(currentOffset))
  );
}

/**
 * offset=0 → replace.
 * offset>0 → merge by stable row `id` (update in place / append new; no duplicate ids).
 */
export function mergePagedWorkspaceRows(currentRows, nextRows, offset) {
  const incoming = Array.isArray(nextRows) ? nextRows : [];
  if (!(Number(offset) > 0)) {
    return incoming;
  }
  const merged = [];
  const indexById = new Map();
  for (const row of Array.isArray(currentRows) ? currentRows : []) {
    if (row && row.id != null && row.id !== "") {
      indexById.set(String(row.id), merged.length);
    }
    merged.push(row);
  }
  for (const row of incoming) {
    if (row && row.id != null && row.id !== "") {
      const id = String(row.id);
      if (indexById.has(id)) {
        merged[indexById.get(id)] = row;
        continue;
      }
      indexById.set(id, merged.length);
    }
    merged.push(row);
  }
  return merged;
}

/** Load More failure must not wipe already-loaded prefix rows. */
export function shouldClearWorkspaceOnLoadError(requestOffset) {
  return !(Number(requestOffset) > 0);
}

/** After membership-changing mutations, always reload from page 0. */
export function workspaceMutationReloadOffset() {
  return 0;
}

/** Safe paging state when starting/replacing page0 (or after page0 failure). */
export function emptyWorkspacePageMeta(limit = 100) {
  return { total: 0, hasMore: false, limit: Number(limit) || 100 };
}

function asDraftEntry(value) {
  if (value && typeof value === "object" && "value" in value) {
    return {
      value: String(value.value ?? ""),
      dirty: value.dirty === true,
    };
  }
  if (typeof value === "string") {
    return { value, dirty: true };
  }
  return null;
}

export function isTranslationDraftDirty(drafts, entryId, language) {
  const entry = asDraftEntry(drafts?.[translationDraftKey(entryId, language)]);
  return Boolean(entry?.dirty);
}

export function readDraftValue(drafts, entryId, language, fallback = "") {
  const entry = asDraftEntry(drafts?.[translationDraftKey(entryId, language)]);
  if (entry?.dirty) return entry.value;
  return fallback;
}

/** Only dirty user edits are stored. */
export function setDraftValue(currentDrafts, entryId, language, value, dirty = true) {
  const next = { ...(currentDrafts || {}) };
  const key = translationDraftKey(entryId, language);
  if (dirty !== true) {
    delete next[key];
    return next;
  }
  next[key] = {
    value: String(value ?? ""),
    dirty: true,
  };
  return next;
}

/** @deprecated use clearDraftIfUnchanged — clean mirrors are not stored. */
export function markDraftClean(currentDrafts, entryId, language) {
  return clearTranslationDraft(currentDrafts, entryId, language);
}

/**
 * Preserve dirty drafts only. Never materialize clean server mirrors.
 * Drops any leftover non-dirty entries for loaded rows.
 */
export function mergeWorkspaceDrafts(currentDrafts, rows, language) {
  const next = { ...(currentDrafts || {}) };
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const key = translationDraftKey(row.id, language);
    const current = asDraftEntry(next[key]);
    if (current?.dirty) {
      next[key] = current;
      continue;
    }
    delete next[key];
  }
  return next;
}

export function clearTranslationDraft(currentDrafts, entryId, language) {
  const next = { ...(currentDrafts || {}) };
  delete next[translationDraftKey(entryId, language)];
  return next;
}

/**
 * After SAVE/RESET: remove draft only if it still matches the submitted snapshot.
 * Newer edits (value changed while in-flight) stay dirty.
 */
export function clearDraftIfUnchanged(currentDrafts, entryId, language, submittedValue) {
  const key = translationDraftKey(entryId, language);
  const current = asDraftEntry(currentDrafts?.[key]);
  if (!current) return currentDrafts || {};
  if (String(current.value ?? "") !== String(submittedValue ?? "")) {
    return currentDrafts || {};
  }
  const next = { ...(currentDrafts || {}) };
  delete next[key];
  return next;
}

export function countTranslationDraftEntries(drafts) {
  return Object.keys(drafts && typeof drafts === "object" ? drafts : {}).length;
}

/** Simulate page0 failure ownership for tests. */
export function pageMetaAfterFailedPage0(previousMeta) {
  return emptyWorkspacePageMeta(previousMeta?.limit || 100);
}

export function canRequestLoadMore({ hasMore, acceptedOffset, inFlight, page0Failed }) {
  if (page0Failed) return false;
  if (inFlight) return false;
  if (!hasMore) return false;
  return Number(acceptedOffset) >= 0;
}
