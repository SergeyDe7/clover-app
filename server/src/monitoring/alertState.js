import { chmodSync, lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { assertMonitorEnvironment } from "./contracts.js";
import { sanitizeAlertPayload } from "./sanitizeAlert.js";

const MAX_ENTRIES = 128;
const MAX_STATE_BYTES = 256 * 1024;
const MAX_COUNTER = 1_000_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const FINGERPRINT_RE = /^(test|production):[a-z0-9][a-z0-9._-]{0,79}:[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/u;
const SUMMARY_RE = /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/u;
const ENTRY_STATUSES = new Set(["pending", "open", "resolved"]);
const ENTRY_SEVERITIES = new Set(["warning", "critical", "unknown"]);

function emptyState(environment) {
  return { schemaVersion: 1, environment, entries: {}, notificationWindow: { startedAt: "", count: 0 } };
}

function invalidState(code) {
  throw new Error(code);
}

function normalizeCounter(value, code) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COUNTER) {
    invalidState(code);
  }
  return value;
}

function normalizeTimestamp(value, code, maxTimestampMs = Number.POSITIVE_INFINITY) {
  if (value === "" || value === undefined) return "";
  if (typeof value !== "string" || value.length > 40) invalidState(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > maxTimestampMs) invalidState(code);
  return new Date(parsed).toISOString();
}

function normalizeEntry(environment, key, entry, maxTimestampMs) {
  if (!FINGERPRINT_RE.test(key) || !key.startsWith(`${environment}:`)) {
    invalidState("alert_state_entry_key_invalid");
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    invalidState("alert_state_entry_invalid");
  }
  if (!ENTRY_STATUSES.has(entry.status) || !ENTRY_SEVERITIES.has(entry.severity)) {
    invalidState("alert_state_entry_status_invalid");
  }
  if (!SUMMARY_RE.test(String(entry.summaryCode || ""))) {
    invalidState("alert_state_entry_summary_invalid");
  }
  const firstSeenAt = normalizeTimestamp(entry.firstSeenAt, "alert_state_timestamp_invalid", maxTimestampMs);
  const lastSeenAt = normalizeTimestamp(entry.lastSeenAt, "alert_state_timestamp_invalid", maxTimestampMs);
  const lastNotifiedAt = normalizeTimestamp(entry.lastNotifiedAt, "alert_state_timestamp_invalid", maxTimestampMs);
  const resolvedAt = normalizeTimestamp(entry.resolvedAt, "alert_state_timestamp_invalid", maxTimestampMs);
  if (!firstSeenAt || !lastSeenAt || Date.parse(firstSeenAt) > Date.parse(lastSeenAt)) {
    invalidState("alert_state_timestamp_order_invalid");
  }
  if (entry.status === "resolved" && !resolvedAt) {
    invalidState("alert_state_resolved_timestamp_required");
  }
  return {
    status: entry.status,
    severity: entry.severity,
    summaryCode: entry.summaryCode,
    firstSeenAt,
    lastSeenAt,
    lastNotifiedAt,
    consecutiveFailures: normalizeCounter(entry.consecutiveFailures, "alert_state_counter_invalid"),
    consecutiveSuccesses: normalizeCounter(entry.consecutiveSuccesses, "alert_state_counter_invalid"),
    suppressed: normalizeCounter(entry.suppressed, "alert_state_counter_invalid"),
    ...(resolvedAt ? { resolvedAt } : {}),
  };
}

function normalizeInitial(environment, candidate, maxTimestampMs = Number.POSITIVE_INFINITY) {
  if (candidate === undefined || candidate === null) return emptyState(environment);
  if (typeof candidate !== "object" || Array.isArray(candidate)) invalidState("alert_state_invalid");
  let serialized;
  try {
    serialized = JSON.stringify(candidate);
  } catch {
    invalidState("alert_state_invalid");
  }
  if (Buffer.byteLength(serialized || "") > MAX_STATE_BYTES) invalidState("alert_state_too_large");
  if (candidate.schemaVersion !== 1 || candidate.environment !== environment) {
    invalidState("alert_state_identity_invalid");
  }
  if (!candidate.entries || typeof candidate.entries !== "object" || Array.isArray(candidate.entries)) {
    invalidState("alert_state_entries_invalid");
  }
  const entries = Object.entries(candidate.entries);
  if (entries.length > MAX_ENTRIES) invalidState("alert_state_entries_too_many");
  const state = emptyState(environment);
  for (const [key, entry] of entries) {
    state.entries[key] = normalizeEntry(environment, key, entry, maxTimestampMs);
  }
  if (!candidate.notificationWindow || typeof candidate.notificationWindow !== "object" || Array.isArray(candidate.notificationWindow)) {
    invalidState("alert_state_notification_window_invalid");
  }
  const startedAt = normalizeTimestamp(
    candidate.notificationWindow.startedAt,
    "alert_state_notification_window_invalid",
    maxTimestampMs
  );
  const count = normalizeCounter(candidate.notificationWindow.count, "alert_state_notification_count_invalid");
  if (!startedAt && count !== 0) invalidState("alert_state_notification_window_invalid");
  state.notificationWindow = { startedAt, count };
  return state;
}

function createEvent(type, alert, nowIso) {
  return { type, ...sanitizeAlertPayload({ ...alert, observedAt: nowIso }) };
}

export function createAlertStateMachine(options = {}) {
  const initial = options.initialState || options.initial;
  const env = assertMonitorEnvironment(options.environment || initial?.environment || "test");
  const maxPerRun = Number(options.maxAlertsPerWindow || options.maxPerRun || 10);
  const maxPerHour = Number(options.maxAlertsPerWindow || options.maxPerHour || 20);
  const configuredWindowMs = Math.max(1_000, Number(options.windowMs) || 3_600_000);
  const configuredCooldownMs = Math.max(1_000, Number(options.cooldownMs) || 3_600_000);
  const configuredRecoveryPasses = Math.max(1, Number(options.recoveryPasses) || 2);
  let state = normalizeInitial(env, initial);
  return {
    evaluate(decisions = [], now = Date.now()) {
      const nowMs = Number(now);
      if (!Number.isFinite(nowMs)) throw new Error("alert_state_now_invalid");
      const nowIso = new Date(nowMs).toISOString();
      const windowStart = Date.parse(state.notificationWindow.startedAt || "");
      if (!Number.isFinite(windowStart) || nowMs - windowStart >= configuredWindowMs) {
        state.notificationWindow = { startedAt: nowIso, count: 0 };
      }
      const candidates = [];
      for (const raw of decisions.slice(0, MAX_ENTRIES)) {
        const alert = sanitizeAlertPayload({ ...raw, environment: env, observedAt: nowIso });
        const key = alert.fingerprint;
        const previous = state.entries[key];
        if (alert.severity === "ok") {
          if (!previous) continue;
          const successes = Number(previous.consecutiveSuccesses || 0) + 1;
          const next = { ...previous, lastSeenAt: nowIso, consecutiveSuccesses: successes, consecutiveFailures: 0 };
          if (previous.status === "open" && successes >= Math.max(1, Number(raw.recoveryAfter) || configuredRecoveryPasses)) {
            next.status = "resolved";
            next.resolvedAt = nowIso;
            candidates.push(createEvent("recovery", { ...alert, severity: previous.severity }, nowIso));
          }
          state.entries[key] = next;
          continue;
        }
        const failures = Number(previous?.consecutiveFailures || 0) + 1;
        const openAfter = Math.max(1, Number(raw.openAfter) || (alert.severity === "critical" ? 1 : 2));
        const next = {
          status: previous?.status === "open" || failures >= openAfter ? "open" : "pending",
          severity: alert.severity,
          summaryCode: alert.summaryCode,
          firstSeenAt: previous?.firstSeenAt || nowIso,
          lastSeenAt: nowIso,
          lastNotifiedAt: previous?.lastNotifiedAt || "",
          consecutiveFailures: failures,
          consecutiveSuccesses: 0,
          suppressed: Number(previous?.suppressed || 0),
        };
        if (next.status === "open") {
          const wasOpen = previous?.status === "open";
          const escalated = wasOpen && previous.severity !== "critical" && alert.severity === "critical";
          const lastNotified = Date.parse(previous?.lastNotifiedAt || "");
          const cooldownMs = Math.max(1_000, Number(raw.cooldownMs) || configuredCooldownMs);
          const reminder = wasOpen && Number.isFinite(lastNotified) && nowMs - lastNotified >= cooldownMs;
          if (!wasOpen || escalated || reminder) candidates.push(createEvent(reminder ? "reminder" : "alert", alert, nowIso));
        }
        state.entries[key] = next;
      }
      const available = Math.max(0, Math.min(maxPerRun, maxPerHour - state.notificationWindow.count));
      const events = candidates.slice(0, available);
      const emitted = new Set(events.map((event) => event.fingerprint));
      for (const candidate of candidates) {
        const entry = state.entries[candidate.fingerprint];
        if (!entry) continue;
        if (emitted.has(candidate.fingerprint)) entry.lastNotifiedAt = nowIso;
        else entry.suppressed = Number(entry.suppressed || 0) + 1;
      }
      state.notificationWindow.count += events.length;
      return events;
    },
    snapshot() { return JSON.parse(JSON.stringify(state)); },
  };
}

export function loadAlertState(filePath, environment) {
  try {
    const stat = lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("alert_state_not_regular_file");
    if (stat.size > MAX_STATE_BYTES) throw new Error("alert_state_too_large");
    return normalizeInitial(
      assertMonitorEnvironment(environment),
      JSON.parse(readFileSync(filePath, "utf8")),
      Date.now() + MAX_FUTURE_SKEW_MS
    );
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState(assertMonitorEnvironment(environment));
    throw error;
  }
}

export function saveAlertStateAtomic(filePath, state) {
  const temp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  const body = `${JSON.stringify(state)}\n`;
  if (Buffer.byteLength(body) > MAX_STATE_BYTES) throw new Error("alert_state_too_large");
  writeFileSync(temp, body, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(temp, 0o600);
  renameSync(temp, filePath);
}
