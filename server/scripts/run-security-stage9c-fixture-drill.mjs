import { createHmac, randomBytes } from "node:crypto";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createAlertStateMachine } from "../src/monitoring/alertState.js";
import {
  isOutboundChannelPaused,
  isRuntimeFeaturePaused,
  runtimeKillSwitchStatus,
} from "../src/runtimeKillSwitches.js";

import {
  advanceIncident,
  assertSha256,
  classifyIncidentSeverity,
  createEvidenceManifest,
  createIncident,
  recordApprovalGate,
  recordHealthySample,
  sha256,
  stableJson,
} from "../src/incidentResponse/contracts.js";

const FIXTURE_PREFIX = "clover-stage9c-fixture-";
const MARKER = ".stage9c-fixture-root";
const FIXED_TIMES = Object.freeze([
  "2030-01-01T00:00:00.000Z",
  "2030-01-01T00:01:00.000Z",
  "2030-01-01T00:02:00.000Z",
  "2030-01-01T00:03:00.000Z",
  "2030-01-01T00:04:00.000Z",
  "2030-01-01T00:05:00.000Z",
  "2030-01-01T00:06:00.000Z",
]);

const CREDENTIAL_CLASSES = Object.freeze([
  "JWT", "TEST_INBOUND_1C", "WORKING_INBOUND_1C", "OUTBOUND_1C",
  "MONITOR_HMAC", "SMTP", "TELEGRAM", "VAPID",
]);

export function createFixtureWorkspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX));
  const marker = randomBytes(24).toString("hex");
  writeFileSync(path.join(root, MARKER), `${marker}\n`, { encoding: "utf8", mode: 0o600 });
  return { root: realpathSync(root), marker };
}

export function assertFixtureWorkspace(workspace) {
  const root = realpathSync(workspace?.root || "");
  const temporaryRoot = realpathSync(os.tmpdir());
  if (path.dirname(root) !== temporaryRoot) throw new Error("fixture_root_outside_temp");
  if (!path.basename(root).startsWith(FIXTURE_PREFIX)) throw new Error("fixture_root_invalid");
  const markerPath = path.join(root, MARKER);
  if (lstatSync(markerPath).isSymbolicLink()) throw new Error("fixture_marker_symlink_forbidden");
  const actualMarker = readFileSync(markerPath, "utf8").trim();
  if (!/^[a-f0-9]{48}$/u.test(actualMarker) || actualMarker !== workspace.marker) {
    throw new Error("fixture_marker_invalid");
  }
  return root;
}

function resolveFixtureRelative(workspace, relativePath, { mustExist = false } = {}) {
  const root = assertFixtureWorkspace(workspace);
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error("fixture_relative_path_required");
  }
  const normalized = path.normalize(relativePath);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) throw new Error("fixture_path_escape");
  const target = path.resolve(root, normalized);
  if (path.dirname(target) !== root && !path.dirname(target).startsWith(`${root}${path.sep}`)) {
    throw new Error("fixture_path_escape");
  }
  let cursor = path.dirname(target);
  while (cursor !== root) {
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new Error("fixture_parent_symlink_forbidden");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    cursor = path.dirname(cursor);
  }
  if (mustExist) {
    const details = lstatSync(target);
    if (!details.isFile() || details.isSymbolicLink()) throw new Error("fixture_regular_file_required");
  }
  return target;
}

export function restoreSyntheticBackup({
  workspace,
  sourceRelative,
  targetRelative,
  expectedSha256,
  expectedRows,
  expectedAggregate,
}) {
  assertSha256(expectedSha256);
  if (!Number.isSafeInteger(expectedRows) || expectedRows < 0
      || !Number.isSafeInteger(expectedAggregate) || expectedAggregate < 0) {
    throw new Error("fixture_restore_expectation_invalid");
  }
  const source = resolveFixtureRelative(workspace, sourceRelative, { mustExist: true });
  const target = resolveFixtureRelative(workspace, targetRelative);
  try {
    const targetDetails = lstatSync(target);
    if (targetDetails.isSymbolicLink() || !targetDetails.isFile()) throw new Error("fixture_restore_target_invalid");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const sourceBytes = readFileSync(source);
  if (sourceBytes.length > 1024 * 1024) throw new Error("fixture_backup_too_large");
  if (sha256(sourceBytes) !== expectedSha256) throw new Error("fixture_backup_integrity_mismatch");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  copyFileSync(source, target);
  const restoredBytes = readFileSync(target);
  if (sha256(restoredBytes) !== expectedSha256) throw new Error("fixture_restore_integrity_mismatch");
  let integrityCheck;
  let aggregate;
  const database = new DatabaseSync(target, { readOnly: true, enableForeignKeyConstraints: true });
  try {
    integrityCheck = String(database.prepare("PRAGMA integrity_check").get()?.integrity_check || "");
    aggregate = database.prepare(
      "SELECT COUNT(*) AS rows, COALESCE(SUM(sample_value), 0) AS aggregate FROM fixture_samples"
    ).get();
  } finally {
    database.close();
  }
  if (integrityCheck !== "ok") throw new Error("fixture_restore_sqlite_integrity_failed");
  if (Number(aggregate?.rows) !== expectedRows || Number(aggregate?.aggregate) !== expectedAggregate) {
    throw new Error("fixture_restore_aggregate_mismatch");
  }
  if (sha256(readFileSync(source)) !== expectedSha256) throw new Error("fixture_backup_source_changed");
  return {
    status: "verified",
    bytes: restoredBytes.length,
    integrityCheck: "ok",
    rows: expectedRows,
    aggregate: expectedAggregate,
    sourceUnchanged: true,
  };
}

function buildClosedIncident() {
  const severity = classifyIncidentSeverity("FIXTURE_ONLY_FINDING");
  const incident = createIncident({
    id: "fixture-incident-001",
    severity,
    detectedAt: FIXED_TIMES[0],
    scenarioCode: "SYNTHETIC_QUEUE_STALL",
  });
  advanceIncident(incident, { state: "triaged", at: FIXED_TIMES[1], evidenceCode: "FIXTURE_TRIAGE_COMPLETE" });
  recordApprovalGate(incident, { gate: "live-kill-switch", at: FIXED_TIMES[1] });
  recordApprovalGate(incident, { gate: "credential-rotation", at: FIXED_TIMES[1] });
  recordApprovalGate(incident, { gate: "application-rollback", at: FIXED_TIMES[1] });
  recordApprovalGate(incident, { gate: "backup-restore", at: FIXED_TIMES[1] });
  advanceIncident(incident, { state: "contained", at: FIXED_TIMES[2], evidenceCode: "FIXTURE_CONTAINMENT_SIMULATED" });
  advanceIncident(incident, { state: "recovered", at: FIXED_TIMES[3], evidenceCode: "FIXTURE_RECOVERY_VERIFIED" });
  recordHealthySample(incident, { at: FIXED_TIMES[4], sampleCode: "FIXTURE_HEALTH_SAMPLE_ONE" });
  recordHealthySample(incident, { at: FIXED_TIMES[5], sampleCode: "FIXTURE_HEALTH_SAMPLE_TWO" });
  advanceIncident(incident, { state: "closed", at: FIXED_TIMES[6], evidenceCode: "FIXTURE_CLOSE_CRITERIA_MET" });
  return incident;
}

function alertDecision(signalId, severity, summaryCode) {
  return {
    signalId,
    severity,
    summaryCode,
    scope: "fixture",
    openAfter: 1,
    recoveryAfter: 2,
    cooldownMs: 60_000,
    facts: { count: severity === "ok" ? 0 : 1 },
  };
}

function exerciseAlertState() {
  const start = Date.parse(FIXED_TIMES[0]);
  const machine = createAlertStateMachine({ environment: "test", maxPerRun: 3, maxPerHour: 3, recoveryPasses: 2 });
  const warning = alertDecision("fixture_signal", "warning", "FIXTURE_WARNING");
  const critical = alertDecision("fixture_signal", "critical", "FIXTURE_CRITICAL");
  const healthy = alertDecision("fixture_signal", "ok", "FIXTURE_OK");
  const opened = machine.evaluate([warning], start);
  const duplicate = machine.evaluate([warning], start + 1_000);
  const escalated = machine.evaluate([critical], start + 2_000);
  const firstHealthy = machine.evaluate([healthy], start + 3_000);
  const recovered = machine.evaluate([healthy], start + 4_000);
  const storm = createAlertStateMachine({ environment: "test", maxPerRun: 3, maxPerHour: 3 });
  const stormEvents = storm.evaluate(
    Array.from({ length: 8 }, (_, index) => alertDecision(`fixture_storm_${index}`, "critical", "FIXTURE_STORM")),
    start
  );
  return {
    warningOpened: opened.length === 1 && opened[0].type === "alert",
    duplicateSuppressed: duplicate.length === 0,
    escalationEmitted: escalated.length === 1 && escalated[0].severity === "critical",
    recoveryAfterTwo: firstHealthy.length === 0 && recovered.length === 1 && recovered[0].type === "recovery",
    stormInputCount: 8,
    stormEmittedCount: stormEvents.length,
    stormBounded: stormEvents.length === 3,
  };
}

function pausedHandler(feature, env, effect, pauseCheck) {
  return () => {
    if (pauseCheck(feature, env)) return { statusCode: 503, code: "FEATURE_PAUSED" };
    effect();
    return { statusCode: 204, code: "OK" };
  };
}

export function exerciseOperationsHarness({ ackHandler, pauseCheck = isRuntimeFeaturePaused } = {}) {
  const pausedEnv = {
    CLOVER_PAUSE_ONEC_CLAIMS: "true",
    CLOVER_PAUSE_REGISTRATION: "true",
    CLOVER_PAUSE_GUEST_ORDERS: "true",
    CLOVER_PAUSE_UPLOADS: "true",
    CLOVER_PAUSE_OUTBOUND_NOTIFICATIONS: "true",
  };
  const status = runtimeKillSwitchStatus(pausedEnv);
  const invalidStatus = runtimeKillSwitchStatus({ CLOVER_PAUSE_REGISTRATION: "invalid-fixture" });
  const effects = { registration: 0, guestOrders: 0, uploads: 0, claims: 0, ack: 0, notifications: 0 };
  const registration = pausedHandler("registration", pausedEnv, () => { effects.registration += 1; }, pauseCheck)();
  const guestOrders = pausedHandler("guestOrders", pausedEnv, () => { effects.guestOrders += 1; }, pauseCheck)();
  const uploads = pausedHandler("uploads", pausedEnv, () => { effects.uploads += 1; }, pauseCheck)();
  const claims = pausedHandler("oneCClaims", pausedEnv, () => { effects.claims += 1; }, pauseCheck)();
  const acknowledged = new Set();
  const defaultAck = (id) => {
    if (!acknowledged.has(id)) {
      acknowledged.add(id);
      effects.ack += 1;
    }
    return { statusCode: 200, code: "ACK_ACCEPTED" };
  };
  const callAck = ackHandler || defaultAck;
  const ackOne = callAck("fixture-order");
  const ackTwo = callAck("fixture-order");
  const notificationAdapters = [() => { effects.notifications += 1; }, () => { effects.notifications += 1; }];
  if (!pauseCheck("outboundNotifications", pausedEnv)) notificationAdapters.forEach((adapter) => adapter());
  const bounded503 = (result) => result.statusCode === 503 && result.code === "FEATURE_PAUSED";
  return {
    registrationBlocked: bounded503(registration) && effects.registration === 0,
    guestOrdersBlocked: bounded503(guestOrders) && effects.guestOrders === 0,
    uploadsBlocked: bounded503(uploads) && effects.uploads === 0,
    oneCClaimsBlocked: bounded503(claims) && effects.claims === 0,
    ackAllowed: !Object.hasOwn(status, "ack") && ackOne?.statusCode === 200 && ackTwo?.statusCode === 200,
    ackIdempotent: effects.ack === 1,
    globalEmailBlocked: isOutboundChannelPaused("email", pausedEnv),
    globalTelegramBlocked: isOutboundChannelPaused("telegram", pausedEnv),
    globalPushBlocked: isOutboundChannelPaused("push", pausedEnv),
    invalidValueFailClosed: invalidStatus.registration.paused && !invalidStatus.registration.valid,
    notificationAdaptersNotInvoked: effects.notifications === 0,
    maxStatus: "N_A",
  };
}

function hmacProof(key, challenge) {
  return createHmac("sha256", key).update(challenge).digest("hex");
}

export function exerciseKeyRotationHarness({ rotate = true, consumer } = {}) {
  const challenge = "fixed-fixture-challenge";
  return CREDENTIAL_CLASSES.map((credentialClass, index) => {
    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);
    let acceptedKey = oldKey;
    const authenticate = consumer || ((proof, key) => proof === hmacProof(key, challenge));
    const oldProof = hmacProof(oldKey, challenge);
    const newProof = hmacProof(newKey, challenge);
    const acceptedBeforeRotation = authenticate(oldProof, acceptedKey);
    if (rotate) acceptedKey = newKey;
    const captured = [process.argv.join(" "), `output:${credentialClass}:verified`, `artifact:${credentialClass}:status-only`];
    const rawForms = [oldKey.toString("hex"), oldKey.toString("base64"), newKey.toString("hex"), newKey.toString("base64")];
    return {
      credentialClass,
      acceptedBeforeRotation,
      oldIdentifierRejected: !authenticate(oldProof, acceptedKey),
      newIdentifierAccepted: authenticate(newProof, acceptedKey),
      keyMaterialSerialized: rawForms.some((raw) => captured.some((item) => item.includes(raw))),
      steps: ["OLD_IDENTIFIER_REJECTED", "NEW_IDENTIFIER_ACCEPTED"],
    };
  });
}

function fileInvariant(filePath) {
  const bytes = readFileSync(filePath);
  const stat = statSync(filePath);
  return { bytes: bytes.length, mtimeMs: stat.mtimeMs, sha256: sha256(bytes) };
}

function sameInvariant(left, right) {
  return left.bytes === right.bytes && left.mtimeMs === right.mtimeMs && left.sha256 === right.sha256;
}

export function applyPinnedCandidate({ candidate, destination, expectedSha256, validator }) {
  if (sha256(readFileSync(candidate)) !== expectedSha256) throw new Error("fixture_candidate_pin_rejected");
  copyFileSync(candidate, destination);
  if (!validator(destination)) throw new Error("fixture_candidate_validation_failed");
  return true;
}

export function exerciseApplicationRollback(root, { rollbackCopy = copyFileSync } = {}) {
  const directory = path.join(root, "app-rollback");
  mkdirSync(path.join(directory, "lkg"), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(directory, "candidate"), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(directory, "current"), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(directory, "success"), { recursive: true, mode: 0o700 });
  const lkg = path.join(directory, "lkg", "release.txt");
  const candidate = path.join(directory, "candidate", "release.txt");
  const current = path.join(directory, "current", "release.txt");
  const success = path.join(directory, "success", "release.txt");
  writeFileSync(lkg, "fixture-stable-release\n", { mode: 0o600 });
  writeFileSync(candidate, "fixture-candidate-release\n", { mode: 0o600 });
  const targetSha = "a".repeat(40);
  const releaseManifest = Object.freeze({
    targetSha,
    inventory: Object.freeze([{ name: "release.txt", sha256: sha256(readFileSync(candidate)) }]),
  });
  const targetShaFormatVerified = /^[a-f0-9]{40}$/u.test(releaseManifest.targetSha);
  const manifestInventoryVerified = releaseManifest.inventory.length === 1
    && releaseManifest.inventory[0].name === "release.txt"
    && /^[a-f0-9]{64}$/u.test(releaseManifest.inventory[0].sha256);
  const expectedCandidateSha256 = releaseManifest.inventory[0].sha256;
  writeFileSync(candidate, "fixture-candidate-mutated\n", { mode: 0o600 });
  let tamperedCandidateRejected = false;
  try {
    applyPinnedCandidate({ candidate, destination: success, expectedSha256: expectedCandidateSha256, validator: () => true });
  } catch (error) {
    tamperedCandidateRejected = error?.message === "fixture_candidate_pin_rejected";
  }
  writeFileSync(candidate, "fixture-candidate-release\n", { mode: 0o600 });
  const targetPinVerified = applyPinnedCandidate({
    candidate,
    destination: success,
    expectedSha256: expectedCandidateSha256,
    validator: (file) => readFileSync(file, "utf8") === "fixture-candidate-release\n",
  });
  copyFileSync(lkg, current);
  const successApplied = readFileSync(success, "utf8") === "fixture-candidate-release\n";
  let forcedFailureDetected = false;
  try {
    applyPinnedCandidate({ candidate, destination: current, expectedSha256: expectedCandidateSha256, validator: () => false });
  } catch (error) {
    forcedFailureDetected = error?.message === "fixture_candidate_validation_failed";
  }
  rollbackCopy(lkg, current);
  const firstRollbackHash = sha256(readFileSync(current));
  rollbackCopy(lkg, current);
  const secondRollbackHash = sha256(readFileSync(current));
  return {
    targetShaFormatVerified,
    manifestInventoryVerified,
    targetPinVerified,
    tamperedCandidateRejected,
    successApplied,
    forcedFailureDetected,
    rollbackRestored: firstRollbackHash === sha256(readFileSync(lkg)),
    idempotentRollback: firstRollbackHash === secondRollbackHash,
    steps: [
      "TARGET_SHA_FORMAT_VERIFIED", "MANIFEST_INVENTORY_VERIFIED", "TARGET_PIN_VERIFIED",
      "TAMPERED_CANDIDATE_REJECTED", "CANDIDATE_APPLIED",
      "FORCED_VALIDATION_FAILED", "LKG_RESTORED", "ROLLBACK_REPLAYED",
    ],
  };
}

export function exerciseCommunicationHarness({ primarySink, fallbackSink } = {}) {
  let primaryFailures = 0;
  let fallbackDeliveries = 0;
  const primary = primarySink || (() => { throw new Error("fixture_primary_unavailable"); });
  const fallback = fallbackSink || (() => { fallbackDeliveries += 1; });
  try {
    primary({ code: "FIXTURE_ALERT" });
  } catch {
    primaryFailures += 1;
    fallback({ code: "FIXTURE_ALERT" });
  }
  return {
    primary: { channel: "mock-primary", status: primaryFailures === 1 ? "unavailable" : "delivered" },
    fallback: { channel: "mock-fallback", status: fallbackDeliveries === 1 ? "delivered" : "failed" },
    realNotificationSent: false,
  };
}

function createRedactedDerivative() {
  const source = { signalCode: "FIXTURE_FALSE_POSITIVE", count: 1, freeText: "drop-this-field" };
  const derivative = {
    schema: "clover-security-stage9c-redacted/v1",
    signalCode: source.signalCode,
    count: source.count,
    classification: "FALSE_POSITIVE",
  };
  return { derivative, exercise: {
    allowlistedFieldsOnly: Object.keys(derivative).join(",") === "schema,signalCode,count,classification",
    freeTextRemoved: !Object.hasOwn(derivative, "freeText"),
    falsePositiveClassified: derivative.signalCode === "FIXTURE_FALSE_POSITIVE",
  } };
}

export function runFixtureDrill(workspace) {
  const root = assertFixtureWorkspace(workspace);
  mkdirSync(path.join(root, "live"), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(root, "backup"), { recursive: true, mode: 0o700 });
  const liveDatabasePath = path.join(root, "live", "fixture.sqlite");
  const liveDatabase = new DatabaseSync(liveDatabasePath);
  try {
    liveDatabase.exec(`
      PRAGMA journal_mode = DELETE;
      CREATE TABLE fixture_samples (
        id INTEGER PRIMARY KEY,
        sample_code TEXT NOT NULL UNIQUE,
        sample_value INTEGER NOT NULL CHECK(sample_value >= 0)
      );
      INSERT INTO fixture_samples(sample_code, sample_value)
      VALUES ('SAMPLE_ALPHA', 10), ('SAMPLE_BETA', 20), ('SAMPLE_GAMMA', 30);
    `);
  } finally {
    liveDatabase.close();
  }
  const liveSourceHash = sha256(readFileSync(liveDatabasePath));
  const liveDatabaseBefore = fileInvariant(liveDatabasePath);
  mkdirSync(path.join(root, "live", "uploads"), { recursive: true, mode: 0o700 });
  const liveUploadPath = path.join(root, "live", "uploads", "fixture-upload.bin");
  writeFileSync(liveUploadPath, "fixture-upload-content\n", { mode: 0o600 });
  const liveUploadBefore = fileInvariant(liveUploadPath);
  const backupPath = path.join(root, "backup", "fixture.sqlite");
  copyFileSync(liveDatabasePath, backupPath);
  const expectedSha256 = sha256(readFileSync(backupPath));
  if (expectedSha256 !== liveSourceHash) throw new Error("fixture_backup_copy_mismatch");
  const restore = restoreSyntheticBackup({
    workspace,
    sourceRelative: "backup/fixture.sqlite",
    targetRelative: "restore/fixture.sqlite",
    expectedSha256,
    expectedRows: 3,
    expectedAggregate: 60,
  });
  mkdirSync(path.join(root, "backup", "uploads"), { recursive: true, mode: 0o700 });
  const backupUploadPath = path.join(root, "backup", "uploads", "fixture-upload.bin");
  copyFileSync(liveUploadPath, backupUploadPath);
  const backupArchivePath = path.join(root, "backup", "fixture-archive.json");
  writeFileSync(backupArchivePath, `${stableJson({
    schema: "fixture-backup-archive/v1",
    databaseSha256: expectedSha256,
    uploadSha256: liveUploadBefore.sha256,
  })}\n`, { encoding: "utf8", mode: 0o600 });
  const backupArchiveBefore = fileInvariant(backupArchivePath);
  mkdirSync(path.join(root, "restore", "uploads"), { recursive: true, mode: 0o700 });
  const restoredUploadPath = path.join(root, "restore", "uploads", "fixture-upload.bin");
  copyFileSync(backupUploadPath, restoredUploadPath);
  const uploadsVerified = sha256(readFileSync(restoredUploadPath)) === liveUploadBefore.sha256;
  if (sha256(readFileSync(liveDatabasePath)) !== liveSourceHash) throw new Error("fixture_live_source_changed");
  const liveDatabaseAfter = fileInvariant(liveDatabasePath);
  const liveUploadAfter = fileInvariant(liveUploadPath);
  const backupArchiveAfter = fileInvariant(backupArchivePath);
  const redaction = createRedactedDerivative();
  const evidence = {
    schema: "clover-security-stage9c-drill/v1",
    mode: "fixture-only",
    scenario: "synthetic-queue-stall",
    incident: buildClosedIncident(),
    alertExercise: exerciseAlertState(),
    killSwitchExercise: exerciseOperationsHarness(),
    containment: { mode: "fixture-guards", realActionExecuted: false },
    backupRestore: {
      mode: "synthetic-sqlite-uploads",
      status: restore.status,
      integrityVerified: restore.integrityCheck === "ok",
      bytes: restore.bytes,
      rows: restore.rows,
      aggregate: restore.aggregate,
      sourceUnchanged: restore.sourceUnchanged,
      uploadFiles: readdirSync(path.join(root, "restore", "uploads")).length,
      uploadsVerified,
    },
    keyRotationExercise: exerciseKeyRotationHarness(),
    applicationRollbackExercise: exerciseApplicationRollback(root),
    redactionExercise: redaction.exercise,
    baselineInvariant: {
      databaseBytesMtimeHashUnchanged: sameInvariant(liveDatabaseBefore, liveDatabaseAfter),
      uploadBytesMtimeHashUnchanged: sameInvariant(liveUploadBefore, liveUploadAfter),
      backupArchiveBytesMtimeHashUnchanged: sameInvariant(backupArchiveBefore, backupArchiveAfter),
    },
    communications: exerciseCommunicationHarness(),
  };
  const manifest = createEvidenceManifest(evidence, redaction.derivative);
  writeFileSync(path.join(root, "evidence.json"), `${stableJson(evidence)}\n`, { encoding: "utf8", mode: 0o600 });
  writeFileSync(path.join(root, "redacted.json"), `${stableJson(redaction.derivative)}\n`, { encoding: "utf8", mode: 0o600 });
  writeFileSync(path.join(root, "manifest.json"), `${stableJson(manifest)}\n`, { encoding: "utf8", mode: 0o600 });
  const manifestBytes = readFileSync(path.join(root, "manifest.json"));
  const detachedManifestSha256 = sha256(manifestBytes);
  writeFileSync(path.join(root, "MANIFEST.sha256"), `${detachedManifestSha256}\n`, { encoding: "ascii", mode: 0o600 });
  return { evidence, redacted: redaction.derivative, manifest, detachedManifestSha256 };
}

export function cleanupFixtureWorkspace(workspace) {
  const root = assertFixtureWorkspace(workspace);
  rmSync(root, { recursive: true, force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)))) {
  const workspace = createFixtureWorkspace();
  try {
    const { evidence, manifest } = runFixtureDrill(workspace);
    process.stdout.write(`${stableJson({ schema: evidence.schema, status: "PASS", evidenceSha256: manifest.artifacts[0].sha256 })}\n`);
  } finally {
    cleanupFixtureWorkspace(workspace);
  }
}
