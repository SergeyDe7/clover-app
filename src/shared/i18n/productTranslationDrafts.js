/** Dirty-aware product translation field drafts (language + field). */

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
  if (entry) return entry.value;
  return fallback;
}

export function isProductFieldDraftDirty(drafts, language, field) {
  const bag = drafts && typeof drafts === "object" ? drafts[language] : null;
  if (!bag || !Object.prototype.hasOwnProperty.call(bag, field)) return false;
  return asDraftEntry(bag[field])?.dirty === true;
}

export function writeProductFieldDraft(drafts, language, field, value, dirty = true) {
  const current = drafts && typeof drafts === "object" ? drafts : {};
  return {
    ...current,
    [language]: {
      ...(current[language] || {}),
      [field]: {
        value: String(value ?? ""),
        dirty: dirty === true,
      },
    },
  };
}

export function clearProductFieldDraft(drafts, language, field) {
  const current = drafts && typeof drafts === "object" ? drafts : {};
  const bag = { ...(current[language] || {}) };
  delete bag[field];
  return { ...current, [language]: bag };
}

export function clearProductDrafts() {
  return {};
}
