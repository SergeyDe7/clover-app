// Общие чистые хелперы и константы Clover.
// Не содержит React-компонентов — только данные и функции без побочных эффектов рендера.

export const MANAGER_ACTIVE_TAB_KEY = "clover-manager-active-tab-v1";

export const MANAGER_OPEN_CLIENT_KEY = "clover-manager-open-client-v1";

export const CLIENT_ACTIVE_TAB_KEY = "clover-client-active-tab-v1";

export const MANAGER_TABS = [
  ["orders", "Заказы"],
  ["clients", "Клиенты"],
  ["products", "Товары"],
  ["exchange", "1С"],
  ["more", "Ещё"],
];

/** Вкладки внутри «Ещё» у менеджера. */
export const MANAGER_MORE_TABS = [
  ["acts", "Акты сверки"],
  ["settings", "Настройки"],
  ["backup", "Резервные копии"],
  ["audit", "Журнал"],
];

export const MANAGER_MORE_TAB_KEY = "clover-manager-more-tab-v1";

export const CLIENT_TABS = [
  ["home", "Заказ"],
  ["orders", "Мои заказы"],
  ["cabinet", "Кабинет"],
];

export function readManagerActiveTab() {
  try {
    const value = localStorage.getItem(MANAGER_ACTIVE_TAB_KEY) || "orders";
    if (MANAGER_MORE_TABS.some(([id]) => id === value)) return "more";
    return MANAGER_TABS.some(([id]) => id === value) ? value : "orders";
  } catch {
    return "orders";
  }
}

export function writeManagerActiveTab(value) {
  try {
    localStorage.setItem(MANAGER_ACTIVE_TAB_KEY, value);
  } catch (error) {
    console.error("Не удалось сохранить раздел менеджера", error);
  }
}

export function readManagerMoreTab() {
  try {
    const value = localStorage.getItem(MANAGER_MORE_TAB_KEY) || "settings";
    return MANAGER_MORE_TABS.some(([id]) => id === value) ? value : "settings";
  } catch {
    return "settings";
  }
}

export function writeManagerMoreTab(value) {
  try {
    localStorage.setItem(MANAGER_MORE_TAB_KEY, value);
  } catch (error) {
    console.error("Не удалось сохранить подраздел «Ещё»", error);
  }
}

export function readClientActiveTab() {
  try {
    const value = localStorage.getItem(CLIENT_ACTIVE_TAB_KEY) || "home";
    return CLIENT_TABS.some(([id]) => id === value) ? value : "home";
  } catch {
    return "home";
  }
}

export function writeClientActiveTab(value) {
  try {
    localStorage.setItem(CLIENT_ACTIVE_TAB_KEY, value);
  } catch (error) {
    console.error("Не удалось сохранить раздел клиента", error);
  }
}

export function clientTabFromSection(section) {
  if (!section) return "";
  if (
    section === "reconciliation" ||
    section === "acts" ||
    section === "addresses" ||
    section === "address" ||
    section === "settings" ||
    section === "profile" ||
    section === "security" ||
    section === "push" ||
    section === "cabinet"
  ) {
    return "cabinet";
  }
  if (section === "orders" || section === "history") return "orders";
  if (
    section === "home" ||
    section === "order" ||
    section === "catalog" ||
    section === "matrix" ||
    section === "catalog-matrix"
  ) {
    return "home";
  }
  return "";
}

export function readOpenManagerClientId() {
  try {
    return localStorage.getItem(MANAGER_OPEN_CLIENT_KEY) || "";
  } catch {
    return "";
  }
}

export function writeOpenManagerClientId(value) {
  try {
    if (value) {
      localStorage.setItem(MANAGER_OPEN_CLIENT_KEY, String(value));
    } else {
      localStorage.removeItem(MANAGER_OPEN_CLIENT_KEY);
    }
  } catch (error) {
    console.error("Не удалось сохранить открытую карточку клиента", error);
  }
}

export const DEFAULT_PRODUCTS = [
  { id: 1, category: "Перчатки", name: "Перчатки нитриловые черные XL (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 2, category: "Упаковка", name: "Банка суповая 500 мл Перинт (50/400)", packSize: 400, pieceSize: 50, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 3, category: "Пакеты и пленка", name: "Пакеты для мусора 240 л, 65 мкм, 100×140 (50 шт.)", packSize: 50, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 4, category: "Упаковка", name: "Крышка к банкам Перинт (50/800)", packSize: 800, pieceSize: 50, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 5, category: "Перчатки", name: "Перчатки BEN FATTO нитриловые черные XL (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 6, category: "Пакеты и пленка", name: "Вакуумный пакет 300×400 мм, 70 мкм (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 7, category: "Пакеты и пленка", name: "Вакуумный пакет 200×300 мм, 60 мкм (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 8, category: "Упаковка", name: "Контейнер бумажный OneClick 800 крафт, дно (50/300)", packSize: 50, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 9, category: "Пакеты и пленка", name: "Вакуумный пакет 200×300 мм, 70 мкм (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 10, category: "Уборка", name: "Набор: щетка для пола и совок-ловушка с высокой ручкой", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 11, category: "Перчатки", name: "Перчатки BEN FATTO нитриловые черные L (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 12, category: "Пакеты и пленка", name: "Вакуумный пакет 160×250 мм, 60 мкм (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 13, category: "Упаковка", name: "Бутылка прозрачная круглая с пробкой 500 мл (100 шт.)", packSize: 100, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 14, category: "Уборка", name: "МОП плоский 40×13 см, ухо-карман, арт. BF30562", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 15, category: "Упаковка", name: "Крышка плоская к контейнеру OneClick 800 (50/300)", packSize: 50, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 16, category: "Уборка", name: "Пульверизатор ручной черный 500 мл", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 17, category: "Уборка", name: "Швабра: рукоять 130 см + держатель мопов 40×11 см, арт. 636234", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 18, category: "Упаковка", name: "Бутылка прозрачная с пробкой 2 л (48 шт.)", packSize: 48, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 19, category: "Пакеты и пленка", name: "Пергамент для выпечки силиконизированный 38 см × 50 м, крафт (15)", packSize: 15, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 20, category: "Одноразовая продукция", name: "Трубочки для коктейля толстые черные 8×240 мм (250 шт.)", packSize: 250, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 21, category: "Уборка", name: "Салфетка для стекол Эксперт 35×40 см HQ", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 22, category: "Канцтовары", name: "Кассовая лента 80×12×80 (5/120)", packSize: 5, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 23, category: "Пакеты и пленка", name: "Пленка пищевая 250 м × 45 см (12)", packSize: 12, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 24, category: "Перчатки", name: "Перчатки KOMFI резиновые сверхпрочные красно-белые M (12/144)", packSize: 12, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 25, category: "Бытовая химия", name: "ХЕЛП — средство для мытья посуды 5 л (4)", packSize: 4, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 26, category: "Одноразовая продукция", name: "Трубочки для мартини черные 5×125 мм (400 шт.)", packSize: 400, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 27, category: "Одноразовая продукция", name: "Трубочки для коктейля с изгибом 5×210 мм, черные (250 шт.)", packSize: 250, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 28, category: "Канцтовары", name: "Кассовая лента 57×12×27 (6/210)", packSize: 6, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 29, category: "Уборка", name: "Щетка-сметка бытовая 6-рядная 240×40 мм", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 30, category: "Канцтовары", name: "Бумага А4 (5)", packSize: 5, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 31, category: "Пакеты и пленка", name: "Пакеты для мусора 60 л (50 шт.) ПОЛИЭС (25)", packSize: 50, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 32, category: "Бытовая химия", name: "Санокс 750 мл (15)", packSize: 15, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 33, category: "Уборка", name: "Губка для посуды металлическая (3 шт.) (32)", packSize: 3, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 34, category: "Уборка", name: "Ведро хозяйственное 10 л", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 35, category: "Канцтовары", name: "Ручка шариковая синяя STAFF (12)", packSize: 12, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 36, category: "Канцтовары", name: "Степлер № 24/6", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 37, category: "Уборка", name: "Пипидастр", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 38, category: "Канцтовары", name: "Ножницы Workmate 188 мм, пластиковые прорезиненные черные ручки", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
  { id: 39, category: "Бытовая химия", name: "Белизна, 1 л (15)", packSize: 15, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 40, category: "Уборка", name: "Губка «Мега» для посуды КонтинентПак (5 шт.)", packSize: 5, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 41, category: "Текстиль", name: "Вафельное полотно 45 см × 60 м, 140 г/м² (5)", packSize: 5, pieceSize: 1, bundleSize: 1, saleUnits: ["piece", "pack"] },
  { id: 42, category: "Текстиль", name: "Вафельное полотно 40 см × 50 м, 110 г/м²", packSize: 1, pieceSize: 1, bundleSize: 1, saleUnits: ["piece"] },
];

export const UNIT_CONFIG = {
  piece: { label: "Штука", shortLabel: "шт." },
  pack: { label: "Упаковка", shortLabel: "уп." },
  bundle: { label: "Пачка", shortLabel: "пач." },
};

export const RUSSIAN_PHONE_PREFIX = "+7 ";

export function getRussianPhoneLocalDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("7") || digits.startsWith("8")) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
}

export function formatRussianPhone(value) {
  const digits = getRussianPhoneLocalDigits(value);

  if (!digits) return RUSSIAN_PHONE_PREFIX;

  let result = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += ")";
  if (digits.length > 3) result += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;

  return result;
}

export function getManagerPhoneLinks(value) {
  const localDigits = getRussianPhoneLocalDigits(value);

  if (localDigits.length !== 10) {
    return {
      phone: "",
    };
  }

  const fullNumber = `7${localDigits}`;

  return {
    phone: `tel:+${fullNumber}`,
  };
}

export function getMaxLink(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) return "";
  if (/^https?:\/\/(?:www\.)?max\.ru\//i.test(rawValue)) return rawValue;
  if (/^(?:www\.)?max\.ru\//i.test(rawValue)) return `https://${rawValue}`;

  const profilePath = rawValue
    .replace(/^@/, "")
    .replace(/^\/+|\/+$/g, "");

  return /^(?:u\/)?[a-zA-Z0-9_-]+$/.test(profilePath)
    ? `https://max.ru/${profilePath}`
    : "";
}

export function getTelegramLink(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) return "";
  if (/^https?:\/\//i.test(rawValue)) return rawValue;

  const username = rawValue
    .replace(/^@/, "")
    .replace(/^t\.me\//i, "")
    .replace(/[^a-zA-Z0-9_]/g, "");

  return username ? `https://t.me/${username}` : "";
}

export function selectDefaultNumber(event) {
  const value = String(event.currentTarget.value ?? "");
  if (value === "0" || value === "1") {
    event.currentTarget.select();
  }
}

export const UNIT_ORDER = ["piece", "bundle", "pack"];

export const DEMO_SESSION_KEY = "clover-demo-session";

export const STORAGE = {
  products: "clover-products",
  orders: "clover-orders",
  profile: "clover-client-profile",
  addresses: "clover-addresses",
  clientId: "clover-client-id",
  favorites: "clover-favorites",
  settings: "clover-manager-settings",
  clientLinks: "clover-client-links",
  draft: "clover-order-draft",
};

export const DEFAULT_SETTINGS = {
  showPrices: true,
  allowCustomItems: true,
  allowClientEdit: true,
  allowClientDelete: true,
  allowRepeatOrder: true,
  requireProfile: true,
  requireAddress: true,
  managerCanDeleteOrders: true,
  showFavorites: true,
  enableDrafts: true,
  managerFullName: "",
  managerPhone: "+7 ",
  managerMax: "",
  managerTelegram: "",
  managerNotificationsEnabled: true,
  managerNotifyNewOrders: true,
  managerNotifyOrderChanges: true,
  managerNotifyCustomItems: true,
  managerNotifyReconciliation: true,
  managerNotifyRegistrations: true,
  managerNotifyOneCErrors: true,
  managerNotifyEmail: false,
  managerNotificationEmail: "",
  managerNotifyTelegram: false,
  managerTelegramChatId: "",
  managerNotifyPush: true,
};

export const EMPTY_PROFILE = {
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
};

export const EMPTY_LINK = {
  matched1C: false,
  oneCId: "",
  oneCCode: "",
  oneCName: "",
  oneCInn: "",
  oneCMatchCode: "",
  oneCMatchName: "",
  oneCMatchInn: "",
  oneCMatchPhone: "",
  oneCMatchEmail: "",
  oneCSearchQuery: "",
  oneCLinkMode: "",
  oneCLinkedAt: "",
  managerNote: "",
  matrixMode: "pending",
  matrixProductIds: [],
  allowFullCatalog: false,
  defaultPricingMode: "base",
  defaultMarkupPercent: 0,
  personalPrices: {},
};

export const EXCHANGE_STATUS_LABELS = {
  not_sent: "Не отправлен",
  ready: "В очереди 1С TEST",
  sending: "Передаётся в 1С TEST",
  sent: "Создан в 1С TEST",
  draft: "Черновик создан в 1С",
  error: "Ошибка",
};

export function normalizeOrderExchange(value = {}) {
  const status = Object.hasOwn(EXCHANGE_STATUS_LABELS, value?.status)
    ? value.status
    : "not_sent";

  return {
    status,
    attempts: Math.max(0, Number(value?.attempts) || 0),
    checkedAt: value?.checkedAt || "",
    lastAttemptAt: value?.lastAttemptAt || "",
    sentAt: value?.sentAt || "",
    remoteDocument: value?.remoteDocument || null,
    channel: value?.channel || "",
    message: value?.message || "",
    receipt: value?.receipt || "",
    payloadVersion: value?.payloadVersion || "1.0",
  };
}

export function exchangeBadgeClass(status) {
  if (status === "sent" || status === "draft") return "exchange-sent";
  if (status === "ready" || status === "sending") return "exchange-ready";
  if (status === "error") return "exchange-error";
  return "exchange-pending";
}

export function downloadBlobFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function printOrderDocument(order, settings) {
  const printWindow = window.open("", "_blank", "width=960,height=760");
  if (!printWindow) {
    alert("Браузер заблокировал окно печати. Разрешите всплывающие окна для localhost.");
    return;
  }

  const itemRows = (order.items || []).map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.code || item.category || "")}</small></td>
      <td>${escapeHtml(UNIT_CONFIG[item.unit]?.label || item.unit)}</td>
      <td>${Number(item.quantity) || 0}</td>
      <td>${settings.showPrices ? escapeHtml(formatMoney(Number(item.unitPrice) || 0)) : "—"}</td>
      <td>${settings.showPrices ? escapeHtml(formatMoney(Number(item.lineTotal) || 0)) : "—"}</td>
    </tr>`).join("");
  const customRows = (order.customItems || []).map((item, index) => `
    <tr>
      <td>${(order.items || []).length + index + 1}</td>
      <td><strong>${escapeHtml(item.name)}</strong><br><small>Товар вне матрицы · ${escapeHtml(item.details || "")}</small></td>
      <td>${escapeHtml(item.unit || "шт.")}</td>
      <td>${Number(item.quantity) || 0}</td>
      <td>${settings.showPrices ? escapeHtml(formatMoney(Number(item.unitPrice) || 0)) : "—"}</td>
      <td>${settings.showPrices ? escapeHtml(formatMoney((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0))) : "—"}</td>
    </tr>`).join("");

  printWindow.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Заказ ${escapeHtml(order.number)}</title><style>
    body{font-family:Arial,sans-serif;color:#263226;margin:32px} h1{margin:0 0 4px;color:#3f7c3d} .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:22px 0;padding:16px;background:#f3f7f1;border-radius:12px}.meta div{line-height:1.5} table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #dce6d9;padding:9px;text-align:left;vertical-align:top}th{background:#eef5eb}.total{margin-top:18px;text-align:right;font-size:20px;font-weight:700}.note{margin-top:18px;padding:12px;background:#fff8e8;border-radius:10px}.footer{margin-top:36px;color:#718071;font-size:12px}@media print{button{display:none}body{margin:12mm}}
  </style></head><body>
    <h1>Заказ № ${escapeHtml(order.number)}</h1>
    <div>Система Clover · ${escapeHtml(formatDateTime(order.createdAt))}</div>
    <div class="meta">
      <div><strong>Клиент:</strong><br>${escapeHtml(order.customerName || "")}<br>${escapeHtml(order.customerContact || "")}<br>${escapeHtml(order.customerPhone || "")}</div>
      <div><strong>Доставка:</strong><br>${escapeHtml(formatDate(order.firstDeliveryDate))}<br>${escapeHtml(order.address || "")}</div>
    </div>
    <table><thead><tr><th>№</th><th>Товар</th><th>Единица</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${itemRows}${customRows}</tbody></table>
    ${settings.showPrices ? `<div class="total">Итого: ${escapeHtml(formatMoney(getOrderTotal(order)))}</div>` : ""}
    ${order.clientComment ? `<div class="note"><strong>Комментарий клиента:</strong><br>${escapeHtml(order.clientComment)}</div>` : ""}
    ${order.managerComment ? `<div class="note"><strong>Комментарий менеджера:</strong><br>${escapeHtml(order.managerComment)}</div>` : ""}
    <div class="footer">Внешний ID: ${escapeHtml(order.externalId || order.id || "")}</div>
    <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  printWindow.document.close();
}

export const APP_STYLES = `
:root {
  font-family: "Manrope", "Segoe UI", system-ui, sans-serif;
  color: var(--clover-text, #293329);
  background: var(--clover-bg, #f4f8f2);
}

* { box-sizing: border-box; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
textarea { resize: vertical; }

.clover-app { min-height: 100vh; background: var(--clover-bg, #f4f8f2); }
.muted { color: var(--clover-muted, #5f6b5f); }
.small { font-size: 12px; }
.danger-text { color: var(--clover-danger, #a54f4f); }
.success-text { color: var(--clover-green-mute, #4f8d4b); }
.nowrap { white-space: nowrap; }

.role-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 18px 0 20px;
  padding: 5px;
  border-radius: 14px;
  background: #eef4eb;
}
.role-switch button {
  min-height: 42px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #687268;
  font-weight: 700;
}
.role-switch button.active {
  background: #fff;
  color: #4f8d4b;
  box-shadow: 0 4px 14px rgba(65,105,61,.1);
}
.test-note {
  margin-top: 18px;
  padding: 12px;
  border-radius: 12px;
  background: #fff8e9;
  color: #806936;
  font-size: 12px;
  line-height: 1.5;
}

.login-card .logo {
  display: block;
  width: 230px;
  max-width: 85%;
  height: auto;
  margin: 0 auto 22px;
  object-fit: contain;
}

.loading-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--clover-bg, #f4f8f2);
  font-family: "Manrope", "Segoe UI", system-ui, sans-serif;
}
.loading-card {
  width: min(420px, 100%);
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 30px;
  border: 1px solid rgba(86, 156, 80, .16);
  border-radius: 26px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 24px 60px rgba(62, 110, 57, .14);
  text-align: center;
}
.loading-logo {
  display: block;
  width: 190px;
  max-width: 65vw;
  height: auto;
  margin: 0 auto 18px;
  object-fit: contain;
}
.loading-card h2 { margin: 0 0 8px; color: #386f37; }
.loading-card p { margin: 0; color: #6d786d; line-height: 1.5; }

.app-header {
  min-height: 56px;
  padding: 10px 5%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #fff;
  border-bottom: 1px solid #e1e9de;
  position: sticky;
  top: 0;
  z-index: 40;
}
.app-header-logo { display: block; width: 120px; max-width: 120px; max-height: 52px; height: auto; object-fit: contain; flex: 0 0 auto; }
.app-header-actions { display: flex; align-items: center; gap: 12px; color: #596359; }
.manager-contact { position: relative; }
.manager-contact-trigger {
  min-height: 42px;
  padding: 9px 14px;
  border: 1px solid #d7e3d4;
  border-radius: 12px;
  background: #f7fbf5;
  color: #4f8d4b;
  font-weight: 800;
}
.manager-contact-trigger:hover,
.manager-contact.open .manager-contact-trigger,
.manager-contact:focus-within .manager-contact-trigger {
  border-color: #5b9d57;
  background: #eef7eb;
}
.manager-contact-popover {
  position: absolute;
  top: calc(100% + 11px);
  right: 0;
  z-index: 80;
  display: none;
  width: 310px;
  padding: 18px;
  border: 1px solid #dbe6d8;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 18px 44px rgba(43, 72, 40, .18);
  text-align: left;
}
.manager-contact:hover .manager-contact-popover,
.manager-contact.open .manager-contact-popover,
.manager-contact:focus-within .manager-contact-popover { display: block; }
.manager-contact-popover::before {
  content: "";
  position: absolute;
  top: -7px;
  right: 28px;
  width: 13px;
  height: 13px;
  border-top: 1px solid #dbe6d8;
  border-left: 1px solid #dbe6d8;
  background: #fff;
  transform: rotate(45deg);
}
.manager-contact-popover .eyebrow { margin: 0 0 7px; }
.manager-contact-popover h3 { margin: 0 0 8px; color: #394639; font-size: 18px; }
.manager-contact-phone { display: block; margin-bottom: 13px; color: #596359; font-size: 14px; font-weight: 700; text-decoration: none; }
.manager-contact-note { margin: 0 0 13px; color: #7a847a; font-size: 12px; line-height: 1.45; }
.manager-contact-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.manager-contact-actions a {
  display: grid;
  min-height: 40px;
  padding: 9px 10px;
  border: 1px solid #d7e3d4;
  border-radius: 11px;
  background: #fff;
  color: #4f8d4b;
  font-size: 12px;
  font-weight: 800;
  place-items: center;
  text-decoration: none;
}
.manager-contact-actions a.primary { border-color: #5b9d57; background: #5b9d57; color: #fff; }
.manager-contact-actions a.wide { grid-column: 1 / -1; }
.manager-contact-empty { padding: 11px; border-radius: 10px; background: #fff8e9; color: #806936; font-size: 12px; line-height: 1.45; }
.header-button {
  padding: 10px 16px;
  border: 1px solid #5b9d57;
  border-radius: 12px;
  background: #fff;
  color: #4f8d4b;
  font-weight: 700;
}
.header-button.primary { background: #5b9d57; color: #fff; }

.page-content { width: min(1240px, 92%); margin: 0 auto; padding: 38px 0 72px; }
.page-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
.page-title-row h1 { margin: 5px 0 10px; color: #386f37; font-size: 36px; }
.page-title-row p { margin: 0; color: #697469; line-height: 1.55; }
.eyebrow { color: #5b9d57 !important; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
.primary-button {
  min-height: 44px;
  padding: 11px 18px;
  border: none;
  border-radius: 12px;
  background: #5b9d57;
  color: #fff;
  font-weight: 700;
}
.secondary-button {
  min-height: 42px;
  padding: 9px 14px;
  border: 1px solid #d5dfd2;
  border-radius: 12px;
  background: #fff;
  color: #515d51;
  font-weight: 600;
}
.danger-button {
  min-height: 42px;
  padding: 9px 14px;
  border: 1px solid #e6c7c7;
  border-radius: 12px;
  background: #fff;
  color: #a54f4f;
  font-weight: 600;
}
.icon-button {
  width: 38px;
  height: 38px;
  border: 1px solid #d9e4d6;
  border-radius: 11px;
  background: #fff;
  color: #5f715f;
  font-weight: 800;
}

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 26px; }
.stat-card {
  padding: 21px;
  border: 1px solid #e1e9de;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(56,97,52,.05);
}
.stat-card span { display: block; margin-bottom: 10px; color: #747e74; font-size: 12px; }
.stat-card strong { color: #386f37; font-size: 28px; }

.panel {
  margin-top: 22px;
  padding: 24px;
  border: 1px solid #e1e9de;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 10px 26px rgba(56,97,52,.05);
}
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
.panel-heading h2 { margin: 4px 0 7px; color: #394639; }
.panel-heading p { margin: 0; color: #737d73; line-height: 1.5; }

.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
.field { display: grid; gap: 7px; color: #515d51; font-size: 12px; font-weight: 700; }
.field input, .field select, .field textarea, .toolbar input, .toolbar select {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid #d6e0d3;
  border-radius: 11px;
  background: #fff;
  color: #394639;
  outline: none;
}
.field input:focus, .field select:focus, .field textarea:focus, .toolbar input:focus, .toolbar select:focus {
  border-color: #5b9d57;
  box-shadow: 0 0 0 3px rgba(91,157,87,.1);
}
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }

.profile-summary { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
.profile-summary article, .address-card, .mini-card {
  padding: 15px;
  border: 1px solid #e4ebe1;
  border-radius: 14px;
  background: #f8fbf6;
}
.profile-summary span, .mini-label { display: block; margin-bottom: 6px; color: #7b857b; font-size: 11px; }
.profile-summary strong { display: block; overflow-wrap: anywhere; color: #3f4b3f; font-size: 14px; line-height: 1.45; }
.empty-box { padding: 28px 20px; border: 1px dashed #dce6d8; border-radius: 12px; background: #fff; color: #4a554a; text-align: center; line-height: 1.5; }
.warning-box { padding: 18px; border: 1px solid #ead9b5; border-radius: 12px; background: #fff6e5; color: #7a5c1e; }

.address-list { display: grid; gap: 12px; }
.address-card { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.address-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.address-title h3 { margin: 0; color: #3f4b3f; font-size: 16px; }
.badge { display: inline-flex; align-items: center; width: fit-content; padding: 5px 9px; border-radius: 8px; font-size: 11px; font-weight: 700; }
.badge.green { background: #dff0da; color: #2f6b32; }
.badge.yellow { background: #fff1d6; color: #7a5a14; }
.badge.blue { background: #e4eefc; color: #2f5f9a; }
.badge.gray { background: #eef1ee; color: #556055; }
.badge.red { background: #fdecec; color: #a54f4f; }
.badge.status-new, .status-new { background: #e8eef4; color: #3d5568; }
.badge.status-work, .status-work { background: #fff1d6; color: #7a5a14; }
.badge.status-ready, .status-ready { background: #e4eefc; color: #2f5f9a; }
.badge.status-done, .status-done { background: #dff0da; color: #2f6b32; }
.badge.status-cancel, .status-cancel { background: #f0eeee; color: #5c5c5c; }
.address-card p { margin: 7px 0 0; color: #697469; font-size: 13px; line-height: 1.5; }
.inline-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.inline-actions button { min-height: 36px; padding: 7px 10px; font-size: 11px; }

.toolbar { display: grid; grid-template-columns: minmax(200px,1fr) 190px 190px; gap: 12px; margin-bottom: 18px; }
.toolbar.two { grid-template-columns: minmax(220px,1fr) 220px; }
.toolbar.four { grid-template-columns: minmax(220px,1fr) 180px 180px 180px; }

.order-list { display: grid; gap: 16px; }
.order-card {
  padding: 22px;
  border: 1px solid #e1e9de;
  border-radius: 19px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(56,97,52,.05);
}
.order-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.order-card-header h3 { margin: 7px 0 5px; color: #394639; font-size: 21px; }
.order-card-header p { margin: 4px 0 0; color: #7b857b; font-size: 13px; }
.order-meta { display: grid; grid-template-columns: 170px minmax(0,1fr) 110px 130px; gap: 12px; margin: 18px 0; padding: 15px; border-radius: 14px; background: #f5f9f3; }
.order-meta span { display: block; margin-bottom: 5px; color: #7a847a; font-size: 10px; text-transform: uppercase; }
.order-meta strong { color: #465146; font-size: 13px; line-height: 1.45; }
.order-details { border-top: 1px solid #edf1eb; padding-top: 14px; }
.order-details summary { color: #4f8d4b; font-weight: 800; cursor: pointer; }
.order-products { display: grid; gap: 0; margin-top: 12px; }
.order-product { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 16px; padding: 11px 0; border-bottom: 1px solid #edf1eb; }
.order-product > span { color: #596359; line-height: 1.45; }
.order-product > strong { display: flex; align-items: flex-end; flex-direction: column; color: #386f37; white-space: nowrap; }
.order-product small { margin-top: 3px; color: #7a847a; font-size: 10px; font-weight: 500; }
.order-comments { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 15px; }
.comment-box { padding: 13px; border-radius: 12px; background: #f7faf5; }
.comment-box strong { display: block; margin-bottom: 6px; color: #4c5a4c; font-size: 12px; }
.comment-box p { margin: 0; color: #697469; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
.custom-line { margin-top: 6px; padding: 13px; border: 1px solid #ead9b5; border-radius: 12px; background: #fffaf0; }

.client-order-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 14px; }

.catalog-content { width: min(1440px, 94%); margin: 0 auto; padding: 34px 0 70px; }
.catalog-layout { display: grid; grid-template-columns: minmax(0,1fr) 370px; gap: 24px; align-items: start; }
.catalog-layout > .order-summary { grid-column: 2; grid-row: 1; }
.catalog-layout > :not(.order-summary) { grid-column: 1; grid-row: 1; }
.catalog-toolbar { margin-bottom: 20px; }
.catalog-filter-row { display: grid; grid-template-columns: minmax(220px,1fr) auto; gap: 12px; margin-bottom: 12px; }
.catalog-search { width: 100%; padding: 12px 14px; border: 1px solid #d8e2d5; border-radius: 12px; outline: none; }
.catalog-search:focus { border-color: #5b9d57; box-shadow: 0 0 0 3px rgba(91,157,87,.1); }
.category-list { display: flex; flex-wrap: wrap; gap: 8px; }
.category-button { padding: 8px 12px; border: 1px solid #d8e2d5; border-radius: 999px; background: #fff; color: #657065; font-size: 12px; font-weight: 700; }
.category-button.active { border-color: #5b9d57; background: #5b9d57; color: #fff; }
.product-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; }
.product-card { display: flex; min-height: 390px; padding: 18px; border: 1px solid #e1e9de; border-radius: 18px; background: #fff; flex-direction: column; box-shadow: 0 8px 20px rgba(56,97,52,.04); }
.product-image-wrap { display: grid; place-items: center; width: 100%; height: 145px; margin: 10px 0 2px; overflow: hidden; border-radius: 14px; background: #f2f6ef; }
.mobile-checkout-bar { display: none; }
.delivery-date-trigger { display: none; }
.delivery-date-sheet { display: none; }
.delivery-date-desktop-hint {
  margin: 2px 0 0;
  color: #5f6f5f;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}
.product-image { width: 100%; height: 100%; object-fit: contain; }
.product-image-placeholder { color: #9aaa98; font-size: 12px; font-weight: 700; text-align: center; }
.product-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.product-category { color: #5b9d57; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; }
.favorite-button { border: none; background: transparent; color: #b1b8b1; font-size: 21px; line-height: 1; }
.favorite-button.active { color: #e0aa2c; }
.product-card h2 { margin: 12px 0 8px; color: #3f4b3f; font-size: 16px; line-height: 1.35; }
.product-code { margin: 0 0 10px; color: #929a92; font-size: 10px; }
.product-price { margin: auto 0 12px; color: #386f37; font-weight: 800; }
.product-price small { color: #6f7b6f; font-size: 11px; font-weight: 700; }
.unit-choice { display: flex; gap: 7px; margin-bottom: 8px; }
.unit-choice button { flex: 1 1 0; min-height: 37px; padding: 7px; border: 1px solid #d8e3d4; border-radius: 10px; background: #fff; color: #5f695f; font-size: 11px; font-weight: 800; }
.unit-choice button.active { border-color: #5b9d57; background: #5b9d57; color: #fff; }
.unit-hint { min-height: 17px; margin: 0 0 10px; color: #7a847a; font-size: 10px; }
.quantity-control { display: grid; grid-template-columns: 38px minmax(80px,1fr) 38px; align-items: center; border: 1px solid #dfe7dc; border-radius: 12px; overflow: hidden; }
.quantity-control > button { height: 40px; border: none; background: #f3f8f1; color: #4f8d4b; font-size: 19px; font-weight: 800; }
.quantity-input-wrap { display: flex; align-items: center; justify-content: center; gap: 4px; }
.quantity-input { width: 60px; height: 38px; padding: 0 4px; border: none; background: transparent; color: #394639; font-weight: 800; text-align: center; outline: none; }
.quantity-input-wrap small { color: #718071; font-size: 10px; }
.order-summary { position: sticky; top: 105px; padding: 21px; border: 1px solid #e1e9de; border-radius: 19px; background: #fff; box-shadow: 0 10px 26px rgba(56,97,52,.07); }
.order-summary h2 { margin: 0 0 14px; color: #394639; }
.summary-list { display: grid; max-height: 320px; overflow: auto; gap: 8px; margin-bottom: 14px; }
.summary-item { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; padding: 10px; border-radius: 10px; background: #f7faf5; }
.summary-item span, .summary-item strong { display: flex; flex-direction: column; gap: 3px; }
.summary-item span { color: #596359; font-size: 11px; line-height: 1.4; }
.summary-item strong { align-items: flex-end; color: #386f37; font-size: 11px; white-space: nowrap; }
.summary-item small { color: #818a81; font-size: 9px; font-weight: 500; }
.summary-empty { padding: 16px; border-radius: 12px; background: #f7faf5; color: #7a847a; font-size: 12px; line-height: 1.5; }
.summary-total { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 14px 0; padding: 13px; border-radius: 12px; background: #eef6eb; }
.summary-total strong { color: #386f37; font-size: 18px; }
.summary-note { margin: 8px 0; color: #818a81; font-size: 10px; line-height: 1.45; }
.save-order-button { width: 100%; min-height: 48px; border: none; border-radius: 13px; background: #5b9d57; color: #fff; font-weight: 800; }
.custom-product-box { grid-column: 1 / -1; padding: 20px; border: 1px dashed #87ae82; border-radius: 18px; background: #f8fbf6; }
.custom-product-box h3 { margin: 7px 0; color: #394639; }
.custom-product-form { display: grid; gap: 12px; margin-top: 15px; }
.custom-row { display: grid; grid-template-columns: 1fr 140px; gap: 12px; }
.request-photo-picker input[type="file"] { padding: 9px; border: 1px dashed #a8c5a3; background: #fff; }
.request-photo-picker small { color: #7a847a; font-size: 10px; font-weight: 500; }
.request-photo-status { padding: 10px 12px; border-radius: 10px; background: #eef6eb; color: #4f7d4b; font-size: 11px; font-weight: 700; }
.request-photo-error { padding: 10px 12px; border-radius: 10px; background: #fdecec; color: #a45151; font-size: 11px; font-weight: 700; }
.request-photo-preview { display: grid; grid-template-columns: 120px minmax(0,1fr); gap: 12px; align-items: center; padding: 12px; border: 1px solid #dce7d9; border-radius: 13px; background: #fff; }
.request-photo-preview > div { display: grid; justify-items: start; gap: 6px; }
.request-photo-preview strong { color: #455245; font-size: 12px; overflow-wrap: anywhere; }
.request-photo-preview small { color: #7a847a; font-size: 10px; }
.custom-request-photo { display: block; overflow: hidden; padding: 0; border: 1px solid #dbe5d8; border-radius: 11px; background: #f2f6ef; cursor: zoom-in; appearance: none; }
.custom-request-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
.custom-photo-viewer { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 24px; background: rgba(18, 25, 18, 0.9); cursor: zoom-out; }
.custom-photo-viewer > img { display: block; width: auto; height: auto; max-width: min(1200px, 94vw); max-height: 90vh; object-fit: contain; border-radius: 12px; background: #fff; box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45); cursor: default; }
.custom-photo-viewer-close { position: fixed; top: max(14px, env(safe-area-inset-top)); right: max(14px, env(safe-area-inset-right)); z-index: 10001; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid rgba(255, 255, 255, 0.55); border-radius: 50%; background: rgba(255, 255, 255, 0.95); color: #345934; font-size: 30px; line-height: 1; font-weight: 500; cursor: pointer; }
.request-photo-preview .custom-request-photo { width: 120px; height: 90px; }
.custom-request-photo-small { width: 58px; height: 44px; margin-top: 5px; }
.custom-request-order-row { grid-template-columns: 74px minmax(0,1fr) auto; align-items: center; }
.custom-request-photo-order { width: 68px; height: 54px; }
.manager-request-photo-block { display: grid; justify-items: start; gap: 8px; margin: 0 0 12px; padding: 12px; border-radius: 12px; background: #fff; }
.manager-request-photo-block > strong { color: #596359; font-size: 11px; }
.custom-request-photo-manager { width: min(320px, 100%); aspect-ratio: 4 / 3; }


.manager-nav, .client-nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 24px; padding: 0 0 2px; }
.manager-nav button, .client-nav button { padding: 10px 15px; border: 1px solid #d7e1d4; border-radius: 12px; background: #fff; color: #5d695d; font-weight: 800; cursor: pointer; }
.manager-nav button.active, .client-nav button.active { border-color: #5b9d57; background: #5b9d57; color: #fff; }
.client-nav { position: sticky; top: 0; z-index: 20; background: #f4f8f2; padding-top: 8px; padding-bottom: 10px; }
.client-nav-desktop { display: flex; }
.client-bottom-nav { display: none; }
.client-cabinet-stack { display: grid; gap: 18px; }
.client-home-note { margin-bottom: 16px; }
.manager-header-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.manager-search-input { min-width: 180px; max-width: 260px; padding: 9px 12px; border: 1px solid #d7e1d4; border-radius: 12px; font: inherit; }
.manager-bell { position: relative; }
.manager-bell-count { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #c45c26; color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; }
.manager-bell-panel { position: absolute; right: 0; top: calc(100% + 8px); width: min(360px, 82vw); max-height: 420px; overflow: auto; background: #fff; border: 1px solid #d7e1d4; border-radius: 16px; box-shadow: 0 16px 40px rgba(40, 64, 40, 0.16); padding: 12px; z-index: 40; }
.order-onec-box { margin-top: 8px; padding: 12px; border: 1px solid #d7e1d4; border-radius: 14px; background: #f7fbf5; }
.order-onec-title { display: block; margin-bottom: 8px; color: #2f7d32; font-size: 13px; }
.manager-more-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.exchange-summary-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
@media (max-width: 820px) {
  .client-nav-desktop { display: none !important; }
  .client-bottom-nav {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    background: rgba(244, 248, 242, 0.96);
    border-top: 1px solid #d7e1d4;
    backdrop-filter: blur(8px);
  }
  .client-bottom-nav button {
    padding: 12px 8px;
    border: 1px solid #d7e1d4;
    border-radius: 14px;
    background: #fff;
    color: #5d695d;
    font-weight: 800;
    cursor: pointer;
  }
  .client-bottom-nav button.active {
    border-color: #5b9d57;
    background: #5b9d57;
    color: #fff;
  }
  .clover-app .page-content { padding-bottom: 96px; }
  .exchange-summary-strip { grid-template-columns: 1fr; }
}
.client-home-gate { margin-bottom: 16px; }
.client-settings-stack { display: grid; gap: 18px; }
.client-matrix-toolbar { display: grid; gap: 12px; margin-bottom: 18px; }
.client-matrix-meta { color: #737d73; font-size: 14px; }
button.linkish { border: 0; background: transparent; color: #2f6b3a; font-weight: 800; text-decoration: underline; cursor: pointer; padding: 0; }
.manager-grid { display: grid; gap: 16px; }
.manager-order-controls { display: grid; grid-template-columns: 210px minmax(0,1fr); gap: 12px; margin-top: 15px; }
.manager-textareas { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-top: 12px; }
.manager-textareas textarea { min-height: 90px; }

.client-list { display: grid; gap: 16px; }
.client-card { padding: 21px; border: 1px solid #e1e9de; border-radius: 18px; background: #fff; }
.client-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.client-card h3 { margin: 5px 0; color: #394639; }
.client-metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-top: 15px; }
.client-metrics article { padding: 12px; border-radius: 12px; background: #f7faf5; }
.client-metrics span { display: block; color: #7a847a; font-size: 10px; }
.client-metrics strong { display: block; margin-top: 5px; color: #386f37; font-size: 15px; }
.matrix-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; max-height: 330px; overflow: auto; margin-top: 12px; padding: 10px; border: 1px solid #e1e9de; border-radius: 12px; }
.matrix-item { display: flex; align-items: flex-start; gap: 7px; padding: 8px; border-radius: 9px; background: #f8fbf6; color: #596359; font-size: 11px; line-height: 1.35; }
.matrix-catalog-note {
  margin: 18px 0;
  padding: 16px 18px;
  border: 1px solid #dbe8d7;
  border-radius: 15px;
  background: #f7fbf5;
  color: #596359;
  line-height: 1.55;
}
.matrix-catalog-note.pending {
  border-color: #ead9b5;
  background: #fffaf0;
  color: #7f693b;
}
.catalog-scope-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
}
.catalog-scope-switch button {
  min-height: 38px;
  padding: 8px 13px;
  border: 1px solid #d5dfd2;
  border-radius: 10px;
  background: #fff;
  color: #607060;
  font-weight: 700;
}
.catalog-scope-switch button.active {
  border-color: #5b9d57;
  background: #5b9d57;
  color: #fff;
}
.matrix-editor-list {
  display: grid;
  gap: 10px;
  max-height: 620px;
  overflow: auto;
  margin-top: 12px;
  padding-right: 4px;
}
.matrix-editor-row {
  display: grid;
  grid-template-columns: minmax(220px, 1.35fr) repeat(3, minmax(120px, .55fr)) minmax(175px, .75fr);
  gap: 9px;
  align-items: end;
  padding: 12px;
  border: 1px solid #e1e9de;
  border-radius: 13px;
  background: #f8fbf6;
}
.matrix-editor-product {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #465146;
  font-size: 12px;
  line-height: 1.4;
}
.matrix-price-field {
  display: grid;
  gap: 5px;
  color: #707a70;
  font-size: 10px;
  font-weight: 700;
}
.matrix-price-field input,
.matrix-price-field select {
  width: 100%;
  min-height: 36px;
  padding: 7px 8px;
  border: 1px solid #d7e0d4;
  border-radius: 9px;
  background: #fff;
}
.matrix-price-calculated {
  align-self: stretch;
  padding: 8px 9px;
  border: 1px solid #d7e4d3;
  border-radius: 10px;
  background: #fff;
}
.matrix-price-calculated small,
.matrix-price-calculated strong {
  display: block;
  line-height: 1.35;
}
.matrix-price-calculated strong { color: #386f37; font-size: 12px; }
.matrix-price-mode { display: grid; gap: 7px; }
.price-update-time { color: #7a847a; font-size: 9px; line-height: 1.35; }
.matrix-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.matrix-summary span {
  padding: 6px 9px;
  border-radius: 999px;
  background: #eef5eb;
  color: #587058;
  font-size: 11px;
  font-weight: 700;
}

.product-manager-list { display: grid; gap: 10px; }
.product-manager-row { display: grid; grid-template-columns: 74px minmax(0,1fr) 110px 100px 180px; align-items: start; gap: 12px; padding: 14px; border: 1px solid #e1e9de; border-radius: 14px; background: #fff; box-sizing: border-box; min-height: 0; }
.product-manager-thumb { display: grid; place-items: center; width: 70px; height: 70px; overflow: hidden; border-radius: 12px; background: #f2f6ef; color: #9aaa98; font-size: 10px; text-align: center; }
.product-manager-thumb img { width: 100%; height: 100%; object-fit: contain; }
.image-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.image-upload-label { display: inline-flex; align-items: center; justify-content: center; min-height: 34px; padding: 7px 10px; border: 1px solid #d5dfd2; border-radius: 9px; background: #fff; color: #587058; font-size: 11px; font-weight: 800; cursor: pointer; }
.image-upload-label input { display: none; }
.product-manager-row h3 { margin: 0 0 4px; color: #394639; font-size: 14px; }
.product-manager-row p { margin: 0; color: #7a847a; font-size: 10px; }
.product-manager-row.inactive { opacity: .58; }
.product-purchase-summary { display: flex; flex-wrap: wrap; gap: 5px 10px; margin-top: 7px; margin-bottom: 2px; color: #526852; font-size: 10px; line-height: 1.45; }
.product-purchase-summary span { white-space: nowrap; }
.product-purchase-summary strong { color: #315f31; font-size: 10px; }
.product-purchase-updated { display: block; width: 100%; color: #7a847a; line-height: 1.45; padding-bottom: 1px; }
.purchase-price-card { margin-top: 14px; padding: 15px; border: 1px solid #dce7d9; border-radius: 14px; background: #f8fbf6; }
.purchase-price-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.purchase-price-card-head h3 { margin: 0; color: #394639; font-size: 14px; }
.purchase-price-card-head small { color: #7a847a; text-align: right; }
.purchase-price-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
.purchase-price-grid article { padding: 11px; border: 1px solid #dce7d9; border-radius: 11px; background: #fff; }
.purchase-price-grid span, .purchase-price-grid small { display: block; color: #7a847a; font-size: 10px; }
.purchase-price-grid strong { display: block; margin: 5px 0 3px; color: #315f31; font-size: 15px; }
.product-editor { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 20px; background: rgba(28,40,28,.48); }
.product-editor-card { width: min(800px,100%); max-height: 92vh; overflow: auto; padding: 24px; border-radius: 20px; background: #fff; box-shadow: 0 25px 80px rgba(0,0,0,.2); }
.unit-settings { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-top: 12px; }
.unit-setting { padding: 12px; border: 1px solid #e1e9de; border-radius: 12px; background: #f8fbf6; }
.unit-setting label { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; color: #465146; font-weight: 800; }
.unit-setting .field { margin-top: 8px; }

.manager-contact-settings {
  margin-bottom: 18px;
  padding: 18px;
  border: 1px solid #dce7d9;
  border-radius: 16px;
  background: #f8fbf6;
}
.manager-contact-settings h3 { margin: 0 0 6px; color: #394639; }
.manager-contact-settings > p { margin: 0 0 15px; color: #747e74; font-size: 12px; line-height: 1.5; }
.manager-contact-help { margin: 12px 0 0 !important; color: #7a847a !important; font-size: 11px !important; }
.settings-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.setting-card { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 16px; border: 1px solid #e1e9de; border-radius: 14px; background: #f8fbf6; }
.setting-card h3 { margin: 0 0 5px; color: #394639; font-size: 14px; }
.setting-card p { margin: 0; color: #7a847a; font-size: 11px; line-height: 1.4; }
.toggle { width: 48px; height: 28px; padding: 3px; border: none; border-radius: 999px; background: #cfd7cd; flex-shrink: 0; }
.toggle span { display: block; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: .2s; }
.toggle.active { background: #5b9d57; }
.toggle.active span { transform: translateX(20px); }

.backup-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px; }
.backup-list, .audit-list { display: grid; gap: 9px; margin-top: 16px; }
.backup-row, .audit-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 14px; align-items: center; padding: 13px; border: 1px solid #e1e9de; border-radius: 12px; background: #f8fbf6; }
.backup-row h3, .audit-row h3 { margin: 0 0 4px; color: #394639; font-size: 13px; }
.backup-row p, .audit-row p { margin: 0; color: #7a847a; font-size: 10px; line-height: 1.45; }
.backup-row .inline-actions { justify-content: flex-end; }
.audit-details { margin-top: 4px; color: #667266; font-size: 10px; word-break: break-word; }
.server-safe-note { margin-top: 14px; padding: 13px; border-radius: 12px; background: #eef6eb; color: #4e714d; font-size: 11px; line-height: 1.5; }
.exchange-notice { margin-bottom: 16px; padding: 15px; border: 1px solid #ead9b5; border-radius: 13px; background: #fff9ec; color: #78632e; line-height: 1.5; }
.success-box { padding: 13px; border: 1px solid #cfe3ca; border-radius: 12px; background: #eef8eb; color: #3f713d; line-height: 1.5; }
.section-toggle { cursor: pointer; color: #4f684f; font-weight: 800; }
.exchange-status-line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.exchange-pending { background: #edf0ed; color: #687168; }
.exchange-ready { background: #e7f2ff; color: #2f6592; }
.exchange-sent { background: #e5f4e2; color: #3e7b3b; }
.exchange-error { background: #fbe8e8; color: #a34e4e; }
.exchange-message { margin-top: 8px; color: #727d72; font-size: 11px; line-height: 1.45; }
.exchange-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.exchange-actions button { min-height: 34px; padding: 7px 10px; }
.exchange-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 12px; margin-bottom: 16px; }
.exchange-grid article { padding: 16px; border: 1px solid #e1e9de; border-radius: 14px; background: #fff; }
.exchange-grid span { display: block; color: #778177; font-size: 11px; }
.exchange-grid strong { display: block; margin-top: 7px; color: #3f533f; font-size: 25px; }
.exchange-order-list { display: grid; gap: 12px; margin-top: 14px; }
.exchange-order-row { padding: 16px; border: 1px solid #e1e9de; border-radius: 14px; background: #fff; }
.exchange-order-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
.exchange-order-head h3 { margin: 5px 0; color: #3f4c3f; }
.exchange-issues { margin: 10px 0 0; padding: 11px 13px 11px 29px; border-radius: 10px; background: #fff1f1; color: #934e4e; font-size: 11px; line-height: 1.5; }
.exchange-log { display: grid; gap: 8px; margin-top: 14px; }
.exchange-log-row { padding: 12px; border: 1px solid #e5ebe3; border-radius: 11px; background: #f8fbf6; }
.exchange-log-row h4 { margin: 0 0 4px; color: #465346; }
.exchange-log-row p { margin: 0; color: #788278; font-size: 11px; }
.import-label { display: inline-flex; align-items: center; min-height: 42px; padding: 9px 14px; border: 1px solid #d5dfd2; border-radius: 11px; background: #fff; color: #587058; font-weight: 700; cursor: pointer; }
.import-label input { display: none; }

@media print {
  .app-header, .manager-nav, .client-nav, .client-bottom-nav, .client-order-actions, .mobile-checkout-bar, .toolbar, button { display: none !important; }
  .page-content { width: 100%; padding: 0; }
  .order-card { box-shadow: none; page-break-inside: avoid; }
}

@media (max-width: 1100px) {
  .product-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .catalog-layout { grid-template-columns: minmax(0,1fr) 340px; }
  .profile-summary { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .matrix-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .matrix-editor-row { grid-template-columns: 1fr 1fr; }
  .matrix-editor-product { grid-column: 1 / -1; }
}
@media (max-width: 900px) {
  .stats-grid { grid-template-columns: repeat(2,1fr); }
  .catalog-layout { grid-template-columns: 1fr; gap: 16px; }
  .catalog-layout > .order-summary,
  .catalog-layout > :not(.order-summary) { grid-column: auto; grid-row: auto; }
  .order-summary {
    position: relative;
    top: auto;
    padding: 14px;
    border-radius: 16px;
    overflow: visible;
    min-width: 0;
  }
  .order-summary h2 { margin: 0 0 10px; font-size: 18px; }
  .summary-list { max-height: 140px; margin-bottom: 10px; }
  .order-summary .save-order-button { display: none; }
  .order-summary .summary-note { display: none; }
  .order-summary .field { min-width: 0; max-width: 100%; }
  .order-summary .field input,
  .order-summary .field select,
  .order-summary .field textarea {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .delivery-date-field { gap: 7px; }
  .delivery-date-input-desktop { display: none !important; }
  .delivery-date-desktop-hint { display: none !important; }
  .delivery-date-trigger {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 56px;
    padding: 10px 12px;
    border: 1px solid #d6e0d3;
    border-radius: 14px;
    background: #fff;
    color: #394639;
    text-align: left;
    font: inherit;
    box-shadow: 0 4px 12px rgba(56, 97, 52, 0.04);
  }
  .delivery-date-trigger.is-selected {
    border-color: #b9d7b5;
    background: linear-gradient(180deg, #f4faf2 0%, #eef7eb 100%);
  }
  .delivery-date-day {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: #5b9d57;
    color: #fff;
    font-size: 20px;
    font-weight: 800;
    line-height: 1;
  }
  .delivery-date-day.is-empty {
    background: #e8efe5;
    color: #8a9688;
    font-size: 18px;
  }
  .delivery-date-text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .delivery-date-text strong {
    color: #394639;
    font-size: 15px;
    font-weight: 800;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .delivery-date-text small {
    color: #5f6f5f;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
    white-space: normal;
  }
  .delivery-date-action {
    color: #5b9d57;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }
  .delivery-date-preview {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
    padding: 12px;
    border: 1px solid #b9d7b5;
    border-radius: 14px;
    background: linear-gradient(180deg, #f4faf2 0%, #eef7eb 100%);
  }
  .delivery-date-sheet {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 80;
  }
  .delivery-date-sheet-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(30, 42, 30, 0.45);
    cursor: pointer;
  }
  .delivery-date-sheet-panel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 18px 16px calc(18px + env(safe-area-inset-bottom, 0px));
    border-radius: 18px 18px 0 0;
    background: #fff;
    box-shadow: 0 -12px 36px rgba(40, 64, 40, 0.18);
  }
  .delivery-date-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
  }
  .delivery-date-sheet-head strong { color: #394639; font-size: 16px; }
  .delivery-date-sheet-panel input[type="date"] {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 48px;
    box-sizing: border-box;
    font-size: 16px;
  }
  .product-grid { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
  .product-card {
    min-height: 0;
    padding: 10px;
    border-radius: 14px;
    box-shadow: 0 4px 12px rgba(56,97,52,.04);
  }
  .product-image-wrap { height: 78px; margin: 4px 0 0; border-radius: 10px; }
  .product-image-placeholder { font-size: 10px; padding: 0 6px; }
  .product-card h2 { margin: 6px 0 2px; font-size: 13px; line-height: 1.25; }
  .product-code { display: none; }
  .product-price { margin: 0 0 8px; font-size: 13px; }
  .unit-choice { gap: 5px; margin-bottom: 6px; }
  .unit-choice button { min-height: 30px; padding: 4px; font-size: 10px; border-radius: 8px; }
  .unit-hint { display: none; }
  .quantity-control { grid-template-columns: 32px minmax(56px,1fr) 32px; border-radius: 10px; }
  .quantity-control > button { height: 34px; font-size: 16px; }
  .quantity-input { width: 44px; height: 32px; }
  .mobile-checkout-bar {
    display: grid;
    grid-template-columns: minmax(0,1fr) auto;
    align-items: center;
    gap: 10px;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 55;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid #d7e1d4;
    background: rgba(255,255,255,.97);
    box-shadow: 0 -8px 24px rgba(40,64,40,.1);
    backdrop-filter: blur(8px);
  }
  .mobile-checkout-bar-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .mobile-checkout-bar-info strong { color: #394639; font-size: 14px; }
  .mobile-checkout-bar-info span { color: #5f6f5f; font-size: 12px; font-weight: 700; }
  .mobile-checkout-bar-button {
    min-height: 44px;
    padding: 0 18px;
    border: none;
    border-radius: 12px;
    background: #5b9d57;
    color: #fff;
    font-size: 14px;
    font-weight: 800;
    white-space: nowrap;
  }
  .catalog-content { padding-bottom: 88px; }
  .order-meta { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .toolbar.four { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .product-manager-row { grid-template-columns: 70px minmax(0,1fr) 110px 90px; }
  .product-manager-row .row-actions { grid-column: 1 / -1; }
  .client-metrics { grid-template-columns: repeat(2,1fr); }
}
@media (max-width: 820px) {
  .mobile-checkout-bar {
    bottom: calc(72px + env(safe-area-inset-bottom, 0px));
    padding-bottom: 10px;
  }
  .catalog-content { padding-bottom: 168px; }
}
@media (max-width: 700px) {
  .app-header { align-items: center; min-height: 0; padding: 8px 4%; gap: 10px; }
  .app-header-logo { width: 72px; max-width: 72px; max-height: 40px; }
  .app-header-actions { align-items: center; flex-direction: row; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
  .manager-contact-popover { position: fixed; top: 64px; right: 4%; width: min(340px, 92vw); }
  .manager-contact-popover::before { display: none; }
  .page-content, .catalog-content { width: 92%; padding-top: 26px; }
  .catalog-content { padding-bottom: 168px; }
  .page-title-row, .panel-heading, .address-card, .order-card-header, .client-card-header { align-items: stretch; flex-direction: column; }
  .page-title-row h1 { font-size: 26px; }
  .form-grid, .profile-summary, .toolbar, .toolbar.two, .toolbar.four, .manager-order-controls, .manager-textareas, .settings-grid, .order-comments { grid-template-columns: 1fr; }
  .product-grid { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
  .order-meta { grid-template-columns: 1fr; }
  .custom-row { grid-template-columns: 1fr; }
  .unit-settings, .purchase-price-grid { grid-template-columns: 1fr; }
  .matrix-grid { grid-template-columns: 1fr; }
  .matrix-editor-row { grid-template-columns: 1fr; }
  .matrix-editor-product { grid-column: auto; }
  .product-manager-row { grid-template-columns: 1fr; }
  .form-actions, .inline-actions, .backup-actions { align-items: stretch; flex-direction: column; }
  .form-actions button, .inline-actions button, .backup-actions button, .import-label { width: 100%; justify-content: center; }
}
@media (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat-card { padding: 15px; }
  .stat-card strong { font-size: 23px; }
  .app-header-logo { width: 68px; max-width: 68px; max-height: 36px; }
  .product-image-wrap { height: 64px; }
  .product-card h2 { font-size: 12px; }
  .favorite-button { font-size: 18px; }
}
`;

export function readDemoSession() {
  try {
    const savedSession = sessionStorage.getItem(DEMO_SESSION_KEY);

    return savedSession
      ? JSON.parse(savedSession)
      : {
          isLoggedIn: false,
          role: "client",
        };
  } catch {
    return {
      isLoggedIn: false,
      role: "client",
    };
  }
}

export function writeDemoSession(isLoggedIn, role) {
  try {
    if (!isLoggedIn) {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
      return;
    }

    sessionStorage.setItem(
      DEMO_SESSION_KEY,
      JSON.stringify({
        isLoggedIn: true,
        role,
      })
    );
  } catch (error) {
    console.error("Не удалось сохранить текущий вход", error);
  }
}

export function safeRead(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Не удалось сохранить ${key}`, error);
  }
}

export function makeId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function makeOrderIdentifiers(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const milliseconds = pad(date.getMilliseconds(), 3);

  return {
    number: `CL-${datePart.slice(2)}-${timePart}-${milliseconds}`,
    externalId: `CLOVER-${datePart}-${timePart}-${milliseconds}`,
  };
}

export function getOrCreateClientId() {
  const saved = localStorage.getItem(STORAGE.clientId);
  if (saved) return saved;
  const id = makeId("client");
  localStorage.setItem(STORAGE.clientId, id);
  return id;
}

export function normalizeProduct(product) {
  const filteredSaleUnits = Array.isArray(product.saleUnits)
    ? product.saleUnits.filter((unit) => UNIT_ORDER.includes(unit))
    : [];
  const saleUnits = filteredSaleUnits.length ? filteredSaleUnits : ["piece"];
  const numericId = Number(product.id);
  const hasNumericId = Number.isFinite(numericId) && numericId > 0;

  return {
    ...product,
    id: hasNumericId ? numericId : product.id,
    code: product.code || (hasNumericId ? `CL-${String(numericId).padStart(4, "0")}` : ""),
    oneCId: product.oneCId || "",
    oneCCode: product.oneCCode || "",
    oneCName: product.oneCName || "",
    oneCLinkMode: product.oneCLinkMode || "",
    oneCLinkedAt: product.oneCLinkedAt || "",
    oneCMatchCode: product.oneCMatchCode || "",
    oneCMatchName: product.oneCMatchName || "",
    oneCSearchQuery: product.oneCSearchQuery || "",
    oneCSearchRequestedAt: product.oneCSearchRequestedAt || "",
    imageUrl: product.imageUrl || "",
    imageUpdatedAt: product.imageUpdatedAt || "",
    active: product.active !== false,
    pieceSize: Math.max(1, Number(product.pieceSize) || 1),
    packSize: Math.max(1, Number(product.packSize) || 1),
    bundleSize: Math.max(1, Number(product.bundleSize) || 1),
    pricePiece: Math.max(0, Number(product.pricePiece) || 0),
    pricePack: Math.max(0, Number(product.pricePack) || 0),
    priceBundle: Math.max(0, Number(product.priceBundle) || 0),
    basePricePiece: Math.max(
      0,
      Number(product.basePricePiece ?? product.pricePiece) || 0
    ),
    basePricePack: Math.max(
      0,
      Number(product.basePricePack ?? product.pricePack) || 0
    ),
    basePriceBundle: Math.max(
      0,
      Number(product.basePriceBundle ?? product.priceBundle) || 0
    ),
    priceSources:
      product.priceSources &&
      typeof product.priceSources === "object"
        ? product.priceSources
        : {},
    purchasePrices:
      product.purchasePrices && typeof product.purchasePrices === "object"
        ? product.purchasePrices
        : { piece: null, pack: null, bundle: null },
    purchasePriceUpdatedAt: product.purchasePriceUpdatedAt || "",
    purchasePriceUnit: product.purchasePriceUnit || "piece",
    purchasePriceAvailable: Boolean(product.purchasePriceAvailable),
    clientPriceMode: product.clientPriceMode || "base",
    clientPriceOverrideMode: product.clientPriceOverrideMode || "inherit",
    markupPercent: Math.max(0, Number(product.markupPercent) || 0),
    defaultPricingMode: product.defaultPricingMode || "base",
    defaultMarkupPercent: Math.max(0, Number(product.defaultMarkupPercent) || 0),
    isMatrixProduct: product.isMatrixProduct !== false,
    saleUnits,
  };
}

export function formatDate(value) {
  if (!value) return "Дата не указана";
  try {
    return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

export function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function getUnitMultiplier(product, unit) {
  if (unit === "pack") return Number(product.packSize) || 1;
  if (unit === "bundle") return Number(product.bundleSize) || 1;
  return Number(product.pieceSize) || 1;
}

export function getUnitPrice(product, unit) {
  if (unit === "pack") return Number(product.pricePack) || 0;
  if (unit === "bundle") return Number(product.priceBundle) || 0;
  return Number(product.pricePiece) || 0;
}

export function getPriceSource(product, unit) {
  return product.priceSources?.[unit] || "unspecified";
}

export function hasPersonalPrices(link) {
  return Object.values(link.personalPrices || {}).some((price) =>
    price?.source === "purchase_markup" ||
    ["piece", "pack", "bundle"].some(
      (unit) =>
        price?.[unit] !== null &&
        price?.[unit] !== undefined &&
        price?.[unit] !== ""
    )
  );
}

export function roundPriceUp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.ceil(numeric - 1e-9)
    : 0;
}

export function hasPurchasePrice(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

export function hasManualUnitValue(price = {}) {
  return UNIT_ORDER.some(
    (unit) =>
      price?.[unit] !== null &&
      price?.[unit] !== undefined &&
      price?.[unit] !== ""
  );
}

/** При выборе «Фиксированная» подставляет базу каталога в пустые единицы продажи. */

export function prefillManualPriceFromProduct(product, currentPrice = {}) {
  const next = {
    source: "manual",
    markupPercent: Math.max(0, Number(currentPrice.markupPercent) || 0),
    piece:
      currentPrice.piece !== null && currentPrice.piece !== undefined
        ? Number(currentPrice.piece)
        : null,
    pack:
      currentPrice.pack !== null && currentPrice.pack !== undefined
        ? Number(currentPrice.pack)
        : null,
    bundle:
      currentPrice.bundle !== null && currentPrice.bundle !== undefined
        ? Number(currentPrice.bundle)
        : null,
  };

  const saleUnits = Array.isArray(product?.saleUnits) ? product.saleUnits : [];
  for (const unit of UNIT_ORDER) {
    if (!saleUnits.includes(unit)) continue;
    if (next[unit] !== null) continue;
    const priceField =
      unit === "piece"
        ? "pricePiece"
        : unit === "pack"
          ? "pricePack"
          : "priceBundle";
    const base = Math.max(0, Number(product?.[priceField]) || 0);
    if (base > 0) next[unit] = base;
  }

  return next;
}

export function calculateMarkupPreview(purchasePrice, markupPercent) {
  const purchase = Number(purchasePrice);
  if (!Number.isFinite(purchase) || purchase < 0) return 0;
  const markup = Math.max(0, Number(markupPercent) || 0);
  return roundPriceUp(purchase * (1 + markup / 100));
}

export function getOrderTotal(order) {
  const itemsTotal = (order.items || []).reduce(
    (sum, item) => sum + (Number(item.lineTotal) || 0),
    0
  );
  const customTotal = (order.customItems || []).reduce(
    (sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
    0
  );
  return itemsTotal + customTotal;
}

export function getPositionCount(order) {
  return (order.items?.length || 0) + (order.customItems?.length || 0);
}

export function statusClass(status) {
  if (status === "Новый") return "status-new";
  if (["Принят", "Собирается"].includes(status)) return "status-work";
  if (status === "Готов к доставке") return "status-ready";
  if (status === "Выполнен") return "status-done";
  return "status-cancel";
}

export function makeOrderHistoryEvent(type, label, actor = "Система") {
  return {
    id: makeId("history"),
    type,
    label,
    actor,
    createdAt: new Date().toISOString(),
  };
}

export function appendOrderHistory(order, event) {
  const history = Array.isArray(order?.history) ? order.history : [];
  return [...history, event].slice(-100);
}

export function reconciliationPeriodLabel(item) {
  const labels = { q1: "1 квартал", q2: "2 квартал", q3: "3 квартал", q4: "4 квартал", all: "За весь период", custom: "Определённый период" };
  if (item.periodType === "all") return labels.all;
  if (["q1", "q2", "q3", "q4"].includes(item.periodType)) return `${labels[item.periodType]} ${item.year || ""}`.trim();
  return `${item.dateFrom || "—"} — ${item.dateTo || "—"}`;
}

export const RECONCILIATION_STATUS_LABELS = {
  new: "Новый запрос",
  processing: "Готовится",
  ready: "Готов",
  rejected: "Отклонён",
};
