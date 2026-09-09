const PLACEHOLDER_TOKEN = /\{([a-zA-Z0-9_]+)\}/g;
const UNRESOLVED_PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/;

export function extractPlaceholderNames(text) {
  const names = new Set();
  if (typeof text !== "string") return names;
  PLACEHOLDER_TOKEN.lastIndex = 0;
  let match = PLACEHOLDER_TOKEN.exec(text);
  while (match) {
    names.add(match[1]);
    match = PLACEHOLDER_TOKEN.exec(text);
  }
  return names;
}

export function placeholderSetsEqual(left, right) {
  if (!(left instanceof Set) || !(right instanceof Set)) return false;
  if (left.size !== right.size) return false;
  for (const name of left) {
    if (!right.has(name)) return false;
  }
  return true;
}

export function placeholdersMatch(sourceRu, target) {
  return placeholderSetsEqual(extractPlaceholderNames(sourceRu), extractPlaceholderNames(target));
}

export function hasUnresolvedPlaceholder(value) {
  return typeof value === "string" && UNRESOLVED_PLACEHOLDER.test(value);
}

export function isNonEmptyText(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function isRegisteredUiKey(value, dictionary) {
  if (typeof value !== "string" || !dictionary || typeof dictionary !== "object") return false;
  const trimmed = value.trim();
  return Object.keys(dictionary).some((key) => trimmed === key);
}

export function isStage3SafeVisibleText(value, dictionary) {
  if (!isNonEmptyText(value)) return false;
  if (isRegisteredUiKey(value, dictionary)) return false;
  if (hasUnresolvedPlaceholder(value)) return false;
  return true;
}
