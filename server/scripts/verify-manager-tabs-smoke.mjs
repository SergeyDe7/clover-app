/**
 * Smoke: после split ManagerScreen все вкладки менеджера остаются смонтированы
 * и связаны с панелями (статическая проверка wiring + синтаксис модулей).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const managerDir = path.join(root, "src/screens/manager");
const helpersPath = path.join(root, "src/shared/appHelpers.js");
const screenPath = path.join(managerDir, "ManagerScreen.jsx");

const MAIN_TAB_TO_PANEL = {
  orders: "ManagerOrders",
  products: "ManagerProducts",
  storefront: "ManagerStorefront",
  clients: "ManagerClients",
  acts: "ManagerReconciliation",
  exchange: "ManagerExchange",
  more: null,
};

const MORE_TAB_TO_PANEL = {
  access: "ManagerAccessVault",
  settings: "ManagerSettings",
  backup: "ManagerBackup",
  audit: "ManagerAudit",
};

const PANEL_FILES = {
  ManagerOrders: "ManagerOrders.jsx",
  ManagerClients: "ManagerClients.jsx",
  ManagerProducts: "ManagerProducts.jsx",
  ManagerExchange: "ManagerExchange.jsx",
  ManagerReconciliation: "ManagerReconciliation.jsx",
  ManagerAccessVault: "ManagerAccessVault.jsx",
  ManagerStorefront: "ManagerStorefront.jsx",
  ManagerSettings: "ManagerSettings.jsx",
  ManagerBackup: "ManagerBackup.jsx",
  ManagerAudit: "ManagerAudit.jsx",
  ManagerScreen: "ManagerScreen.jsx",
};

const NOTIFICATION_EXPORTS = ["managerNotificationTab", "ManagerNotificationBell"];

function extractExportedArray(source, name) {
  const re = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`);
  const match = source.match(re);
  assert.ok(match, `Не найден export const ${name}`);
  const ids = [...match[1].matchAll(/\["([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, `${name} пуст`);
  return ids;
}

const helpersSource = readFileSync(helpersPath, "utf8");
const screenSource = readFileSync(screenPath, "utf8");

const mainTabs = extractExportedArray(helpersSource, "MANAGER_TABS");
const moreTabs = extractExportedArray(helpersSource, "MANAGER_MORE_TABS");

assert.deepEqual(
  mainTabs,
  Object.keys(MAIN_TAB_TO_PANEL),
  "MANAGER_TABS не совпадает с ожидаемым набором вкладок"
);
assert.deepEqual(
  moreTabs,
  Object.keys(MORE_TAB_TO_PANEL),
  "MANAGER_MORE_TABS не совпадает с ожидаемым набором «Ещё»"
);

for (const [tabId, panel] of Object.entries(MAIN_TAB_TO_PANEL)) {
  assert.ok(
    screenSource.includes(`tab === "${tabId}"`),
    `ManagerScreen не рендерит ветку tab === "${tabId}"`
  );
  if (panel) {
    assert.ok(
      screenSource.includes(`import { ${panel}`),
      `ManagerScreen не импортирует ${panel}`
    );
    assert.ok(
      screenSource.includes(`<${panel}`),
      `ManagerScreen не монтирует <${panel}>`
    );
  }
}

assert.ok(
  screenSource.includes("MANAGER_MORE_TABS.filter") ||
    screenSource.includes("MANAGER_MORE_TABS.map"),
  "ManagerScreen не рендерит навигацию MANAGER_MORE_TABS"
);

assert.deepEqual(
  mainTabs,
  ["orders", "products", "storefront", "clients", "acts", "exchange", "more"],
  "Порядок главного меню: Заказы, Товары, Витрина, Клиенты, Акты сверок, 1С, Ещё"
);

assert.equal(
  moreTabs.includes("storefront"),
  false,
  "«Витрина» больше не должна быть внутри «Ещё»"
);

for (const [tabId, panel] of Object.entries(MORE_TAB_TO_PANEL)) {
  assert.ok(
    screenSource.includes(`moreTab === "${tabId}"`),
    `ManagerScreen не рендерит ветку moreTab === "${tabId}"`
  );
  assert.ok(
    screenSource.includes(`import { ${panel}`),
    `ManagerScreen не импортирует ${panel}`
  );
  assert.ok(
    screenSource.includes(`<${panel}`),
    `ManagerScreen не монтирует <${panel}>`
  );
}

assert.ok(
  screenSource.includes("staffHasFeature"),
  "ManagerScreen не фильтрует разделы по правам staff"
);
assert.ok(
  screenSource.includes("allowedMainTabs"),
  "ManagerScreen не строит список доступных вкладок"
);
assert.ok(
  screenSource.includes("ManagerNotificationBell"),
  "ManagerScreen не монтирует колокол уведомлений"
);
assert.ok(
  screenSource.includes("managerNotificationTab"),
  "ManagerScreen не использует managerNotificationTab"
);

for (const [symbol, fileName] of Object.entries(PANEL_FILES)) {
  const full = path.join(managerDir, fileName);
  assert.ok(existsSync(full), `Нет файла панели ${fileName}`);
  const source = readFileSync(full, "utf8");
  assert.ok(
    source.includes(`export function ${symbol}`) || source.includes(`export { ${symbol}`),
    `${fileName} не экспортирует ${symbol}`
  );
  assert.ok(source.includes("return"), `${fileName}: нет return (пустой модуль?)`);
  assert.equal(
    (source.match(/\{/g) || []).length,
    (source.match(/\}/g) || []).length,
    `${fileName}: несбалансированные скобки { }`
  );
}

const notificationsPath = path.join(managerDir, "ManagerNotifications.jsx");
assert.ok(existsSync(notificationsPath), "Нет ManagerNotifications.jsx");
const notificationsSource = readFileSync(notificationsPath, "utf8");
for (const symbol of NOTIFICATION_EXPORTS) {
  assert.ok(
    notificationsSource.includes(`export function ${symbol}`),
    `ManagerNotifications.jsx не экспортирует ${symbol}`
  );
}
assert.equal(
  (notificationsSource.match(/\{/g) || []).length,
  (notificationsSource.match(/\}/g) || []).length,
  "ManagerNotifications.jsx: несбалансированные скобки { }"
);

const indexPath = path.join(managerDir, "index.js");
assert.ok(existsSync(indexPath), "Нет src/screens/manager/index.js");
assert.ok(
  readFileSync(indexPath, "utf8").includes("ManagerScreen"),
  "index.js не реэкспортирует ManagerScreen"
);

const appSource = readFileSync(path.join(root, "src/App.jsx"), "utf8");
assert.ok(
  appSource.includes('from "./screens/manager/ManagerScreen"') ||
    appSource.includes('from "./screens/manager"'),
  "App.jsx не подключает ManagerScreen"
);

console.log(
  "OK verify-manager-tabs-smoke:",
  `main=${mainTabs.join(",")}`,
  `more=${moreTabs.join(",")}`,
  `panels=${Object.keys(PANEL_FILES).length + 1}`
);
