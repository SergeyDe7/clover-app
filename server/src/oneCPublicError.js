import { randomUUID } from "node:crypto";
import { logSafe } from "./safeLog.js";

export const ONEC_PUBLIC_MESSAGE = Object.freeze({
  ONEC_TIMEOUT: "1С не ответила за отведённое время.",
  ONEC_UPSTREAM_ERROR: "Не удалось выполнить обмен с 1С. Повторите попытку позже.",
  ONEC_WRITE_DISABLED: "Создание черновиков в рабочей 1С заблокировано.",
  ONEC_SECRET_MISSING: "Не настроено безопасное подключение к 1С.",
});

export const ONEC_POLICY_CODES = Object.freeze([
  "ONEC_TRUSTED_ORIGIN_REQUIRED",
  "ONEC_TRUSTED_ORIGIN_INVALID",
  "ONEC_INSECURE_HTTP_DISABLED",
  "ONEC_INSECURE_HTTP_TARGET_INVALID",
  "ONEC_ENDPOINT_PATH_INVALID",
  "ONEC_REDIRECT_DENIED",
  "UPSTREAM_RESPONSE_TOO_LARGE",
  "UPSTREAM_RESPONSE_TRUNCATED",
  "UPSTREAM_RESPONSE_ABORTED",
]);

export const OUTBOUND_ONEC_PUBLIC_CODES = Object.freeze([
  ...ONEC_POLICY_CODES,
  "ONEC_UPSTREAM_ERROR",
  "ONEC_TIMEOUT",
  "ONEC_WRITE_DISABLED",
  "ONEC_SECRET_MISSING",
]);

const POLICY_CODE_SET = new Set(ONEC_POLICY_CODES);
const OUTBOUND_CODE_SET = new Set(OUTBOUND_ONEC_PUBLIC_CODES);

export function isOutboundOneCPublicError(error) {
  return OUTBOUND_CODE_SET.has(String(error?.code || ""));
}

export function presentUnhandledOneCError(error) {
  if (!isOutboundOneCPublicError(error)) return null;
  return toPublicOneCError(error);
}

export function createOneCCorrelationId() {
  return randomUUID();
}

export function oneCUpstreamError(status) {
  const error = new Error(ONEC_PUBLIC_MESSAGE.ONEC_UPSTREAM_ERROR);
  error.code = "ONEC_UPSTREAM_ERROR";
  error.status = Number(status) || 0;
  error.correlationId = createOneCCorrelationId();
  return error;
}

export function oneCCodedError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  if (status) error.status = status;
  error.correlationId = createOneCCorrelationId();
  return error;
}

export function sanitizeThrownOneCError(error) {
  if (error?.code && POLICY_CODE_SET.has(error.code)) {
    delete error.payload;
    if (!error.correlationId) error.correlationId = createOneCCorrelationId();
    return error;
  }
  if (error?.name === "AbortError") {
    return oneCCodedError("ONEC_TIMEOUT", ONEC_PUBLIC_MESSAGE.ONEC_TIMEOUT);
  }
  if (error?.code === "ONEC_TIMEOUT") {
    error.message = ONEC_PUBLIC_MESSAGE.ONEC_TIMEOUT;
    delete error.payload;
    if (!error.correlationId) error.correlationId = createOneCCorrelationId();
    return error;
  }
  if (error?.code === "ONEC_WRITE_DISABLED") {
    error.message = ONEC_PUBLIC_MESSAGE.ONEC_WRITE_DISABLED;
    delete error.payload;
    if (!error.correlationId) error.correlationId = createOneCCorrelationId();
    return error;
  }
  if (error?.code === "ONEC_SECRET_MISSING") {
    error.message = ONEC_PUBLIC_MESSAGE.ONEC_SECRET_MISSING;
    delete error.payload;
    if (!error.correlationId) error.correlationId = createOneCCorrelationId();
    return error;
  }
  if (error?.code === "ONEC_UPSTREAM_ERROR") {
    error.message = ONEC_PUBLIC_MESSAGE.ONEC_UPSTREAM_ERROR;
    delete error.payload;
    if (!error.correlationId) error.correlationId = createOneCCorrelationId();
    return error;
  }
  const safe = oneCUpstreamError(error?.status);
  return safe;
}

export function oneCFailureHttpStatus(error) {
  const status = Number(error?.status);
  if (Number.isInteger(status) && status >= 400 && status < 600) return 502;
  return 400;
}

export function toPublicOneCError(error) {
  const safe = sanitizeThrownOneCError(error);
  return {
    httpStatus: oneCFailureHttpStatus(safe),
    body: {
      error: safe.message,
      code: safe.code,
      correlationId: safe.correlationId,
    },
    exchangeMessage: safe.message,
    auditDetails: {
      code: safe.code,
      correlationId: safe.correlationId,
      ...(Number.isInteger(safe.status) && safe.status > 0
        ? { upstreamStatus: safe.status }
        : {}),
    },
  };
}

export function logOneCFailure(event, error, extra = {}) {
  const presented = toPublicOneCError(error);
  logSafe("error", {
    event,
    code: presented.body.code,
    correlationId: presented.body.correlationId,
    upstreamStatus: presented.auditDetails.upstreamStatus,
    httpStatus: presented.httpStatus,
    ...extra,
  });
  return presented;
}
