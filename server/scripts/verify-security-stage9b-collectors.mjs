import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  collectAvailability,
  collectBackup,
  collectDeploy,
  collectOperationalFacts,
  collectResources,
  collectSystemd,
  collectTls,
  applyObservationState,
  createBackupEvidence,
  createDeployReceipt,
  createLocalOperatorAlertSink,
  createObservationState,
} from "../src/monitoring/collectors.js";
import { runMonitor } from "./clover-monitor.mjs";
import { runtimeStatusProjectionRevision } from "../src/runtimeKillSwitches.js";
import {
  createRuntimeMonitoringSnapshot,
  readRuntimeMonitoringSnapshot,
} from "../src/monitoring/runtimeSnapshot.js";
import { produceRuntimeMonitoringSnapshot } from "./write-monitor-snapshot.mjs";

const NOW = Date.parse("2026-09-28T12:00:00.000Z");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("FIXTURE_NETWORK_FORBIDDEN"); };
test.after(() => { globalThis.fetch = originalFetch; });

test("availability uses injected loopback fixture and keeps only bounded status facts", async () => {
  const calls = [];
  const result = await collectAvailability({
    targets: [
      { component: "api", url: "http://fixture/api" },
      { component: "ui", url: "http://fixture/ui" },
      { component: "nginx", url: "http://fixture/nginx" },
    ],
    fetchFn: async (url) => {
      calls.push(url);
      return { status: url.endsWith("ui") ? 503 : 200, body: { cancel: async () => {} } };
    },
  });
  assert.equal(calls.length, 3);
  assert.equal(result.api.value, 0);
  assert.equal(result.ui.value, 1);
  assert.deepEqual(Object.keys(result), ["api", "ui", "nginx"]);
});

test("API availability rejects a missing or mismatched runtime status revision", async () => {
  const projection = { CLOVER_PAUSE_REGISTRATION: "false" };
  const expectedRuntimeStatusRevision = runtimeStatusProjectionRevision(projection, "fixture-hmac-key-material-32-bytes-minimum");
  const collect = (header) => collectAvailability({
    targets: [{ component: "api", url: "http://127.0.0.1:4100/api/health" }],
    expectedRuntimeStatusRevision,
    fetchFn: async () => ({
      status: 200,
      headers: { get: () => header },
      body: { cancel: async () => {} },
    }),
  });
  const matching = await collect(expectedRuntimeStatusRevision);
  const mismatched = await collect("0".repeat(64));
  const missing = await collect("");
  assert.equal(matching.api.value, 0);
  assert.equal(matching.api.facts.runtimeStatusRevisionMatch, true);
  assert.equal(mismatched.api.value, 1);
  assert.equal(mismatched.api.facts.runtimeStatusRevisionMatch, false);
  assert.equal(missing.api.value, 1);
  assert.equal(missing.api.facts.runtimeStatusRevisionMatch, false);
  assert.equal(JSON.stringify({ matching, mismatched, missing }).includes(expectedRuntimeStatusRevision), false);
});

test("runtime status revision is keyed, opaque and unavailable without a valid key", () => {
  const projection = { CLOVER_PAUSE_REGISTRATION: "false", ONEC_ALLOWED_DATABASES: "TEST" };
  const first = runtimeStatusProjectionRevision(projection, "fixture-hmac-key-material-32-bytes-minimum");
  const second = runtimeStatusProjectionRevision(projection, "another-fixture-hmac-key-material-32-bytes");
  assert.match(first, /^[0-9a-f]{64}$/u);
  assert.notEqual(first, second);
  assert.equal(first.includes("TEST"), false);
  assert.equal(first.includes("false"), false);
  assert.throws(() => runtimeStatusProjectionRevision(projection, ""), /MONITOR_STATUS_HMAC_KEY_REQUIRED/u);
  assert.throws(() => runtimeStatusProjectionRevision(projection, "short"), /MONITOR_STATUS_HMAC_KEY_REQUIRED/u);
});

test("systemd collector uses fixed argv without shell and reports restart/failure facts", async () => {
  const invocations = [];
  const execFileFn = (file, args, options, callback) => {
    invocations.push({ file, args, options });
    const failed = args.includes("clover-ui.service");
    callback(null, `ActiveState=${failed ? "failed" : "active"}\nResult=${failed ? "exit-code" : "success"}\nNRestarts=${failed ? 2 : 0}\n`);
  };
  const result = await collectSystemd({ execFileFn });
  assert.equal(result.ui.facts.activeState, "failed");
  assert.equal(result.ui.value, 2);
  assert.equal(invocations.every((item) => item.file === "systemctl" && item.options.shell === false), true);
});

test("resource collector is deterministic with injected OS clock and statfs", async () => {
  let sample = 0;
  const osModule = {
    cpus: () => sample++ === 0
      ? [{ times: { idle: 80, user: 20 } }]
      : [{ times: { idle: 85, user: 35 } }],
    totalmem: () => 1000,
    freemem: () => 100,
  };
  const result = await collectResources({
    osModule,
    statfsFn: () => ({ bsize: 100, blocks: 100, bavail: 25 }),
    delay: async () => {},
    sampleMs: 250,
  });
  assert.equal(result.cpu.value, 75);
  assert.equal(result.ram.value, 90);
  assert.equal(result.disk.value, 25);
});

test("backup and deploy collectors expose age/counts without raw lines or paths", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "clover-monitor-collectors-"));
  try {
    const backup = path.join(root, "clover-data-env.20260928T110000Z.tgz");
    writeFileSync(backup, "fixture");
    utimesSync(backup, new Date(NOW - 60_000), new Date(NOW - 60_000));
    const backupStat = statSync(backup);
    const evidencePath = path.join(root, "backup-evidence.json");
    writeFileSync(evidencePath, JSON.stringify(createBackupEvidence({
      environment: "test",
      completedAt: new Date(backupStat.mtimeMs).toISOString(),
      result: "success",
      archiveSize: backupStat.size,
      archiveSha256: createHash("sha256").update(readFileSync(backup)).digest("hex"),
      integrityOk: true,
      integrityCheckedAt: new Date(backupStat.mtimeMs).toISOString(),
      restoreOk: true,
      restoreCheckedAt: new Date(backupStat.mtimeMs).toISOString(),
      restoreFixture: true,
    })));
    const backupResult = collectBackup({ backupDirectory: root, evidencePath, environment: "test", now: NOW });
    assert.equal(backupResult.status, "ok");
    assert.equal(backupResult.facts.lastResult, "success");
    const receiptPath = path.join(root, "deploy-receipt.json");
    writeFileSync(receiptPath, JSON.stringify(createDeployReceipt({
      environment: "test",
      event: "rollback",
      result: "rollback_failed",
      occurredAt: new Date(NOW - 60_000).toISOString(),
      releaseSha: "a".repeat(40),
    })));
    const deployResult = collectDeploy({ receiptPath, environment: "test", now: NOW });
    assert.equal(deployResult.status, "ok");
    assert.equal(deployResult.failures, 1);
    assert.equal(deployResult.rollbacks, 1);
    assert.equal(JSON.stringify(deployResult).includes("a".repeat(40)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("backup collector tolerates only bounded whole-second producer precision", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "clover-monitor-backup-precision-"));
  try {
    const backup = path.join(root, "clover-data-env.20260928T110000Z.tgz");
    const evidencePath = path.join(root, "backup-evidence.json");
    const completedAtMs = Math.floor((NOW - 60_000) / 1_000) * 1_000;
    writeFileSync(backup, "fixture");
    utimesSync(backup, new Date(completedAtMs + 152), new Date(completedAtMs + 152));
    const backupStat = statSync(backup);
    writeFileSync(evidencePath, JSON.stringify(createBackupEvidence({
      environment: "test",
      completedAt: new Date(completedAtMs).toISOString(),
      result: "success",
      archiveSize: backupStat.size,
      archiveSha256: createHash("sha256").update(readFileSync(backup)).digest("hex"),
      integrityOk: true,
      integrityCheckedAt: new Date(completedAtMs).toISOString(),
      restoreOk: true,
      restoreCheckedAt: new Date(completedAtMs).toISOString(),
      restoreFixture: true,
    })));

    assert.equal(collectBackup({
      backupDirectory: root, evidencePath, environment: "test", now: NOW,
    }).status, "ok", "valid archive must survive whole-second evidence precision");

    utimesSync(backup, new Date(completedAtMs + 999), new Date(completedAtMs + 999));
    assert.equal(collectBackup({
      backupDirectory: root, evidencePath, environment: "test", now: NOW,
    }).status, "ok", "sub-second skew at the upper edge must remain valid");

    utimesSync(backup, new Date(completedAtMs + 1_000), new Date(completedAtMs + 1_000));
    assert.equal(collectBackup({
      backupDirectory: root, evidencePath, environment: "test", now: NOW,
    }).status, "ok", "the bounded one-second precision edge must remain valid");

    utimesSync(backup, new Date(completedAtMs + 1_001), new Date(completedAtMs + 1_001));
    assert.equal(collectBackup({
      backupDirectory: root, evidencePath, environment: "test", now: NOW,
    }).status, "unknown", "archive beyond the bounded precision window must fail closed");

    writeFileSync(backup, "Fixture");
    utimesSync(backup, new Date(completedAtMs + 152), new Date(completedAtMs + 152));
    assert.equal(collectBackup({
      backupDirectory: root, evidencePath, environment: "test", now: NOW,
    }).status, "unknown", "same-size tamper within the precision window must fail SHA-256 binding");

    writeFileSync(backup, "fixture-extra");
    utimesSync(backup, new Date(completedAtMs + 152), new Date(completedAtMs + 152));
    assert.equal(collectBackup({
      backupDirectory: root, evidencePath, environment: "test", now: NOW,
    }).status, "unknown", "wrong-size archive within the precision window must fail closed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TLS collector uses injected socket and returns expiry only", async () => {
  let receivedOptions;
  const connectFn = (_options, callback) => {
    receivedOptions = _options;
    const socket = new EventEmitter();
    socket.authorized = true;
    socket.getPeerCertificate = () => ({ valid_to: "Nov 10 12:00:00 2026 GMT", subject: { CN: "private" } });
    socket.destroy = () => {};
    queueMicrotask(callback);
    return socket;
  };
  const result = await collectTls({ host: "fixture.invalid", connectHost: "127.0.0.1", now: NOW, connectFn });
  assert.equal(result.status, "ok");
  assert.ok(result.value > 0);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(receivedOptions.host, "127.0.0.1");
  assert.equal(receivedOptions.servername, "fixture.invalid");
});

test("aggregate collector isolates a failed probe and performs no fallback network", async () => {
  const result = await collectOperationalFacts({ now: NOW }, {
    collectAvailability: async () => { throw new Error("fixture failure"); },
    collectSystemd: async () => ({ api: { status: "ok", value: 0 } }),
    collectResources: async () => ({ cpu: { status: "ok", value: 1 } }),
    collectTls: async () => ({ status: "ok", value: 40 }),
    collectBackup: () => ({ status: "ok", value: 1 }),
    collectDeploy: () => ({ status: "ok", failures: 0, rollbacks: 0 }),
  });
  assert.deepEqual(result.availability, {});
  assert.equal(result.systemd.api.value, 0);
});

test("local operator sink re-sanitizes and bounds events", () => {
  let output = "";
  const sink = createLocalOperatorAlertSink({
    environment: "test",
    maxEvents: 1,
    writer: { write: (chunk) => { output += chunk; } },
  });
  const result = sink.emit([
    { type: "alert", signalId: "availability", scope: "api", severity: "critical", summaryCode: "availability.failure", facts: { count: 3 }, token: "secret" },
    { type: "alert", signalId: "disk", scope: "global", severity: "warning", summaryCode: "resource.disk" },
  ]);
  assert.deepEqual(result, { delivered: 1, failed: 1 });
  assert.equal(output.includes("secret"), false);
  assert.equal(output.split("\n").filter(Boolean).length, 1);
});

test("CLI wiring accepts fixture collectors and does not write real state", async () => {
  const emitted = [];
  let saved = false;
  const operational = {
    availability: { api: { status: "ok", value: 0, facts: {} } },
    systemd: { api: { status: "ok", value: 0, facts: { activeState: "active" } } },
    resources: {
      cpu: { status: "ok", value: 10, facts: { sustainedMs: 0 } },
      ram: { status: "ok", value: 20, facts: { sustainedMs: 0 } },
      disk: { status: "ok", value: 50, facts: { freeBytes: 10e9, requiredBytes: 2e9 } },
    },
    backup: { status: "ok", value: 1, facts: { lastResult: "success", integrityOk: true } },
    tls: { status: "ok", value: 40, facts: { hostnameValid: true, chainValid: true } },
    deploy: { status: "ok", failures: 0, rollbacks: 0 },
  };
  const result = await runMonitor({ environment: "test", dbPath: "fixture", statePath: "fixture", now: NOW }, {
    readOneCQueueSnapshot: () => ({ ready: { count: 0, oldestAgeMs: 0 }, sending: { count: 0, oldestAgeMs: 0, stuckCount: 0 }, malformedCount: 0, unknownContourCount: 0 }),
    readAuditMonitoringSnapshot: () => ({ windowMs: 600000, ackRejected: 0, contourMismatch: 0, claimRequeue: 0, authDenied: 0 }),
    collectOperationalFacts: async () => operational,
    loadState: () => ({ schemaVersion: 1, environment: "test", entries: {}, notificationWindow: { startedAt: "", count: 0 } }),
    saveState: () => { saved = true; },
    writeNdjson: (value) => emitted.push(value),
    alertSink: { emit: () => ({ delivered: 0, failed: 0 }) },
  });
  assert.equal(saved, true);
  assert.equal(result.exitCode, 0);
  assert.equal(emitted[0].operational.backupKnown, true);
});

test("observation state persists outage, resource duration and restart deltas with reset", () => {
  const sample = (availabilityValue, cpu, restarts) => ({
    availability: {
      api: { status: "ok", value: availabilityValue, scope: "api", facts: {} },
      ui: { status: "ok", value: 0, scope: "ui", facts: {} },
      nginx: { status: "ok", value: 0, scope: "nginx", facts: {} },
    },
    systemd: {
      api: { status: "ok", value: restarts, scope: "api", facts: { activeState: "active", result: "success" } },
      ui: { status: "ok", value: 0, scope: "ui", facts: { activeState: "active", result: "success" } },
      nginx: { status: "ok", value: 0, scope: "nginx", facts: { activeState: "active", result: "success" } },
    },
    resources: {
      cpu: { status: "ok", value: cpu, facts: {} },
      ram: { status: "ok", value: 20, facts: {} },
      disk: { status: "ok", value: 50, facts: {} },
    },
  });
  let state = createObservationState("test");
  let run = applyObservationState({ environment: "test", now: NOW, operational: sample(1, 80, 4), previous: state });
  state = run.nextState;
  assert.equal(run.operational.availability.api.facts.consecutiveFailures, 1);
  assert.equal(run.operational.systemd.api.value, 0, "first counter is baseline only");
  run = applyObservationState({ environment: "test", now: NOW + 5 * 60_000, operational: sample(1, 90, 5), previous: state });
  state = run.nextState;
  assert.equal(run.operational.systemd.api.value, 1);
  run = applyObservationState({ environment: "test", now: NOW + 10 * 60_000, operational: sample(1, 95, 2), previous: state });
  assert.equal(run.operational.availability.api.facts.outageAgeMs, 10 * 60_000);
  assert.equal(run.operational.resources.cpu.facts.sustainedMs, 10 * 60_000);
  assert.equal(run.operational.systemd.api.value, 0, "counter reset/reboot establishes a new baseline");
  assert.equal(run.operational.systemd.api.facts.counterReset, true);
});

function createRuntimeSnapshotFixture(root) {
  const dbPath = path.join(root, "fixture.sqlite");
  const database = new DatabaseSync(dbPath);
  database.exec(`
    CREATE TABLE orders (payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE audit_log (action TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  database.prepare("INSERT INTO orders(payload_json, updated_at) VALUES (?, ?)").run(
    JSON.stringify({ exchange: { database: "TEST", status: "ready", checkedAt: new Date(NOW - 60_000).toISOString() } }),
    new Date(NOW - 60_000).toISOString()
  );
  database.prepare("INSERT INTO audit_log(action, created_at) VALUES (?, ?)")
    .run("one-c.order.ack.rejected", new Date(NOW - 30_000).toISOString());
  database.close();

  const backupDirectory = path.join(root, "backups");
  const evidenceDirectory = path.join(root, "evidence");
  mkdirSync(backupDirectory);
  mkdirSync(evidenceDirectory);
  chmodSync(evidenceDirectory, 0o770);
  const archivePath = path.join(backupDirectory, "clover-data-env.20260928T115900Z.tgz");
  writeFileSync(archivePath, "fixture-backup");
  utimesSync(archivePath, new Date(NOW - 60_000), new Date(NOW - 60_000));
  const archive = statSync(archivePath);
  const evidencePath = path.join(evidenceDirectory, "backup-evidence.json");
  writeFileSync(evidencePath, JSON.stringify(createBackupEvidence({
    environment: "test",
    completedAt: new Date(archive.mtimeMs).toISOString(),
    result: "success",
    archiveSize: archive.size,
    archiveSha256: createHash("sha256").update(readFileSync(archivePath)).digest("hex"),
    integrityOk: true,
    integrityCheckedAt: new Date(archive.mtimeMs).toISOString(),
    restoreOk: true,
    restoreCheckedAt: new Date(archive.mtimeMs).toISOString(),
    restoreFixture: true,
  })));
  return {
    dbPath, backupDirectory, evidenceDirectory, evidencePath,
    outputPath: path.join(evidenceDirectory, "runtime-snapshot.json"),
  };
}

test("snapshot producer reads fixture inputs without mutation and publishes bounded aggregates only", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "clover-monitor-snapshot-"));
  try {
    const fixture = createRuntimeSnapshotFixture(root);
    const canary = "CANARY_ORDER_CUSTOMER_TOKEN_9B";
    const canaryPath = path.join(root, `${canary}.txt`);
    writeFileSync(canaryPath, canary);
    const before = {
      db: createHash("sha256").update(readFileSync(fixture.dbPath)).digest("hex"),
      evidence: createHash("sha256").update(readFileSync(fixture.evidencePath)).digest("hex"),
    };
    const snapshot = produceRuntimeMonitoringSnapshot({
      environment: "test",
      dbPath: fixture.dbPath,
      backupDirectory: fixture.backupDirectory,
      backupEvidencePath: fixture.evidencePath,
      outputPath: fixture.outputPath,
    }, { now: () => NOW });
    assert.equal(snapshot.queue.ready.count, 1);
    assert.equal(snapshot.audit.ackRejected, 1);
    assert.equal(snapshot.backup.facts.integrityOk, true);
    const serialized = readFileSync(fixture.outputPath, "utf8");
    for (const forbidden of [root, fixture.dbPath, fixture.backupDirectory, canary]) {
      assert.equal(serialized.includes(forbidden), false, `snapshot leaked ${forbidden}`);
    }
    assert.equal(createHash("sha256").update(readFileSync(fixture.dbPath)).digest("hex"), before.db);
    assert.equal(createHash("sha256").update(readFileSync(fixture.evidencePath)).digest("hex"), before.evidence);
    assert.equal(serialized.length < 16 * 1024, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime snapshot reader rejects missing, stale, wrong-environment, malformed and symlink input", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "clover-monitor-snapshot-read-"));
  const snapshotPath = path.join(root, "runtime-snapshot.json");
  const valid = createRuntimeMonitoringSnapshot({
    environment: "test",
    collectedAt: new Date(NOW).toISOString(),
    queue: { ready: { count: 0, oldestAgeMs: 0 }, sending: { count: 0, oldestAgeMs: 0, stuckCount: 0 }, malformedCount: 0, unknownContourCount: 0 },
    audit: { windowMs: 600_000, ackRejected: 0, contourMismatch: 0, claimRequeue: 0, authDenied: 0 },
    backup: { status: "unknown", value: null, facts: {} },
  });
  try {
    assert.throws(
      () => readRuntimeMonitoringSnapshot({ filePath: snapshotPath, environment: "test", now: NOW }),
      /runtime_snapshot_missing/u
    );
    writeFileSync(snapshotPath, JSON.stringify(valid));
    assert.throws(
      () => readRuntimeMonitoringSnapshot({ filePath: snapshotPath, environment: "production", now: NOW }),
      /runtime_snapshot_environment_mismatch/u
    );
    assert.throws(
      () => readRuntimeMonitoringSnapshot({ filePath: snapshotPath, environment: "test", now: NOW + 7 * 60_000 + 1 }),
      /runtime_snapshot_stale/u
    );
    writeFileSync(snapshotPath, "{\"schemaVersion\":1,\"queue\":");
    assert.throws(
      () => readRuntimeMonitoringSnapshot({ filePath: snapshotPath, environment: "test", now: NOW }),
      /SyntaxError|runtime_snapshot/u
    );
    writeFileSync(snapshotPath, JSON.stringify(valid));
    const linkPath = path.join(root, "runtime-snapshot-link.json");
    try {
      symlinkSync(snapshotPath, linkPath, "file");
      assert.throws(
        () => readRuntimeMonitoringSnapshot({ filePath: linkPath, environment: "test", now: NOW }),
        /runtime_snapshot_missing|ELOOP/u
      );
    } catch (error) {
      if (error?.code === "EPERM") t.diagnostic("symlink fixture unavailable on this Windows host");
      else throw error;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("monitor consumes runtime snapshot without invoking DB or backup readers", async () => {
  const runtimeSnapshot = createRuntimeMonitoringSnapshot({
    environment: "test",
    collectedAt: new Date(NOW).toISOString(),
    queue: { ready: { count: 1, oldestAgeMs: 60_000 }, sending: { count: 0, oldestAgeMs: 0, stuckCount: 0 }, malformedCount: 0, unknownContourCount: 0 },
    audit: { windowMs: 600_000, ackRejected: 1, contourMismatch: 0, claimRequeue: 0, authDenied: 0 },
    backup: { status: "ok", value: 60_000, facts: { lastResult: "success", integrityOk: true, restoreOk: true } },
  });
  let queueCalled = false;
  let auditCalled = false;
  const operational = {
    availability: {}, systemd: {}, resources: {},
    backup: { status: "unknown", value: null, facts: {} },
    tls: { status: "ok", value: 40, facts: {} },
    deploy: { status: "ok", failures: 0, rollbacks: 0 },
  };
  const result = await runMonitor({ environment: "test", runtimeSnapshotPath: "fixture-snapshot", statePath: "fixture", now: NOW }, {
    readRuntimeMonitoringSnapshot: () => runtimeSnapshot,
    readOneCQueueSnapshot: () => { queueCalled = true; throw new Error("DB reader forbidden"); },
    readAuditMonitoringSnapshot: () => { auditCalled = true; throw new Error("audit reader forbidden"); },
    collectOperationalFacts: async (_options) => operational,
    loadState: () => ({ schemaVersion: 1, environment: "test", entries: {}, notificationWindow: { startedAt: "", count: 0 } }),
    saveState: () => {},
    writeNdjson: () => {},
    alertSink: { emit: (events) => ({ delivered: events.length, failed: 0 }) },
  });
  assert.equal(queueCalled, false);
  assert.equal(auditCalled, false);
  assert.equal(result.snapshot.signals.onec_ready.value, 1);
  assert.equal(result.snapshot.signals.onec_ack_rejection.value, 1);
  assert.equal(JSON.stringify(result).includes("fixture-snapshot"), false);
});

test("systemd snapshot ordering never starts API/UI/nginx and monitor has no DB, backup or ACL access", () => {
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const monitorUnit = readFileSync(path.join(repository, "ops", "systemd", "clover-monitor.service"), "utf8");
  const producerUnit = readFileSync(path.join(repository, "ops", "systemd", "clover-monitor-snapshot.service"), "utf8");
  assert.match(monitorUnit, /^Wants=clover-monitor-snapshot\.service$/mu);
  assert.doesNotMatch(monitorUnit, /^Requires=clover-monitor-snapshot\.service$/mu);
  assert.match(monitorUnit, /^After=clover-monitor-snapshot\.service\s+clover-api\.service\s+clover-ui\.service\s+nginx\.service$/mu);
  assert.doesNotMatch(monitorUnit, /^(?:Requires|Wants)=.*(?:clover-api|clover-ui|nginx)/mu);
  assert.match(producerUnit, /^Before=clover-monitor\.service$/mu);
  assert.doesNotMatch(monitorUnit, /DB_PATH|BACKUP_DIR|backups\/daily|SupplementaryGroups=clover/mu);
  assert.match(monitorUnit, /^ReadOnlyPaths=\/var\/lib\/clover-monitor-evidence\b/mu);
  assert.equal(existsSync(path.join(repository, "scripts", "linux", "install-clover-monitor-access.sh")), false);
  const tmpfiles = readFileSync(path.join(repository, "ops", "tmpfiles.d", "clover-monitor-evidence.conf"), "utf8");
  assert.match(
    tmpfiles,
    /^a\+ \/var\/lib\/clover-monitor-evidence - - - - u:clover-monitor:r-x,d:u:clover-monitor:r--$/mu
  );
  assert.doesNotMatch(tmpfiles, /clover\.sqlite|\/data\b|backups\/daily|setfacl/u);
  const runtimeSnapshotSource = readFileSync(
    path.join(repository, "server", "src", "monitoring", "runtimeSnapshot.js"), "utf8"
  );
  assert.match(runtimeSnapshotSource, /constants\.O_NOFOLLOW/u);
});

test("installation plan gates timer on API HMAC activation and revokes evidence ACL on rollback", () => {
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const plan = readFileSync(path.join(repository, "ops", "systemd", "INSTALL_MONITORING_PLAN.md"), "utf8");
  const apiActivation = plan.indexOf("install -o root -g clover -m 0640 <API_ENV_SOURCE> <API_ENV_TARGET>");
  const apiRestart = plan.indexOf("systemctl restart clover-api.service", apiActivation);
  const monitorSmoke = plan.indexOf("systemctl start clover-monitor.service", apiRestart);
  const timerEnable = plan.indexOf("systemctl enable --now clover-monitor.timer", monitorSmoke);
  assert.ok(apiActivation >= 0 && apiRestart > apiActivation && monitorSmoke > apiRestart && timerEnable > monitorSmoke);
  assert.match(plan, /Result=success.*ExecMainStatus=0/su);
  assert.match(plan, /setfacl -R -x u:clover-monitor \/var\/lib\/clover-monitor-evidence/u);
  assert.match(plan, /find \/var\/lib\/clover-monitor-evidence -xdev -type d -exec setfacl -x d:u:clover-monitor/u);
  assert.match(plan, /getfacl -R \/var\/lib\/clover-monitor-evidence/u);
  assert.match(plan, /If either account existed before installation, leave\s+it unchanged\./su);
});

test("failed producer and invalid snapshots preserve independent checks without DB fallback", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "clover-monitor-snapshot-failure-"));
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const producer = path.join(repository, "server", "scripts", "write-monitor-snapshot.mjs");
  const missingPath = path.join(root, "missing-runtime-snapshot.json");
  try {
    const failedProducer = spawnSync(process.execPath, [
      producer, "--environment", "test", "--db", path.join(root, "missing.sqlite"),
      "--backup-directory", path.join(root, "missing-backups"),
      "--backup-evidence", path.join(root, "missing-evidence.json"), "--out", missingPath,
    ], { encoding: "utf8" });
    assert.notEqual(failedProducer.status, 0);
    assert.equal(existsSync(missingPath), false);

    const stalePath = path.join(root, "stale-runtime-snapshot.json");
    const malformedPath = path.join(root, "malformed-runtime-snapshot.json");
    writeFileSync(stalePath, JSON.stringify(createRuntimeMonitoringSnapshot({
      environment: "test", collectedAt: new Date(NOW - 4 * 60_000 - 1).toISOString(),
      queue: { ready: { count: 0, oldestAgeMs: 0 }, sending: { count: 0, oldestAgeMs: 0, stuckCount: 0 }, malformedCount: 0, unknownContourCount: 0 },
      audit: { windowMs: 600_000, ackRejected: 0, contourMismatch: 0, claimRequeue: 0, authDenied: 0 },
      backup: { status: "unknown", value: null, facts: {} },
    })));
    writeFileSync(malformedPath, "{truncated");

    for (const [label, runtimeSnapshotPath] of [
      ["failed-producer-missing", missingPath], ["stale", stalePath], ["malformed", malformedPath],
    ]) {
      let queueCalled = false;
      let auditCalled = false;
      let backupCalled = false;
      const result = await runMonitor({
        environment: "test", runtimeSnapshotPath, statePath: `fixture-${label}`, now: NOW,
      }, {
        readOneCQueueSnapshot: () => { queueCalled = true; throw new Error("DB fallback forbidden"); },
        readAuditMonitoringSnapshot: () => { auditCalled = true; throw new Error("audit fallback forbidden"); },
        collectorDeps: {
          collectAvailability: async () => ({
            api: { status: "ok", value: 0, scope: "api", facts: { attempts: 1, statusCode: 200 } },
            ui: { status: "ok", value: 0, scope: "ui", facts: { attempts: 1, statusCode: 200 } },
            nginx: { status: "ok", value: 0, scope: "nginx", facts: { attempts: 1, statusCode: 200 } },
          }),
          collectSystemd: async () => ({
            api: { status: "ok", value: 0, scope: "api", facts: { activeState: "active", result: "success" } },
            ui: { status: "ok", value: 0, scope: "ui", facts: { activeState: "active", result: "success" } },
            nginx: { status: "ok", value: 0, scope: "nginx", facts: { activeState: "active", result: "success" } },
          }),
          collectResources: async () => ({
            cpu: { status: "ok", value: 10, scope: "global", facts: { sustainedMs: 0 } },
            ram: { status: "ok", value: 20, scope: "global", facts: { sustainedMs: 0, oom: false } },
            disk: { status: "ok", value: 50, scope: "global", facts: { freeBytes: 10e9, requiredBytes: 2e9 } },
          }),
          collectTls: async () => ({ status: "ok", value: 40, scope: "global", facts: { hostnameValid: true, chainValid: true } }),
          collectDeploy: () => ({ status: "ok", failures: 0, rollbacks: 0, ageMs: 0 }),
          collectBackup: () => { backupCalled = true; throw new Error("backup fallback forbidden"); },
        },
        loadState: () => ({ schemaVersion: 1, environment: "test", entries: {}, notificationWindow: { startedAt: "", count: 0 } }),
        saveState: () => {}, writeNdjson: () => {},
        alertSink: { emit: (events) => ({ delivered: events.length, failed: 0 }) },
        statusEnv: { CLOVER_PAUSE_REGISTRATION: "false" },
      });
      assert.equal(queueCalled, false, `${label}: queue DB fallback called`);
      assert.equal(auditCalled, false, `${label}: audit DB fallback called`);
      assert.equal(backupCalled, false, `${label}: backup fallback called`);
      assert.equal(result.snapshot.signals["monitor.runtime_snapshot"].value, 1);
      assert.ok(result.snapshot.signals["monitor.probe_errors"].value >= 1);
      for (const signalId of ["availability", "systemd", "cpu", "ram", "disk", "tls_expiry", "deploy_failure", "deploy_rollback"]) {
        assert.equal(result.snapshot.signals[signalId].status, "ok", `${label}: ${signalId} did not run`);
      }
      for (const signalId of ["backup_age", "onec_ready", "onec_sending", "onec_ack_rejection"]) {
        assert.equal(result.snapshot.signals[signalId].status, "unknown", `${label}: ${signalId} must fail closed`);
      }
      assert.equal(result.output.killSwitches.registration.valid, true);
      assert.equal(result.exitCode, 2);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime snapshot freshness is stricter than the five-minute timer cadence", () => {
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const timer = readFileSync(path.join(repository, "ops", "systemd", "clover-monitor.timer"), "utf8");
  const source = readFileSync(path.join(repository, "server", "src", "monitoring", "runtimeSnapshot.js"), "utf8");
  assert.match(timer, /^OnUnitActiveSec=5min$/mu);
  assert.match(source, /maxAgeMs\s*=\s*4\s*\*\s*60_000/u);
});
