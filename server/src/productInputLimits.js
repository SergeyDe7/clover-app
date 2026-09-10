/**
 * Finite Stage 4 string limits. Measured live max lengths (name 93,
 * details 451) plus a generous safety margin. Never persist multi-MB strings.
 */
export const PRODUCT_ID_MAX_CHARS = 128;
export const MANUAL_NAME_MAX_CHARS = 2000;
export const MANUAL_DETAIL_MAX_CHARS = 8000;
export const GLOSSARY_SOURCE_MAX_CHARS = 2000;
export const GLOSSARY_TARGET_MAX_CHARS = 2000;
export const GLOSSARY_CONTEXT_MAX_CHARS = 64;
export const STAGE4_QUERY_MAX_CHARS = 200;

export const PRODUCT_WORKSPACE_DEFAULT_LIMIT = 100;
export const PRODUCT_WORKSPACE_MAX_LIMIT = 200;

export function tooLargeError(code, message) {
  const error = new Error(message);
  error.status = code === "QUERY_TOO_LARGE" ? 400 : 413;
  error.code = code;
  return error;
}

export function assertBoundedString(value, max, { query = false, label = "value" } = {}) {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (text.length > max) {
    throw tooLargeError(
      query ? "QUERY_TOO_LARGE" : "VALUE_TOO_LARGE",
      `${label} exceeds ${max} characters.`
    );
  }
  return text;
}

export function parseWorkspaceLimit(raw, fallback = PRODUCT_WORKSPACE_DEFAULT_LIMIT) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(PRODUCT_WORKSPACE_MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export function parseWorkspaceOffset(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
