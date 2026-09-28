#!/usr/bin/env node
import { chmodSync, chownSync, closeSync, constants, fstatSync, lstatSync, openSync, readSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createBackupEvidence, createDeployReceipt } from "../src/monitoring/collectors.js";

const MAX_EVIDENCE_BYTES = 16 * 1024;

function sha256File(filePath) {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const fd = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (!fstatSync(fd).isFile()) throw new Error('backup_archive_invalid');
    for (;;) {
      const bytes = readSync(fd, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

function parseArgs(argv) {
  const kind = argv[0];
  if (!['backup', 'deploy'].includes(kind)) throw new Error('evidence_kind_invalid');
  const values = { kind };
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) throw new Error('evidence_argument_invalid');
    values[flag.slice(2)] = value;
  }
  return values;
}

function strictBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('evidence_boolean_invalid');
}

export function buildEvidence(args) {
  if (!args.out) throw new Error('evidence_output_required');
  if (args.kind === 'backup') {
    let archiveSize;
    if (args.archive) {
      const archive = lstatSync(args.archive);
      if (!archive.isFile() || archive.isSymbolicLink()) throw new Error('backup_archive_invalid');
      archiveSize = archive.size;
    } else if (args.result === 'failed' && /^\d+$/u.test(args['archive-size'] || '')) {
      archiveSize = Number(args['archive-size']);
    } else {
      throw new Error('backup_archive_required');
    }
    return createBackupEvidence({
      environment: args.environment,
      completedAt: args['completed-at'],
      result: args.result,
      archiveSize,
      archiveSha256: args.archive ? sha256File(args.archive) : '0'.repeat(64),
      integrityOk: strictBoolean(args['integrity-ok']),
      integrityCheckedAt: args['completed-at'],
      restoreOk: strictBoolean(args['restore-ok']),
      restoreCheckedAt: args['completed-at'],
      restoreFixture: true,
    });
  }
  return createDeployReceipt({
    environment: args.environment,
    event: args.event,
    result: args.result,
    occurredAt: args['occurred-at'],
    releaseSha: args['release-sha'],
  });
}

export function writeEvidenceAtomic(filePath, payload) {
  const directory = path.dirname(path.resolve(filePath));
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('evidence_directory_invalid');
  if (process.platform !== 'win32' && (directoryStat.mode & 0o007) !== 0) {
    throw new Error('evidence_directory_world_access');
  }
  const body = `${JSON.stringify(payload)}\n`;
  if (Buffer.byteLength(body) > MAX_EVIDENCE_BYTES) throw new Error('evidence_too_large');
  const temp = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  writeFileSync(temp, body, { encoding: 'utf8', mode: 0o640, flag: 'wx' });
  if (process.platform !== 'win32') {
    chownSync(temp, typeof process.getuid === 'function' ? process.getuid() : directoryStat.uid, directoryStat.gid);
  }
  chmodSync(temp, 0o640);
  renameSync(temp, filePath);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const payload = buildEvidence(args);
  writeEvidenceAtomic(args.out, payload);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message || 'evidence_write_failed'}\n`);
    process.exitCode = 2;
  }
}
