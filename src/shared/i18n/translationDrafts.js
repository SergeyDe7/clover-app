/** Per-entry, per-public-language translation editor drafts. */

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
  if (entry) return entry.value;
  return fallback;
}

export function setDraftValue(currentDrafts, entryId, language, value, dirty = true) {
  const next = { ...(currentDrafts || {}) };
  next[translationDraftKey(entryId, language)] = {
    value: String(value ?? ""),
    dirty: dirty === true,
  };
  return next;
}

export function markDraftClean(currentDrafts, entryId, language, value) {
  return setDraftValue(currentDrafts, entryId, language, value, false);
}

export function mergeWorkspaceDrafts(currentDrafts, rows, language) {
  const next = { ...(currentDrafts || {}) };
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const key = translationDraftKey(row.id, language);
    const serverValue = row.languages?.[language]?.value || "";
    const current = asDraftEntry(next[key]);
    if (current?.dirty) {
      next[key] = current;
      continue;
    }
    next[key] = { value: serverValue, dirty: false };
  }
  return next;
}

export function clearTranslationDraft(currentDrafts, entryId, language) {
  const next = { ...(currentDrafts || {}) };
  delete next[translationDraftKey(entryId, language)];
  return next;
}
