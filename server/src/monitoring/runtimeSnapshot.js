import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { assertMonitorEnvironment } from "./contracts.js";

const MAX_SNAPSHOT_BYTES = 16 * 1024;
const MAX_COUNT = 1_000_000_000;

function count(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_COUNT) throw new Error("runtime_snapshot_count_invalid");
  return parsed;
}

function age(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 365 * 24 * 60 * 60_000) throw new Error("runtime_snapshot_age_invalid");
  return Math.trunc(parsed);
}

export function createRuntimeMonitoringSnapshot({ environment, collectedAt, queue, audit, backup } = {}) {
  const env = assertMonitorEnvironment(environment);
  const collectedAtMs = Date.parse(String(collectedAt || ""));
  if (!Number.isFinite(collectedAtMs)) throw new Error("runtime_snapshot_timestamp_invalid");
  const backupStatus = backup?.status === "ok" ? "ok" : "unknown";
  const backupValue = backupStatus === "ok" ? age(backup?.value) : null;
  return {
    schemaVersion: 1,
    environment: env,
    collectedAt: new Date(collectedAtMs).toISOString(),
    queue: {
      ready: { count: count(queue?.ready?.count), oldestAgeMs: age(queue?.ready?.oldestAgeMs) },
      sending: {
        count: count(queue?.sending?.count),
        oldestAgeMs: age(queue?.sending?.oldestAgeMs),
        stuckCount: count(queue?.sending?.stuckCount),
      },
      malformedCount: count(queue?.malformedCount),
      unknownContourCount: count(queue?.unknownContourCount),
    },
    audit: {
      windowMs: age(audit?.windowMs),
      ackRejected: count(audit?.ackRejected),
      contourMismatch: count(audit?.contourMismatch),
      claimRequeue: count(audit?.claimRequeue),
      authDenied: count(audit?.authDenied),
    },
    backup: {
      status: backupStatus,
      value: backupValue,
      scope: "backup",
      facts: backupStatus === "ok" ? {
        lastResult: backup?.facts?.lastResult === "success" ? "success" : "failed",
        integrityOk: backup?.facts?.integrityOk === true,
        restoreOk: backup?.facts?.restoreOk === true,
      } : {},
    },
  };
}

export function readRuntimeMonitoringSnapshot({ filePath, environment, now = Date.now(), maxAgeMs = 4 * 60_000 } = {}) {
  let fd;
  try {
    fd = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_SNAPSHOT_BYTES) throw new Error("runtime_snapshot_file_invalid");
    const snapshot = createRuntimeMonitoringSnapshot(JSON.parse(readFileSync(fd, "utf8")));
    if (snapshot.environment !== assertMonitorEnvironment(environment)) throw new Error("runtime_snapshot_environment_mismatch");
    const ageMs = Number(now) - Date.parse(snapshot.collectedAt);
    if (ageMs < 0 || ageMs > Math.max(60_000, Math.min(4 * 60_000, Number(maxAgeMs) || 0))) {
      throw new Error("runtime_snapshot_stale");
    }
    return snapshot;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ELOOP") {
      throw new Error("runtime_snapshot_missing", { cause: error });
    }
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
