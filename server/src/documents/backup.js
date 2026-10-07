import { backup, DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import AdmZip from "adm-zip";
import { createDocumentStorage, assertDocumentPath, documentError } from "./storage.js";

export function assertLegacyRestoreAllowed(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map((row) => row.name));
  for (const table of ["documents", "document_tombstones", "document_archive_entries", "legal_entity_revisions", "document_template_versions", "document_imports", "counterparty_snapshots"]) {
    if (tables.has(table) && db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()) {
      throw documentError("DOCUMENTS_FULL_RESTORE_REQUIRED", "В базе есть документы. Требуется восстановление полной SQLite-копии и закрытых файлов; старое восстановление JSON заблокировано.", 409);
    }
  }
}

export function assertClientDocumentDeletionAllowed(db, clientId) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map((row) => row.name));
  for (const table of ["documents", "document_archive_entries", "document_imports", "counterparty_snapshots"]) {
    if (tables.has(table) && db.prepare(`SELECT 1 FROM ${table} WHERE client_id=? LIMIT 1`).get(clientId)) {
      throw documentError("DOCUMENTS_CLIENT_RETAINED", "У клиента есть документы или загруженные карточки. Удаление запрещено для сохранения истории.", 409);
    }
  }
}

// Entire SQLite backup plus referenced private files. Existing uploads need their normal backup too.
export async function createDocumentsBackup({ db, storageRoot, outputPath, tempRoot }) {
  assertDocumentPath(outputPath, true);
  assertDocumentPath(tempRoot);
  const temp = await mkdtemp(path.join(tempRoot, "documents-backup-"));
  const relative = path.relative(path.resolve(tempRoot), path.resolve(temp));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("BACKUP_TEMP_PATH");
  const source = createDocumentStorage(storageRoot);
  const sqlitePath = path.join(temp, "clover.sqlite");
  try {
    await backup(db, sqlitePath);
    const snapshot = new DatabaseSync(sqlitePath, { readOnly: true });
    let files;
    try {
      files = snapshot.prepare("SELECT storage_key,sha256 FROM document_attachments UNION SELECT storage_key,sha256 FROM document_files UNION SELECT storage_key,sha256 FROM document_archive_files UNION SELECT storage_key,sha256 FROM document_template_versions UNION SELECT storage_key,sha256 FROM document_imports").all();
    } finally { snapshot.close(); }
    const zip = new AdmZip();
    const database = await readFile(sqlitePath);
    zip.addFile("clover.sqlite", database);
    for (const file of files) zip.addFile(`private/${file.storage_key}`, source.read(file.storage_key, file.sha256));
    const manifest = { format: "clover-documents-backup", version: 1, databaseSha256: createHash("sha256").update(database).digest("hex"), files };
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
    const buffer = zip.toBuffer();
    await writeFile(outputPath, buffer, { flag: "wx", mode: 0o600 });
    return { fileCount: files.length, sha256: createHash("sha256").update(buffer).digest("hex") };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
