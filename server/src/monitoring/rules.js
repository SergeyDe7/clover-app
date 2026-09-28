import { sanitizeAlertPayload } from "./sanitizeAlert.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const DEFAULT_MONITORING_THRESHOLDS = Object.freeze({
  availability: Object.freeze({ summaryCode: "availability.failure" }),
  systemd: Object.freeze({ summaryCode: "systemd.failure" }),
  cpu: Object.freeze({ summaryCode: "resource.cpu" }),
  ram: Object.freeze({ summaryCode: "resource.ram" }),
  disk: Object.freeze({ summaryCode: "resource.disk" }),
  backup_age: Object.freeze({ summaryCode: "backup.age" }),
  tls_expiry: Object.freeze({ summaryCode: "tls.expiry" }),
  onec_ready: Object.freeze({ summaryCode: "onec.queue.ready" }),
  onec_sending: Object.freeze({ summaryCode: "onec.queue.sending" }),
  onec_ack_rejection: Object.freeze({ summaryCode: "onec.ack.rejection" }),
  deploy_failure: Object.freeze({ warning: 1, critical: 1, summaryCode: "deploy.failure" }),
  deploy_rollback: Object.freeze({ warning: 1, critical: 1, summaryCode: "deploy.rollback" }),
  "monitor.probe_errors": Object.freeze({ warning: 1, critical: 1, summaryCode: "monitor.probe.failure" }),
  "monitor.runtime_snapshot": Object.freeze({ warning: 1, critical: 1, summaryCode: "monitor.runtime.snapshot" }),
  "onec.queue.stuck": Object.freeze({ warning: 1, critical: 3, summaryCode: "onec.queue.stuck" }),
  "onec.contour_mismatch": Object.freeze({ warning: 1, critical: 1, summaryCode: "onec.contour.mismatch" }),
  "onec.claim_requeue": Object.freeze({ warning: 1, critical: 5, summaryCode: "onec.claim.requeue" }),
  "auth.denied": Object.freeze({ warning: 5, critical: 20, summaryCode: "auth.denied.burst" }),
});

function severityFor(signalId, value, facts, rule) {
  if (!Number.isFinite(value)) return "unknown";
  if (signalId === "availability") {
    if (value >= 3 || Number(facts.consecutiveFailures) >= 3 || Number(facts.outageAgeMs) >= 5 * MINUTE) return "critical";
    return value >= 2 || Number(facts.consecutiveFailures) >= 2 ? "warning" : "ok";
  }
  if (signalId === "systemd") {
    if (facts.activeState === "failed" || facts.activeState === "inactive" || (facts.result && facts.result !== "success")) return "critical";
    if (Math.max(value, Number(facts.restartCount10m) || 0) >= 3) return "critical";
    return Math.max(value, Number(facts.restartCount15m) || 0) >= 1 ? "warning" : "ok";
  }
  if (signalId === "cpu") {
    if (Number(facts.sustainedMs) < 10 * MINUTE) return "ok";
    return value >= 95 ? "critical" : value >= 80 ? "warning" : "ok";
  }
  if (signalId === "ram") {
    if (facts.oom === true) return "critical";
    if (Number(facts.sustainedMs) < 10 * MINUTE) return "ok";
    return value >= 95 ? "critical" : value >= 85 ? "warning" : "ok";
  }
  if (signalId === "disk") {
    if (Number(facts.requiredBytes) > 0 && Number(facts.freeBytes) <= 2 * Number(facts.requiredBytes)) return "critical";
    return value < 10 ? "critical" : value < 20 ? "warning" : "ok";
  }
  if (signalId === "backup_age") {
    if (facts.integrityOk === false || facts.restoreOk === false || (facts.lastResult && facts.lastResult !== "success")) return "critical";
    return value >= 48 * HOUR ? "critical" : value >= 26 * HOUR ? "warning" : "ok";
  }
  if (signalId === "tls_expiry") {
    if (facts.hostnameValid === false || facts.chainValid === false) return "critical";
    return value <= 14 ? "critical" : value <= 30 ? "warning" : "ok";
  }
  if (signalId === "onec_ready") {
    if (value >= 20 || Number(facts.oldestAgeMs) >= 30 * MINUTE) return "critical";
    if (value >= 5 || Number(facts.oldestAgeMs) >= 10 * MINUTE) return "warning";
    return "ok";
  }
  if (signalId === "onec_sending") {
    if (Number(facts.stuckCount) > 0 || Number(facts.oldestAgeMs) >= 16 * MINUTE || Number(facts.requeuesPerOrderHour) >= 3) return "critical";
    return Number(facts.oldestAgeMs) >= 10 * MINUTE ? "warning" : "ok";
  }
  if (signalId === "onec_ack_rejection") {
    if (facts.contourMismatch === true || facts.collision === true || value >= 3) return "critical";
    return value >= 1 ? "warning" : "ok";
  }
  if (value >= rule.critical) return "critical";
  if (value >= rule.warning) return "warning";
  return "ok";
}

export function evaluateMonitoringSnapshot(snapshot, thresholds = DEFAULT_MONITORING_THRESHOLDS) {
  const decisions = [];
  for (const [signalId, observation] of Object.entries(snapshot?.signals || {}).slice(0, 128)) {
    const rule = thresholds?.[signalId];
    if (!rule) continue;
    const value = Number(observation?.value);
    const severity = observation?.status === "ok"
      ? severityFor(signalId, value, observation?.facts || {}, rule)
      : "unknown";
    const alert = sanitizeAlertPayload({
      environment: snapshot?.environment,
      signalId,
      scope: observation?.scope || "global",
      severity,
      summaryCode: rule.summaryCode,
      observedAt: snapshot?.collectedAt,
      facts: { count: Number.isFinite(value) ? value : undefined },
    });
    decisions.push({
      ...alert,
      signal: alert.signalId,
      value: Number.isFinite(value) ? value : null,
      openAfter: severity === "critical" ? 1 : 2,
      recoveryAfter: 2,
      cooldownMs: severity === "critical" ? 15 * MINUTE : HOUR,
    });
  }
  return decisions;
}
