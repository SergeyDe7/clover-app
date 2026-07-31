/**
 * Миграция CHECK users.role: добавить 'admin'.
 * Dry-run: node scripts/migrate-admin-role.mjs
 * Apply:  node scripts/migrate-admin-role.mjs --apply
 */
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.DB_PATH || path.join(root, "data", "clover.sqlite");
const apply = process.argv.includes("--apply");

if (!existsSync(dbPath)) {
  console.error("DB_NOT_FOUND", dbPath);
  process.exit(2);
}

const db = new DatabaseSync(dbPath);
const row = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
  .get();
const sql = String(row?.sql || "");
console.log("current users DDL:\n", sql);

if (/'\s*admin\s*'/.test(sql)) {
  console.log("ALREADY_HAS_ADMIN");
  db.close();
  process.exit(0);
}

if (!/CHECK\s*\(\s*role\s+IN\s*\(\s*'client'\s*,\s*'manager'\s*\)\s*\)/i.test(sql)) {
  console.error("UNEXPECTED_USERS_DDL: не найден CHECK (client, manager)");
  db.close();
  process.exit(2);
}

if (!apply) {
  console.log(
    "DRY_RUN: для применения запустите с --apply (нужно явное «да» пользователя)"
  );
  db.close();
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(root, "..", "backups", `before-admin-role-${stamp}`);
mkdirSync(backupDir, { recursive: true });
copyFileSync(dbPath, path.join(backupDir, "clover.sqlite"));
console.log("backup", path.join(backupDir, "clover.sqlite"));

const createSql = sql
  .replace(/CREATE TABLE\s+IF NOT EXISTS\s+/i, "CREATE TABLE ")
  .replace(
    /CHECK\s*\(\s*role\s+IN\s*\(\s*'client'\s*,\s*'manager'\s*\)\s*\)/i,
    "CHECK(role IN ('client', 'manager', 'admin'))"
  );

db.exec("PRAGMA foreign_keys = OFF");
db.exec("BEGIN");
try {
  db.exec("ALTER TABLE users RENAME TO users_old_admin_mig");
  db.exec(createSql);

  const oldCols = db
    .prepare("PRAGMA table_info(users_old_admin_mig)")
    .all()
    .map((c) => c.name);
  const newCols = new Set(
    db.prepare("PRAGMA table_info(users)").all().map((c) => c.name)
  );
  const shared = oldCols.filter((name) => newCols.has(name));
  const colList = shared.join(", ");
  db.exec(
    `INSERT INTO users (${colList}) SELECT ${colList} FROM users_old_admin_mig`
  );
  db.exec("DROP TABLE users_old_admin_mig");
  db.exec("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)");
  db.exec("COMMIT");
  console.log("MIGRATE_ADMIN_ROLE_OK", { columns: shared });
} catch (error) {
  try {
    db.exec("ROLLBACK");
  } catch {
    /* ignore */
  }
  console.error("MIGRATE_FAIL", error);
  process.exit(1);
} finally {
  try {
    db.exec("PRAGMA foreign_keys = ON");
  } catch {
    /* ignore */
  }
  db.close();
}
