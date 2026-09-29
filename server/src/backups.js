import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  createReadStream,
  existsSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  validateDatabaseSnapshot,
} from "./db.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const serverDirectory = path.resolve(currentDirectory, "..");
export const backupDirectory = path.resolve(
  process.env.CLOVER_SERVER_BACKUP_DIR || path.resolve(serverDirectory, "backups")
);
export const uploadsDirectory = path.resolve(
  process.env.CLOVER_UPLOADS_DIR || path.resolve(serverDirectory, "uploads")
);
const RESTORE_MAX_ENTRIES = 10_000;
const RESTORE_MAX_FILE_BYTES = 50 * 1024 * 1024;
const RESTORE_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const RESTORE_MAX_ARCHIVE_BYTES = RESTORE_MAX_TOTAL_BYTES + 128 * 1024 * 1024;
const RESTORE_MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const RESTORE_MAX_MANIFEST_BYTES = 1024 * 1024;
const RESTORE_JOURNAL = path.resolve(backupDirectory, ".restore-journal.json");
const RESTORE_LOCK = path.resolve(backupDirectory, ".restore.lock");

export function resolveManagedUploadFilePath(filePath) {
  const raw = String(filePath || "");
  if (!raw || raw.includes("\0")) return null;
  const resolved = path.resolve(raw);
  if (!resolved.startsWith(uploadsDirectory + path.sep)) return null;
  if (!existsSync(resolved)) return resolved;
  try {
    if (lstatSync(resolved).isSymbolicLink()) return null;
    const canonicalRoot = realpathSync.native(uploadsDirectory);
    const canonicalFile = realpathSync.native(resolved);
    if (!canonicalFile.startsWith(canonicalRoot + path.sep)) return null;
    return resolved;
  } catch {
    return null;
  }
}

function validateSnapshotManagedPaths(snapshot) {
  for (const row of snapshot.reconciliationRequests) {
    if (row?.file_path && !resolveManagedUploadFilePath(row.file_path)) {
      throw restoreError("BACKUP_SECURITY_STATE_INVALID", "Резервная копия содержит недопустимый путь файла.");
    }
  }
}

function portableSnapshotForBackup(snapshot) {
  return {
    ...snapshot,
    reconciliationRequests: snapshot.reconciliationRequests.map((row) => {
      if (!row?.file_path) return row;
      const managedPath = resolveManagedUploadFilePath(row.file_path);
      if (!managedPath || !existsSync(managedPath)) {
        throw restoreError("BACKUP_SECURITY_STATE_INVALID", "База содержит недопустимый путь файла акта сверки.");
      }
      const relativeName = path.relative(uploadsDirectory, managedPath).split(path.sep).join("/");
      return { ...row, file_path: `uploads/${relativeName}` };
    }),
  };
}

function remapSnapshotManagedPaths(snapshot, entries) {
  const entryNames = entries.map(({ relativeName }) => relativeName);
  return {
    ...snapshot,
    reconciliationRequests: snapshot.reconciliationRequests.map((row) => {
      const rawPath = String(row?.file_path || "");
      if (!rawPath) return row;
      let relativeName = rawPath.startsWith("uploads/")
        ? rawPath.slice("uploads/".length)
        : "";
      if (!relativeName || !entryNames.includes(relativeName)) {
        const baseName = path.basename(rawPath.replaceAll("\\", "/"));
        const matches = entryNames.filter((name) => path.posix.basename(name) === baseName);
        if (matches.length !== 1) {
          throw restoreError("BACKUP_SECURITY_STATE_INVALID", "Резервная копия не связывает файл акта с безопасным upload entry.");
        }
        [relativeName] = matches;
      }
      const mappedPath = path.resolve(uploadsDirectory, ...relativeName.split("/"));
      if (!mappedPath.startsWith(uploadsDirectory + path.sep)) {
        throw restoreError("BACKUP_SECURITY_STATE_INVALID", "Резервная копия содержит недопустимый путь файла.");
      }
      return { ...row, file_path: mappedPath };
    }),
  };
}

function prepareSnapshotForRestore(snapshot) {
  if (Number(snapshot?.version) !== 5) return snapshot;
  const currentUsers = exportDatabaseSnapshot().users;
  const byId = new Map(currentUsers.map((row) => [String(row.id), row]));
  const failClosedAt = new Date().toISOString();
  return {
    ...snapshot,
    version: 6,
    users: Array.isArray(snapshot.users)
      ? snapshot.users.map((row) => {
          const current = byId.get(String(row?.id));
          return {
            ...row,
            disabled_at: String(current?.disabled_at || (current ? "" : failClosedAt)),
            permissions_json: String(current?.permissions_json || "{}"),
          };
        })
      : snapshot.users,
  };
}

function ensureSecureDir(directory) {
  mkdirSync(directory, { recursive: true });
  if (process.platform === "win32") return;
  try {
    chmodSync(directory, 0o700);
  } catch (error) {
    throw new Error(`Не удалось установить mode 700 для ${directory}: ${error.message}`, {
      cause: error,
    });
  }
}

function ensureSecureFile(filePath) {
  if (process.platform === "win32") return;
  try {
    chmodSync(filePath, 0o600);
  } catch (error) {
    throw new Error(`Не удалось установить mode 600 для ${filePath}: ${error.message}`, {
      cause: error,
    });
  }
}

ensureSecureDir(backupDirectory);
mkdirSync(uploadsDirectory, { recursive: true });

function canonicalBackupDirectory() {
  try {
    return realpathSync.native(backupDirectory);
  } catch {
    try {
      return realpathSync(backupDirectory);
    } catch {
      return path.resolve(backupDirectory);
    }
  }
}

const CANONICAL_BACKUP_DIR = canonicalBackupDirectory();

function isInsideBackupDir(resolvedPath) {
  const resolved = path.resolve(resolvedPath);
  return resolved === CANONICAL_BACKUP_DIR || resolved.startsWith(CANONICAL_BACKUP_DIR + path.sep);
}
function cleanLabel(value) {
  const result = String(value || "manual")
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return result || "manual";
}

function makeFileName(label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `clover-${stamp}-${cleanLabel(label)}.zip`;
}

function isBackupName(fileName) {
  return fileName.endsWith(".zip") || fileName.endsWith(".json");
}

function backupPathError(message, status = 400, code = "BACKUP_PATH_INVALID") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function resolveBackupPath(fileName) {
  const raw = String(fileName || "");
  if (!raw || raw.includes("\0") || raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
    throw backupPathError("Некорректный путь резервной копии.");
  }
  const safeName = path.basename(raw);

  if (safeName !== raw || !isBackupName(safeName)) {
    throw backupPathError("Некорректное имя резервной копии.");
  }

  const resolved = path.resolve(CANONICAL_BACKUP_DIR, safeName);
  if (!isInsideBackupDir(resolved)) {
    throw backupPathError("Некорректный путь резервной копии.");
  }

  return resolved;
}

function openBackupFd(fileName) {
  const filePath = resolveBackupPath(fileName);
  let lst;
  try {
    lst = lstatSync(filePath);
  } catch {
    throw backupPathError("Резервная копия не найдена.", 404, "BACKUP_NOT_FOUND");
  }
  if (lst.isSymbolicLink()) {
    throw backupPathError("Некорректный путь резервной копии.", 400, "BACKUP_SYMLINK");
  }
  if (!lst.isFile()) {
    throw backupPathError("Некорректный путь резервной копии.");
  }

  const flags =
    fsConstants.O_RDONLY |
    (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);
  let fd;
  try {
    fd = openSync(filePath, flags);
  } catch (error) {
    if (error?.code === "ELOOP" || error?.code === "EPERM") {
      throw backupPathError("Некорректный путь резервной копии.", 400, "BACKUP_SYMLINK");
    }
    throw backupPathError("Резервная копия не найдена.", 404, "BACKUP_NOT_FOUND");
  }

  try {
    const opened = fstatSync(fd);
    if (!opened.isFile()) {
      closeSync(fd);
      throw backupPathError("Некорректный путь резервной копии.");
    }
    let real;
    try {
      real = realpathSync.native(filePath);
    } catch {
      real = realpathSync(filePath);
    }
    if (!isInsideBackupDir(real)) {
      closeSync(fd);
      throw backupPathError("Некорректный путь резервной копии.", 400, "BACKUP_SYMLINK");
    }
    return { fd, filePath, fileName: path.basename(filePath) };
  } catch (error) {
    try {
      closeSync(fd);
    } catch {
      /* ignore */
    }
    throw error;
  }
}

export function openBackupReadStream(fileName) {
  const opened = openBackupFd(fileName);
  return createReadStream("", { fd: opened.fd });
}

export const BACKUP_DOWNLOAD_CACHE_CONTROL = "private, no-store";

export function backupDownloadFileName(fileName) {
  return path.basename(String(fileName || ""));
}

export function applyBackupDownloadCacheHeaders(res) {
  res.setHeader("Cache-Control", BACKUP_DOWNLOAD_CACHE_CONTROL);
}

export function applyBackupDownloadBodyHeaders(res, fileName) {
  const safeName = backupDownloadFileName(fileName);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeName}"`
  );
}

export function buildBackupDownloadAuditDetails({
  result,
  fileName,
  code,
} = {}) {
  const details = {
    result: result === "success" ? "success" : "error",
  };
  const safeName = backupDownloadFileName(fileName);
  if (safeName && safeName === path.basename(safeName) && !safeName.includes("\0")) {
    details.fileName = safeName;
  }
  if (details.result === "error") {
    details.code = String(code || "BACKUP_DOWNLOAD_FAILED").slice(0, 80);
  }
  return details;
}

export function executeBackupDownload({
  fileName,
  res,
  openStream = openBackupReadStream,
} = {}) {
  applyBackupDownloadCacheHeaders(res);
  try {
    const stream = openStream(fileName);
    applyBackupDownloadBodyHeaders(res, fileName);
    if (stream && typeof stream.pipe === "function") {
      stream.pipe(res);
    }
    return {
      ok: true,
      audit: buildBackupDownloadAuditDetails({ result: "success", fileName }),
    };
  } catch (error) {
    return {
      ok: false,
      error,
      audit: buildBackupDownloadAuditDetails({
        result: "error",
        fileName,
        code: error?.code || "BACKUP_DOWNLOAD_FAILED",
      }),
    };
  }
}

export function readBackupFileBuffer(fileName) {
  const opened = openBackupFd(fileName);
  try {
    const maxBytes = String(fileName).endsWith(".json")
      ? RESTORE_MAX_SNAPSHOT_BYTES
      : RESTORE_MAX_ARCHIVE_BYTES;
    if (fstatSync(opened.fd).size > maxBytes) {
      throw backupPathError("Резервная копия превышает допустимый размер.", 409, "BACKUP_PREFLIGHT_INVALID");
    }
    return readFileSync(opened.fd);
  } finally {
    closeSync(opened.fd);
  }
}

export function publicBackupMetadata(item = {}) {
  return {
    fileName: item.fileName,
    createdAt: item.createdAt,
    reason: item.reason,
    size: item.size,
    format: item.format,
    includesPhotos: Boolean(item.includesPhotos),
    photoCount: Number(item.photoCount) || 0,
  };
}

export function assertRestorableBackup(fileName) {
  const buffer = readBackupFileBuffer(fileName);
  try {
    if (String(fileName).endsWith(".json")) {
      const parsed = prepareSnapshotForRestore(JSON.parse(buffer.toString("utf8")));
      if (!parsed || typeof parsed !== "object") {
        throw new Error("invalid json snapshot");
      }
      validateDatabaseSnapshot(parsed);
      validateSnapshotManagedPaths(parsed);
    } else {
      const { snapshot: rawSnapshot, zip } = readZipMetadata(buffer);
      const entries = collectRestoreUploadEntries(zip);
      const snapshot = remapSnapshotManagedPaths(
        prepareSnapshotForRestore(rawSnapshot),
        entries
      );
      validateDatabaseSnapshot(snapshot);
      validateSnapshotManagedPaths(snapshot);
    }
  } catch (error) {
    if (error?.status) throw error;
    throw backupPathError("Резервная копия повреждена и не может быть восстановлена.", 409, "BACKUP_INTEGRITY");
  }
  return resolveBackupPath(fileName);
}

function listUploadFiles(directory = uploadsDirectory, prefix = "") {
  const files = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? path.posix.join(prefix, item.name) : item.name;
    const fullPath = path.resolve(directory, item.name);
    if (item.isDirectory()) {
      files.push(...listUploadFiles(fullPath, relative));
    } else if (item.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

function readZipMetadata(source) {
  const zip = new AdmZip(source);
  const manifestEntry = zip.getEntry("manifest.json");
  const snapshotEntry = zip.getEntry("snapshot.json");

  if (!snapshotEntry) {
    throw new Error("В полной резервной копии отсутствуют данные Clover.");
  }

  const snapshotSize = Number(snapshotEntry.header?.size ?? 0);
  const manifestSize = Number(manifestEntry?.header?.size ?? 0);
  if (!Number.isSafeInteger(snapshotSize) || snapshotSize < 0 || snapshotSize > RESTORE_MAX_SNAPSHOT_BYTES) {
    throw restoreError("BACKUP_PREFLIGHT_INVALID", "Раздел данных резервной копии превышает допустимый размер.");
  }
  if (!Number.isSafeInteger(manifestSize) || manifestSize < 0 || manifestSize > RESTORE_MAX_MANIFEST_BYTES) {
    throw restoreError("BACKUP_PREFLIGHT_INVALID", "Manifest резервной копии превышает допустимый размер.");
  }

  const snapshot = JSON.parse(snapshotEntry.getData().toString("utf8"));
  const manifest = manifestEntry
    ? JSON.parse(manifestEntry.getData().toString("utf8"))
    : {};

  return { manifest, snapshot, zip };
}

export function createServerBackup({
  label = "manual",
  reason = "Ручная резервная копия",
} = {}) {
  const fileName = makeFileName(label);
  const filePath = resolveBackupPath(fileName);
  const snapshot = portableSnapshotForBackup({
    ...exportDatabaseSnapshot(),
    reason,
  });
  const uploadFiles = listUploadFiles();
  const zip = new AdmZip();
  const manifest = {
    format: "clover-full-backup",
    formatVersion: 1,
    serverVersion: "1.3",
    exportedAt: snapshot.exportedAt,
    reason,
    includesPhotos: true,
    photoCount: uploadFiles.length,
  };

  zip.addFile(
    "manifest.json",
    Buffer.from(JSON.stringify(manifest, null, 2), "utf8")
  );
  zip.addFile(
    "snapshot.json",
    Buffer.from(JSON.stringify(snapshot, null, 2), "utf8")
  );

  for (const relativeName of uploadFiles) {
    const filePath = path.resolve(uploadsDirectory, ...relativeName.split("/"));
    zip.addFile(`uploads/${relativeName}`, readFileSync(filePath));
  }

  zip.writeZip(filePath);
  ensureSecureFile(filePath);

  const result = {
    fileName,
    createdAt: snapshot.exportedAt,
    reason,
    size: statSync(filePath).size,
    format: "full",
    includesPhotos: true,
    photoCount: uploadFiles.length,
  };

  cleanupOldBackups();
  return result;
}

export function listServerBackups() {
  return readdirSync(backupDirectory)
    .filter((fileName) => {
      if (!isBackupName(fileName)) return false;
      try {
        const lst = lstatSync(path.join(CANONICAL_BACKUP_DIR, fileName));
        return lst.isFile() && !lst.isSymbolicLink();
      } catch {
        return false;
      }
    })
    .map((fileName) => {
      const filePath = resolveBackupPath(fileName);
      let stats;
      try {
        stats = lstatSync(filePath);
        if (stats.isSymbolicLink() || !stats.isFile()) return null;
      } catch {
        return null;
      }
      let reason = "Резервная копия";
      let createdAt = stats.mtime.toISOString();
      let format = fileName.endsWith(".zip") ? "full" : "legacy";
      let includesPhotos = fileName.endsWith(".zip");
      let photoCount = 0;

      try {
        const buffer = readBackupFileBuffer(fileName);
        if (fileName.endsWith(".zip")) {
          const { manifest, snapshot } = readZipMetadata(buffer);
          reason = manifest.reason || snapshot.reason || reason;
          createdAt = manifest.exportedAt || snapshot.exportedAt || createdAt;
          photoCount = Number(manifest.photoCount) || 0;
        } else {
          const parsed = JSON.parse(buffer.toString("utf8"));
          reason = parsed.reason || reason;
          createdAt = parsed.exportedAt || createdAt;
        }
      } catch {
        reason = "Файл требует проверки";
      }

      return publicBackupMetadata({
        fileName,
        createdAt,
        reason,
        size: stats.size,
        format,
        includesPhotos,
        photoCount,
      });
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function restoreError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.status = 409;
  return error;
}

function collectRestoreUploadEntries(zip) {
  const entries = [];
  const seen = new Set();
  let totalBytes = 0;
  const allEntries = zip.getEntries();
  if (allEntries.length > RESTORE_MAX_ENTRIES + 2) {
    throw restoreError("BACKUP_PREFLIGHT_INVALID", "В резервной копии слишком много файлов.");
  }
  for (const entry of allEntries) {
    const rawName = String(entry.entryName || "");
    if (rawName === "manifest.json" || rawName === "snapshot.json" || entry.isDirectory) continue;
    if (!rawName.startsWith("uploads/") || rawName.includes("\\") || rawName.includes("\0")) {
      throw restoreError("BACKUP_PREFLIGHT_INVALID", "Резервная копия содержит недопустимый путь.");
    }
    const relativeName = rawName.slice("uploads/".length);
    const parts = relativeName.split("/");
    if (!relativeName || parts.some((part) => !part || part === "." || part === "..")) {
      throw restoreError("BACKUP_PREFLIGHT_INVALID", "Резервная копия содержит недопустимый путь.");
    }
    const normalized = parts.join("/");
    const duplicateKey = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    if (seen.has(duplicateKey)) {
      throw restoreError("BACKUP_PREFLIGHT_INVALID", "Резервная копия содержит повторяющийся путь.");
    }
    seen.add(duplicateKey);
    const declaredSize = Number(entry.header?.size ?? entry.getData().length);
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > RESTORE_MAX_FILE_BYTES) {
      throw restoreError("BACKUP_PREFLIGHT_INVALID", "Файл в резервной копии превышает допустимый размер.");
    }
    totalBytes += declaredSize;
    if (totalBytes > RESTORE_MAX_TOTAL_BYTES) {
      throw restoreError("BACKUP_PREFLIGHT_INVALID", "Резервная копия превышает допустимый размер.");
    }
    const unixMode = (Number(entry.attr) >>> 16) & 0xffff;
    if ((unixMode & 0o170000) === 0o120000) {
      throw restoreError("BACKUP_PREFLIGHT_INVALID", "Символические ссылки в резервной копии запрещены.");
    }
    entries.push({ relativeName: normalized, entry });
  }
  return entries;
}

function atomicWriteSecureJson(targetPath, payload) {
  const temporaryPath = `${targetPath}.tmp-${randomUUID()}`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
    writeFileSync(descriptor, JSON.stringify(payload), "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    ensureSecureFile(temporaryPath);
    renameSync(temporaryPath, targetPath);
    if (process.platform !== "win32") {
      const directoryDescriptor = openSync(path.dirname(targetPath), fsConstants.O_RDONLY);
      try {
        fsyncSync(directoryDescriptor);
      } finally {
        closeSync(directoryDescriptor);
      }
    }
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* ignore */ }
    }
    safeRemove(temporaryPath);
    throw error;
  }
}

function writeRestoreJournal(payload) {
  if (existsSync(RESTORE_JOURNAL)) {
    throw restoreError("RESTORE_RECOVERY_REQUIRED", "Обнаружена незавершённая операция восстановления.");
  }
  atomicWriteSecureJson(RESTORE_JOURNAL, payload);
}

function replaceRestoreJournal(payload) {
  atomicWriteSecureJson(RESTORE_JOURNAL, payload);
}

function safeRemove(targetPath) {
  try {
    rmSync(targetPath, { recursive: true, force: true });
  } catch {
    /* A committed restore remains valid; retained artifacts are recoverable. */
  }
}

function cleanupRestoreArtifacts({ stageDirectory, rollbackDirectory, beforeSnapshotPath }, { keepRollback = false } = {}) {
  safeRemove(stageDirectory);
  if (!keepRollback) safeRemove(rollbackDirectory);
  safeRemove(beforeSnapshotPath);
}

function stageRestoreUploads(entries, stageDirectory) {
  mkdirSync(stageDirectory, { recursive: false });
  for (const { relativeName, entry } of entries) {
    const targetPath = path.resolve(stageDirectory, ...relativeName.split("/"));
    if (!targetPath.startsWith(stageDirectory + path.sep)) {
      throw restoreError("BACKUP_STAGE_FAILED", "Не удалось безопасно подготовить файлы резервной копии.");
    }
    mkdirSync(path.dirname(targetPath), { recursive: true });
    const data = entry.getData();
    if (data.length > RESTORE_MAX_FILE_BYTES) {
      throw restoreError("BACKUP_PREFLIGHT_INVALID", "Файл в резервной копии превышает допустимый размер.");
    }
    writeFileSync(targetPath, data, { flag: "wx" });
  }
}

function rollbackUploads(rollbackDirectory) {
  if (!existsSync(rollbackDirectory)) return;
  if (existsSync(uploadsDirectory)) rmSync(uploadsDirectory, { recursive: true, force: true });
  renameSync(rollbackDirectory, uploadsDirectory);
}

function acquireRestoreLock(operationId) {
  let descriptor;
  try {
    descriptor = openSync(RESTORE_LOCK, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
    writeFileSync(descriptor, JSON.stringify({ operationId, pid: process.pid }), "utf8");
    fsyncSync(descriptor);
  } catch (cause) {
    throw restoreError("RESTORE_RECOVERY_REQUIRED", "Другая операция восстановления не завершена.", cause);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function releaseRestoreLock() {
  if (existsSync(RESTORE_LOCK)) unlinkSync(RESTORE_LOCK);
}

function assertNoLiveRestoreOwner() {
  if (!existsSync(RESTORE_LOCK)) return;
  try {
    const lock = JSON.parse(readFileSync(RESTORE_LOCK, "utf8"));
    if (!Number.isInteger(lock.pid) || lock.pid <= 0 || lock.pid === process.pid) return;
    try {
      process.kill(lock.pid, 0);
      throw restoreError("RESTORE_RECOVERY_REQUIRED", "Другая операция восстановления выполняется.");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  } catch (error) {
    if (error?.code === "RESTORE_RECOVERY_REQUIRED") throw error;
  }
}

export function recoverInterruptedRestore() {
  assertNoLiveRestoreOwner();
  if (!existsSync(RESTORE_JOURNAL)) {
    if (existsSync(RESTORE_LOCK)) {
      releaseRestoreLock();
    }
    return false;
  }
  let journal;
  try {
    journal = JSON.parse(readFileSync(RESTORE_JOURNAL, "utf8"));
    const operationId = String(journal.operationId || "");
    if (!/^[0-9a-f-]{36}$/iu.test(operationId)) throw new Error("invalid operation id");
    const stageDirectory = `${uploadsDirectory}.restore-stage-${operationId}`;
    const rollbackDirectory = `${uploadsDirectory}.restore-rollback-${operationId}`;
    const beforeSnapshotPath = path.resolve(backupDirectory, `.restore-before-${operationId}.json`);
    rollbackUploads(rollbackDirectory);
    importDatabaseSnapshot(JSON.parse(readFileSync(beforeSnapshotPath, "utf8")));
    unlinkSync(RESTORE_JOURNAL);
    releaseRestoreLock();
    cleanupRestoreArtifacts({ stageDirectory, rollbackDirectory, beforeSnapshotPath });
    return true;
  } catch (cause) {
    throw restoreError("RESTORE_RECOVERY_REQUIRED", "Требуется безопасное восстановление незавершённой операции.", cause);
  }
}

function restoreFullBackup(snapshot, zip) {
  const entries = collectRestoreUploadEntries(zip);
  snapshot = remapSnapshotManagedPaths(snapshot, entries);
  validateDatabaseSnapshot(snapshot);
  validateSnapshotManagedPaths(snapshot);
  const operationId = randomUUID();
  const stageDirectory = `${uploadsDirectory}.restore-stage-${operationId}`;
  const rollbackDirectory = `${uploadsDirectory}.restore-rollback-${operationId}`;
  const beforeSnapshotPath = path.resolve(backupDirectory, `.restore-before-${operationId}.json`);
  const beforeSnapshot = exportDatabaseSnapshot();
  const journal = { operationId, phase: "prepared" };
  let uploadsSwapped = false;
  let dbImportStarted = false;
  let lockAcquired = false;

  try {
    acquireRestoreLock(operationId);
    lockAcquired = true;
    stageRestoreUploads(entries, stageDirectory);
    atomicWriteSecureJson(beforeSnapshotPath, beforeSnapshot);
    writeRestoreJournal(journal);
    renameSync(uploadsDirectory, rollbackDirectory);
    try {
      renameSync(stageDirectory, uploadsDirectory);
      uploadsSwapped = true;
    } catch (cause) {
      renameSync(rollbackDirectory, uploadsDirectory);
      throw cause;
    }
    replaceRestoreJournal({ ...journal, phase: "uploads_swapped" });
    dbImportStarted = true;
    importDatabaseSnapshot(snapshot);
    replaceRestoreJournal({ ...journal, phase: "db_committed" });
    unlinkSync(RESTORE_JOURNAL);
    releaseRestoreLock();
    cleanupRestoreArtifacts({ stageDirectory, rollbackDirectory, beforeSnapshotPath });
    return entries.length;
  } catch (cause) {
    try {
      if (dbImportStarted) importDatabaseSnapshot(beforeSnapshot);
      if (uploadsSwapped || existsSync(rollbackDirectory)) rollbackUploads(rollbackDirectory);
      if (existsSync(RESTORE_JOURNAL)) unlinkSync(RESTORE_JOURNAL);
      if (lockAcquired) releaseRestoreLock();
      cleanupRestoreArtifacts({ stageDirectory, rollbackDirectory, beforeSnapshotPath });
    } catch (rollbackCause) {
      throw restoreError("BACKUP_ROLLBACK_FAILED", "Не удалось безопасно откатить восстановление.", rollbackCause);
    }
    if (cause?.code && String(cause.code).startsWith("BACKUP_")) throw cause;
    throw restoreError("BACKUP_COMMIT_FAILED", "Восстановление не применено; исходное состояние возвращено.", cause);
  }
}

export function restoreServerBackup(fileName) {
  const buffer = readBackupFileBuffer(fileName);

  if (String(fileName).endsWith(".json")) {
    const snapshot = prepareSnapshotForRestore(JSON.parse(buffer.toString("utf8")));
    validateDatabaseSnapshot(snapshot);
    validateSnapshotManagedPaths(snapshot);
    const operationId = randomUUID();
    acquireRestoreLock(operationId);
    try {
      importDatabaseSnapshot(snapshot);
    } finally {
      releaseRestoreLock();
    }
    return {
      ...snapshot,
      restoredPhotos: 0,
      legacy: true,
    };
  }

  const { snapshot: rawSnapshot, zip } = readZipMetadata(buffer);
  const snapshot = prepareSnapshotForRestore(rawSnapshot);
  const restoredPhotos = restoreFullBackup(snapshot, zip);

  return {
    ...snapshot,
    restoredPhotos,
    legacy: false,
  };
}

recoverInterruptedRestore();

export function cleanupOldBackups({
  maxFiles = 50,
  automaticMaxAgeDays = 30,
} = {}) {
  const now = Date.now();
  const files = listServerBackups();
  const removed = [];

  for (const item of files) {
    const ageDays = (now - new Date(item.createdAt).getTime()) / 86400000;
    const isAutomatic = /auto-start|Автоматическая/i.test(
      `${item.fileName} ${item.reason}`
    );

    if (isAutomatic && ageDays > automaticMaxAgeDays) {
      unlinkSync(resolveBackupPath(item.fileName));
      removed.push(item.fileName);
    }
  }

  const remaining = listServerBackups();
  for (const item of remaining.slice(maxFiles)) {
    unlinkSync(resolveBackupPath(item.fileName));
    removed.push(item.fileName);
  }

  return {
    removed,
    remaining: listServerBackups().length,
  };
}

export function ensureDailyBackup() {
  const today = new Date().toISOString().slice(0, 10);
  const alreadyCreated = listServerBackups().some(
    (item) =>
      item.createdAt.startsWith(today) &&
      /auto-start|Автоматическая/i.test(`${item.fileName} ${item.reason}`)
  );

  if (!alreadyCreated) {
    return createServerBackup({
      label: "auto-start",
      reason: "Автоматическая полная копия при первом запуске за день",
    });
  }

  cleanupOldBackups();
  return null;
}
