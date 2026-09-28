import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_MATRIX,
  advanceIncident,
  assertDrillEvidence,
  assertSyntheticValue,
  classifyIncidentSeverity,
  createEvidenceManifest,
  createIncident,
  recordHealthySample,
  sha256,
  verifyEvidenceManifest,
  verifyDetachedManifest,
} from "../src/incidentResponse/contracts.js";
import {
  applyPinnedCandidate,
  cleanupFixtureWorkspace,
  createFixtureWorkspace,
  assertFixtureWorkspace,
  exerciseApplicationRollback,
  exerciseCommunicationHarness,
  exerciseKeyRotationHarness,
  exerciseOperationsHarness,
  restoreSyntheticBackup,
  runFixtureDrill,
} from "./run-security-stage9c-fixture-drill.mjs";

function baseEvidence() {
  const workspace = createFixtureWorkspace();
  try { return runFixtureDrill(workspace).evidence; } finally { cleanupFixtureWorkspace(workspace); }
}

function validRedacted() {
  return {
    schema: "clover-security-stage9c-redacted/v1",
    signalCode: "FIXTURE_FALSE_POSITIVE",
    count: 1,
    classification: "FALSE_POSITIVE",
  };
}

function createSqliteFixture(filePath) {
  const database = new DatabaseSync(filePath);
  try {
    database.exec(`
      CREATE TABLE fixture_samples (
        id INTEGER PRIMARY KEY,
        sample_code TEXT NOT NULL UNIQUE,
        sample_value INTEGER NOT NULL
      );
      INSERT INTO fixture_samples(sample_code, sample_value)
      VALUES ('SAMPLE_ALPHA', 10), ('SAMPLE_BETA', 20), ('SAMPLE_GAMMA', 30);
    `);
  } finally { database.close(); }
}

test("severity classifier and lifecycle contracts are closed and ordered", () => {
  assert.deepEqual(INCIDENT_SEVERITIES, ["SEV1", "SEV2", "SEV3", "SEV4"]);
  assert.deepEqual(
    Object.fromEntries(Object.keys(INCIDENT_SEVERITY_MATRIX).map((code) => [code, classifyIncidentSeverity(code)])),
    INCIDENT_SEVERITY_MATRIX
  );
  assert.deepEqual(new Set(Object.values(INCIDENT_SEVERITY_MATRIX)), new Set(INCIDENT_SEVERITIES));
  assert.throws(() => classifyIncidentSeverity("UNREVIEWED_IMPACT"), /impact_code_invalid/u);
  assert.throws(() => createIncident({ id: "fixture-one", severity: "SEV5", detectedAt: "2030-01-01T00:00:00Z", scenarioCode: "SYNTHETIC" }), /severity_invalid/u);
  const incident = createIncident({ id: "fixture-one", severity: "SEV1", detectedAt: "2030-01-01T00:00:00Z", scenarioCode: "SYNTHETIC" });
  assert.throws(() => advanceIncident(incident, { state: "contained", at: "2030-01-01T00:01:00Z", evidenceCode: "SKIP" }), /transition_invalid/u);
  advanceIncident(incident, { state: "triaged", at: "2030-01-01T00:01:00Z", evidenceCode: "TRIAGED" });
  advanceIncident(incident, { state: "contained", at: "2030-01-01T00:02:00Z", evidenceCode: "CONTAINED" });
  advanceIncident(incident, { state: "recovered", at: "2030-01-01T00:03:00Z", evidenceCode: "RECOVERED" });
  assert.throws(() => advanceIncident(incident, { state: "closed", at: "2030-01-01T00:04:00Z", evidenceCode: "CLOSED" }), /two_healthy_samples_required/u);
  recordHealthySample(incident, { at: "2030-01-01T00:04:00Z", sampleCode: "HEALTH_ONE" });
  recordHealthySample(incident, { at: "2030-01-01T00:05:00Z", sampleCode: "HEALTH_TWO" });
  assert.throws(
    () => advanceIncident(incident, { state: "closed", at: "2030-01-01T00:04:30Z", evidenceCode: "CLOSED" }),
    /close_before_health_samples/u
  );
  advanceIncident(incident, { state: "closed", at: "2030-01-01T00:06:00Z", evidenceCode: "CLOSED" });
  assert.equal(incident.state, "closed");
});

test("fixture drill is deterministic, bounded, synthetic and cleaned", () => {
  const first = createFixtureWorkspace();
  const second = createFixtureWorkspace();
  const firstRoot = first.root;
  const secondRoot = second.root;
  try {
    const one = runFixtureDrill(first);
    const two = runFixtureDrill(second);
    assert.deepEqual(one, two);
    assert.equal(one.evidence.incident.state, "closed");
    assert.deepEqual(one.evidence.incident.timeline.map((item) => item.state), ["detected", "triaged", "contained", "recovered", "closed"]);
    assert.equal(one.evidence.incident.healthySamples.length, 2);
    assert.equal(one.evidence.incident.severity, classifyIncidentSeverity("FIXTURE_ONLY_FINDING"));
    assert.equal(one.evidence.incident.timeline.at(-1).evidenceCode, "FIXTURE_CLOSE_CRITERIA_MET");
    assert.equal(one.evidence.communications.primary.status, "unavailable");
    assert.equal(one.evidence.communications.fallback.status, "delivered");
    assert.ok(one.evidence.keyRotationExercise.every((item) => item.keyMaterialSerialized === false));
    assert.equal(one.evidence.applicationRollbackExercise.idempotentRollback, true);
    assert.equal(one.evidence.applicationRollbackExercise.targetShaFormatVerified, true);
    assert.equal(one.evidence.applicationRollbackExercise.manifestInventoryVerified, true);
    assert.equal(one.evidence.applicationRollbackExercise.targetPinVerified, true);
    assert.equal(one.evidence.applicationRollbackExercise.tamperedCandidateRejected, true);
    assert.equal(one.evidence.alertExercise.stormBounded, true);
    assert.equal(one.evidence.killSwitchExercise.ackAllowed, true);
    assert.equal(one.evidence.backupRestore.uploadsVerified, true);
    assert.equal(one.evidence.baselineInvariant.databaseBytesMtimeHashUnchanged, true);
    assert.equal(one.evidence.baselineInvariant.backupArchiveBytesMtimeHashUnchanged, true);
    assert.ok(one.evidence.incident.approvals.every((gate) => gate.required && !gate.approved));
    const evidenceBytes = readFileSync(path.join(firstRoot, "evidence.json"));
    const redactedBytes = readFileSync(path.join(firstRoot, "redacted.json"));
    const manifestBytes = readFileSync(path.join(firstRoot, "manifest.json"));
    const detachedBytes = readFileSync(path.join(firstRoot, "MANIFEST.sha256"));
    assert.equal(one.manifest.artifacts[0].sha256, sha256(evidenceBytes));
    assert.equal(one.manifest.artifacts[0].bytes, evidenceBytes.length);
    assert.equal(one.manifest.artifacts[1].sha256, sha256(redactedBytes));
    assert.equal(one.manifest.artifacts[1].bytes, redactedBytes.length);
    assert.deepEqual(one.redacted, validRedacted());
    assert.ok(evidenceBytes.length < 32 * 1024);
    assert.equal(verifyEvidenceManifest({ evidenceBytes, redactedBytes, manifest: one.manifest }), true);
    assert.equal(verifyDetachedManifest({ manifestBytes, detachedBytes }), true);
    assert.equal(detachedBytes.toString("ascii"), `${sha256(manifestBytes)}\n`);
    assert.throws(() => verifyEvidenceManifest({ evidenceBytes: Buffer.concat([evidenceBytes, Buffer.from(" ")]), redactedBytes, manifest: one.manifest }), /integrity_mismatch/u);
    assert.throws(() => verifyEvidenceManifest({ evidenceBytes, redactedBytes: Buffer.concat([redactedBytes, Buffer.from(" ")]), manifest: one.manifest }), /integrity_mismatch/u);
    assert.throws(() => verifyDetachedManifest({ manifestBytes: Buffer.concat([manifestBytes, Buffer.from(" ")]), detachedBytes }), /integrity_mismatch/u);
    const artifacts = `${evidenceBytes.toString("utf8")}\n${redactedBytes.toString("utf8")}\n${manifestBytes.toString("utf8")}`;
    assert.doesNotMatch(artifacts, /\bproduction\b|\bVLAVKA\b|https?:\/\/|\bCL-\d{6,}-\d{3,}\b/iu);
    assert.doesNotMatch(artifacts, /\b[^@\s]+@[^@\s]+\.[^@\s]+\b/u);
    assert.doesNotMatch(artifacts, /\b[A-Za-z]:[\\/]|(?:^|[\s"'=])\//mu);
    const archivePath = path.join(firstRoot, "backup", "fixture-archive.json");
    const archiveBefore = { sha256: sha256(readFileSync(archivePath)), mtimeMs: statSync(archivePath).mtimeMs };
    appendFileSync(archivePath, "tamper\n");
    const archiveAfter = { sha256: sha256(readFileSync(archivePath)), mtimeMs: statSync(archivePath).mtimeMs };
    assert.notDeepEqual(archiveAfter, archiveBefore);
    const archiveTamperEvidence = structuredClone(one.evidence);
    archiveTamperEvidence.baselineInvariant.backupArchiveBytesMtimeHashUnchanged = false;
    assert.throws(() => assertDrillEvidence(archiveTamperEvidence), /baseline_changed/u);
  } finally {
    cleanupFixtureWorkspace(first);
    cleanupFixtureWorkspace(second);
  }
  assert.equal(existsSync(firstRoot), false);
  assert.equal(existsSync(secondRoot), false);
});

test("fixture workspace cannot be forged outside the operating-system temp root", () => {
  assert.throws(
    () => assertFixtureWorkspace({ root: process.cwd(), marker: "a".repeat(48) }),
    /outside_temp/u
  );
});

test("unsafe environment, endpoint, order, contact and path values fail closed", () => {
  const syntheticUnsafeOrder = ["CL", "999999", "999999", "999"].join("-");
  for (const unsafeScenario of [
    "production", "VLAVKA", "https://fixture.invalid", "192.0.2.10", syntheticUnsafeOrder,
    "person@example.invalid", "+7 999 123 45 67", "/opt/clover/data.sqlite", "C:\\Users\\Operator\\data.sqlite",
    "John Smith",
    "Cyrillic-\u0418\u043c\u044f", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJmaXh0dXJlIn0.c2lnbmF0dXJl",
  ]) {
    assert.throws(() => createEvidenceManifest({ ...baseEvidence(), scenario: unsafeScenario }, validRedacted()), /unsafe|non_ascii|scenario_invalid/u);
  }
  for (const unsafeField of [{ token: "synthetic-value" }, { customerEmail: "person@example.invalid" }]) {
    assert.throws(() => createEvidenceManifest({ ...baseEvidence(), ...unsafeField }, validRedacted()), /unsafe_field/u);
  }
  assert.throws(() => assertSyntheticValue({ rows: Array.from({ length: 17 }, () => 1) }), /too_many_items/u);
});

test("deep evidence validation rejects nested and manifest tampering", () => {
  const valid = baseEvidence();
  const cases = [
    (value) => { value.incident.timeline[0].extra = true; },
    (value) => { value.incident.id = "John Smith"; },
    (value) => { value.incident.scenarioCode = "John Smith"; },
    (value) => { value.incident.timeline[1].evidenceCode = "bad code"; },
    (value) => { value.incident.timeline[2].at = "2029-01-01T00:00:00.000Z"; },
    (value) => { value.incident.timeline[4].at = value.incident.healthySamples[1].at; },
    (value) => { value.incident.approvals[0].approved = true; },
    (value) => { value.incident.approvals[0].extra = true; },
    (value) => { value.incident.approvals.reverse(); },
    (value) => { value.incident.approvals[0].at = "2040-01-01T00:00:00.000Z"; },
    (value) => { value.incident.healthySamples[0].sampleCode = "bad code"; },
    (value) => { value.communications.primary.extra = true; },
    (value) => { value.keyRotationExercise[0].steps[0] = "SKIPPED"; },
    (value) => { value.applicationRollbackExercise.steps.pop(); },
    (value) => { value.applicationRollbackExercise.targetShaFormatVerified = false; },
    (value) => { value.applicationRollbackExercise.manifestInventoryVerified = false; },
    (value) => { value.applicationRollbackExercise.targetPinVerified = false; },
    (value) => { value.applicationRollbackExercise.tamperedCandidateRejected = false; },
    (value) => { value.backupRestore.bytes = -1; },
    (value) => { value.backupRestore.aggregate = -1; },
  ];
  for (const mutate of cases) {
    const tampered = structuredClone(valid);
    mutate(tampered);
    assert.throws(() => assertDrillEvidence(tampered));
    assert.throws(() => createEvidenceManifest(tampered, validRedacted()));
  }
  const workspace = createFixtureWorkspace();
  try {
    const result = runFixtureDrill(workspace);
    const bytes = readFileSync(path.join(workspace.root, "evidence.json"));
    const redactedBytes = readFileSync(path.join(workspace.root, "redacted.json"));
    for (const mutateManifest of [
      (manifest) => { manifest.artifacts[0].bytes += 1; },
      (manifest) => { manifest.artifacts[0].sha256 = "0".repeat(64); },
      (manifest) => { manifest.artifacts[0].path = "other.json"; },
      (manifest) => { manifest.artifacts.push(structuredClone(manifest.artifacts[0])); },
    ]) {
      const manifest = structuredClone(result.manifest);
      mutateManifest(manifest);
      assert.throws(() => verifyEvidenceManifest({ evidenceBytes: bytes, redactedBytes, manifest }));
    }
    const redactedTampered = structuredClone(result.redacted);
    redactedTampered.extra = true;
    assert.throws(() => createEvidenceManifest(result.evidence, redactedTampered));
  } finally { cleanupFixtureWorkspace(workspace); }
});

test("callable harnesses expose injected ACK, guard, rotation, rollback and fallback failures", () => {
  const valid = baseEvidence();
  for (const killSwitchExercise of [
    exerciseOperationsHarness({ ackHandler: () => ({ statusCode: 500, code: "BROKEN" }) }),
    exerciseOperationsHarness({ pauseCheck: () => false }),
  ]) {
    assert.throws(() => assertDrillEvidence({ ...structuredClone(valid), killSwitchExercise }), /kill_switch/u);
  }
  for (const keyRotationExercise of [
    exerciseKeyRotationHarness({ rotate: false }),
    exerciseKeyRotationHarness({ consumer: () => true }),
  ]) {
    assert.throws(() => assertDrillEvidence({ ...structuredClone(valid), keyRotationExercise }), /rotation/u);
  }
  assert.throws(
    () => assertDrillEvidence({
      ...structuredClone(valid),
      communications: exerciseCommunicationHarness({ fallbackSink: () => {} }),
    }),
    /communications/u
  );

  const workspace = createFixtureWorkspace();
  try {
    const rollback = exerciseApplicationRollback(workspace.root, { rollbackCopy: () => {} });
    assert.throws(
      () => assertDrillEvidence({ ...structuredClone(valid), applicationRollbackExercise: rollback }),
      /rollback/u
    );
    const candidate = path.join(workspace.root, "pin-candidate.txt");
    const destination = path.join(workspace.root, "pin-destination.txt");
    writeFileSync(candidate, "candidate\n");
    assert.throws(
      () => applyPinnedCandidate({ candidate, destination, expectedSha256: "0".repeat(64), validator: () => true }),
      /pin_rejected/u
    );
    assert.throws(
      () => applyPinnedCandidate({ candidate, destination, expectedSha256: sha256(readFileSync(candidate)), validator: () => false }),
      /validation_failed/u
    );
  } finally { cleanupFixtureWorkspace(workspace); }
});

test("synthetic SQLite restore verifies integrity, aggregate and unchanged source", () => {
  const workspace = createFixtureWorkspace();
  try {
    mkdirSync(path.join(workspace.root, "backup"));
    const sourcePath = path.join(workspace.root, "backup", "source.sqlite");
    createSqliteFixture(sourcePath);
    const bytes = readFileSync(sourcePath);
    const expectedSha256 = sha256(bytes);
    const restoreArgs = { workspace, sourceRelative: "backup/source.sqlite", expectedSha256, expectedRows: 3, expectedAggregate: 60 };
    const restored = restoreSyntheticBackup({ ...restoreArgs, targetRelative: "restore/target.sqlite" });
    assert.deepEqual(restored, { status: "verified", bytes: bytes.length, integrityCheck: "ok", rows: 3, aggregate: 60, sourceUnchanged: true });
    assert.equal(sha256(readFileSync(sourcePath)), expectedSha256);
    assert.throws(() => restoreSyntheticBackup({ ...restoreArgs, targetRelative: "../outside.sqlite" }), /path_escape/u);
    assert.throws(() => restoreSyntheticBackup({ ...restoreArgs, sourceRelative: path.resolve(sourcePath), targetRelative: "restore/absolute.sqlite" }), /relative_path_required/u);
    assert.throws(() => restoreSyntheticBackup({ ...restoreArgs, targetRelative: "restore/bad.sqlite", expectedSha256: "0".repeat(64) }), /integrity_mismatch/u);
    const corruptPath = path.join(workspace.root, "backup", "corrupt.sqlite");
    writeFileSync(corruptPath, "not-a-sqlite-database");
    assert.throws(() => restoreSyntheticBackup({
      ...restoreArgs,
      sourceRelative: "backup/corrupt.sqlite",
      targetRelative: "restore/corrupt.sqlite",
      expectedSha256: sha256(readFileSync(corruptPath)),
    }), /database|sqlite|integrity|file/u);
    assert.throws(() => restoreSyntheticBackup({ ...restoreArgs, targetRelative: "restore/wrong.sqlite", expectedAggregate: 61 }), /aggregate_mismatch/u);
    mkdirSync(path.join(workspace.root, "outside"));
    try {
      symlinkSync(
        path.join(workspace.root, "outside"),
        path.join(workspace.root, "linked"),
        process.platform === "win32" ? "junction" : "dir"
      );
      assert.throws(() => restoreSyntheticBackup({ ...restoreArgs, targetRelative: "linked/target.sqlite" }), /parent_symlink_forbidden/u);
    } catch (error) {
      if (process.platform !== "win32" || !["EPERM", "EACCES", "UNKNOWN"].includes(error?.code)) throw error;
    }
  } finally { cleanupFixtureWorkspace(workspace); }
});

test("runbook and ADR keep required residual limitations explicit", () => {
  const scriptsDirectory = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)));
  const repositoryRoot = path.resolve(scriptsDirectory, "..", "..");
  for (const relative of ["docs/technical/ADR-STAGE9C-INCIDENT-RESPONSE.md", "docs/technical/SECURITY_STAGE9C_INCIDENT_RUNBOOK.md"]) {
    const document = readFileSync(path.join(repositoryRoot, relative), "utf8");
    assert.match(document, /production restore (?:remains |is )?`?NOT VERIFIED`?/iu);
    assert.match(document, /MAX[^\n]*(?:`N\/A`|N\/A)/u);
    assert.match(document, /ACK[^\n]*(?:remain|leave)[^\n]*available/iu);
    assert.match(document, /REQUIRES EXPLICIT OWNER APPROVAL/u);
  }
});

test("drill source has no external execution or integration surface", () => {
  const source = readFileSync(new URL("./run-security-stage9c-fixture-drill.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /node:(?:child_process|http|https|net|tls|dgram)/u);
  assert.doesNotMatch(source, /\b(?:fetch|systemctl|git|ssh)\s*\(/u);
  assert.doesNotMatch(source, /process\.env/u);
});
