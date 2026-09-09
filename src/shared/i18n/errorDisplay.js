import { hasCatalogKey } from "./uiCatalog.js";
import { MISSING_TRANSLATION_FALLBACK_RU, uiText } from "./translationRuntime.js";

export const DEFAULT_ERROR_DISPLAY_KEY = "shared.error.requestFailed";

/** Finite transport codes. Locale-independent technical authority. */
export const TRANSPORT_ERROR_CODES = Object.freeze([
  "TIMEOUT",
  "NETWORK",
  "API_UNAVAILABLE",
  "REQUEST_TOO_LARGE",
  "INVALID_RESPONSE",
  "NO_RESPONSE",
  "REQUEST_FAILED",
]);

/** Finite domain codes thrown by non-React helpers. Locale-independent. */
export const DOMAIN_ERROR_CODES = Object.freeze([
  "PHOTO_PREPARE_FAILED",
  "PHOTO_UNRECOGNIZED",
  "PHOTO_REQUIRED",
  "PHOTO_TYPE",
  "PHOTO_MAX_SIZE",
  "PHOTO_STILL_TOO_LARGE",
  "PHOTO_READ_FAILED",
  "PHOTO_ATTACH_FAILED",
  "PHOTO_CUSTOM_MAX_SIZE",
  "EXCEL_NO_NAME_ROWS",
]);

export const TRANSPORT_ERROR_KEY_BY_CODE = Object.freeze({
  TIMEOUT: "shared.error.timeout",
  NETWORK: "shared.error.network",
  API_UNAVAILABLE: "shared.error.apiUnavailable",
  REQUEST_TOO_LARGE: "shared.error.requestTooLarge",
  INVALID_RESPONSE: "shared.error.invalidResponse",
  NO_RESPONSE: "shared.error.noResponse",
  REQUEST_FAILED: "shared.error.requestFailed",
});

export const DOMAIN_ERROR_KEY_BY_CODE = Object.freeze({
  PHOTO_PREPARE_FAILED: "shared.error.photoPrepareFailed",
  PHOTO_UNRECOGNIZED: "shared.error.photoUnrecognized",
  PHOTO_REQUIRED: "shared.error.photoRequired",
  PHOTO_TYPE: "shared.error.photoType",
  PHOTO_MAX_SIZE: "shared.error.photoMaxSize",
  PHOTO_STILL_TOO_LARGE: "shared.error.photoStillTooLarge",
  PHOTO_READ_FAILED: "shared.error.photoReadFailed",
  PHOTO_ATTACH_FAILED: "shared.error.photoAttachFailed",
  PHOTO_CUSTOM_MAX_SIZE: "shared.maximumPhotoSizeIs12Mb",
  EXCEL_NO_NAME_ROWS: "shared.error.excelNoNameRows",
});

export const ERROR_DISPLAY_KEY_BY_CODE = Object.freeze({
  ...TRANSPORT_ERROR_KEY_BY_CODE,
  ...DOMAIN_ERROR_KEY_BY_CODE,
});

export const PUSH_RESTORE_HINT_KEY = "shared.push.restoreHint";

const HTTP_TRANSPORT_CODE = Object.freeze({
  413: "REQUEST_TOO_LARGE",
  502: "API_UNAVAILABLE",
  503: "API_UNAVAILABLE",
  504: "API_UNAVAILABLE",
});

export function isKnownErrorCode(code) {
  return Object.hasOwn(ERROR_DISPLAY_KEY_BY_CODE, String(code || "").trim());
}

export function displayKeyForErrorCode(code) {
  const key = ERROR_DISPLAY_KEY_BY_CODE[String(code || "").trim()];
  return key && hasCatalogKey(key) ? key : "";
}

export function resolveTransportCode({ status, payloadCode, aborted } = {}) {
  if (aborted === true) return "TIMEOUT";
  const fromPayload = String(payloadCode || "").trim();
  if (fromPayload && isKnownErrorCode(fromPayload)) return fromPayload;
  const fromStatus = HTTP_TRANSPORT_CODE[Number(status)];
  if (fromStatus) return fromStatus;
  return "REQUEST_FAILED";
}

function safeKey(key) {
  const candidate = typeof key === "string" ? key.trim() : "";
  if (candidate && hasCatalogKey(candidate)) return candidate;
  if (hasCatalogKey(DEFAULT_ERROR_DISPLAY_KEY)) return DEFAULT_ERROR_DISPLAY_KEY;
  return "";
}

/**
 * Display-only projection. Never use the return value as program logic.
 * Known codes map to catalog keys. Unknown raw server text is not shown.
 */
export function errorDisplayMessage(error, t, fallbackKey = DEFAULT_ERROR_DISPLAY_KEY) {
  const code = String(error?.code || "").trim();
  const mapped = displayKeyForErrorCode(code);
  const key = mapped || safeKey(fallbackKey);
  if (key) return uiText(t, key);
  return uiText(t, DEFAULT_ERROR_DISPLAY_KEY) || MISSING_TRANSLATION_FALLBACK_RU;
}

/**
 * Non-React helper constructor. Message is a SAFE_RU_FALLBACK only.
 * Callers must branch on `error.code`, never on `error.message`.
 */
export function codedError(code, ruFallback) {
  const error = new Error(typeof ruFallback === "string" && ruFallback.trim() ? ruFallback : code);
  error.code = String(code || "REQUEST_FAILED");
  return error;
}
