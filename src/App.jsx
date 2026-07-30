import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import cloverLogo from "./assets/clover-logo.png";
import { startPasskeyAuthentication, startPasskeyRegistration } from "./utils/webauthn";
import {
  api,
  clearApiToken,
  getApiToken,
  setApiToken,
} from "./serverApi";

const MANAGER_ACTIVE_TAB_KEY = "clover-manager-active-tab-v1";
const MANAGER_OPEN_CLIENT_KEY = "clover-manager-open-client-v1";
const CLIENT_ACTIVE_TAB_KEY = "clover-client-active-tab-v1";

const MANAGER_TABS = [
  ["orders", "Заказы"],
  ["exchange", "Обмен с 1С"],
  ["clients", "Клиенты"],
  ["acts", "Акты сверки"],
  ["products", "Товары"],
  ["settings", "Настройки"],
  ["backup", "Резервные копии"],
  ["audit", "Журнал действий"],
];

const CLIENT_TABS = [
  ["home", "Новый заказ"],
  ["matrix", "Матрица"],
  ["orders", "Мои заказы"],
  ["acts", "Акт сверки"],
  ["addresses", "Мои адреса"],
  ["settings", "Настройки"],
];

function readManagerActiveTab() {
  try {
    const value = localStorage.getItem(MANAGER_ACTIVE_TAB_KEY) || "orders";
    return MANAGER_TABS.some(([id]) => id === value) ? value : "orders";
  } catch {
    return "orders";
  }
}

function writeManagerActiveTab(value) {
  try {
    localStorage.setItem(MANAGER_ACTIVE_TAB_KEY, value);
  } catch (error) {
    console.error("Не удалось сохранить раздел менеджера", error);
  }
}

function readClientActiveTab() {
  try {
    const value = localStorage.getItem(CLIENT_ACTIVE_TAB_KEY) || "home";
    return CLIENT_TABS.some(([id]) => id === value) ? value : "home";
  } catch {
    return "home";
  }
}

function writeClientActiveTab(value) {
  try {
    localStorage.setItem(CLIENT_ACTIVE_TAB_KEY, value);
  } catch (error) {
    console.error("Не удалось сохранить раздел клиента", error);
  }
}

function clientTabFromSection(section) {
  if (!section) return "";
  if (section === "reconciliation" || section === "acts") return "acts";
  if (section === "addresses" || section === "address") return "addresses";
  if (section === "settings" || section === "profile" || section === "security" || section === "push") {
    return "settings";
  }
  if (section === "orders" || section === "history") return "orders";
  if (section === "matrix" || section === "catalog-matrix") return "matrix";
  if (section === "home" || section === "order" || section === "catalog") return "home";
  return "";
}

function readOpenManagerClientId() {
  try {
    return localStorage.getItem(MANAGER_OPEN_CLIENT_KEY) || "";
  } catch {
    return "";
  }
}

function writeOpenManagerClientId(value) {
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

const DEFAULT_PRODUCTS = [
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

const UNIT_CONFIG = {
  piece: { label: "Штука", shortLabel: "шт." },
  pack: { label: "Упаковка", shortLabel: "уп." },
  bundle: { label: "Пачка", shortLabel: "пач." },
};

const RUSSIAN_PHONE_PREFIX = "+7 ";

function getRussianPhoneLocalDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("7") || digits.startsWith("8")) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
}

function formatRussianPhone(value) {
  const digits = getRussianPhoneLocalDigits(value);

  if (!digits) return RUSSIAN_PHONE_PREFIX;

  let result = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += ")";
  if (digits.length > 3) result += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;

  return result;
}

function getManagerPhoneLinks(value) {
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

function getMaxLink(value) {
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

function getTelegramLink(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) return "";
  if (/^https?:\/\//i.test(rawValue)) return rawValue;

  const username = rawValue
    .replace(/^@/, "")
    .replace(/^t\.me\//i, "")
    .replace(/[^a-zA-Z0-9_]/g, "");

  return username ? `https://t.me/${username}` : "";
}

function selectDefaultNumber(event) {
  const value = String(event.currentTarget.value ?? "");
  if (value === "0" || value === "1") {
    event.currentTarget.select();
  }
}

const UNIT_ORDER = ["piece", "bundle", "pack"];
const ORDER_STATUSES = [
  "Новый",
  "Принят",
  "Собирается",
  "Готов к доставке",
  "Выполнен",
  "Отменён",
];
const CUSTOM_STATUSES = [
  "Новый запрос",
  "Уточняется",
  "Согласован",
  "Добавлен в каталог",
  "Отклонён",
];

const DEMO_SESSION_KEY = "clover-demo-session";

const STORAGE = {
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

const DEFAULT_SETTINGS = {
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

const EMPTY_PROFILE = {
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
};

const EMPTY_LINK = {
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


const EXCHANGE_STATUS_LABELS = {
  not_sent: "Не отправлен",
  ready: "В очереди 1С TEST",
  sent: "Создан в 1С TEST",
  draft: "Черновик создан в 1С",
  error: "Ошибка",
};

function normalizeOrderExchange(value = {}) {
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

function exchangeBadgeClass(status) {
  if (status === "sent" || status === "draft") return "exchange-sent";
  if (status === "ready") return "exchange-ready";
  if (status === "error") return "exchange-error";
  return "exchange-pending";
}

function downloadBlobFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printOrderDocument(order, settings) {
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

const APP_STYLES = `
:root {
  font-family: Arial, Helvetica, sans-serif;
  color: #293329;
  background: #f4f8f2;
}

* { box-sizing: border-box; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
textarea { resize: vertical; }

.clover-app { min-height: 100vh; background: #f4f8f2; }
.muted { color: #7a847a; }
.small { font-size: 12px; }
.danger-text { color: #a54f4f; }
.success-text { color: #4f8d4b; }
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
  background:
    radial-gradient(circle at top left, #eef8eb 0, transparent 40%),
    linear-gradient(135deg, #f9fcf7, #e5f2df);
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
  min-height: 86px;
  padding: 14px 5%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: #fff;
  border-bottom: 1px solid #e1e9de;
  position: sticky;
  top: 0;
  z-index: 40;
}
.app-header-logo { display: block; width: 145px; max-width: 145px; height: auto; object-fit: contain; flex: 0 0 auto; }
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
  font-weight: 800;
}
.secondary-button {
  min-height: 42px;
  padding: 9px 14px;
  border: 1px solid #d5dfd2;
  border-radius: 11px;
  background: #fff;
  color: #587058;
  font-weight: 700;
}
.danger-button {
  min-height: 42px;
  padding: 9px 14px;
  border: 1px solid #e6c7c7;
  border-radius: 11px;
  background: #fff;
  color: #a54f4f;
  font-weight: 700;
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
.empty-box { padding: 28px; border-radius: 15px; background: #f7faf5; color: #778177; text-align: center; }
.warning-box { padding: 18px; border-radius: 14px; background: #fff8e9; color: #806936; }

.address-list { display: grid; gap: 12px; }
.address-card { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.address-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.address-title h3 { margin: 0; color: #3f4b3f; font-size: 16px; }
.badge { display: inline-flex; align-items: center; width: fit-content; padding: 5px 9px; border-radius: 999px; font-size: 10px; font-weight: 800; }
.badge.green { background: #dff0da; color: #4c8748; }
.badge.yellow { background: #fff1c8; color: #86651d; }
.badge.blue { background: #e5f0fb; color: #416b92; }
.badge.gray { background: #edf0ed; color: #687268; }
.badge.red { background: #fde9e9; color: #a45151; }
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
.status-new { background: #fff1c8; color: #86651d; }
.status-work { background: #e5f0fb; color: #416b92; }
.status-ready { background: #e3f3df; color: #4c8748; }
.status-done { background: #dff0da; color: #3f7c3b; }
.status-cancel { background: #fde9e9; color: #a45151; }

.client-order-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 14px; }

.catalog-content { width: min(1440px, 94%); margin: 0 auto; padding: 34px 0 70px; }
.catalog-layout { display: grid; grid-template-columns: minmax(0,1fr) 370px; gap: 24px; align-items: start; }
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
.product-manager-row { display: grid; grid-template-columns: 74px minmax(0,1fr) 110px 100px 180px; align-items: center; gap: 12px; padding: 14px; border: 1px solid #e1e9de; border-radius: 14px; background: #fff; }
.product-manager-thumb { display: grid; place-items: center; width: 70px; height: 70px; overflow: hidden; border-radius: 12px; background: #f2f6ef; color: #9aaa98; font-size: 10px; text-align: center; }
.product-manager-thumb img { width: 100%; height: 100%; object-fit: contain; }
.image-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.image-upload-label { display: inline-flex; align-items: center; justify-content: center; min-height: 34px; padding: 7px 10px; border: 1px solid #d5dfd2; border-radius: 9px; background: #fff; color: #587058; font-size: 11px; font-weight: 800; cursor: pointer; }
.image-upload-label input { display: none; }
.product-manager-row h3 { margin: 0 0 4px; color: #394639; font-size: 14px; }
.product-manager-row p { margin: 0; color: #7a847a; font-size: 10px; }
.product-manager-row.inactive { opacity: .58; }
.product-purchase-summary { display: flex; flex-wrap: wrap; gap: 5px 10px; margin-top: 7px; color: #526852; font-size: 10px; line-height: 1.4; }
.product-purchase-summary span { white-space: nowrap; }
.product-purchase-summary strong { color: #315f31; font-size: 10px; }
.product-purchase-updated { width: 100%; color: #7a847a; }
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
  .app-header, .manager-nav, .client-nav, .client-order-actions, .toolbar, button { display: none !important; }
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
  .catalog-layout { grid-template-columns: 1fr; }
  .order-summary { position: static; }
  .order-meta { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .toolbar.four { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .product-manager-row { grid-template-columns: 70px minmax(0,1fr) 110px 90px; }
  .product-manager-row .row-actions { grid-column: 1 / -1; }
  .client-metrics { grid-template-columns: repeat(2,1fr); }
}
@media (max-width: 700px) {
  .app-header { align-items: flex-start; padding: 12px 4%; }
  .app-header-actions { align-items: flex-end; flex-direction: column; gap: 7px; }
  .manager-contact-popover { position: fixed; top: 94px; right: 4%; width: min(340px, 92vw); }
  .manager-contact-popover::before { display: none; }
  .page-content, .catalog-content { width: 92%; padding-top: 26px; }
  .page-title-row, .panel-heading, .address-card, .order-card-header, .client-card-header { align-items: stretch; flex-direction: column; }
  .page-title-row h1 { font-size: 29px; }
  .form-grid, .profile-summary, .toolbar, .toolbar.two, .toolbar.four, .manager-order-controls, .manager-textareas, .settings-grid, .order-comments { grid-template-columns: 1fr; }
  .product-grid { grid-template-columns: 1fr; }
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
  .app-header-logo { width: 120px; }
}
`;


function readDemoSession() {
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

function writeDemoSession(isLoggedIn, role) {
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

function safeRead(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Не удалось сохранить ${key}`, error);
  }
}

function makeId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeOrderIdentifiers(timestamp = Date.now()) {
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

function getOrCreateClientId() {
  const saved = localStorage.getItem(STORAGE.clientId);
  if (saved) return saved;
  const id = makeId("client");
  localStorage.setItem(STORAGE.clientId, id);
  return id;
}

function normalizeProduct(product) {
  const saleUnits = Array.isArray(product.saleUnits) && product.saleUnits.length
    ? product.saleUnits.filter((unit) => UNIT_ORDER.includes(unit))
    : ["piece"];
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

function formatDate(value) {
  if (!value) return "Дата не указана";
  try {
    return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function formatDateTime(value) {
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

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function getUnitMultiplier(product, unit) {
  if (unit === "pack") return Number(product.packSize) || 1;
  if (unit === "bundle") return Number(product.bundleSize) || 1;
  return Number(product.pieceSize) || 1;
}

function getUnitPrice(product, unit) {
  if (unit === "pack") return Number(product.pricePack) || 0;
  if (unit === "bundle") return Number(product.priceBundle) || 0;
  return Number(product.pricePiece) || 0;
}

function getPriceSource(product, unit) {
  return product.priceSources?.[unit] || "unspecified";
}

function hasPersonalPrices(link) {
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

function roundPriceUp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.ceil(numeric - 1e-9)
    : 0;
}

function hasPurchasePrice(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

function hasManualUnitValue(price = {}) {
  return UNIT_ORDER.some(
    (unit) =>
      price?.[unit] !== null &&
      price?.[unit] !== undefined &&
      price?.[unit] !== ""
  );
}

/** При выборе «Фиксированная» подставляет базу каталога в пустые единицы продажи. */
function prefillManualPriceFromProduct(product, currentPrice = {}) {
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

function calculateMarkupPreview(purchasePrice, markupPercent) {
  const purchase = Number(purchasePrice);
  if (!Number.isFinite(purchase) || purchase < 0) return 0;
  const markup = Math.max(0, Number(markupPercent) || 0);
  return roundPriceUp(purchase * (1 + markup / 100));
}

function getOrderTotal(order) {
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

function getPositionCount(order) {
  return (order.items?.length || 0) + (order.customItems?.length || 0);
}

function statusClass(status) {
  if (status === "Новый") return "status-new";
  if (["Принят", "Собирается"].includes(status)) return "status-work";
  if (status === "Готов к доставке") return "status-ready";
  if (status === "Выполнен") return "status-done";
  return "status-cancel";
}


function makeOrderHistoryEvent(type, label, actor = "Система") {
  return {
    id: makeId("history"),
    type,
    label,
    actor,
    createdAt: new Date().toISOString(),
  };
}

function appendOrderHistory(order, event) {
  const history = Array.isArray(order?.history) ? order.history : [];
  return [...history, event].slice(-100);
}

function OrderTimeline({ order }) {
  const history = Array.isArray(order?.history) ? order.history : [];
  const items = history.length
    ? [...history].sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
      )
    : [
        {
          id: `created-${order.id}`,
          label: "Заказ создан",
          actor: order.customerContact || "Клиент",
          createdAt: order.createdAt,
        },
      ];

  return (
    <div className="comment-box" style={{ marginTop: 14 }}>
      <strong>История заказа</strong>
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              borderLeft: "3px solid rgba(47, 125, 50, 0.35)",
              paddingLeft: 12,
            }}
          >
            <div style={{ fontWeight: 700 }}>{item.label}</div>
            <small>
              {formatDateTime(item.createdAt)} · {item.actor || "Система"}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManagerContact({ settings, profile = {}, orders = [] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const fullName = String(settings.managerFullName || "").trim();
  const phoneValue = formatRussianPhone(settings.managerPhone || "");
  const phoneLinks = getManagerPhoneLinks(settings.managerPhone);
  const maxLink = getMaxLink(settings.managerMax);
  const baseTelegramLink = getTelegramLink(settings.managerTelegram);
  const latestOrder = [...orders].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
  const message = `Здравствуйте! Компания «${profile.companyName || "клиент Clover"}». ${latestOrder?.number ? `Вопрос по заказу №${latestOrder.number}.` : "У меня вопрос по работе с Clover."}`;
  const telegramLink = baseTelegramLink
    ? `${baseTelegramLink}${baseTelegramLink.includes("?") ? "&" : "?"}text=${encodeURIComponent(message)}`
    : "";
  const hasAnyContact = Boolean(fullName || phoneLinks.phone || maxLink || telegramLink);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Скопируйте текст обращения:", message);
    }
  };

  return (
    <div
      className={open ? "manager-contact open" : "manager-contact"}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
    >
      <button className="manager-contact-trigger" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        Связаться с менеджером
      </button>
      <div className="manager-contact-popover">
        <p className="eyebrow">Ваш менеджер</p>
        <h3>{fullName || "Менеджер Clover"}</h3>
        {phoneLinks.phone ? <a className="manager-contact-phone" href={phoneLinks.phone}>{phoneValue}</a> : <p className="manager-contact-note">Телефон пока не указан.</p>}
        <div className="manager-message-template">
          <strong>Шаблон обращения</strong>
          <p>{message}</p>
          <button className="secondary-button" type="button" onClick={copyMessage}>{copied ? "Скопировано" : "Скопировать текст"}</button>
        </div>
        {hasAnyContact && (phoneLinks.phone || maxLink || telegramLink) ? (
          <div className="manager-contact-actions">
            {phoneLinks.phone && <a className="primary" href={phoneLinks.phone}>Позвонить</a>}
            {maxLink && <a className={phoneLinks.phone ? "" : "primary"} href={maxLink} target="_blank" rel="noreferrer" onClick={copyMessage}>Открыть MAX</a>}
            {telegramLink && <a className={phoneLinks.phone || maxLink ? "wide" : "primary wide"} href={telegramLink} target="_blank" rel="noreferrer">Открыть Telegram</a>}
          </div>
        ) : <div className="manager-contact-empty">Контакты менеджера ещё не заполнены.</div>}
      </div>
    </div>
  );
}

function Header({ title, subtitle, onLogout, children }) {
  return (
    <header className="app-header">
      <img className="app-header-logo" src={cloverLogo} alt="Логотип Clover" width="145" height="98" />
      <div className="app-header-actions">
        <div style={{ textAlign: "right" }}>
          <strong>{title}</strong>
          {subtitle && <div className="small muted">{subtitle}</div>}
        </div>
        {children}
        {onLogout && (
          <button className="header-button" type="button" onClick={onLogout}>
            Выйти
          </button>
        )}
      </div>
    </header>
  );
}

function LoginView({ onAuth, authBusy, authError }) {
  const params = new URLSearchParams(window.location.search);
  const verifyToken = params.get("verify") || "";
  const resetToken = params.get("reset") || "";
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    phone: RUSSIAN_PHONE_PREFIX,
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");
  const [developmentLink, setDevelopmentLink] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(Boolean(verifyToken));
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    if (!verifyToken) return;
    let cancelled = false;
    api.verifyEmail(verifyToken)
      .then((result) => {
        if (cancelled) return;
        setMessage(result.message || "Электронная почта подтверждена.");
        window.history.replaceState({}, "", window.location.pathname);
        setMode("login");
      })
      .catch((error) => {
        if (!cancelled) setLocalError(error.message);
      })
      .finally(() => {
        if (!cancelled) setVerificationBusy(false);
      });
    return () => { cancelled = true; };
  }, [verifyToken]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage("");
    setLocalError("");
    setDevelopmentLink("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setLocalError("");
    setMessage("");
    setDevelopmentLink("");
    try {
      if (mode === "forgot") {
        const result = await api.forgotPassword(form.email);
        setMessage(result.message);
        setDevelopmentLink(result.developmentLink || "");
        return;
      }
      if (mode === "reset") {
        if (form.password !== form.confirmPassword) {
          throw new Error("Пароли не совпадают.");
        }
        const result = await api.resetPassword(resetToken, form.password);
        setMessage(result.message);
        window.history.replaceState({}, "", window.location.pathname);
        setMode("login");
        setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
        return;
      }
      const result = await onAuth({
        mode,
        companyName: form.companyName,
        contactName: form.contactName,
        phone: form.phone,
        email: form.email,
        password: form.password,
      });
      if (mode === "register" && result) {
        setMessage(result.message || "Регистрация создана.");
        setDevelopmentLink(result.developmentLink || "");
        setMode("login");
      }
    } catch (error) {
      setLocalError(error.message);
    }
  };

  const resend = async () => {
    setLocalError("");
    try {
      const result = await api.resendVerification(form.email);
      setMessage(result.message);
      setDevelopmentLink(result.developmentLink || "");
    } catch (error) {
      setLocalError(error.message);
    }
  };

  const loginWithPasskey = async () => {
    setLocalError("");
    setMessage("");
    if (!form.email.trim()) {
      setLocalError("Сначала укажите электронную почту.");
      return;
    }
    if (!("PublicKeyCredential" in window)) {
      setLocalError("Это устройство или браузер не поддерживает вход по Face ID или ключу доступа.");
      return;
    }
    setPasskeyBusy(true);
    try {
      const ceremony = await api.getPasskeyAuthenticationOptions(form.email);
      const response = await startPasskeyAuthentication(ceremony.options);
      const result = await api.verifyPasskeyAuthentication(form.email, ceremony.ceremonyId, response);
      await onAuth({ mode: "passkey", result });
    } catch (error) {
      setLocalError(error.message || "Не удалось выполнить вход по ключу доступа.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  if (verificationBusy) {
    return (
      <main className="page">
        <section className="login-card">
          <img className="logo" src={cloverLogo} alt="Логотип Clover" width="230" height="155" />
          <h1>Подтверждаем почту</h1>
          <p className="subtitle">Проверяем ссылку регистрации…</p>
        </section>
      </main>
    );
  }

  const title = mode === "register"
    ? "Создание аккаунта"
    : mode === "forgot"
      ? "Восстановление пароля"
      : mode === "reset"
        ? "Новый пароль"
        : "Личный кабинет";

  return (
    <main className="page">
      <section className="login-card">
        <img className="logo" src={cloverLogo} alt="Логотип Clover" width="230" height="155" />
        <h1>{title}</h1>
        {mode !== "login" && (
          <p className="subtitle">
            {mode === "register"
              ? "Регистрация доступна только клиентам. Роль определится автоматически при входе."
              : mode === "forgot"
                ? "Укажите почту — мы отправим ссылку для установки нового пароля."
                : "Придумайте новый пароль длиной не менее 8 символов."}
          </p>
        )}

        <form className="login-form" onSubmit={submit}>
          {mode === "register" && (
            <>
              <label htmlFor="companyName">Название организации</label>
              <input id="companyName" value={form.companyName} onChange={(event) => updateField("companyName", event.target.value)} required disabled={authBusy} />
              <label htmlFor="contactName">Контактное лицо</label>
              <input id="contactName" value={form.contactName} onChange={(event) => updateField("contactName", event.target.value)} required disabled={authBusy} />
              <label htmlFor="phone">Телефон</label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength="18" value={form.phone} onChange={(event) => updateField("phone", formatRussianPhone(event.target.value))} required disabled={authBusy} />
            </>
          )}

          {mode !== "reset" && (
            <>
              <label htmlFor="email">Электронная почта</label>
              <input id="email" type="email" autoComplete={mode === "login" ? "username webauthn" : "email"} value={form.email} onChange={(event) => updateField("email", event.target.value)} required disabled={authBusy} />
            </>
          )}

          {!["forgot"].includes(mode) && (
            <>
              <label htmlFor="password">{mode === "reset" ? "Новый пароль" : "Пароль"}</label>
              <input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 8} value={form.password} onChange={(event) => updateField("password", event.target.value)} required disabled={authBusy} />
            </>
          )}

          {mode === "reset" && (
            <>
              <label htmlFor="confirmPassword">Повторите новый пароль</label>
              <input id="confirmPassword" type="password" autoComplete="new-password" minLength="8" value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} required disabled={authBusy} />
            </>
          )}

          <button type="submit" disabled={authBusy}>
            {authBusy ? "Подождите…" : mode === "register" ? "Зарегистрироваться" : mode === "forgot" ? "Отправить ссылку" : mode === "reset" ? "Сохранить пароль" : "Войти"}
          </button>
        </form>

        {mode === "login" && (
          <button className="passkey-login-button" type="button" disabled={authBusy || passkeyBusy} onClick={loginWithPasskey}>
            {passkeyBusy ? "Подтверждаем…" : "Войти по Face ID / отпечатку"}
          </button>
        )}

        {(localError || authError) && <div className="auth-error">{localError || authError}</div>}
        {message && <div className="auth-success">{message}</div>}
        {developmentLink && (
          <div className="test-note">
            Тестовая ссылка для локальной настройки: <a href={developmentLink}>открыть</a>
          </div>
        )}

        <div className="registration auth-links">
          {mode === "login" && (
            <>
              <button type="button" onClick={() => switchMode("register")}>Зарегистрироваться</button>
              <button type="button" onClick={() => switchMode("forgot")}>Забыли пароль?</button>
              <button type="button" disabled={!form.email} onClick={resend}>Повторить письмо</button>
            </>
          )}
          {mode !== "login" && mode !== "reset" && (
            <button type="button" onClick={() => switchMode("login")}>Вернуться ко входу</button>
          )}
        </div>
      </section>
    </main>
  );
}

function ProfilePanel({ profile, onChange }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile);
  const complete = Object.values(profile).every((value) => String(value || "").trim());

  useEffect(() => setForm(profile), [profile]);

  const save = (event) => {
    event.preventDefault();
    const next = {
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
    };
    if (!Object.values(next).every(Boolean)) return;
    onChange(next);
    setEditing(false);
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Данные клиента</p>
          <h2>Профиль организации</h2>
          <p>Эти данные сохраняются в новых заказах и видны менеджеру.</p>
        </div>
        {!editing && (
          <button className="primary-button" type="button" onClick={() => setEditing(true)}>
            {complete ? "Изменить" : "+ Заполнить профиль"}
          </button>
        )}
      </div>

      {!editing && complete && (
        <div className="profile-summary">
          <article><span>Организация</span><strong>{profile.companyName}</strong></article>
          <article><span>Контактное лицо</span><strong>{profile.contactName}</strong></article>
          <article><span>Телефон</span><strong>{profile.phone}</strong></article>
          <article><span>Почта</span><strong>{profile.email}</strong></article>
        </div>
      )}

      {!editing && !complete && <div className="warning-box">Заполните профиль перед созданием первого заказа.</div>}

      {editing && (
        <form onSubmit={save}>
          <div className="form-grid">
            <label className="field">Название организации
              <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
            </label>
            <label className="field">Контактное лицо
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required />
            </label>
            <label className="field">Телефон
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 (999) 000-00-00"
                maxLength="18"
                value={form.phone || RUSSIAN_PHONE_PREFIX}
                onFocus={(event) => {
                  if (!getRussianPhoneLocalDigits(event.currentTarget.value)) {
                    setForm((current) => ({ ...current, phone: RUSSIAN_PHONE_PREFIX }));
                  }
                }}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: formatRussianPhone(event.target.value),
                  }))
                }
                required
              />
            </label>
            <label className="field">Электронная почта
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
          </div>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => { setForm(profile); setEditing(false); }}>Отмена</button>
            <button className="primary-button" type="submit">Сохранить профиль</button>
          </div>
        </form>
      )}
    </section>
  );
}

function AddressesPanel({ addresses, onChange }) {
  const empty = { label: "", address: "" };
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(empty);

  const close = () => { setFormOpen(false); setEditingId(null); setForm(empty); };
  const save = (event) => {
    event.preventDefault();
    const label = form.label.trim();
    const address = form.address.trim();
    if (!label || !address) return;
    if (editingId) {
      onChange(addresses.map((item) => item.id === editingId ? { ...item, label, address } : item));
    } else {
      onChange([...addresses, { id: makeId("address"), label, address, isDefault: addresses.length === 0 }]);
    }
    close();
  };

  const remove = (item) => {
    if (!window.confirm(`Удалить адрес «${item.label}»?`)) return;
    const next = addresses.filter((address) => address.id !== item.id);
    if (item.isDefault && next.length) next[0] = { ...next[0], isDefault: true };
    onChange(next);
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Доставка</p>
          <h2>Мои адреса</h2>
          <p>Добавьте несколько точек и выбирайте нужную при оформлении заказа.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => { setForm(empty); setEditingId(null); setFormOpen(true); }}>
          + Добавить адрес
        </button>
      </div>

      {addresses.length ? (
        <div className="address-list">
          {addresses.map((item) => (
            <article className="address-card" key={item.id}>
              <div>
                <div className="address-title"><h3>{item.label}</h3>{item.isDefault && <span className="badge green">Основной</span>}</div>
                <p>{item.address}</p>
              </div>
              <div className="inline-actions">
                {!item.isDefault && <button className="secondary-button" type="button" onClick={() => onChange(addresses.map((address) => ({ ...address, isDefault: address.id === item.id })))}>Сделать основным</button>}
                <button className="secondary-button" type="button" onClick={() => { setForm({ label: item.label, address: item.address }); setEditingId(item.id); setFormOpen(true); }}>Изменить</button>
                <button className="danger-button" type="button" onClick={() => remove(item)}>Удалить</button>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty-box">Адресов пока нет.</div>}

      {formOpen && (
        <form style={{ marginTop: 18 }} onSubmit={save}>
          <div className="form-grid">
            <label className="field">Название точки
              <input placeholder="Например: Магазин на Ленина" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            </label>
            <label className="field">Полный адрес
              <textarea rows="3" placeholder="Город, улица, дом, помещение" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
            </label>
          </div>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={close}>Отмена</button>
            <button className="primary-button" type="submit">Сохранить адрес</button>
          </div>
        </form>
      )}
    </section>
  );
}


const CUSTOM_REQUEST_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CUSTOM_REQUEST_PHOTO_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const CUSTOM_REQUEST_PHOTO_MAX_DIMENSION = 1600;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фотографию."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadBrowserImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Файл не удалось распознать как фотографию."));
    image.onload = () => resolve(image);
    image.src = source;
  });
}

async function prepareCustomRequestPhoto(file) {
  if (!CUSTOM_REQUEST_PHOTO_TYPES.includes(file?.type)) {
    throw new Error("Можно прикрепить JPG, PNG или WEBP.");
  }
  if (file.size > CUSTOM_REQUEST_PHOTO_MAX_SOURCE_BYTES) {
    throw new Error("Фотография слишком большая. Максимальный исходный размер — 12 МБ.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadBrowserImage(source);
  const scale = Math.min(
    1,
    CUSTOM_REQUEST_PHOTO_MAX_DIMENSION / image.naturalWidth,
    CUSTOM_REQUEST_PHOTO_MAX_DIMENSION / image.naturalHeight
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не смог подготовить фотографию.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  if (dataUrl.length > 6 * 1024 * 1024) {
    throw new Error("После обработки фотография всё ещё слишком большая. Выберите снимок меньшего размера.");
  }

  return {
    name: file.name || "Фото товара.jpg",
    type: "image/jpeg",
    size: Math.round((dataUrl.length * 3) / 4),
    width,
    height,
    dataUrl,
  };
}

function CustomRequestPhoto({ photo, className = "" }) {
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!viewerOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setViewerOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [viewerOpen]);

  if (!photo?.dataUrl) return null;

  const altText = photo.name || "Фото товара из запроса";

  return (
    <>
      <button
        className={`custom-request-photo ${className}`.trim()}
        type="button"
        onClick={() => setViewerOpen(true)}
        title="Открыть фотографию"
        aria-label={`Открыть фотографию: ${altText}`}
      >
        <img src={photo.dataUrl} alt={altText} />
      </button>
      {viewerOpen && (
        <div
          className="custom-photo-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={altText}
          onClick={() => setViewerOpen(false)}
        >
          <button
            className="custom-photo-viewer-close"
            type="button"
            onClick={() => setViewerOpen(false)}
            aria-label="Закрыть фотографию"
            title="Закрыть"
          >
            ×
          </button>
          <img
            src={photo.dataUrl}
            alt={altText}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function CustomItemForm({ onAdd }) {
  const initial = { name: "", quantity: "1", unit: "шт.", details: "", photo: null };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const resetForm = () => {
    setForm(initial);
    setPhotoBusy(false);
    setPhotoError("");
  };

  const selectPhoto = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setPhotoBusy(true);
    setPhotoError("");
    try {
      const photo = await prepareCustomRequestPhoto(file);
      setForm((current) => ({ ...current, photo }));
    } catch (error) {
      setPhotoError(error.message || "Не удалось прикрепить фотографию.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const quantity = Math.max(1, Number.parseInt(form.quantity, 10) || 1);
    if (!form.name.trim() || photoBusy) return;
    onAdd({
      id: makeId("custom"),
      name: form.name.trim(),
      quantity,
      unit: form.unit,
      details: form.details.trim(),
      photo: form.photo || null,
      requestStatus: "Новый запрос",
      unitPrice: 0,
      managerComment: "",
      matchedProductId: null,
      isCustom: true,
    });
    resetForm();
    setOpen(false);
  };

  return (
    <section className="custom-product-box">
      <span className="badge green">Не нашли нужный товар?</span>
      <h3>Добавьте запрос менеджеру</h3>
      <p className="muted small">Укажите название, количество и важные характеристики. При необходимости приложите фотографию.</p>
      {!open ? (
        <button className="primary-button" type="button" onClick={() => setOpen(true)}>+ Добавить отсутствующий товар</button>
      ) : (
        <form className="custom-product-form" onSubmit={submit}>
          <label className="field">Название товара
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <div className="custom-row">
            <label className="field">Количество
              <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </label>
            <label className="field">Единица
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option>шт.</option><option>уп.</option><option>пач.</option><option>кг</option><option>л</option><option>рулон</option><option>кор.</option>
              </select>
            </label>
          </div>
          <label className="field">Марка или характеристики
            <textarea rows="3" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
          </label>
          <label className="field request-photo-picker">Фото товара — необязательно
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={photoBusy}
              onChange={selectPhoto}
            />
            <small>JPG, PNG или WEBP. Clover уменьшит фотографию перед сохранением.</small>
          </label>
          {photoBusy && <div className="request-photo-status">Подготавливаем фотографию…</div>}
          {photoError && <div className="request-photo-error">{photoError}</div>}
          {form.photo?.dataUrl && (
            <div className="request-photo-preview">
              <CustomRequestPhoto photo={form.photo} />
              <div>
                <strong>{form.photo.name}</strong>
                <small>{form.photo.width} × {form.photo.height} пикс.</small>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, photo: null }))}
                >
                  Удалить фото
                </button>
              </div>
            </div>
          )}
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => { setOpen(false); resetForm(); }}>Отмена</button>
            <button className="primary-button" type="submit" disabled={photoBusy}>Добавить в заказ</button>
          </div>
        </form>
      )}
    </section>
  );
}

function OrderEditor({
  session,
  products,
  addresses,
  favorites,
  setFavorites,
  settings,
  profile,
  orders,
  catalogPolicy,
  showFullCatalog,
  setShowFullCatalog,
  onClose,
  onSave,
  embedded = false,
}) {
  const initialOrder = session.order || null;
  const defaultAddress = addresses.find((item) => item.isDefault) || addresses[0];
  const savedDraft = session.mode === "new" && settings.enableDrafts ? safeRead(STORAGE.draft, null) : null;
  const initialSource = initialOrder || savedDraft || {};

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [cart, setCart] = useState(() => {
    const result = {};
    (initialSource.items || []).forEach((item) => { result[item.productId ?? item.id] = item.quantity; });
    return result;
  });
  const [units, setUnits] = useState(() => {
    const result = {};
    (initialSource.items || []).forEach((item) => { result[item.productId ?? item.id] = item.unit; });
    return result;
  });
  const [customItems, setCustomItems] = useState(() =>
    session.mode === "repeat"
      ? (initialSource.customItems || []).map((item) => ({
          ...item,
          id: makeId("custom"),
          requestStatus: "Новый запрос",
          unitPrice: 0,
          managerComment: "",
          matchedProductId: null,
        }))
      : initialSource.customItems || []
  );
  const [deliveryDate, setDeliveryDate] = useState(initialSource.firstDeliveryDate || "");
  const [addressId, setAddressId] = useState(initialSource.addressId || defaultAddress?.id || "");
  const [clientComment, setClientComment] = useState(initialSource.clientComment || "");

  const categories = useMemo(() => ["Все", ...new Set(products.map((item) => item.category))], [products]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((item) => {
      const byCategory = category === "Все" || item.category === category;
      const bySearch = !needle || item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle);
      const byFavorite = !favoritesOnly || favorites.includes(item.id);
      return byCategory && bySearch && byFavorite;
    });
  }, [products, search, category, favoritesOnly, favorites]);

  const selectedItems = useMemo(() => products
    .filter((product) => Number(cart[product.id]) > 0)
    .map((product) => {
      const unit = units[product.id] || product.saleUnits[0];
      const quantity = Number(cart[product.id]) || 0;
      const unitPrice = getUnitPrice(product, unit);
      return {
        id: product.id,
        productId: product.id,
        code: product.code,
        oneCId: product.oneCId || "",
        name: product.name,
        category: product.category,
        quantity,
        unit,
        multiplier: getUnitMultiplier(product, unit),
        unitPrice,
        lineTotal: quantity * unitPrice,
        pieceSize: product.pieceSize,
        packSize: product.packSize,
        bundleSize: product.bundleSize,
      };
    }), [products, cart, units]);

  const total = selectedItems.reduce((sum, item) => sum + item.lineTotal, 0) + customItems.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0);
  const selectedAddress = addresses.find((item) => item.id === addressId);

  useEffect(() => {
    if (session.mode !== "new" || !settings.enableDrafts) return;
    safeWrite(STORAGE.draft, {
      items: selectedItems,
      customItems,
      firstDeliveryDate: deliveryDate,
      addressId,
      address: selectedAddress?.address || "",
      clientComment,
    });
  }, [session.mode, settings.enableDrafts, selectedItems, customItems, deliveryDate, addressId, selectedAddress, clientComment]);

  const changeQuantity = (id, delta) => {
    setCart((current) => {
      const nextValue = Math.max(0, (Number(current[id]) || 0) + delta);
      const next = { ...current };
      if (nextValue) next[id] = nextValue; else delete next[id];
      return next;
    });
  };

  const submit = (event) => {
    event.preventDefault();
    if (!selectedItems.length && !customItems.length) return alert("Добавьте хотя бы один товар.");
    if (!deliveryDate || !selectedAddress) return alert("Укажите дату и адрес доставки.");
    onSave({
      items: selectedItems,
      customItems,
      firstDeliveryDate: deliveryDate,
      addressId,
      address: selectedAddress.address,
      addressLabel: selectedAddress.label,
      clientComment: clientComment.trim(),
    });
    localStorage.removeItem(STORAGE.draft);
  };

  const catalogBody = (
      <section className={embedded ? "catalog-content embedded-catalog" : "catalog-content"}>
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Каталог</p>
            <h1>
              {session.mode === "edit"
                ? "Редактирование заказа"
                : session.mode === "repeat"
                  ? "Повтор заказа"
                  : "Новый заказ"}
            </h1>
            <p>Выберите товары — справа состав, дата, адрес и оформление.</p>
          </div>
          <div className="mini-card"><span className="mini-label">Позиций</span><strong>{selectedItems.length + customItems.length}</strong></div>
        </div>

        {catalogPolicy.matrixMode === "pending" && (
          <div className="matrix-catalog-note pending">
            Менеджер ещё подготавливает ваш постоянный список
            товаров и персональные цены. Пока можно добавить товар
            через форму «Не нашли нужный товар?».
          </div>
        )}

        {catalogPolicy.allowFullCatalog && (
          <div className="catalog-scope-switch">
            <button
              className={!showFullCatalog ? "active" : ""}
              type="button"
              onClick={() => setShowFullCatalog(false)}
            >
              Мои постоянные позиции
            </button>
            <button
              className={showFullCatalog ? "active" : ""}
              type="button"
              onClick={() => setShowFullCatalog(true)}
            >
              Весь каталог
            </button>
          </div>
        )}

        <div className="catalog-layout">
          <div>
            <div className="catalog-toolbar">
              <div className="catalog-filter-row">
                <input className="catalog-search" type="search" placeholder="Поиск по названию или коду" value={search} onChange={(e) => setSearch(e.target.value)} />
                {settings.showFavorites && <button className={favoritesOnly ? "category-button active" : "category-button"} type="button" onClick={() => setFavoritesOnly((value) => !value)}>★ Избранное</button>}
              </div>
              <div className="category-list">
                {categories.map((item) => <button className={category === item ? "category-button active" : "category-button"} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}
              </div>
            </div>

            <section className="product-grid">
              {filtered.map((product) => {
                const unit = units[product.id] || product.saleUnits[0];
                const quantity = Number(cart[product.id]) || 0;
                const multiplier = getUnitMultiplier(product, unit);
                const price = getUnitPrice(product, unit);
                return (
                  <article className="product-card" key={product.id}>
                    <div className="product-card-top">
                      <span className="product-category">{product.category}</span>
                      {settings.showFavorites && <button className={favorites.includes(product.id) ? "favorite-button active" : "favorite-button"} type="button" onClick={() => setFavorites((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])}>★</button>}
                    </div>
                    <div className="product-image-wrap">
                      {product.imageUrl ? (
                        <img className="product-image" src={product.imageUrl} alt={product.name} />
                      ) : (
                        <span className="product-image-placeholder">Фото товара пока не загружено</span>
                      )}
                    </div>
                    <h2>{product.name}</h2>
                    <p className="product-code">Код: {product.code}</p>
                    <p className="product-price">
                      {settings.showPrices && price > 0
                        ? <>{formatMoney(price)} <small>/ {UNIT_CONFIG[unit].shortLabel}</small></>
                        : "Цена уточняется"}
                    </p>
                    <div className="unit-choice">
                      {UNIT_ORDER.filter((item) => product.saleUnits.includes(item)).map((item) => (
                        <button className={unit === item ? "active" : ""} type="button" key={item} onClick={() => setUnits((current) => ({ ...current, [product.id]: item }))}>{UNIT_CONFIG[item].label}</button>
                      ))}
                    </div>
                    <p className="unit-hint">{multiplier > 1 ? `1 ${UNIT_CONFIG[unit].label.toLowerCase()} = ${multiplier} шт.` : "Количество считается поштучно"}</p>
                    <div className="quantity-control">
                      <button type="button" onClick={() => changeQuantity(product.id, -1)}>−</button>
                      <div className="quantity-input-wrap"><input className="quantity-input" type="number" min="0" value={quantity || ""} placeholder="0" onChange={(e) => setCart((current) => ({ ...current, [product.id]: Math.max(0, Number.parseInt(e.target.value, 10) || 0) }))} /><small>{UNIT_CONFIG[unit].shortLabel}</small></div>
                      <button type="button" onClick={() => changeQuantity(product.id, 1)}>+</button>
                    </div>
                  </article>
                );
              })}
              {!filtered.length && <div className="empty-box">Товары не найдены.</div>}
              {settings.allowCustomItems && <CustomItemForm onAdd={(item) => setCustomItems((current) => [...current, item])} />}
            </section>
          </div>

          <form className="order-summary" onSubmit={submit}>
            <h2>Ваш заказ</h2>
            {!selectedItems.length && !customItems.length ? <p className="summary-empty">Добавьте товар из каталога или запросите отсутствующую позицию.</p> : (
              <div className="summary-list">
                {selectedItems.map((item) => (
                  <div className="summary-item" key={item.productId}>
                    <span>{item.name}<small>{item.multiplier > 1 ? `${item.quantity * item.multiplier} шт. всего` : item.category}</small></span>
                    <strong>{item.quantity} {UNIT_CONFIG[item.unit].shortLabel}<small>{settings.showPrices && item.lineTotal > 0 ? formatMoney(item.lineTotal) : ""}</small></strong>
                  </div>
                ))}
                {customItems.map((item) => (
                  <div className="summary-item custom-line" key={item.id}>
                    <span>
                      {item.name}
                      <small>Товар вне матрицы · {item.details || "без уточнений"}</small>
                      <CustomRequestPhoto photo={item.photo} className="custom-request-photo-small" />
                    </span>
                    <strong>{item.quantity} {item.unit}<button className="danger-text" style={{ border: 0, background: "transparent", fontSize: 9 }} type="button" onClick={() => setCustomItems((current) => current.filter((value) => value.id !== item.id))}>Убрать</button></strong>
                  </div>
                ))}
              </div>
            )}

            <label className="field">Дата доставки
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} required />
            </label>
            <label className="field" style={{ marginTop: 10 }}>Адрес доставки
              <select value={addressId} onChange={(e) => setAddressId(e.target.value)} required>
                <option value="">Выберите адрес</option>
                {addresses.map((item) => <option value={item.id} key={item.id}>{item.label}{item.isDefault ? " — основной" : ""} · {item.address}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginTop: 10 }}>Комментарий к заказу
              <textarea rows="3" placeholder="Например: позвонить перед доставкой" value={clientComment} onChange={(e) => setClientComment(e.target.value)} />
            </label>
            <div className="summary-total"><span>Итого</span><strong>{settings.showPrices && total > 0 ? formatMoney(total) : `${selectedItems.length + customItems.length} поз.`}</strong></div>
            {settings.enableDrafts && session.mode === "new" && <p className="summary-note">Черновик автоматически сохраняется в этом браузере.</p>}
            <button className="save-order-button" type="submit">{session.mode === "edit" ? "Сохранить изменения" : "Оформить заказ"}</button>
          </form>
        </div>
      </section>
  );

  if (embedded) {
    return catalogBody;
  }

  return (
    <main className="clover-app">
      <Header title={session.mode === "edit" ? "Редактирование заказа" : session.mode === "repeat" ? "Повтор заказа" : "Новый заказ"}>
        <ManagerContact settings={settings} profile={profile} orders={orders} />
        <button className="header-button" type="button" onClick={onClose}>← В кабинет</button>
      </Header>
      {catalogBody}
    </main>
  );
}


function PasswordSecurityPanel() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", repeatPassword: "" });
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeys, setPasskeys] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadPasskeys = async () => {
    try {
      const result = await api.listPasskeys();
      setPasskeys(result.passkeys || []);
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => { loadPasskeys(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (form.newPassword !== form.repeatPassword) {
      setError("Новые пароли не совпадают.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.changePassword(form.currentPassword, form.newPassword);
      if (result.token) setApiToken(result.token);
      setMessage(result.message || "Пароль изменён.");
      setForm({ currentPassword: "", newPassword: "", repeatPassword: "" });
    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setBusy(false);
    }
  };

  const endOtherSessions = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.logoutOtherSessions();
      if (result.token) setApiToken(result.token);
      setMessage(result.message || "Другие сессии завершены.");
    } catch (sessionError) {
      setError(sessionError.message);
    } finally {
      setBusy(false);
    }
  };

  const addPasskey = async () => {
    setError("");
    setMessage("");
    if (!("PublicKeyCredential" in window)) {
      setError("Это устройство или браузер не поддерживает Face ID, отпечаток или ключи доступа.");
      return;
    }
    setPasskeyBusy(true);
    try {
      const ceremony = await api.getPasskeyRegistrationOptions();
      const response = await startPasskeyRegistration(ceremony.options);
      const result = await api.verifyPasskeyRegistration(ceremony.ceremonyId, response);
      setMessage(result.message || "Ключ доступа добавлен.");
      await loadPasskeys();
    } catch (registrationError) {
      setError(registrationError.message || "Не удалось добавить ключ доступа.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const removePasskey = async (credentialId) => {
    if (!window.confirm("Удалить этот ключ доступа? Вход по паролю останется доступен.")) return;
    setPasskeyBusy(true);
    setError("");
    try {
      await api.deletePasskey(credentialId);
      setMessage("Ключ доступа удалён.");
      await loadPasskeys();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setPasskeyBusy(false);
    }
  };

  return (
    <section className="panel compact-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Безопасность</p><h2>Пароль и вход по устройству</h2><p>Можно входить по паролю либо через Face ID, отпечаток или код блокировки телефона.</p></div>
      </div>
      <form className="form-grid security-form" onSubmit={submit}>
        <label className="field">Текущий пароль<input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required /></label>
        <label className="field">Новый пароль<input type="password" autoComplete="new-password" minLength="8" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} required /></label>
        <label className="field">Повторите новый пароль<input type="password" autoComplete="new-password" minLength="8" value={form.repeatPassword} onChange={(event) => setForm({ ...form, repeatPassword: event.target.value })} required /></label>
        <div className="form-actions"><button className="primary-button" disabled={busy} type="submit">{busy ? "Сохраняем…" : "Изменить пароль"}</button></div>
      </form>
      <div className="form-actions session-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={endOtherSessions}>
          Завершить другие сессии
        </button>
      </div>

      <div className="passkey-settings">
        <div>
          <h3>Face ID / отпечаток</h3>
          <p className="muted">Данные лица и отпечатка остаются только на устройстве. Clover получает лишь подтверждение входа.</p>
        </div>
        <button className="secondary-button" type="button" disabled={passkeyBusy} onClick={addPasskey}>
          {passkeyBusy ? "Подождите…" : passkeys.length ? "Добавить ещё устройство" : "Включить вход по устройству"}
        </button>
        <div className="passkey-list">
          {passkeys.map((item, index) => (
            <div className="passkey-row" key={item.id}>
              <div><strong>Ключ доступа {index + 1}</strong><span>{item.backedUp ? "Синхронизируется с аккаунтом устройства" : "Сохранён на этом устройстве"}</span></div>
              <button className="danger-button" type="button" disabled={passkeyBusy} onClick={() => removePasskey(item.id)}>Удалить</button>
            </div>
          ))}
          {!passkeys.length && <div className="empty-box">Ключи доступа пока не добавлены.</div>}
        </div>
      </div>

      {message && <div className="auth-success">{message}</div>}
      {error && <div className="auth-error">{error}</div>}
    </section>
  );
}

function reconciliationPeriodLabel(item) {
  const labels = { q1: "1 квартал", q2: "2 квартал", q3: "3 квартал", q4: "4 квартал", all: "За весь период", custom: "Определённый период" };
  if (item.periodType === "all") return labels.all;
  if (["q1", "q2", "q3", "q4"].includes(item.periodType)) return `${labels[item.periodType]} ${item.year || ""}`.trim();
  return `${item.dateFrom || "—"} — ${item.dateTo || "—"}`;
}

const RECONCILIATION_STATUS_LABELS = {
  new: "Новый запрос",
  processing: "Готовится",
  ready: "Готов",
  rejected: "Отклонён",
};

function ReconciliationPanel({ requests = [], onReload }) {
  const nowDate = new Date();
  const [periodType, setPeriodType] = useState(`q${Math.floor(nowDate.getMonth() / 3) + 1}`);
  const [year, setYear] = useState(nowDate.getFullYear());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api.createReconciliation({ periodType, year: Number(year), dateFrom, dateTo, comment });
      setComment("");
      setMessage("Запрос отправлен менеджеру.");
      await onReload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (item) => {
    try {
      const blob = await api.downloadReconciliationFile(item.id);
      downloadBlobFile(blob, item.fileName || `Акт-сверки-${item.id}.pdf`);
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <section className="panel" id="reconciliation">
      <div className="panel-heading"><div><p className="eyebrow">Документы</p><h2>Запросить акт сверки</h2><p>Выберите готовый период или укажите собственный диапазон дат.</p></div></div>
      <div className="period-buttons">
        {[['q1','1 квартал'],['q2','2 квартал'],['q3','3 квартал'],['q4','4 квартал'],['all','За весь период'],['custom','Определённый период']].map(([value,label]) => (
          <button className={periodType === value ? "category-button active" : "category-button"} type="button" key={value} onClick={() => setPeriodType(value)}>{label}</button>
        ))}
      </div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        {periodType !== "all" && periodType !== "custom" && <label className="field">Год<input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} /></label>}
        {periodType === "custom" && <><label className="field">Дата с<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="field">Дата по<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></>}
        <label className="field field-wide">Комментарий — необязательно<textarea rows="2" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: прошу отдельно проверить возвраты" /></label>
      </div>
      <div className="form-actions"><button className="primary-button" type="button" disabled={busy} onClick={submit}>{busy ? "Отправляем…" : "Отправить запрос"}</button></div>
      {message && <div className="request-photo-status">{message}</div>}
      <div className="reconciliation-list">
        {requests.length ? requests.map((item) => (
          <article className="reconciliation-row" key={item.id}>
            <div><span className={`badge ${item.status === "ready" ? "green" : item.status === "rejected" ? "red" : "yellow"}`}>{RECONCILIATION_STATUS_LABELS[item.status] || item.status}</span><h3>{reconciliationPeriodLabel(item)}</h3><p>{formatDateTime(item.createdAt)}{item.managerComment ? ` · ${item.managerComment}` : ""}</p></div>
            {item.hasFile && <button className="primary-button" type="button" onClick={() => download(item)}>Скачать PDF</button>}
          </article>
        )) : <div className="empty-box">Запросов актов сверки пока нет.</div>}
      </div>
    </section>
  );
}

function ManagerReconciliation({ requests = [], onReload }) {
  const [busyId, setBusyId] = useState("");
  const [comments, setComments] = useState({});

  const update = async (item, status) => {
    setBusyId(item.id);
    try {
      await api.updateReconciliation(item.id, { status, managerComment: comments[item.id] ?? item.managerComment ?? "" });
      await onReload();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusyId("");
    }
  };

  const upload = async (item, file) => {
    if (!file) return;
    setBusyId(item.id);
    try {
      await api.uploadReconciliationFile(item.id, file, comments[item.id] ?? item.managerComment ?? "");
      await onReload();
    } catch (error) {
      alert(error.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading"><div><p className="eyebrow">Документы</p><h2>Запросы актов сверки</h2><p>Подготовьте акт в 1С, прикрепите PDF и клиент получит уведомление.</p></div></div>
      <div className="reconciliation-list">
        {requests.length ? requests.map((item) => (
          <article className="manager-reconciliation-row" key={item.id}>
            <div><span className={`badge ${item.status === "ready" ? "green" : item.status === "rejected" ? "red" : "yellow"}`}>{RECONCILIATION_STATUS_LABELS[item.status] || item.status}</span><h3>{item.client?.companyName || item.client?.email || "Клиент"}</h3><p>{reconciliationPeriodLabel(item)} · {formatDateTime(item.createdAt)}</p>{item.clientComment && <p>Комментарий клиента: {item.clientComment}</p>}</div>
            <label className="field">Комментарий менеджера<input value={comments[item.id] ?? item.managerComment ?? ""} onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
            <div className="inline-actions">
              <button className="secondary-button" type="button" disabled={busyId === item.id} onClick={() => update(item, "processing")}>В работу</button>
              <label className="import-label">Прикрепить PDF<input type="file" accept="application/pdf" disabled={busyId === item.id} onChange={(event) => upload(item, event.target.files?.[0])} /></label>
              <button className="danger-button" type="button" disabled={busyId === item.id} onClick={() => update(item, "rejected")}>Отклонить</button>
            </div>
          </article>
        )) : <div className="empty-box">Новых запросов актов сверки нет.</div>}
      </div>
    </section>
  );
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function PushSettings() {
  const [status, setStatus] = useState(null);
  const [currentEndpoint, setCurrentEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [promotions, setPromotions] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const result = await api.getPushStatus();
      setStatus(result);
      let endpoint = "";
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await navigator.serviceWorker.ready;
        const browserSubscription = await registration.pushManager.getSubscription();
        endpoint = browserSubscription?.endpoint || "";
      }
      setCurrentEndpoint(endpoint);
      const saved = (result.subscriptions || []).find((item) => item.endpoint === endpoint);
      setPromotions(Boolean(saved?.promotions));
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => { load(); }, []);

  const enable = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (!status?.enabled) throw new Error("Push будет доступен после настройки домена, HTTPS и VAPID-ключей.");
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Этот браузер не поддерживает push-уведомления.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Разрешение на уведомления не предоставлено.");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(status.publicKey) });
      }
      await api.subscribePush(subscription.toJSON(), { orderEvents: true, promotions });
      setMessage(currentEndpoint ? "Настройки уведомлений сохранены." : "Уведомления включены на этом устройстве.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setCurrentEndpoint("");
      setMessage("Уведомления отключены на этом устройстве.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const subscribed = Boolean(currentEndpoint && status?.subscriptions?.some((item) => item.endpoint === currentEndpoint));
  return (
    <section className="panel compact-panel">
      <div className="panel-heading"><div><p className="eyebrow">Уведомления</p><h2>Уведомления на телефоне</h2><p>Статусы заказов и документы — основные; акции можно отключить отдельно.</p></div></div>
      <label className="checkbox-line"><input type="checkbox" checked={promotions} onChange={(event) => setPromotions(event.target.checked)} /> Получать акции и новинки</label>
      <div className="inline-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={enable}>{busy ? "Сохраняем…" : subscribed ? "Сохранить настройки" : "Включить уведомления"}</button>
        {subscribed && <button className="secondary-button" type="button" disabled={busy} onClick={disable}>Отключить на этом устройстве</button>}
      </div>
      {!status?.enabled && <p className="muted small">Техническая часть подготовлена. Фактическая отправка включится после домена, HTTPS и добавления VAPID-ключей.</p>}
      {status?.subscriptions?.length > 0 && !subscribed && <p className="muted small">Уведомления уже включены на другом устройстве. На этом телефоне или компьютере их можно включить отдельно.</p>}
      {message && <div className="request-photo-status">{message}</div>}
    </section>
  );
}

function ManagerPromotionPanel() {
  const [title, setTitle] = useState("Новость Clover");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const result = await api.sendPromotion(title, body);
      alert(result.result?.enabled ? `Отправлено: ${result.result.sent}` : "Push пока не настроен на сервере.");
      setBody("");
    } catch (error) { alert(error.message); } finally { setBusy(false); }
  };
  return (
    <div className="manager-contact-settings">
      <h3>Push-уведомление об акции или новинке</h3>
      <div className="form-grid"><label className="field">Заголовок<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field field-wide">Текст<textarea rows="3" value={body} onChange={(event) => setBody(event.target.value)} /></label></div>
      <div className="form-actions"><button className="primary-button" type="button" disabled={busy || !body.trim()} onClick={send}>Отправить подписанным клиентам</button></div>
    </div>
  );
}

function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone;

  useEffect(() => {
    const handler = (event) => { event.preventDefault(); setPromptEvent(event); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (standalone || dismissed || (!promptEvent && !isIos)) return null;
  const install = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setPromptEvent(null);
    } else {
      alert("На iPhone откройте меню «Поделиться» в Safari и выберите «На экран Домой». Затем включите «Открыть как веб-приложение».");
    }
  };
  return <div className="install-prompt"><div><strong>Установить Clover</strong><span>{isIos && !promptEvent ? "Добавьте ярлык на экран iPhone" : "Открывайте как обычное приложение"}</span></div><button type="button" onClick={install}>Установить</button><button className="install-close" type="button" onClick={() => setDismissed(true)}>×</button></div>;
}

function ClientMatrixPanel({
  products = [],
  settings,
  catalogPolicy,
  favorites = [],
  setFavorites,
  onCreateOrder,
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const activeProducts = useMemo(
    () => (Array.isArray(products) ? products : []).filter((item) => item.active !== false),
    [products]
  );

  const categories = useMemo(
    () => ["Все", ...new Set(activeProducts.map((item) => item.category).filter(Boolean))],
    [activeProducts]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return activeProducts.filter((item) => {
      const byCategory = category === "Все" || item.category === category;
      const bySearch =
        !needle ||
        String(item.name || "").toLowerCase().includes(needle) ||
        String(item.code || "").toLowerCase().includes(needle);
      const byFavorite = !favoritesOnly || favorites.includes(item.id);
      return byCategory && bySearch && byFavorite;
    });
  }, [activeProducts, search, category, favoritesOnly, favorites]);

  useEffect(() => {
    if (category !== "Все" && !categories.includes(category)) {
      setCategory("Все");
    }
  }, [categories, category]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Персональный каталог</p>
          <h2>Матрица товаров</h2>
          <p>Товары, закреплённые за вами менеджером. Категории — как при оформлении заказа.</p>
        </div>
        <button className="primary-button" type="button" onClick={onCreateOrder}>
          + Новый заказ
        </button>
      </div>

      {catalogPolicy?.matrixMode === "pending" ? (
        <div className="matrix-catalog-note pending">
          <strong>Матрица ещё готовится</strong>
          <br />
          Менеджер закрепит постоянные товары и цены. Пока список может быть пустым.
        </div>
      ) : (
        <p className="client-matrix-meta">
          В матрице: <strong>{activeProducts.length}</strong> поз.
          {category !== "Все" ? ` · категория «${category}»: ${filtered.length}` : ""}
        </p>
      )}

      <div className="client-matrix-toolbar">
        <div className="catalog-filter-row">
          <input
            className="catalog-search"
            type="search"
            placeholder="Поиск по названию или коду"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {settings.showFavorites && (
            <button
              className={favoritesOnly ? "category-button active" : "category-button"}
              type="button"
              onClick={() => setFavoritesOnly((value) => !value)}
            >
              ★ Избранное
            </button>
          )}
        </div>
        <div className="category-list">
          {categories.map((item) => (
            <button
              className={category === item ? "category-button active" : "category-button"}
              type="button"
              key={item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <section className="product-grid">
        {filtered.map((product) => {
          const unit = product.saleUnits?.[0] || "piece";
          const price = getUnitPrice(product, unit);
          const multiplier = getUnitMultiplier(product, unit);
          return (
            <article className="product-card" key={product.id}>
              <div className="product-card-top">
                <span className="product-category">{product.category || "Без категории"}</span>
                {settings.showFavorites && (
                  <button
                    className={favorites.includes(product.id) ? "favorite-button active" : "favorite-button"}
                    type="button"
                    onClick={() =>
                      setFavorites((current) =>
                        current.includes(product.id)
                          ? current.filter((id) => id !== product.id)
                          : [...current, product.id]
                      )
                    }
                  >
                    ★
                  </button>
                )}
              </div>
              <div className="product-image-wrap">
                {product.imageUrl ? (
                  <img className="product-image" src={product.imageUrl} alt={product.name} />
                ) : (
                  <span className="product-image-placeholder">Фото товара пока не загружено</span>
                )}
              </div>
              <h2>{product.name}</h2>
              <p className="product-code">Код: {product.code || "—"}</p>
              <p className="product-price">
                {settings.showPrices && price > 0 ? (
                  <>
                    {formatMoney(price)} <small>/ {UNIT_CONFIG[unit]?.shortLabel || unit}</small>
                  </>
                ) : (
                  "Цена уточняется"
                )}
              </p>
              <div className="unit-choice">
                {UNIT_ORDER.filter((item) => (product.saleUnits || []).includes(item)).map((item) => (
                  <span className="category-button" key={item} style={{ cursor: "default" }}>
                    {UNIT_CONFIG[item].label}
                  </span>
                ))}
              </div>
              <p className="unit-hint">
                {multiplier > 1
                  ? `1 ${UNIT_CONFIG[unit].label.toLowerCase()} = ${multiplier} шт.`
                  : "Количество считается поштучно"}
              </p>
            </article>
          );
        })}
        {!filtered.length && (
          <div className="empty-box">
            {activeProducts.length
              ? "В этой категории товаров нет."
              : "В вашей матрице пока нет товаров."}
          </div>
        )}
      </section>
    </section>
  );
}

function ClientDashboard({
  profile,
  setProfile,
  addresses,
  setAddresses,
  orders,
  settings,
  catalogPolicy,
  matrixProductCount,
  fullCatalogCount,
  reconciliationRequests,
  onReload,
  onNew,
  onEdit,
  onRepeat,
  onDelete,
  onLogout,
  catalogSession,
  products,
  matrixProducts,
  favorites,
  setFavorites,
  showFullCatalog,
  setShowFullCatalog,
  onSaveOrder,
  onCloseCatalog,
  canCreateOrder,
  profileComplete,
}) {
  const [tab, setTab] = useState(() => readClientActiveTab());
  const [filter, setFilter] = useState("Все");
  const visibleOrders = orders.filter((order) => filter === "Все" || order.status === filter);
  const active = orders.filter((order) => !["Выполнен", "Отменён"].includes(order.status));
  const nextOrder = [...active].sort((a, b) => String(a.firstDeliveryDate).localeCompare(String(b.firstDeliveryDate)))[0];
  const orderSession = catalogSession || { mode: "new" };
  const orderEditorKey = `${orderSession.mode}-${orderSession.order?.id || "new"}`;

  const selectTab = (id) => {
    setTab(id);
    writeClientActiveTab(id);
    if (id === "home") {
      onNew?.({ silent: true });
    }
  };

  useEffect(() => {
    if (catalogSession && (catalogSession.mode === "edit" || catalogSession.mode === "repeat")) {
      setTab("home");
      writeClientActiveTab("home");
    }
  }, [catalogSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    const orderId = params.get("order");
    const mapped = orderId ? "orders" : clientTabFromSection(section);
    if (mapped) {
      setTab(mapped);
      writeClientActiveTab(mapped);
    }
    const targetId = orderId ? `order-${orderId}` : section === "reconciliation" ? "reconciliation" : "";
    if (!targetId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [orders.length]);

  return (
    <main className="clover-app">
      <Header title={profile.contactName ? `Здравствуйте, ${profile.contactName}!` : "Личный кабинет клиента"} subtitle={profile.companyName} onLogout={onLogout}>
        <ManagerContact settings={settings} />
      </Header>
      <section className="page-content">
        <nav className="client-nav" aria-label="Разделы кабинета">
          {CLIENT_TABS.map(([id, label]) => (
            <button
              className={tab === id ? "active" : ""}
              type="button"
              key={id}
              onClick={() => selectTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "home" && (
          <>
            <div className="stats-grid">
              <article className="stat-card"><span>Ближайшая доставка</span><strong>{nextOrder ? formatDate(nextOrder.firstDeliveryDate) : "—"}</strong></article>
              <article className="stat-card"><span>Активные заказы</span><strong>{active.length}</strong></article>
              <article className="stat-card"><span>Выполнено</span><strong>{orders.filter((item) => item.status === "Выполнен").length}</strong></article>
              <article className="stat-card"><span>Всего заказов</span><strong>{orders.length}</strong></article>
            </div>

            <div
              className={
                catalogPolicy.matrixMode === "pending"
                  ? "matrix-catalog-note pending"
                  : "matrix-catalog-note"
              }
            >
              {catalogPolicy.matrixMode === "pending" ? (
                <>
                  <strong>Персональная матрица подготавливается</strong>
                  <br />
                  Менеджер закрепит ваши постоянные товары и цены.
                  Заказ отсутствующей позиции уже можно отправить через
                  каталог.
                </>
              ) : (
                <>
                  <strong>Ваш персональный каталог готов</strong>
                  <br />
                  Постоянных позиций: {matrixProductCount}.
                  {catalogPolicy.allowFullCatalog &&
                    ` Доступен также весь каталог: ${fullCatalogCount} позиций.`}
                </>
              )}
            </div>

            {!canCreateOrder && (
              <div className="warning-box client-home-gate">
                {!profileComplete && settings.requireProfile && (
                  <p>
                    Сначала заполните профиль организации во вкладке{" "}
                    <button className="linkish" type="button" onClick={() => selectTab("settings")}>Настройки</button>.
                  </p>
                )}
                {settings.requireAddress && !addresses.length && (
                  <p>
                    Добавьте адрес доставки во вкладке{" "}
                    <button className="linkish" type="button" onClick={() => selectTab("addresses")}>Мои адреса</button>.
                  </p>
                )}
              </div>
            )}

            {canCreateOrder ? (
              <OrderEditor
                key={orderEditorKey}
                embedded
                session={orderSession}
                products={products}
                addresses={addresses}
                favorites={favorites}
                setFavorites={setFavorites}
                settings={settings}
                profile={profile}
                orders={orders}
                catalogPolicy={catalogPolicy}
                showFullCatalog={showFullCatalog}
                setShowFullCatalog={setShowFullCatalog}
                onClose={onCloseCatalog}
                onSave={(payload) => {
                  onSaveOrder(payload);
                  setTab("orders");
                  writeClientActiveTab("orders");
                }}
              />
            ) : (
              <div className="empty-box">Оформление заказа станет доступно после заполнения обязательных данных.</div>
            )}
          </>
        )}

        {tab === "matrix" && (
          <ClientMatrixPanel
            products={matrixProducts}
            settings={settings}
            catalogPolicy={catalogPolicy}
            favorites={favorites}
            setFavorites={setFavorites}
            onCreateOrder={() => {
              onNew({ forceNew: true });
              setTab("home");
              writeClientActiveTab("home");
            }}
          />
        )}

        {tab === "orders" && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">История</p>
                <h2>Мои заказы</h2>
                <p>Статусы и комментарии менеджера обновляются в карточке заказа.</p>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  onNew({ forceNew: true });
                  setTab("home");
                  writeClientActiveTab("home");
                }}
              >
                + Новый заказ
              </button>
            </div>
            <div className="category-list" style={{ marginBottom: 18 }}>
              {["Все", ...ORDER_STATUSES].map((status) => <button className={filter === status ? "category-button active" : "category-button"} type="button" key={status} onClick={() => setFilter(status)}>{status}</button>)}
            </div>

            {visibleOrders.length ? <div className="order-list">
              {visibleOrders.map((order) => {
                const total = getOrderTotal(order);
                const canEdit = settings.allowClientEdit && order.status === "Новый";
                const canDelete = settings.allowClientDelete && order.status === "Новый";
                return (
                  <article className="order-card" id={`order-${order.id}`} key={order.id}>
                    <div className="order-card-header">
                      <div><span className={`badge ${statusClass(order.status)}`}>{order.status}</span><h3>Заказ № {order.number}</h3><p>Создан: {formatDateTime(order.createdAt)}</p></div>
                      <div className="nowrap"><strong className="success-text">{settings.showPrices && total > 0 ? formatMoney(total) : `${getPositionCount(order)} поз.`}</strong></div>
                    </div>
                    <div className="order-meta">
                      <div><span>Дата доставки</span><strong>{formatDate(order.firstDeliveryDate)}</strong></div>
                      <div><span>Адрес</span><strong>{order.address}</strong></div>
                      <div><span>Позиций</span><strong>{getPositionCount(order)}</strong></div>
                      <div><span>Обновлён</span><strong>{formatDateTime(order.updatedAt || order.createdAt)}</strong></div>
                    </div>
                    <details className="order-details">
                      <summary>Посмотреть состав заказа</summary>
                      <div className="order-products">
                        {(order.items || []).map((item) => <div className="order-product" key={`${order.id}-${item.productId ?? item.id}`}><span>{item.name}<small>{item.code || item.category}</small></span><strong>{item.quantity} {UNIT_CONFIG[item.unit]?.shortLabel || item.unit}<small>{item.multiplier > 1 ? `${item.quantity * item.multiplier} шт. всего` : ""}</small></strong></div>)}
                        {(order.customItems || []).map((item) => (
                          <div className="order-product custom-line custom-request-order-row" key={`${order.id}-${item.id}`}>
                            <CustomRequestPhoto photo={item.photo} className="custom-request-photo-order" />
                            <span><span className="badge yellow">{item.requestStatus || "Новый запрос"}</span>{item.name}<small>{item.details}</small>{item.managerComment && <small>Менеджер: {item.managerComment}</small>}</span>
                            <strong>{item.quantity} {item.unit}<small>{Number(item.unitPrice) > 0 ? formatMoney(Number(item.unitPrice) * item.quantity) : "Цена уточняется"}</small></strong>
                          </div>
                        ))}
                      </div>
                      {(order.clientComment || order.managerComment) && <div className="order-comments">{order.clientComment && <div className="comment-box"><strong>Ваш комментарий</strong><p>{order.clientComment}</p></div>}{order.managerComment && <div className="comment-box"><strong>Комментарий менеджера</strong><p>{order.managerComment}</p></div>}</div>}<OrderTimeline order={order} />
                    </details>
                    <div className="client-order-actions">
                      {canEdit && <button className="secondary-button" type="button" onClick={() => onEdit(order)}>Редактировать</button>}
                      {settings.allowRepeatOrder && <button className="secondary-button" type="button" onClick={() => onRepeat(order)}>Повторить заказ</button>}
                      <button className="secondary-button" type="button" onClick={() => window.print()}>Печать</button>
                      {canDelete && <button className="danger-button" type="button" onClick={() => onDelete(order)}>Удалить</button>}
                    </div>
                  </article>
                );
              })}
            </div> : <div className="empty-box">Заказов с таким статусом пока нет.</div>}
          </section>
        )}

        {tab === "acts" && (
          <ReconciliationPanel requests={reconciliationRequests} onReload={onReload} />
        )}

        {tab === "addresses" && (
          <AddressesPanel addresses={addresses} onChange={setAddresses} />
        )}

        {tab === "settings" && (
          <div className="client-settings-stack">
            <ProfilePanel profile={profile} onChange={setProfile} />
            <PushSettings />
            <PasswordSecurityPanel />
          </div>
        )}
      </section>
    </main>
  );
}

function ManagerOrders({ orders, settings, onUpdateOrder, onBulkUpdateOrders, onDeleteOrder, onCreateProductFromCustom, onReload }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Все");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("Принят");
  const [bulkBusy, setBulkBusy] = useState(false);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...orders].filter((order) => {
      const exchange = normalizeOrderExchange(order.exchange);
      const haystack = `${order.number} ${order.externalId || ""} ${order.customerName} ${order.customerContact} ${order.customerPhone} ${order.customerEmail} ${order.address}`.toLowerCase();
      return (!needle || haystack.includes(needle))
        && (status === "Все" || order.status === status)
        && (exchangeFilter === "all" || exchange.status === exchangeFilter);
    }).sort((a, b) => {
      if (sort === "delivery") return String(a.firstDeliveryDate).localeCompare(String(b.firstDeliveryDate));
      if (sort === "oldest") return String(a.createdAt).localeCompare(String(b.createdAt));
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }, [orders, search, status, exchangeFilter, sort]);

  const runExchangeAction = async (order, action) => {
    setBusyOrderId(order.id);
    try {
      if (action === "check") {
        const result = await api.checkExchangeOrder(order.id);
        alert(result.validation?.ready
          ? "Проверка пройдена. Для отправки нажмите «Передать в 1С TEST»."
          : (result.validation?.issues || []).join("\n"));
      } else if (action === "send") {
        const result = await api.sendExchangeOrder(order.id);
        alert(result.exchange?.message || "Тестовая передача выполнена.");
      } else if (action === "reset") {
        await api.resetExchangeOrder(order.id);
      }
      await onReload();
    } catch (error) {
      alert(error.message);
      await onReload();
    } finally {
      setBusyOrderId("");
    }
  };

  const downloadOrder = async (order, format) => {
    setBusyOrderId(order.id);
    try {
      const blob = await api.downloadExchangeOrder(order.id, format);
      downloadBlobFile(blob, `clover-order-${order.number || order.id}-1c.${format}`);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusyOrderId("");
    }
  };

  const toggleSelected = (orderId) => {
    setSelectedIds((current) =>
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId]
    );
  };

  const selectVisible = () => {
    const visibleIds = visible.map((order) => order.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])]
    );
  };

  const applyBulkStatus = () => {
    if (!selectedIds.length) return;
    onBulkUpdateOrders(selectedIds, { status: bulkStatus });
    setSelectedIds([]);
  };

  const runBulkExchange = async (action) => {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    const errors = [];
    try {
      for (const orderId of selectedIds) {
        try {
          if (action === "check") await api.checkExchangeOrder(orderId);
          if (action === "send") {
            await api.checkExchangeOrder(orderId);
            await api.sendExchangeOrder(orderId);
          }
        } catch (error) {
          errors.push(error.message);
        }
      }
      await onReload();
      if (errors.length) {
        alert(`Не все заказы обработаны:\n${errors.join("\n")}`);
      }
      setSelectedIds([]);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <section>
      <div className="toolbar four">
        <input type="search" placeholder="Поиск по заказу, клиенту, телефону или ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option>Все</option>{ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={exchangeFilter} onChange={(e) => setExchangeFilter(e.target.value)}><option value="all">Все статусы 1С</option>{Object.entries(EXCHANGE_STATUS_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="delivery">По дате доставки</option></select>
      </div>
      <div className="panel" style={{ marginTop: 14, marginBottom: 18, padding: 16 }}>
        <div className="toolbar four">
          <button className="secondary-button" type="button" onClick={selectVisible}>
            {visible.length > 0 && visible.every((order) => selectedIds.includes(order.id))
              ? "Снять выбор с видимых"
              : "Выбрать все видимые"}
          </button>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button className="primary-button" type="button" disabled={!selectedIds.length || bulkBusy} onClick={applyBulkStatus}>
            Изменить статус ({selectedIds.length})
          </button>
          <button className="secondary-button" type="button" disabled={!selectedIds.length || bulkBusy} onClick={() => runBulkExchange("check")}>
            Проверить выбранные в 1С
          </button>
        </div>
        <div className="exchange-actions" style={{ marginTop: 10 }}>
          <button className="secondary-button" type="button" disabled={!selectedIds.length || bulkBusy} onClick={() => runBulkExchange("send")}>
            Тестово передать выбранные
          </button>
          {selectedIds.length > 0 && <button className="secondary-button" type="button" onClick={() => setSelectedIds([])}>Очистить выбор</button>}
          <span className="muted small">Выбрано заказов: {selectedIds.length}</span>
        </div>
      </div>

      {visible.length ? <div className="manager-grid">{visible.map((order) => {
        const exchange = normalizeOrderExchange(order.exchange);
        const busy = busyOrderId === order.id;
        return (
        <article className="order-card" key={order.id}>
          <div className="order-card-header">
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <input
                type="checkbox"
                checked={selectedIds.includes(order.id)}
                onChange={() => toggleSelected(order.id)}
                aria-label={`Выбрать заказ ${order.number}`}
              />
            </label>
            <div>
              <div className="exchange-status-line"><span className={`badge ${statusClass(order.status)}`}>{order.status}</span><span className={`badge ${exchangeBadgeClass(exchange.status)}`}>1С: {EXCHANGE_STATUS_LABELS[exchange.status]}</span></div>
              <h3>Заказ № {order.number} · {order.customerName || "Клиент"}</h3>
              <p>{order.customerContact} · {order.customerPhone} · {order.customerEmail}</p>
              <p className="small">Внешний ID: {order.externalId || order.id}</p>
              {exchange.message && <div className="exchange-message">{exchange.message}{exchange.receipt ? ` · квитанция ${exchange.receipt}` : ""}</div>}
            </div>
            <strong className="success-text">{settings.showPrices && getOrderTotal(order) > 0 ? formatMoney(getOrderTotal(order)) : `${getPositionCount(order)} поз.`}</strong>
          </div>
          <div className="order-meta">
            <div><span>Доставка</span><strong>{formatDate(order.firstDeliveryDate)}</strong></div>
            <div><span>Адрес</span><strong>{order.address}</strong></div>
            <div><span>Попыток 1С</span><strong>{exchange.attempts}</strong></div>
            <div><span>Создан</span><strong>{formatDateTime(order.createdAt)}</strong></div>
          </div>
          <div className="manager-order-controls">
            <label className="field">Статус заказа
              <select value={order.status} onChange={(e) => onUpdateOrder(order.id, { status: e.target.value, updatedAt: new Date().toISOString() })}>{ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <div className="exchange-actions" style={{ alignSelf: "end" }}>
              <button className="secondary-button" disabled={busy} type="button" onClick={() => runExchangeAction(order, "check")}>Проверить 1С</button>
              <button className="primary-button" disabled={busy} type="button" onClick={() => runExchangeAction(order, "send")}>{exchange.status === "ready" ? "Обновить очередь" : exchange.status === "sent" || exchange.status === "error" ? "Передать повторно" : "Передать в 1С TEST"}</button>
              <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOrder(order, "json")}>JSON</button>
              <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOrder(order, "csv")}>CSV</button>
              <button className="secondary-button" type="button" onClick={() => printOrderDocument(order, settings)}>Печать</button>
              {exchange.status !== "not_sent" && <button className="secondary-button" disabled={busy} type="button" onClick={() => runExchangeAction(order, "reset")}>Сбросить 1С</button>}
              {settings.managerCanDeleteOrders && <button className="danger-button" type="button" onClick={() => onDeleteOrder(order)}>Удалить</button>}
            </div>
          </div>
          <details className="order-details" open={false}>
            <summary>Состав и обработка заказа</summary>
            <div className="order-products">
              {(order.items || []).map((item) => <div className="order-product" key={`${order.id}-${item.productId ?? item.id}`}><span>{item.name}<small>{item.code || item.category} · ID 1С: {item.oneCId || "проверяется по каталогу"}</small></span><strong>{item.quantity} {UNIT_CONFIG[item.unit]?.shortLabel || item.unit}<small>{settings.showPrices && item.lineTotal > 0 ? formatMoney(item.lineTotal) : item.multiplier > 1 ? `${item.quantity * item.multiplier} шт. всего` : ""}</small></strong></div>)}
              {(order.customItems || []).map((item) => (
                <div className="custom-line" key={`${order.id}-${item.id}`}>
                  <div className="order-product" style={{ border: 0, paddingTop: 0 }}><span><span className="badge yellow">Товар вне матрицы</span>{item.name}<small>{item.details}</small></span><strong>{item.quantity} {item.unit}<small>{Number(item.unitPrice) > 0 ? formatMoney(item.unitPrice * item.quantity) : "Цена уточняется"}</small></strong></div>
                  {item.photo?.dataUrl && (
                    <div className="manager-request-photo-block">
                      <strong>Фотография клиента</strong>
                      <CustomRequestPhoto photo={item.photo} className="custom-request-photo-manager" />
                    </div>
                  )}
                  <div className="form-grid">
                    <label className="field">Статус запроса
                      <select value={item.requestStatus || "Новый запрос"} onChange={(e) => onUpdateOrder(order.id, { customItems: order.customItems.map((value) => value.id === item.id ? { ...value, requestStatus: e.target.value } : value) })}>{CUSTOM_STATUSES.map((value) => <option key={value}>{value}</option>)}</select>
                    </label>
                    <label className="field">Цена за указанную единицу
                      <input type="number" min="0" step="0.01" value={item.unitPrice || ""} onFocus={selectDefaultNumber} onChange={(e) => onUpdateOrder(order.id, { customItems: order.customItems.map((value) => value.id === item.id ? { ...value, unitPrice: Number(e.target.value) || 0 } : value) })} />
                    </label>
                    <label className="field">Комментарий клиенту
                      <input value={item.managerComment || ""} onChange={(e) => onUpdateOrder(order.id, { customItems: order.customItems.map((value) => value.id === item.id ? { ...value, managerComment: e.target.value } : value) })} />
                    </label>
                    <div className="field"><span>Действие</span><button className="primary-button" type="button" onClick={() => onCreateProductFromCustom(order, item)}>Создать товар в каталоге</button></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="manager-textareas">
              <label className="field">Комментарий клиенту
                <textarea value={order.managerComment || ""} onChange={(e) => onUpdateOrder(order.id, { managerComment: e.target.value, updatedAt: new Date().toISOString() })} />
              </label>
              <label className="field">Внутренняя заметка менеджера
                <textarea value={order.internalNote || ""} onChange={(e) => onUpdateOrder(order.id, { internalNote: e.target.value })} />
              </label>
            </div>
            <OrderTimeline order={order} />
          </details>
        </article>
      );})}</div> : <div className="empty-box">Заказы не найдены.</div>}
    </section>
  );
}

function OneCClientPicker({ client, link, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(client.companyName || "");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCandidates = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const candidates = await api.getOneCClientCandidates(client.id);
      if ((candidates.items || []).length) {
        setItems(candidates.items || []);
        return;
      }
      const result = await api.getOneCClients({ search: client.companyName || "", limit: 30 });
      setItems(result.items || []);
    } catch (loadError) {
      setError(loadError.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const runSearch = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getOneCClients({ search, limit: 50 });
      setItems(result.items || []);
    } catch (searchError) {
      setError(searchError.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const selectClient = async (item) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.linkOneCClient(client.id, item.id, item);
      onChange(result.clientLink || {});
      setOpen(false);
    } catch (selectError) {
      setError(selectError.message);
    } finally {
      setLoading(false);
    }
  };

  const clearLink = () => {
    onChange({
      matched1C: false,
      oneCId: "",
      oneCCode: "",
      oneCName: "",
      oneCInn: "",
      oneCLinkMode: "manual-cleared",
      oneCLinkedAt: "",
    });
  };

  return (
    <div className="one-c-client-picker">
      <div className="one-c-link-editor-head">
        <div>
          <span className={link.oneCId ? "badge green" : "badge yellow"}>
            {link.oneCId ? "Связан с 1С" : "Будет определён при заказе"}
          </span>
          <p className="muted small" style={{ marginTop: 8 }}>
            {link.oneCId
              ? `${link.oneCName || "Контрагент 1С"} · ${link.oneCCode || "без кода"}`
              : "Clover передаст название, телефон и email. Если 1С вернёт ID контрагента, связь сохранится автоматически."}
          </p>
        </div>
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={loadCandidates}>
            {link.oneCId ? "Изменить контрагента" : "Выбрать контрагента 1С"}
          </button>
          {link.oneCId && (
            <button className="secondary-button" type="button" onClick={clearLink}>Убрать связь</button>
          )}
        </div>
      </div>

      {open && (
        <div className="one-c-picker">
          <div className="one-c-products-search">
            <input
              type="search"
              value={search}
              placeholder="Название, ИНН, телефон, email или код"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
            />
            <button className="secondary-button" type="button" disabled={loading} onClick={runSearch}>
              {loading ? "Поиск..." : "Найти"}
            </button>
            <button className="secondary-button" type="button" onClick={() => setOpen(false)}>Закрыть</button>
          </div>
          {error && <div className="sync-error">{error}</div>}
          <div className="one-c-products-list one-c-picker-list">
            {items.map((item) => {
              const linkedToCurrent = item.cloverLink && String(item.cloverLink.clientId) === String(client.id);
              const linkedElsewhere = item.cloverLink && !linkedToCurrent;
              return (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>Код: {item.code || "—"} · ИНН: {item.inn || "—"}</span>
                    {(item.phone || item.email) && <span>{item.phone || ""} {item.email || ""}</span>}
                    {Number(item.score) > 0 && <span className="muted small">Совпадение: {Math.round(Number(item.score) * 100)}%</span>}
                    {linkedElsewhere && <span className="warning-text">Уже связан с клиентом Clover: {item.cloverLink.clientName}</span>}
                  </div>
                  <button
                    className={linkedToCurrent ? "secondary-button" : "primary-button"}
                    type="button"
                    disabled={loading || Boolean(linkedElsewhere)}
                    onClick={() => selectClient(item)}
                  >
                    {linkedToCurrent ? "Выбрано" : linkedElsewhere ? "Уже связан" : "Выбрать"}
                  </button>
                </article>
              );
            })}
            {!loading && !items.length && (
              <div className="empty-box">
                Контрагент ещё не загружен. Заказ всё равно передаст данные клиента в 1С, а точная связь сохранится автоматически после подтверждения 1С.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeManagerClientAddresses(addresses = []) {
  const normalized = (Array.isArray(addresses) ? addresses : [])
    .map((item, index) => {
      if (typeof item === "string") {
        const address = item.trim();
        if (!address) return null;
        return {
          id: `legacy-address-${index}`,
          label: index === 0 ? "Основной адрес" : `Адрес ${index + 1}`,
          address,
          isDefault: index === 0,
        };
      }

      const address = String(item?.address || "").trim();
      if (!address) return null;

      return {
        id: String(item?.id || `address-${index}`),
        label: String(item?.label || `Адрес ${index + 1}`).trim(),
        address,
        isDefault: Boolean(item?.isDefault),
      };
    })
    .filter(Boolean);

  if (normalized.length && !normalized.some((item) => item.isDefault)) {
    normalized[0] = { ...normalized[0], isDefault: true };
  }

  let defaultFound = false;
  return normalized.map((item) => {
    if (!item.isDefault) return item;
    if (defaultFound) return { ...item, isDefault: false };
    defaultFound = true;
    return item;
  });
}

function createManagerClientForm(client) {
  return {
    companyName: client.companyName || "",
    contactName: client.contactName || "",
    phone: client.phone || "",
    email: client.email || "",
    managerNote: client.managerNote || "",
    addresses: normalizeManagerClientAddresses(client.addresses),
  };
}

function ManagerClientEditor({ client, onReload }) {
  const [form, setForm] = useState(() => createManagerClientForm(client));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const clientVersion = JSON.stringify({
    id: client.id,
    companyName: client.companyName || "",
    contactName: client.contactName || "",
    phone: client.phone || "",
    email: client.email || "",
    managerNote: client.managerNote || "",
    addresses: normalizeManagerClientAddresses(client.addresses),
  });

  useEffect(() => {
    setForm(createManagerClientForm(client));
  }, [clientVersion]);

  const setProfileField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  };

  const updateAddress = (addressId, patch) => {
    setForm((current) => ({
      ...current,
      addresses: current.addresses.map((item) => {
        if (patch.isDefault === true) {
          return item.id === addressId
            ? { ...item, ...patch, isDefault: true }
            : { ...item, isDefault: false };
        }
        return item.id === addressId ? { ...item, ...patch } : item;
      }),
    }));
    setMessage("");
    setError("");
  };

  const addAddress = () => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `address-${Date.now()}`;
    setForm((current) => ({
      ...current,
      addresses: [
        ...current.addresses,
        {
          id,
          label: "",
          address: "",
          isDefault: current.addresses.length === 0,
        },
      ],
    }));
    setMessage("");
    setError("");
  };

  const removeAddress = (addressId) => {
    setForm((current) => {
      const removed = current.addresses.find((item) => item.id === addressId);
      const addresses = current.addresses.filter((item) => item.id !== addressId);
      if (removed?.isDefault && addresses.length) {
        addresses[0] = { ...addresses[0], isDefault: true };
      }
      return { ...current, addresses };
    });
    setMessage("");
    setError("");
  };

  const save = async () => {
    const companyName = form.companyName.trim();
    const contactName = form.contactName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim().toLowerCase();
    const managerNote = form.managerNote.trim();
    const addresses = form.addresses.map((item) => ({
      ...item,
      label: item.label.trim(),
      address: item.address.trim(),
    }));

    if (!companyName && !contactName) {
      setError("Укажите название компании или имя клиента.");
      return;
    }
    if (!email) {
      setError("Укажите email клиента.");
      return;
    }
    if (addresses.some((item) => !item.label || !item.address)) {
      setError("Заполните название и полный адрес во всех строках.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api.updateClient(client.id, {
        profile: {
          companyName,
          contactName,
          phone,
          email,
        },
        addresses,
        managerNote,
      });
      setMessage("Данные клиента сохранены в Clover.");
      await onReload?.();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="order-details" style={{ marginTop: 15 }}>
      <summary>Данные клиента: телефон, email и адреса</summary>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <label className="field">
          Компания или торговая точка
          <input
            value={form.companyName}
            onChange={(event) => setProfileField("companyName", event.target.value)}
          />
        </label>
        <label className="field">
          Контактное лицо
          <input
            value={form.contactName}
            onChange={(event) => setProfileField("contactName", event.target.value)}
          />
        </label>
        <label className="field">
          Телефон
          <input
            value={form.phone}
            onChange={(event) => setProfileField("phone", event.target.value)}
          />
        </label>
        <label className="field">
          Email для входа клиента
          <input
            type="email"
            value={form.email}
            onChange={(event) => setProfileField("email", event.target.value)}
          />
        </label>
      </div>

      <div className="manager-client-addresses">
        <div className="manager-client-addresses-heading">
          <strong>Адреса доставки</strong>
          <button className="secondary-button" type="button" onClick={addAddress}>
            + Добавить адрес
          </button>
        </div>
        {form.addresses.map((item) => (
          <div className="manager-client-address-row" key={item.id}>
            <label className="field">
              Название
              <input
                value={item.label}
                placeholder="Например: Основной магазин"
                onChange={(event) => updateAddress(item.id, { label: event.target.value })}
              />
            </label>
            <label className="field manager-client-address-field">
              Полный адрес
              <input
                value={item.address}
                placeholder="Город, улица, дом, помещение"
                onChange={(event) => updateAddress(item.id, { address: event.target.value })}
              />
            </label>
            <label className="manager-client-default-address">
              <input
                type="radio"
                name={`default-address-${client.id}`}
                checked={Boolean(item.isDefault)}
                onChange={() => updateAddress(item.id, { isDefault: true })}
              />
              Основной
            </label>
            <button
              className="danger-button"
              type="button"
              onClick={() => removeAddress(item.id)}
            >
              Удалить
            </button>
          </div>
        ))}
        {!form.addresses.length && (
          <div className="empty-box">Адресов пока нет.</div>
        )}
      </div>

      <label className="field" style={{ marginTop: 14 }}>
        Комментарий менеджера
        <textarea
          rows="4"
          maxLength="2000"
          placeholder="Например: звонить перед доставкой, принимает товар до 16:00"
          value={form.managerNote}
          onChange={(event) => setProfileField("managerNote", event.target.value)}
        />
        <small>Виден только менеджерам Clover. Клиенту и в 1С не передаётся.</small>
      </label>

      <div className="matrix-catalog-note" style={{ marginTop: 14 }}>
        Изменения используются в новых заказах Clover. Данные контрагента в 1С автоматически не перезаписываются. При изменении email клиент будет входить по новому адресу.
      </div>
      {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
      {message && <div className="sync-success" style={{ marginTop: 12 }}>{message}</div>}
      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="primary-button" type="button" disabled={saving} onClick={save}>
          {saving ? "Сохраняем..." : "Сохранить данные клиента"}
        </button>
      </div>
    </details>
  );
}

function ManagerClients({
  clients,
  products,
  clientLinks,
  setClientLinks,
  onReload,
}) {
  const [search, setSearch] = useState("");
  const [matrixSearch, setMatrixSearch] = useState("");
  const [defaultMarkupDrafts, setDefaultMarkupDrafts] = useState({});
  const [individualMarkupDrafts, setIndividualMarkupDrafts] = useState({});
  const [matrixSaveState, setMatrixSaveState] = useState({});
  const [openClientId, setOpenClientId] = useState(readOpenManagerClientId);
  const [approvalBusyId, setApprovalBusyId] = useState("");
  const restoredOpenClient = useRef(false);

  useEffect(() => {
    if (restoredOpenClient.current || !openClientId) return;
    const target = document.getElementById(`client-matrix-${openClientId}`);
    if (!target) return;

    restoredOpenClient.current = true;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
    });
  }, [openClientId, clients]);

  const setApproval = async (client, status) => {
    setApprovalBusyId(client.id);
    try {
      await api.setClientApproval(client.id, status);
      await onReload();
    } catch (error) {
      alert(error.message);
    } finally {
      setApprovalBusyId("");
    }
  };

  const visible = clients.filter((client) =>
    `${client.companyName} ${client.contactName} ${client.phone} ${client.email}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );

  const updateLink = (clientId, patch) => {
    setClientLinks((current) => ({
      ...current,
      [clientId]: {
        ...EMPTY_LINK,
        ...(current[clientId] || {}),
        ...patch,
      },
    }));
  };

  const updatePersonalPrice = (
    clientId,
    link,
    productId,
    patch,
    product = null
  ) => {
    const key = String(productId);
    const currentPrice = {
      source: "inherit",
      ...(link.personalPrices?.[key] || {}),
    };

    let nextPrice = {
      ...currentPrice,
      ...patch,
    };

    if (nextPrice.source === "manual" && product) {
      nextPrice = prefillManualPriceFromProduct(product, nextPrice);
    }

    const nextPrices = {
      ...(link.personalPrices || {}),
    };

    if (nextPrice.source === "inherit") {
      delete nextPrices[key];
    } else {
      nextPrices[key] = nextPrice;
    }

    updateLink(clientId, {
      personalPrices: nextPrices,
    });
  };

  const parsePriceInput = (value) =>
    value === "" ? null : Math.max(0, Number(value) || 0);

  const normalizePercentInput = (value) => {
    if (value === "" || value === null || value === undefined) return 0;
    return Math.max(0, Number(value) || 0);
  };

  const getDefaultMarkupDraft = (clientId, link) =>
    Object.prototype.hasOwnProperty.call(defaultMarkupDrafts, clientId)
      ? defaultMarkupDrafts[clientId]
      : String(link.defaultMarkupPercent ?? "");

  const getIndividualMarkupDraft = (clientId, productId, price) => {
    const clientDrafts = individualMarkupDrafts[clientId] || {};
    const key = String(productId);
    return Object.prototype.hasOwnProperty.call(clientDrafts, key)
      ? clientDrafts[key]
      : String(price.markupPercent ?? "");
  };

  const saveClientMatrix = async (clientId, link) => {
    setMatrixSaveState((current) => ({
      ...current,
      [clientId]: { status: "saving", message: "Сохраняем матрицу..." },
    }));

    const nextLink = {
      ...link,
      defaultMarkupPercent: normalizePercentInput(
        getDefaultMarkupDraft(clientId, link)
      ),
      personalPrices: { ...(link.personalPrices || {}) },
    };

    const productDrafts = individualMarkupDrafts[clientId] || {};
    for (const [productId, rawValue] of Object.entries(productDrafts)) {
      const currentPrice = nextLink.personalPrices[productId];
      if (currentPrice?.source === "purchase_markup") {
        nextLink.personalPrices[productId] = {
          ...currentPrice,
          markupPercent: normalizePercentInput(rawValue),
        };
      }
    }

    const productsById = new Map(
      (Array.isArray(products) ? products : []).map((item) => [
        String(item.id),
        item,
      ])
    );
    for (const [productId, config] of Object.entries(nextLink.personalPrices)) {
      if (config?.source !== "manual") continue;
      const product = productsById.get(String(productId));
      if (!product) continue;
      const filled = prefillManualPriceFromProduct(product, config);
      if (!hasManualUnitValue(filled)) {
        setMatrixSaveState((current) => ({
          ...current,
          [clientId]: {
            status: "error",
            message:
              `Для «${product.name}» выбрана фиксированная цена, но сумма не указана. Введите цену или верните «По умолчанию клиента».`,
          },
        }));
        return;
      }
      nextLink.personalPrices[productId] = filled;
    }

    const nextLinks = {
      ...clientLinks,
      [clientId]: nextLink,
    };

    try {
      setClientLinks(nextLinks);
      await api.saveClientLinks(nextLinks);
      setDefaultMarkupDrafts((current) => {
        const next = { ...current };
        delete next[clientId];
        return next;
      });
      setIndividualMarkupDrafts((current) => {
        const next = { ...current };
        delete next[clientId];
        return next;
      });
      setMatrixSaveState((current) => ({
        ...current,
        [clientId]: { status: "saved", message: "Матрица сохранена." },
      }));
    } catch (error) {
      setMatrixSaveState((current) => ({
        ...current,
        [clientId]: {
          status: "error",
          message: error.message || "Не удалось сохранить матрицу.",
        },
      }));
    }
  };

  return (
    <section>
      <div className="toolbar two">
        <input
          type="search"
          placeholder="Поиск клиента"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="mini-card">
          <span className="mini-label">Клиентов</span>
          <strong>{clients.length}</strong>
        </div>
      </div>

      {visible.length ? (
        <div className="client-list">
          {visible.map((client) => {
            const link = {
              ...EMPTY_LINK,
              ...(clientLinks[client.id] || {}),
              personalPrices: {
                ...((clientLinks[client.id] || {}).personalPrices || {}),
              },
            };
            const orderedIds = [
              ...new Set(
                client.orders.flatMap((order) =>
                  (order.items || []).map(
                    (item) => item.productId ?? item.id
                  )
                )
              ),
            ];
            const matrixProducts = products.filter(
              (product) =>
                product.active &&
                (!matrixSearch ||
                  product.name
                    .toLowerCase()
                    .includes(matrixSearch.toLowerCase()) ||
                  String(product.code || "")
                    .toLowerCase()
                    .includes(matrixSearch.toLowerCase()))
            );
            const personalPriceCount = Object.keys(
              link.personalPrices || {}
            ).length;

            return (
              <article className="client-card" key={client.id}>
                <div className="client-card-header">
                  <div>
                    <span
                      className={
                        link.matched1C
                          ? "badge green"
                          : "badge yellow"
                      }
                    >
                      {link.matched1C
                        ? "Связан с 1С"
                        : "Не сопоставлен"}
                    </span>
                    <h3>
                      {client.companyName || "Клиент без названия"}
                    </h3>
                    <p className="muted small">
                      {client.contactName} · {client.phone} ·{" "}
                      {client.email}
                    </p>
                  </div>
                  <strong>{client.orders.length} заказов</strong>
                </div>

                <div className="client-metrics">
                  <article>
                    <span>Заказов</span>
                    <strong>{client.orders.length}</strong>
                  </article>
                  <article>
                    <span>Активных</span>
                    <strong>
                      {
                        client.orders.filter(
                          (order) =>
                            !["Выполнен", "Отменён"].includes(
                              order.status
                            )
                        ).length
                      }
                    </strong>
                  </article>
                  <article>
                    <span>Товаров в матрице</span>
                    <strong>
                      {link.matrixMode === "all"
                        ? products.filter((item) => item.active)
                            .length
                        : link.matrixProductIds.length}
                    </strong>
                  </article>
                  <article>
                    <span>Персональных цен</span>
                    <strong>{personalPriceCount}</strong>
                  </article>
                </div>

                {client.isRegistered !== false && (
                  <div className="approval-box">
                    <div>
                      <strong>Регистрация клиента</strong>
                      <p>{client.emailVerified ? "Электронная почта подтверждена" : "Электронная почта ещё не подтверждена"} · {client.approvalStatus === "approved" ? "доступ разрешён" : client.approvalStatus === "rejected" ? "регистрация отклонена" : "ожидает решения менеджера"}</p>
                    </div>
                    <div className="inline-actions">
                      {client.approvalStatus !== "approved" && <button className="primary-button" type="button" disabled={approvalBusyId === client.id || !client.emailVerified} onClick={() => setApproval(client, "approved")}>Одобрить</button>}
                      {client.approvalStatus !== "rejected" && <button className="danger-button" type="button" disabled={approvalBusyId === client.id} onClick={() => setApproval(client, "rejected")}>Отклонить</button>}
                    </div>
                  </div>
                )}

                {client.isRegistered !== false ? (
                  <ManagerClientEditor client={client} onReload={onReload} />
                ) : (
                  <div className="matrix-catalog-note" style={{ marginTop: 15 }}>
                    Это клиент из старого заказа без отдельного аккаунта Clover. Его данные в заказе сохранены, но карточка станет редактируемой после регистрации клиента.
                  </div>
                )}

                <details
                  id={`client-matrix-${client.id}`}
                  className="order-details"
                  style={{ marginTop: 15 }}
                  open={String(openClientId) === String(client.id)}
                  onToggle={(event) => {
                    const nextId = event.currentTarget.open ? String(client.id) : "";
                    setOpenClientId((current) => {
                      const value = event.currentTarget.open
                        ? nextId
                        : String(current) === String(client.id)
                          ? ""
                          : current;
                      writeOpenManagerClientId(value);
                      return value;
                    });
                  }}
                >
                  <summary>
                    Товарная матрица, цены и связь с 1С
                  </summary>

                  <OneCClientPicker
                    client={client}
                    link={link}
                    onChange={(patch) => updateLink(client.id, patch)}
                  />

                  <div
                    className="form-grid"
                    style={{ marginTop: 14 }}
                  >
                    <label className="field">
                      Точное название в 1С — необязательно
                      <input
                        value={link.oneCMatchName || ""}
                        placeholder={client.companyName || "Название контрагента"}
                        onChange={(event) => updateLink(client.id, { oneCMatchName: event.target.value })}
                      />
                    </label>

                    <label className="field">
                      ИНН для точного сопоставления
                      <input
                        value={link.oneCMatchInn || ""}
                        inputMode="numeric"
                        onChange={(event) => updateLink(client.id, { oneCMatchInn: event.target.value })}
                      />
                    </label>

                    <label className="field">
                      Код контрагента в 1С — необязательно
                      <input
                        value={link.oneCMatchCode || ""}
                        onChange={(event) => updateLink(client.id, { oneCMatchCode: event.target.value })}
                      />
                    </label>

                    <label className="field">
                      Режим товарной матрицы
                      <select
                        value={link.matrixMode}
                        onChange={(event) =>
                          updateLink(client.id, {
                            matrixMode: event.target.value,
                          })
                        }
                      >
                        <option value="pending">
                          Матрица подготавливается
                        </option>
                        <option value="selected">
                          Только выбранные товары
                        </option>
                        <option value="all">
                          Все активные товары
                        </option>
                      </select>
                    </label>

                    <label className="field">
                      Полный каталог для клиента
                      <select
                        value={
                          link.allowFullCatalog ? "yes" : "no"
                        }
                        onChange={(event) =>
                          updateLink(client.id, {
                            allowFullCatalog:
                              event.target.value === "yes",
                          })
                        }
                      >
                        <option value="no">
                          Скрыт — только матрица
                        </option>
                        <option value="yes">
                          Разрешить просмотр
                        </option>
                      </select>
                    </label>


                    <label className="field">
                      Цена по умолчанию для матрицы
                      <select
                        value={link.defaultPricingMode || "base"}
                        onChange={(event) =>
                          updateLink(client.id, {
                            defaultPricingMode: event.target.value,
                          })
                        }
                      >
                        <option value="base">
                          Базовая цена Clover
                        </option>
                        <option value="purchase_markup">
                          Закупка 1С + общий процент
                        </option>
                      </select>
                    </label>

                    {link.defaultPricingMode === "purchase_markup" && (
                      <label className="field">
                        Общая наценка для клиента, %
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="0.1"
                          value={getDefaultMarkupDraft(client.id, link)}
                          onChange={(event) =>
                            setDefaultMarkupDrafts((current) => ({
                              ...current,
                              [client.id]: event.target.value,
                            }))
                          }
                          onBlur={() =>
                            updateLink(client.id, {
                              defaultMarkupPercent: normalizePercentInput(
                                getDefaultMarkupDraft(client.id, link)
                              ),
                            })
                          }
                        />
                        <small>
                          Применяется ко всем товарам без индивидуального исключения.
                        </small>
                      </label>
                    )}
                  </div>

                  <label
                    className="field"
                    style={{ marginTop: 12 }}
                  >
                    Заметка по матрице и связи с 1С
                    <textarea
                      rows="3"
                      value={link.managerNote}
                      onChange={(event) =>
                        updateLink(client.id, {
                          managerNote: event.target.value,
                        })
                      }
                    />
                    <small>Видна только менеджерам и относится к настройкам матрицы/1С.</small>
                  </label>

                  {link.matrixMode === "pending" && (
                    <div className="matrix-catalog-note pending" style={{ marginTop: 14 }}>
                      Сначала выберите режим товарной матрицы. Настройки цен сохранятся вместе с матрицей.
                    </div>
                  )}

                  {link.matrixMode !== "pending" && (
                    <div style={{ marginTop: 14 }}>
                      <div className="toolbar two">
                        <input
                          type="search"
                          placeholder="Поиск товара в матрице"
                          value={matrixSearch}
                          onChange={(event) =>
                            setMatrixSearch(event.target.value)
                          }
                        />
                        {link.matrixMode === "selected" ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              updateLink(client.id, {
                                matrixMode: "selected",
                                matrixProductIds: orderedIds,
                              })
                            }
                          >
                            Заполнить по истории заказов
                          </button>
                        ) : (
                          <div className="matrix-catalog-note">
                            Все активные товары используют общую схему цены, кроме индивидуальных исключений.
                          </div>
                        )}
                      </div>

                      <div className="matrix-summary">
                        <span>
                          {link.matrixMode === "all"
                            ? `Товаров в матрице: ${products.filter((item) => item.active).length}`
                            : `Выбрано: ${link.matrixProductIds.length}`}
                        </span>
                        <span>
                          Индивидуальных исключений: {personalPriceCount}
                        </span>
                        {link.matrixMode === "selected" && (
                          <>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                updateLink(client.id, {
                                  matrixMode: "selected",
                                  matrixProductIds: products
                                    .filter((item) => item.active)
                                    .map((item) => item.id),
                                })
                              }
                            >
                              Выбрать все
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                updateLink(client.id, {
                                  matrixProductIds: [],
                                })
                              }
                            >
                              Снять все
                            </button>
                          </>
                        )}
                      </div>

                      <div className="matrix-save-bar">
                        <div>
                          <strong>Сохранение товарной матрицы</strong>
                          <small>
                            После изменения цен, процентов или состава нажмите кнопку справа.
                          </small>
                          {matrixSaveState[client.id]?.message && (
                            <span
                              className={`matrix-save-message ${
                                matrixSaveState[client.id]?.status || ""
                              }`}
                            >
                              {matrixSaveState[client.id].message}
                            </span>
                          )}
                        </div>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={matrixSaveState[client.id]?.status === "saving"}
                          onClick={() => saveClientMatrix(client.id, link)}
                        >
                          {matrixSaveState[client.id]?.status === "saving"
                            ? "Сохраняем..."
                            : "Сохранить матрицу"}
                        </button>
                      </div>

                      <div className="matrix-editor-list">
                        {matrixProducts.map((product) => {
                          const price =
                            link.personalPrices?.[
                              String(product.id)
                            ] || {};
                          const selected =
                            link.matrixMode === "all" ||
                            link.matrixProductIds.includes(product.id);
                          const priceMode = ["manual", "purchase_markup"].includes(
                            price.source
                          )
                            ? price.source
                            : "inherit";
                          const effectiveMode =
                            priceMode === "inherit"
                              ? link.defaultPricingMode || "base"
                              : priceMode;
                          const markupPercent =
                            priceMode === "purchase_markup"
                              ? normalizePercentInput(
                                  getIndividualMarkupDraft(
                                    client.id,
                                    product.id,
                                    price
                                  )
                                )
                              : normalizePercentInput(
                                  getDefaultMarkupDraft(client.id, link)
                                );

                          return (
                            <div
                              className="matrix-editor-row"
                              key={product.id}
                            >
                              <label className="matrix-editor-product">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={link.matrixMode === "all"}
                                  onChange={(event) =>
                                    updateLink(client.id, {
                                      matrixMode: "selected",
                                      matrixProductIds:
                                        event.target.checked
                                          ? [
                                              ...new Set([
                                                ...link.matrixProductIds,
                                                product.id,
                                              ]),
                                            ]
                                          : link.matrixProductIds.filter(
                                              (id) => id !== product.id
                                            ),
                                    })
                                  }
                                />
                                <span>
                                  <strong>{product.name}</strong>
                                  <small
                                    style={{
                                      display: "block",
                                      marginTop: 3,
                                    }}
                                  >
                                    {product.code} · {product.category}
                                  </small>
                                </span>
                              </label>

                              {UNIT_ORDER.map(
                                (unit) => {
                                  const priceField =
                                    unit === "piece"
                                      ? "pricePiece"
                                      : unit === "pack"
                                        ? "pricePack"
                                        : "priceBundle";
                                  const unitAllowed =
                                    product.saleUnits.includes(unit);
                                  const purchasePrice =
                                    product.purchasePrices?.[unit];
                                  const calculatedPrice =
                                    calculateMarkupPreview(
                                      purchasePrice,
                                      markupPercent
                                    );

                                  if (effectiveMode === "purchase_markup") {
                                    return (
                                      <div
                                        className="matrix-price-field matrix-price-calculated"
                                        key={unit}
                                      >
                                        <span>{UNIT_CONFIG[unit].label}</span>
                                        {!unitAllowed ? (
                                          <strong>Не продаётся</strong>
                                        ) : hasPurchasePrice(purchasePrice) ? (
                                          <>
                                            <small>
                                              Закупка: {formatMoney(purchasePrice)}
                                            </small>
                                            <strong>
                                              Клиенту: {formatMoney(calculatedPrice)}
                                            </strong>
                                          </>
                                        ) : (
                                          <strong className="danger-text">
                                            Нет цены из 1С
                                          </strong>
                                        )}
                                      </div>
                                    );
                                  }

                                  if (priceMode === "manual") {
                                    return (
                                      <label
                                        className="matrix-price-field"
                                        key={unit}
                                      >
                                        {UNIT_CONFIG[unit].label}
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          disabled={!unitAllowed}
                                          placeholder={
                                            unitAllowed
                                              ? `База: ${
                                                  Number(product[priceField]) || 0
                                                }`
                                              : "Не продаётся"
                                          }
                                          value={price[unit] ?? ""}
                                          onChange={(event) =>
                                            updatePersonalPrice(
                                              client.id,
                                              link,
                                              product.id,
                                              {
                                                [unit]: parsePriceInput(
                                                  event.target.value
                                                ),
                                              }
                                            )
                                          }
                                        />
                                      </label>
                                    );
                                  }

                                  return (
                                    <div
                                      className="matrix-price-field matrix-price-calculated"
                                      key={unit}
                                    >
                                      <span>{UNIT_CONFIG[unit].label}</span>
                                      {!unitAllowed ? (
                                        <strong>Не продаётся</strong>
                                      ) : (
                                        <>
                                          <small>Базовая цена Clover</small>
                                          <strong>
                                            {formatMoney(product[priceField])}
                                          </strong>
                                        </>
                                      )}
                                    </div>
                                  );
                                }
                              )}

                              <div className="matrix-price-mode">
                                <label className="matrix-price-field">
                                  Способ расчёта
                                  <select
                                    value={priceMode}
                                    onChange={(event) =>
                                      updatePersonalPrice(
                                        client.id,
                                        link,
                                        product.id,
                                        {
                                          source: event.target.value,
                                        },
                                        product
                                      )
                                    }
                                  >
                                    <option value="inherit">
                                      По умолчанию клиента
                                    </option>
                                    <option value="manual">
                                      Фиксированная цена вручную
                                    </option>
                                    <option value="purchase_markup">
                                      Индивидуальный процент
                                    </option>
                                  </select>
                                </label>
                                {priceMode === "purchase_markup" && (
                                  <label className="matrix-price-field">
                                    Индивидуальная наценка, %
                                    <input
                                      type="number"
                                      min="0"
                                      max="10000"
                                      step="0.1"
                                      value={getIndividualMarkupDraft(
                                        client.id,
                                        product.id,
                                        price
                                      )}
                                      onChange={(event) =>
                                        setIndividualMarkupDrafts((current) => ({
                                          ...current,
                                          [client.id]: {
                                            ...(current[client.id] || {}),
                                            [String(product.id)]: event.target.value,
                                          },
                                        }))
                                      }
                                      onBlur={() =>
                                        updatePersonalPrice(
                                          client.id,
                                          link,
                                          product.id,
                                          {
                                            markupPercent: normalizePercentInput(
                                              getIndividualMarkupDraft(
                                                client.id,
                                                product.id,
                                                price
                                              )
                                            ),
                                          }
                                        )
                                      }
                                    />
                                  </label>
                                )}
                                {priceMode === "inherit" &&
                                  effectiveMode === "purchase_markup" && (
                                    <small className="price-update-time">
                                      Общая наценка клиента: {markupPercent}%
                                    </small>
                                  )}
                                {effectiveMode === "purchase_markup" && (
                                  <small className="price-update-time">
                                    Цена 1С обновлена: {formatDateTime(product.purchasePriceUpdatedAt)}
                                  </small>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div
                    className="comment-box"
                    style={{ marginTop: 14 }}
                  >
                    <strong>Адреса клиента</strong>
                    <p>
                      {client.addresses.length
                        ? client.addresses
                            .map((item) =>
                              typeof item === "string" ? item : item.address
                            )
                            .filter(Boolean)
                            .join("; ")
                        : "Нет адресов"}
                    </p>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-box">Клиенты не найдены.</div>
      )}
    </section>
  );
}

function ProductEditor({ product, onClose, onSave }) {
  const isNew = !product;
  const [form, setForm] = useState(product || {
    name: "", category: "Новые товары", code: "", oneCId: "",
    oneCCode: "", oneCName: "", oneCMatchCode: "", oneCMatchName: "", oneCSearchQuery: "", oneCSearchRequestedAt: "", oneCLinkMode: "", oneCLinkedAt: "", active: true,
    pieceSize: 1, packSize: 1, bundleSize: 1,
    pricePiece: 0, pricePack: 0, priceBundle: 0,
    saleUnits: ["piece"],
  });
  const [oneCOpen, setOneCOpen] = useState(false);
  const [oneCSearch, setOneCSearch] = useState(product?.oneCName || product?.name || "");
  const [oneCResults, setOneCResults] = useState([]);
  const [oneCTotal, setOneCTotal] = useState(0);
  const [oneCLoading, setOneCLoading] = useState(false);
  const [oneCError, setOneCError] = useState("");
  const [oneCNotice, setOneCNotice] = useState("");

  const toggleUnit = (unit, checked) => {
    const next = checked ? [...new Set([...form.saleUnits, unit])] : form.saleUnits.filter((item) => item !== unit);
    setForm({ ...form, saleUnits: next.length ? next : ["piece"] });
  };

  const searchOneCProducts = async (query = oneCSearch) => {
    setOneCLoading(true);
    setOneCError("");
    try {
      const result = await api.getOneCProducts({
        search: String(query || "").trim(),
        limit: 50,
        offset: 0,
      });
      setOneCResults(result.items || []);
      setOneCTotal(Number(result.total) || 0);
    } catch (error) {
      setOneCError(error.message);
      setOneCResults([]);
      setOneCTotal(0);
    } finally {
      setOneCLoading(false);
    }
  };

  const openOneCSearch = async () => {
    const query = form.oneCSearchQuery || form.oneCCode || form.oneCMatchCode || form.oneCName || form.oneCMatchName || form.name || "";
    setOneCSearch(query);
    setOneCOpen(true);
    setOneCLoading(true);
    setOneCError("");
    setOneCNotice("");
    try {
      if (product?.id) {
        const candidateResult = await api.getOneCProductCandidates(product.id);
        if ((candidateResult.items || []).length) {
          setOneCResults(candidateResult.items || []);
          setOneCTotal(Number(candidateResult.total) || 0);
          setOneCNotice("Показаны наиболее подходящие варианты, найденные при последней выгрузке из 1С.");
          return;
        }
      }
      const result = await api.getOneCProducts({ search: String(query || "").trim(), limit: 50, offset: 0 });
      setOneCResults(result.items || []);
      setOneCTotal(Number(result.total) || 0);
    } catch (error) {
      setOneCError(error.message);
      setOneCResults([]);
      setOneCTotal(0);
    } finally {
      setOneCLoading(false);
    }
  };

  const selectOneCProduct = (item) => {
    const nextProduct = normalizeProduct({
      ...form,
      oneCId: item.id,
      oneCCode: item.code || "",
      oneCName: item.name || "",
      oneCMatchCode: item.code || "",
      oneCMatchName: item.name || "",
      oneCSearchQuery: "",
      oneCSearchRequestedAt: "",
      oneCLinkMode: "manual",
      oneCLinkedAt: new Date().toISOString(),
    });

    setForm(nextProduct);
    setOneCOpen(false);
    setOneCError("");
    setOneCNotice(
      "Позиция 1С выбрана, но ещё не сохранена. Проверьте название, категорию, единицы, коэффициенты и цены, затем нажмите «Сохранить товар»."
    );
  };

  const requestOneCSearch = async () => {
    if (!product?.id) {
      setForm((current) => ({ ...current, oneCSearchQuery: oneCSearch || current.name }));
      setOneCNotice("Запрос будет сохранён вместе с новым товаром.");
      return;
    }
    setOneCLoading(true);
    setOneCError("");
    try {
      const result = await api.requestOneCProduct(product.id, {
        query: oneCSearch || form.name,
        code: form.oneCMatchCode || "",
        name: form.oneCMatchName || "",
      });
      const updatedProduct = normalizeProduct({
        ...form,
        ...(result.product || {}),
        oneCSearchQuery: oneCSearch || form.name,
      });
      setForm(updatedProduct);
      setOneCNotice(result.message || "Запрос сохранён.");
      await onSave(updatedProduct);
    } catch (error) {
      setOneCError(error.message);
    } finally {
      setOneCLoading(false);
    }
  };

  const clearOneCProduct = () => {
    setForm((current) => ({
      ...current,
      oneCId: "",
      oneCCode: "",
      oneCName: "",
      oneCMatchCode: "",
      oneCMatchName: "",
      oneCSearchQuery: "",
      oneCSearchRequestedAt: "",
      oneCLinkMode: "manual-cleared",
      oneCLinkedAt: "",
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.category.trim()) return;

    onSave(normalizeProduct({
      ...form,
      name: form.name.trim(),
      category: form.category.trim(),
      oneCId: String(form.oneCId || "").trim(),
      oneCCode: String(form.oneCCode || "").trim(),
      oneCName: String(form.oneCName || "").trim(),
      oneCMatchCode: String(form.oneCMatchCode || "").trim(),
      oneCMatchName: String(form.oneCMatchName || "").trim(),
      oneCSearchQuery: String(form.oneCSearchQuery || "").trim(),
      oneCSearchRequestedAt: String(form.oneCSearchRequestedAt || "").trim(),
    }));
  };

  return (
    <div className="product-editor" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="product-editor-card" onSubmit={submit}>
        <div className="panel-heading"><div><p className="eyebrow">Каталог</p><h2>{isNew ? "Новый товар" : "Редактирование товара"}</h2></div><button className="icon-button" type="button" onClick={onClose}>×</button></div>
        <div className="form-grid">
          <label className="field">Название товара<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="field">Категория<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></label>
          <label className="field">Внутренний код<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
          <label className="field">Показывать клиентам<select value={form.active ? "yes" : "no"} onChange={(e) => setForm({ ...form, active: e.target.value === "yes" })}><option value="yes">Да</option><option value="no">Нет</option></select></label>
        </div>

        <section className="one-c-link-editor">
          <div className="one-c-link-editor-head">
            <div>
              <p className="eyebrow">Связь с 1С</p>
              <h3>Точная номенклатура 1С TEST</h3>
            </div>
            <button className="secondary-button" type="button" onClick={openOneCSearch}>
              {form.oneCId ? "Изменить товар 1С" : "Выбрать из загруженных 1С"}
            </button>
          </div>

          {form.oneCId ? (
            <div className="one-c-link-selected">
              <div>
                <strong>{form.oneCName || "Выбранный товар 1С"}</strong>
                <span>Код: {form.oneCCode || "—"} · ID: {form.oneCId}</span>
              </div>
              <button className="secondary-button" type="button" onClick={clearOneCProduct}>Убрать связь</button>
            </div>
          ) : (
            <div className="one-c-link-empty one-c-match-hints">
              <p>
                Название для сайта может отличаться от названия в 1С. Укажите код
                или точное внутреннее название из 1С TEST. После следующей выгрузки
                Clover сохранит только подходящую позицию и свяжет её автоматически.
              </p>
              <div className="form-grid one-c-match-fields">
                <label className="field">Код товара в 1С
                  <input
                    value={form.oneCMatchCode || ""}
                    placeholder="Например, НФ-00000742"
                    onChange={(event) => setForm({ ...form, oneCMatchCode: event.target.value })}
                  />
                </label>
                <label className="field">Точное название в 1С
                  <input
                    value={form.oneCMatchName || ""}
                    placeholder="Как позиция называется внутри 1С"
                    onChange={(event) => setForm({ ...form, oneCMatchName: event.target.value })}
                  />
                </label>
              </div>
            </div>
          )}

          {!oneCOpen && oneCNotice && <div className="sync-success">{oneCNotice}</div>}

          {oneCOpen && (
            <div className="one-c-picker">
              <div className="one-c-products-search">
                <input
                  type="search"
                  placeholder="Поиск среди сохранённых позиций: название, код или ID"
                  value={oneCSearch}
                  onChange={(event) => setOneCSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      searchOneCProducts(oneCSearch);
                    }
                  }}
                  autoFocus
                />
                <button className="secondary-button" type="button" disabled={oneCLoading} onClick={() => searchOneCProducts(oneCSearch)}>
                  {oneCLoading ? "Поиск..." : "Найти"}
                </button>
                <button className="secondary-button" type="button" onClick={() => setOneCOpen(false)}>Закрыть</button>
              </div>

              {oneCError && <div className="sync-error">{oneCError}</div>}
              {oneCNotice && <div className="sync-success">{oneCNotice}</div>}
              <p className="muted small">Найдено: {oneCTotal}. Показаны первые {oneCResults.length} позиций.</p>

              <div className="one-c-products-list one-c-picker-list">
                {oneCResults.map((item) => {
                  const linkedToCurrent = item.cloverLink && String(item.cloverLink.productId) === String(product?.id);
                  const linkedElsewhere = item.cloverLink && !linkedToCurrent;
                  const selected = String(form.oneCId) === String(item.id);

                  return (
                    <article key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>Код: {item.code || "—"} · ID: {item.id}</span>
                        {Number(item.score) > 0 && <span className="muted small">Совпадение: {Math.round(Number(item.score) * 100)}%</span>}
                        {linkedElsewhere && <span className="warning-text">Уже связан с товаром Clover: {item.cloverLink.productName}</span>}
                      </div>
                      <button
                        className={selected || linkedToCurrent ? "secondary-button" : "primary-button"}
                        type="button"
                        disabled={Boolean(linkedElsewhere)}
                        onClick={() => selectOneCProduct(item)}
                      >
                        {selected || linkedToCurrent ? "Выбрано" : linkedElsewhere ? "Уже связан" : "Выбрать"}
                      </button>
                    </article>
                  );
                })}
                {!oneCLoading && !oneCResults.length && (
                  <div className="empty-box">
                    <p>Подходящих сохранённых позиций пока нет.</p>
                    <button className="primary-button" type="button" onClick={requestOneCSearch}>
                      Сохранить запрос для следующей выгрузки из 1С
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="purchase-price-card">
          <div className="purchase-price-card-head">
            <div>
              <p className="eyebrow">Цена из 1С TEST</p>
              <h3>Закупочная цена товара</h3>
            </div>
            <small>
              {form.purchasePriceUpdatedAt
                ? `Обновлено: ${formatDateTime(form.purchasePriceUpdatedAt)}`
                : "Закупочная цена ещё не получена"}
            </small>
          </div>
          <div className="purchase-price-grid">
            {UNIT_ORDER.map((unit) => {
              const value = form.purchasePrices?.[unit];
              const available = hasPurchasePrice(value);
              return (
                <article key={unit}>
                  <span>{UNIT_CONFIG[unit].label}</span>
                  <strong>{available ? formatMoney(value) : "—"}</strong>
                  <small>
                    {form.saleUnits.includes(unit)
                      ? available
                        ? "Получено из 1С"
                        : "Нет цены из 1С"
                      : "Единица не продаётся"}
                  </small>
                </article>
              );
            })}
          </div>
        </section>

        <div className="unit-settings">
          {UNIT_ORDER.map((unit) => {
            const sizeField = unit === "piece" ? "pieceSize" : unit === "pack" ? "packSize" : "bundleSize";
            const priceField = unit === "piece" ? "pricePiece" : unit === "pack" ? "pricePack" : "priceBundle";
            return <div className="unit-setting" key={unit}>
              <label><input type="checkbox" checked={form.saleUnits.includes(unit)} onChange={(e) => toggleUnit(unit, e.target.checked)} />{UNIT_CONFIG[unit].label}</label>
              <label className="field">Внутри, шт.
                <input
                  type="number"
                  min="1"
                  value={form[sizeField]}
                  onFocus={selectDefaultNumber}
                  onMouseUp={(event) => {
                    if (["0", "1"].includes(String(event.currentTarget.value))) {
                      event.preventDefault();
                      event.currentTarget.select();
                    }
                  }}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [sizeField]: event.target.value,
                    }))
                  }
                  onBlur={() =>
                    setForm((current) => ({
                      ...current,
                      [sizeField]: Math.max(1, Number(current[sizeField]) || 1),
                    }))
                  }
                />
              </label>
              <label className="field">Цена за единицу продажи
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form[priceField]}
                  onFocus={selectDefaultNumber}
                  onMouseUp={(event) => {
                    if (String(event.currentTarget.value) === "0") {
                      event.preventDefault();
                      event.currentTarget.select();
                    }
                  }}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [priceField]: event.target.value,
                    }))
                  }
                  onBlur={() =>
                    setForm((current) => ({
                      ...current,
                      [priceField]: Math.max(0, Number(current[priceField]) || 0),
                    }))
                  }
                />
              </label>
            </div>;
          })}
        </div>
        <div className="form-actions"><button className="secondary-button" type="button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit">Сохранить товар</button></div>
      </form>
    </div>
  );
}

function OneCProductsPanel({ products, setProducts }) {
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const initialLinkDone = useRef(false);

  const loadCatalog = async (query = search) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getOneCProducts({
        search: query,
        limit: 50,
        offset: 0,
      });
      setCatalog(result);
      return result;
    } catch (loadError) {
      setError(loadError.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const runAutoLink = async ({ silent = false } = {}) => {
    setLinking(true);
    if (!silent) setError("");
    try {
      const result = await api.autoLinkOneCProducts();
      setProducts((result.products || []).map(normalizeProduct));
      const refreshed = await api.getOneCProducts({
        search,
        limit: 50,
        offset: 0,
      });
      setCatalog(refreshed);
      if (!silent) {
        const linked = result.report?.newlyLinked || 0;
        alert(
          linked
            ? `Автоматически связаны товары: ${linked}.`
            : "Новых точных совпадений не найдено. Уже созданные связи сохранены."
        );
      }
    } catch (linkError) {
      setError(linkError.message);
    } finally {
      setLinking(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const result = await loadCatalog("");
      if (cancelled || initialLinkDone.current) return;
      initialLinkDone.current = true;

      if (result?.summary?.oneCTotal > 0) {
        await runAutoLink({ silent: true });
      }
    };

    initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = catalog?.summary || {};

  return (
    <section className="one-c-products-panel">
      <div className="one-c-products-head">
        <div>
          <p className="eyebrow">Каталог 1С</p>
          <h2>Автоматическое сопоставление номенклатуры</h2>
          <p>
            Clover сохраняет только точные совпадения и несколько наиболее похожих
            вариантов для несвязанных товаров. Красивое название на сайте может быть
            другим: в заказ передаётся ID 1С. Полная номенклатура и база клиентов в
            Clover не сохраняются. Неоднозначные варианты выбирает менеджер.
          </p>
        </div>
        <div className="one-c-products-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => loadCatalog()}
            disabled={loading || linking}
          >
            {loading ? "Обновление..." : "Обновить"}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => runAutoLink()}
            disabled={linking || !summary.oneCTotal}
          >
            {linking ? "Сопоставление..." : "Сопоставить автоматически"}
          </button>
        </div>
      </div>

      {error && <div className="sync-error">{error}</div>}

      <div className="one-c-products-stats">
        <article><span>Подходящих из 1С</span><strong>{summary.oneCTotal || 0}</strong></article>
        <article><span>Товаров Clover</span><strong>{summary.cloverTotal ?? products.length}</strong></article>
        <article><span>Связано</span><strong>{summary.linked || 0}</strong></article>
        <article><span>С закупочной ценой</span><strong>{summary.pricedProducts || 0}</strong></article>
        <article><span>Без связи</span><strong>{summary.unmatched ?? products.filter((item) => !item.oneCId).length}</strong></article>
        {Number(summary.candidateProducts) > 0 && <article><span>Есть варианты</span><strong>{summary.candidateProducts}</strong></article>}
      </div>

      <div className="one-c-products-meta">
        <span>
          Последняя выгрузка: {summary.receivedAt ? formatDateTime(summary.receivedAt) : "ещё не выполнялась"}
        </span>
        <span>
          Автоматически: {summary.autoLinked || 0} · вручную: {summary.manualLinked || 0}
        </span>
        {summary.stale > 0 && <span className="warning-text">Не найдено в свежем каталоге: {summary.stale}</span>}
      </div>

      <button
        className="one-c-products-toggle"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Скрыть сохранённые позиции 1С" : "Показать сохранённые позиции 1С"}
      </button>

      {open && (
        <div className="one-c-products-browser">
          <form
            className="one-c-products-search"
            onSubmit={(event) => {
              event.preventDefault();
              loadCatalog(search);
            }}
          >
            <input
              type="search"
              placeholder="Поиск среди сохранённых позиций: название, код или ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="secondary-button" type="submit" disabled={loading}>
              Найти
            </button>
            {search && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setSearch("");
                  loadCatalog("");
                }}
              >
                Сбросить
              </button>
            )}
          </form>

          <p className="muted small">
            Найдено: {catalog?.total || 0}. Показаны первые {catalog?.items?.length || 0} позиций.
          </p>

          <div className="one-c-products-list">
            {(catalog?.items || []).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>Код: {item.code || "—"} · ID: {item.id}</span>
                </div>
                {item.cloverLink ? (
                  <span className="badge green">
                    Связан: {item.cloverLink.productName}
                  </span>
                ) : (
                  <span className="badge gray">Не используется в Clover</span>
                )}
              </article>
            ))}
            {!loading && !(catalog?.items || []).length && (
              <div className="empty-box">Позиции не найдены.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ManagerProducts({ products, setProducts }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Все");
  const [visibility, setVisibility] = useState("Все");
  const [editorProduct, setEditorProduct] = useState(undefined);
  const [imageBusyId, setImageBusyId] = useState(null);
  const categories = ["Все", ...new Set(products.map((item) => item.category))];
  const visible = products.filter((product) => {
    const bySearch = !search || `${product.name} ${product.code} ${product.oneCId} ${product.oneCCode} ${product.oneCName} ${product.oneCMatchCode} ${product.oneCMatchName} ${product.oneCSearchQuery}`.toLowerCase().includes(search.toLowerCase());
    const byCategory = category === "Все" || product.category === category;
    const hasOneCLink = Boolean(String(product.oneCId || "").trim());
    const byVisibility =
      visibility === "Все" ||
      (visibility === "Активные" && product.active) ||
      (visibility === "Скрытые" && !product.active) ||
      (visibility === "Связанные с 1С" && hasOneCLink) ||
      (visibility === "Без связи с 1С" && !hasOneCLink);
    return bySearch && byCategory && byVisibility;
  });

  const save = async (value) => {
    let nextProducts;

    if (value.id) {
      nextProducts = products.map((item) => item.id === value.id ? normalizeProduct(value) : item);
    } else {
      const id = Math.max(0, ...products.map((item) => Number(item.id) || 0)) + 1;
      nextProducts = [
        ...products,
        normalizeProduct({
          ...value,
          id,
          code: value.code || `CL-${String(id).padStart(4, "0")}`,
        }),
      ];
    }

    try {
      const result = await api.saveProducts(nextProducts);
      setProducts((result.products || nextProducts).map(normalizeProduct));
      setEditorProduct(undefined);
    } catch (error) {
      alert(`Не удалось сохранить товар: ${error.message}`);
    }
  };

  const uploadImage = async (product, file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Выберите фотографию товара.");
      return;
    }

    setImageBusyId(product.id);
    try {
      const result = await api.uploadProductImage(product.id, file);
      setProducts((current) => current.map((item) =>
        item.id === product.id
          ? normalizeProduct({ ...item, ...result.product })
          : item
      ));
      alert("Фотография товара сохранена на сервере.");
    } catch (error) {
      alert(error.message);
    } finally {
      setImageBusyId(null);
    }
  };

  const deleteImage = async (product) => {
    if (!window.confirm(`Удалить фотографию товара «${product.name}»?`)) {
      return;
    }

    setImageBusyId(product.id);
    try {
      const result = await api.deleteProductImage(product.id);
      setProducts((current) => current.map((item) =>
        item.id === product.id
          ? normalizeProduct({ ...item, ...result.product })
          : item
      ));
    } catch (error) {
      alert(error.message);
    } finally {
      setImageBusyId(null);
    }
  };

  return (
    <section>
      <OneCProductsPanel products={products} setProducts={setProducts} />

      <div className="toolbar four">
        <input type="search" placeholder="Поиск товара, кода или ID 1С" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option>Все</option>
          <option>Активные</option>
          <option>Скрытые</option>
          <option>Связанные с 1С</option>
          <option>Без связи с 1С</option>
        </select>
        <button className="primary-button" type="button" onClick={() => setEditorProduct(null)}>+ Добавить товар</button>
      </div>
      <div className="server-safe-note">
        Фото загружается на сервер и автоматически появляется в личном кабинете клиента. Поддерживаются JPG, PNG и WEBP до 5 МБ.
      </div>
      <div className="product-manager-list" style={{ marginTop: 14 }}>
        {visible.map((product) => <article className={product.active ? "product-manager-row" : "product-manager-row inactive"} key={product.id}>
          <div className="product-manager-thumb">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <span>Нет фото</span>}
          </div>
          <div>
            <h3>{product.name}</h3>
            <p>{product.category} · {product.code}</p>
            <p className="product-one-c-line">
              {product.oneCId
                ? `1С: ${product.oneCCode || "без кода"} · ${product.oneCId}`
                : "1С: не связан"}
              {product.oneCLinkMode === "auto" ? " · автоматически" : product.oneCId ? " · вручную" : ""}
            </p>
            <div className="product-purchase-summary">
              {UNIT_ORDER.map((unit) => {
                const value = product.purchasePrices?.[unit];
                return (
                  <span key={unit}>
                    <strong>{UNIT_CONFIG[unit].label}:</strong>{" "}
                    {hasPurchasePrice(value) ? formatMoney(value) : "—"}
                  </span>
                );
              })}
              <span className="product-purchase-updated">
                Закупка 1С обновлена: {formatDateTime(product.purchasePriceUpdatedAt)}
              </span>
            </div>
          </div>
          <span className={product.active ? "badge green" : "badge gray"}>{product.active ? "Активен" : "Скрыт"}</span>
          <strong>{settingsPriceLabel(product)}</strong>
          <div className="image-actions">
            <label className="image-upload-label">
              {imageBusyId === product.id ? "Загрузка..." : product.imageUrl ? "Заменить фото" : "Добавить фото"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={imageBusyId === product.id}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  uploadImage(product, file);
                  event.target.value = "";
                }}
              />
            </label>
            {product.imageUrl && <button className="secondary-button" type="button" disabled={imageBusyId === product.id} onClick={() => deleteImage(product)}>Удалить фото</button>}
            <button className="secondary-button" type="button" onClick={() => setEditorProduct(product)}>Изменить</button>
            <button className="secondary-button" type="button" onClick={() => setProducts((current) => current.map((item) => item.id === product.id ? { ...item, active: !item.active } : item))}>{product.active ? "Скрыть" : "Показать"}</button>
          </div>
        </article>)}
      </div>
      {editorProduct !== undefined && <ProductEditor product={editorProduct} onClose={() => setEditorProduct(undefined)} onSave={save} />}
    </section>
  );
}

function settingsPriceLabel(product) {
  const prices = [product.pricePiece, product.pricePack, product.priceBundle].filter((value) => Number(value) > 0);
  return prices.length ? `от ${formatMoney(Math.min(...prices))}` : "Без цены";
}

function ToggleSetting({ title, description, value, onChange }) {
  return <article className="setting-card"><div><h3>{title}</h3><p>{description}</p></div><button className={value ? "toggle active" : "toggle"} type="button" onClick={() => onChange(!value)} aria-label={title}><span /></button></article>;
}

function ManagerNotificationSettings({ settings, set }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadStatus = async () => {
    try {
      const result = await api.getManagerNotifications({ limit: 1 });
      setStatus(result.status || null);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const test = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api.saveSettings(settings);
      const result = await api.testManagerNotifications();
      const delivery = result.result?.delivery || [];
      const parts = delivery.map((item) => {
        const channel = item.channel === "email" ? "email" : item.channel === "telegram" ? "Telegram" : item.channel === "push" ? "push" : "канал";
        if (item.sent === true || Number(item.sent) > 0) return `${channel}: отправлено`;
        return `${channel}: ${item.reason || item.error || "не отправлено"}`;
      });
      setMessage(parts.length ? parts.join("; ") : "Внутреннее уведомление создано. Внешние каналы пока выключены.");
      setStatus(result.status || null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="manager-contact-settings manager-notification-settings">
      <h3>Уведомления менеджеру</h3>
      <p>Новый заказ, изменение заказа, товар вне матрицы, запрос акта сверки, регистрация клиента и ошибки 1С.</p>
      <div className="settings-grid">
        <ToggleSetting title="Уведомления в Clover" description="Показывать новые события сразу в кабинете менеджера." value={settings.managerNotificationsEnabled !== false} onChange={(value) => set("managerNotificationsEnabled", value)} />
        <ToggleSetting title="Новые заказы" description="Сообщать о каждом новом заказе клиента." value={settings.managerNotifyNewOrders !== false} onChange={(value) => set("managerNotifyNewOrders", value)} />
        <ToggleSetting title="Изменения заказов" description="Сообщать, когда клиент меняет или удаляет новый заказ." value={settings.managerNotifyOrderChanges !== false} onChange={(value) => set("managerNotifyOrderChanges", value)} />
        <ToggleSetting title="Товары вне матрицы" description="Отдельно сообщать о новой позиции, комментарии и фотографии." value={settings.managerNotifyCustomItems !== false} onChange={(value) => set("managerNotifyCustomItems", value)} />
        <ToggleSetting title="Запросы актов сверки" description="Сообщать о новом запросе с выбранным периодом." value={settings.managerNotifyReconciliation !== false} onChange={(value) => set("managerNotifyReconciliation", value)} />
        <ToggleSetting title="Новые регистрации" description="Сообщать о клиентах, ожидающих подтверждения менеджера." value={settings.managerNotifyRegistrations !== false} onChange={(value) => set("managerNotifyRegistrations", value)} />
        <ToggleSetting title="Ошибки обмена с 1С" description="Сообщать о сбоях передачи и обработки заказов." value={settings.managerNotifyOneCErrors !== false} onChange={(value) => set("managerNotifyOneCErrors", value)} />
        <ToggleSetting title="Push на устройства менеджера" description="Отправлять уведомления в установленную PWA Clover." value={settings.managerNotifyPush !== false} onChange={(value) => set("managerNotifyPush", value)} />
        <ToggleSetting title="Отправлять на email" description="Использовать SMTP и адрес, указанный ниже." value={Boolean(settings.managerNotifyEmail)} onChange={(value) => set("managerNotifyEmail", value)} />
        <ToggleSetting title="Отправлять в Telegram-бот" description="Токен хранится только в server/.env, Chat ID указывается ниже." value={Boolean(settings.managerNotifyTelegram)} onChange={(value) => set("managerNotifyTelegram", value)} />
      </div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <label className="field">Email для уведомлений
          <input type="email" value={settings.managerNotificationEmail || ""} placeholder="manager@company.ru" onChange={(event) => set("managerNotificationEmail", event.target.value)} />
        </label>
        <label className="field">Telegram Chat ID менеджера
          <input value={settings.managerTelegramChatId || ""} placeholder="Например: 123456789" onChange={(event) => set("managerTelegramChatId", event.target.value.trim())} />
        </label>
      </div>
      <div className="notification-channel-status">
        <span className={status?.email?.configured ? "badge green" : "badge yellow"}>Email: {status?.email?.configured ? "готов" : status?.email?.smtpConfigured ? "укажите адрес" : "SMTP не настроен"}</span>
        <span className={status?.telegram?.configured ? "badge green" : "badge yellow"}>Telegram: {status?.telegram?.configured ? "готов" : status?.telegram?.tokenConfigured ? "укажите Chat ID" : "токен не настроен"}</span>
        <span className={status?.push?.configured ? "badge green" : "badge yellow"}>Push: {status?.push?.configured ? "готов" : "после HTTPS и VAPID"}</span>
      </div>
      <p className="manager-contact-help">Токен Telegram-бота и SMTP-пароль не вводятся в браузере и не отправляются в чат. Для них в обновлении будет отдельный локальный настройщик.</p>
      <div className="inline-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={test}>{busy ? "Проверяем…" : "Отправить тестовое уведомление"}</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={loadStatus}>Обновить статус</button>
      </div>
      {message && <div className="request-photo-status">{message}</div>}
    </div>
  );
}

function ManagerSettings({ settings, setSettings }) {
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));

  return (
    <section className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Правила</p>
          <h2>Настройки кабинета</h2>
          <p>Изменения сохраняются автоматически и применяются сразу.</p>
        </div>
      </div>

      <div className="manager-contact-settings">
        <h3>Контакты менеджера для клиентов</h3>
        <p>
          В личном кабинете появится кнопка «Ваш менеджер». При наведении
          или нажатии клиент увидит ФИО, телефон и кнопки связи.
        </p>
        <div className="form-grid">
          <label className="field">
            ФИО менеджера
            <input
              value={settings.managerFullName || ""}
              placeholder="Например: Иванов Иван Иванович"
              onChange={(event) => set("managerFullName", event.target.value)}
            />
          </label>
          <label className="field">
            Телефон менеджера
            <input
              inputMode="tel"
              value={formatRussianPhone(settings.managerPhone || "")}
              onFocus={(event) => {
                if (!getRussianPhoneLocalDigits(event.currentTarget.value)) {
                  requestAnimationFrame(() => {
                    const end = event.currentTarget.value.length;
                    event.currentTarget.setSelectionRange(end, end);
                  });
                }
              }}
              onChange={(event) => set("managerPhone", formatRussianPhone(event.target.value))}
              placeholder="+7 (___) ___-__-__"
            />
          </label>
          <label className="field">
            Ссылка на профиль MAX
            <input
              value={settings.managerMax || ""}
              placeholder="https://max.ru/u/... или max.ru/username"
              onChange={(event) => set("managerMax", event.target.value)}
            />
          </label>
          <label className="field">
            Telegram менеджера — необязательно
            <input
              value={settings.managerTelegram || ""}
              placeholder="@username или ссылка t.me"
              onChange={(event) => set("managerTelegram", event.target.value)}
            />
          </label>
        </div>
        <p className="manager-contact-help">
          Для MAX вставьте ссылку на профиль, скопированную в приложении MAX.
          Telegram показывается только после заполнения имени пользователя или ссылки.
        </p>
      </div>

      <ManagerNotificationSettings settings={settings} set={set} />
      <PushSettings />

      <div className="settings-grid">
        <ToggleSetting title="Показывать цены" description="Клиент увидит цены, заполненные в карточках товаров." value={settings.showPrices} onChange={(value) => set("showPrices", value)} />
        <ToggleSetting title="Товары вне матрицы" description="Разрешить клиенту запрашивать отсутствующие позиции." value={settings.allowCustomItems} onChange={(value) => set("allowCustomItems", value)} />
        <ToggleSetting title="Редактирование новых заказов" description="Клиент может менять заказ до принятия менеджером." value={settings.allowClientEdit} onChange={(value) => set("allowClientEdit", value)} />
        <ToggleSetting title="Удаление новых заказов" description="Клиент может удалить заказ со статусом «Новый»." value={settings.allowClientDelete} onChange={(value) => set("allowClientDelete", value)} />
        <ToggleSetting title="Повтор заказа" description="Показывать кнопку для быстрого повторения заказа." value={settings.allowRepeatOrder} onChange={(value) => set("allowRepeatOrder", value)} />
        <ToggleSetting title="Обязательный профиль" description="Запретить заказ без данных организации." value={settings.requireProfile} onChange={(value) => set("requireProfile", value)} />
        <ToggleSetting title="Обязательный адрес" description="Запретить заказ без сохранённого адреса." value={settings.requireAddress} onChange={(value) => set("requireAddress", value)} />
        <ToggleSetting title="Удаление менеджером" description="Разрешить менеджеру удалять тестовые заказы." value={settings.managerCanDeleteOrders} onChange={(value) => set("managerCanDeleteOrders", value)} />
        <ToggleSetting title="Избранные товары" description="Клиент может отмечать часто используемые товары." value={settings.showFavorites} onChange={(value) => set("showFavorites", value)} />
        <ToggleSetting title="Автосохранение черновика" description="Незавершённый новый заказ сохраняется в браузере." value={settings.enableDrafts} onChange={(value) => set("enableDrafts", value)} />
      </div>
      <ManagerPromotionPanel />
      <PasswordSecurityPanel />
    </section>
  );
}

function formatFileSize(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function ManagerBackup({ data, onImport, onClearOrders, onResetAll, onReload }) {
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadBackups = async () => {
    try {
      const result = await api.listBackups();
      setBackups(result.backups || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const createBackup = async () => {
    setBusy(true);
    try {
      await api.createBackup({
        label: "manual",
        reason: "Ручная копия из кабинета менеджера",
      });
      await loadBackups();
      alert("Резервная копия создана на сервере.");
    } catch (createError) {
      alert(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const cleanupBackups = async () => {
    if (!window.confirm(
      "Удалить автоматические копии старше 30 дней и оставить не больше 50 копий? Ручные свежие копии сохранятся."
    )) {
      return;
    }

    setBusy(true);
    try {
      const result = await api.cleanupBackups({
        maxFiles: 50,
        automaticMaxAgeDays: 30,
      });
      await loadBackups();
      alert(
        result.removed?.length
          ? `Удалено старых копий: ${result.removed.length}.`
          : "Старых копий для удаления нет."
      );
    } catch (cleanupError) {
      alert(cleanupError.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = async (item) => {
    setBusy(true);
    try {
      const blob = await api.downloadBackup(item.fileName);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      alert(downloadError.message);
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (item) => {
    if (!window.confirm(
      `Восстановить данные из копии «${item.fileName}»? Перед восстановлением сервер автоматически создаст страховочную копию.`
    )) {
      return;
    }

    setBusy(true);
    try {
      await api.restoreBackup(item.fileName);
      await onReload();
      await loadBackups();
      alert("Данные восстановлены. Кабинет обновлён.");
    } catch (restoreError) {
      alert(restoreError.message);
    } finally {
      setBusy(false);
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clover-public-backup-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { onImport(JSON.parse(String(reader.result))); alert("JSON-копия загружена."); }
      catch { alert("Не удалось прочитать файл резервной копии."); }
      event.target.value = "";
    };
    reader.readAsText(file);
  };

  return <section className="panel" style={{ marginTop: 0 }}>
    <div className="panel-heading"><div><p className="eyebrow">Защита данных</p><h2>Полные резервные копии</h2><p>Копии включают клиентов, заказы, матрицы, настройки, пароли и фотографии товаров. Они хранятся только на вашем компьютере.</p></div><div className="inline-actions"><button className="secondary-button" type="button" disabled={busy} onClick={cleanupBackups}>Очистить старые</button><button className="primary-button" type="button" disabled={busy} onClick={createBackup}>{busy ? "Подождите..." : "Создать полную копию"}</button></div></div>
    <div className="profile-summary">
      <article><span>Серверных копий</span><strong>{backups.length}</strong></article><article><span>Товаров</span><strong>{data.products.length}</strong></article><article><span>Заказов</span><strong>{data.orders.length}</strong></article><article><span>Связей с клиентами</span><strong>{Object.keys(data.clientLinks).length}</strong></article>
    </div>
    <div className="server-safe-note">Clover автоматически создаёт полную копию при первом запуске каждого дня, перед полным сбросом и перед восстановлением. Перед восстановлением всегда создаётся страховочная копия.</div>
    {error && <div className="auth-error" style={{ marginTop: 14 }}>{error}</div>}
    <div className="backup-list">
      {backups.map((item) => <article className="backup-row" key={item.fileName}>
        <div><h3>{item.reason}</h3><p>{formatDateTime(item.createdAt)} · {formatFileSize(item.size)} · {item.includesPhotos ? `полная копия, фото: ${item.photoCount || 0}` : "старая JSON-копия без фото"}<br />{item.fileName}</p></div>
        <div className="inline-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => downloadBackup(item)}>Скачать</button><button className="secondary-button" type="button" disabled={busy} onClick={() => restoreBackup(item)}>Восстановить</button></div>
      </article>)}
      {!backups.length && !error && <div className="empty-box">Копии пока не созданы.</div>}
    </div>
    <details style={{ marginTop: 22 }}>
      <summary style={{ cursor: "pointer", color: "#4f8d4b", fontWeight: 800 }}>Дополнительная переносимая JSON-копия</summary>
      <p className="muted small">Эта копия не содержит аккаунты и пароли. Она нужна только для переноса каталога, заказов и настроек.</p>
      <div className="backup-actions"><button className="secondary-button" type="button" onClick={exportData}>Скачать JSON-копию</button><label className="import-label">Загрузить JSON-копию<input type="file" accept="application/json" onChange={importFile} /></label><button className="danger-button" type="button" onClick={onClearOrders}>Удалить все заказы</button><button className="danger-button" type="button" onClick={onResetAll}>Полный сброс</button></div>
    </details>
  </section>;
}

const AUDIT_ACTION_LABELS = {
  "auth.register": "Зарегистрирован клиент",
  "auth.login": "Вход в кабинет",
  "orders.save": "Сохранены заказы",
  "products.save": "Изменён каталог",
  "settings.save": "Изменены настройки",
  "manager.notification": "Отправлено уведомление менеджеру",
  "manager.notification.read": "Уведомление отмечено прочитанным",
  "manager.notification.read_all": "Все уведомления отмечены прочитанными",
  "manager.notification.test": "Проверены каналы уведомлений",
  "client.matrix.save": "Изменена матрица клиента",
  "client.profile.manager_update": "Менеджер изменил данные клиента",
  "product.image.upload": "Загружено фото товара",
  "product.image.delete": "Удалено фото товара",
  "backup.create": "Создана резервная копия",
  "backup.restore": "Восстановлена резервная копия",
  "backup.cleanup": "Удалены старые резервные копии",
  "server.reset": "Выполнен полный сброс",
  "exchange.check": "Проверен заказ для 1С",
  "exchange.send.test": "Заказ поставлен в очередь 1С",
  "exchange.send.error": "Ошибка тестовой передачи в 1С",
  "exchange.reset": "Сброшен статус обмена с 1С",
  "exchange.download.order": "Скачан файл заказа для 1С",
  "exchange.download.batch": "Скачан пакет заказов для 1С",
  "exchange.config.save": "Сохранены настройки подключения к 1С",
  "exchange.connection.test": "Проверено подключение к 1С",
  "exchange.connection.error": "Ошибка подключения к 1С",
  "exchange.catalog.preview": "Просмотрен справочник 1С",
  "exchange.catalog.error": "Ошибка чтения справочника 1С",
  "one-c.products.receive": "Получена номенклатура из 1С",
  "one-c.products.auto-link": "Автоматически сопоставлены товары с 1С",
  "exchange.send.draft": "Создан черновик заказа в 1С",
  "exchange.send.draft.error": "Ошибка создания черновика в 1С",
};

function formatAuditDetails(item) {
  const details = item?.details || {};

  switch (item?.action) {
    case "orders.save":
      return `Заказов сохранено: ${Number(details.count) || 0}`;
    case "products.save":
      return `Товаров в каталоге: ${Number(details.count) || 0}`;
    case "client.matrix.save":
      return `Изменено клиентов: ${Number(details.clients) || 0}`;
    case "client.profile.manager_update":
      return `Клиент: ${details.clientId || "—"} · адресов: ${Number(details.addresses) || 0}${details.changedEmail ? " · изменён email для входа" : ""}`;
    case "product.image.upload":
      return details.productName
        ? `Товар: ${details.productName}`
        : "Фотография загружена";
    case "product.image.delete":
      return details.productName
        ? `Товар: ${details.productName}`
        : "Фотография удалена";
    case "backup.create":
      return `${details.reason || "Резервная копия"}${
        details.photoCount !== undefined
          ? ` · фотографий: ${details.photoCount}`
          : ""
      }`;
    case "backup.restore":
      return `Файл: ${details.fileName || "копия"} · фотографий восстановлено: ${
        Number(details.restoredPhotos) || 0
      }`;
    case "backup.cleanup":
      return `Удалено копий: ${Array.isArray(details.removed) ? details.removed.length : 0} · осталось: ${Number(details.remaining) || 0}`;
    case "settings.save":
      return "Настройки кабинета обновлены";
    case "auth.login":
      return "Успешный вход";
    case "auth.register":
      return "Создан новый аккаунт клиента";
    case "server.reset":
      return "Данные сброшены после создания страховочной копии";
    case "exchange.check":
      return `Заказ № ${details.orderNumber || "—"} · ${details.ready ? "готов к передаче" : `ошибок: ${(details.issues || []).length}`}`;
    case "exchange.send.test":
      return `Заказ № ${details.orderNumber || "—"} · квитанция: ${details.receipt || "—"}`;
    case "exchange.send.error":
      return `Заказ № ${details.orderNumber || "—"} · ошибок: ${(details.issues || []).length}`;
    case "exchange.reset":
      return `Заказ № ${details.orderNumber || "—"}`;
    case "exchange.download.order":
      return `Заказ № ${details.orderNumber || "—"} · формат: ${String(details.format || "json").toUpperCase()}`;
    case "exchange.download.batch":
      return `Формат: ${String(details.format || "json").toUpperCase()} · заказов: ${Number(details.count) || 0}`;
    case "exchange.config.save":
      return `Режим: ${details.mode === "real" ? "реальная 1С" : "симулятор"} · адрес: ${details.baseUrlConfigured ? "заполнен" : "не заполнен"}`;
    case "exchange.connection.test":
      return `${details.mode === "real" ? "Реальная 1С" : "Симулятор"} · ${details.configuration || "подключение проверено"}`;
    case "exchange.connection.error":
      return details.message || "Ошибка подключения";
    case "exchange.catalog.preview":
      return `${details.type === "clients" ? "Контрагенты" : "Номенклатура"} · записей: ${Number(details.count) || 0}`;
    case "exchange.catalog.error":
      return `${details.type || "Справочник"} · ${details.message || "ошибка"}`;
    case "one-c.products.receive":
      return `Получено: ${Number(details.received) || 0} · новых связей: ${Number(details.newlyLinked) || 0} · без совпадения: ${Number(details.unmatched) || 0}`;
    case "one-c.products.auto-link":
      return `Товаров Clover: ${Number(details.cloverTotal) || 0} · связанных: ${Number(details.linked) || 0} · новых связей: ${Number(details.newlyLinked) || 0}`;
    case "exchange.send.draft":
      return `Заказ № ${details.orderNumber || "—"} · документ ${details.documentNumber || details.documentId || "создан"} · ${details.mode === "real" ? "1С" : "симулятор"}`;
    case "exchange.send.draft.error":
      return `Заказ № ${details.orderNumber || "—"} · ${details.message || "ошибка"}`;
    default:
      return "";
  }
}

function ManagerExchange({ onReload, onNavigate }) {
  const [data, setData] = useState(null);
  const [oneC, setOneC] = useState(null);
  const [configForm, setConfigForm] = useState({
    mode: "simulation",
    baseUrl: "",
    healthPath: "/hs/clover/v1/health",
    clientsPath: "/hs/clover/v1/clients",
    productsPath: "/hs/clover/v1/products",
    draftOrderPath: "/hs/clover/v1/orders/draft",
    username: "",
    timeoutMs: 10000,
    allowDraftCreation: false,
  });
  const [connectionResult, setConnectionResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingExchange, setLoadingExchange] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [busyConnection, setBusyConnection] = useState("");
  const [batchStatus, setBatchStatus] = useState("all");

  const applyOneCState = (result) => {
    setOneC(result);
    if (result?.config) {
      setConfigForm((current) => ({
        ...current,
        ...result.config,
      }));
    }
  };

  const load = async () => {
    setLoadingExchange(true);
    try {
      const [exchangeResult, oneCResult] = await Promise.all([
        api.getExchange(300),
        api.getOneCConfig(),
      ]);
      setData(exchangeResult);
      applyOneCState(oneCResult);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingExchange(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveConnection = async () => {
    setBusyConnection("save");
    try {
      const result = await api.saveOneCConfig(configForm);
      applyOneCState(result);
      setConnectionResult(null);
      setPreview(null);
      alert("Настройки подключения к 1С сохранены.");
    } catch (saveError) {
      alert(saveError.message);
    } finally {
      setBusyConnection("");
    }
  };

  const testConnection = async () => {
    setBusyConnection("test");
    try {
      const saved = await api.saveOneCConfig(configForm);
      applyOneCState(saved);
      const result = await api.testOneCConnection();
      applyOneCState(result);
      setConnectionResult(result.result || null);
      setPreview(null);
    } catch (testError) {
      setConnectionResult({ ok: false, message: testError.message });
    } finally {
      setBusyConnection("");
    }
  };

  const loadPreview = async (type) => {
    setBusyConnection(type);
    try {
      const saved = await api.saveOneCConfig(configForm);
      applyOneCState(saved);
      const result = await api.previewOneCCatalog(type, 20);
      setPreview(result);
    } catch (previewError) {
      alert(previewError.message);
    } finally {
      setBusyConnection("");
    }
  };

  const action = async (row, type) => {
    setBusyId(row.id);
    try {
      let result;
      if (type === "check") result = await api.checkExchangeOrder(row.id);
      if (type === "send") {
        await api.checkExchangeOrder(row.id);
        result = await api.sendExchangeOrder(row.id);
      }
      if (type === "draft") {
        await api.checkExchangeOrder(row.id);
        result = await api.createOneCDraft(row.id);
      }
      if (type === "reset") result = await api.resetExchangeOrder(row.id);
      if (result?.result?.message) alert(result.result.message);
      await onReload();
      await load();
    } catch (actionError) {
      alert(actionError.message);
      await onReload();
      await load();
    } finally {
      setBusyId("");
    }
  };

  const downloadOne = async (row, format) => {
    setBusyId(row.id);
    try {
      const blob = await api.downloadExchangeOrder(row.id, format);
      downloadBlobFile(blob, `clover-order-${row.number || row.id}-1c.${format}`);
    } catch (downloadError) {
      alert(downloadError.message);
    } finally {
      setBusyId("");
    }
  };

  const downloadBatch = async (format) => {
    try {
      const blob = await api.downloadExchangeBatch(format, batchStatus);
      downloadBlobFile(blob, `clover-orders-1c.${format}`);
    } catch (downloadError) {
      alert(downloadError.message);
    }
  };

  const summary = data?.summary || {};
  const runtime = oneC?.runtime || {};
  const modeIsReal = configForm.mode === "real";
  const connectionLabel = modeIsReal
    ? runtime.readyForRead
      ? "Режим реальной 1С"
      : "Требуется адрес публикации"
    : "Безопасный симулятор";

  return <section>
    <div className="exchange-notice">
      <strong>{connectionLabel}.</strong>{" "}
      В версии 2.0–3.0 добавлены настройки соединения, проверка HTTP-сервиса,
      чтение контрагентов и номенклатуры, а также создание непроведённого
      черновика. Реальная запись дополнительно блокируется на сервере и не
      включится случайно.
    </div>

    <section className="panel" style={{ marginTop: 0 }}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">1С:УНФ 1.6</p>
          <h2>Подключение к рабочей базе</h2>
          <p>Сначала используйте симулятор. Реальный режим включаем после установки расширения и публикации HTTP-сервиса.</p>
        </div>
        <span className={`badge ${modeIsReal ? "exchange-ready" : "exchange-pending"}`}>{connectionLabel}</span>
      </div>

      <div className="form-grid">
        <label className="field">
          Режим подключения
          <select value={configForm.mode} onChange={(event) => setConfigForm({ ...configForm, mode: event.target.value })}>
            <option value="simulation">Безопасный симулятор</option>
            <option value="real">Реальная 1С по локальной сети</option>
          </select>
        </label>
        <label className="field">
          Адрес опубликованной базы 1С
          <input
            value={configForm.baseUrl || ""}
            disabled={Boolean(runtime.baseUrlFromEnv)}
            placeholder="http://192.168.1.10/clover"
            onChange={(event) => setConfigForm({ ...configForm, baseUrl: event.target.value })}
          />
        </label>
        <label className="field">
          Пользователь обмена 1С
          <input
            value={configForm.username || ""}
            disabled={Boolean(runtime.usernameFromEnv)}
            placeholder="CloverExchange"
            onChange={(event) => setConfigForm({ ...configForm, username: event.target.value })}
          />
        </label>
        <label className="field">
          Тайм-аут, мс
          <input
            type="number"
            min="3000"
            max="30000"
            value={configForm.timeoutMs || 10000}
            onChange={(event) => setConfigForm({ ...configForm, timeoutMs: Number(event.target.value) || 10000 })}
          />
        </label>
      </div>

      <details style={{ marginTop: 12 }}>
        <summary className="section-toggle">Технические пути HTTP-сервиса</summary>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="field">Проверка связи<input value={configForm.healthPath || ""} onChange={(event) => setConfigForm({ ...configForm, healthPath: event.target.value })} /></label>
          <label className="field">Контрагенты<input value={configForm.clientsPath || ""} onChange={(event) => setConfigForm({ ...configForm, clientsPath: event.target.value })} /></label>
          <label className="field">Номенклатура<input value={configForm.productsPath || ""} onChange={(event) => setConfigForm({ ...configForm, productsPath: event.target.value })} /></label>
          <label className="field">Черновик заказа<input value={configForm.draftOrderPath || ""} onChange={(event) => setConfigForm({ ...configForm, draftOrderPath: event.target.value })} /></label>
        </div>
      </details>

      <div className="setting-card" style={{ marginTop: 12 }}>
        <div>
          <h3>Разрешить создание черновика</h3>
          <p>Даже после включения здесь рабочая запись останется заблокированной, пока в server/.env не установлено ONEC_WRITE_ENABLED=true.</p>
        </div>
        <button
          className={configForm.allowDraftCreation ? "toggle active" : "toggle"}
          type="button"
          onClick={() => setConfigForm({ ...configForm, allowDraftCreation: !configForm.allowDraftCreation })}
          aria-label="Разрешить создание черновика"
        ><span /></button>
      </div>

      <div className="exchange-actions">
        <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={saveConnection}>Сохранить настройки</button>
        <button className="primary-button" disabled={Boolean(busyConnection)} type="button" onClick={testConnection}>{busyConnection === "test" ? "Проверяем…" : "Проверить связь"}</button>
        <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={() => loadPreview("clients")}>Контрагенты</button>
        <button className="secondary-button" disabled={Boolean(busyConnection)} type="button" onClick={() => loadPreview("products")}>Номенклатура</button>
      </div>

      <div className="toolbar four" style={{ marginTop: 12 }}>
        <div className="warning-box" style={{ padding: 10 }}>Секрет в server/.env: {runtime.secretConfigured ? "настроен" : "не настроен"}</div>
        <div className="warning-box" style={{ padding: 10 }}>Чтение: {runtime.readyForRead ? "доступно" : "не готово"}</div>
        <div className="warning-box" style={{ padding: 10 }}>Запись: {runtime.readyForWrite ? "разрешена" : "заблокирована"}</div>
        <div className="warning-box" style={{ padding: 10 }}>База: УНФ 1.6 · документ ЗаказПокупателя</div>
      </div>

      {connectionResult && (
        <div className={connectionResult.ok === false ? "auth-error" : "success-box"} style={{ marginTop: 12 }}>
          {connectionResult.ok === false
            ? connectionResult.message
            : <><strong>Связь работает.</strong> {connectionResult.configuration || "1С:УНФ"}{connectionResult.database ? ` · база ${connectionResult.database}` : ""}{connectionResult.extensionVersion ? ` · расширение ${connectionResult.extensionVersion}` : ""}</>}
        </div>
      )}

      {preview && (
        <div className="comment-box" style={{ marginTop: 12 }}>
          <strong>{preview.type === "clients" ? "Контрагенты" : "Номенклатура"}: {preview.count || 0}</strong>
          <p className="muted small">Только просмотр. Данные Clover пока не изменяются.</p>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {(preview.items || []).map((item, index) => (
              <div key={item.id || index} style={{ paddingBottom: 8, borderBottom: "1px solid #e5ebe3" }}>
                <strong>{item.name || item.presentation || item.code || "Без названия"}</strong>
                <small style={{ display: "block" }}>ID: {item.id || "—"}{item.article ? ` · артикул ${item.article}` : ""}{item.inn ? ` · ИНН ${item.inn}` : ""}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>

    <div className="panel-heading">
      <div>
        <p className="eyebrow">Интеграция</p>
        <h2>Центр обмена с 1С</h2>
        <p>Проверка заказов, тестовая передача, черновики и журнал обмена.</p>
      </div>
      <button className="secondary-button" type="button" onClick={load}>Обновить</button>
    </div>
    {error && <div className="auth-error">{error}</div>}
    <div className="exchange-grid">
      <article><span>Не отправлено</span><strong>{summary.notSent || 0}</strong></article>
      <article><span>Готово</span><strong>{summary.ready || 0}</strong></article>
      <article><span>Передано тестово</span><strong>{summary.sent || 0}</strong></article>
      <article><span>Черновики 1С</span><strong>{summary.draft || 0}</strong></article>
      <article><span>Ошибки</span><strong>{summary.error || 0}</strong></article>
    </div>
    <div className="toolbar four">
      <select value={batchStatus} onChange={(e) => setBatchStatus(e.target.value)}><option value="all">Все заказы</option>{Object.entries(EXCHANGE_STATUS_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>
      <button className="secondary-button" type="button" onClick={() => downloadBatch("json")}>Скачать пакет JSON</button>
      <button className="secondary-button" type="button" onClick={() => downloadBatch("csv")}>Скачать пакет CSV</button>
      <div className="warning-box" style={{ padding: 10 }}>Не сопоставлено клиентов: {summary.missingClientLinks || 0} · товаров: {summary.missingProductLinks || 0}</div>
    </div>

    {(data?.matching?.clients?.length || data?.matching?.products?.length) > 0 && (
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Подготовка данных</p>
            <h2>Мастер сопоставления с 1С</h2>
            <p>Показаны только клиенты и товары, которые используются в заказах и ещё не имеют ID из 1С.</p>
          </div>
        </div>
        <div className="form-grid">
          <div className="comment-box">
            <strong>Клиенты без связи с 1С: {data?.matching?.clients?.length || 0}</strong>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {(data?.matching?.clients || []).slice(0, 8).map((client) => (
                <div key={client.id}>
                  <strong>{client.companyName || client.email}</strong>
                  <small style={{ display: "block" }}>{client.contactName || "Контакт не указан"} · {client.email}</small>
                </div>
              ))}
            </div>
            <button className="secondary-button" style={{ marginTop: 12 }} type="button" onClick={() => onNavigate("clients")}>Открыть клиентов</button>
          </div>
          <div className="comment-box">
            <strong>Товары без ID номенклатуры: {data?.matching?.products?.length || 0}</strong>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {(data?.matching?.products || []).slice(0, 8).map((product) => (
                <div key={product.id}>
                  <strong>{product.name}</strong>
                  <small style={{ display: "block" }}>{product.code || "Без внутреннего кода"}</small>
                </div>
              ))}
            </div>
            <button className="secondary-button" style={{ marginTop: 12 }} type="button" onClick={() => onNavigate("products")}>Открыть товары</button>
          </div>
        </div>
      </section>
    )}

    <div className="exchange-order-list">
      {(data?.rows || []).map((row) => {
        const exchange = normalizeOrderExchange(row.exchange);
        const busy = busyId === row.id;
        return <article className="exchange-order-row" key={row.id}>
          <div className="exchange-order-head"><div><span className={`badge ${exchangeBadgeClass(exchange.status)}`}>{EXCHANGE_STATUS_LABELS[exchange.status]}</span><h3>Заказ № {row.number} · {row.customerName}</h3><p className="muted small">Создан {formatDateTime(row.createdAt)} · доставка {formatDate(row.deliveryDate)} · статус заказа: {row.orderStatus}</p></div><strong>{row.validation?.ready ? "Готов" : `${row.validation?.issues?.length || 0} ошибок`}</strong></div>
          {row.validation?.issues?.length > 0 && <ul className="exchange-issues">{row.validation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          {exchange.message && <div className="exchange-message">{exchange.message}{exchange.receipt ? ` · ${exchange.receipt}` : ""}</div>}
          {exchange.remoteDocument && <div className="exchange-message">Документ: {exchange.remoteDocument.number || exchange.remoteDocument.id || "—"} · {exchange.remoteDocument.posted ? "проведён" : "не проведён"} · {exchange.remoteDocument.mode === "real" ? "рабочая 1С" : "симулятор"}</div>}
          <div className="exchange-actions">
            <button className="secondary-button" disabled={busy} type="button" onClick={() => action(row, "check")}>Проверить</button>
            <button className="secondary-button" disabled={busy} type="button" onClick={() => action(row, "send")}>Проверить и передать тестово</button>
            <button className="primary-button" disabled={busy || !runtime.readyForWrite} title={!runtime.readyForWrite ? "Запись пока заблокирована настройками" : ""} type="button" onClick={() => action(row, "draft")}>{modeIsReal ? "Черновик в 1С" : "Черновик в симуляторе"}</button>
            <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOne(row, "json")}>JSON</button>
            <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadOne(row, "csv")}>CSV</button>
            {exchange.status !== "not_sent" && <button className="secondary-button" disabled={busy} type="button" onClick={() => action(row, "reset")}>Сбросить</button>}
          </div>
        </article>;
      })}
      {!loadingExchange && !(data?.rows || []).length && !error && <div className="empty-box">Заказов для обмена пока нет.</div>}
      {loadingExchange && <div className="empty-box">Загружаем центр обмена...</div>}
    </div>

    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">История</p><h2>Журнал обмена</h2></div></div>
      <div className="exchange-log">
        {(data?.log || []).map((item) => <article className="exchange-log-row" key={item.id}><h4>{AUDIT_ACTION_LABELS[item.action] || item.action}</h4><p>{formatDateTime(item.createdAt)} · заказ № {item.details?.orderNumber || "—"} · {item.userEmail || "Система"}</p></article>)}
        {!(data?.log || []).length && <div className="empty-box">Операций обмена пока нет.</div>}
      </div>
    </section>
  </section>;
}

function ManagerAudit() {
  const [items, setItems] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoadingAudit(true);
    try {
      const result = await api.listAudit(250);
      setItems(result.audit || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return <section className="panel" style={{ marginTop: 0 }}>
    <div className="panel-heading"><div><p className="eyebrow">Контроль</p><h2>Журнал действий</h2><p>Последние входы, изменения каталога, матриц, фотографий и резервных копий.</p></div><button className="secondary-button" type="button" onClick={load}>Обновить</button></div>
    {error && <div className="auth-error">{error}</div>}
    <div className="audit-list">
      {items.map((item) => <article className="audit-row" key={item.id}>
        <div><h3>{AUDIT_ACTION_LABELS[item.action] || item.action}</h3><p>{formatDateTime(item.createdAt)} · {item.userEmail || "Система"} · {item.userRole === "manager" ? "менеджер" : item.userRole === "client" ? "клиент" : "система"}</p>{formatAuditDetails(item) && <div className="audit-details">{formatAuditDetails(item)}</div>}</div>
      </article>)}
      {!loadingAudit && !items.length && !error && <div className="empty-box">Записей пока нет.</div>}
      {loadingAudit && <div className="empty-box">Загружаем журнал...</div>}
    </div>
  </section>;
}

const MANAGER_NOTIFICATION_META = {
  new_order: { label: "Новый заказ", tab: "orders" },
  order_changed: { label: "Заказ изменён", tab: "orders" },
  order_deleted: { label: "Заказ удалён", tab: "orders" },
  custom_item: { label: "Товар вне матрицы", tab: "orders" },
  reconciliation_request: { label: "Акт сверки", tab: "acts" },
  client_registration: { label: "Новый клиент", tab: "clients" },
  onec_error: { label: "Ошибка 1С", tab: "exchange" },
  test: { label: "Тест", tab: "settings" },
};

function managerNotificationTab(notification) {
  return MANAGER_NOTIFICATION_META[notification?.type]?.tab || "orders";
}

function ManagerNotificationCenter({ notifications = [], onOpen, onRead, onReadAll }) {
  const unread = notifications.filter((item) => !item.readAt);
  if (!unread.length) return null;
  return (
    <section className="manager-notification-center">
      <div className="manager-notification-header">
        <div>
          <p className="eyebrow">Уведомления менеджера</p>
          <h2>Новых событий: {unread.length}</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onReadAll}>Отметить всё прочитанным</button>
      </div>
      <div className="manager-notification-list">
        {unread.slice(0, 5).map((item) => (
          <article className="manager-notification-item" key={item.id}>
            <div>
              <span className="badge yellow">{MANAGER_NOTIFICATION_META[item.type]?.label || "Событие"}</span>
              <h3>{item.title}</h3>
              {item.body && <p>{item.body}</p>}
              <small>{formatDateTime(item.createdAt)}</small>
            </div>
            <div className="inline-actions">
              <button className="primary-button" type="button" onClick={() => onOpen(item)}>Открыть</button>
              <button className="secondary-button" type="button" onClick={() => onRead(item)}>Прочитано</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ManagerDashboard({ orders, products, setProducts, profile, addresses, serverClients, reconciliationRequests, managerNotifications, settings, setSettings, clientLinks, setClientLinks, managerNotice, onDismissNotice, onReadNotification, onReadAllNotifications, onUpdateOrder, onBulkUpdateOrders, onDeleteOrder, onCreateProductFromCustom, onImport, onClearOrders, onResetAll, onReload, onLogout }) {
  const [tab, setTab] = useState(readManagerActiveTab);

  const selectTab = (nextTab) => {
    setTab(nextTab);
    writeManagerActiveTab(nextTab);
  };
  const clients = useMemo(() => {
    const map = new Map(
      (serverClients || []).map((client) => [
        client.id,
        {
          ...client,
          isRegistered: true,
          orders: [],
          addresses: normalizeManagerClientAddresses(client.addresses),
        },
      ])
    );

    orders.forEach((order) => {
      const id = order.clientId || `legacy-${order.customerEmail || order.customerName}`;
      const current = map.get(id) || {
        id,
        companyName: order.customerName || "",
        contactName: order.customerContact || "",
        phone: order.customerPhone || "",
        email: order.customerEmail || "",
        isRegistered: false,
        orders: [],
        addresses: [],
      };
      current.orders.push(order);
      if (
        order.address &&
        !current.addresses.some((item) =>
          String(typeof item === "string" ? item : item.address) ===
          String(order.address)
        )
      ) {
        current.addresses.push({
          id: `order-address-${order.id || current.addresses.length}`,
          label: "Адрес из заказа",
          address: order.address,
          isDefault: current.addresses.length === 0,
        });
      }
      map.set(id, current);
    });

    return [...map.values()].map((client) => ({
      ...client,
      lastOrder: [...client.orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0],
    }));
  }, [orders, serverClients]);

  const newCount = orders.filter((order) => order.status === "Новый").length;
  const workCount = orders.filter((order) => ["Принят", "Собирается", "Готов к доставке"].includes(order.status)).length;
  const exchangeErrors = orders.filter((order) => normalizeOrderExchange(order.exchange).status === "error").length;


  return <main className="clover-app">
    <Header title="Кабинет менеджера" subtitle="V18 · заказы, документы, безопасность и 1С" onLogout={onLogout} />
    <section className="page-content">
      <div className="page-title-row"><div><p className="eyebrow">Управление</p><h1>Рабочее пространство</h1><p>Заказы, клиенты, товары, документы и тестовый контур обмена с 1С.</p></div></div>
      {managerNotice && (
        <div className="exchange-notice" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <strong>{managerNotice.title}</strong>
              {managerNotice.body && <div>{managerNotice.body}</div>}
              <div>{formatDateTime(managerNotice.createdAt)}</div>
              {managerNotice.pendingCount > 1 && (
                <div>Непросмотренных событий: {managerNotice.pendingCount}</div>
              )}
            </div>
            <div className="exchange-actions">
              <button className="primary-button" type="button" onClick={() => { selectTab(managerNotificationTab(managerNotice)); onDismissNotice(); }}>
                Открыть
              </button>
              <button className="secondary-button" type="button" onClick={onDismissNotice}>Прочитано</button>
            </div>
          </div>
        </div>
      )}
      <ManagerNotificationCenter
        notifications={managerNotifications}
        onOpen={(item) => { selectTab(managerNotificationTab(item)); onReadNotification(item); }}
        onRead={onReadNotification}
        onReadAll={onReadAllNotifications}
      />
      <div className="stats-grid">
        <article className="stat-card"><span>Новые заказы</span><strong>{newCount}</strong></article>
        <article className="stat-card"><span>В работе</span><strong>{workCount}</strong></article>
        <article className="stat-card"><span>Ошибки обмена</span><strong>{exchangeErrors}</strong></article>
        <article className="stat-card"><span>Активных товаров</span><strong>{products.filter((item) => item.active).length}</strong></article>
      </div>
      <nav className="manager-nav">{MANAGER_TABS.map(([id,label]) => <button className={tab === id ? "active" : ""} type="button" key={id} onClick={() => selectTab(id)}>{label}</button>)}</nav>
      {tab === "orders" && <ManagerOrders orders={orders} settings={settings} onUpdateOrder={onUpdateOrder} onBulkUpdateOrders={onBulkUpdateOrders} onDeleteOrder={onDeleteOrder} onCreateProductFromCustom={onCreateProductFromCustom} onReload={onReload} />}
      {tab === "exchange" && <ManagerExchange onReload={onReload} onNavigate={selectTab} />}
      {tab === "clients" && <ManagerClients clients={clients} products={products} clientLinks={clientLinks} setClientLinks={setClientLinks} onReload={onReload} />}
      {tab === "acts" && <ManagerReconciliation requests={reconciliationRequests} onReload={onReload} />}
      {tab === "products" && <ManagerProducts products={products} setProducts={setProducts} />}
      {tab === "settings" && <ManagerSettings settings={settings} setSettings={setSettings} />}
      {tab === "backup" && <ManagerBackup data={{ orders, products, profile, addresses, settings, clientLinks }} onImport={onImport} onClearOrders={onClearOrders} onResetAll={onResetAll} onReload={onReload} />}
      {tab === "audit" && <ManagerAudit />}
    </section>
  </main>;
}

function App() {
  const [role, setRole] = useState("client");
  const [authUser, setAuthUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(getApiToken()));
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(Boolean(getApiToken()));
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState("");

  const [products, setProducts] = useState(
    DEFAULT_PRODUCTS.map(normalizeProduct)
  );
  const [fullCatalogProducts, setFullCatalogProducts] = useState(
    DEFAULT_PRODUCTS.map(normalizeProduct)
  );
  const [catalogPolicy, setCatalogPolicy] = useState({
    matrixMode: "pending",
    allowFullCatalog: false,
    matrixReady: false,
    matrixProductIds: [],
  });
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [addresses, setAddresses] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [clientLinks, setClientLinks] = useState({});
  const [serverClients, setServerClients] = useState([]);
  const [reconciliationRequests, setReconciliationRequests] = useState([]);
  const [managerNotifications, setManagerNotifications] = useState([]);
  const [catalogSession, setCatalogSession] = useState(null);
  const [managerNotice, setManagerNotice] = useState(null);

  const applyManagerNotificationList = (items) => {
    const incomingNotifications = Array.isArray(items) ? items : [];
    const unreadNotifications = incomingNotifications.filter((item) => !item.readAt);
    setManagerNotifications(incomingNotifications);
    setManagerNotice(
      unreadNotifications[0]
        ? { ...unreadNotifications[0], pendingCount: unreadNotifications.length }
        : null
    );
  };

  const applyBootstrap = (data) => {
    setAuthUser(data.user);
    setRole(data.user.role);
    setProducts(
      (data.products || DEFAULT_PRODUCTS).map(normalizeProduct)
    );
    setFullCatalogProducts(
      (
        data.fullCatalogProducts ||
        data.products ||
        DEFAULT_PRODUCTS
      ).map(normalizeProduct)
    );
    setCatalogPolicy({
      matrixMode: "pending",
      allowFullCatalog: false,
      matrixReady: false,
      matrixProductIds: [],
      ...(data.catalogPolicy || {}),
    });
    if (!data.catalogPolicy?.allowFullCatalog) {
      setShowFullCatalog(false);
    }

    const incomingOrders = Array.isArray(data.orders) ? data.orders : [];

    if (data.user.role === "manager") {
      applyManagerNotificationList(data.managerNotifications);
    } else {
      setManagerNotifications([]);
      setManagerNotice(null);
    }

    setOrders(incomingOrders);
    setProfile({
      ...EMPTY_PROFILE,
      ...(data.profile || EMPTY_PROFILE),
    });
    setAddresses(
      Array.isArray(data.addresses) ? data.addresses : []
    );
    setFavorites(
      Array.isArray(data.favorites) ? data.favorites : []
    );
    setSettings({
      ...DEFAULT_SETTINGS,
      ...(data.settings || DEFAULT_SETTINGS),
    });
    setClientLinks(data.clientLinks || {});
    setServerClients(
      Array.isArray(data.clients) ? data.clients : []
    );
    setReconciliationRequests(
      Array.isArray(data.reconciliationRequests) ? data.reconciliationRequests : []
    );
    setHydrated(true);
  };

  const loadBootstrap = async ({ silent = false } = {}) => {
    // Показываем полноэкранную загрузку только при первом запуске/входе.
    // После загрузки кабинета фоновые обновления не должны заменять экран.
    const shouldBlockScreen = !silent && !hydrated;
    if (shouldBlockScreen) {
      setLoading(true);
    }

    try {
      const data = await api.bootstrap();
      applyBootstrap(data);
      setIsLoggedIn(true);
      setSyncError("");
    } catch (error) {
      if (error.status === 401) {
        clearApiToken();
        setAuthUser(null);
        setIsLoggedIn(false);
        setHydrated(false);
      } else {
        setSyncError(error.message);
      }
    } finally {
      if (shouldBlockScreen) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!getApiToken()) {
      setLoading(false);
      return;
    }

    loadBootstrap();
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !hydrated || authUser?.role !== "manager") {
      return undefined;
    }

    let active = true;
    let requestInProgress = false;

    const refreshNotifications = async () => {
      if (requestInProgress) return;
      requestInProgress = true;

      try {
        const data = await api.getManagerNotifications({ limit: 100 });
        if (!active) return;
        applyManagerNotificationList(data.notifications);
        setSyncError("");
      } catch (error) {
        if (!active) return;
        if (error.status === 401) {
          clearApiToken();
          setAuthUser(null);
          setIsLoggedIn(false);
          setHydrated(false);
        } else {
          setSyncError(error.message);
        }
      } finally {
        requestInProgress = false;
      }
    };

    // В фоне обновляем только список уведомлений менеджера.
    // Полная загрузка кабинета больше не запускается по таймеру и не меняет экран в режиме ожидания.
    const intervalId = window.setInterval(refreshNotifications, 30000);
    const handleFocus = () => refreshNotifications();
    const handleVisibility = () => {
      if (!document.hidden) refreshNotifications();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isLoggedIn, hydrated, authUser?.role]);

  const scheduleSync = (callback, delay = 650) => {
    const timeoutId = window.setTimeout(async () => {
      try {
        await callback();
        setSyncError("");
      } catch (error) {
        setSyncError(
          `${error.message}. Данные останутся на экране, но сервер пока их не сохранил.`
        );
      }
    }, delay);

    return () => window.clearTimeout(timeoutId);
  };

  useEffect(() => {
    if (!hydrated || !authUser) return undefined;
    return scheduleSync(() => api.saveOrders(orders));
  }, [orders, hydrated, authUser?.id]);

  useEffect(() => {
    if (!hydrated || authUser?.role !== "client") {
      return undefined;
    }

    return scheduleSync(() => api.saveProfile(profile));
  }, [profile, hydrated, authUser?.role]);

  useEffect(() => {
    if (!hydrated || authUser?.role !== "client") {
      return undefined;
    }

    return scheduleSync(() => api.saveAddresses(addresses));
  }, [addresses, hydrated, authUser?.role]);

  useEffect(() => {
    if (!hydrated || authUser?.role !== "client") {
      return undefined;
    }

    return scheduleSync(() => api.saveFavorites(favorites));
  }, [favorites, hydrated, authUser?.role]);

  useEffect(() => {
    if (!hydrated || authUser?.role !== "manager") {
      return undefined;
    }

    return scheduleSync(() => api.saveProducts(products));
  }, [products, hydrated, authUser?.role]);

  useEffect(() => {
    if (!hydrated || authUser?.role !== "manager") {
      return undefined;
    }

    return scheduleSync(() => api.saveSettings(settings));
  }, [settings, hydrated, authUser?.role]);

  useEffect(() => {
    if (!hydrated || authUser?.role !== "manager") {
      return undefined;
    }

    return scheduleSync(() => api.saveClientLinks(clientLinks));
  }, [clientLinks, hydrated, authUser?.role]);

  const handleAuth = async (form) => {
    setAuthBusy(true);
    setAuthError("");

    try {
      const result =
        form.mode === "passkey"
          ? form.result
          : form.mode === "register"
            ? await api.register({
                companyName: form.companyName,
                contactName: form.contactName,
                phone: form.phone,
                email: form.email,
                password: form.password,
              })
            : await api.login({
                email: form.email,
                password: form.password,
              });

      if (form.mode === "register" || !result.token) {
        return result;
      }

      setManagerNotice(null);
      setManagerNotifications([]);

      setApiToken(result.token);
      setAuthUser(result.user);
      setRole(result.user.role);
      setIsLoggedIn(true);
      setLoading(true);

      const oldProfile = safeRead(STORAGE.profile, EMPTY_PROFILE);
      const oldAddresses = safeRead(STORAGE.addresses, []);
      const oldFavorites = safeRead(STORAGE.favorites, []);
      const oldOrders = safeRead(STORAGE.orders, []);
      const oldProducts = safeRead(STORAGE.products, []);
      const oldSettings = safeRead(STORAGE.settings, null);
      const oldClientLinks = safeRead(STORAGE.clientLinks, null);

      if (
        result.user.role === "client" &&
        !localStorage.getItem(
          `clover-server-migrated-client-${result.user.id}`
        ) &&
        (
          Object.values(oldProfile).some(Boolean) ||
          oldAddresses.length ||
          oldOrders.length
        )
      ) {
        await api.migrateClient({
          profile: oldProfile,
          addresses: oldAddresses,
          favorites: oldFavorites,
          orders: oldOrders,
        });

        localStorage.setItem(
          `clover-server-migrated-client-${result.user.id}`,
          "1"
        );
      }

      if (
        result.user.role === "manager" &&
        !localStorage.getItem("clover-server-migrated-manager") &&
        (
          oldProducts.length ||
          oldSettings ||
          oldClientLinks
        )
      ) {
        await api.migrateManager({
          products: oldProducts,
          settings: oldSettings,
          clientLinks: oldClientLinks,
        });

        localStorage.setItem(
          "clover-server-migrated-manager",
          "1"
        );
      }

      await loadBootstrap();
      return result;
    } catch (error) {
      clearApiToken();
      setIsLoggedIn(false);
      setHydrated(false);
      setAuthError(error.message);
      setLoading(false);
      throw error;
    } finally {
      setAuthBusy(false);
    }
  };

  const clientId = authUser?.id || "";
  const profileComplete = Object.values(profile).every((value) =>
    String(value || "").trim()
  );

  const link = {
    ...EMPTY_LINK,
    ...(clientLinks[clientId] || {}),
  };

  const catalogProducts = useMemo(() => {
    const source =
      showFullCatalog && catalogPolicy.allowFullCatalog
        ? fullCatalogProducts
        : products;

    return source.filter((product) => product.active);
  }, [
    products,
    fullCatalogProducts,
    showFullCatalog,
    catalogPolicy.allowFullCatalog,
  ]);

  const clientOrders = orders.filter(
    (order) => order.clientId === clientId
  );

  const readManagerNotification = async (notificationOrId) => {
    const notificationId = typeof notificationOrId === "string"
      ? notificationOrId
      : notificationOrId?.id;
    if (!notificationId) return;
    try {
      await api.readManagerNotification(notificationId);
      await loadBootstrap({ silent: true });
    } catch (error) {
      setSyncError(error.message);
    }
  };

  const dismissManagerNotice = async () => {
    if (!managerNotice?.id) {
      setManagerNotice(null);
      return;
    }
    await readManagerNotification(managerNotice.id);
  };

  const readAllManagerNotifications = async () => {
    try {
      await api.readAllManagerNotifications();
      await loadBootstrap({ silent: true });
    } catch (error) {
      setSyncError(error.message);
    }
  };

  const logout = () => {
    clearApiToken();
    writeManagerActiveTab("orders");
    writeOpenManagerClientId("");
    setManagerNotice(null);
    setManagerNotifications([]);
    setCatalogSession(null);
    setAuthUser(null);
    setIsLoggedIn(false);
    setHydrated(false);
    setProducts(DEFAULT_PRODUCTS.map(normalizeProduct));
    setFullCatalogProducts(
      DEFAULT_PRODUCTS.map(normalizeProduct)
    );
    setCatalogPolicy({
      matrixMode: "pending",
      allowFullCatalog: false,
      matrixReady: false,
      matrixProductIds: [],
    });
    setShowFullCatalog(false);
    setOrders([]);
    setProfile(EMPTY_PROFILE);
    setAddresses([]);
    setFavorites([]);
    setSettings(DEFAULT_SETTINGS);
    setClientLinks({});
    setServerClients([]);
    setReconciliationRequests([]);
    setManagerNotifications([]);
  };

  const validateNewOrder = () => {
    if (settings.requireProfile && !profileComplete) {
      alert("Сначала заполните профиль организации.");
      return false;
    }

    if (settings.requireAddress && !addresses.length) {
      alert("Сначала добавьте адрес доставки.");
      return false;
    }

    return true;
  };

  const openNew = (options = {}) => {
    const silent = Boolean(options?.silent);
    const forceNew = Boolean(options?.forceNew);

    if (forceNew) {
      if (!validateNewOrder()) return;
      setCatalogSession({ mode: "new" });
      return;
    }

    if (silent) {
      if (
        (settings.requireProfile && !profileComplete) ||
        (settings.requireAddress && !addresses.length)
      ) {
        return;
      }
      if (!catalogSession || catalogSession.mode === "new") {
        setCatalogSession({ mode: "new" });
      }
      return;
    }

    if (validateNewOrder()) {
      setCatalogSession({ mode: "new" });
    }
  };

  const openEdit = (order) => {
    if (order.status !== "Новый") {
      return alert("Редактировать можно только новый заказ.");
    }

    setCatalogSession({ mode: "edit", order });
  };

  const openRepeat = (order) => {
    if (validateNewOrder()) {
      setCatalogSession({ mode: "repeat", order });
    }
  };

  const saveOrder = (payload) => {
    const session = catalogSession || { mode: "new" };
    let nextOrders = orders;

    if (session.mode === "edit") {
      nextOrders = orders.map((order) => {
        if (order.id !== session.order.id) return order;

        const updatedAt = new Date().toISOString();
        const history = appendOrderHistory(
          order,
          makeOrderHistoryEvent(
            "client.edit",
            "Клиент изменил состав или условия заказа",
            profile.contactName || "Клиент"
          )
        );

        return {
          ...order,
          ...payload,
          history,
          updatedAt,
        };
      });
    } else {
      const timestamp = Date.now();
      const identifiers = makeOrderIdentifiers(timestamp);
      const createdAt = new Date().toISOString();
      const orderId = makeId("order");

      nextOrders = [
        {
          id: orderId,
          externalId: identifiers.externalId,
          number: identifiers.number,
          exchange: normalizeOrderExchange(),
          createdAt,
          updatedAt: createdAt,
          status: "Новый",
          clientId,
          customerName:
            profile.companyName ||
            profile.contactName ||
            "Клиент",
          customerContact: profile.contactName,
          customerPhone: profile.phone,
          customerEmail: profile.email,
          managerComment: "",
          internalNote: "",
          history: [
            {
              ...makeOrderHistoryEvent(
                "order.created",
                "Заказ создан",
                profile.contactName || "Клиент"
              ),
              createdAt,
            },
          ],
          ...payload,
        },
        ...orders,
      ];
    }

    setOrders(nextOrders);
    setCatalogSession(null);

    api
      .saveOrders(nextOrders)
      .then(() => setSyncError(""))
      .catch((error) => {
        const message = `${error.message}. Заказ виден у вас, но сервер его не сохранил — менеджер его не увидит.`;
        setSyncError(message);
        alert(message);
      });
  };

  const deleteClientOrder = (order) => {
    if (order.status !== "Новый") {
      return alert("Удалить можно только новый заказ.");
    }

    if (window.confirm(`Удалить заказ № ${order.number}?`)) {
      setOrders((current) =>
        current.filter((item) => item.id !== order.id)
      );
    }
  };

  const updateOrder = (id, patch) => {
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== id) return order;

        let history = Array.isArray(order.history) ? order.history : [];

        if (patch.status && patch.status !== order.status) {
          history = appendOrderHistory(
            order,
            makeOrderHistoryEvent(
              "status.changed",
              `Статус изменён: ${order.status || "—"} → ${patch.status}`,
              role === "manager" ? "Менеджер" : profile.contactName || "Клиент"
            )
          );
        }

        return {
          ...order,
          ...patch,
          history,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const bulkUpdateOrders = (ids, patch) => {
    const selected = new Set(ids || []);

    setOrders((current) =>
      current.map((order) => {
        if (!selected.has(order.id)) return order;

        let history = Array.isArray(order.history) ? order.history : [];

        if (patch.status && patch.status !== order.status) {
          history = appendOrderHistory(
            order,
            makeOrderHistoryEvent(
              "status.bulk",
              `Статус массово изменён: ${order.status || "—"} → ${patch.status}`,
              "Менеджер"
            )
          );
        }

        return {
          ...order,
          ...patch,
          history,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const deleteManagerOrder = (order) => {
    if (window.confirm(`Удалить заказ № ${order.number}?`)) {
      setOrders((current) =>
        current.filter((item) => item.id !== order.id)
      );
    }
  };

  const createProductFromCustom = (order, customItem) => {
    if (
      !window.confirm(
        `Создать в каталоге товар «${customItem.name}»?`
      )
    ) {
      return;
    }

    const id =
      Math.max(
        0,
        ...products.map((item) => Number(item.id) || 0)
      ) + 1;

    const unitMap = {
      "шт.": "piece",
      "уп.": "pack",
      "пач.": "bundle",
    };

    const saleUnit = unitMap[customItem.unit] || "piece";

    const newProduct = normalizeProduct({
      id,
      category: "Новые товары",
      name: customItem.name,
      code: `CL-${String(id).padStart(4, "0")}`,
      oneCId: "",
      active: true,
      pieceSize: 1,
      packSize: 1,
      bundleSize: 1,
      pricePiece:
        saleUnit === "piece"
          ? Number(customItem.unitPrice) || 0
          : 0,
      pricePack:
        saleUnit === "pack"
          ? Number(customItem.unitPrice) || 0
          : 0,
      priceBundle:
        saleUnit === "bundle"
          ? Number(customItem.unitPrice) || 0
          : 0,
      saleUnits: [saleUnit],
    });

    setProducts((current) => [...current, newProduct]);

    updateOrder(order.id, {
      customItems: (order.customItems || []).map((item) =>
        item.id === customItem.id
          ? {
              ...item,
              requestStatus: "Добавлен в каталог",
              matchedProductId: id,
            }
          : item
      ),
    });
  };

  const importBackup = (backup) => {
    if (Array.isArray(backup.products)) {
      setProducts(backup.products.map(normalizeProduct));
    }

    if (Array.isArray(backup.orders)) {
      setOrders(backup.orders);
    }

    if (backup.profile) {
      setProfile({
        ...EMPTY_PROFILE,
        ...backup.profile,
      });
    }

    if (Array.isArray(backup.addresses)) {
      setAddresses(backup.addresses);
    }

    if (backup.settings) {
      setSettings({
        ...DEFAULT_SETTINGS,
        ...backup.settings,
      });
    }

    if (backup.clientLinks) {
      setClientLinks(backup.clientLinks);
    }
  };

  const clearOrders = () => {
    if (window.confirm("Удалить все заказы?")) {
      setOrders([]);
    }
  };

  const resetAll = async () => {
    if (
      !window.confirm(
        "Сбросить серверные данные Clover? Аккаунт менеджера сохранится."
      )
    ) {
      return;
    }

    try {
      await api.resetAll();
      await loadBootstrap();
      alert("Серверные данные сброшены.");
    } catch (error) {
      alert(error.message);
    }
  };

  if (loading) {
    return (
      <>
        <style>{APP_STYLES}</style>
        <main className="loading-page">
          <section className="loading-card">
            <img
              className="loading-logo"
              src={cloverLogo}
              alt="Логотип Clover"
              width="190"
              height="128"
            />
            <h2>Подключаемся к серверу</h2>
            <p>
              Загружаем аккаунт, товары, адреса и заказы.
            </p>
          </section>
        </main>
      </>
    );
  }

  let content;

  if (!isLoggedIn) {
    content = (
      <LoginView
        onAuth={handleAuth}
        authBusy={authBusy}
        authError={authError}
      />
    );
  } else if (role === "manager") {
    content = (
      <ManagerDashboard
        orders={orders}
        products={products}
        setProducts={setProducts}
        profile={profile}
        addresses={addresses}
        serverClients={serverClients}
        reconciliationRequests={reconciliationRequests}
        managerNotifications={managerNotifications}
        settings={settings}
        setSettings={setSettings}
        clientLinks={clientLinks}
        setClientLinks={setClientLinks}
        managerNotice={managerNotice}
        onDismissNotice={dismissManagerNotice}
        onReadNotification={readManagerNotification}
        onReadAllNotifications={readAllManagerNotifications}
        onUpdateOrder={updateOrder}
        onBulkUpdateOrders={bulkUpdateOrders}
        onDeleteOrder={deleteManagerOrder}
        onCreateProductFromCustom={createProductFromCustom}
        onImport={importBackup}
        onClearOrders={clearOrders}
        onResetAll={resetAll}
        onReload={() => loadBootstrap({ silent: true })}
        onLogout={logout}
      />
    );
  } else {
    const canCreateOrder =
      !(settings.requireProfile && !profileComplete) &&
      !(settings.requireAddress && !addresses.length);

    content = (
      <ClientDashboard
        profile={profile}
        setProfile={setProfile}
        addresses={addresses}
        setAddresses={setAddresses}
        orders={clientOrders}
        settings={settings}
        catalogPolicy={catalogPolicy}
        matrixProductCount={products.length}
        fullCatalogCount={fullCatalogProducts.length}
        reconciliationRequests={reconciliationRequests}
        onReload={() => loadBootstrap({ silent: true })}
        onNew={openNew}
        onEdit={openEdit}
        onRepeat={openRepeat}
        onDelete={deleteClientOrder}
        onLogout={logout}
        catalogSession={catalogSession}
        products={catalogProducts}
        matrixProducts={products}
        favorites={favorites}
        setFavorites={setFavorites}
        showFullCatalog={showFullCatalog}
        setShowFullCatalog={setShowFullCatalog}
        onSaveOrder={saveOrder}
        onCloseCatalog={() => setCatalogSession(null)}
        canCreateOrder={canCreateOrder}
        profileComplete={profileComplete}
      />
    );
  }

  return (
    <>
      <style>{APP_STYLES}</style>
      {content}
      <InstallPrompt />
      {syncError && (
        <div className="server-banner">{syncError}</div>
      )}
    </>
  );
}

export default App;
