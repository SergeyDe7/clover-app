import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
} from "./db.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const serverDirectory = path.resolve(currentDirectory, "..");

/**
 * Каталоги переопределяются переменными окружения, чтобы тесты и разовые
 * проверки восстановления не писали в рабочие бэкапы. По умолчанию пути
 * прежние, поведение продакшена не меняется.
 */
export const backupDirectory = path.resolve(
  serverDirectory,
  process.env.BACKUP_DIR || "backups"
);
export const uploadsDirectory = path.resolve(
  serverDirectory,
  process.env.UPLOADS_DIR || "uploads"
);

/**
 * Архив содержит выгрузку БД и все загруженные файлы, то есть персональные
 * данные клиентов целиком. Новые каталоги создаются без доступа для группы
 * и остальных; права уже существующих каталогов правятся отдельно, вручную —
 * см. docs/security/BACKUP_REMEDIATION_RUNBOOK.md.
 */
const BACKUP_DIR_MODE = 0o700;
const BACKUP_FILE_MODE = 0o600;

mkdirSync(backupDirectory, { recursive: true, mode: BACKUP_DIR_MODE });
mkdirSync(uploadsDirectory, { recursive: true });

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

export function resolveBackupPath(fileName) {
  const safeName = path.basename(String(fileName || ""));

  if (!isBackupName(safeName)) {
    throw new Error("Некорректное имя резервной копии.");
  }

  const resolved = path.resolve(backupDirectory, safeName);
  if (!resolved.startsWith(backupDirectory + path.sep)) {
    throw new Error("Некорректный путь резервной копии.");
  }

  return resolved;
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

/**
 * Свежесозданный архив читается только владельцем.
 * Ошибка chmod не должна ронять создание бэкапа: на части файловых систем
 * (например, смонтированных сетевых) смена прав не поддерживается.
 */
function restrictBackupFile(filePath) {
  try {
    chmodSync(filePath, BACKUP_FILE_MODE);
  } catch (error) {
    console.warn(
      `Не удалось ограничить права резервной копии ${path.basename(filePath)}: ${error.message}`
    );
  }
}

function readZipMetadata(filePath) {
  const zip = new AdmZip(filePath);
  const manifestEntry = zip.getEntry("manifest.json");
  const snapshotEntry = zip.getEntry("snapshot.json");

  if (!snapshotEntry) {
    throw new Error("В полной резервной копии отсутствуют данные Clover.");
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
  const snapshot = {
    ...exportDatabaseSnapshot(),
    reason,
  };
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
  restrictBackupFile(filePath);

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
    .filter(isBackupName)
    .map((fileName) => {
      const filePath = resolveBackupPath(fileName);
      const stats = statSync(filePath);
      let reason = "Резервная копия";
      let createdAt = stats.mtime.toISOString();
      let format = fileName.endsWith(".zip") ? "full" : "legacy";
      let includesPhotos = fileName.endsWith(".zip");
      let photoCount = 0;

      try {
        if (fileName.endsWith(".zip")) {
          const { manifest, snapshot } = readZipMetadata(filePath);
          reason = manifest.reason || snapshot.reason || reason;
          createdAt = manifest.exportedAt || snapshot.exportedAt || createdAt;
          photoCount = Number(manifest.photoCount) || 0;
        } else {
          const parsed = JSON.parse(readFileSync(filePath, "utf8"));
          reason = parsed.reason || reason;
          createdAt = parsed.exportedAt || createdAt;
        }
      } catch {
        reason = "Файл требует проверки";
      }

      return {
        fileName,
        createdAt,
        reason,
        size: stats.size,
        format,
        includesPhotos,
        photoCount,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function clearUploadsDirectory() {
  for (const item of readdirSync(uploadsDirectory, { withFileTypes: true })) {
    const itemPath = path.resolve(uploadsDirectory, item.name);
    if (item.isDirectory()) {
      rmSync(itemPath, { recursive: true, force: true });
    } else {
      unlinkSync(itemPath);
    }
  }
}

function restorePhotosFromZip(zip) {
  clearUploadsDirectory();
  let restored = 0;

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith("uploads/")) continue;
    const relativeName = entry.entryName.slice("uploads/".length).replace(/\\/g, "/");
    if (!relativeName || relativeName.split("/").some((part) => !part || part === "." || part === "..")) continue;
    const targetPath = path.resolve(uploadsDirectory, ...relativeName.split("/"));
    if (!targetPath.startsWith(uploadsDirectory + path.sep)) continue;
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, entry.getData());
    restored += 1;
  }

  return restored;
}

export function restoreServerBackup(fileName) {
  const filePath = resolveBackupPath(fileName);

  if (!existsSync(filePath)) {
    throw new Error("Резервная копия не найдена.");
  }

  if (fileName.endsWith(".json")) {
    const snapshot = JSON.parse(readFileSync(filePath, "utf8"));
    importDatabaseSnapshot(snapshot);
    return {
      ...snapshot,
      restoredPhotos: 0,
      legacy: true,
    };
  }

  const { snapshot, zip } = readZipMetadata(filePath);
  importDatabaseSnapshot(snapshot);
  const restoredPhotos = restorePhotosFromZip(zip);

  return {
    ...snapshot,
    restoredPhotos,
    legacy: false,
  };
}

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
