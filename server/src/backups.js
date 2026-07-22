import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
} from "./db.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const serverDirectory = path.resolve(currentDirectory, "..");
export const backupDirectory = path.resolve(
  serverDirectory,
  "backups"
);

mkdirSync(backupDirectory, { recursive: true });

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
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  return `clover-${stamp}-${cleanLabel(label)}.json`;
}

export function resolveBackupPath(fileName) {
  const safeName = path.basename(String(fileName || ""));

  if (!safeName.endsWith(".json")) {
    throw new Error("Некорректное имя резервной копии.");
  }

  return path.resolve(backupDirectory, safeName);
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

  writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");

  return {
    fileName,
    createdAt: snapshot.exportedAt,
    reason,
    size: statSync(filePath).size,
  };
}

export function listServerBackups() {
  return readdirSync(backupDirectory)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const filePath = resolveBackupPath(fileName);
      const stats = statSync(filePath);
      let reason = "Резервная копия";
      let createdAt = stats.mtime.toISOString();

      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8"));
        reason = parsed.reason || reason;
        createdAt = parsed.exportedAt || createdAt;
      } catch {
        reason = "Файл требует проверки";
      }

      return {
        fileName,
        createdAt,
        reason,
        size: stats.size,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function restoreServerBackup(fileName) {
  const filePath = resolveBackupPath(fileName);
  const snapshot = JSON.parse(readFileSync(filePath, "utf8"));
  importDatabaseSnapshot(snapshot);
  return snapshot;
}

export function ensureDailyBackup() {
  const today = new Date().toISOString().slice(0, 10);
  const alreadyCreated = listServerBackups().some((item) =>
    item.createdAt.startsWith(today)
  );

  if (!alreadyCreated) {
    return createServerBackup({
      label: "auto-start",
      reason: "Автоматическая копия при первом запуске за день",
    });
  }

  return null;
}
