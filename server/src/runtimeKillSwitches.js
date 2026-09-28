import { createHmac } from "node:crypto";

export const MONITOR_STATUS_ENV_NAMES = Object.freeze([
  "ONEC_WRITE_ENABLED", "ONEC_PROD_EXCHANGE_ENABLED", "ONEC_ALLOWED_DATABASES",
  "ALLOW_ADMIN_FULL_RESET", "CLOVER_PRODUCT_TRANSLATION_PROVIDER",
  "CLOVER_PAUSE_ONEC_CLAIMS", "CLOVER_PAUSE_REGISTRATION",
  "CLOVER_PAUSE_GUEST_ORDERS", "CLOVER_PAUSE_UPLOADS",
  "CLOVER_PAUSE_OUTBOUND_NOTIFICATIONS", "CLOVER_PAUSE_EMAIL",
  "CLOVER_PAUSE_TELEGRAM", "CLOVER_PAUSE_PUSH",
]);

export function runtimeStatusProjectionRevision(env = process.env, key = env?.CLOVER_MONITOR_STATUS_HMAC_KEY) {
  const secret = typeof key === "string" || Buffer.isBuffer(key) ? key : "";
  if (Buffer.byteLength(secret) < 32) throw new Error("MONITOR_STATUS_HMAC_KEY_REQUIRED");
  const projection = Object.fromEntries(MONITOR_STATUS_ENV_NAMES.map((name) => [
    name, String(env?.[name] ?? ""),
  ]));
  return createHmac("sha256", secret).update(JSON.stringify(projection)).digest("hex");
}

const SWITCH_ENV = Object.freeze({
  oneCClaims: "CLOVER_PAUSE_ONEC_CLAIMS",
  registration: "CLOVER_PAUSE_REGISTRATION",
  guestOrders: "CLOVER_PAUSE_GUEST_ORDERS",
  uploads: "CLOVER_PAUSE_UPLOADS",
  outboundNotifications: "CLOVER_PAUSE_OUTBOUND_NOTIFICATIONS",
  email: "CLOVER_PAUSE_EMAIL",
  telegram: "CLOVER_PAUSE_TELEGRAM",
  push: "CLOVER_PAUSE_PUSH",
});

function readSwitch(value) {
  if (value === undefined) {
    return { configured: false, valid: true, paused: false };
  }
  if (value === "true") {
    return { configured: true, valid: true, paused: true };
  }
  if (value === "false") {
    return { configured: true, valid: true, paused: false };
  }
  // An explicitly malformed value must never enable a hazardous operation.
  return { configured: true, valid: false, paused: true };
}

export function runtimeKillSwitchStatus(env = process.env) {
  return Object.fromEntries(
    Object.entries(SWITCH_ENV).map(([feature, envName]) => [
      feature,
      readSwitch(env?.[envName]),
    ])
  );
}

// Explicit aliases keep callers focused on the status-only projection. None of
// these functions expose the configured environment values.
export const getRuntimeKillSwitchStatus = runtimeKillSwitchStatus;
export const publicRuntimeKillSwitchStatus = runtimeKillSwitchStatus;

export function isRuntimeFeaturePaused(feature, env = process.env) {
  const envName = SWITCH_ENV[feature];
  if (!envName) throw new Error("UNKNOWN_RUNTIME_KILL_SWITCH");
  return readSwitch(env?.[envName]).paused;
}

export function isOutboundChannelPaused(channel, env = process.env) {
  return (
    isRuntimeFeaturePaused("outboundNotifications", env) ||
    isRuntimeFeaturePaused(channel, env)
  );
}

export function sendRuntimeFeaturePaused(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Retry-After", "60");
  return res.status(503).json({
    error: "Функция временно приостановлена.",
    code: "FEATURE_PAUSED",
  });
}

export function requireRuntimeFeature(feature) {
  // Validate the feature at setup time, not on the first request.
  if (!Object.hasOwn(SWITCH_ENV, feature)) {
    throw new Error("UNKNOWN_RUNTIME_KILL_SWITCH");
  }
  return function runtimeFeatureRequired(_req, res, next) {
    if (isRuntimeFeaturePaused(feature)) {
      return sendRuntimeFeaturePaused(res);
    }
    return next();
  };
}

export { SWITCH_ENV as RUNTIME_KILL_SWITCH_ENV };
