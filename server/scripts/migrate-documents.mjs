import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { applyDocumentsSchema, applyStandaloneDocumentsSchema, applyDocumentsPackageSchema } from "../src/documents/schema.js";
import { assertDocumentPath } from "../src/documents/storage.js";

// No default DB; never imported by the server. Production application is a separate operator action.
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
if (!args.includes("--db") || !args.includes("--backup") || value("--confirm") !== "APPLY_DOCUMENTS_SCHEMA") {
  throw new Error("Usage: --db <explicit TEST sqlite> --backup <new backup.sqlite> --confirm APPLY_DOCUMENTS_SCHEMA");
}
const databasePath = path.resolve(value("--db"));
const backupPath = path.resolve(value("--backup"));
assertDocumentPath(databasePath);
assertDocumentPath(backupPath, true);
if (!existsSync(databasePath) || existsSync(backupPath) || databasePath === backupPath) throw new Error("Existing DB and a new backup path required");
const db = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
try {
  db.exec("PRAGMA busy_timeout=8000");
  db.prepare("VACUUM INTO ?").run(backupPath);
  const hash = createHash("sha256").update(readFileSync(backupPath)).digest("hex");
  writeFileSync(`${backupPath}.sha256`, hash, { flag: "wx", mode: 0o600 });
  if(args.includes('--packages'))applyDocumentsPackageSchema(db);
  else if(args.includes('--standalone')) applyStandaloneDocumentsSchema(db);
  else applyDocumentsSchema(db);
  console.log(JSON.stringify({ status: "applied", backupSha256: hash }));
} finally { db.close(); }
