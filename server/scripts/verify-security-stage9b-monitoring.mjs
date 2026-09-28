import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MONITORING_THRESHOLDS,
  evaluateMonitoringSnapshot,
} from "../src/monitoring/rules.js";
import { sanitizeAlertPayload } from "../src/monitoring/sanitizeAlert.js";
import {
  applyObservationState,
  collectBackup,
  collectDeploy,
  createBackupEvidence,
  createDeployReceipt,
  createObservationState,
} from "../src/monitoring/collectors.js";
import { createAlertStateMachine, loadAlertState } from "../src/monitoring/alertState.js";
import {
  readAuditMonitoringSnapshot,
  readOneCQueueSnapshot,
} from "../src/monitoring/contracts.js";
import {
  isOutboundChannelPaused,
  isRuntimeFeaturePaused,
  requireRuntimeFeature,
  runtimeKillSwitchStatus,
} from "../src/runtimeKillSwitches.js";
import { parseStatusOnlyFile, runMonitor } from "./clover-monitor.mjs";

const NOW_ISO = "2026-09-28T12:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const GIB = 1024 ** 3;
const SERVER_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_DIRECTORY = path.resolve(SERVER_DIRECTORY, "..");

function writeValidStatusFixture(directory) {
  const statusPath = path.join(directory, "monitor-status.env");
  const example = readFileSync(
    path.join(REPOSITORY_DIRECTORY, "ops", "systemd", "clover-monitor-status.env.example"),
    "utf8"
  );
  writeFileSync(statusPath, example, "utf8");
  return statusPath;
}

// A fixture verifier must never become an accidental production probe.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("STAGE9B_FIXTURE_NETWORK_FORBIDDEN");
};

test.after(() => {
  globalThis.fetch = originalFetch;
});

function snapshot(signalId, value, facts = {}, scope = "global") {
  return {
    schemaVersion: 1,
    environment: "test",
    collectedAt: NOW_ISO,
    signals: {
      [signalId]: {
        status: "ok",
        value,
        scope,
        facts,
      },
    },
  };
}

function decision(signalId, value, facts = {}, scope = "global") {
  const decisions = evaluateMonitoringSnapshot(
    snapshot(signalId, value, facts, scope),
    DEFAULT_MONITORING_THRESHOLDS
  );
  assert.ok(Array.isArray(decisions), "rules must return a bounded decision array");
  const found = decisions.find((item) => item.signalId === signalId && item.scope === scope);
  assert.ok(found, `missing decision for ${signalId}/${scope}`);
  return found;
}

function assertSeverity(expected, signalId, value, facts = {}) {
  const actual = decision(signalId, value, facts);
  assert.equal(actual.severity, expected, `${signalId} boundary`);
  assert.equal(typeof actual.summaryCode, "string");
  assert.ok(actual.summaryCode.length > 0, `${signalId} must use a stable summary code`);
  assert.ok(Number.isFinite(actual.cooldownMs) && actual.cooldownMs > 0);
  return actual;
}

function operationalFixture() {
  return {
    availability: {
      api: { status: "ok", value: 0, facts: { attempts: 3 } },
      ui: { status: "ok", value: 0, facts: { attempts: 3 } },
      nginx: { status: "ok", value: 0, facts: { attempts: 3 } },
    },
    systemd: {
      api: { status: "ok", value: 0, facts: { activeState: "active" } },
      ui: { status: "ok", value: 0, facts: { activeState: "active" } },
      nginx: { status: "ok", value: 0, facts: { activeState: "active" } },
    },
    resources: {
      cpu: { status: "ok", value: 10, facts: { sustainedMs: 10 * MINUTE } },
      ram: { status: "ok", value: 20, facts: { sustainedMs: 10 * MINUTE } },
      disk: { status: "ok", value: 70, facts: { freeBytes: 20 * GIB, requiredBytes: GIB } },
    },
    backup: { status: "ok", value: HOUR, facts: { integrityOk: true, restoreOk: true } },
    tls: { status: "ok", value: 60, facts: { hostnameValid: true, chainValid: true } },
    deploy: { status: "ok", failures: 0, rollbacks: 0 },
  };
}

test("fixture harness rejects a real notification/network call", async () => {
  await assert.rejects(fetch("https://production.invalid/notify"), /NETWORK_FORBIDDEN/u);
});

test("default rules classify exact warning/critical boundaries", () => {
  assert.ok(Object.isFrozen(DEFAULT_MONITORING_THRESHOLDS));

  assertSeverity("ok", "availability", 1, {
    attempts: 3,
    windowMs: 3 * MINUTE,
    consecutiveFailures: 1,
    outageAgeMs: MINUTE,
  });
  assertSeverity("warning", "availability", 2, {
    attempts: 3,
    windowMs: 3 * MINUTE,
    consecutiveFailures: 2,
    outageAgeMs: 2 * MINUTE,
  });
  assertSeverity("critical", "availability", 3, {
    attempts: 3,
    windowMs: 3 * MINUTE,
    consecutiveFailures: 3,
    outageAgeMs: 3 * MINUTE,
  });
  assertSeverity("critical", "availability", 1, {
    attempts: 3,
    windowMs: 5 * MINUTE,
    consecutiveFailures: 1,
    outageAgeMs: 5 * MINUTE,
  });

  assertSeverity("ok", "systemd", 0, {
    activeState: "active",
    result: "success",
    windowMs: 15 * MINUTE,
  });
  assertSeverity("warning", "systemd", 1, {
    activeState: "active",
    result: "success",
    windowMs: 15 * MINUTE,
  });
  assertSeverity("critical", "systemd", 0, {
    activeState: "failed",
    result: "exit-code",
    windowMs: 10 * MINUTE,
  });
  assertSeverity("critical", "systemd", 0, {
    activeState: "inactive",
    result: "success",
    windowMs: 10 * MINUTE,
  });
  assertSeverity("critical", "systemd", 3, {
    activeState: "active",
    result: "success",
    windowMs: 10 * MINUTE,
  });

  assertSeverity("ok", "cpu", 95, { sustainedMs: 9 * MINUTE });
  assertSeverity("warning", "cpu", 80, { sustainedMs: 10 * MINUTE });
  assertSeverity("critical", "cpu", 95, { sustainedMs: 10 * MINUTE });
  assertSeverity("warning", "ram", 85, { sustainedMs: 10 * MINUTE, oom: false });
  assertSeverity("critical", "ram", 95, { sustainedMs: 10 * MINUTE, oom: false });
  assertSeverity("critical", "ram", 20, { sustainedMs: 0, oom: true });

  assertSeverity("ok", "disk", 20, { freeBytes: 10 * GIB, requiredBytes: 2 * GIB });
  assertSeverity("warning", "disk", 19.99, {
    freeBytes: 10 * GIB,
    requiredBytes: 2 * GIB,
  });
  assertSeverity("critical", "disk", 9.99, {
    freeBytes: 10 * GIB,
    requiredBytes: 2 * GIB,
  });
  assertSeverity("critical", "disk", 50, {
    freeBytes: 4 * GIB,
    requiredBytes: 2 * GIB,
  });

  assertSeverity("ok", "backup_age", 26 * HOUR - MINUTE, {
    lastResult: "success",
    integrityOk: true,
    restoreOk: true,
  });
  assertSeverity("warning", "backup_age", 26 * HOUR, {
    lastResult: "success",
    integrityOk: true,
    restoreOk: true,
  });
  assertSeverity("critical", "backup_age", 48 * HOUR, {
    lastResult: "success",
    integrityOk: true,
    restoreOk: true,
  });
  assertSeverity("critical", "backup_age", HOUR, {
    lastResult: "success",
    integrityOk: false,
    restoreOk: true,
  });

  assertSeverity("ok", "tls_expiry", 31, { hostnameValid: true, chainValid: true });
  assertSeverity("warning", "tls_expiry", 30, { hostnameValid: true, chainValid: true });
  assertSeverity("critical", "tls_expiry", 14, { hostnameValid: true, chainValid: true });
  assertSeverity("critical", "tls_expiry", 90, { hostnameValid: false, chainValid: true });

  assertSeverity("ok", "onec_ready", 4, { oldestAgeMs: 9 * MINUTE + 59_000 });
  assertSeverity("warning", "onec_ready", 5, { oldestAgeMs: 2 * MINUTE });
  assertSeverity("warning", "onec_ready", 1, { oldestAgeMs: 10 * MINUTE });
  assertSeverity("critical", "onec_ready", 20, { oldestAgeMs: 2 * MINUTE });
  assertSeverity("critical", "onec_ready", 1, { oldestAgeMs: 30 * MINUTE });

  assertSeverity("ok", "onec_sending", 1, {
    oldestAgeMs: 9 * MINUTE + 59_000,
    stuckCount: 0,
    requeuesPerOrderHour: 0,
  });
  assertSeverity("warning", "onec_sending", 1, {
    oldestAgeMs: 10 * MINUTE,
    stuckCount: 0,
    requeuesPerOrderHour: 0,
  });
  assertSeverity("warning", "onec_sending", 1, {
    oldestAgeMs: 16 * MINUTE - 1_000,
    stuckCount: 0,
    requeuesPerOrderHour: 0,
  });
  assertSeverity("critical", "onec_sending", 1, {
    oldestAgeMs: 16 * MINUTE,
    stuckCount: 0,
    requeuesPerOrderHour: 0,
  });
  assertSeverity("critical", "onec_sending", 1, {
    oldestAgeMs: 16 * MINUTE,
    stuckCount: 1,
    requeuesPerOrderHour: 0,
  });
  assertSeverity("critical", "onec_sending", 1, {
    oldestAgeMs: MINUTE,
    stuckCount: 0,
    requeuesPerOrderHour: 3,
  });

  assertSeverity("warning", "onec_ack_rejection", 1, {
    windowMs: 10 * MINUTE,
    contourMismatch: false,
    collision: false,
  });
  assertSeverity("critical", "onec_ack_rejection", 3, {
    windowMs: 10 * MINUTE,
    contourMismatch: false,
    collision: false,
  });
  assertSeverity("critical", "onec_ack_rejection", 1, {
    windowMs: MINUTE,
    contourMismatch: true,
    collision: false,
  });
});

function stateDecision(signalId, severity, scope = "fixture", summaryCode = `${signalId}.${severity}`) {
  return {
    signal: signalId,
    signalId,
    scope,
    severity,
    summaryCode,
    value: severity === "ok" ? 0 : 1,
    openAfter: 1,
    recoveryAfter: 2,
    cooldownMs: 15 * MINUTE,
    facts: { count: severity === "ok" ? 0 : 1 },
  };
}

test("alert state deduplicates, escalates, survives restart and recovers once", () => {
  const options = {
    environment: "test",
    maxPerRun: 10,
    maxPerHour: 20,
  };
  const machine = createAlertStateMachine(options);
  const warning = stateDecision("onec_ready", "warning", "VLAVKA");

  const opened = machine.evaluate([warning], NOW_MS);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].type, "alert");
  assert.equal(opened[0].severity, "warning");

  assert.deepEqual(machine.evaluate([warning], NOW_MS + MINUTE), [], "repeat is deduplicated");

  const critical = stateDecision("onec_ready", "critical", "VLAVKA");
  const escalated = machine.evaluate([critical], NOW_MS + 2 * MINUTE);
  assert.equal(escalated.length, 1, "severity escalation bypasses cooldown");
  assert.equal(escalated[0].severity, "critical");

  const persisted = JSON.parse(JSON.stringify(machine.snapshot()));
  const restarted = createAlertStateMachine({ ...options, initial: persisted });
  assert.deepEqual(
    restarted.evaluate([critical], NOW_MS + 3 * MINUTE),
    [],
    "process restart must not resend an active alert"
  );

  const healthy = stateDecision("onec_ready", "ok", "VLAVKA", "onec_ready.ok");
  assert.deepEqual(restarted.evaluate([healthy], NOW_MS + 4 * MINUTE), []);
  const recovered = restarted.evaluate([healthy], NOW_MS + 5 * MINUTE);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].type, "recovery");
  assert.deepEqual(restarted.evaluate([healthy], NOW_MS + 6 * MINUTE), []);
});

test("alert state enforces a global storm budget", () => {
  const machine = createAlertStateMachine({
    environment: "test",
    maxPerRun: 3,
    maxPerHour: 3,
  });
  const decisions = Array.from({ length: 8 }, (_, index) =>
    stateDecision(`fixture_${index}`, "critical", "global")
  );
  const emitted = machine.evaluate(decisions, NOW_MS);
  assert.ok(emitted.length <= 3, "alert storm must be bounded to configured budget");
  assert.equal(new Set(emitted.map((item) => item.fingerprint)).size, emitted.length);
});

test("persisted alert state rejects oversized, excessive, malformed and future data", () => {
  const base = createAlertStateMachine({ environment: "test" }).snapshot();
  assert.throws(
    () => createAlertStateMachine({
      environment: "test",
      initial: { ...base, notificationWindow: { startedAt: NOW_ISO, count: -1 } },
    }),
    /alert_state_notification_count_invalid/u
  );
  assert.throws(
    () => createAlertStateMachine({
      environment: "test",
      initial: {
        ...base,
        entries: Object.fromEntries(
          Array.from({ length: 129 }, (_, index) => [`test:fixture_${index}:global`, {}])
        ),
      },
    }),
    /alert_state_entries_too_many/u
  );

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-state-"));
  try {
    const oversizedPath = path.join(tempDir, "oversized.json");
    writeFileSync(oversizedPath, "x".repeat(256 * 1024 + 1));
    assert.throws(() => loadAlertState(oversizedPath, "test"), /alert_state_too_large/u);

    const futurePath = path.join(tempDir, "future.json");
    writeFileSync(futurePath, JSON.stringify({
      ...base,
      notificationWindow: {
        startedAt: new Date(Date.now() + 10 * MINUTE).toISOString(),
        count: 1,
      },
    }));
    assert.throws(() => loadAlertState(futurePath, "test"), /alert_state_notification_window_invalid/u);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("sanitizer removes secrets, PII and raw identifiers but keeps bounded facts", () => {
  const canaries = [
    "stage9-secret-token-123456789",
    "person.stage9@example.com",
    "+79991234567",
    "203.0.113.42",
    "CL-260928-005036-481",
    "NPNF-004468",
    "C:\\private\\clover\\server.env",
  ];
  const clean = sanitizeAlertPayload({
    environment: "test",
    signalId: "onec_ack_rejection",
    scope: "VLAVKA",
    severity: "critical",
    summaryCode: "onec.ack.contour_mismatch",
    correlationHash: "sha256:0123456789abcdef",
    facts: { count: 3 },
    token: canaries[0],
    email: canaries[1],
    phone: canaries[2],
    ip: canaries[3],
    orderNumber: canaries[4],
    documentNumber: canaries[5],
    path: canaries[6],
    nested: { cookie: "session=stage9-secret-token-123456789", note: canaries.join(" ") },
  });
  const serialized = JSON.stringify(clean);
  for (const canary of canaries) {
    assert.ok(!serialized.includes(canary), `sanitizer leaked canary: ${canary}`);
  }
  assert.equal(clean.signalId, "onec_ack_rejection");
  assert.equal(clean.scope, "VLAVKA");
  assert.equal(clean.severity, "critical");
  assert.equal(clean.facts.count, 3);
  assert.ok(serialized.length <= 2_048, "alert payload must remain bounded");
});

test("runtime kill switches are strict, fail closed and expose status only", () => {
  assert.equal(isRuntimeFeaturePaused("registration", {}), false, "unset switch is not paused");
  assert.equal(isRuntimeFeaturePaused("registration", { CLOVER_PAUSE_REGISTRATION: "false" }), false);
  assert.equal(isRuntimeFeaturePaused("registration", { CLOVER_PAUSE_REGISTRATION: "true" }), true);

  for (const invalid of ["TRUE", "False", "1", "yes", " true ", ""]) {
    const env = { CLOVER_PAUSE_REGISTRATION: invalid };
    assert.equal(isRuntimeFeaturePaused("registration", env), true, `invalid ${JSON.stringify(invalid)} fails closed`);
    assert.deepEqual(runtimeKillSwitchStatus(env).registration, {
      configured: true,
      valid: false,
      paused: true,
    });
  }

  assert.equal(
    isOutboundChannelPaused("email", {
      CLOVER_PAUSE_OUTBOUND_NOTIFICATIONS: "true",
      CLOVER_PAUSE_EMAIL: "false",
    }),
    true,
    "global outbound pause dominates an enabled channel"
  );
  assert.equal(
    isOutboundChannelPaused("email", {
      CLOVER_PAUSE_OUTBOUND_NOTIFICATIONS: "false",
      CLOVER_PAUSE_EMAIL: "true",
    }),
    true,
    "channel pause applies when global outbound is enabled"
  );
  assert.equal(
    isOutboundChannelPaused("email", {
      CLOVER_PAUSE_OUTBOUND_NOTIFICATIONS: "false",
      CLOVER_PAUSE_EMAIL: "false",
    }),
    false
  );

  const secretCanary = "stage9-runtime-secret-value";
  const statusJson = JSON.stringify(runtimeKillSwitchStatus({
    CLOVER_PAUSE_REGISTRATION: "true",
    CLOVER_PAUSE_EMAIL: secretCanary,
  }));
  assert.doesNotMatch(statusJson, /CLOVER_PAUSE_/u);
  assert.ok(!statusJson.includes(secretCanary));
  assert.doesNotMatch(statusJson, /"true"/u, "raw environment values must not be reflected");
});

test("paused runtime middleware returns bounded non-cacheable 503 without next", () => {
  const envName = "CLOVER_PAUSE_REGISTRATION";
  const previous = process.env[envName];
  let nextCalls = 0;
  const headers = new Map();
  const response = {
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  try {
    process.env[envName] = "true";
    const middleware = requireRuntimeFeature("registration");
    middleware({}, response, () => { nextCalls += 1; });
  } finally {
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
  }

  assert.equal(response.statusCode, 503);
  assert.equal(nextCalls, 0);
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(headers.get("pragma"), "no-cache");
  assert.equal(headers.get("retry-after"), "60");
  assert.deepEqual(response.body, {
    error: "Функция временно приостановлена.",
    code: "FEATURE_PAUSED",
  });
});

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

test("1C queue contract aggregates a SQLite fixture without modifying it", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-monitoring-"));
  const dbPath = path.join(tempDir, "queue.sqlite");
  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
    const insert = db.prepare(
      "INSERT INTO orders(id,user_id,payload_json,created_at,updated_at) VALUES(?,?,?,?,?)"
    );
    const add = (id, payload, ageMs) => {
      const stamp = new Date(NOW_MS - ageMs).toISOString();
      insert.run(id, "fixture-user", JSON.stringify(payload), stamp, stamp);
    };
    add("ready-vlavka", {
      number: "PII-MUST-NOT-LEAVE-QUEUE-READER",
      exchange: { status: "ready", database: "VLAVKA", lastAttemptAt: new Date(NOW_MS - 12 * MINUTE).toISOString() },
    }, 12 * MINUTE);
    add("ready-test", {
      exchange: { status: "ready", database: "TEST", lastAttemptAt: new Date(NOW_MS - 2 * MINUTE).toISOString() },
    }, 2 * MINUTE);
    add("sending-vlavka", {
      exchange: { status: "sending", database: "VLAVKA", lastAttemptAt: new Date(NOW_MS - 17 * MINUTE).toISOString() },
    }, 17 * MINUTE);
    add("sending-test", {
      exchange: { status: "sending", database: "TEST", lastAttemptAt: new Date(NOW_MS - 3 * MINUTE).toISOString() },
    }, 3 * MINUTE);
    add("ready-unknown", {
      exchange: { status: "ready", database: "ROGUE", lastAttemptAt: new Date(NOW_MS - MINUTE).toISOString() },
    }, MINUTE);
    insert.run(
      "malformed",
      "fixture-user",
      "{not-json",
      NOW_ISO,
      NOW_ISO
    );
    db.close();

    const before = { hash: sha256(dbPath), ...statSync(dbPath) };
    const queue = readOneCQueueSnapshot({ dbPath, now: NOW_MS });
    const after = { hash: sha256(dbPath), ...statSync(dbPath) };

    assert.deepEqual(queue.ready, { count: 3, oldestAgeMs: 12 * MINUTE });
    assert.deepEqual(queue.sending, {
      count: 2,
      oldestAgeMs: 17 * MINUTE,
      stuckCount: 1,
    });
    assert.equal(queue.malformedCount, 1);
    assert.deepEqual(queue.contours.TEST, { ready: 1, sending: 1, stuck: 0 });
    assert.deepEqual(queue.contours.VLAVKA, { ready: 1, sending: 1, stuck: 1 });
    assert.deepEqual(queue.contours.UNKNOWN, { ready: 1, sending: 0, stuck: 0 });
    assert.equal(queue.unknownContourCount, 1);
    assert.equal(decision("onec.contour_mismatch", queue.unknownContourCount).severity, "critical");
    assert.ok(!JSON.stringify(queue).includes("ready-vlavka"));
    assert.ok(!JSON.stringify(queue).includes("PII-MUST-NOT-LEAVE"));
    assert.equal(after.hash, before.hash, "read-only collector changed database bytes");
    assert.equal(after.size, before.size, "read-only collector changed database size");
    assert.equal(after.mtimeMs, before.mtimeMs, "read-only collector changed database mtime");

    const repeated = readOneCQueueSnapshot({ dbPath, now: NOW_MS });
    assert.deepEqual(repeated, queue, "repeated GET/read must be deterministic");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("audit collector reads only allowlisted aggregates and leaves SQLite unchanged", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-audit-"));
  const dbPath = path.join(tempDir, "audit.sqlite");
  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        user_email TEXT,
        user_role TEXT,
        action TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
    `);
    const insert = db.prepare("INSERT INTO audit_log VALUES(?,?,?,?,?,?,?)");
    const secretCanary = "stage9-audit-person@example.com CL-SECRET-ORDER token-secret";
    insert.run("1", "u1", "stage9-audit-person@example.com", "admin", "one-c.order.ack.rejected", JSON.stringify({ raw: secretCanary }), NOW_ISO);
    insert.run("2", "u1", "stage9-audit-person@example.com", "admin", "one-c.claim.expired-requeue", JSON.stringify({ raw: secretCanary }), NOW_ISO);
    insert.run("3", "u1", "stage9-audit-person@example.com", "admin", "one-c.auth.denied", JSON.stringify({ raw: secretCanary }), NOW_ISO);
    insert.run("4", "u1", "stage9-audit-person@example.com", "admin", "auth.login", JSON.stringify({ raw: secretCanary }), NOW_ISO);
    insert.run("5", "u1", "stage9-audit-person@example.com", "admin", "one-c.contour.mismatch", JSON.stringify({ raw: secretCanary }), NOW_ISO);
    db.close();

    const before = { hash: sha256(dbPath), ...statSync(dbPath) };
    const aggregate = readAuditMonitoringSnapshot({ dbPath, now: NOW_MS, windowMs: 10 * MINUTE });
    const after = { hash: sha256(dbPath), ...statSync(dbPath) };
    assert.deepEqual(aggregate, {
      windowMs: 10 * MINUTE,
      ackRejected: 1,
      contourMismatch: 1,
      claimRequeue: 1,
      authDenied: 1,
    });
    assert.ok(!JSON.stringify(aggregate).includes(secretCanary));
    assert.equal(after.hash, before.hash);
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeMs, before.mtimeMs);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("monitor emits one canonical ACK rejection signal and a critical contour signal", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-monitor-"));
  try {
    const result = await runMonitor({
      environment: "test",
      dbPath: "fixture.sqlite",
      statePath: "fixture-state.json",
      statusFilePath: writeValidStatusFixture(tempDir),
      now: NOW_MS,
    }, {
    now: () => NOW_MS,
    readOneCQueueSnapshot: () => ({
      ready: { count: 0, oldestAgeMs: 0 },
      sending: { count: 0, oldestAgeMs: 0, stuckCount: 0 },
      malformedCount: 0,
      unknownContourCount: 1,
    }),
    readAuditMonitoringSnapshot: () => ({
      windowMs: 10 * MINUTE,
      ackRejected: 1,
      contourMismatch: 1,
      claimRequeue: 0,
      authDenied: 0,
    }),
    collectOperationalFacts: async () => operationalFixture(),
    loadState: () => ({
      schemaVersion: 1,
      environment: "test",
      entries: {},
      notificationWindow: { startedAt: "", count: 0 },
    }),
    saveState: () => {},
    writeNdjson: () => {},
    alertSink: { emit: (events) => ({ delivered: events.length, failed: 0 }) },
    statusEnv: {},
    });
    assert.ok(Object.hasOwn(result.snapshot.signals, "onec_ack_rejection"));
    assert.ok(!Object.hasOwn(result.snapshot.signals, "onec.ack_rejected"));
    assert.equal(result.snapshot.signals["onec.contour_mismatch"].value, 2);
    const contourDecision = evaluateMonitoringSnapshot(result.snapshot)
      .find((item) => item.signalId === "onec.contour_mismatch");
    assert.equal(contourDecision?.severity, "critical");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("systemd monitor ordering cannot pull API, UI or nginx into the transaction", () => {
  const service = readFileSync(
    path.join(REPOSITORY_DIRECTORY, "ops", "systemd", "clover-monitor.service"),
    "utf8"
  );
  const timer = readFileSync(
    path.join(REPOSITORY_DIRECTORY, "ops", "systemd", "clover-monitor.timer"),
    "utf8"
  );
  assert.match(service, /^Wants=clover-monitor-snapshot\.service$/mu);
  assert.doesNotMatch(service, /^Requires=clover-monitor-snapshot\.service$/mu);
  assert.doesNotMatch(service, /^Requires=.*(?:clover-api|clover-ui|nginx)/mu);
  assert.doesNotMatch(timer, /^\s*Wants\s*=/gmu);
  assert.doesNotMatch(timer, /^\s*Requires\s*=/gmu);
  assert.match(service, /^After=clover-monitor-snapshot\.service clover-api\.service clover-ui\.service nginx\.service$/mu);
  assert.doesNotMatch(service, /server\/\.env|--env-file/u);
  assert.match(service, /^EnvironmentFile=\/etc\/clover\/monitor-status\.env$/mu);
  assert.match(service, /^ReadOnlyPaths=.*\/var\/lib\/clover-monitor-evidence.*\/etc\/clover\/monitor-status\.env$/mu);
  assert.doesNotMatch(service, /^ReadWritePaths=.*clover-monitor-evidence/mu);
});

test("sanitized status file is allowlisted, output is secret-free, and collector snapshot is complete", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-env-"));
  const envPath = path.join(tempDir, "fixture.env");
  const secret = "stage9-env-secret-canary-0123456789";
  const emitted = [];
  try {
    writeFileSync(envPath, [
      "CLOVER_PAUSE_EMAIL=true",
      "CLOVER_PAUSE_PUSH=false",
      `SMTP_PASSWORD=${secret}`,
      `ONEC_VLAVKA_EXCHANGE_API_KEY=${secret}`,
      `UNLISTED_SECRET=${secret}`,
      "",
    ].join("\n"), "utf8");
    const result = await runMonitor({
      environment: "test",
      dbPath: path.join(tempDir, "not-opened.sqlite"),
      statePath: path.join(tempDir, "state.json"),
      statusFilePath: envPath,
      now: NOW_MS,
    }, {
      now: () => NOW_MS,
      readOneCQueueSnapshot: () => ({
        ready: { count: 0, oldestAgeMs: 0 },
        sending: { count: 0, oldestAgeMs: 0, stuckCount: 0 },
        malformedCount: 0,
        unknownContourCount: 0,
        contours: {
          TEST: { ready: 0, sending: 0, stuck: 0 },
          VLAVKA: { ready: 0, sending: 0, stuck: 0 },
          UNKNOWN: { ready: 0, sending: 0, stuck: 0 },
        },
      }),
      readAuditMonitoringSnapshot: () => ({
        windowMs: 10 * MINUTE,
        ackRejected: 0,
        contourMismatch: 0,
        claimRequeue: 0,
        authDenied: 0,
      }),
      collectOperationalFacts: async () => operationalFixture(),
      loadState: () => ({
        schemaVersion: 1,
        environment: "test",
        entries: {},
        notificationWindow: { startedAt: "", count: 0 },
      }),
      saveState: () => {},
      writeNdjson: (record) => emitted.push(record),
      alertSink: { emit: (events) => ({ delivered: events.length, failed: 0 }) },
      statusEnv: {},
    });

    assert.equal(result.output.killSwitches.email.paused, true);
    assert.equal(result.output.killSwitches.push.paused, false);
    const serialized = JSON.stringify(emitted);
    assert.ok(!serialized.includes(secret));
    assert.doesNotMatch(serialized, /SMTP_PASSWORD|EXCHANGE_API_KEY|UNLISTED_SECRET/u);
    assert.doesNotMatch(serialized, /CLOVER_PAUSE_EMAIL|CLOVER_PAUSE_PUSH/u);
    const requiredSignals = [
      "availability",
      "systemd",
      "cpu",
      "ram",
      "disk",
      "backup_age",
      "tls_expiry",
      "onec_ready",
      "onec_sending",
      "onec_ack_rejection",
      "deploy_failure",
      "deploy_rollback",
      "monitor.probe_errors",
      "onec.queue.stuck",
      "onec.contour_mismatch",
      "onec.claim_requeue",
      "auth.denied",
    ];
    for (const signalId of requiredSignals) {
      assert.ok(
        Object.hasOwn(result.snapshot.signals, signalId),
        `collector omitted configured signal ${signalId}`
      );
    }
    assert.ok(!Object.hasOwn(result.snapshot.signals, "onec.ack_rejected"));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("persisted alert state rejects oversized and malicious content", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-state-"));
  try {
    const oversized = path.join(tempDir, "oversized.json");
    writeFileSync(oversized, JSON.stringify({
      schemaVersion: 1,
      environment: "test",
      padding: "x".repeat(256 * 1024),
    }), "utf8");
    assert.throws(() => loadAlertState(oversized, "test"), /alert_state_too_large/u);

    const malicious = path.join(tempDir, "malicious.json");
    writeFileSync(malicious, JSON.stringify({
      schemaVersion: 1,
      environment: "test",
      entries: {
        "../escape": {
          status: "open",
          severity: "critical",
          summaryCode: "BAD",
          firstSeenAt: NOW_ISO,
          lastSeenAt: NOW_ISO,
          lastNotifiedAt: "",
          consecutiveFailures: 1,
          consecutiveSuccesses: 0,
          suppressed: 0,
        },
      },
      notificationWindow: { startedAt: NOW_ISO, count: 0 },
    }), "utf8");
    assert.throws(() => loadAlertState(malicious, "test"), /alert_state_entry_key_invalid/u);
    assert.equal({}.polluted, undefined);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("ACK is contour-authenticated and idempotent but not disabled by the pull switch", () => {
  const source = readFileSync(path.join(SERVER_DIRECTORY, "src", "server.js"), "utf8");
  const start = source.indexOf('app.post("/api/one-c/orders/:orderId/ack"');
  const end = source.indexOf('app.post("/api/one-c/orders/accepted"', start);
  assert.ok(start >= 0 && end > start, "ACK route source not found");
  const route = source.slice(start, end);
  assert.match(route, /requireOneCAllowedDatabase\(req, res\)/u);
  assert.match(route, /runInTransaction\(/u);
  assert.match(route, /previous\.status === "sent"/u);
  assert.match(route, /one-c\.order\.ack\.duplicate/u);
  assert.match(route, /ACK_DOCUMENT_MISMATCH/u);
  assert.match(route, /DOCUMENT_NUMBER_IN_USE/u);
  assert.doesNotMatch(
    route,
    /requireRuntimeFeature\("oneCClaims"\)|isRuntimeFeaturePaused\("oneCClaims"\)/u
  );
});

test("reconciliation PDF kill switch runs before multer and every route write", () => {
  const source = readFileSync(path.join(SERVER_DIRECTORY, "src", "server.js"), "utf8");
  const start = source.indexOf('"/api/admin/reconciliation/:requestId/file"');
  const end = source.indexOf('app.get("/api/reconciliation/:requestId/file"', start);
  assert.ok(start >= 0 && end > start, "reconciliation upload route source not found");
  const route = source.slice(start, end);
  const gate = route.indexOf('requireRuntimeFeature("uploads")');
  const multer = route.indexOf('reconciliationUpload.single("file")');
  const writes = [route.indexOf("unlinkSync("), route.indexOf("updateReconciliationRequest(")]
    .filter((index) => index >= 0);
  assert.ok(gate >= 0, "upload gate missing");
  assert.ok(multer > gate, "kill switch must run before multer writes a temporary file");
  assert.ok(writes.length > 0 && writes.every((index) => index > multer));

  const inboundStart = source.indexOf('app.post("/api/one-c/reconciliation/:requestId/result"');
  const inboundEnd = source.indexOf('app.get("/api/reconciliation"', inboundStart);
  assert.ok(inboundStart >= 0 && inboundEnd > inboundStart, "1C reconciliation result route not found");
  const inbound = source.slice(inboundStart, inboundEnd);
  const auth = inbound.indexOf("requireOneCAllowedDatabase(req, res)");
  const paused = inbound.indexOf('isRuntimeFeaturePaused("uploads")');
  const response = inbound.indexOf("sendRuntimeFeaturePaused(res)");
  const lookup = inbound.indexOf("getReconciliationRequestInternal(");
  const decode = inbound.indexOf("Buffer.from(");
  const unlink = inbound.indexOf("unlinkSync(");
  const write = inbound.indexOf("writeFileSync(");
  assert.ok(auth >= 0 && paused > auth && response > paused);
  assert.ok([lookup, decode, unlink, write].every((index) => index > response));
});

test("three five-minute availability failures persist and two healthy runs recover once", () => {
  let observationState = createObservationState("test");
  const alertMachine = createAlertStateMachine({ environment: "test", recoveryPasses: 2 });
  const run = (now, failed) => {
    const operational = operationalFixture();
    operational.availability.api = {
      status: "ok",
      value: failed ? 1 : 0,
      scope: "api",
      facts: { attempts: 1, statusCode: failed ? 503 : 200 },
    };
    const applied = applyObservationState({
      environment: "test",
      now,
      operational,
      previous: observationState,
    });
    observationState = applied.nextState;
    const api = applied.operational.availability.api;
    const [ruleDecision] = evaluateMonitoringSnapshot({
      schemaVersion: 1,
      environment: "test",
      collectedAt: new Date(now).toISOString(),
      signals: { availability: api },
    });
    return { api, events: alertMachine.evaluate([ruleDecision], now) };
  };

  const first = run(NOW_MS, true);
  assert.equal(first.api.facts.consecutiveFailures, 1);
  assert.equal(first.api.facts.outageAgeMs, 0);
  assert.deepEqual(first.events, []);
  const second = run(NOW_MS + 5 * MINUTE, true);
  assert.equal(second.api.facts.consecutiveFailures, 2);
  assert.equal(second.api.facts.outageAgeMs, 5 * MINUTE);
  assert.equal(second.events.length, 1);
  assert.equal(second.events[0].severity, "critical");
  const third = run(NOW_MS + 10 * MINUTE, true);
  assert.equal(third.api.facts.consecutiveFailures, 3);
  assert.deepEqual(third.events, [], "active outage is deduplicated during cooldown");

  const healthyOne = run(NOW_MS + 15 * MINUTE, false);
  assert.equal(healthyOne.api.facts.consecutiveFailures, 0);
  assert.equal(healthyOne.api.facts.outageAgeMs, 0);
  assert.deepEqual(healthyOne.events, []);
  const healthyTwo = run(NOW_MS + 20 * MINUTE, false);
  assert.equal(healthyTwo.events.length, 1);
  assert.equal(healthyTwo.events[0].type, "recovery");
});

test("CPU and RAM sustained windows reset after a healthy observation", () => {
  let observationState = createObservationState("test");
  const run = (now, cpu, ram) => {
    const operational = operationalFixture();
    operational.resources.cpu = { status: "ok", value: cpu, scope: "global", facts: {} };
    operational.resources.ram = { status: "ok", value: ram, scope: "global", facts: {} };
    const applied = applyObservationState({
      environment: "test", now, operational, previous: observationState,
    });
    observationState = applied.nextState;
    return applied.operational.resources;
  };

  const first = run(NOW_MS, 80, 85);
  assert.equal(first.cpu.facts.sustainedMs, 0);
  assert.equal(first.ram.facts.sustainedMs, 0);
  const sustained = run(NOW_MS + 10 * MINUTE, 80, 85);
  assert.equal(sustained.cpu.facts.sustainedMs, 10 * MINUTE);
  assert.equal(sustained.ram.facts.sustainedMs, 10 * MINUTE);
  assert.equal(decision("cpu", sustained.cpu.value, sustained.cpu.facts).severity, "warning");
  assert.equal(decision("ram", sustained.ram.value, sustained.ram.facts).severity, "warning");
  const reset = run(NOW_MS + 11 * MINUTE, 20, 20);
  assert.equal(reset.cpu.facts.sustainedMs, 0);
  assert.equal(reset.ram.facts.sustainedMs, 0);
  const newSpike = run(NOW_MS + 12 * MINUTE, 99, 99);
  assert.equal(newSpike.cpu.facts.sustainedMs, 0);
  assert.equal(newSpike.ram.facts.sustainedMs, 0);
  assert.equal(decision("cpu", newSpike.cpu.value, newSpike.cpu.facts).severity, "ok");
  assert.equal(decision("ram", newSpike.ram.value, newSpike.ram.facts).severity, "ok");
});

test("systemd uses restart deltas and treats counter reset/reboot as a new baseline", () => {
  let observationState = createObservationState("test");
  const run = (now, counter) => {
    const operational = operationalFixture();
    operational.systemd.api = {
      status: "ok",
      value: counter,
      scope: "api",
      facts: { activeState: "active", result: "success" },
    };
    const applied = applyObservationState({
      environment: "test", now, operational, previous: observationState,
    });
    observationState = applied.nextState;
    return applied.operational.systemd.api;
  };

  const baseline = run(NOW_MS, 8);
  assert.equal(baseline.value, 0);
  assert.equal(baseline.facts.counterReset, false);
  const increment = run(NOW_MS + 5 * MINUTE, 9);
  assert.equal(increment.value, 1);
  assert.equal(increment.facts.windowMs, 5 * MINUTE);
  const unchanged = run(NOW_MS + 10 * MINUTE, 9);
  assert.equal(unchanged.value, 1, "the prior increment remains inside the rolling window");
  const rebootReset = run(NOW_MS + 15 * MINUTE, 1);
  assert.equal(rebootReset.value, 0);
  assert.equal(rebootReset.facts.counterReset, true);
  const afterReset = run(NOW_MS + 20 * MINUTE, 2);
  assert.equal(afterReset.value, 1);
  assert.equal(afterReset.facts.counterReset, false);
});

test("structured deploy receipts distinguish recent failure, rollback and stale history", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-deploy-"));
  const receiptPath = path.join(tempDir, "deploy-status.json");
  const releaseSha = "a".repeat(40);
  try {
    writeFileSync(receiptPath, JSON.stringify(createDeployReceipt({
      environment: "test",
      event: "failure",
      result: "failed",
      occurredAt: new Date(NOW_MS - MINUTE).toISOString(),
      releaseSha,
    })), "utf8");
    assert.deepEqual(collectDeploy({
      receiptPath, environment: "test", now: NOW_MS, windowMs: 15 * MINUTE,
    }), {
      status: "ok",
      failures: 1,
      rollbacks: 0,
      ageMs: MINUTE,
      result: "failed",
    });

    writeFileSync(receiptPath, JSON.stringify(createDeployReceipt({
      environment: "test",
      event: "rollback",
      result: "rollback_succeeded",
      occurredAt: new Date(NOW_MS - 2 * MINUTE).toISOString(),
      releaseSha,
    })), "utf8");
    const rollback = collectDeploy({
      receiptPath, environment: "test", now: NOW_MS, windowMs: 15 * MINUTE,
    });
    assert.equal(rollback.status, "ok");
    assert.equal(rollback.failures, 0);
    assert.equal(rollback.rollbacks, 1);
    assert.equal(rollback.result, "rollback_succeeded");

    writeFileSync(receiptPath, JSON.stringify(createDeployReceipt({
      environment: "test",
      event: "failure",
      result: "failed",
      occurredAt: new Date(NOW_MS - 16 * MINUTE).toISOString(),
      releaseSha,
    })), "utf8");
    const stale = collectDeploy({
      receiptPath, environment: "test", now: NOW_MS, windowMs: 15 * MINUTE,
    });
    assert.equal(stale.status, "ok");
    assert.equal(stale.failures, 0);
    assert.equal(stale.rollbacks, 0);
    assert.equal(stale.ageMs, 16 * MINUTE);

    writeFileSync(receiptPath, "{truncated", "utf8");
    assert.equal(collectDeploy({ receiptPath, environment: "test", now: NOW_MS }).status, "unknown");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("backup evidence binds archive size and carries integrity/restore results", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-backup-"));
  const archivePath = path.join(tempDir, "clover-data-env.20260928T115900Z.tgz");
  const evidencePath = path.join(tempDir, "backup-status.json");
  const completedAt = new Date(NOW_MS - MINUTE).toISOString();
  try {
    assert.throws(() => createBackupEvidence({
      environment: "test",
      completedAt,
      result: "success",
      archiveSize: 1,
      integrityOk: true,
      integrityCheckedAt: completedAt,
      restoreOk: true,
      restoreCheckedAt: completedAt,
      restoreFixture: true,
    }), /backup_evidence_sha_(?:required|invalid)/u);
    writeFileSync(archivePath, "valid-backup-fixture", "utf8");
    utimesSync(archivePath, new Date(completedAt), new Date(completedAt));
    writeFileSync(evidencePath, JSON.stringify(createBackupEvidence({
      environment: "test",
      completedAt,
      result: "success",
      archiveSize: statSync(archivePath).size,
      archiveSha256: sha256(archivePath),
      integrityOk: true,
      integrityCheckedAt: completedAt,
      restoreOk: true,
      restoreCheckedAt: completedAt,
      restoreFixture: true,
    })), "utf8");
    const healthy = collectBackup({
      backupDirectory: tempDir, evidencePath, environment: "test", now: NOW_MS,
    });
    assert.equal(healthy.status, "ok");
    assert.equal(healthy.facts.lastResult, "success");
    assert.equal(healthy.facts.integrityOk, true);
    assert.equal(healthy.facts.restoreOk, true);

    for (const [label, integrityCheckedAt, restoreCheckedAt] of [
      ["out-of-order", new Date(NOW_MS).toISOString(), completedAt],
      ["stale-check", new Date(NOW_MS - 20 * MINUTE).toISOString(), new Date(NOW_MS - 20 * MINUTE).toISOString()],
    ]) {
      writeFileSync(evidencePath, JSON.stringify(createBackupEvidence({
        environment: "test",
        completedAt,
        result: "success",
        archiveSize: statSync(archivePath).size,
        archiveSha256: sha256(archivePath),
        integrityOk: true,
        integrityCheckedAt,
        restoreOk: true,
        restoreCheckedAt,
        restoreFixture: true,
      })), "utf8");
      assert.equal(collectBackup({
        backupDirectory: tempDir, evidencePath, environment: "test", now: NOW_MS,
      }).status, "unknown", `${label} backup check timestamp must fail closed`);
    }

    writeFileSync(evidencePath, JSON.stringify(createBackupEvidence({
      environment: "test",
      completedAt,
      result: "success",
      archiveSize: statSync(archivePath).size,
      archiveSha256: sha256(archivePath),
      integrityOk: true,
      integrityCheckedAt: completedAt,
      restoreOk: true,
      restoreCheckedAt: completedAt,
      restoreFixture: true,
    })), "utf8");

    writeFileSync(archivePath, "cut", "utf8");
    utimesSync(archivePath, new Date(completedAt), new Date(completedAt));
    assert.equal(collectBackup({
      backupDirectory: tempDir, evidencePath, environment: "test", now: NOW_MS,
    }).status, "unknown", "truncated archive must not reuse successful evidence");

    writeFileSync(evidencePath, JSON.stringify(createBackupEvidence({
      environment: "test",
      completedAt,
      result: "success",
      archiveSize: statSync(archivePath).size,
      archiveSha256: sha256(archivePath),
      integrityOk: true,
      integrityCheckedAt: completedAt,
      restoreOk: false,
      restoreCheckedAt: completedAt,
      restoreFixture: true,
    })), "utf8");
    const failedRestore = collectBackup({
      backupDirectory: tempDir, evidencePath, environment: "test", now: NOW_MS,
    });
    assert.equal(failedRestore.status, "ok");
    assert.equal(failedRestore.facts.restoreOk, false);
    assert.equal(
      decision("backup_age", failedRestore.value, failedRestore.facts, "backup").severity,
      "critical"
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("throwing or backpressured alert sink does not commit notification state and next run retries", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-sink-"));
  const operational = operationalFixture();
  const emptyState = () => ({
    schemaVersion: 1,
    environment: "test",
    entries: {},
    notificationWindow: { startedAt: "", count: 0 },
  });
  const baseDeps = {
    now: () => NOW_MS,
    readOneCQueueSnapshot: () => ({
      ready: { count: 0, oldestAgeMs: 0 },
      sending: { count: 0, oldestAgeMs: 0, stuckCount: 0 },
      malformedCount: 0,
      unknownContourCount: 1,
    }),
    readAuditMonitoringSnapshot: () => ({
      windowMs: 10 * MINUTE,
      ackRejected: 0,
      contourMismatch: 0,
      claimRequeue: 0,
      authDenied: 0,
    }),
    collectOperationalFacts: async () => operational,
    loadObservationState: () => createObservationState("test"),
    saveObservationState: () => {},
    loadState: emptyState,
    writeNdjson: () => {},
    statusEnv: {},
  };
  const options = {
    environment: "test",
    dbPath: "fixture.sqlite",
    statePath: "fixture-alert-state.json",
    observationStatePath: "fixture-observation-state.json",
    statusFilePath: writeValidStatusFixture(tempDir),
    now: NOW_MS,
  };

  let saveCalls = 0;
  let firstFingerprint = "";
  try {
    await assert.rejects(
    runMonitor(options, {
      ...baseDeps,
      saveState: () => { saveCalls += 1; },
      alertSink: {
        emit(events) {
          firstFingerprint = events[0]?.fingerprint || "";
          throw new Error("fixture_sink_throw");
        },
      },
    }),
    /fixture_sink_throw/u
  );
  assert.equal(saveCalls, 0, "throwing sink must not mark alert notified");

  await assert.rejects(
    runMonitor(options, {
      ...baseDeps,
      saveState: () => { saveCalls += 1; },
      alertSink: { emit: () => ({ delivered: 0, failed: 1 }) },
    }),
    (error) => error?.code === "MONITOR_ALERT_SINK_FAILED"
  );
  assert.equal(saveCalls, 0, "backpressure must not mark alert notified");

  let retriedFingerprint = "";
  const retried = await runMonitor(options, {
    ...baseDeps,
    saveState: () => { saveCalls += 1; },
    alertSink: {
      emit(events) {
        retriedFingerprint = events[0]?.fingerprint || "";
        return { delivered: events.length, failed: 0 };
      },
    },
  });
    assert.equal(retried.events.length, 1);
    assert.equal(retriedFingerprint, firstFingerprint);
    assert.equal(saveCalls, 1, "state is committed only after acknowledged delivery");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("monitor evidence producer binds backup SHA-256 and rejects same-size tamper/future time", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-producer-"));
  const archiveDir = path.join(tempDir, "backups");
  const evidenceDir = path.join(tempDir, "evidence");
  const archivePath = path.join(archiveDir, "clover-data-env.20260928T115900Z.tgz");
  const evidencePath = path.join(evidenceDir, "backup-evidence.json");
  const producer = path.join(SERVER_DIRECTORY, "scripts", "write-monitor-evidence.mjs");
  try {
    mkdirSync(archiveDir, { recursive: true, mode: 0o750 });
    mkdirSync(evidenceDir, { recursive: true, mode: 0o750 });
    chmodSync(archiveDir, 0o750);
    chmodSync(evidenceDir, 0o750);
    writeFileSync(archivePath, "AAAA-monitor-backup", "utf8");
    const completedAt = new Date(NOW_MS - MINUTE).toISOString();
    utimesSync(archivePath, new Date(completedAt), new Date(completedAt));
    const produced = spawnSync(process.execPath, [
      producer, "backup",
      "--out", evidencePath,
      "--environment", "test",
      "--archive", archivePath,
      "--result", "success",
      "--integrity-ok", "true",
      "--restore-ok", "true",
      "--completed-at", completedAt,
    ], { encoding: "utf8" });
    assert.equal(produced.status, 0, produced.stderr);
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    assert.equal(evidence.archiveSha256, sha256(archivePath));
    if (process.platform !== "win32") {
      assert.equal(statSync(evidencePath).gid, statSync(evidenceDir).gid);
      assert.equal(statSync(evidencePath).mode & 0o777, 0o640);
    }
    assert.equal(path.dirname(evidencePath), evidenceDir);
    assert.notEqual(path.dirname(evidencePath), archiveDir);
    assert.equal(collectBackup({
      backupDirectory: archiveDir, evidencePath, environment: "test", now: NOW_MS,
    }).status, "ok");

    writeFileSync(archivePath, "BBBB-monitor-backup", "utf8");
    utimesSync(archivePath, new Date(completedAt), new Date(completedAt));
    assert.equal(statSync(archivePath).size, evidence.archiveSize);
    assert.equal(collectBackup({
      backupDirectory: archiveDir, evidencePath, environment: "test", now: NOW_MS,
    }).status, "unknown", "same-size archive tamper must fail SHA-256 binding");

    const futurePath = path.join(evidenceDir, "future-backup.json");
    const future = spawnSync(process.execPath, [
      producer, "backup",
      "--out", futurePath,
      "--environment", "test",
      "--archive", archivePath,
      "--result", "success",
      "--integrity-ok", "true",
      "--restore-ok", "true",
      "--completed-at", new Date(NOW_MS + 10 * MINUTE).toISOString(),
    ], { encoding: "utf8" });
    if (future.status === 0) {
      assert.equal(collectBackup({
        backupDirectory: archiveDir, evidencePath: futurePath, environment: "test", now: NOW_MS,
      }).status, "unknown");
    } else {
      assert.notEqual(future.status, 0);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("deploy wrapper evidence covers success, failure and rollback outcomes", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-deploy-producer-"));
  const receiptPath = path.join(tempDir, "deploy-receipt.json");
  const producer = path.join(SERVER_DIRECTORY, "scripts", "write-monitor-evidence.mjs");
  chmodSync(tempDir, 0o750);
  const releaseSha = "b".repeat(40);
  const cases = [
    ["success", "succeeded", 0, 0],
    ["failure", "failed", 1, 0],
    ["rollback", "rollback_succeeded", 0, 1],
    ["rollback", "rollback_failed", 1, 1],
  ];
  try {
    for (const [event, result, failures, rollbacks] of cases) {
      const produced = spawnSync(process.execPath, [
        producer, "deploy",
        "--out", receiptPath,
        "--environment", "test",
        "--event", event,
        "--result", result,
        "--occurred-at", new Date(NOW_MS - MINUTE).toISOString(),
        "--release-sha", releaseSha,
      ], { encoding: "utf8" });
      assert.equal(produced.status, 0, `${event}/${result}: ${produced.stderr}`);
      const observed = collectDeploy({ receiptPath, environment: "test", now: NOW_MS });
      assert.equal(observed.status, "ok");
      assert.equal(observed.failures, failures);
      assert.equal(observed.rollbacks, rollbacks);
    }

    const backupWrapper = readFileSync(
      path.join(REPOSITORY_DIRECTORY, "scripts", "linux", "daily-backup.sh"),
      "utf8"
    );
    assert.match(backupWrapper, /EVIDENCE_WRITER=.*write-monitor-evidence\.mjs/u);
    assert.match(backupWrapper, /node\s+"\$\{EVIDENCE_WRITER\}"\s+backup/u);
    assert.match(backupWrapper, /CLOVER_MONITOR_EVIDENCE_DIR/u);
    assert.match(backupWrapper, /--integrity-ok/u);
    assert.match(backupWrapper, /--restore-ok/u);
    assert.equal(
      (backupWrapper.match(/date -u \+%Y-%m-%dT%H:%M:%S\.%3NZ/gu) || []).length,
      2,
      "backup evidence timestamps must preserve millisecond precision on success and failure"
    );
    const deployWrapper = readFileSync(
      path.join(REPOSITORY_DIRECTORY, "scripts", "linux", "restart-api-ui.sh"),
      "utf8"
    );
    assert.match(deployWrapper, /write-monitor-evidence\.mjs/u);
    for (const marker of ["succeeded", "failed", "rollback_succeeded", "rollback_failed"]) {
      assert.ok(deployWrapper.includes(marker), `deploy wrapper omits ${marker} receipt`);
    }
    const targetLauncher = readFileSync(
      path.join(REPOSITORY_DIRECTORY, "scripts", "linux", "run-target-deploy.sh"),
      "utf8"
    );
    assert.match(targetLauncher, /CLOVER_MONITOR_PINNED_EVIDENCE_WRITER=.*EXTRACT/u);
    assert.match(deployWrapper, /delivered-deploy-\$\{PINNED_SHA\}\/server\/scripts\/write-monitor-evidence\.mjs/u);
    assert.match(deployWrapper, /PINNED_WRITER_REAL.*EXPECTED_PINNED_WRITER_REAL/su);
    assert.match(deployWrapper, /rollback_release[\s\S]*write_deploy_evidence rollback rollback_succeeded/u);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("systemd restart window accumulates +2 and +1, then expires", () => {
  let state = createObservationState("test");
  const run = (now, restartCounter) => {
    const operational = operationalFixture();
    operational.systemd.api.value = restartCounter;
    const applied = applyObservationState({
      environment: "test", now, operational, previous: state,
    });
    state = applied.nextState;
    return applied.operational.systemd.api;
  };
  assert.equal(run(NOW_MS, 10).value, 0);
  const plusTwo = run(NOW_MS + 4 * MINUTE, 12);
  assert.equal(plusTwo.value, 2);
  assert.equal(decision("systemd", plusTwo.value, plusTwo.facts, "api").severity, "warning");
  const plusOne = run(NOW_MS + 8 * MINUTE, 13);
  assert.equal(plusOne.value, 3, "rolling window must retain the prior +2 delta");
  assert.equal(decision("systemd", plusOne.value, plusOne.facts, "api").severity, "critical");
  const expiredFirst = run(NOW_MS + 15 * MINUTE, 13);
  assert.equal(expiredFirst.value, 1, "the +2 event expires while the newer +1 remains");
  const expiredAll = run(NOW_MS + 19 * MINUTE, 13);
  assert.equal(expiredAll.value, 0);
});

test("OOM evidence is immediately critical without a sustained RAM window", () => {
  const operational = operationalFixture();
  operational.resources.ram = {
    status: "ok", value: 20, scope: "global", facts: { oom: true },
  };
  const applied = applyObservationState({
    environment: "test",
    now: NOW_MS,
    operational,
    previous: createObservationState("test"),
  });
  const ram = applied.operational.resources.ram;
  assert.equal(ram.facts.oom, true);
  assert.equal(ram.facts.sustainedMs, 0);
  assert.equal(decision("ram", ram.value, ram.facts).severity, "critical");
});

test("mandatory status artifact rejects missing, future and incomplete files visibly", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "clover-stage9b-status-"));
  const statusPath = path.join(tempDir, "monitor-status.env");
  const previousStrict = process.env.CLOVER_MONITOR_STRICT_STATUS_MODE;
  const deps = {
    now: () => NOW_MS,
    readOneCQueueSnapshot: () => ({
      ready: { count: 0, oldestAgeMs: 0 },
      sending: { count: 0, oldestAgeMs: 0, stuckCount: 0 },
      malformedCount: 0,
      unknownContourCount: 0,
    }),
    readAuditMonitoringSnapshot: () => ({
      windowMs: 10 * MINUTE, ackRejected: 0, contourMismatch: 0, claimRequeue: 0, authDenied: 0,
    }),
    collectOperationalFacts: async () => operationalFixture(),
    loadState: () => ({
      schemaVersion: 1, environment: "test", entries: {}, notificationWindow: { startedAt: "", count: 0 },
    }),
    saveState: () => {},
    writeNdjson: () => {},
    alertSink: { emit: (events) => ({ delivered: events.length, failed: 0 }) },
    statusEnv: {},
    parseStatusOnlyFile: (filePath, { now }) => parseStatusOnlyFile(filePath, {
      strictMode: true,
      now,
      expectedUid: typeof process.getuid === "function" ? process.getuid() : 0,
    }),
  };
  const options = {
    environment: "test",
    dbPath: "fixture.sqlite",
    statePath: "fixture-state.json",
    statusFilePath: statusPath,
    now: NOW_MS,
  };
  try {
    process.env.CLOVER_MONITOR_STRICT_STATUS_MODE = "true";
    await assert.rejects(runMonitor(options, deps), /ENOENT|monitor_status_(?:missing|invalid)/u);

    writeFileSync(statusPath, "ONEC_WRITE_ENABLED=false\n", "utf8");
    chmodSync(statusPath, 0o640);
    utimesSync(statusPath, new Date(NOW_MS), new Date(NOW_MS));
    if (process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0) {
      assert.throws(
        () => parseStatusOnlyFile(statusPath, { strictMode: true, now: NOW_MS }),
        /monitor_status_file_owner_invalid/u
      );
    }
    await assert.rejects(runMonitor(options, deps), /monitor_status_(?:incomplete|invalid)/u);

    const example = readFileSync(
      path.join(REPOSITORY_DIRECTORY, "ops", "systemd", "clover-monitor-status.env.example"),
      "utf8"
    );
    assert.match(example, /root:clover-monitor/u);
    assert.match(example, /0640/u);
    writeFileSync(statusPath, example, "utf8");
    const oldAt = new Date(NOW_MS - 24 * HOUR);
    utimesSync(statusPath, oldAt, oldAt);
    await runMonitor(options, deps);

    const futureAt = new Date(NOW_MS + 10 * MINUTE);
    utimesSync(statusPath, futureAt, futureAt);
    await assert.rejects(runMonitor(options, deps), /monitor_status_(?:future|invalid)/u);

    utimesSync(statusPath, new Date(NOW_MS), new Date(NOW_MS));
    const healthy = await runMonitor(options, deps);
    assert.equal(healthy.output.killSwitches.registration.valid, true);
  } finally {
    if (previousStrict === undefined) delete process.env.CLOVER_MONITOR_STRICT_STATUS_MODE;
    else process.env.CLOVER_MONITOR_STRICT_STATUS_MODE = previousStrict;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Stage 9B collector verifier is part of the main script and test:all", () => {
  const packageJson = JSON.parse(readFileSync(path.join(SERVER_DIRECTORY, "package.json"), "utf8"));
  assert.match(
    packageJson.scripts["test:security-stage9b-monitoring"],
    /verify-security-stage9b-monitoring\.mjs.*verify-security-stage9b-collectors\.mjs/u
  );
  assert.match(packageJson.scripts["test:all"], /test:security-stage9b-monitoring/u);
  const runner = readFileSync(path.join(SERVER_DIRECTORY, "scripts", "run-package-scripts.mjs"), "utf8");
  assert.match(runner, /src\/monitoring\/collectors\.js/u);
  assert.match(runner, /scripts\/write-monitor-evidence\.mjs/u);
  assert.match(runner, /scripts\/verify-security-stage9b-collectors\.mjs/u);
});
