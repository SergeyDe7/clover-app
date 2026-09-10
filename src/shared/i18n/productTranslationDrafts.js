export function productDraftKey(language, field) {
  return `${String(language || "")}:${String(field || "")}`;
}

export function readProductFieldDraft(drafts, language, field, fallback = "") {
  const bag = drafts && typeof drafts === "object" ? drafts[language] : null;
  if (bag && Object.prototype.hasOwnProperty.call(bag, field)) {
    return bag[field];
  }
  return fallback;
}

export function writeProductFieldDraft(drafts, language, field, value) {
  const current = drafts && typeof drafts === "object" ? drafts : {};
  return {
    ...current,
    [language]: {
      ...(current[language] || {}),
      [field]: value,
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
