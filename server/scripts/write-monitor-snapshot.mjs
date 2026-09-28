#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAuditMonitoringSnapshot, readOneCQueueSnapshot } from "../src/monitoring/contracts.js";
import { collectBackup } from "../src/monitoring/collectors.js";
import { createRuntimeMonitoringSnapshot } from "../src/monitoring/runtimeSnapshot.js";
import { writeEvidenceAtomic } from "./write-monitor-evidence.mjs";

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const out = {
    environment: env.CLOVER_MONITOR_ENVIRONMENT || "",
    dbPath: env.DB_PATH || "",
    backupDirectory: env.CLOVER_MONITOR_BACKUP_DIR || "",
    backupEvidencePath: env.CLOVER_MONITOR_BACKUP_EVIDENCE || "",
    outputPath: env.CLOVER_MONITOR_RUNTIME_SNAPSHOT || "",
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1] || "";
    if (flag === "--environment") out.environment = value;
    else if (flag === "--db") out.dbPath = value;
    else if (flag === "--backup-directory") out.backupDirectory = value;
    else if (flag === "--backup-evidence") out.backupEvidencePath = value;
    else if (flag === "--out") out.outputPath = value;
    else throw new Error("runtime_snapshot_argument_invalid");
  }
  if (!out.dbPath || !out.backupDirectory || !out.backupEvidencePath || !out.outputPath) {
    throw new Error("runtime_snapshot_argument_required");
  }
  return out;
}

export function produceRuntimeMonitoringSnapshot(options, { now = Date.now } = {}) {
  const timestamp = Number(now());
  const snapshot = createRuntimeMonitoringSnapshot({
    environment: options.environment,
    collectedAt: new Date(timestamp).toISOString(),
    queue: readOneCQueueSnapshot({ dbPath: options.dbPath, now: timestamp }),
    audit: readAuditMonitoringSnapshot({ dbPath: options.dbPath, now: timestamp }),
    backup: collectBackup({
      backupDirectory: options.backupDirectory,
      evidencePath: options.backupEvidencePath,
      environment: options.environment,
      now: timestamp,
    }),
  });
  writeEvidenceAtomic(options.outputPath, snapshot);
  return snapshot;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    produceRuntimeMonitoringSnapshot(parseArgs());
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message || "runtime_snapshot_failed"}\n`);
    process.exitCode = 2;
  }
}
