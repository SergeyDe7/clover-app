import { DatabaseSync } from "node:sqlite";

export const MONITOR_SCHEMA_VERSION = 1;
export const MONITOR_ENVIRONMENTS = Object.freeze(["test", "production"]);
export const MONITOR_SIGNAL_STATUSES = Object.freeze(["ok", "unknown"]);
export const MONITOR_SEVERITIES = Object.freeze(["ok", "warning", "critical", "unknown"]);

const SIGNAL_ID_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const SCOPE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/u;

export function assertMonitorEnvironment(value) {
  const environment = String(value || "").trim().toLowerCase();
  if (!MONITOR_ENVIRONMENTS.includes(environment)) {
    throw new Error("monitor_environment_must_be_test_or_production");
  }
  return environment;
}

export function assertSignalId(value) {
  const signalId = String(value || "").trim();
  if (!SIGNAL_ID_RE.test(signalId)) throw new Error("invalid_monitor_signal_id");
  return signalId;
}

export function normalizeMonitorScope(value) {
  const scope = String(value || "global").trim();
  return SCOPE_RE.test(scope) ? scope : "global";
}

function normalizePrimitive(value) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= 64 && /^[a-zA-Z0-9._:-]*$/u.test(value)) return value;
  return null;
}

function normalizeFacts(facts) {
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return {};
  const out = {};
  for (const [key, value] of Object.entries(facts).slice(0, 16)) {
    if (!/^[a-z][a-zA-Z0-9]{0,39}$/u.test(key)) continue;
    const normalized = normalizePrimitive(value);
    if (normalized !== null || value === null) out[key] = normalized;
  }
  return out;
}

export function createMonitoringSnapshot({ environment, collectedAt = new Date().toISOString(), durationMs = 0, signals = {} } = {}) {
  const normalizedEnvironment = assertMonitorEnvironment(environment);
  if (!Number.isFinite(Date.parse(collectedAt))) throw new Error("invalid_monitor_collected_at");
  const normalizedSignals = {};
  for (const [rawId, raw] of Object.entries(signals || {}).slice(0, 128)) {
    const signalId = assertSignalId(rawId);
    normalizedSignals[signalId] = {
      status: MONITOR_SIGNAL_STATUSES.includes(raw?.status) ? raw.status : "unknown",
      value: normalizePrimitive(raw?.value),
      scope: normalizeMonitorScope(raw?.scope),
      facts: normalizeFacts(raw?.facts),
    };
  }
  return {
    schemaVersion: MONITOR_SCHEMA_VERSION,
    environment: normalizedEnvironment,
    collectedAt: new Date(collectedAt).toISOString(),
    durationMs: Math.max(0, Math.min(60_000, Math.trunc(Number(durationMs) || 0))),
    signals: normalizedSignals,
  };
}

function emptyContour() { return { ready: 0, sending: 0, stuck: 0 }; }

/** Strictly read-only aggregate: no db.js import, HTTP, claim release, audit, or 1C call. */
export function readOneCQueueSnapshot({ dbPath, now = Date.now(), leaseMs = 15 * 60 * 1000 } = {}) {
  if (!dbPath || typeof dbPath !== "string") throw new Error("monitor_db_path_required");
  const nowMs = Number(now);
  if (!Number.isFinite(nowMs)) throw new Error("monitor_now_invalid");
  const safeLeaseMs = Math.max(1_000, Math.min(86_400_000, Number(leaseMs) || 0));
  const database = new DatabaseSync(dbPath, { readOnly: true, enableForeignKeyConstraints: false });
  try {
    database.exec("PRAGMA query_only = ON");
    const rows = database.prepare(`
      SELECT
        CASE upper(trim(COALESCE(json_extract(payload_json, '$.exchange.database'), '')))
          WHEN 'TEST' THEN 'TEST'
          WHEN 'VLAVKA' THEN 'VLAVKA'
          ELSE 'UNKNOWN'
        END AS contour,
        COALESCE(json_extract(payload_json, '$.exchange.status'), 'not_sent') AS status,
        COUNT(*) AS count,
        MIN(COALESCE(json_extract(payload_json, '$.exchange.lastAttemptAt'),
          json_extract(payload_json, '$.exchange.checkedAt'), updated_at)) AS oldest_at
      FROM orders
      WHERE json_valid(payload_json)
        AND COALESCE(json_extract(payload_json, '$.exchange.status'), 'not_sent') IN ('ready', 'sending')
      GROUP BY contour, status
    `).all();
    const malformedCount = Number(database.prepare(
      "SELECT COUNT(*) AS count FROM orders WHERE NOT json_valid(payload_json)"
    ).get()?.count || 0);
    const contours = { TEST: emptyContour(), VLAVKA: emptyContour(), UNKNOWN: emptyContour() };
    const result = {
      ready: { count: 0, oldestAgeMs: 0 },
      sending: { count: 0, oldestAgeMs: 0, stuckCount: 0 },
      malformedCount,
      unknownContourCount: 0,
      contours,
    };
    for (const row of rows) {
      const contour = row.contour === "VLAVKA" || row.contour === "TEST"
        ? row.contour
        : "UNKNOWN";
      const status = row.status === "sending" ? "sending" : "ready";
      const count = Math.max(0, Number(row.count) || 0);
      const parsedAt = Date.parse(String(row.oldest_at || ""));
      const oldestAgeMs = Number.isFinite(parsedAt) ? Math.max(0, nowMs - parsedAt) : 0;
      result[status].count += count;
      result[status].oldestAgeMs = Math.max(result[status].oldestAgeMs, oldestAgeMs);
      contours[contour][status] += count;
      if (contour === "UNKNOWN") result.unknownContourCount += count;
      if (status === "sending" && (!Number.isFinite(parsedAt) || oldestAgeMs >= safeLeaseMs)) {
        result.sending.stuckCount += count;
        contours[contour].stuck += count;
      }
    }
    return result;
  } finally {
    database.close();
  }
}

/** Aggregate allowlisted audit action names only; details/user fields are never read. */
export function readAuditMonitoringSnapshot({ dbPath, now = Date.now(), windowMs = 10 * 60 * 1000 } = {}) {
  if (!dbPath || typeof dbPath !== "string") throw new Error("monitor_db_path_required");
  const nowMs = Number(now);
  const safeWindowMs = Math.max(60_000, Math.min(86_400_000, Number(windowMs) || 0));
  if (!Number.isFinite(nowMs)) throw new Error("monitor_now_invalid");
  const since = new Date(nowMs - safeWindowMs).toISOString();
  const database = new DatabaseSync(dbPath, { readOnly: true, enableForeignKeyConstraints: false });
  try {
    database.exec("PRAGMA query_only = ON");
    const rows = database.prepare(`
      SELECT action, COUNT(*) AS count
      FROM audit_log
      WHERE created_at >= ?
        AND action IN (
          'one-c.order.ack.rejected',
          'one-c.contour.mismatch',
          'one-c.claim.expired-requeue',
          'one-c.auth.denied'
        )
      GROUP BY action
    `).all(since);
    const counts = Object.fromEntries(rows.map((row) => [String(row.action), Math.max(0, Number(row.count) || 0)]));
    return {
      windowMs: safeWindowMs,
      ackRejected: counts["one-c.order.ack.rejected"] || 0,
      contourMismatch: counts["one-c.contour.mismatch"] || 0,
      claimRequeue: counts["one-c.claim.expired-requeue"] || 0,
      authDenied: counts["one-c.auth.denied"] || 0,
    };
  } finally {
    database.close();
  }
}
