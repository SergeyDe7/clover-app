import {
  MONITOR_SCHEMA_VERSION,
  MONITOR_SEVERITIES,
  assertMonitorEnvironment,
  assertSignalId,
  normalizeMonitorScope,
} from "./contracts.js";

const FACT_KEYS = new Set([
  "count", "threshold", "ageMs", "durationMs", "ready", "sending", "stuck",
  "failures", "attempts", "suppressed", "malformed", "statusCode", "configured",
]);
const SUMMARY_RE = /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/u;

export function sanitizeAlertPayload(input = {}) {
  const signalId = assertSignalId(input.signalId || input.signal);
  const severity = MONITOR_SEVERITIES.includes(input.severity) ? input.severity : "unknown";
  const summaryCode = SUMMARY_RE.test(String(input.summaryCode || ""))
    ? String(input.summaryCode)
    : "MONITOR_SIGNAL_UNKNOWN";
  const facts = {};
  for (const [key, value] of Object.entries(input.facts || input.details || {}).slice(0, 16)) {
    if (!FACT_KEYS.has(key)) continue;
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      facts[key] = value;
    }
  }
  const environment = assertMonitorEnvironment(input.environment);
  const scope = normalizeMonitorScope(input.scope);
  const rawObservedAt = input.observedAt || input.collectedAt;
  const observedAt = Number.isFinite(Date.parse(rawObservedAt))
    ? new Date(rawObservedAt).toISOString()
    : new Date(0).toISOString();
  const output = {
    schemaVersion: MONITOR_SCHEMA_VERSION,
    environment,
    fingerprint: `${environment}:${signalId}:${scope}`,
    signalId,
    scope,
    severity,
    summaryCode,
    observedAt,
    facts,
  };
  if (typeof input.count === "number" && Number.isFinite(input.count)) output.count = input.count;
  for (const key of ["threshold", "windowSeconds", "measurement"]) {
    if (typeof input[key] === "number" && Number.isFinite(input[key])) output[key] = input[key];
  }
  for (const key of ["unit", "contour", "releaseSha"]) {
    if (typeof input[key] === "string" && /^[a-zA-Z0-9._:-]{1,64}$/u.test(input[key])) output[key] = input[key];
  }
  return output;
}
