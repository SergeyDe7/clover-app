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

export function mergeWorkspaceDrafts(currentDrafts, rows, language) {
  const next = { ...(currentDrafts || {}) };
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const key = translationDraftKey(row.id, language);
    if (!Object.hasOwn(next, key)) {
      next[key] = row.languages?.[language]?.value || "";
    }
  }
  return next;
}

export function clearTranslationDraft(currentDrafts, entryId, language) {
  const next = { ...(currentDrafts || {}) };
  delete next[translationDraftKey(entryId, language)];
  return next;
}
