/** Per-entry, per-public-language translation editor drafts. */

export function translationDraftKey(entryId, language) {
  return `${String(entryId || "")}\u0000${String(language || "")}`;
}

export function shouldApplyWorkspaceResponse({
  requestGeneration,
  currentGeneration,
  requestLanguage,
  currentLanguage,
}) {
  return (
    Number(requestGeneration) === Number(currentGeneration) &&
    String(requestLanguage || "") === String(currentLanguage || "")
  );
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
