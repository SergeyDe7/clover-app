/** Статика: «Доступы → Менеджеры» — set/reset пароля без reveal plaintext из API. */
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
assert.ok(
  !/\buser\.password\b/.test(panel),
  "AdminRolePanel: не должен показывать user.password"
);
assert.ok(
  !/\bitem\.password\b/.test(access),
  "ManagerAccessVault: не должен показывать item.password"
);
assert.ok(
  !panel.includes('t("shared.action.show")') && !panel.includes('t("shared.action.hide")'),
  "AdminRolePanel: не должно быть reveal/hide сохранённого пароля"
);
assert.ok(
  !access.includes('t("shared.action.show")') && !access.includes('t("shared.action.hide")'),
  "ManagerAccessVault: не должно быть reveal/hide сохранённого пароля"
);
assert.ok(panel.includes('t("shared.passwordSaved")'), "AdminRolePanel: нет статуса hasPassword");
assert.ok(panel.includes('t("shared.noPassword")'), "AdminRolePanel: нет статуса no password");
assert.ok(access.includes('t("shared.passwordSaved")'), "ManagerAccessVault: нет статуса hasPassword");
assert.ok(access.includes('t("shared.noPassword")'), "ManagerAccessVault: нет статуса no password");
assert.ok(panel.includes("temporaryPassword"), "AdminRolePanel: нет temporaryPassword one-shot");
assert.ok(access.includes("temporaryPassword"), "ManagerAccessVault: нет temporaryPassword one-shot");
assert.ok(panel.includes('t("manager.setPassword")'), "AdminRolePanel: нет set password");
assert.ok(panel.includes('t("manager.change")') || panel.includes('t("shared.changePassword2")'), "AdminRolePanel: нет change/reset");
assert.ok(access.includes('t("manager.setPassword")'), "ManagerAccessVault: нет set password");
assert.ok(
  panel.includes('t("admin.passwordsFromBeforeThisLogCannot")') ||
    access.includes('t("admin.passwordsFromBeforeThisLogCannot")'),
  "Нет подсказки: пароль только set/reset, не хранится в журнале"
);
assert.ok(panel.includes("resetRequired") || access.includes("resetRequired"), "Нет badge resetRequired");

assert.ok(server.includes("staffAccessVault"), "server.js: не подключён staffAccessVault");
assert.ok(server.includes("rememberStaffPassword"), "server.js: нет rememberStaffPassword");
assert.ok(server.includes("assertCanSetStaffPassword"), "server.js: нет assertCanSetStaffPassword");

const rememberStart = server.indexOf("function rememberStaffPassword");
assert.ok(rememberStart >= 0, "server.js: нет function rememberStaffPassword");
const rememberFn = server.slice(rememberStart, rememberStart + 800);
assert.ok(
  !rememberFn.includes("password: plainPassword") &&
    !/password:\s*[^,\n}]+/.test(rememberFn.split("saveStaffAccessCredentials")[1] || ""),
  "rememberStaffPassword не должен сохранять plaintext password"
);
assert.ok(panel.includes('t("shared.yourPassword")'), "AdminRolePanel: нет блока пароля админа");
assert.ok(!panel.includes("canManageStaff && !isSelf"), "AdminRolePanel: Управление скрыто для своей карточки");

const settings = readFileSync(path.join(root, "src/screens/manager/ManagerSettings.jsx"), "utf8");
assert.ok(settings.includes("allowPasswordChange={!isAdmin}"), "ManagerSettings: пароль админа не убран из настроек");

console.log("verify-staff-access-ui: ok");
