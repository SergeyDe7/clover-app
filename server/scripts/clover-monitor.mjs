#!/usr/bin/env node
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertMonitorEnvironment,
  createMonitoringSnapshot,
  readAuditMonitoringSnapshot,
  readOneCQueueSnapshot,
} from "../src/monitoring/contracts.js";
import { evaluateMonitoringSnapshot } from "../src/monitoring/rules.js";
import { createAlertStateMachine, loadAlertState, saveAlertStateAtomic } from "../src/monitoring/alertState.js";
import {
  applyObservationState,
  collectOperationalFacts,
  createLocalOperatorAlertSink,
  createObservationState,
  loadObservationState,
  saveObservationStateAtomic,
} from "../src/monitoring/collectors.js";
import { readRuntimeMonitoringSnapshot } from "../src/monitoring/runtimeSnapshot.js";
import {
  MONITOR_STATUS_ENV_NAMES,
  runtimeStatusProjectionRevision,
} from "../src/runtimeKillSwitches.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(scriptDirectory, "..");

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const out = {
    environment: env.CLOVER_MONITOR_ENVIRONMENT || "",
    dbPath: env.DB_PATH || "",
    statePath: "",
    stateDirectory: env.CLOVER_MONITOR_STATE_DIR || "",
    observationStatePath: "",
    statusFilePath: env.CLOVER_MONITOR_STATUS_FILE || "",
    statusHmacKeyPath: env.CLOVER_MONITOR_STATUS_HMAC_KEY_FILE || "",
    backupDirectory: env.CLOVER_MONITOR_BACKUP_DIR || "/opt/clover/clover-app/server/backups/daily",
    backupEvidencePath: env.CLOVER_MONITOR_BACKUP_EVIDENCE || "",
    deployReceiptPath: env.CLOVER_MONITOR_DEPLOY_RECEIPT || "",
    runtimeSnapshotPath: env.CLOVER_MONITOR_RUNTIME_SNAPSHOT || "",
    deployWindowMs: Number(env.CLOVER_MONITOR_DEPLOY_WINDOW_MS || 15 * 60_000),
    diskPath: env.CLOVER_MONITOR_DISK_PATH || "/opt/clover",
    tlsHost: env.CLOVER_MONITOR_TLS_HOST || "clover-spb.ru",
    tlsPort: Number(env.CLOVER_MONITOR_TLS_PORT || 443),
    probeTimeoutMs: Number(env.CLOVER_MONITOR_PROBE_TIMEOUT_MS || 3_000),
    now: Date.now(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--environment") out.environment = argv[++index] || "";
    else if (flag === "--db") out.dbPath = argv[++index] || "";
    else if (flag === "--state") out.statePath = argv[++index] || "";
    else if (flag === "--observation-state") out.observationStatePath = argv[++index] || "";
    else if (flag === "--status-file") out.statusFilePath = argv[++index] || "";
    else if (flag === "--status-hmac-key-file") out.statusHmacKeyPath = argv[++index] || "";
    else if (flag === "--runtime-snapshot") out.runtimeSnapshotPath = argv[++index] || "";
    else if (flag === "--now") out.now = Number(argv[++index]);
    else throw new Error("unknown_monitor_argument");
  }
  out.environment = assertMonitorEnvironment(out.environment);
  if (!/^(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)$/iu.test(out.tlsHost)) {
    throw new Error("monitor_tls_host_invalid");
  }
  if (!Number.isInteger(out.tlsPort) || out.tlsPort < 1 || out.tlsPort > 65_535) {
    throw new Error("monitor_tls_port_invalid");
  }
  out.probeTimeoutMs = Math.max(250, Math.min(5_000, Number(out.probeTimeoutMs) || 3_000));
  if (!out.dbPath) out.dbPath = path.join(serverDirectory, "data", "clover.sqlite");
  if (!out.statePath) {
    const stateDirectory = out.stateDirectory || path.join(serverDirectory, "data");
    out.statePath = path.join(stateDirectory, `monitor-${out.environment}.json`);
  }
  if (!out.observationStatePath) {
    const stateDirectory = out.stateDirectory || path.dirname(out.statePath);
    out.observationStatePath = path.join(stateDirectory, `observations-${out.environment}.json`);
  }
  if (!Number.isFinite(out.now)) throw new Error("monitor_now_invalid");
  return out;
}

const STATUS_ONLY_ENV_NAMES = MONITOR_STATUS_ENV_NAMES;

export function parseStatusOnlyFile(filePath, {
  strictMode = process.env.CLOVER_MONITOR_STRICT_STATUS_MODE === "true",
  now = Date.now(),
  expectedUid = 0,
} = {}) {
  const names = new Set(STATUS_ONLY_ENV_NAMES);
  const values = {};
  if (!filePath) throw new Error("monitor_status_file_required");
  let stat;
  let fd;
  try {
    fd = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    stat = fstatSync(fd);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ELOOP") throw new Error("monitor_status_missing");
    throw new Error("monitor_status_invalid");
  }
  if (!stat.isFile()) {
    closeSync(fd);
    throw new Error("monitor_status_file_invalid");
  }
  let source;
  try {
    source = readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
  if (strictMode && process.platform !== "win32") {
    if (!Number.isInteger(expectedUid) || expectedUid < 0) throw new Error("monitor_status_expected_uid_invalid");
    if (stat.uid !== expectedUid) throw new Error("monitor_status_file_owner_invalid");
    if ((stat.mode & 0o777) !== 0o640) throw new Error("monitor_status_file_mode_invalid");
  }
  if (Buffer.byteLength(source) > 64 * 1024) throw new Error("monitor_status_file_too_large");
  for (const line of source.split(/\r?\n/u).slice(0, 4096)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || !names.has(match[1])) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/gu, "").trim();
  }
  if (strictMode) {
    if (STATUS_ONLY_ENV_NAMES.some((name) => !Object.hasOwn(values, name))) {
      throw new Error("monitor_status_incomplete");
    }
    // Age alone is not drift: the live API revision is authoritative and is
    // compared on every run. Only a timestamp from the future is invalid here.
    if (stat.mtimeMs > Number(now) + 5 * 60_000) {
      throw new Error("monitor_status_future");
    }
  }
  return values;
}

export function readStatusHmacKey(filePath, {
  strictMode = process.env.CLOVER_MONITOR_STRICT_STATUS_MODE === "true",
} = {}) {
  if (!filePath) throw new Error("monitor_status_hmac_key_file_required");
  let fd;
  try {
    fd = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 32 || stat.size > 4096) throw new Error("monitor_status_hmac_key_invalid");
    if (strictMode && process.platform !== "win32") {
      if (stat.uid !== 0 || (stat.mode & 0o777) !== 0o640) throw new Error("monitor_status_hmac_key_permissions_invalid");
    }
    const key = readFileSync(fd, "utf8").trim();
    if (Buffer.byteLength(key) < 32) throw new Error("monitor_status_hmac_key_invalid");
    return key;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ELOOP") throw new Error("monitor_status_hmac_key_missing");
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function killSwitchInventory(env) {
  const bool = (name) => String(env[name] || "false").trim().toLowerCase() === "true" ? "enabled" : "disabled";
  const contours = String(env.ONEC_ALLOWED_DATABASES || "").split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value === "TEST" || value === "VLAVKA");
  const paused = (name) => {
    const configured = Object.hasOwn(env, name);
    const valid = !configured || env[name] === "true" || env[name] === "false";
    return { configured, valid, paused: configured && env[name] !== "false" };
  };
  return {
    oneCWrite: bool("ONEC_WRITE_ENABLED"),
    oneCProductionExchange: bool("ONEC_PROD_EXCHANGE_ENABLED"),
    contours: [...new Set(contours)],
    adminFullReset: bool("ALLOW_ADMIN_FULL_RESET"),
    translationProvider: env.CLOVER_PRODUCT_TRANSLATION_PROVIDER === "azure" ? "enabled" : "disabled",
    oneCInboundPull: paused("CLOVER_PAUSE_ONEC_CLAIMS"),
    registration: paused("CLOVER_PAUSE_REGISTRATION"),
    guestOrders: paused("CLOVER_PAUSE_GUEST_ORDERS"),
    uploads: paused("CLOVER_PAUSE_UPLOADS"),
    outboundNotifications: paused("CLOVER_PAUSE_OUTBOUND_NOTIFICATIONS"),
    email: paused("CLOVER_PAUSE_EMAIL"),
    telegram: paused("CLOVER_PAUSE_TELEGRAM"),
    push: paused("CLOVER_PAUSE_PUSH"),
    max: "not_implemented",
  };
}

function writeNdjson(record, writer = process.stdout) { writer.write(`${JSON.stringify(record)}\n`); }

export async function runMonitor(options, deps = {}) {
  const clock = deps.now || (() => Date.now());
  const started = clock();
  const now = Number(options.now ?? started);
  const queueReader = deps.readOneCQueueSnapshot || readOneCQueueSnapshot;
  const auditReader = deps.readAuditMonitoringSnapshot || readAuditMonitoringSnapshot;
  const runtimeSnapshotConfigured = Boolean(options.runtimeSnapshotPath);
  let runtimeSnapshot = null;
  let runtimeSnapshotKnown = !runtimeSnapshotConfigured;
  let runtimeSnapshotError = false;
  if (runtimeSnapshotConfigured) {
    try {
      runtimeSnapshot = (deps.readRuntimeMonitoringSnapshot || readRuntimeMonitoringSnapshot)({
        filePath: options.runtimeSnapshotPath,
        environment: options.environment,
        now,
      });
      runtimeSnapshotKnown = true;
    } catch {
      runtimeSnapshotError = true;
    }
  }
  const statusProjection = options.statusFilePath
    ? (deps.parseStatusOnlyFile || parseStatusOnlyFile)(options.statusFilePath, { now })
    : {};
  const expectedRuntimeStatusRevision = options.statusFilePath && options.statusHmacKeyPath
    ? runtimeStatusProjectionRevision(statusProjection, readStatusHmacKey(options.statusHmacKeyPath))
    : "";
  let queue;
  let audit;
  let operational;
  let probeErrors = runtimeSnapshotError ? 1 : 0;
  let queueKnown = true;
  let auditKnown = true;
  try {
    if (runtimeSnapshotConfigured) {
      if (!runtimeSnapshot) throw new Error("runtime_snapshot_unavailable");
      queue = runtimeSnapshot.queue;
    } else {
      queue = queueReader({ dbPath: options.dbPath, now });
    }
  } catch {
    queueKnown = false;
    if (!runtimeSnapshotError) probeErrors += 1;
    queue = {
      ready: { count: 0, oldestAgeMs: 0 },
      sending: { count: 0, oldestAgeMs: 0, stuckCount: 0 },
      malformedCount: 0,
      unknownContourCount: 0,
    };
  }
  try {
    operational = await (deps.collectOperationalFacts || collectOperationalFacts)({
      now,
      environment: options.environment,
      backupDirectory: options.backupDirectory,
      backupEvidencePath: options.backupEvidencePath,
      deployReceiptPath: options.deployReceiptPath,
      deployWindowMs: options.deployWindowMs,
      diskPath: options.diskPath,
      tlsHost: options.tlsHost,
      tlsPort: options.tlsPort,
      probeTimeoutMs: options.probeTimeoutMs,
      expectedRuntimeStatusRevision,
      runtimeSnapshotProvided: runtimeSnapshotConfigured,
    }, deps.collectorDeps || {});
  } catch {
    probeErrors += 1;
    operational = {
      availability: {}, systemd: {}, resources: {},
      backup: { status: "unknown", value: null, facts: {} },
      tls: { status: "unknown", value: null, facts: {} },
      deploy: { status: "unknown", failures: 0, rollbacks: 0 },
    };
  }
  if (runtimeSnapshot) operational.backup = runtimeSnapshot.backup;
  const observationLoader = deps.loadObservationState || loadObservationState;
  const observationSaver = deps.saveObservationState || saveObservationStateAtomic;
  const previousObservation = options.observationStatePath
    ? observationLoader(options.observationStatePath, options.environment, now)
    : createObservationState(options.environment);
  const observed = applyObservationState({
    environment: options.environment,
    now,
    operational,
    previous: previousObservation,
  });
  operational = observed.operational;
  if (options.observationStatePath) {
    observationSaver(options.observationStatePath, observed.nextState);
  }
  const availabilityRows = Object.values(operational.availability || {});
  const systemdRows = Object.values(operational.systemd || {});
  const availabilityKnown = availabilityRows.filter((item) => item.status === "ok");
  const systemdKnown = systemdRows.filter((item) => item.status === "ok");
  const systemdFailed = systemdKnown.some((item) => item.facts?.activeState !== "active");
  if (operational.availability?.api?.facts?.runtimeStatusRevisionMatch === false) probeErrors += 1;
  const maxAvailabilityFailures = availabilityKnown.reduce(
    (max, item) => Math.max(max, Number(item.facts?.consecutiveFailures) || 0), 0
  );
  const maxOutageAgeMs = availabilityKnown.reduce(
    (max, item) => Math.max(max, Number(item.facts?.outageAgeMs) || 0), 0
  );
  probeErrors += availabilityRows.filter((item) => item.status === "unknown").length;
  probeErrors += systemdRows.filter((item) => item.status === "unknown").length;
  probeErrors += [operational.resources?.cpu, operational.resources?.ram, operational.resources?.disk,
    operational.backup, operational.tls].filter((item) => item?.status !== "ok").length;
  if (operational.deploy?.status !== "ok") probeErrors += 1;
  try {
    if (runtimeSnapshotConfigured) {
      if (!runtimeSnapshot) throw new Error("runtime_snapshot_unavailable");
      audit = runtimeSnapshot.audit;
    } else {
      audit = auditReader({ dbPath: options.dbPath, now });
    }
  } catch {
    auditKnown = false;
    if (!runtimeSnapshotError) probeErrors += 1;
    audit = {
      windowMs: 10 * 60 * 1000,
      ackRejected: 0,
      contourMismatch: 0,
      claimRequeue: 0,
      authDenied: 0,
    };
  }
  const snapshot = createMonitoringSnapshot({
    environment: options.environment,
    collectedAt: new Date(now).toISOString(),
    durationMs: Math.min(45_000, Math.max(0, clock() - started)),
    signals: {
      "monitor.probe_errors": { status: "ok", value: probeErrors },
      "monitor.runtime_snapshot": runtimeSnapshotConfigured
        ? { status: "ok", value: runtimeSnapshotKnown ? 0 : 1 }
        : { status: "unknown", value: null },
      availability: {
        status: availabilityKnown.length ? "ok" : "unknown",
        value: maxAvailabilityFailures,
        facts: {
          attempts: availabilityKnown.length,
          consecutiveFailures: maxAvailabilityFailures,
          outageAgeMs: maxOutageAgeMs,
        },
      },
      systemd: {
        status: systemdKnown.length ? "ok" : "unknown",
        value: systemdKnown.reduce((sum, item) => sum + Number(item.value || 0), 0),
        facts: {
          activeState: systemdFailed ? "failed" : "active",
          result: systemdFailed ? "failed" : "success",
          windowMs: systemdKnown.reduce((max, item) => Math.max(max, Number(item.facts?.windowMs) || 0), 0),
        },
      },
      cpu: operational.resources?.cpu || { status: "unknown", value: null },
      ram: operational.resources?.ram || { status: "unknown", value: null },
      disk: operational.resources?.disk || { status: "unknown", value: null },
      backup_age: operational.backup,
      tls_expiry: operational.tls,
      deploy_failure: {
        status: operational.deploy?.status || "unknown",
        value: operational.deploy?.failures ?? null,
      },
      deploy_rollback: {
        status: operational.deploy?.status || "unknown",
        value: operational.deploy?.rollbacks ?? null,
      },
      onec_ready: {
        status: queueKnown ? "ok" : "unknown",
        value: queue.ready.count,
        facts: { oldestAgeMs: queue.ready.oldestAgeMs },
      },
      onec_sending: {
        status: queueKnown ? "ok" : "unknown",
        value: queue.sending.count,
        facts: { oldestAgeMs: queue.sending.oldestAgeMs, stuckCount: queue.sending.stuckCount },
      },
      onec_ack_rejection: {
        status: auditKnown ? "ok" : "unknown",
        value: audit.ackRejected,
        facts: { windowMs: audit.windowMs },
      },
      "onec.queue.stuck": {
        status: queueKnown ? "ok" : "unknown",
        value: queue.sending.stuckCount,
        facts: { ready: queue.ready.count, sending: queue.sending.count, stuck: queue.sending.stuckCount, malformed: queue.malformedCount },
      },
      "onec.contour_mismatch": {
        status: queueKnown && auditKnown ? "ok" : "unknown",
        value: audit.contourMismatch + queue.unknownContourCount,
        facts: { count: audit.contourMismatch + queue.unknownContourCount },
      },
      "onec.claim_requeue": { status: auditKnown ? "ok" : "unknown", value: audit.claimRequeue },
      "auth.denied": { status: auditKnown ? "ok" : "unknown", value: audit.authDenied },
    },
  });
  const loadState = deps.loadState || loadAlertState;
  const saveState = deps.saveState || saveAlertStateAtomic;
  const state = loadState(options.statePath, options.environment);
  const machine = createAlertStateMachine({ environment: options.environment, initial: state });
  const events = machine.evaluate(evaluateMonitoringSnapshot(snapshot), now);
  const nextState = machine.snapshot();
  const env = {
    ...Object.fromEntries(STATUS_ONLY_ENV_NAMES
      .filter((key) => Object.hasOwn(process.env, key))
      .map((key) => [key, process.env[key]])),
    ...statusProjection,
    ...(deps.statusEnv || {}),
  };
  const output = {
    schemaVersion: 1,
    event: "monitor.run",
    environment: options.environment,
    collectedAt: snapshot.collectedAt,
    ok: probeErrors === 0,
    alerts: events.length,
    suppressed: Object.values(nextState.entries).reduce((sum, item) => sum + Number(item.suppressed || 0), 0),
    queue: {
      ready: queue.ready.count,
      sending: queue.sending.count,
      stuck: queue.sending.stuckCount,
      malformed: queue.malformedCount,
      unknownContour: queue.unknownContourCount,
    },
    killSwitches: killSwitchInventory(env),
    operational: {
      availabilityFailures: availabilityKnown.reduce((sum, item) => sum + Number(item.value || 0), 0),
      systemdRestarts: systemdKnown.reduce((sum, item) => sum + Number(item.value || 0), 0),
      backupKnown: operational.backup?.status === "ok",
      tlsKnown: operational.tls?.status === "ok",
      deployFailures: Number(operational.deploy?.failures || 0),
      deployRollbacks: Number(operational.deploy?.rollbacks || 0),
    },
  };
  const emit = deps.writeNdjson || writeNdjson;
  emit(output);
  const sink = deps.alertSink || createLocalOperatorAlertSink({
    environment: options.environment,
    writer: deps.alertWriter || process.stderr,
  });
  const sinkResult = sink.emit(events);
  if (!sinkResult || sinkResult.failed > 0) {
    const error = new Error("local operator alert sink did not acknowledge every event");
    error.code = "MONITOR_ALERT_SINK_FAILED";
    throw error;
  }
  const sinkAcknowledged = sinkResult.delivered === events.length;
  if (sinkAcknowledged) saveState(options.statePath, nextState);
  return {
    snapshot,
    events,
    output,
    sinkResult,
    exitCode: probeErrors || !sinkAcknowledged ? 2 : 0,
  };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const result = await runMonitor(parseArgs());
    process.exitCode = result.exitCode;
  } catch (error) {
    writeNdjson({
      schemaVersion: 1,
      event: "monitor.run",
      ok: false,
      code: error?.code === "MONITOR_ALERT_SINK_FAILED" ? "MONITOR_ALERT_SINK_FAILED" : "MONITOR_FATAL",
    }, process.stderr);
    process.exitCode = 2;
  }
}
