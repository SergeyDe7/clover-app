import os from "node:os";
import tls from "node:tls";
import {
  chmodSync, closeSync, constants, existsSync, fstatSync, lstatSync, openSync, opendirSync, readFileSync, readSync, renameSync,
  statSync, statfsSync, writeFileSync,
} from "node:fs";
import { execFile as nodeExecFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { sanitizeAlertPayload } from "./sanitizeAlert.js";
import { assertMonitorEnvironment } from "./contracts.js";

const MAX_BYTES = 64 * 1024;
const MAX_DIRECTORY_ENTRIES = 512;
const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_OBSERVATION_STATE_BYTES = 64 * 1024;
const OBSERVATION_COMPONENTS = Object.freeze(["api", "ui", "nginx"]);

export function createObservationState(environment) {
  const env = assertMonitorEnvironment(environment);
  return {
    schemaVersion: 1,
    environment: env,
    updatedAt: "",
    availability: Object.fromEntries(OBSERVATION_COMPONENTS.map((key) => [key, {
      consecutiveFailures: 0, outageStartedAt: "",
    }])),
    resources: {
      cpu: { breachStartedAt: "" },
      ram: { breachStartedAt: "", oomKillCounter: 0, oomObservedAt: "" },
    },
    systemd: Object.fromEntries(OBSERVATION_COMPONENTS.map((key) => [key, {
      restartCounter: 0, observedAt: "", restartHistory: [],
    }])),
  };
}

function safeTimestamp(value, nowMs) {
  if (value === "" || value === undefined) return "";
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed) || parsed > nowMs + 5 * 60_000) throw new Error("observation_state_timestamp_invalid");
  return new Date(parsed).toISOString();
}

function normalizeObservationState(candidate, environment, nowMs = Date.now()) {
  const empty = createObservationState(environment);
  if (candidate === undefined || candidate === null) return empty;
  if (candidate.schemaVersion !== 1 || candidate.environment !== empty.environment) {
    throw new Error("observation_state_identity_invalid");
  }
  empty.updatedAt = safeTimestamp(candidate.updatedAt, nowMs);
  for (const component of OBSERVATION_COMPONENTS) {
    const availability = candidate.availability?.[component];
    const failures = Number(availability?.consecutiveFailures);
    if (!Number.isSafeInteger(failures) || failures < 0 || failures > 1_000_000) {
      throw new Error("observation_state_counter_invalid");
    }
    empty.availability[component] = {
      consecutiveFailures: failures,
      outageStartedAt: safeTimestamp(availability?.outageStartedAt, nowMs),
    };
    const systemd = candidate.systemd?.[component];
    const counter = Number(systemd?.restartCounter);
    if (!Number.isSafeInteger(counter) || counter < 0 || counter > 1_000_000_000) {
      throw new Error("observation_state_restart_counter_invalid");
    }
    empty.systemd[component] = {
      restartCounter: counter,
      observedAt: safeTimestamp(systemd?.observedAt, nowMs),
      restartHistory: (systemd?.restartHistory || []).slice(-64).map((row) => {
        const count = Number(row?.count);
        if (!Number.isSafeInteger(count) || count < 1 || count > 1_000_000) {
          throw new Error("observation_state_restart_history_invalid");
        }
        return { at: safeTimestamp(row?.at, nowMs), count };
      }),
    };
  }
  for (const resource of ["cpu", "ram"]) {
    empty.resources[resource] = {
      breachStartedAt: safeTimestamp(candidate.resources?.[resource]?.breachStartedAt, nowMs),
    };
  }
  const oomKillCounter = Number(candidate.resources?.ram?.oomKillCounter || 0);
  if (!Number.isSafeInteger(oomKillCounter) || oomKillCounter < 0 || oomKillCounter > 1_000_000_000) {
    throw new Error("observation_state_oom_counter_invalid");
  }
  empty.resources.ram.oomKillCounter = oomKillCounter;
  empty.resources.ram.oomObservedAt = safeTimestamp(candidate.resources?.ram?.oomObservedAt, nowMs);
  return empty;
}

export function loadObservationState(filePath, environment, now = Date.now()) {
  try {
    const stat = lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("observation_state_not_regular_file");
    if (stat.size > MAX_OBSERVATION_STATE_BYTES) throw new Error("observation_state_too_large");
    return normalizeObservationState(JSON.parse(readFileSync(filePath, "utf8")), environment, Number(now));
  } catch (error) {
    if (error?.code === "ENOENT") return createObservationState(environment);
    throw error;
  }
}

export function saveObservationStateAtomic(filePath, state) {
  const normalized = normalizeObservationState(state, state?.environment);
  const body = `${JSON.stringify(normalized)}\n`;
  if (Buffer.byteLength(body) > MAX_OBSERVATION_STATE_BYTES) throw new Error("observation_state_too_large");
  const temp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  writeFileSync(temp, body, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(temp, 0o600);
  renameSync(temp, filePath);
}

export function applyObservationState({ environment, now = Date.now(), operational, previous } = {}) {
  const nowMs = Number(now);
  if (!Number.isFinite(nowMs)) throw new Error("observation_now_invalid");
  const nowIso = new Date(nowMs).toISOString();
  const prior = normalizeObservationState(previous, environment, nowMs);
  const next = structuredClone(prior);
  const enriched = structuredClone(operational || {});
  next.updatedAt = nowIso;

  for (const component of OBSERVATION_COMPONENTS) {
    const observation = enriched.availability?.[component];
    if (!observation || observation.status !== "ok") continue;
    const failed = Number(observation.value) > 0;
    const old = prior.availability[component];
    const hintedFailures = Math.max(0, Math.trunc(Number(observation.facts?.consecutiveFailures) || 0));
    const hintedAgeMs = Math.max(0, Number(observation.facts?.outageAgeMs) || 0);
    const consecutiveFailures = failed ? Math.max(old.consecutiveFailures + 1, hintedFailures) : 0;
    const outageStartedAt = failed
      ? (old.outageStartedAt || (hintedAgeMs ? new Date(nowMs - hintedAgeMs).toISOString() : nowIso))
      : "";
    next.availability[component] = { consecutiveFailures, outageStartedAt };
    observation.facts = {
      ...(observation.facts || {}),
      consecutiveFailures,
      outageAgeMs: outageStartedAt ? Math.max(0, nowMs - Date.parse(outageStartedAt)) : 0,
    };
  }

  for (const resource of ["cpu", "ram"]) {
    const observation = enriched.resources?.[resource];
    if (!observation || observation.status !== "ok") continue;
    const threshold = resource === "cpu" ? 80 : 85;
    const breached = Number(observation.value) >= threshold;
    const startedAt = breached ? (prior.resources[resource].breachStartedAt || nowIso) : "";
    next.resources[resource] = { breachStartedAt: startedAt };
    observation.facts = {
      ...(observation.facts || {}),
      sustainedMs: startedAt ? Math.max(0, nowMs - Date.parse(startedAt)) : 0,
    };
  }

  const ram = enriched.resources?.ram;
  if (ram?.status === "ok") {
    const hasCounter = Object.hasOwn(ram.facts || {}, "oomKillCounter");
    const current = hasCounter
      ? Math.max(0, Math.trunc(Number(ram.facts.oomKillCounter) || 0))
      : prior.resources.ram.oomKillCounter;
    const old = prior.resources.ram;
    const counterReset = Boolean(old.oomObservedAt) && current < old.oomKillCounter;
    const oom = ram.facts?.oom === true || (hasCounter && Boolean(old.oomObservedAt) && !counterReset && current > old.oomKillCounter);
    ram.facts = { ...(ram.facts || {}), oom, oomCounterReset: counterReset };
    next.resources.ram = {
      ...next.resources.ram,
      oomKillCounter: current,
      oomObservedAt: nowIso,
    };
  }

  for (const component of OBSERVATION_COMPONENTS) {
    const observation = enriched.systemd?.[component];
    if (!observation || observation.status !== "ok") continue;
    const current = Math.max(0, Math.trunc(Number(observation.value) || 0));
    const old = prior.systemd[component];
    const previousAt = Date.parse(old.observedAt || "");
    const counterReset = Boolean(old.observedAt) && current < old.restartCounter;
    const rawDelta = old.observedAt && !counterReset ? current - old.restartCounter : 0;
    const history = (counterReset ? [] : old.restartHistory)
      .filter((row) => nowMs - Date.parse(row.at) <= 15 * 60_000);
    if (rawDelta > 0) history.push({ at: nowIso, count: rawDelta });
    const restartCount15m = history.reduce((sum, row) => sum + row.count, 0);
    const restartDelta = history
      .filter((row) => nowMs - Date.parse(row.at) <= 10 * 60_000)
      .reduce((sum, row) => sum + row.count, 0);
    const windowMs = Number.isFinite(previousAt) ? Math.max(0, nowMs - previousAt) : 0;
    observation.value = restartDelta;
    observation.facts = {
      ...(observation.facts || {}), windowMs, counterReset,
      restartCount10m: restartDelta, restartCount15m,
    };
    next.systemd[component] = { restartCounter: current, observedAt: nowIso, restartHistory: history.slice(-64) };
  }
  return { operational: enriched, nextState: next };
}

function boundedTimeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  return Math.max(250, Math.min(5_000, Number(value) || fallback));
}

function runCommand(file, args, { execFileFn = nodeExecFile, timeoutMs } = {}) {
  return new Promise((resolve) => {
    try {
      execFileFn(file, args, {
        encoding: "utf8", timeout: boundedTimeout(timeoutMs), maxBuffer: MAX_BYTES,
        windowsHide: true, shell: false,
      }, (error, stdout = "") => {
        resolve({ ok: !error, stdout: String(stdout).slice(0, MAX_BYTES) });
      });
    } catch {
      resolve({ ok: false, stdout: "" });
    }
  });
}

async function probeHttp(target, { fetchFn = globalThis.fetch, timeoutMs, expectedRuntimeStatusRevision = "" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), boundedTimeout(timeoutMs));
  try {
    const response = await fetchFn(target.url, {
      method: "GET", redirect: "manual", signal: controller.signal,
      headers: { Accept: "application/json,text/html;q=0.5" },
    });
    const statusCode = Number(response?.status) || 0;
    const receivedRevision = target.component === "api"
      ? String(response?.headers?.get?.("x-clover-runtime-status-revision") || "")
      : "";
    const revisionMatch = target.component !== "api" || !expectedRuntimeStatusRevision
      ? undefined
      : receivedRevision === expectedRuntimeStatusRevision;
    if (response?.body?.cancel) await response.body.cancel().catch(() => {});
    return {
      component: target.component,
      ok: statusCode >= 200 && statusCode < 400 && revisionMatch !== false,
      statusCode,
      revisionMatch,
    };
  } catch {
    return { component: target.component, ok: false, statusCode: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function collectAvailability({ targets, fetchFn, timeoutMs, expectedRuntimeStatusRevision } = {}) {
  const safeTargets = (targets || [
    { component: "api", url: "http://127.0.0.1:4100/api/health" },
    { component: "ui", url: "http://127.0.0.1:5273/" },
    { component: "nginx", url: "http://127.0.0.1/" },
  ]).filter((item) => ["api", "ui", "nginx"].includes(item?.component)).slice(0, 3);
  const probes = await Promise.all(safeTargets.map((target) => probeHttp(target, {
    fetchFn, timeoutMs, expectedRuntimeStatusRevision,
  })));
  return Object.fromEntries(probes.map((probe) => [probe.component, {
    status: "ok", value: probe.ok ? 0 : 1, scope: probe.component,
    facts: {
      attempts: 1, statusCode: probe.statusCode,
      ...(probe.component === "api" && expectedRuntimeStatusRevision
        ? { runtimeStatusRevisionMatch: probe.revisionMatch === true }
        : {}),
    },
  }]));
}

function parseSystemdShow(stdout) {
  const values = {};
  for (const line of String(stdout).split(/\r?\n/u).slice(0, 32)) {
    const index = line.indexOf("=");
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1).trim();
  }
  return values;
}

export async function collectSystemd({ execFileFn, timeoutMs } = {}) {
  const units = [["api", "clover-api.service"], ["ui", "clover-ui.service"], ["nginx", "nginx.service"]];
  const rows = await Promise.all(units.map(async ([component, unit]) => {
    const result = await runCommand("systemctl", [
      "show", unit, "--no-pager", "--property=ActiveState,Result,NRestarts",
    ], { execFileFn, timeoutMs });
    const fields = parseSystemdShow(result.stdout);
    const known = result.ok && Boolean(fields.ActiveState);
    return [component, {
      status: known ? "ok" : "unknown",
      value: known ? Math.max(0, Number(fields.NRestarts) || 0) : null,
      scope: component,
      facts: known ? { activeState: fields.ActiveState, result: fields.Result || "unknown" } : {},
    }];
  }));
  return Object.fromEntries(rows);
}

function cpuTotals(cpus) {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus || []) {
    const times = cpu?.times || {};
    idle += Number(times.idle) || 0;
    total += Object.values(times).reduce((sum, value) => sum + (Number(value) || 0), 0);
  }
  return { idle, total };
}

export async function collectResources({
  osModule = os, statfsFn = statfsSync, diskPath = "/opt/clover", sampleMs = 250,
  readFileFn = readFileSync, vmstatPath = "/proc/vmstat",
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const first = cpuTotals(osModule.cpus());
  const safeSampleMs = Math.max(50, Math.min(1_000, Number(sampleMs) || 250));
  await delay(safeSampleMs);
  const second = cpuTotals(osModule.cpus());
  const totalDelta = second.total - first.total;
  const cpuPercent = totalDelta > 0
    ? Math.max(0, Math.min(100, ((totalDelta - (second.idle - first.idle)) / totalDelta) * 100))
    : null;
  const totalMemory = Number(osModule.totalmem()) || 0;
  const freeMemory = Number(osModule.freemem()) || 0;
  const ramPercent = totalMemory > 0 ? ((totalMemory - freeMemory) / totalMemory) * 100 : null;
  let oomKillCounter = 0;
  try {
    const match = String(readFileFn(vmstatPath, "utf8")).match(/^oom_kill\s+(\d+)$/mu);
    oomKillCounter = match ? Math.max(0, Number(match[1]) || 0) : 0;
  } catch {
    // Non-Linux fixtures explicitly remain at a zero baseline.
  }
  let disk = { status: "unknown", value: null, scope: "global", facts: {} };
  try {
    const fs = statfsFn(diskPath);
    const totalBytes = (Number(fs.bsize) || 0) * (Number(fs.blocks) || 0);
    const freeBytes = (Number(fs.bsize) || 0) * (Number(fs.bavail ?? fs.bfree) || 0);
    disk = {
      status: totalBytes > 0 ? "ok" : "unknown",
      value: totalBytes > 0 ? (freeBytes / totalBytes) * 100 : null,
      scope: "global", facts: { freeBytes, requiredBytes: 2 * 1024 ** 3 },
    };
  } catch {
    // Unknown is explicit; no path or OS error is exposed.
  }
  return {
    cpu: { status: cpuPercent === null ? "unknown" : "ok", value: cpuPercent, scope: "global", facts: { sustainedMs: safeSampleMs } },
    ram: { status: ramPercent === null ? "unknown" : "ok", value: ramPercent, scope: "global", facts: { sustainedMs: safeSampleMs, oomKillCounter } },
    disk,
  };
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const fd = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (!fstatSync(fd).isFile()) throw new Error("backup_archive_invalid");
    for (;;) {
      const bytes = readSync(fd, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

function newestBackup(backupDirectory) {
  const directory = opendirSync(backupDirectory);
  let inspected = 0;
  let newest = null;
  try {
    for (;;) {
      const entry = directory.readSync();
      if (!entry || inspected >= MAX_DIRECTORY_ENTRIES) break;
      inspected += 1;
      if (!entry.isFile() || !/^clover-data-env\.\d{8}T\d{6}Z\.tgz$/u.test(entry.name)) continue;
      const archivePath = path.join(backupDirectory, entry.name);
      const stats = statSync(archivePath);
      if (!newest || stats.mtimeMs > newest.mtimeMs) newest = { path: archivePath, mtimeMs: stats.mtimeMs, size: stats.size };
    }
  } finally {
    directory.closeSync();
  }
  return newest;
}

export function createBackupEvidence(input = {}) {
  const {
    environment, completedAt, result, archiveSize, archiveSha256,
    integrityOk = input.integrity?.ok,
    integrityCheckedAt = input.integrity?.checkedAt,
    restoreOk = input.restore?.ok,
    restoreCheckedAt = input.restore?.checkedAt,
    restoreFixture = input.restore?.fixture,
  } = input;
  const env = assertMonitorEnvironment(environment);
  const completed = safeTimestamp(completedAt, Number.POSITIVE_INFINITY);
  const integrityAt = safeTimestamp(integrityCheckedAt, Number.POSITIVE_INFINITY);
  const restoreAt = safeTimestamp(restoreCheckedAt, Number.POSITIVE_INFINITY);
  if (!completed || !integrityAt || !restoreAt) throw new Error("backup_evidence_timestamp_required");
  if (!["success", "failed"].includes(result)) throw new Error("backup_evidence_result_invalid");
  if (!Number.isSafeInteger(archiveSize) || archiveSize < 0) throw new Error("backup_evidence_size_invalid");
  if (result === "success" && archiveSha256 === undefined) throw new Error("backup_evidence_sha_required");
  if (result === "success" && archiveSha256 === undefined) {
    throw new Error("backup_evidence_sha_required");
  }
  if (archiveSha256 !== undefined && !/^[0-9a-f]{64}$/u.test(String(archiveSha256))) {
    throw new Error("backup_evidence_sha_invalid");
  }
  if (typeof integrityOk !== "boolean" || typeof restoreOk !== "boolean" || restoreFixture !== true) {
    throw new Error("backup_evidence_check_invalid");
  }
  return {
    schemaVersion: 1, environment: env, completedAt: completed, result, archiveSize,
    ...(archiveSha256 === undefined ? {} : { archiveSha256 }),
    integrity: { checkedAt: integrityAt, ok: integrityOk },
    restore: { checkedAt: restoreAt, ok: restoreOk, fixture: true },
  };
}

function readBoundedJson(filePath, maxBytes, errorCode) {
  let fd;
  try {
    fd = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error(errorCode);
    return JSON.parse(readFileSync(fd, "utf8"));
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function collectBackup({ backupDirectory, evidencePath, environment, now = Date.now() } = {}) {
  try {
    if (!evidencePath) return { status: "unknown", value: null, scope: "backup", facts: {} };
    const evidence = createBackupEvidence(readBoundedJson(evidencePath, 16 * 1024, "backup_evidence_invalid"));
    if (evidence.environment !== assertMonitorEnvironment(environment)) throw new Error("backup_evidence_environment_mismatch");
    const nowMs = Number(now);
    const completedAtMs = Date.parse(evidence.completedAt);
    const integrityAtMs = Date.parse(evidence.integrity.checkedAt);
    const restoreAtMs = Date.parse(evidence.restore.checkedAt);
    const maxEvidenceAgeMs = 15 * 24 * 60 * 60_000;
    const checkWindowMs = 10 * 60_000;
    if (!Number.isFinite(nowMs) || completedAtMs > nowMs || integrityAtMs > nowMs || restoreAtMs > nowMs ||
        nowMs - completedAtMs > maxEvidenceAgeMs ||
        integrityAtMs > completedAtMs || restoreAtMs > completedAtMs ||
        completedAtMs - integrityAtMs > checkWindowMs || completedAtMs - restoreAtMs > checkWindowMs) {
      throw new Error("backup_evidence_timestamp_invalid");
    }
    if (evidence.result === "failed") {
      return {
        status: "ok", value: Math.max(0, Number(now) - completedAtMs), scope: "backup",
        facts: { lastResult: "failed", integrityOk: evidence.integrity.ok, restoreOk: evidence.restore.ok },
      };
    }
    const newest = newestBackup(backupDirectory || "/opt/clover/clover-app/server/backups/daily");
    if (!newest) return { status: "unknown", value: null, scope: "backup", facts: {} };
    if (!evidence.archiveSha256 || newest.mtimeMs > completedAtMs ||
        completedAtMs - newest.mtimeMs > checkWindowMs || newest.size !== evidence.archiveSize ||
        sha256File(newest.path) !== evidence.archiveSha256) {
      throw new Error("backup_evidence_archive_mismatch");
    }
    return {
      status: "ok", value: Math.max(0, Number(now) - completedAtMs), scope: "backup",
      facts: {
        lastResult: evidence.result,
        integrityOk: evidence.integrity.ok,
        restoreOk: evidence.restore.ok,
      },
    };
  } catch {
    return { status: "unknown", value: null, scope: "backup", facts: {} };
  }
}

export function collectTls({ host = "clover-spb.ru", connectHost = host, port = 443, now = Date.now(), timeoutMs, connectFn = tls.connect } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy?.();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ status: "unknown", value: null, scope: "global", facts: {} }), boundedTimeout(timeoutMs));
    try {
      socket = connectFn({ host: connectHost, port, servername: host, rejectUnauthorized: true }, () => {
        const certificate = socket.getPeerCertificate?.() || {};
        const expiresAt = Date.parse(String(certificate.valid_to || ""));
        finish({
          status: Number.isFinite(expiresAt) ? "ok" : "unknown",
          value: Number.isFinite(expiresAt) ? Math.floor((expiresAt - Number(now)) / 86_400_000) : null,
          scope: "global", facts: { hostnameValid: socket.authorized === true, chainValid: socket.authorized === true },
        });
      });
      socket.once?.("error", () => finish({ status: "unknown", value: null, scope: "global", facts: {} }));
    } catch {
      finish({ status: "unknown", value: null, scope: "global", facts: {} });
    }
  });
}

export function createDeployReceipt({ environment, event, result, occurredAt, releaseSha } = {}) {
  const env = assertMonitorEnvironment(environment);
  const occurred = safeTimestamp(occurredAt, Number.POSITIVE_INFINITY);
  if (!["success", "failure", "rollback"].includes(event)) throw new Error("deploy_receipt_event_invalid");
  if (!["succeeded", "failed", "rollback_succeeded", "rollback_failed"].includes(result)) {
    throw new Error("deploy_receipt_result_invalid");
  }
  if (!/^[0-9a-f]{40}$/u.test(String(releaseSha || ""))) throw new Error("deploy_receipt_sha_invalid");
  if ((event === "success" && result !== "succeeded") ||
      (event === "failure" && result !== "failed") ||
      (event === "rollback" && !result.startsWith("rollback_"))) {
    throw new Error("deploy_receipt_event_result_mismatch");
  }
  return { schemaVersion: 1, environment: env, event, result, occurredAt: occurred, releaseSha };
}

export function collectDeploy({ receiptPath, environment, now = Date.now(), windowMs = 15 * 60_000 } = {}) {
  try {
    if (!receiptPath || !existsSync(receiptPath)) return { status: "unknown", failures: 0, rollbacks: 0, ageMs: 0 };
    const receipt = createDeployReceipt(readBoundedJson(receiptPath, 16 * 1024, "deploy_receipt_invalid"));
    if (receipt.environment !== assertMonitorEnvironment(environment)) throw new Error("deploy_receipt_environment_mismatch");
    const ageMs = Number(now) - Date.parse(receipt.occurredAt);
    if (ageMs < -5 * 60_000) throw new Error("deploy_receipt_future");
    const active = ageMs >= 0 && ageMs <= Math.max(60_000, Math.min(24 * 60 * 60_000, Number(windowMs) || 0));
    return {
      status: "ok",
      failures: active && (receipt.event === "failure" || receipt.result === "rollback_failed") ? 1 : 0,
      rollbacks: active && receipt.event === "rollback" ? 1 : 0,
      ageMs: Math.max(0, ageMs),
      result: receipt.result,
    };
  } catch {
    return { status: "unknown", failures: 0, rollbacks: 0, ageMs: 0 };
  }
}

export async function collectOperationalFacts(options = {}, deps = {}) {
  const settled = await Promise.allSettled([
    (deps.collectAvailability || collectAvailability)({
      targets: options.targets,
      fetchFn: deps.fetchFn,
      timeoutMs: options.probeTimeoutMs,
      expectedRuntimeStatusRevision: options.expectedRuntimeStatusRevision,
    }),
    (deps.collectSystemd || collectSystemd)({ execFileFn: deps.execFileFn, timeoutMs: options.probeTimeoutMs }),
    (deps.collectResources || collectResources)({ osModule: deps.osModule, statfsFn: deps.statfsFn, readFileFn: deps.readFileFn, diskPath: options.diskPath, sampleMs: options.resourceSampleMs, delay: deps.delay }),
    (deps.collectTls || collectTls)({ host: options.tlsHost, connectHost: options.tlsConnectHost, port: options.tlsPort, now: options.now, timeoutMs: options.probeTimeoutMs, connectFn: deps.tlsConnect }),
  ]);
  const value = (index, fallback) => settled[index].status === "fulfilled" ? settled[index].value : fallback;
  return {
    availability: value(0, {}),
    systemd: value(1, {}),
    resources: value(2, {}),
    backup: options.runtimeSnapshotProvided
      ? { status: "unknown", value: null, scope: "backup", facts: {} }
      : (deps.collectBackup || collectBackup)({
          backupDirectory: options.backupDirectory,
          evidencePath: options.backupEvidencePath,
          environment: options.environment,
          now: options.now,
        }),
    tls: value(3, { status: "unknown", value: null, scope: "global", facts: {} }),
    deploy: (deps.collectDeploy || collectDeploy)({
      receiptPath: options.deployReceiptPath,
      environment: options.environment,
      now: options.now,
      windowMs: options.deployWindowMs,
    }),
  };
}

export function createLocalOperatorAlertSink({ environment, writer = process.stderr, maxEvents = 10 } = {}) {
  return {
    emit(events = []) {
      let delivered = 0;
      for (const event of events.slice(0, Math.max(0, Math.min(20, maxEvents)))) {
        try {
          const alert = sanitizeAlertPayload({ ...event, environment });
          const record = { event: "monitor.alert", type: event.type, ...alert };
          writer.write(`${JSON.stringify(record)}\n`);
          delivered += 1;
        } catch {
          break;
        }
      }
      return { delivered, failed: Math.max(0, events.length - delivered) };
    },
  };
}
