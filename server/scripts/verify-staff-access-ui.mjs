/** Статика: «Доступы → Менеджеры» показывает журнал паролей staff. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const panelPath = path.join(root, "src/components/AdminRolePanel.jsx");
const accessPath = path.join(root, "src/screens/manager/ManagerAccessVault.jsx");
const serverPath = path.join(root, "server/src/server.js");

const panel = readFileSync(panelPath, "utf8");
const access = readFileSync(accessPath, "utf8");
const server = readFileSync(serverPath, "utf8");

assert.ok(panel.includes("access-vault-field"), "AdminRolePanel: нет блока полей пароля");
assert.ok(panel.includes("user.password"), "AdminRolePanel: не показывает пароль staff");
assert.ok(panel.includes("Пароль сохранён"), "AdminRolePanel: нет статуса пароля");
assert.ok(access.includes("логины, пароли и права"), "ManagerAccessVault: устаревший текст вкладки");

assert.ok(server.includes("staffAccessVault.js"), "server.js: не подключён staffAccessVault");
assert.ok(server.includes("rememberStaffPassword"), "server.js: нет сохранения пароля staff");
assert.ok(panel.includes("Ваш пароль"), "AdminRolePanel: нет блока пароля админа");
assert.ok(!panel.includes("canManageStaff && !isSelf"), "AdminRolePanel: Управление скрыто для своей карточки");
assert.ok(server.includes("assertCanSetStaffPassword"), "server.js: нет assertCanSetStaffPassword");

const settings = readFileSync(path.join(root, "src/screens/manager/ManagerSettings.jsx"), "utf8");
assert.ok(settings.includes("allowPasswordChange={!isAdmin}"), "ManagerSettings: пароль админа не убран из настроек");

console.log("verify-staff-access-ui: ok");
