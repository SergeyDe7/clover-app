import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TARGET = "clover-order@mail.ru";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(path.join(root, "data", "clover.sqlite"));

const row = db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("settings");
if (!row) {
  throw new Error("settings row missing");
}
const settings = JSON.parse(row.value_json);
const before = String(settings.managerNotificationEmail || "");
settings.managerNotificationEmail = TARGET;
const updatedAt = new Date().toISOString();
db.prepare(`
  UPDATE app_state
  SET value_json = ?, updated_at = ?
  WHERE key = ?
`).run(JSON.stringify(settings), updatedAt, "settings");

const after = JSON.parse(
  db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("settings").value_json
).managerNotificationEmail;

console.log(JSON.stringify({ before, after, updatedAt }, null, 2));
