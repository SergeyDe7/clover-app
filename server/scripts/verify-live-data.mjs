import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [backupRoot, targetRoot] = process.argv.slice(2);
if (!backupRoot || !targetRoot) {
  throw new Error("Не указаны папки резервной копии и проекта.");
}

const backupDbPath = path.resolve(backupRoot, "server", "data", "clover.sqlite");
const targetDbPath = path.resolve(targetRoot, "server", "data", "clover.sqlite");

if (!existsSync(backupDbPath)) {
  console.log("Старая SQLite-база отсутствует: проверка сохранности по таблицам пропущена.");
  process.exit(0);
}
if (!existsSync(targetDbPath)) {
  throw new Error("После обновления отсутствует server/data/clover.sqlite.");
}

const backup = new DatabaseSync(backupDbPath, { readOnly: true });
const target = new DatabaseSync(targetDbPath, { readOnly: true });

function ids(db, table) {
  return db.prepare(`SELECT id FROM ${table} ORDER BY id`).all().map((row) => String(row.id));
}
function count(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}
function state(db, key, fallback) {
  const row = db.prepare("SELECT value_json FROM app_state WHERE key = ?").get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value_json); } catch { return fallback; }
}

for (const table of ["users", "orders"]) {
  const beforeIds = ids(backup, table);
  const afterSet = new Set(ids(target, table));
  const missing = beforeIds.filter((id) => !afterSet.has(id));
  assert.equal(missing.length, 0, `После обновления пропали записи из ${table}: ${missing.slice(0, 5).join(", ")}`);
}

for (const table of ["users", "orders", "client_state"]) {
  assert.ok(count(target, table) >= count(backup, table), `Количество записей ${table} уменьшилось.`);
}

const beforeProducts = state(backup, "products", []);
const afterProducts = state(target, "products", []);
assert.ok(Array.isArray(afterProducts) && afterProducts.length >= beforeProducts.length, "Каталог Clover был очищен или сокращён.");

const beforeLinks = state(backup, "clientLinks", {});
const afterLinks = state(target, "clientLinks", {});
for (const clientId of Object.keys(beforeLinks || {})) {
  assert.ok(Object.hasOwn(afterLinks || {}, clientId), `Пропала настройка клиента ${clientId}.`);
}

backup.close();
target.close();
console.log("Проверка сохранности существующих пользователей, заказов, товаров и настроек после обновления пройдена успешно.");
