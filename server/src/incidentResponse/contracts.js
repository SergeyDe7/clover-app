import { createHash } from "node:crypto";

export const INCIDENT_SCHEMA = "clover-security-stage9c-incident/v1";
export const INCIDENT_SEVERITIES = Object.freeze(["SEV1", "SEV2", "SEV3", "SEV4"]);
export const INCIDENT_SEVERITY_MATRIX = Object.freeze({
  CONFIRMED_ACTIVE_COMPROMISE: "SEV1",
  CONFIRMED_DUPLICATE_OR_CONTOUR: "SEV1",
  UNKNOWN_SECURITY_SCOPE: "SEV2",
  CORE_AVAILABILITY_LOSS: "SEV2",
  BACKUP_INTEGRITY_FAILURE: "SEV2",
  BOUNDED_PARTIAL_FAILURE: "SEV3",
  SINGLE_CHANNEL_FAILURE: "SEV3",
  DOCUMENTATION_GAP: "SEV4",
  FIXTURE_ONLY_FINDING: "SEV4",
});
export const INCIDENT_STATES = Object.freeze([
  "detected",
  "triaged",
  "contained",
  "recovered",
  "closed",
]);
export const OWNER_APPROVAL_GATES = Object.freeze([
  "live-kill-switch",
  "credential-rotation",
  "application-rollback",
  "backup-restore",
]);

const SAFE_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const FORBIDDEN_TEXT = [
  /\bproduction\b/iu,
  /\bVLAVKA\b/iu,
  /https?:\/\//iu,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/u,
  /\bCL-\d{6,}-\d{3,}\b/iu,
  /\b[^@\s]+@[^@\s]+\.[^@\s]+\b/u,
  /\+\d[\d ()-]{8,}\d/u,
  /\b(?:7|8)[ -]?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b/u,
  /(?:^|[\s"'=])\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+/u,
  /\b[A-Za-z]:[\\/]+(?:[^\s\\/]+[\\/]+)*[^\s\\/]+/u,
  /(?:password|passwd|secret|token|cookie|authorization|api[_-]?key|private[_-]?key)/iu,
  /BEGIN [A-Z ]*PRIVATE KEY/u,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
];

function requireEnum(value, allowed, code) {
  if (!allowed.includes(value)) throw new Error(code);
  return value;
}

export function classifyIncidentSeverity(impactCode) {
  if (typeof impactCode !== "string" || !Object.hasOwn(INCIDENT_SEVERITY_MATRIX, impactCode)) {
    throw new Error("incident_impact_code_invalid");
  }
  return INCIDENT_SEVERITY_MATRIX[impactCode];
}

export function assertSyntheticValue(value, field = "value", depth = 0) {
  if (depth > 5) throw new Error("fixture_evidence_too_deep");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    if (value.length > 160) throw new Error(`fixture_${field}_too_long`);
    if (!/^[\x20-\x7E]*$/u.test(value)) throw new Error(`fixture_${field}_non_ascii`);
    if (FORBIDDEN_TEXT.some((pattern) => pattern.test(value))) {
      throw new Error(`fixture_${field}_unsafe`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 16) throw new Error("fixture_evidence_too_many_items");
    return value.map((item, index) => assertSyntheticValue(item, `${field}_${index}`, depth + 1));
  }
  if (!value || typeof value !== "object") throw new Error(`fixture_${field}_invalid`);
  const entries = Object.entries(value);
  if (entries.length > 24) throw new Error("fixture_evidence_too_many_fields");
  const result = {};
  for (const [key, item] of entries) {
    if (!/^[a-z][a-zA-Z0-9]{0,39}$/u.test(key)) throw new Error("fixture_evidence_invalid_field");
    if (/(?:token|secret|password|cookie|authorization|apiKey|privateKey|email|phone)$/iu.test(key)) {
      throw new Error("fixture_evidence_unsafe_field");
    }
    result[key] = assertSyntheticValue(item, key, depth + 1);
  }
  return result;
}

function assertTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("incident_timestamp_invalid");
  }
  return new Date(value).toISOString();
}

export function createIncident({ id, severity, detectedAt, scenarioCode }) {
  if (!SAFE_ID.test(String(id || ""))) throw new Error("incident_id_invalid");
  requireEnum(severity, INCIDENT_SEVERITIES, "incident_severity_invalid");
  if (!SAFE_CODE.test(String(scenarioCode || ""))) throw new Error("incident_scenario_invalid");
  const timestamp = assertTimestamp(detectedAt);
  return {
    schema: INCIDENT_SCHEMA,
    id,
    severity,
    scenarioCode,
    state: "detected",
    timeline: [{ state: "detected", at: timestamp, evidenceCode: "FIXTURE_SIGNAL_DETECTED" }],
    approvals: [],
    healthySamples: [],
  };
}

export function recordApprovalGate(incident, { gate, required = true, approved = false, at }) {
  requireEnum(gate, OWNER_APPROVAL_GATES, "incident_approval_gate_invalid");
  if (approved) throw new Error("fixture_owner_approval_cannot_be_granted");
  if (incident.approvals.some((item) => item.gate === gate)) throw new Error("incident_approval_gate_duplicate");
  incident.approvals.push({ gate, required: Boolean(required), approved: false, at: assertTimestamp(at) });
  return incident;
}

export function advanceIncident(incident, { state, at, evidenceCode }) {
  const currentIndex = INCIDENT_STATES.indexOf(incident.state);
  const nextIndex = INCIDENT_STATES.indexOf(state);
  if (currentIndex < 0 || nextIndex !== currentIndex + 1) throw new Error("incident_transition_invalid");
  if (!SAFE_CODE.test(String(evidenceCode || ""))) throw new Error("incident_evidence_code_invalid");
  if (state === "closed" && incident.healthySamples.length < 2) {
    throw new Error("incident_two_healthy_samples_required");
  }
  const timestamp = assertTimestamp(at);
  if (state === "closed" && Date.parse(timestamp) <= Date.parse(incident.healthySamples.at(-1).at)) {
    throw new Error("incident_close_before_health_samples");
  }
  if (Date.parse(timestamp) < Date.parse(incident.timeline.at(-1).at)) throw new Error("incident_timeline_not_monotonic");
  incident.state = state;
  incident.timeline.push({ state, at: timestamp, evidenceCode });
  return incident;
}

export function recordHealthySample(incident, { at, sampleCode }) {
  if (incident.state !== "recovered") throw new Error("incident_healthy_sample_wrong_state");
  if (!SAFE_CODE.test(String(sampleCode || ""))) throw new Error("incident_sample_code_invalid");
  if (incident.healthySamples.length >= 2) throw new Error("incident_healthy_samples_bounded");
  const timestamp = assertTimestamp(at);
  if (Date.parse(timestamp) <= Date.parse(incident.timeline.at(-1).at)) throw new Error("incident_sample_not_after_recovery");
  if (incident.healthySamples.length && Date.parse(timestamp) <= Date.parse(incident.healthySamples.at(-1).at)) {
    throw new Error("incident_samples_not_monotonic");
  }
  incident.healthySamples.push({ at: timestamp, sampleCode });
  return incident;
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertExactKeys(value, expected, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(code);
}

export function assertDrillEvidence(evidence) {
  assertExactKeys(evidence, [
    "schema", "mode", "scenario", "incident", "alertExercise", "killSwitchExercise",
    "containment", "backupRestore", "keyRotationExercise", "applicationRollbackExercise",
    "redactionExercise", "baselineInvariant", "communications",
  ], "fixture_evidence_schema_invalid");
  if (evidence.schema !== "clover-security-stage9c-drill/v1" || evidence.mode !== "fixture-only") {
    throw new Error("fixture_evidence_schema_invalid");
  }
  if (evidence.scenario !== "synthetic-queue-stall") throw new Error("fixture_scenario_invalid");
  assertExactKeys(evidence.incident, [
    "schema", "id", "severity", "scenarioCode", "state", "timeline", "approvals", "healthySamples",
  ], "fixture_incident_schema_invalid");
  if (evidence.incident.schema !== INCIDENT_SCHEMA || evidence.incident.state !== "closed") {
    throw new Error("fixture_incident_not_closed");
  }
  if (!SAFE_ID.test(String(evidence.incident.id || ""))) throw new Error("incident_id_invalid");
  if (!SAFE_CODE.test(String(evidence.incident.scenarioCode || ""))) throw new Error("incident_scenario_invalid");
  requireEnum(evidence.incident.severity, INCIDENT_SEVERITIES, "incident_severity_invalid");
  if (!Array.isArray(evidence.incident.timeline)
      || evidence.incident.timeline.length !== INCIDENT_STATES.length
      || evidence.incident.timeline.some((item, index) => item.state !== INCIDENT_STATES[index])) {
    throw new Error("fixture_incident_lifecycle_invalid");
  }
  let previousTimelineAt = Number.NEGATIVE_INFINITY;
  for (const item of evidence.incident.timeline) {
    assertExactKeys(item, ["state", "at", "evidenceCode"], "fixture_incident_timeline_schema_invalid");
    if (!SAFE_CODE.test(String(item.evidenceCode || ""))) throw new Error("fixture_incident_timeline_code_invalid");
    const timestamp = Date.parse(assertTimestamp(item.at));
    if (timestamp <= previousTimelineAt) throw new Error("fixture_incident_timeline_order_invalid");
    previousTimelineAt = timestamp;
  }
  if (!Array.isArray(evidence.incident.healthySamples) || evidence.incident.healthySamples.length !== 2) {
    throw new Error("incident_two_healthy_samples_required");
  }
  let previousSampleAt = Date.parse(evidence.incident.timeline[3].at);
  for (const sample of evidence.incident.healthySamples) {
    assertExactKeys(sample, ["at", "sampleCode"], "fixture_health_sample_schema_invalid");
    if (!SAFE_CODE.test(String(sample.sampleCode || ""))) throw new Error("fixture_health_sample_code_invalid");
    const timestamp = Date.parse(assertTimestamp(sample.at));
    if (timestamp <= previousSampleAt) throw new Error("fixture_health_sample_order_invalid");
    previousSampleAt = timestamp;
  }
  if (Date.parse(evidence.incident.timeline[4].at) <= previousSampleAt) {
    throw new Error("fixture_close_before_health_samples");
  }
  if (!Array.isArray(evidence.incident.approvals)
      || evidence.incident.approvals.length !== OWNER_APPROVAL_GATES.length
      || evidence.incident.approvals.some((item) => item.required !== true || item.approved !== false)
      || OWNER_APPROVAL_GATES.some((gate) => !evidence.incident.approvals.some((item) => item.gate === gate))) {
    throw new Error("fixture_owner_approval_gates_invalid");
  }
  let previousApprovalAt = Date.parse(evidence.incident.timeline[0].at);
  for (const [index, approval] of evidence.incident.approvals.entries()) {
    assertExactKeys(approval, ["gate", "required", "approved", "at"], "fixture_approval_schema_invalid");
    requireEnum(approval.gate, OWNER_APPROVAL_GATES, "incident_approval_gate_invalid");
    if (approval.gate !== OWNER_APPROVAL_GATES[index]) throw new Error("fixture_approval_order_invalid");
    const approvalAt = Date.parse(assertTimestamp(approval.at));
    if (approvalAt < previousApprovalAt || approvalAt > Date.parse(evidence.incident.timeline[4].at)) {
      throw new Error("fixture_approval_timestamp_order_invalid");
    }
    previousApprovalAt = approvalAt;
  }
  assertExactKeys(evidence.alertExercise, [
    "warningOpened", "duplicateSuppressed", "escalationEmitted", "recoveryAfterTwo",
    "stormInputCount", "stormEmittedCount", "stormBounded",
  ], "fixture_alert_exercise_schema_invalid");
  for (const key of ["warningOpened", "duplicateSuppressed", "escalationEmitted", "recoveryAfterTwo", "stormBounded"]) {
    if (evidence.alertExercise[key] !== true) throw new Error("fixture_alert_exercise_failed");
  }
  if (evidence.alertExercise.stormInputCount !== 8 || evidence.alertExercise.stormEmittedCount !== 3) {
    throw new Error("fixture_alert_storm_invalid");
  }
  assertExactKeys(evidence.killSwitchExercise, [
    "registrationBlocked", "guestOrdersBlocked", "uploadsBlocked", "oneCClaimsBlocked", "ackAllowed",
    "ackIdempotent", "globalEmailBlocked", "globalTelegramBlocked", "globalPushBlocked",
    "invalidValueFailClosed", "notificationAdaptersNotInvoked", "maxStatus",
  ], "fixture_kill_switch_schema_invalid");
  for (const [key, value] of Object.entries(evidence.killSwitchExercise)) {
    if (key === "maxStatus") {
      if (value !== "N_A") throw new Error("fixture_max_status_invalid");
    } else if (value !== true) throw new Error("fixture_kill_switch_exercise_failed");
  }
  assertExactKeys(evidence.containment, ["mode", "realActionExecuted"], "fixture_containment_schema_invalid");
  if (evidence.containment.mode !== "fixture-guards" || evidence.containment.realActionExecuted !== false) {
    throw new Error("fixture_real_action_forbidden");
  }
  assertExactKeys(evidence.backupRestore, [
    "mode", "status", "integrityVerified", "bytes", "rows", "aggregate", "sourceUnchanged",
    "uploadFiles", "uploadsVerified",
  ], "fixture_restore_schema_invalid");
  if (evidence.backupRestore.mode !== "synthetic-sqlite-uploads"
      || evidence.backupRestore.status !== "verified"
      || evidence.backupRestore.integrityVerified !== true
      || evidence.backupRestore.sourceUnchanged !== true
      || evidence.backupRestore.uploadsVerified !== true
      || !Number.isSafeInteger(evidence.backupRestore.rows) || evidence.backupRestore.rows < 0
      || !Number.isSafeInteger(evidence.backupRestore.aggregate) || evidence.backupRestore.aggregate < 0
      || !Number.isSafeInteger(evidence.backupRestore.bytes) || evidence.backupRestore.bytes < 0
      || !Number.isSafeInteger(evidence.backupRestore.uploadFiles) || evidence.backupRestore.uploadFiles < 0) {
    throw new Error("fixture_restore_invalid");
  }
  const expectedCredentialClasses = [
    "JWT", "TEST_INBOUND_1C", "WORKING_INBOUND_1C", "OUTBOUND_1C",
    "MONITOR_HMAC", "SMTP", "TELEGRAM", "VAPID",
  ];
  if (!Array.isArray(evidence.keyRotationExercise) || evidence.keyRotationExercise.length !== expectedCredentialClasses.length) {
    throw new Error("fixture_rotation_schema_invalid");
  }
  evidence.keyRotationExercise.forEach((item, index) => {
    assertExactKeys(item, ["credentialClass", "acceptedBeforeRotation", "oldIdentifierRejected", "newIdentifierAccepted", "keyMaterialSerialized", "steps"], "fixture_rotation_schema_invalid");
    if (item.credentialClass !== expectedCredentialClasses[index]
        || item.acceptedBeforeRotation !== true || item.oldIdentifierRejected !== true || item.newIdentifierAccepted !== true
        || item.keyMaterialSerialized !== false
        || !Array.isArray(item.steps)
        || item.steps.length !== 2
        || item.steps[0] !== "OLD_IDENTIFIER_REJECTED"
        || item.steps[1] !== "NEW_IDENTIFIER_ACCEPTED") throw new Error("fixture_rotation_invalid");
  });
  assertExactKeys(evidence.applicationRollbackExercise, [
    "targetShaFormatVerified", "manifestInventoryVerified", "targetPinVerified",
    "tamperedCandidateRejected", "successApplied", "forcedFailureDetected",
    "rollbackRestored", "idempotentRollback", "steps",
  ], "fixture_rollback_schema_invalid");
  for (const key of [
    "targetShaFormatVerified", "manifestInventoryVerified", "targetPinVerified",
    "tamperedCandidateRejected", "successApplied", "forcedFailureDetected",
    "rollbackRestored", "idempotentRollback",
  ]) {
    if (evidence.applicationRollbackExercise[key] !== true) throw new Error("fixture_rollback_invalid");
  }
  if (!Array.isArray(evidence.applicationRollbackExercise.steps)
      || evidence.applicationRollbackExercise.steps.join(",") !== "TARGET_SHA_FORMAT_VERIFIED,MANIFEST_INVENTORY_VERIFIED,TARGET_PIN_VERIFIED,TAMPERED_CANDIDATE_REJECTED,CANDIDATE_APPLIED,FORCED_VALIDATION_FAILED,LKG_RESTORED,ROLLBACK_REPLAYED") {
    throw new Error("fixture_rollback_steps_invalid");
  }
  assertExactKeys(evidence.redactionExercise, [
    "allowlistedFieldsOnly", "freeTextRemoved", "falsePositiveClassified",
  ], "fixture_redaction_schema_invalid");
  if (Object.values(evidence.redactionExercise).some((value) => value !== true)) throw new Error("fixture_redaction_invalid");
  assertExactKeys(evidence.baselineInvariant, [
    "databaseBytesMtimeHashUnchanged", "uploadBytesMtimeHashUnchanged",
    "backupArchiveBytesMtimeHashUnchanged",
  ], "fixture_baseline_schema_invalid");
  if (Object.values(evidence.baselineInvariant).some((value) => value !== true)) throw new Error("fixture_baseline_changed");
  assertExactKeys(evidence.communications, [
    "primary", "fallback", "realNotificationSent",
  ], "fixture_communications_schema_invalid");
  if (evidence.communications.primary?.channel !== "mock-primary"
      || evidence.communications.primary?.status !== "unavailable"
      || evidence.communications.fallback?.channel !== "mock-fallback"
      || evidence.communications.fallback?.status !== "delivered"
      || evidence.communications.realNotificationSent !== false) throw new Error("fixture_communications_invalid");
  assertExactKeys(evidence.communications.primary, ["channel", "status"], "fixture_primary_channel_schema_invalid");
  assertExactKeys(evidence.communications.fallback, ["channel", "status"], "fixture_fallback_channel_schema_invalid");
  return evidence;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createEvidenceManifest(evidence, redacted) {
  const safeEvidence = assertSyntheticValue(evidence, "evidence");
  assertDrillEvidence(safeEvidence);
  const safeRedacted = assertSyntheticValue(redacted, "redacted");
  assertRedactedDerivative(safeRedacted);
  const serialized = `${stableJson(safeEvidence)}\n`;
  const redactedSerialized = `${stableJson(safeRedacted)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > 32 * 1024) throw new Error("fixture_evidence_too_large");
  return {
    schema: "clover-security-stage9c-manifest/v1",
    algorithm: "sha256",
    artifacts: [
      { path: "evidence.json", sha256: sha256(serialized), bytes: Buffer.byteLength(serialized, "utf8") },
      { path: "redacted.json", sha256: sha256(redactedSerialized), bytes: Buffer.byteLength(redactedSerialized, "utf8") },
    ],
  };
}

export function assertRedactedDerivative(redacted) {
  assertExactKeys(redacted, ["schema", "signalCode", "count", "classification"], "fixture_redacted_schema_invalid");
  if (redacted.schema !== "clover-security-stage9c-redacted/v1"
      || redacted.signalCode !== "FIXTURE_FALSE_POSITIVE"
      || redacted.classification !== "FALSE_POSITIVE"
      || redacted.count !== 1) throw new Error("fixture_redacted_invalid");
  return redacted;
}

export function verifyEvidenceManifest({ evidenceBytes, redactedBytes, manifest }) {
  assertExactKeys(manifest, ["schema", "algorithm", "artifacts"], "fixture_manifest_schema_invalid");
  if (manifest.schema !== "clover-security-stage9c-manifest/v1" || manifest.algorithm !== "sha256") {
    throw new Error("fixture_manifest_schema_invalid");
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 2) {
    throw new Error("fixture_manifest_artifacts_invalid");
  }
  const expected = [
    ["evidence.json", evidenceBytes],
    ["redacted.json", redactedBytes],
  ];
  for (const [index, [expectedPath, suppliedBytes]] of expected.entries()) {
    const artifact = manifest.artifacts[index];
    assertExactKeys(artifact, ["path", "sha256", "bytes"], "fixture_manifest_artifact_invalid");
    assertSha256(artifact.sha256);
    if (artifact.path !== expectedPath) throw new Error("fixture_manifest_path_invalid");
    const bytes = Buffer.isBuffer(suppliedBytes) ? suppliedBytes : Buffer.from(suppliedBytes || "");
    if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
      throw new Error("fixture_manifest_integrity_mismatch");
    }
  }
  assertDrillEvidence(assertSyntheticValue(JSON.parse(Buffer.from(evidenceBytes).toString("utf8")), "evidence"));
  assertRedactedDerivative(assertSyntheticValue(JSON.parse(Buffer.from(redactedBytes).toString("utf8")), "redacted"));
  return true;
}

export function verifyDetachedManifest({ manifestBytes, detachedBytes }) {
  const bytes = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes || "");
  const detached = Buffer.isBuffer(detachedBytes) ? detachedBytes.toString("ascii") : String(detachedBytes || "");
  if (!/^[a-f0-9]{64}\n$/u.test(detached) || detached.trim() !== sha256(bytes)) {
    throw new Error("fixture_detached_manifest_integrity_mismatch");
  }
  return true;
}

export function assertSha256(value) {
  if (!SHA256.test(String(value || ""))) throw new Error("sha256_invalid");
  return value;
}
