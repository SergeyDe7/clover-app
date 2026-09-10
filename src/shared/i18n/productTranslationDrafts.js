/** Dirty-aware product translation field drafts (language + field).
 * Store ONLY dirty user edits.
 */

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

export function productDraftKey(language, field) {
  return `${String(language || "")}:${String(field || "")}`;
}

export function readProductFieldDraft(drafts, language, field, fallback = "") {
  const bag = drafts && typeof drafts === "object" ? drafts[language] : null;
  if (!bag || !Object.prototype.hasOwnProperty.call(bag, field)) {
    return fallback;
  }
  const entry = asDraftEntry(bag[field]);
  if (entry?.dirty) return entry.value;
  return fallback;
}

export function isProductFieldDraftDirty(drafts, language, field) {
  const bag = drafts && typeof drafts === "object" ? drafts[language] : null;
  if (!bag || !Object.prototype.hasOwnProperty.call(bag, field)) return false;
  return asDraftEntry(bag[field])?.dirty === true;
}

export function writeProductFieldDraft(drafts, language, field, value, dirty = true) {
  const current = drafts && typeof drafts === "object" ? drafts : {};
  const bag = { ...(current[language] || {}) };
  if (dirty !== true) {
    delete bag[field];
    return { ...current, [language]: bag };
  }
  bag[field] = {
    value: String(value ?? ""),
    dirty: true,
  };
  return {
    ...current,
    [language]: bag,
  };
}

export function clearProductFieldDraft(drafts, language, field) {
  const current = drafts && typeof drafts === "object" ? drafts : {};
  const bag = { ...(current[language] || {}) };
  delete bag[field];
  return { ...current, [language]: bag };
}

/**
 * After SAVE/RESET: clear only if draft still matches submitted snapshot.
 */
export function clearProductFieldDraftIfUnchanged(drafts, language, field, submittedValue) {
  const bag = drafts && typeof drafts === "object" ? drafts[language] : null;
  if (!bag || !Object.prototype.hasOwnProperty.call(bag, field)) {
    return drafts && typeof drafts === "object" ? drafts : {};
  }
  const entry = asDraftEntry(bag[field]);
  if (!entry) return drafts || {};
  if (String(entry.value ?? "") !== String(submittedValue ?? "")) {
    return drafts || {};
  }
  return clearProductFieldDraft(drafts, language, field);
}

export function clearProductDrafts() {
  return {};
}

export function countProductDraftEntries(drafts) {
  let count = 0;
  const root = drafts && typeof drafts === "object" ? drafts : {};
  for (const language of Object.keys(root)) {
    const bag = root[language];
    if (!bag || typeof bag !== "object") continue;
    for (const field of Object.keys(bag)) {
      if (asDraftEntry(bag[field])?.dirty) count += 1;
    }
  }
  return count;
}
