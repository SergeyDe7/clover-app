import "dotenv/config";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
  createUser,
  findUserByEmail,
  findUserById,
  getClientState,
  getGlobalState,
  listClients,
  listOrders,
  listTrashedOrders,
  deleteOrderById,
  replaceOrders,
  resetServerData,
  setClientStateField,
  setGlobalState,
  listAudit,
  listExchangeAudit,
  getOrderById,
  updateOrderPayload,
  updateClientByManager,
  writeAudit,
  markUserLogin,
  setUserEmailVerified,
  setUserApprovalStatus,
  updateUserPassword,
  updateUserRole,
  listStaffUsers,
  countUsersByRole,
  setStaffDisabled,
  setStaffPermissions,
  deleteStaffUser,
  deleteClientUser,
  deleteManagerNotificationsBySource,
  revokeOtherSessions,
  createAuthToken,
  consumeAuthToken,
  createReconciliationRequest,
  getReconciliationRequestInternal,
  listReconciliationRequests,
  updateReconciliationRequest,
  upsertPushSubscription,
  listPushSubscriptions,
  deletePushSubscription,
  listManagerNotifications,
  markManagerNotificationRead,
  markManagerNotificationsReadBySource,
  markManagerNotificationsReadForOrder,
  markAllManagerNotificationsRead,
  listPasskeys,
  getPasskey,
  savePasskey,
  updatePasskeyCounter,
  deletePasskey,
  createWebAuthnChallenge,
  consumeWebAuthnChallenge,
} from "./db.js";
import {
  DEFAULT_PRODUCTS,
  DEFAULT_SETTINGS,
  EMPTY_LINK,
} from "./defaults.js";
import {
  cleanupOldBackups,
  createServerBackup,
  ensureDailyBackup,
  listServerBackups,
  resolveBackupPath,
  restoreServerBackup,
} from "./backups.js";
import {
  assertSafeManagerOrderReplace,
  alignLinePricesToCeilTotal,
  build1CPayload,
  exchangeDatabaseLabel,
  isOneCClaimExpired,
  normalizeExchangeState,
  ONEC_CLAIM_REQUEUE_INTERVAL_MS,
  payloadToCsv,
  sanitizeOrderExchangeForSave,
  summarizeExchange,
  validateOrderFor1C,
} from "./exchange.js";
import { releaseExpiredOneCClaims } from "./onecClaimRequeue.js";
import {
  applyOneCAcceptedStatus,
  applyOrderStatusPolicy,
  buildStatusUpdatedOrder,
} from "./orderStatus.js";
import { hasRole, isClientRole, isStaffRole, parseStaffPermissions, staffCanManageStaff, staffPermissionsPayload, STAFF_FEATURE_IDS } from "./roles.js";
import { publicClientSettings } from "./clientSettings.js";
import {
  listClientAccessEntries,
  removeClientAccessEntry,
  saveClientAccessCredentials,
  upsertClientAccessEntry,
} from "./clientAccessVault.js";
import { searchOneCProductsIndexed } from "./oneCSearchIndex.js";
import {
  DEFAULT_ONE_C_CONFIG,
  createOneCDraft,
  previewOneCCatalog,
  publicOneCStatus,
  sanitizeOneCConfig,
  testOneCConnection,
} from "./oneC.js";
import {
  addProductIdToClientMatrix,
  applyInferredCategories,
  autoLinkCloverProducts,
  buildOneCProductCandidates,
  buildOneCProductsSummary,
  createOrReuseCloverProductFromOneC,
  linkCloverProduct,
  mergeProductsPreservingOneCLinks,
  normalizeOneCProduct,
  normalizeOneCProducts,
  preserveOneCProductPricingFields,
  selectRelevantOneCProducts,
  matchOneCImportRows,
} from "./oneCProducts.js";
import {
  autoLinkCloverClients,
  buildOneCClientCandidates,
  buildOneCClientsSummary,
  linkCloverClient,
  mergeClientLinksPreservingOneCLinks,
  normalizeOneCClient,
  normalizeOneCClients,
  selectRelevantOneCClients,
} from "./oneCClients.js";
import {
  enrichProductWithPurchasePrices,
  hasPurchasePrice,
  normalizeDefaultPricingConfig,
  normalizePersonalPriceConfig,
  resolveClientProductPricing,
  resolveTypedSalePrice,
  roundPriceUp,
  UNITS as SALE_UNITS,
  unitLabel,
  unitPriceField,
} from "./pricing.js";
import {
  createStorefrontOrder,
  getPublicCatalog,
  getPublicProductByCode,
  getStorefrontSettings,
  mergeStorefrontSettings,
  stripStorefrontSettings,
  findPurchasePriceTypeId,
} from "./storefrontPublic.js";
import {
  buildAllPriceRequirements,
  buildOrderPriceRequirements,
  buildPriceRequest,
  defaultExchangeDatabase,
  extractOneCDatabase,
  isAllowedOneCDatabase,
  isProdExchangeEnabled,
  isTestDatabase,
  mergePurchasePrices,
  parseAllowedOneCDatabases,
  priceMaxAgeMs,
  publicOneCExchangeStatus,
  TEST_DATABASE_NAME,
  validatePriceRequirements,
} from "./oneCPriceSync.js";
import {
  buildSalePriceRequirements,
  mergeOneCPriceTypes,
  mergeSalePricesByType,
  normalizeOneCPriceTypes,
} from "./oneCSalePrices.js";
import {
  publicMailStatus,
  resetPasswordEmail,
  sendCloverMail,
  verificationEmail,
  reconciliationReadyEmail,
  approvalEmail,
} from "./mailer.js";
import {
  publicPushStatus,
  sendOrderPush,
  sendPromotionPush,
} from "./push.js";
import {
  registrationOptions,
  verifyPasskeyRegistration,
  authenticationOptions,
  verifyPasskeyAuthentication,
} from "./passkeys.js";
import {
  notifyManagers,
  publicManagerNotificationStatus,
} from "./managerNotifications.js";
import {
  findClientOrderMatrixViolations,
  isMatrixProductForLink,
  ordersRequiringMatrixCheck,
} from "./matrixGuard.js";
import { matchesTextSearch } from "../../src/shared/appHelpers.js";
import { validateDeliveryDate } from "../../src/shared/deliveryDateRules.js";
import {
  canPurgeOrder,
  canRestoreOrder,
  canTrashOrder,
  isOrderTrashed,
  lockOrderTrashFields,
  preserveTrashedOrders,
} from "../../src/shared/orderTrash.js";

const app = express();
const ONE_C_STATE_KEY = "oneCIntegration";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const serverDirectory = path.resolve(currentDirectory, "..");
const uploadsDirectory = path.resolve(serverDirectory, "uploads");
mkdirSync(uploadsDirectory, { recursive: true });

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDirectory,
    filename(req, file, callback) {
      const extensionMap = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
      };
      callback(
        null,
        `product-${String(req.params.productId || "item")}-${Date.now()}-${randomUUID()}${extensionMap[file.mimetype] || ".img"}`
      );
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return callback(
        new Error("Разрешены только изображения JPG, PNG или WEBP.")
      );
    }
    callback(null, true);
  },
});
const reconciliationDirectory = path.resolve(uploadsDirectory, "reconciliation");
mkdirSync(reconciliationDirectory, { recursive: true });

const reconciliationUpload = multer({
  storage: multer.diskStorage({
    destination: reconciliationDirectory,
    filename(req, file, callback) {
      callback(null, `act-${String(req.params.requestId || "request")}-${Date.now()}-${randomUUID()}.pdf`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (file.mimetype !== "application/pdf") {
      return callback(new Error("Разрешён только PDF-файл акта сверки."));
    }
    callback(null, true);
  },
});

const port = Number(process.env.PORT || 4100);
const host = process.env.HOST || "0.0.0.0";
const jwtSecret = String(process.env.JWT_SECRET || "").trim();
if (jwtSecret.length < 32 || /^(?:change-this.*|development-secret.*|clover-local-development-secret-change-before-production)$/i.test(jwtSecret)) {
  throw new Error("JWT_SECRET must be a unique secret of at least 32 characters in server/.env.");
}

function allowedCorsOrigin(origin) {
  if (!origin) return true;
  const configured = String(process.env.APP_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured && origin === configured) return true;
  try {
    const url = new URL(origin);
    if (url.port !== "5273") return false;
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return true;
    return String(process.env.ALLOW_LAN_ORIGINS || "true") === "true" &&
      (/^192\.168\./.test(url.hostname) || /^10\./.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname));
  } catch {
    return false;
  }
}

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    const allowed = allowedCorsOrigin(origin);
    callback(allowed ? null : new Error("CORS origin is not allowed."), allowed);
  },
  credentials: false,
}));
app.use(express.json({ limit: "24mb" }));
app.use("/uploads/reconciliation", (req, res) => res.status(404).end());
app.use("/uploads", express.static(uploadsDirectory, { maxAge: "1h" }));

const loginAttempts = new Map();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function publicUser(user) {
  const permissions = parseStaffPermissions(user.permissions_json ?? user.permissions);
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: Boolean(user.email_verified),
    approvalStatus: user.approval_status || "approved",
    disabled: Boolean(user.disabled_at || user.disabled),
    disabledAt: user.disabled_at || user.disabledAt || "",
    permissions: isStaffRole(user.role)
      ? {
          tabs: permissions.fullAccess ? [...STAFF_FEATURE_IDS] : permissions.tabs,
          manageStaff: permissions.manageStaff !== false,
          fullAccess: permissions.fullAccess || user.role === "admin",
        }
      : undefined,
  };
}

function actorCanManageStaff(req) {
  // Создание/правка/удаление менеджеров — только admin.
  return req.user?.role === "admin" && staffCanManageStaff(req.user);
}

function assertCanManageTargetStaff(req, target) {
  if (!actorCanManageStaff(req)) {
    const error = new Error("Недостаточно прав для управления менеджерами.");
    error.status = 403;
    error.code = "STAFF_MANAGE_FORBIDDEN";
    throw error;
  }
  if (!target || !isStaffRole(target.role)) {
    const error = new Error("Менеджер не найден.");
    error.status = 404;
    throw error;
  }
  if (String(target.id) === String(req.user.id)) {
    const error = new Error("Нельзя изменить собственный доступ этим действием.");
    error.status = 409;
    error.code = "STAFF_SELF_FORBIDDEN";
    throw error;
  }
}

function auditFromRequest(req, action, details = {}) {
  try {
    writeAudit({
      userId: req.user?.id || null,
      userEmail: req.user?.email || "",
      userRole: req.user?.role || "",
      action,
      details,
    });
  } catch (error) {
    console.error("Не удалось записать действие в журнал", error);
  }
}

function removeUploadedImage(imageUrl) {
  if (!String(imageUrl || "").startsWith("/uploads/")) {
    return;
  }

  const fileName = path.basename(imageUrl);
  const filePath = path.resolve(uploadsDirectory, fileName);

  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

function tokenHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function createPlainToken() {
  return randomBytes(32).toString("base64url");
}

function publicBaseUrl(req) {
  const configured = String(process.env.APP_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
}

function allowDevelopmentAuthLinks(req) {
  if (String(process.env.ALLOW_DEV_AUTH_LINKS || "true") !== "true") return false;
  const hostName = String(req.hostname || "").toLowerCase();
  const remoteAddress = String(req.socket?.remoteAddress || "");
  const loopbackHost = ["localhost", "127.0.0.1", "::1"].includes(hostName);
  const loopbackClient = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remoteAddress);
  return loopbackHost && loopbackClient;
}

function isConfiguredPublicUrlLocal() {
  const candidates = [process.env.APP_PUBLIC_URL, process.env.CLOVER_PUBLIC_URL];
  for (const raw of candidates) {
    const value = String(raw || "").trim();
    if (!value) continue;
    try {
      const host = new URL(value).hostname.toLowerCase();
      if (!["localhost", "127.0.0.1", "::1"].includes(host)) return false;
    } catch {
      const lower = value.toLowerCase();
      if (!lower.includes("localhost") && !lower.includes("127.0.0.1")) return false;
    }
  }
  return true;
}

/** Полный wipe: unset → только loopback; false → запрет; true → явно разрешено. */
function isAdminFullResetAllowed(req) {
  const flag = String(process.env.ALLOW_ADMIN_FULL_RESET || "")
    .trim()
    .toLowerCase();
  if (["false", "0", "no"].includes(flag)) return false;
  if (["true", "1", "yes"].includes(flag)) return true;
  if (!isConfiguredPublicUrlLocal()) return false;
  return allowDevelopmentAuthLinks(req);
}

function quarterRange(year, quarter) {
  const starts = { q1: [1, 1], q2: [4, 1], q3: [7, 1], q4: [10, 1] };
  const ends = { q1: [3, 31], q2: [6, 30], q3: [9, 30], q4: [12, 31] };
  const start = starts[quarter];
  const end = ends[quarter];
  if (!start || !end) return null;
  const pad = (value) => String(value).padStart(2, "0");
  return {
    dateFrom: `${year}-${pad(start[0])}-${pad(start[1])}`,
    dateTo: `${year}-${pad(end[0])}-${pad(end[1])}`,
  };
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      sessionEpoch: String(user.password_changed_at || ""),
    },
    jwtSecret,
    {
      expiresIn: "7d",
      issuer: "clover-server",
      audience: "clover-app",
    }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({
      error: "Необходимо войти в аккаунт.",
    });
  }

  try {
    const payload = jwt.verify(token, jwtSecret, {
      issuer: "clover-server",
      audience: "clover-app",
    });

    const user = findUserById(payload.sub);

    if (!user) {
      return res.status(401).json({
        error: "Аккаунт больше не существует.",
      });
    }
    if (String(payload.sessionEpoch || "") !== String(user.password_changed_at || "")) {
      return res.status(401).json({
        error: "Сессия завершена. Войдите снова.",
      });
    }
    if (user.disabled_at) {
      return res.status(403).json({
        error: "Доступ закрыт. Обратитесь к администратору.",
        code: "ACCOUNT_DISABLED",
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      error: "Сессия истекла. Войдите снова.",
    });
  }
}

function roleRequired(...roles) {
  const allowed = roles.length ? roles : [];
  return (req, res, next) => {
    if (!hasRole(req.user?.role, allowed)) {
      return res.status(403).json({
        error: "Недостаточно прав для этого действия.",
      });
    }

    next();
  };
}

function checkLoginLimit(email) {
  const key = normalizeEmail(email);
  const current = loginAttempts.get(key);
  const now = Date.now();

  if (!current || now - current.startedAt > 10 * 60 * 1000) {
    loginAttempts.set(key, {
      count: 1,
      startedAt: now,
    });
    return true;
  }

  current.count += 1;

  return current.count <= 20;
}

function clearLoginLimit(email) {
  loginAttempts.delete(normalizeEmail(email));
}


function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function isPlaceholderSecret(value) {
  return /^(?:change[_-]?me(?:[_-].*)?|secret|development-secret|clover-local-development-secret-change-before-production)$/i
    .test(String(value || "").trim());
}

function normalizeRemoteAddress(value) {
  return String(value || "").replace(/^::ffff:/, "").split("%")[0];
}

function localMachineAddresses() {
  const addresses = new Set(["127.0.0.1", "::1"]);
  for (const entries of Object.values(networkInterfaces())) {
    for (const item of entries || []) {
      if (item?.address) addresses.add(normalizeRemoteAddress(item.address));
    }
  }
  return addresses;
}

const oneCLocalAddresses = localMachineAddresses();

function oneCAuthRequired(req, res, next) {
  const configuredKey = String(process.env.ONEC_API_KEY || "").trim();
  const bearer = String(req.headers.authorization || "").startsWith("Bearer ")
    ? String(req.headers.authorization).slice(7)
    : "";
  const supplied = String(req.headers["x-clover-key"] || bearer || "").trim();

  if (configuredKey.length >= 24 && !isPlaceholderSecret(configuredKey)) {
    if (secureEqual(supplied, configuredKey)) return next();
    writeAudit({ action: "one-c.auth.denied", details: { ip: req.ip || "", mode: "api-key" } });
    return res.status(401).json({ error: "Неверный ключ обмена Clover." });
  }

  // По умолчанию false: локальный bypass только после явного ONEC_ALLOW_LOCAL_WITHOUT_KEY=true.
  const allowLocal =
    String(process.env.ONEC_ALLOW_LOCAL_WITHOUT_KEY || "false").toLowerCase() === "true";
  const remoteAddress = normalizeRemoteAddress(req.socket?.remoteAddress || req.ip);
  if (allowLocal && oneCLocalAddresses.has(remoteAddress)) {
    return next();
  }

  writeAudit({ action: "one-c.auth.denied", details: { ip: req.ip || "", mode: "key-required" } });
  return res.status(503).json({
    error:
      "Ключ обмена с 1С не настроен. Укажите ONEC_API_KEY или явно разрешите локальный обмен ONEC_ALLOW_LOCAL_WITHOUT_KEY=true.",
  });
}

function requireOneCTestDatabase(req, res) {
  const database = extractOneCDatabase(req);
  if (!isTestDatabase(database)) {
    res.status(403).json({
      error:
        "Этот обмен разрешён только для базы 1С TEST. Укажите заголовок X-Clover-Database: TEST.",
    });
    return null;
  }
  return database;
}

/** Pull/ACK/цены: TEST всегда; другие базы — только при ONEC_PROD_EXCHANGE_ENABLED=true. */
function requireOneCAllowedDatabase(req, res) {
  const database = extractOneCDatabase(req);
  if (!isAllowedOneCDatabase(database)) {
    const allowed = parseAllowedOneCDatabases().join(", ");
    res.status(403).json({
      error: isProdExchangeEnabled()
        ? `Этот обмен разрешён для баз 1С: ${allowed}. Укажите заголовок X-Clover-Database.`
        : "Сейчас разрешён только обмен с 1С TEST (prod-контур выключен). Укажите X-Clover-Database: TEST.",
      allowedDatabases: parseAllowedOneCDatabases(),
      prodEnabled: isProdExchangeEnabled(),
    });
    return null;
  }
  return database;
}

function resolveManagerExchangeDatabase(req) {
  const requested = extractOneCDatabase({
    headers: {},
    body: req.body || {},
    query: req.query || {},
  });
  const target = requested || defaultExchangeDatabase();
  if (!isAllowedOneCDatabase(target)) {
    return {
      ok: false,
      error: isProdExchangeEnabled()
        ? `База ${target || "(пусто)"} не в списке разрешённых: ${parseAllowedOneCDatabases().join(", ")}.`
        : "Prod-контур выключен. Передача возможна только в 1С TEST.",
      database: target,
    };
  }
  return { ok: true, database: target };
}

function orderItemsSignature(order) {
  return JSON.stringify((Array.isArray(order?.items) ? order.items : [])
    .map((item) => ({
      productId: String(item.productId ?? item.id ?? ""),
      custom: Boolean(item.custom),
      name: String(item.name || ""),
      unit: String(item.unit || "piece"),
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
    }))
    .sort((a, b) => `${a.productId}:${a.name}:${a.unit}`.localeCompare(`${b.productId}:${b.name}:${b.unit}`)));
}

function customItemsSignature(order) {
  return JSON.stringify((Array.isArray(order?.customItems) ? order.customItems : [])
    .map((item) => ({
      id: String(item.id || ""),
      name: String(item.name || ""),
      unit: String(item.unit || ""),
      quantity: Number(item.quantity) || 0,
      details: String(item.details || ""),
      photoUrl: String(item.photoUrl || item.imageUrl || ""),
    }))
    .sort((a, b) => `${a.id}:${a.name}`.localeCompare(`${b.id}:${b.name}`)));
}

function clientOrderSignature(order) {
  return JSON.stringify({
    items: orderItemsSignature(order),
    customItems: customItemsSignature(order),
    delivery: String(order?.firstDeliveryDate || ""),
    address: String(order?.address || ""),
    comment: String(order?.clientComment || ""),
  });
}

function orderPositionCount(order) {
  return (Array.isArray(order?.items) ? order.items.length : 0) +
    (Array.isArray(order?.customItems) ? order.customItems.length : 0);
}

function orderMoneyTotal(order) {
  const itemsTotal = (Array.isArray(order?.items) ? order.items : []).reduce(
    (sum, item) => sum + (Number(item?.lineTotal) || 0),
    0
  );
  const customTotal = (Array.isArray(order?.customItems) ? order.customItems : []).reduce(
    (sum, item) => sum + (Number(item?.unitPrice) || 0) * (Number(item?.quantity) || 0),
    0
  );
  return roundPriceUp(itemsTotal + customTotal);
}

function formatOrderMoney(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString("ru-RU", {
    minimumFractionDigits: amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

function formatOrderRuDate(value) {
  if (!value) return "не указана";
  const raw = String(value).slice(0, 10);
  try {
    return new Intl.DateTimeFormat("ru-RU").format(new Date(`${raw}T12:00:00`));
  } catch {
    return raw;
  }
}

function formatOrderRuDateTime(value) {
  if (!value) return "не указана";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return formatOrderRuDate(value);
  }
}

function managerOrderNotificationCopy(order, customerName) {
  const orderNumber = String(order?.number || order?.id || "");
  const clientComment = String(order?.clientComment || "").trim();
  const lines = [
    `Сумма: ${orderMoneyTotal(order) > 0 ? formatOrderMoney(orderMoneyTotal(order)) : "уточняется"}`,
    `Кол-во позиций: ${orderPositionCount(order)}`,
    `Дата доставки: ${formatOrderRuDate(order?.firstDeliveryDate)}`,
    `Дата заказа: ${formatOrderRuDateTime(order?.createdAt)}`,
    `№ ${orderNumber || "—"}`,
  ];
  if (clientComment) {
    lines.push(`Комментарий: ${clientComment}`);
  }
  return {
    title: String(customerName || "Клиент").trim() || "Клиент",
    body: lines.join("\n"),
  };
}

/** Текст комментария для документа «Заказ покупателя» в 1С. */
function buildOneCOrderComment(order) {
  const number = String(order?.number || order?.displayId || "").trim();
  const header = number ? `Заказ Clover № ${number}` : "Заказ Clover";
  const clientComment = String(order?.clientComment || "").trim();
  return clientComment ? `${header}\nКомментарий: ${clientComment}` : header;
}

function reconciliationPeriodText(request) {
  const labels = { q1: "1 квартал", q2: "2 квартал", q3: "3 квартал", q4: "4 квартал", all: "за весь период", custom: "указанный период" };
  const label = labels[request?.periodType] || "указанный период";
  if (["q1", "q2", "q3", "q4"].includes(request?.periodType) && request?.year) {
    return `${label} ${request.year}`;
  }
  if (request?.periodType === "custom" && request?.dateFrom && request?.dateTo) {
    return `${request.dateFrom} — ${request.dateTo}`;
  }
  return label;
}

function queueManagerNotification(event) {
  notifyManagers(event).catch((error) => {
    console.error("Manager notification error", error?.message || error);
  });
}

const registerSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(50),
  email: z.string().trim().email().max(200),
  password: z.string().min(6).max(200),
});

const managerClientProvisionSchema = registerSchema;

const managerClientPasswordSchema = z.object({
  password: z.string().min(6).max(200),
});

const managerCreateSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(6).max(200),
});

const staffPasswordSchema = z.object({
  password: z.string().min(6).max(200),
});

const staffPermissionsSchema = z.object({
  tabs: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  manageStaff: z.boolean().optional(),
  fullAccess: z.boolean().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

const tokenSchema = z.object({
  token: z.string().trim().min(20).max(500),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(200),
});

const resetPasswordSchema = tokenSchema.extend({
  password: z.string().min(6).max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
});

const passkeyAuthenticationOptionsSchema = z.object({
  email: z.string().trim().email().max(200).optional(),
});

const passkeyCeremonySchema = z.object({
  ceremonyId: z.string().uuid(),
  response: z.record(z.string(), z.any()).or(z.any()),
});

const passkeyAuthenticationVerifySchema = passkeyCeremonySchema.extend({
  email: z.string().trim().email().max(200).optional(),
});

const reconciliationSchema = z.object({
  periodType: z.enum(["q1", "q2", "q3", "q4", "all", "custom"]),
  year: z.number().int().min(2000).max(2100).nullable().optional(),
  dateFrom: z.string().trim().max(20).optional().default(""),
  dateTo: z.string().trim().max(20).optional().default(""),
  comment: z.string().trim().max(1000).optional().default(""),
});

const reconciliationManagerSchema = z.object({
  status: z.enum(["new", "processing", "ready", "rejected"]),
  managerComment: z.string().trim().max(2000).optional().default(""),
});

const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(4000),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(1).max(1000),
      auth: z.string().min(1).max(1000),
    }),
  }),
  preferences: z.object({
    orderEvents: z.boolean().optional().default(true),
    promotions: z.boolean().optional().default(false),
  }).optional().default({ orderEvents: true, promotions: false }),
});

const managerClientAddressSchema = z.object({
  id: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(120),
  address: z.string().trim().min(3).max(500),
  isDefault: z.boolean().optional().default(false),
});

const managerClientUpdateSchema = z.object({
  profile: z.object({
    companyName: z.string().trim().max(160),
    contactName: z.string().trim().max(120),
    phone: z.string().trim().max(50),
    email: z.string().trim().email().max(200),
    contacts: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(80).optional(),
          name: z.string().trim().max(120).optional().default(""),
          label: z.string().trim().max(80).optional().default(""),
          phone: z.string().trim().max(50).optional().default(""),
          isPrimary: z.boolean().optional().default(false),
        })
      )
      .max(2)
      .optional(),
  }),
  addresses: z.array(managerClientAddressSchema).max(50),
  managerNote: z.string().trim().max(2000).optional().default(""),
});

function normalizeManagerClientAddresses(addresses) {
  const normalized = addresses.map((item) => ({
    id: String(item.id || randomUUID()),
    label: String(item.label || "Адрес").trim(),
    address: String(item.address || "").trim(),
    isDefault: Boolean(item.isDefault),
  }));

  if (!normalized.length) return [];

  const defaultIndex = normalized.findIndex((item) => item.isDefault);
  const selectedIndex = defaultIndex >= 0 ? defaultIndex : 0;

  return normalized.map((item, index) => ({
    ...item,
    isDefault: index === selectedIndex,
  }));
}

function normalizeClientProfileContacts(profile = {}, accountEmail = "") {
  const source = profile && typeof profile === "object" ? profile : {};
  const companyName = String(source.companyName || "").trim();
  const email = String(accountEmail || source.email || "").trim();
  const rawContacts = Array.isArray(source.contacts) ? source.contacts : [];
  const ROLE_PRIMARY = "Основной";
  const ROLE_SECONDARY = "Дополнительный";
  const syncLabel = (label, isPrimary) => {
    const trimmed = String(label || "").trim();
    if (!trimmed || trimmed === ROLE_PRIMARY || trimmed === ROLE_SECONDARY) {
      return isPrimary ? ROLE_PRIMARY : ROLE_SECONDARY;
    }
    return trimmed;
  };

  let contacts = rawContacts
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || item.contactName || "").trim();
      const phone = String(item.phone || item.number || "").trim();
      const label = String(item.label || "").trim();
      if (!name && !phone && !label) return null;
      return {
        id: String(item.id || `contact-${index + 1}`).slice(0, 80),
        name: name.slice(0, 120),
        label: label.slice(0, 80),
        phone: phone.slice(0, 50),
        isPrimary: Boolean(item.isPrimary),
      };
    })
    .filter(Boolean)
    .slice(0, 5);

  if (!contacts.length) {
    const legacyName = String(source.contactName || "").trim();
    const legacyPhone = String(source.phone || "").trim();
    if (legacyName || legacyPhone) {
      contacts = [
        {
          id: "contact-primary",
          name: legacyName.slice(0, 120),
          label: ROLE_PRIMARY,
          phone: legacyPhone.slice(0, 50),
          isPrimary: true,
        },
      ];
    }
  }

  if (!contacts.length) {
    return {
      companyName: companyName.slice(0, 160),
      contactName: "",
      phone: "",
      email,
      contacts: [],
    };
  }

  let primaryIndex = contacts.findIndex((item) => item.isPrimary);
  if (primaryIndex < 0) primaryIndex = 0;
  contacts = contacts.map((item, index) => {
    const isPrimary = index === primaryIndex;
    return {
      ...item,
      isPrimary,
      label: syncLabel(item.label, isPrimary),
    };
  });

  const primary = contacts[primaryIndex];
  return {
    companyName: companyName.slice(0, 160),
    contactName: primary.name || "",
    phone: primary.phone || "",
    email,
    contacts,
  };
}


function normalizeClientLink(value) {
  const link = value && typeof value === "object" ? value : {};
  const defaultPricing = normalizeDefaultPricingConfig(link);
  const oneCPriceTypeId = String(link.oneCPriceTypeId || "").trim();
  const oneCPriceTypeName = String(link.oneCPriceTypeName || "").trim();
  // Явный режим «закупка+%» / «базовая» важнее заполненного вида цен —
  // иначе после сохранения наценка снова превращается в категорию 1С.
  const requestedMode = defaultPricing.source;
  const markupPercent = defaultPricing.markupPercent;
  let defaultPricingMode = requestedMode;
  if (requestedMode === "purchase_markup" || requestedMode === "base") {
    defaultPricingMode = requestedMode;
  } else if (markupPercent > 0 && oneCPriceTypeId) {
    // Наценка задана менеджером — не превращаем обратно в «вид без %».
    defaultPricingMode = "purchase_markup";
  } else if (oneCPriceTypeId) {
    defaultPricingMode = "one_c_price_type";
  } else if (requestedMode === "one_c_price_type") {
    defaultPricingMode = "base";
  }

  return {
    ...EMPTY_LINK,
    ...link,
    matched1C: Boolean(link.matched1C || String(link.oneCId || "").trim()),
    matrixProductIds: Array.isArray(link.matrixProductIds)
      ? link.matrixProductIds
      : [],
    allowFullCatalog: Boolean(link.allowFullCatalog),
    defaultPricingMode,
    defaultMarkupPercent: defaultPricing.markupPercent,
    oneCPriceTypeId,
    oneCPriceTypeName,
    personalPrices:
      link.personalPrices &&
      typeof link.personalPrices === "object"
        ? Object.fromEntries(
            Object.entries(link.personalPrices)
              .map(([productId, config]) => [
                productId,
                normalizePersonalPriceConfig(config),
              ])
              .filter(([, config]) => config.source !== "inherit")
          )
        : {},
  };
}

function oneCProductsById(items) {
  return new Map(
    normalizeOneCProducts(items).map((item) => [String(item.id), item])
  );
}

function applyClientPrices(product, link, isMatrixProduct, oneCById = new Map()) {
  const priceConfig =
    link.personalPrices?.[String(product.id)] ||
    link.personalPrices?.[product.id] ||
    {};
  const oneCItem = oneCById.get(String(product.oneCId || "")) || null;
  const pricing = resolveClientProductPricing(product, priceConfig, oneCItem, link);

  const priced = {
    ...enrichProductWithPurchasePrices(product, oneCItem),
    isMatrixProduct,
    priceSources: pricing.priceSources,
    clientPriceMode: pricing.source,
    clientPriceOverrideMode: pricing.overrideSource,
    markupPercent: pricing.markupPercent,
    defaultPricingMode: pricing.defaultPricingMode,
    defaultMarkupPercent: pricing.defaultMarkupPercent,
    oneCPriceTypeId: pricing.oneCPriceTypeId,
    purchasePrices: pricing.purchasePrices,
    purchasePriceUpdatedAt: pricing.purchasePriceUpdatedAt,
    salePriceReceivedAt:
      oneCItem?.salePriceReceivedAt ||
      oneCItem?.salePriceUpdatedAt ||
      "",
  };

  for (const unit of SALE_UNITS) {
    const priceField = unitPriceField(unit);
    const baseField = priceField.replace(/^price/, "basePrice");
    priced[baseField] = Number(product[priceField]) || 0;
    priced[priceField] = pricing.prices[unit];
  }

  return priced;
}

function resolveClientCatalog(products, rawLink, oneCProducts = []) {
  const link = normalizeClientLink(rawLink);
  const oneCById = oneCProductsById(oneCProducts);
  const activeProducts = (Array.isArray(products) ? products : []).filter(
    (product) => product.active !== false
  );
  const selectedIds = new Set(
    link.matrixProductIds.map((id) => String(id))
  );

  let matrixProducts = [];

  if (link.matrixMode === "all") {
    matrixProducts = activeProducts;
  } else if (link.matrixMode === "selected") {
    matrixProducts = activeProducts.filter((product) =>
      selectedIds.has(String(product.id))
    );
  }

  const matrixIds = new Set(
    matrixProducts.map((product) => String(product.id))
  );
  const fullCatalog = link.allowFullCatalog
    ? activeProducts
    : matrixProducts;

  const { managerNote: _managerNote, ...publicLink } = link;

  return {
    link: publicLink,
    matrixProducts: matrixProducts.map((product) =>
      applyClientPrices(product, link, true, oneCById)
    ),
    fullCatalogProducts: fullCatalog.map((product) =>
      applyClientPrices(
        product,
        link,
        matrixIds.has(String(product.id)),
        oneCById
      )
    ),
    policy: {
      matrixMode: link.matrixMode,
      allowFullCatalog: link.allowFullCatalog,
      matrixReady: link.matrixMode !== "pending",
      matrixProductIds: link.matrixProductIds,
    },
  };
}

function stripRuntimeProductPricing(product = {}) {
  const {
    purchasePrices,
    purchasePriceUpdatedAt,
    purchasePriceReceivedAt,
    purchasePriceSourceUpdatedAt,
    purchasePriceSourceDatabase,
    purchasePriceUnit,
    purchasePriceAvailable,
    salePricesByType,
    salePriceReceivedAt,
    clientPriceMode,
    clientPriceOverrideMode,
    markupPercent,
    defaultPricingMode,
    defaultMarkupPercent,
    oneCPriceTypeId,
    priceSources,
    basePricePiece,
    basePricePack,
    basePriceBundle,
    basePriceBox,
    basePricePair,
    basePriceRoll,
    isMatrixProduct,
    ...stored
  } = product;
  return stored;
}

function priceForOrderUnit(product, unit) {
  return Number(product[unitPriceField(unit)]) || 0;
}

function purchasePriceForOrderUnit(product, unit) {
  return product.purchasePrices?.[unit] ?? null;
}

function repriceOrderWithCurrentOneC(order, products, rawLink, oneCProducts = []) {
  const link = normalizeClientLink(rawLink);
  const oneCById = oneCProductsById(oneCProducts);
  const productsById = new Map(
    (Array.isArray(products) ? products : []).map((product) => [String(product.id), product])
  );
  const issues = [];

  const items = (Array.isArray(order?.items) ? order.items : []).map((item) => {
    const product = productsById.get(String(item.productId ?? item.id));
    if (!product) return item;

    const priced = applyClientPrices(
      product,
      link,
      isMatrixProductForLink(link, product.id),
      oneCById
    );
    const unit = SALE_UNITS.includes(item.unit) ? item.unit : "piece";
    const unitPrice = priceForOrderUnit(priced, unit);
    const source = priced.priceSources?.[unit] || "unspecified";

    if (source === "purchase_missing") {
      issues.push({
        productId: product.id,
        productName: product.name,
        message: "В 1С ещё нет свежей закупочной цены.",
      });
      return item;
    }

    const quantity = Math.max(0, Number(item.quantity) || 0);
    return {
      ...item,
      unitPrice,
      lineTotal: unitPrice * quantity,
      priceSource: source,
      markupPercent: Number(priced.markupPercent) || 0,
      purchasePrice: purchasePriceForOrderUnit(priced, unit),
      purchasePriceUpdatedAt: priced.purchasePriceUpdatedAt || "",
      repricedAt: new Date().toISOString(),
    };
  });

  return {
    order: {
      ...order,
      items,
      pricingUpdatedAt: new Date().toISOString(),
    },
    issues,
  };
}

function oneCQueueTimestamp(order) {
  const exchange = normalizeExchangeState(order?.exchange);
  const values = [
    exchange.checkedAt,
    exchange.lastAttemptAt,
    order?.updatedAt,
    order?.createdAt,
    order?.date,
  ];

  for (const value of values) {
    const timestamp = Date.parse(String(value || ""));
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return 0;
}

function startOneCClaimRequeueTimer() {
  const raw = Number(process.env.ONEC_CLAIM_REQUEUE_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(raw) && raw >= 5_000 ? raw : ONEC_CLAIM_REQUEUE_INTERVAL_MS;
  const timer = setInterval(() => {
    try {
      releaseExpiredOneCClaims();
    } catch (error) {
      console.error("one-c claim auto-requeue failed", error);
    }
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

function listReadyOrdersForOneC(database = TEST_DATABASE_NAME) {
  releaseExpiredOneCClaims();
  const target = String(database || TEST_DATABASE_NAME).toLocaleUpperCase("ru-RU");

  const eligible = [...listOrders()].filter((order) => {
    const exchange = normalizeExchangeState(order.exchange);
    // 1С получает только заказ, который менеджер явно поставил в очередь этого контура.
    return exchange.status === "ready" && exchange.database === target;
  });

  eligible.sort((left, right) => {
    const timeDifference =
      oneCQueueTimestamp(right) - oneCQueueTimestamp(left);
    if (timeDifference !== 0) return timeDifference;
    return String(right.id || "").localeCompare(String(left.id || ""), "ru");
  });

  return eligible;
}

function nextOrderForOneC(database = TEST_DATABASE_NAME) {
  return listReadyOrdersForOneC(database)[0] || null;
}

/**
 * Атомарная выдача: ready → sending до ACK.
 * Sync-only, чтобы два параллельных pull не получили один заказ.
 */
function claimOrderForOneC(orderId, database = TEST_DATABASE_NAME) {
  const stored = getOrderById(orderId);
  if (!stored) return null;

  const previous = normalizeExchangeState(stored.payload.exchange);
  if (previous.status !== "ready") return null;
  if (previous.database !== String(database || TEST_DATABASE_NAME).toLocaleUpperCase("ru-RU")) {
    return null;
  }

  const claimedAt = new Date().toISOString();
  const contour = exchangeDatabaseLabel(previous.database || database);
  return updateOrderPayload(stored.id, {
    ...stored.payload,
    exchange: {
      ...previous,
      status: "sending",
      attempts: previous.attempts + 1,
      checkedAt: claimedAt,
      lastAttemptAt: claimedAt,
      channel: "onec-pull",
      message: `Заказ выдан ${contour}, ожидается ACK.`,
    },
    updatedAt: claimedAt,
  });
}

function isSimulationExchange(value = {}) {
  const exchange = normalizeExchangeState(value);
  return (
    exchange.channel === "simulation" ||
    /^TEST-1C-/i.test(String(exchange.receipt || "")) ||
    String(exchange.message || "").includes("Тестовая передача") ||
    String(exchange.message || "").includes("Реальное подключение к 1С пока не включено")
  );
}

function receiptUsedByAnotherOrder(order = {}) {
  const orderId = String(order.id || "");
  const receipt = String(normalizeExchangeState(order.exchange).receipt || "").trim();
  if (!receipt) return false;

  return listOrders().some((candidate) => {
    if (String(candidate.id || "") === orderId) return false;
    return String(normalizeExchangeState(candidate.exchange).receipt || "").trim() === receipt;
  });
}

function canReturnOrderToOneCQueue(order = {}) {
  const exchange = normalizeExchangeState(order.exchange);
  if (isSimulationExchange(exchange) || receiptUsedByAnotherOrder(order)) {
    return true;
  }
  if (exchange.status === "sent") return false;
  // Реальный черновик 1С с номером/id — не сбрасываем и не ставим снова в очередь.
  if (
    exchange.status === "draft" &&
    (String(exchange.receipt || "").trim() ||
      String(exchange.remoteDocument?.id || exchange.remoteDocument?.number || "").trim())
  ) {
    return false;
  }
  return true;
}

function oneCQueueSnapshot(database = "") {
  releaseExpiredOneCClaims();
  const target = String(database || "").toLocaleUpperCase("ru-RU");

  const rows = [...listOrders()]
    .map((order) => {
      const exchange = normalizeExchangeState(order.exchange);
      return {
        id: order.id,
        number: order.number,
        customerName: order.customerName || "",
        status: exchange.status,
        database: exchange.database || TEST_DATABASE_NAME,
        attempts: exchange.attempts,
        checkedAt: exchange.checkedAt,
        lastAttemptAt: exchange.lastAttemptAt,
        sentAt: exchange.sentAt,
        receipt: exchange.receipt,
      };
    })
    .filter((row) => {
      if (row.status !== "ready" && row.status !== "sending") return false;
      if (!target) return true;
      return row.database === target;
    })
    .sort((left, right) =>
      String(right.checkedAt || right.lastAttemptAt || "").localeCompare(
        String(left.checkedAt || left.lastAttemptAt || "")
      )
    );

  const nextReady = rows.find((row) => row.status === "ready") || null;

  return {
    count: rows.length,
    readyCount: rows.filter((row) => row.status === "ready").length,
    sendingCount: rows.filter((row) => row.status === "sending").length,
    nextOrderId: nextReady?.id || "",
    nextOrderNumber: nextReady?.number || "",
    rows,
  };
}

function linkedOneCProductIds(products = []) {
  return new Set(
    (Array.isArray(products) ? products : [])
      .map((product) => String(product.oneCId || "").trim())
      .filter(Boolean)
  );
}

function receivePurchasePrices({ items, database, receivedAt = new Date().toISOString() }) {
  if (!isAllowedOneCDatabase(database)) {
    const error = new Error(
      isProdExchangeEnabled()
        ? `Закупочные цены принимаются только из разрешённых баз: ${parseAllowedOneCDatabases().join(", ")}.`
        : "Закупочные цены принимаются только из базы 1С TEST (prod-контур выключен)."
    );
    error.status = 403;
    throw error;
  }

  const products = getGlobalState("products", DEFAULT_PRODUCTS);
  const currentOneCProducts = getGlobalState("oneCProducts", []);
  const merged = mergePurchasePrices(currentOneCProducts, items, {
    database,
    receivedAt,
    allowedIds: linkedOneCProductIds(products),
  });

  setGlobalState("oneCProducts", merged.products);
  const previousMeta = getGlobalState("oneCProductsMeta", {});
  setGlobalState("oneCProductsMeta", {
    ...previousMeta,
    lastPriceSyncAt: receivedAt,
    lastPriceSyncDatabase: database,
    lastPriceSyncAccepted: merged.accepted.length,
    lastPriceSyncRejected: merged.rejected.length,
  });
  writeAudit({
    action: "one-c.purchase-prices.receive",
    details: {
      database,
      accepted: merged.accepted.length,
      rejected: merged.rejected.length,
    },
  });

  return merged;
}

function freshPriceIssuesForOrders(orders, products, clientLinks, oneCProducts) {
  const requirements = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    const exchangeStatus = normalizeExchangeState(order.exchange).status;
    if (order.status !== "Новый" || ["sent", "sending"].includes(exchangeStatus)) continue;
    requirements.push(
      ...buildOrderPriceRequirements(
        order,
        products,
        clientLinks?.[order.clientId] || {}
      )
    );
  }

  const unique = new Map();
  for (const item of requirements) {
    unique.set(`${item.productId}:${item.id}`, item);
  }
  return validatePriceRequirements([...unique.values()], oneCProducts, {
    maxAgeMs: priceMaxAgeMs(),
  });
}

function repriceClientOrders(orders, products, rawLink, oneCProducts = []) {
  const issues = [];
  const repriced = (Array.isArray(orders) ? orders : []).map((order) => {
    const exchangeStatus = normalizeExchangeState(order.exchange).status;
    if (order.status !== "Новый" || ["sent", "sending"].includes(exchangeStatus)) {
      return order;
    }
    const result = repriceOrderWithCurrentOneC(order, products, rawLink, oneCProducts);
    issues.push(...result.issues);
    return result.order;
  });
  return { orders: repriced, issues };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "clover-server", version: "4.0.4",
    time: new Date().toISOString(),
  });
});

/** Публичные контакты менеджера для экрана входа (без авторизации). */
app.get("/api/public/manager-contact", (req, res) => {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...getGlobalState("settings", DEFAULT_SETTINGS),
  };
  res.json({
    managerFullName: String(settings.managerFullName || ""),
    managerPhone: String(settings.managerPhone || ""),
    managerMax: String(settings.managerMax || ""),
    managerTelegram: String(settings.managerTelegram || ""),
  });
});

/** Публичный каталог витрины clover-spb.ru (цены сайта, без матрицы ЛК). */
app.get("/api/public/catalog", (req, res) => {
  try {
    res.json(
      getPublicCatalog({
        category: String(req.query.category || ""),
        q: String(req.query.q || ""),
      })
    );
  } catch (error) {
    console.error("public catalog failed", error);
    res.status(500).json({ error: "Не удалось загрузить каталог." });
  }
});

app.get("/api/public/catalog/:code", (req, res) => {
  try {
    const product = getPublicProductByCode(req.params.code);
    if (!product) {
      return res.status(404).json({ error: "Товар не найден." });
    }
    res.json({ product });
  } catch (error) {
    console.error("public product failed", error);
    res.status(500).json({ error: "Не удалось загрузить товар." });
  }
});

/** Гостевой заказ с витрины — только сайтовые цены. */
app.post("/api/public/orders", async (req, res) => {
  try {
    const order = createStorefrontOrder(req.body, {
      notify: (created) => {
        queueManagerNotification({
          type: "order_new",
          title: `Заказ с сайта №${created.number}`,
          body: `${created.customerName} · ${created.customerPhone} · ${created.items?.length || 0} поз.`,
          url: "/?managerTab=orders",
          sourceId: `${created.id}:storefront`,
        });
      },
    });
    res.status(201).json({ ok: true, order });
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({
        error: "Проверьте данные формы заказа.",
        details: error.issues,
      });
    }
    const status = Number(error?.status) || 500;
    res.status(status).json({
      error: error?.message || "Не удалось оформить заказ.",
      code: error?.code || "",
    });
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const email = normalizeEmail(input.email);

    if (findUserByEmail(email)) {
      return res.status(409).json({
        error: "Аккаунт с такой почтой уже существует.",
      });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = createUser({
      email,
      passwordHash,
      role: "client",
      emailVerified: false,
      approvalStatus: "pending",
      profile: {
        companyName: input.companyName,
        contactName: input.contactName,
        phone: input.phone,
        email,
      },
    });

    const plainToken = createPlainToken();
    createAuthToken({
      userId: user.id,
      type: "verify_email",
      tokenHash: tokenHash(plainToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const verifyUrl = `${publicBaseUrl(req)}/?verify=${encodeURIComponent(plainToken)}`;
    const message = verificationEmail({ companyName: input.companyName, verifyUrl });
    let mail = { sent: false, reason: "unknown" };
    try {
      mail = await sendCloverMail({ to: email, ...message });
    } catch (mailError) {
      console.error("Не удалось отправить письмо подтверждения", mailError);
      mail = { sent: false, reason: "send_failed" };
    }

    writeAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: "auth.register",
      details: { companyName: input.companyName, mailSent: Boolean(mail.sent) },
    });

    queueManagerNotification({
      type: "client_registration",
      title: "Новая регистрация клиента",
      body: `${input.companyName} · ${input.contactName} · ${input.phone}`,
      url: `/?managerTab=clients&client=${encodeURIComponent(user.id)}`,
      sourceId: user.id,
    });

    res.status(201).json({
      ok: true,
      requiresEmailVerification: true,
      message: mail.sent
        ? "Регистрация создана. Подтвердите электронную почту по ссылке из письма."
        : "Регистрация создана. Отправка писем пока не настроена — используйте тестовую ссылку на этом компьютере.",
      mail: { sent: Boolean(mail.sent), status: publicMailStatus() },
      developmentLink: allowDevelopmentAuthLinks(req) ? verifyUrl : undefined,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/verify-email", (req, res, next) => {
  try {
    const input = tokenSchema.parse(req.body);
    const token = consumeAuthToken({ type: "verify_email", tokenHash: tokenHash(input.token) });
    if (!token) {
      return res.status(400).json({ error: "Ссылка подтверждения недействительна или уже использована." });
    }
    const user = setUserEmailVerified(token.userId, true);
    writeAudit({
      userId: user?.id || token.userId,
      userEmail: user?.email || "",
      userRole: user?.role || "client",
      action: "auth.email.verify",
      details: {},
    });
    res.json({
      ok: true,
      message: user?.approval_status === "approved"
        ? "Электронная почта подтверждена. Теперь можно войти."
        : "Электронная почта подтверждена. Аккаунт ожидает подтверждения менеджера.",
      approvalStatus: user?.approval_status || "pending",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/resend-verification", async (req, res, next) => {
  try {
    const input = forgotPasswordSchema.parse(req.body);
    const email = normalizeEmail(input.email);
    const user = findUserByEmail(email);
    let developmentLink;
    if (user && !user.email_verified) {
      const plainToken = createPlainToken();
      createAuthToken({
        userId: user.id,
        type: "verify_email",
        tokenHash: tokenHash(plainToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      const verifyUrl = `${publicBaseUrl(req)}/?verify=${encodeURIComponent(plainToken)}`;
      const companyName = isClientRole(user.role)
        ? getClientState(user.id).profile?.companyName
        : "Менеджер Clover";
      const message = verificationEmail({ companyName, verifyUrl });
      try { await sendCloverMail({ to: email, ...message }); } catch (error) { console.error(error); }
      if (allowDevelopmentAuthLinks(req)) developmentLink = verifyUrl;
    }
    res.json({
      ok: true,
      message: "Если аккаунт существует и почта ещё не подтверждена, новое письмо отправлено.",
      developmentLink,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/forgot-password", async (req, res, next) => {
  try {
    const input = forgotPasswordSchema.parse(req.body);
    const email = normalizeEmail(input.email);
    const user = findUserByEmail(email);
    let developmentLink;
    if (user) {
      const plainToken = createPlainToken();
      createAuthToken({
        userId: user.id,
        type: "reset_password",
        tokenHash: tokenHash(plainToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      const resetUrl = `${publicBaseUrl(req)}/?reset=${encodeURIComponent(plainToken)}`;
      const message = resetPasswordEmail({ resetUrl });
      try { await sendCloverMail({ to: email, ...message }); } catch (error) { console.error(error); }
      if (allowDevelopmentAuthLinks(req)) developmentLink = resetUrl;
      writeAudit({
        userId: user.id, userEmail: user.email, userRole: user.role,
        action: "auth.password.reset.request", details: {},
      });
    }
    res.json({
      ok: true,
      message: "Если аккаунт существует, на его почту отправлена ссылка для восстановления пароля.",
      developmentLink,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/reset-password", async (req, res, next) => {
  try {
    const input = resetPasswordSchema.parse(req.body);
    const token = consumeAuthToken({ type: "reset_password", tokenHash: tokenHash(input.token) });
    if (!token) {
      return res.status(400).json({ error: "Ссылка восстановления недействительна или уже использована." });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    updateUserPassword(token.userId, passwordHash);
    const user = findUserById(token.userId);
    writeAudit({
      userId: user?.id || token.userId, userEmail: user?.email || "", userRole: user?.role || "",
      action: "auth.password.reset.complete", details: {},
    });
    res.json({ ok: true, message: "Новый пароль сохранён. Теперь можно войти." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const email = normalizeEmail(input.email);

    if (!checkLoginLimit(email)) {
      return res.status(429).json({
        error: "Слишком много попыток входа. Попробуйте через несколько минут.",
      });
    }

    const user = findUserByEmail(email);
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      return res.status(401).json({ error: "Неверная почта или пароль." });
    }
    if (!user.email_verified) {
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        error: "Подтвердите электронную почту по ссылке из письма.",
      });
    }
    if (user.disabled_at) {
      return res.status(403).json({
        code: "ACCOUNT_DISABLED",
        error: "Доступ закрыт. Обратитесь к администратору.",
      });
    }
  if (isClientRole(user.role) && user.approval_status !== "approved") {
      return res.status(403).json({
        code: user.approval_status === "rejected" ? "ACCOUNT_REJECTED" : "ACCOUNT_PENDING",
        error: user.approval_status === "rejected"
          ? "Регистрация отклонена. Свяжитесь с менеджером."
          : "Регистрация подтверждена по почте и ожидает одобрения менеджера.",
      });
    }

    clearLoginLimit(email);
    markUserLogin(user.id);
    writeAudit({
      userId: user.id, userEmail: user.email, userRole: user.role,
      action: "auth.login", details: {},
    });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/change-password", authRequired, async (req, res, next) => {
  try {
    if (isClientRole(req.user.role)) {
      return res.status(403).json({
        error: "Смену пароля клиента выполняет менеджер.",
        code: "CLIENT_PASSWORD_CHANGE_FORBIDDEN",
      });
    }
    const input = changePasswordSchema.parse(req.body);
    const user = findUserByEmail(req.user.email);
    if (!user || !(await bcrypt.compare(input.currentPassword, user.password_hash))) {
      return res.status(400).json({ error: "Текущий пароль указан неверно." });
    }
    if (input.currentPassword === input.newPassword) {
      return res.status(400).json({ error: "Новый пароль должен отличаться от текущего." });
    }
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    const updatedUser = updateUserPassword(user.id, passwordHash);
    auditFromRequest(req, "auth.password.change", { otherSessionsEnded: true });
    res.json({
      ok: true,
      message: "Пароль изменён. Другие сессии завершены.",
      token: signToken(updatedUser),
    });
  } catch (error) {
    next(error);
  }
});


app.post("/api/auth/logout-other-sessions", authRequired, (req, res) => {
  const updatedUser = revokeOtherSessions(req.user.id);
  auditFromRequest(req, "auth.sessions.revoke_other", {});
  res.json({
    ok: true,
    message: "Другие сессии завершены.",
    token: signToken(updatedUser),
  });
});

app.post("/api/admin/managers", authRequired, roleRequired("manager"), async (req, res, next) => {
  try {
    if (!actorCanManageStaff(req)) {
      return res.status(403).json({ error: "Недостаточно прав для создания менеджера." });
    }
    const input = managerCreateSchema.parse(req.body);
    const email = normalizeEmail(input.email);
    if (findUserByEmail(email)) {
      return res.status(409).json({ error: "Аккаунт с такой почтой уже существует." });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    // Сразу можно войти (без письма-подтверждения).
    const user = createUser({
      email,
      passwordHash,
      role: "manager",
      emailVerified: true,
      approvalStatus: "approved",
    });
    auditFromRequest(req, "manager.create", { managerId: user.id });
    res.status(201).json({
      ok: true,
      manager: publicUser(user),
      requiresEmailVerification: false,
      message: "Менеджер создан. Можно сразу войти по email и паролю.",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/staff", authRequired, roleRequired("manager"), (req, res) => {
  const adminCount = countUsersByRole("admin");
  const canManageRoles =
    isStaffRole(req.user.role) &&
    (req.user.role === "admin" || adminCount === 0);
  const canManageStaff = actorCanManageStaff(req);
  res.json({
    ok: true,
    staff: listStaffUsers(),
    adminCount,
    canManageRoles,
    canManageStaff,
    adminRoleSupported: true,
    featureOptions: STAFF_FEATURE_IDS,
  });
});

app.post(
  "/api/admin/users/:userId/role",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const targetId = String(req.params.userId || "").trim();
      const nextRole = String(req.body?.role || "").trim().toLowerCase();
      if (!["manager", "admin"].includes(nextRole)) {
        return res.status(400).json({
          error: "Допустимы роли manager или admin.",
          code: "ROLE_INVALID",
        });
      }

      const adminCount = countUsersByRole("admin");
      const actorIsAdmin = req.user.role === "admin";
      if (adminCount > 0 && !actorIsAdmin) {
        return res.status(403).json({
          error: "Назначать роли может только администратор.",
          code: "ADMIN_REQUIRED",
        });
      }
      if (!staffCanManageStaff(req.user)) {
        return res.status(403).json({
          error: "Недостаточно прав для управления менеджерами.",
          code: "STAFF_MANAGE_FORBIDDEN",
        });
      }

      const target = findUserById(targetId);
      if (!target) {
        return res.status(404).json({ error: "Пользователь не найден." });
      }
      if (!["manager", "admin"].includes(String(target.role))) {
        return res.status(409).json({
          error: "Роль можно менять только у менеджера или администратора.",
          code: "ROLE_TARGET_FORBIDDEN",
        });
      }

      if (String(target.id) === String(req.user.id) && nextRole !== "admin" && adminCount <= 1 && target.role === "admin") {
        return res.status(409).json({
          error: "Нельзя снять роль с единственного администратора.",
          code: "LAST_ADMIN",
        });
      }

      let updated;
      try {
        updated = updateUserRole(target.id, nextRole);
      } catch (error) {
        const message = String(error?.message || error);
        if (/CHECK|constraint|role/i.test(message)) {
          return res.status(409).json({
            error:
              "База ещё не поддерживает роль admin. Нужна миграция (подтвердите «да» на migrate-admin-role).",
            code: "ADMIN_ROLE_MIGRATION_REQUIRED",
          });
        }
        throw error;
      }

      auditFromRequest(req, "user.role.change", {
        userId: updated.id,
        from: target.role,
        to: updated.role,
      });

      res.json({ ok: true, user: publicUser(updated) });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/admin/staff/:userId/password",
  authRequired,
  roleRequired("manager"),
  async (req, res, next) => {
    try {
      const target = findUserById(String(req.params.userId || "").trim());
      assertCanManageTargetStaff(req, target);
      const input = staffPasswordSchema.parse(req.body);
      const passwordHash = await bcrypt.hash(input.password, 12);
      const updated = updateUserPassword(target.id, passwordHash);
      auditFromRequest(req, "manager.password.set", { managerId: target.id });
      res.json({
        ok: true,
        message: "Пароль обновлён. Старые сессии менеджера завершены.",
        user: publicUser(updated),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.patch(
  "/api/admin/staff/:userId/access",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const target = findUserById(String(req.params.userId || "").trim());
      assertCanManageTargetStaff(req, target);
      const disabled = Boolean(req.body?.disabled);
      if (disabled && target.role === "admin" && countUsersByRole("admin") <= 1) {
        return res.status(409).json({
          error: "Нельзя закрыть доступ единственному администратору.",
          code: "LAST_ADMIN",
        });
      }
      const updated = setStaffDisabled(target.id, disabled);
      auditFromRequest(req, disabled ? "manager.access.disable" : "manager.access.enable", {
        managerId: target.id,
      });
      res.json({
        ok: true,
        message: disabled ? "Доступ закрыт." : "Доступ открыт.",
        user: publicUser(updated),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.patch(
  "/api/admin/staff/:userId/permissions",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const target = findUserById(String(req.params.userId || "").trim());
      assertCanManageTargetStaff(req, target);
      const input = staffPermissionsSchema.parse(req.body || {});
      let payload;
      if (input.fullAccess || !Array.isArray(input.tabs)) {
        payload = staffPermissionsPayload({
          manageStaff: input.manageStaff,
        });
      } else {
        payload = staffPermissionsPayload({
          tabs: input.tabs,
          manageStaff: input.manageStaff,
        });
      }
      if (target.role === "admin") {
        payload = { manageStaff: true };
      }
      const updated = setStaffPermissions(target.id, payload);
      auditFromRequest(req, "manager.permissions.set", {
        managerId: target.id,
        permissions: payload,
      });
      res.json({
        ok: true,
        message: "Права обновлены.",
        user: publicUser(updated),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/admin/staff/:userId",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const target = findUserById(String(req.params.userId || "").trim());
      assertCanManageTargetStaff(req, target);
      if (target.role === "admin" && countUsersByRole("admin") <= 1) {
        return res.status(409).json({
          error: "Нельзя удалить единственного администратора.",
          code: "LAST_ADMIN",
        });
      }
      const removed = deleteStaffUser(target.id);
      if (!removed) {
        return res.status(404).json({ error: "Менеджер не найден." });
      }
      auditFromRequest(req, "manager.delete", {
        managerId: target.id,
        email: target.email,
      });
      res.json({ ok: true, message: "Менеджер удалён." });
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/passkeys", authRequired, (req, res) => {
  res.json({
    passkeys: listPasskeys(req.user.id).map((credential) => ({
      id: credential.id,
      transports: credential.transports,
      deviceType: credential.deviceType,
      backedUp: credential.backedUp,
      createdAt: credential.createdAt,
    })),
  });
});

app.post("/api/passkeys/registration/options", authRequired, async (req, res, next) => {
  try {
    const options = await registrationOptions({
      req,
      user: req.user,
      credentials: listPasskeys(req.user.id),
    });
    const ceremony = createWebAuthnChallenge({
      userId: req.user.id,
      type: "registration",
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    res.json({ ceremonyId: ceremony.id, options });
  } catch (error) {
    next(error);
  }
});

app.post("/api/passkeys/registration/verify", authRequired, async (req, res, next) => {
  try {
    const input = passkeyCeremonySchema.parse(req.body);
    const ceremony = consumeWebAuthnChallenge(input.ceremonyId, "registration");
    if (!ceremony || ceremony.userId !== String(req.user.id)) {
      return res.status(400).json({ error: "Запрос регистрации ключа доступа истёк. Повторите попытку." });
    }
    const verification = await verifyPasskeyRegistration({
      req,
      response: input.response,
      challenge: ceremony.challenge,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "Не удалось подтвердить ключ доступа." });
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const saved = savePasskey({
      id: credential.id,
      userId: req.user.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports || input.response?.response?.transports || [],
      deviceType: credentialDeviceType || "",
      backedUp: Boolean(credentialBackedUp),
      webauthnUserID: String(req.user.id),
    });
    auditFromRequest(req, "auth.passkey.register", { credentialId: saved.id });
    res.json({
      ok: true,
      message: "Вход по Face ID, отпечатку или коду устройства включён.",
      passkey: {
        id: saved.id,
        transports: saved.transports,
        deviceType: saved.deviceType,
        backedUp: saved.backedUp,
        createdAt: saved.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/passkeys/:credentialId", authRequired, (req, res) => {
  const credential = getPasskey(req.params.credentialId);
  if (!credential || credential.userId !== String(req.user.id)) {
    return res.status(404).json({ error: "Ключ доступа не найден." });
  }
  deletePasskey(req.user.id, credential.id);
  auditFromRequest(req, "auth.passkey.delete", { credentialId: credential.id });
  res.json({ ok: true });
});

app.post("/api/passkeys/authentication/options", async (req, res, next) => {
  try {
    const input = passkeyAuthenticationOptionsSchema.parse(req.body || {});
    const email = input.email ? normalizeEmail(input.email) : "";

    // С почтой — узкий список ключей аккаунта. Без почты — discoverable (Face ID выбирает ключ сам).
    if (email) {
      const user = findUserByEmail(email);
      const credentials = user ? listPasskeys(user.id) : [];
      if (!user || !user.email_verified || (isClientRole(user.role) && user.approval_status !== "approved") || !credentials.length) {
        return res.status(400).json({ error: "Для этого аккаунта вход по Face ID или ключу доступа пока не настроен." });
      }
      const options = await authenticationOptions({ req, credentials });
      const ceremony = createWebAuthnChallenge({
        userId: user.id,
        type: "authentication",
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      return res.json({ ceremonyId: ceremony.id, options, mode: "account" });
    }

    const options = await authenticationOptions({ req, credentials: [] });
    const ceremony = createWebAuthnChallenge({
      userId: "",
      type: "authentication",
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    res.json({ ceremonyId: ceremony.id, options, mode: "discoverable" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/passkeys/authentication/verify", async (req, res, next) => {
  try {
    const input = passkeyAuthenticationVerifySchema.parse(req.body || {});
    const email = input.email ? normalizeEmail(input.email) : "";
    const ceremony = consumeWebAuthnChallenge(input.ceremonyId, "authentication");
    const credential = getPasskey(input.response?.id || "");
    if (!ceremony || !credential) {
      return res.status(400).json({ error: "Не удалось подтвердить вход. Повторите попытку." });
    }

    const user = email
      ? findUserByEmail(email)
      : findUserById(credential.userId);

    if (
      !user
      || credential.userId !== String(user.id)
      || (ceremony.userId && ceremony.userId !== String(user.id))
    ) {
      return res.status(400).json({ error: "Не удалось подтвердить вход. Повторите попытку." });
    }
    if (!user.email_verified || (isClientRole(user.role) && user.approval_status !== "approved")) {
      return res.status(403).json({ error: "Для аккаунта пока недоступен вход." });
    }
    const verification = await verifyPasskeyAuthentication({
      req,
      response: input.response,
      challenge: ceremony.challenge,
      credential,
    });
    if (!verification.verified) {
      return res.status(401).json({ error: "Ключ доступа не подтверждён." });
    }
    updatePasskeyCounter(credential.id, verification.authenticationInfo.newCounter);
    clearLoginLimit(user.email);
    markUserLogin(user.id);
    writeAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: "auth.login.passkey",
      details: { credentialId: credential.id, mode: email ? "account" : "discoverable" },
    });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", authRequired, (req, res) => {
  const storedProducts = getGlobalState(
    "products",
    DEFAULT_PRODUCTS
  );
  const reclassified = applyInferredCategories(storedProducts);
  const products = reclassified.products;
  if (reclassified.changed) {
    setGlobalState("products", products);
  }
  const settings = getGlobalState(
    "settings",
    DEFAULT_SETTINGS
  );
  const allClientLinks = getGlobalState(
    "clientLinks",
    {}
  );
  const oneCProducts = normalizeOneCProducts(
    getGlobalState("oneCProducts", [])
  );
  const oneCById = oneCProductsById(oneCProducts);
  const managerProducts = products.map((product) =>
    enrichProductWithPurchasePrices(
      product,
      oneCById.get(String(product.oneCId || "")) || null
    )
  );

  if (isStaffRole(req.user.role)) {
    const normalizedClientLinks = Object.fromEntries(
      Object.entries(allClientLinks).map(([clientId, link]) => [
        clientId,
        normalizeClientLink(link),
      ])
    );

    return res.json({
      user: publicUser(req.user),
      products: managerProducts,
      // fullCatalogProducts намеренно не дублируем — клиент UI берёт products
      catalogPolicy: {
        matrixMode: "all",
        allowFullCatalog: true,
        matrixReady: true,
        matrixProductIds: [],
      },
      catalogPricesVersion: String(
        getGlobalState("catalogPricesVersion", "") || ""
      ),
      orders: listOrders(),
      trashedOrders: listTrashedOrders(),
      profile: {},
      addresses: [],
      favorites: [],
      settings,
      clientLinks: normalizedClientLinks,
      clients: listClients(),
      reconciliationRequests: listReconciliationRequests(),
      managerNotifications: listManagerNotifications({ limit: 100 }),
      oneCPriceTypes: normalizeOneCPriceTypes(
        getGlobalState("oneCPriceTypes", [])
      ),
      services: {
        mail: publicMailStatus(),
        push: publicPushStatus(),
        managerNotifications: publicManagerNotificationStatus(settings),
      },
    });
  }

  const state = getClientState(req.user.id);
  const clientLink = allClientLinks[req.user.id] || {};
  const catalog = resolveClientCatalog(
    products,
    clientLink,
    oneCProducts
  );
  const pricesVersion = String(
    getGlobalState("catalogPricesVersion", "") || ""
  );
  // Версия учитывает и выгрузку цен 1С, и настройки матрицы/вида цен клиента.
  const clientPricesRevision = [
    pricesVersion,
    String(catalog.link?.defaultPricingMode || ""),
    String(catalog.link?.defaultMarkupPercent ?? ""),
    String(catalog.link?.oneCPriceTypeId || ""),
    String(catalog.link?.matrixMode || ""),
    String((catalog.link?.matrixProductIds || []).length),
  ].join("::");

  const clientPayload = {
    user: publicUser(req.user),
    products: catalog.matrixProducts,
    catalogPolicy: catalog.policy,
    catalogPricesVersion: clientPricesRevision,
    orders: listOrders(req.user.id),
    trashedOrders: [],
    profile: state.profile,
    addresses: state.addresses,
    favorites: state.favorites,
    settings: publicClientSettings(settings),
    clientLinks: {
      [req.user.id]: catalog.link,
    },
    clients: [],
    reconciliationRequests: listReconciliationRequests(req.user.id),
    services: { mail: publicMailStatus(), push: publicPushStatus() },
  };

  // Полный каталог только если матрица узкая и разрешён полный каталог.
  if (
    catalog.policy?.allowFullCatalog &&
    catalog.policy?.matrixMode !== "all"
  ) {
    clientPayload.fullCatalogProducts = catalog.fullCatalogProducts;
  }

  return res.json(clientPayload);
});

app.put("/api/state/orders", authRequired, async (req, res) => {
  const incomingOrders = Array.isArray(req.body?.orders)
    ? req.body.orders
    : [];
  const previousOrders = isStaffRole(req.user.role)
    ? listOrders(null, { includeDeleted: true })
    : listOrders(req.user.id, { includeDeleted: true });
  const previousById = new Map(previousOrders.map((order) => [String(order.id), order]));

  if (isStaffRole(req.user.role)) {
    const safety = assertSafeManagerOrderReplace(previousOrders, incomingOrders);
    if (!safety.ok) {
      return res.status(safety.status || 409).json({ error: safety.error });
    }
  }

  let orders = lockOrderTrashFields(
    preserveTrashedOrders(previousOrders, incomingOrders),
    previousById
  ).map((order) =>
    sanitizeOrderExchangeForSave(
      order,
      previousById.get(String(order?.id || "")),
      req.user.role
    )
  );

  const statusPolicy = applyOrderStatusPolicy({
    previousById,
    orders,
    role: req.user.role,
  });
  if (!statusPolicy.ok) {
    return res.status(statusPolicy.statusCode || 409).json({
      error: statusPolicy.error,
      code: statusPolicy.code,
      orderId: statusPolicy.orderId,
      from: statusPolicy.from,
      to: statusPolicy.to,
      allowed: statusPolicy.allowed,
    });
  }
  orders = statusPolicy.orders;

  if (isClientRole(req.user.role)) {
    for (const order of orders) {
      const previous = previousById.get(String(order?.id || ""));
      const deliveryDate = String(order?.firstDeliveryDate || "").trim();
      const previousDelivery = String(previous?.firstDeliveryDate || "").trim();
      const isNew = !previous;
      const dateChanged = deliveryDate !== previousDelivery;
      if (!deliveryDate || (!isNew && !dateChanged)) continue;
      const dateCheck = validateDeliveryDate(deliveryDate);
      if (!dateCheck.ok) {
        return res.status(400).json({
          error: dateCheck.message,
          code: "INVALID_DELIVERY_DATE",
          orderId: order?.id || null,
        });
      }
    }

    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const links = getGlobalState("clientLinks", {});
    const oneCProducts = getGlobalState("oneCProducts", []);
    const clientLink = normalizeClientLink(links[req.user.id]);
    const matrixViolations = findClientOrderMatrixViolations(
      ordersRequiringMatrixCheck(orders, previousById),
      clientLink,
      products
    );
    if (matrixViolations.length) {
      const names = matrixViolations
        .map((item) => item.name || item.productId)
        .filter(Boolean)
        .slice(0, 5);
      const suffix = names.length ? ` (${names.join(", ")})` : "";
      return res.status(400).json({
        error:
          `В заказе есть товары вне вашей матрицы${suffix}. Уберите их или оформите через «товар вне матрицы».`,
        code: "MATRIX_PRODUCT_FORBIDDEN",
        items: matrixViolations.slice(0, 20),
      });
    }

    // Пересчёт цен для новых заказов. Отсутствие закупочной цены
    // не должно блокировать сохранение заказа менеджеру — жёсткая
    // проверка выполняется только перед передачей в 1С TEST.
    const repriced = repriceClientOrders(
      orders,
      products,
      clientLink,
      oneCProducts
    );
    orders = repriced.orders;
    if (repriced.issues.length) {
      auditFromRequest(req, "orders.save.price-warning", {
        count: orders.length,
        issues: repriced.issues.slice(0, 20),
      });
    }
  }

  replaceOrders({
    orders,
    userId: req.user.id,
    managerMode: isStaffRole(req.user.role),
  });
  auditFromRequest(req, "orders.save", { count: orders.length });

  if (isClientRole(req.user.role)) {
    const currentById = new Map(orders.map((order) => [String(order.id), order]));

    for (const order of orders) {
      const previous = previousById.get(String(order.id));
      const customerName = String(order.customerName || getClientState(req.user.id).profile?.companyName || req.user.email || "Клиент");
      const orderNumber = String(order.number || order.id || "");
      const customItems = Array.isArray(order.customItems) ? order.customItems : [];

      if (!previous) {
        const copy = managerOrderNotificationCopy(order, customerName);
        queueManagerNotification({
          type: "new_order",
          title: copy.title,
          body: copy.body,
          url: `/?managerTab=orders&order=${encodeURIComponent(order.id)}`,
          sourceId: String(order.id),
          order,
          customerName,
        });
      } else if (clientOrderSignature(previous) !== clientOrderSignature(order)) {
        const changeHash = createHash("sha256")
          .update(clientOrderSignature(order))
          .digest("hex")
          .slice(0, 16);
        const copy = managerOrderNotificationCopy(order, customerName);
        queueManagerNotification({
          type: "order_changed",
          title: copy.title,
          body: `Изменён\n${copy.body}`,
          url: `/?managerTab=orders&order=${encodeURIComponent(order.id)}`,
          sourceId: `${order.id}:${order.updatedAt || changeHash}:${changeHash}`,
        });
      }

      const previousCustomIds = new Set(
        (Array.isArray(previous?.customItems) ? previous.customItems : [])
          .map((item) => String(item.id || `${item.name}:${item.createdAt || ""}`))
      );
      for (const item of customItems) {
        const itemKey = String(item.id || `${item.name}:${item.createdAt || order.createdAt || ""}`);
        if (previousCustomIds.has(itemKey)) continue;
        queueManagerNotification({
          type: "custom_item",
          title: "Новый товар вне матрицы",
          body: `${customerName} · заказ №${orderNumber}: ${item.name || "Без названия"}, ${item.quantity || 1} ${item.unit || "шт."}${item.photoUrl || item.imageUrl ? " · приложено фото" : ""}`,
          url: `/?managerTab=orders&order=${encodeURIComponent(order.id)}`,
          sourceId: `${order.id}:${itemKey}`,
        });
      }
    }

    for (const previous of previousOrders) {
      if (currentById.has(String(previous.id))) continue;
      const orderNumber = String(previous.number || previous.id || "");
      queueManagerNotification({
        type: "order_deleted",
        title: `Клиент удалил заказ №${orderNumber}`,
        body: `${previous.customerName || req.user.email || "Клиент"} · заказ был удалён до принятия менеджером`,
        url: "/?managerTab=orders",
        sourceId: `${previous.id}:${previous.updatedAt || previous.createdAt || "deleted"}`,
      });
    }
  }

  if (isStaffRole(req.user.role)) {
    for (const order of orders) {
      const previous = previousById.get(String(order.id));
      if (!previous) continue;
      const changes = [];
      if (previous.status !== order.status) changes.push(`статус: ${order.status}`);
      if (orderItemsSignature(previous) !== orderItemsSignature(order)) changes.push("изменён состав заказа");
      if (String(previous.managerComment || "") !== String(order.managerComment || "")) {
        changes.push(order.managerComment ? "новое сообщение менеджера" : "сообщение менеджера удалено");
      }
      const previousExchange = normalizeExchangeState(previous.exchange);
      const currentExchange = normalizeExchangeState(order.exchange);
      if (previousExchange.status !== "error" && currentExchange.status === "error") {
        queueManagerNotification({
          type: "onec_error",
          title: `Не удалось передать в 1С заказ №${order.number || order.id || ""}`,
          body: currentExchange.error || currentExchange.message || "Проверьте подключение к 1С и статус заказа.",
          url: `/?managerTab=exchange&order=${encodeURIComponent(order.id)}`,
          sourceId: `${order.id}:${currentExchange.updatedAt || order.updatedAt || Date.now()}`,
        });
      }
      if (!changes.length) continue;
      const comment = String(order.managerComment || "").trim();
      sendOrderPush(order.clientId, {
        title: `Заказ №${order.number || ""} обновлён`,
        body: comment && changes.some((item) => item.includes("сообщение"))
          ? comment.slice(0, 180)
          : changes.join("; "),
        url: `/?order=${encodeURIComponent(order.id)}`,
        tag: `order-${order.id}`,
      }).catch((error) => console.error("Push order update error", error));
    }
  }

  res.json({
    ok: true,
    orders: orders.filter((order) => !isOrderTrashed(order)),
    trashedOrders: isStaffRole(req.user.role)
      ? orders.filter((order) => isOrderTrashed(order))
      : [],
  });
});

app.post("/api/state/orders/:orderId/trash", authRequired, (req, res) => {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...getGlobalState("settings", DEFAULT_SETTINGS),
  };
  const stored = getOrderById(req.params.orderId);
  if (!stored) {
    return res.status(404).json({ error: "Заказ не найден.", code: "ORDER_NOT_FOUND" });
  }

  const order = stored.payload;
  const isStaff = isStaffRole(req.user.role);
  const isOwner =
    isClientRole(req.user.role) && String(stored.userId) === String(req.user.id);

  if (!isStaff && !isOwner) {
    return res.status(403).json({ error: "Недостаточно прав.", code: "FORBIDDEN" });
  }

  if (isStaff && settings.managerCanDeleteOrders === false) {
    return res.status(403).json({
      error: "Удаление заказов менеджером отключено в настройках.",
      code: "DELETE_DISABLED",
    });
  }

  if (isOwner && settings.allowClientDelete === false) {
    return res.status(403).json({
      error: "Удаление заказов клиентом отключено в настройках.",
      code: "DELETE_DISABLED",
    });
  }

  const role = isStaff ? "manager" : "client";
  const gate = canTrashOrder(order, role);
  if (!gate.ok) {
    return res.status(409).json({ error: gate.error, code: gate.code });
  }

  const deletedAt = new Date().toISOString();
  const updated = updateOrderPayload(stored.id, {
    ...order,
    deletedAt,
    deletedBy: {
      userId: req.user.id,
      role: req.user.role,
    },
    updatedAt: deletedAt,
  });

  auditFromRequest(req, "order.trash", {
    orderId: stored.id,
    orderNumber: order.number,
    role: req.user.role,
  });

  const customerName = String(
    order.customerName ||
      (isOwner ? getClientState(req.user.id).profile?.companyName : "") ||
      req.user.email ||
      "Клиент"
  );
  const orderNumber = String(order.number || order.id || "");
  queueManagerNotification({
    type: "order_deleted",
    title: `Заказ №${orderNumber} в корзине`,
    body: `${customerName} · заказ перемещён в корзину (${isStaff ? "менеджер" : "клиент"})`,
    url: "/?managerTab=orders&ordersView=trash",
    sourceId: `${stored.id}:${deletedAt}:trash`,
  });

  res.json({
    ok: true,
    order: updated,
    orders: listOrders(isStaff ? null : req.user.id),
    trashedOrders: isStaff ? listTrashedOrders() : [],
  });
});

app.post(
  "/api/admin/orders/:orderId/restore",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const stored = getOrderById(req.params.orderId);
    if (!stored) {
      return res.status(404).json({ error: "Заказ не найден.", code: "ORDER_NOT_FOUND" });
    }

    const gate = canRestoreOrder(stored.payload);
    if (!gate.ok) {
      return res.status(409).json({ error: gate.error, code: gate.code });
    }

    const restoredAt = new Date().toISOString();
    const updated = updateOrderPayload(stored.id, {
      ...stored.payload,
      deletedAt: "",
      deletedBy: null,
      updatedAt: restoredAt,
    });

    auditFromRequest(req, "order.restore", {
      orderId: stored.id,
      orderNumber: stored.payload.number,
    });

    res.json({
      ok: true,
      order: updated,
      orders: listOrders(),
      trashedOrders: listTrashedOrders(),
    });
  }
);

app.delete(
  "/api/admin/orders/:orderId",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...getGlobalState("settings", DEFAULT_SETTINGS),
    };
    if (settings.managerCanDeleteOrders === false) {
      return res.status(403).json({
        error: "Удаление заказов менеджером отключено в настройках.",
        code: "DELETE_DISABLED",
      });
    }

    const stored = getOrderById(req.params.orderId);
    if (!stored) {
      return res.status(404).json({ error: "Заказ не найден.", code: "ORDER_NOT_FOUND" });
    }

    const gate = canPurgeOrder(stored.payload);
    if (!gate.ok) {
      return res.status(409).json({ error: gate.error, code: gate.code });
    }

    deleteOrderById(stored.id);
    auditFromRequest(req, "order.purge", {
      orderId: stored.id,
      orderNumber: stored.payload.number,
    });

    res.json({
      ok: true,
      orders: listOrders(),
      trashedOrders: listTrashedOrders(),
    });
  }
);

function notifyClientOrderStatusChanged(order, previousStatus) {
  const clientId = order.clientId || order.user_id;
  if (!clientId) return;
  sendOrderPush(clientId, {
    title: `Заказ №${order.number || ""} обновлён`,
    body: `статус: ${order.status}`,
    url: `/?order=${encodeURIComponent(order.id)}`,
    tag: `order-${order.id}`,
  }).catch((error) => console.error("Push order status error", error));
}

app.patch(
  "/api/orders/:orderId/status",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const stored = getOrderById(req.params.orderId);
    if (!stored) {
      return res.status(404).json({ error: "Заказ не найден.", code: "ORDER_NOT_FOUND" });
    }

    const built = buildStatusUpdatedOrder(stored.payload, req.body?.status, {
      role: req.user.role,
      actor: isStaffRole(req.user.role) ? "Менеджер" : "Клиент",
      historyType: "status.changed",
      historyId: randomUUID(),
    });
    if (!built.ok) {
      return res.status(built.statusCode || 409).json({
        error: built.error,
        code: built.code,
        from: built.from,
        to: built.to,
        allowed: built.allowed,
      });
    }

    if (built.unchanged) {
      return res.json({ ok: true, unchanged: true, order: stored.payload });
    }

    const previousStatus = stored.payload.status;
    const order = updateOrderPayload(stored.id, built.order);
    auditFromRequest(req, "orders.status.patch", {
      orderId: order.id,
      orderNumber: order.number,
      from: previousStatus,
      to: order.status,
    });
    notifyClientOrderStatusChanged(order, previousStatus);
    res.json({ ok: true, unchanged: false, order });
  }
);

app.post(
  "/api/orders/status/bulk",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
    const status = req.body?.status;
    if (!orderIds.length) {
      return res.status(400).json({ error: "Не выбраны заказы.", code: "ORDER_IDS_REQUIRED" });
    }

    const updated = [];
    const skipped = [];
    const errors = [];

    for (const orderId of orderIds) {
      const stored = getOrderById(orderId);
      if (!stored) {
        errors.push({ orderId: String(orderId), code: "ORDER_NOT_FOUND", error: "Заказ не найден." });
        continue;
      }
      const built = buildStatusUpdatedOrder(stored.payload, status, {
        role: req.user.role,
        actor: "Менеджер",
        historyType: "status.bulk",
        historyId: randomUUID(),
      });
      if (!built.ok) {
        skipped.push({
          orderId: String(stored.id),
          code: built.code,
          error: built.error,
          from: built.from,
          to: built.to,
          allowed: built.allowed,
        });
        continue;
      }
      if (built.unchanged) {
        skipped.push({
          orderId: String(stored.id),
          code: "ORDER_STATUS_UNCHANGED",
          error: "Статус уже установлен.",
        });
        continue;
      }
      const previousStatus = stored.payload.status;
      const order = updateOrderPayload(stored.id, built.order);
      notifyClientOrderStatusChanged(order, previousStatus);
      updated.push(order);
    }

    auditFromRequest(req, "orders.status.bulk", {
      status,
      updated: updated.map((order) => order.id),
      skippedCount: skipped.length,
      errorCount: errors.length,
    });

    res.json({
      ok: errors.length === 0 && (updated.length > 0 || skipped.length === orderIds.length),
      status,
      updated,
      skipped,
      errors,
    });
  }
);

async function handleOneCTestOrder(req, res, next) {
  try {
    const database = requireOneCAllowedDatabase(req, res);
    if (!database) return;

    const protocolVersion = String(req.headers["x-clover-protocol"] || "").trim();
    const legacyProtocol = protocolVersion === "";
    if (!legacyProtocol && protocolVersion !== "2") {
      return res.status(426).json({
        code: "ONEC_EXTENSION_UPDATE_REQUIRED",
        error: "Версия протокола расширения 1С не поддерживается.",
      });
    }

    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const clientLinks = getGlobalState("clientLinks", {});
    const productsById = new Map(
      products.map((product) => [String(product.id), product])
    );

    if (Array.isArray(req.body?.items) && req.body.items.length) {
      receivePurchasePrices({
        items: req.body.items,
        database,
      });
    }

    const candidates = listReadyOrdersForOneC(database);
    if (!candidates.length) {
      return res.status(404).json({
        code: "EMPTY_QUEUE",
        error: "Нет новых заказов",
        userMessage: "Нет новых заказов",
      });
    }

    let realOrder = null;
    let claimBlockedReason = null;
    const contour = exchangeDatabaseLabel(database);

    for (const candidate of candidates) {
      const priceRequirements = buildOrderPriceRequirements(
        candidate,
        products,
        clientLinks[candidate.clientId] || {}
      );
      const freshnessIssues = validatePriceRequirements(
        priceRequirements,
        getGlobalState("oneCProducts", []),
        { maxAgeMs: priceMaxAgeMs(), expectedDatabase: database }
      );
      if (freshnessIssues.length) {
        claimBlockedReason = {
          status: 409,
          body: {
            code: "PURCHASE_PRICE_REFRESH_REQUIRED",
            error: `Перед передачей заказа ${contour} должна отправить свежие закупочные цены.`,
            items: freshnessIssues,
            priceRequest: buildPriceRequest({
              scope: "next-order",
              order: candidate,
              products,
              clientLinks,
              maxAgeMs: priceMaxAgeMs(),
              database,
            }),
          },
        };
        break;
      }

      const draftItems = (candidate.items || []).map((item) => {
        const product = productsById.get(String(item.productId ?? item.id));
        return {
          id: String(item.oneCId || product?.oneCId || "").trim(),
          displayName: item.name || product?.name || "",
        };
      });
      const missingItems = draftItems.filter((item) => !item.id);
      if (missingItems.length) {
        claimBlockedReason = {
          status: 409,
          body: {
            error: "Не все товары заказа связаны с номенклатурой 1С.",
            items: missingItems.map((item) => item.displayName || item.name),
          },
        };
        break;
      }

      const claimed = claimOrderForOneC(candidate.id, database);
      if (!claimed) continue;
      realOrder = claimed;
      break;
    }

    if (!realOrder) {
      if (claimBlockedReason) {
        return res.status(claimBlockedReason.status).json(claimBlockedReason.body);
      }
      return res.status(404).json({
        code: "EMPTY_QUEUE",
        error: "Нет новых заказов",
        userMessage: "Нет новых заказов",
      });
    }

    writeAudit({
      action: "one-c.order.claimed",
      details: {
        orderId: realOrder.id,
        orderNumber: realOrder.number || "",
        database,
      },
    });

    // Цена уже согласована клиентом в заказе и фиксируется при постановке
    // в очередь. Свежая закупочная цена из 1С обязательна для контроля и
    // расчёта следующих заказов, но не меняет сумму уже созданного заказа.
    const rawClaimItems = (realOrder.items || []).map((item) => {
      const product = productsById.get(String(item.productId ?? item.id));
      const oneCId = String(item.oneCId || product?.oneCId || "").trim();
      const quantity = Number(item.quantity) || 1;
      const price =
        Number(item.unitPrice) ||
        (Number(item.lineTotal) || 0) / quantity;

      const saleUnit = SALE_UNITS.includes(item.unit)
        ? item.unit
        : "piece";
      const multiplier = Math.max(1, Number(item.multiplier) || 1);
      const totalPieces = quantity * multiplier;
      const lineTotal = Number(item.lineTotal) || quantity * price;

      return {
        id: oneCId,
        code: item.oneCCode || product?.oneCCode || item.code || product?.code || "",
        name: item.oneCName || product?.oneCName || item.name || product?.name || "",
        displayName: item.name || product?.name || "",
        saleUnit,
        saleUnitName: unitLabel(saleUnit),
        // 1С: всегда количество в шт (totalPieces), единица «шт»
        unit: "piece",
        unitName: "шт",
        multiplier,
        totalPieces,
        quantity,
        price,
        lineTotal,
      };
    });

    const aligned = alignLinePricesToCeilTotal(rawClaimItems, "price");
    const items = aligned.items.map(({ lineTotal, ...rest }) => rest);
    const lockedOrderTotal = aligned.total;

    const clientLink = normalizeClientLink(clientLinks[realOrder.clientId]);

    if (legacyProtocol) {
      writeAudit({
        action: "one-c.order.legacy-protocol",
        details: {
          orderId: realOrder.id,
          orderNumber: realOrder.number || "",
          database,
        },
      });
    }

    return res.json({
      ok: true,
      protocol: legacyProtocol ? "legacy-v5" : "2",
      pricingPolicy: "order-locked",
      lockedOrderTotal,
      claimed: true,
      exchangeStatus: "sending",
      database,
      order: {
        id: realOrder.id,
        number: realOrder.number,
        date: realOrder.createdAt || new Date().toISOString(),
        deliveryDate: realOrder.firstDeliveryDate || "",
        address: realOrder.address || "",
        status: realOrder.status || "Новый",
        clientComment: realOrder.clientComment || "",
        managerComment: realOrder.managerComment || "",
        customer: {
          cloverId: realOrder.clientId || "",
          id: clientLink.oneCId || "",
          code: clientLink.oneCCode || clientLink.oneCMatchCode || "",
          name:
            clientLink.oneCName ||
            clientLink.oneCMatchName ||
            realOrder.customerName ||
            "Покупатель Clover",
          displayName: realOrder.customerName || "Покупатель Clover",
          contactName: realOrder.customerContact || "",
          phone: clientLink.oneCMatchPhone || realOrder.customerPhone || "",
          email: clientLink.oneCMatchEmail || realOrder.customerEmail || "",
          address: realOrder.address || "",
          inn: clientLink.oneCInn || clientLink.oneCMatchInn || "",
          lookupRequired: !clientLink.oneCId,
        },
        items,
        total: lockedOrderTotal,
        comment: buildOneCOrderComment(realOrder),
      },
    });
  } catch (error) {
    next(error);
  }
}

app.use("/api/one-c", oneCAuthRequired);

app.get("/api/one-c/queue-status", (req, res) => {
  const database = requireOneCAllowedDatabase(req, res);
  if (!database) return;

  res.json({
    ok: true,
    database,
    queue: oneCQueueSnapshot(database),
  });
});

app.get("/api/one-c/purchase-price-request", (req, res) => {
  const database = requireOneCAllowedDatabase(req, res);
  if (!database) return;

  const products = getGlobalState("products", DEFAULT_PRODUCTS);
  const clientLinks = getGlobalState("clientLinks", {});
  const orders = listOrders();
  const settings = getGlobalState("settings", DEFAULT_SETTINGS);
  const includeStorefrontPurchaseMarkup =
    String(settings?.storefrontPricingMode || "").trim() === "purchase_markup";
  const scope = String(req.query.scope || "next-order") === "all" ? "all" : "next-order";
  const order = scope === "next-order" ? nextOrderForOneC(database) : null;
  const request = buildPriceRequest({
    scope,
    order,
    products,
    clientLinks,
    orders,
    maxAgeMs: priceMaxAgeMs(),
    database,
    includeStorefrontPurchaseMarkup,
  });

  const requirements = scope === "all"
    ? buildAllPriceRequirements(products, clientLinks, orders, {
        includeStorefrontPurchaseMarkup,
      })
    : request.items;
  const issues = validatePriceRequirements(
    requirements,
    getGlobalState("oneCProducts", []),
    { maxAgeMs: priceMaxAgeMs(), expectedDatabase: database }
  );

  res.json({
    ...request,
    database,
    refreshRequired: issues.length > 0,
    issues,
  });
});

app.post("/api/one-c/purchase-prices", (req, res, next) => {
  try {
    const database = requireOneCAllowedDatabase(req, res);
    if (!database) return;
    const merged = receivePurchasePrices({
      items: req.body?.items,
      database,
    });
    res.json({
      ok: true,
      database,
      receivedAt: merged.receivedAt,
      accepted: merged.accepted.length,
      rejected: merged.rejected,
    });
  } catch (error) {
    next(error);
  }
});

/** Справочник видов цен (категорий цен) из разрешённой базы 1С. */
app.get("/api/one-c/price-types", (req, res) => {
  const database = requireOneCAllowedDatabase(req, res);
  if (!database) return;
  const types = normalizeOneCPriceTypes(getGlobalState("oneCPriceTypes", []));
  const meta = getGlobalState("oneCPriceTypesMeta", {});
  res.json({
    ok: true,
    database,
    items: types,
    updatedAt: meta.updatedAt || "",
  });
});

app.post("/api/one-c/price-types", (req, res, next) => {
  try {
    const database = requireOneCAllowedDatabase(req, res);
    if (!database) return;
    const receivedAt = new Date().toISOString();
    const merged = mergeOneCPriceTypes(
      getGlobalState("oneCPriceTypes", []),
      req.body?.items ?? req.body?.priceTypes ?? [],
      { receivedAt }
    );
    setGlobalState("oneCPriceTypes", merged.types);
    setGlobalState("oneCPriceTypesMeta", {
      updatedAt: receivedAt,
      accepted: merged.accepted,
      database,
    });
    auditFromRequest(req, "one-c.price-types.receive", {
      accepted: merged.accepted,
      database,
    });
    res.json({
      ok: true,
      database,
      receivedAt,
      accepted: merged.accepted,
      items: merged.types,
    });
  } catch (error) {
    next(error);
  }
});

/** Запрос продажных цен по видам для клиентов и витрины. */
app.get("/api/one-c/sale-price-request", (req, res) => {
  const database = requireOneCAllowedDatabase(req, res);
  if (!database) return;
  const products = getGlobalState("products", DEFAULT_PRODUCTS);
  const clientLinks = getGlobalState("clientLinks", {});
  const settings = getGlobalState("settings", DEFAULT_SETTINGS);
  const priceTypes = normalizeOneCPriceTypes(getGlobalState("oneCPriceTypes", []));
  const items = buildSalePriceRequirements(products, clientLinks, {
    storefrontPriceTypeId: settings?.storefrontPriceTypeId || "",
    storefrontPricingMode: settings?.storefrontPricingMode || "price_type",
    storefrontCostPriceTypeId: findPurchasePriceTypeId(priceTypes),
  });
  res.json({
    ok: true,
    database,
    items,
    priceTypes,
  });
});

/** Приём продажных цен номенклатуры по виду цен из разрешённой базы 1С. */
app.post("/api/one-c/sale-prices", (req, res, next) => {
  try {
    const database = requireOneCAllowedDatabase(req, res);
    if (!database) return;
    const receivedAt = new Date().toISOString();
    const merged = mergeSalePricesByType(
      getGlobalState("oneCProducts", []),
      req.body?.items ?? [],
      { receivedAt }
    );
    setGlobalState("oneCProducts", merged.products);
    setGlobalState("catalogPricesVersion", merged.receivedAt || receivedAt);
    auditFromRequest(req, "one-c.sale-prices.receive", {
      accepted: merged.accepted.length,
      rejected: merged.rejected.length,
      database,
    });
    res.json({
      ok: true,
      database,
      receivedAt: merged.receivedAt,
      accepted: merged.accepted.length,
      rejected: merged.rejected,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/one-c/test-order", handleOneCTestOrder);
app.post("/api/one-c/test-order", handleOneCTestOrder);

app.post("/api/one-c/orders/:orderId/ack", (req, res) => {
  const stored = getOrderById(req.params.orderId);

  if (!stored) {
    return res.status(404).json({
      error: "Заказ не найден.",
    });
  }

  const ackDatabase = requireOneCAllowedDatabase(req, res);
  if (!ackDatabase) return;

  const previous = normalizeExchangeState(stored.payload.exchange);
  if (
    previous.database &&
    previous.database !== ackDatabase &&
    previous.status !== "not_sent"
  ) {
    return res.status(409).json({
      error: `Заказ стоит в очереди контура ${previous.database}, а ACK пришёл от ${ackDatabase}.`,
    });
  }

  const expectedOrderNumber = String(stored.payload.number || "").trim();
  const providedOrderNumber = String(req.body?.orderNumber || "").trim();
  const legacyAck = providedOrderNumber === "";
  const receivedOrderNumber = providedOrderNumber || expectedOrderNumber;
  const documentNumber = String(
    req.body?.documentNumber || req.body?.documentId || ""
  ).trim();

  if (!expectedOrderNumber) {
    return res.status(422).json({
      error: "Подтверждение отклонено: у заказа Clover отсутствует номер.",
    });
  }

  if (receivedOrderNumber !== expectedOrderNumber) {
    return res.status(409).json({
      error: "Подтверждение относится к другому заказу Clover.",
      expectedOrderNumber,
    });
  }

  if (!documentNumber) {
    return res.status(422).json({
      error: "1С не передала номер созданного документа.",
    });
  }

  if (previous.status === "sent") {
    if (String(previous.receipt || "").trim() === documentNumber) {
      return res.json({
        ok: true,
        orderId: stored.id,
        status: "sent",
        duplicateAck: true,
      });
    }
    return res.status(409).json({
      error: "Заказ уже подтверждён другим номером документа 1С.",
    });
  }

  if (previous.status !== "ready" && previous.status !== "sending") {
    return res.status(409).json({
      error: `Подтверждение отклонено: заказ не находится в очереди ${exchangeDatabaseLabel(ackDatabase)}.`,
    });
  }

  const duplicateReceiptOrder = listOrders().find((candidate) => {
    if (String(candidate.id || "") === String(stored.id || "")) return false;
    return (
      String(normalizeExchangeState(candidate.exchange).receipt || "").trim() ===
      documentNumber
    );
  });

  if (duplicateReceiptOrder) {
    return res.status(409).json({
      error:
        "Этот номер документа 1С уже связан с другим заказом Clover. Подтверждение отклонено для защиты от ложного дубля.",
      conflictingOrderNumber: duplicateReceiptOrder.number || "",
    });
  }

  const acknowledgedAt = new Date().toISOString();
  const acknowledgedCustomer =
    req.body?.customer && typeof req.body.customer === "object"
      ? req.body.customer
      : {};
  const customer = normalizeOneCClient({
    ...acknowledgedCustomer,
    id:
      acknowledgedCustomer.id ||
      acknowledgedCustomer.oneCId ||
      req.body?.counterpartyId ||
      req.body?.clientId ||
      req.body?.customerId,
    code:
      acknowledgedCustomer.code ||
      acknowledgedCustomer.oneCCode ||
      req.body?.counterpartyCode ||
      req.body?.clientCode,
    name:
      acknowledgedCustomer.name ||
      acknowledgedCustomer.oneCName ||
      req.body?.counterpartyName ||
      req.body?.clientName ||
      req.body?.customerName ||
      stored.payload.customerName,
    inn:
      acknowledgedCustomer.inn ||
      acknowledgedCustomer.oneCInn ||
      req.body?.counterpartyInn ||
      req.body?.clientInn,
    phone:
      acknowledgedCustomer.phone ||
      req.body?.counterpartyPhone ||
      req.body?.clientPhone ||
      stored.payload.customerPhone,
    email:
      acknowledgedCustomer.email ||
      req.body?.counterpartyEmail ||
      req.body?.clientEmail ||
      stored.payload.customerEmail,
  });

  if (stored.payload.clientId && customer.id && customer.name) {
    const currentLinks = getGlobalState("clientLinks", {});
    const updatedLinks = linkCloverClient(
      currentLinks,
      stored.payload.clientId,
      customer,
      acknowledgedAt
    );
    setGlobalState("clientLinks", updatedLinks);
  }

  const exchange = {
    ...previous,
    status: "sent",
    checkedAt: acknowledgedAt,
    lastAttemptAt: acknowledgedAt,
    sentAt: acknowledgedAt,
    receipt: documentNumber,
    channel: "onec-pull",
    message: "Заказ получен и создан в 1С.",
  };

  updateOrderPayload(stored.id, {
    ...stored.payload,
    exchange,
    updatedAt: acknowledgedAt,
  });

  writeAudit({
    action: "one-c.order.ack",
    details: {
      orderId: stored.id,
      orderNumber: expectedOrderNumber,
      documentNumber,
      database: ackDatabase,
      legacyAck,
    },
  });

  res.json({
    ok: true,
    orderId: stored.id,
    orderNumber: expectedOrderNumber,
    status: "sent",
    legacyAckAccepted: legacyAck,
    clientLinked: Boolean(stored.payload.clientId && customer.id && customer.name),
  });
});

/**
 * 1С: после ручной смены СостояниеЗаказа → бизнес-статус клиента «Принят».
 * Требует exchange.status=sent (ACK уже был). Не откатывает статусы дальше «Новый».
 */
app.post("/api/one-c/orders/accepted", (req, res) => {
  const acceptedDatabase = requireOneCAllowedDatabase(req, res);
  if (!acceptedDatabase) return;

  const orderNumber = String(req.body?.orderNumber || "").trim();
  const documentNumber = String(req.body?.documentNumber || "").trim();
  const oneCState = String(req.body?.oneCState || "").trim();
  const orderIdHint = String(req.body?.orderId || "").trim();

  if (!orderNumber && !orderIdHint) {
    return res.status(422).json({
      error: "Укажите orderNumber или orderId заказа Clover.",
      code: "ORDER_REF_REQUIRED",
    });
  }

  if (!oneCState) {
    return res.status(422).json({
      error: "1С не передала новое состояние заказа (oneCState).",
      code: "ONEC_STATE_REQUIRED",
    });
  }

  let stored = orderIdHint ? getOrderById(orderIdHint) : null;
  if (!stored && orderNumber) {
    const matches = listOrders().filter(
      (order) => String(order.number || "").trim() === orderNumber
    );
    if (matches.length > 1 && !documentNumber) {
      return res.status(409).json({
        error: "Найдено несколько заказов с этим номером. Укажите documentNumber.",
        code: "ORDER_NUMBER_AMBIGUOUS",
      });
    }
    let match = null;
    if (matches.length === 1) {
      match = matches[0];
    } else if (matches.length > 1) {
      match =
        matches.find(
          (order) =>
            String(normalizeExchangeState(order.exchange).receipt || "").trim() ===
            documentNumber
        ) || null;
    }
    if (match) {
      stored = { id: match.id, payload: match };
    }
  }

  if (!stored?.id || !stored?.payload) {
    return res.status(404).json({
      error: "Заказ Clover не найден.",
      code: "ORDER_NOT_FOUND",
    });
  }

  const payload = stored.payload;
  const orderId = String(stored.id);

  if (orderNumber && String(payload.number || "").trim() !== orderNumber) {
    return res.status(409).json({
      error: "orderNumber не совпадает с заказом.",
      code: "ORDER_NUMBER_MISMATCH",
      expectedOrderNumber: String(payload.number || "").trim(),
    });
  }

  const exchange = normalizeExchangeState(payload.exchange);
  if (exchange.status !== "sent") {
    return res.status(409).json({
      error:
        "Статус «Принят» из 1С принимается только после ACK (exchange.status=sent).",
      code: "ORDER_NOT_ACKED",
      exchangeStatus: exchange.status,
    });
  }

  if (
    documentNumber &&
    String(exchange.receipt || "").trim() &&
    String(exchange.receipt || "").trim() !== documentNumber
  ) {
    return res.status(409).json({
      error: "Номер документа 1С не совпадает с подтверждённым ACK.",
      code: "DOCUMENT_NUMBER_MISMATCH",
      expectedDocumentNumber: String(exchange.receipt || "").trim(),
    });
  }

  const built = applyOneCAcceptedStatus(payload, {
    historyId: randomUUID(),
    oneCState,
    actor: "1С",
  });
  if (!built.ok) {
    return res.status(built.statusCode || 409).json({
      error: built.error,
      code: built.code,
      from: built.from,
      to: built.to,
      allowed: built.allowed,
    });
  }

  if (built.unchanged) {
    return res.json({
      ok: true,
      unchanged: true,
      orderId,
      orderNumber: String(payload.number || "").trim(),
      status: payload.status || "Новый",
    });
  }

  const previousStatus = payload.status;
  const order = updateOrderPayload(orderId, built.order);
  writeAudit({
    action: "one-c.order.accepted",
    details: {
      orderId,
      orderNumber: String(order.number || "").trim(),
      documentNumber: documentNumber || String(exchange.receipt || "").trim(),
      oneCState,
      from: previousStatus,
      to: order.status,
      database: acceptedDatabase,
    },
  });
  notifyClientOrderStatusChanged(order, previousStatus);
  // Не создаём in-app уведомление менеджеру здесь: после «Передать в 1С»
  // баннер уже снят, а статус «Принят» виден в карточке заказа через live-refresh.
  // Иначе ACK 1С сразу создаёт новое непрочитанное и кажется, что уведомление «не исчезает».

  res.json({
    ok: true,
    unchanged: false,
    orderId,
    orderNumber: String(order.number || "").trim(),
    status: order.status,
  });
});

app.put(
  "/api/state/profile",
  authRequired,
  roleRequired("client"),
  (req, res) => {
    const incoming =
      req.body?.profile && typeof req.body.profile === "object" && !Array.isArray(req.body.profile)
        ? req.body.profile
        : {};
    const current = getClientState(req.user.id).profile || {};
    const accountEmail = normalizeEmail(req.user.email);
    // Клиент не может сменить email/логин через профиль.
    const profile = normalizeClientProfileContacts(
      {
        ...current,
        ...incoming,
      },
      accountEmail || current.email || ""
    );
    setClientStateField(req.user.id, "profile", profile);

    res.json({ ok: true, profile });
  }
);

app.put(
  "/api/state/addresses",
  authRequired,
  roleRequired("client"),
  (req, res) => {
    const incoming = Array.isArray(req.body?.addresses)
      ? req.body.addresses
      : [];
    const current = getClientState(req.user.id).addresses || [];
    // Защита: пустой PUT после смены пароля/перелогина не должен стирать адреса.
    if (incoming.length === 0 && current.length > 0) {
      auditFromRequest(req, "addresses.save_rejected_empty", {
        kept: current.length,
      });
      return res.json({ ok: true, addresses: current, rejectedEmpty: true });
    }

    setClientStateField(req.user.id, "addresses", incoming);
    res.json({ ok: true, addresses: incoming });
  }
);

app.put(
  "/api/state/favorites",
  authRequired,
  roleRequired("client"),
  (req, res) => {
    setClientStateField(
      req.user.id,
      "favorites",
      Array.isArray(req.body?.favorites)
        ? req.body.favorites
        : []
    );

    res.json({ ok: true });
  }
);

app.put(
  "/api/state/products",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const incomingProducts = Array.isArray(req.body?.products)
      ? req.body.products.map(stripRuntimeProductPricing)
      : DEFAULT_PRODUCTS;
    const storedProducts = getGlobalState("products", DEFAULT_PRODUCTS);
    const products = mergeProductsPreservingOneCLinks(
      incomingProducts,
      storedProducts
    );

    setGlobalState("products", products);
    auditFromRequest(req, "products.save", { count: products.length });

    res.json({ ok: true, products });
  }
);

app.put(
  "/api/state/settings",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const current = {
      ...DEFAULT_SETTINGS,
      ...getGlobalState("settings", DEFAULT_SETTINGS),
    };
    const incoming = req.body?.settings || {};
    // Поля витрины меняет только admin (через /api/admin/storefront).
    const safeIncoming =
      req.user.role === "admin"
        ? incoming
        : {
            ...stripStorefrontSettings(incoming),
            ...Object.fromEntries(
              [
                "storefrontPricingMode",
                "storefrontMarkupPercent",
                "storefrontPriceTypeId",
                "storefrontPriceTypeName",
                "storefrontShowOnlyLinked",
                "storefrontHeroTitle",
                "storefrontHeroLead",
              ].map((key) => [key, current[key]])
            ),
          };

    setGlobalState("settings", {
      ...DEFAULT_SETTINGS,
      ...safeIncoming,
    });
    auditFromRequest(req, "settings.save", {});

    res.json({ ok: true });
  }
);

/** Настройки витрины сайта — только admin. */
app.get(
  "/api/admin/storefront",
  authRequired,
  roleRequired("admin"),
  (req, res) => {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...getGlobalState("settings", DEFAULT_SETTINGS),
    };
    res.json({
      settings: getStorefrontSettings(settings),
      priceTypes: normalizeOneCPriceTypes(
        getGlobalState("oneCPriceTypes", [])
      ),
      previewPath: "/vitrina",
    });
  }
);

app.put(
  "/api/admin/storefront",
  authRequired,
  roleRequired("admin"),
  (req, res) => {
    const current = {
      ...DEFAULT_SETTINGS,
      ...getGlobalState("settings", DEFAULT_SETTINGS),
    };
    const next = mergeStorefrontSettings(current, req.body?.settings || {});
    setGlobalState("settings", next);
    auditFromRequest(req, "storefront.settings.save", {
      pricingMode: next.storefrontPricingMode || "price_type",
      markupPercent: next.storefrontMarkupPercent || 0,
      priceTypeId: next.storefrontPriceTypeId || "",
    });
    res.json({
      ok: true,
      settings: next,
      storefront: getStorefrontSettings(next),
    });
  }
);


/** Превью цен матрицы клиента — те же цены, что увидит ЛК. */
app.get(
  "/api/admin/clients/:clientId/matrix-prices",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const clientId = String(req.params.clientId || "").trim();
    const clientUser = findUserById(clientId);
    if (!clientUser || clientUser.role !== "client") {
      return res.status(404).json({ error: "Клиент Clover не найден." });
    }

    const storedProducts = getGlobalState("products", DEFAULT_PRODUCTS);
    const oneCProducts = normalizeOneCProducts(
      getGlobalState("oneCProducts", [])
    );
    const oneCById = oneCProductsById(oneCProducts);
    const allLinks = getGlobalState("clientLinks", {});
    const rawLink = allLinks[clientId] || {};
    const catalog = resolveClientCatalog(storedProducts, rawLink, oneCProducts);
    const link = catalog.link;
    const priceTypeId = String(link.oneCPriceTypeId || "").trim();

    const items = {};
    for (const product of catalog.matrixProducts) {
      const oneCItem = oneCById.get(String(product.oneCId || "")) || null;
      const typed = {};
      for (const unit of SALE_UNITS) {
        const resolved = resolveTypedSalePrice(
          product,
          oneCItem,
          priceTypeId,
          unit
        );
        typed[unit] = resolved ? resolved.price : null;
      }
      items[String(product.id)] = {
        clientPriceMode: product.clientPriceMode || "",
        markupPercent: product.markupPercent ?? 0,
        pricePiece: product.pricePiece ?? 0,
        pricePack: product.pricePack ?? 0,
        priceBundle: product.priceBundle ?? 0,
        priceBox: product.priceBox ?? 0,
        pricePair: product.pricePair ?? 0,
        priceRoll: product.priceRoll ?? 0,
        typed,
        salePriceReceivedAt: product.salePriceReceivedAt || "",
        priceSources: product.priceSources || {},
      };
    }

    res.json({
      ok: true,
      clientId,
      priceTypeId,
      priceTypeName: link.oneCPriceTypeName || "",
      defaultPricingMode: link.defaultPricingMode || "base",
      defaultMarkupPercent: link.defaultMarkupPercent ?? 0,
      catalogPricesVersion: String(
        getGlobalState("catalogPricesVersion", "") || ""
      ),
      items,
    });
  }
);

app.put(
  "/api/admin/clients/:clientId",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const parsed = managerClientUpdateSchema.parse({
        profile: req.body?.profile || {},
        addresses: Array.isArray(req.body?.addresses)
          ? req.body.addresses
          : [],
        managerNote: req.body?.managerNote || "",
      });
      const clientUser = findUserById(req.params.clientId);

      if (!clientUser || clientUser.role !== "client") {
        return res.status(404).json({
          error: "Клиент Clover не найден.",
        });
      }

      const emailOwner = findUserByEmail(parsed.profile.email);
      if (emailOwner && String(emailOwner.id) !== String(clientUser.id)) {
        return res.status(409).json({
          error: "Этот email уже используется другим аккаунтом.",
        });
      }

      const addresses = normalizeManagerClientAddresses(parsed.addresses);
      const profile = normalizeClientProfileContacts(
        parsed.profile,
        parsed.profile.email
      );
      const client = updateClientByManager({
        clientId: clientUser.id,
        profile,
        addresses,
        managerNote: parsed.managerNote,
      });

      // Логин в журнале доступов держим в актуальном состоянии при смене email.
      upsertClientAccessEntry(
        clientUser.id,
        {
          login: client.email || profile.email,
          companyName: client.companyName || profile.companyName,
          contactName: client.contactName || profile.contactName,
        },
        req.user
      );

      auditFromRequest(req, "client.profile.manager_update", {
        clientId: clientUser.id,
        changedEmail: normalizeEmail(clientUser.email) !== normalizeEmail(parsed.profile.email),
        addresses: addresses.length,
        managerNoteLength: parsed.managerNote.length,
        contacts: profile.contacts.length,
      });

      res.json({
        ok: true,
        client,
        oneCSync: false,
      });
    } catch (error) {
      next(error);
    }
  }
);

app.put(
  "/api/state/client-links",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const incomingLinks = req.body?.clientLinks || {};
    const storedLinks = getGlobalState("clientLinks", {});
    const clientLinks = mergeClientLinksPreservingOneCLinks(
      incomingLinks,
      storedLinks
    );
    // Полный снимок матрицы с UI: personalPrices заменяем целиком,
    // иначе нельзя сбросить «индивидуальный %» (merge оставлял старые ключи).
    for (const clientId of Object.keys(incomingLinks || {})) {
      const raw = incomingLinks[clientId];
      if (
        !raw ||
        typeof raw !== "object" ||
        !Object.prototype.hasOwnProperty.call(raw, "personalPrices")
      ) {
        continue;
      }
      const prices =
        raw.personalPrices &&
        typeof raw.personalPrices === "object" &&
        !Array.isArray(raw.personalPrices)
          ? raw.personalPrices
          : {};
      clientLinks[clientId] = {
        ...(clientLinks[clientId] || {}),
        personalPrices: { ...prices },
      };
    }
    setGlobalState("clientLinks", clientLinks);
    // Смена матрицы/вида цен/наценки — клиентский ЛК должен перечитать каталог.
    setGlobalState("catalogPricesVersion", new Date().toISOString());
    auditFromRequest(req, "client.matrix.save", {
      clients: Object.keys(clientLinks).length,
    });

    res.json({ ok: true, clientLinks });
  }
);

app.post(
  "/api/migrate/client",
  authRequired,
  roleRequired("client"),
  (req, res) => {
    const importedProfile = req.body?.profile || {};
    const currentState = getClientState(req.user.id);
    const profile = {
      ...currentState.profile,
      ...Object.fromEntries(
        Object.entries(importedProfile).filter(
          ([, value]) => String(value || "").trim()
        )
      ),
    };
    const addressesIncoming = Array.isArray(req.body?.addresses)
      ? req.body.addresses
      : [];
    const favorites = Array.isArray(req.body?.favorites)
      ? req.body.favorites
      : [];
    const orders = Array.isArray(req.body?.orders)
      ? req.body.orders
      : [];

    setClientStateField(req.user.id, "profile", {
      ...profile,
      email: profile.email || req.user.email,
    });
    // Не затираем серверные адреса пустым localStorage при migrate после смены пароля.
    const addresses =
      addressesIncoming.length > 0
        ? addressesIncoming
        : Array.isArray(currentState.addresses) && currentState.addresses.length
          ? currentState.addresses
          : addressesIncoming;
    setClientStateField(
      req.user.id,
      "addresses",
      addresses
    );
    setClientStateField(
      req.user.id,
      "favorites",
      favorites
    );

    const previousClientOrders = listOrders(req.user.id);
    // One-shot: если на сервере уже есть заказы клиента — не затираем их
    // устаревшим localStorage после повторного логина.
    if (previousClientOrders.length === 0 && orders.length) {
      const previousClientById = new Map(
        previousClientOrders.map((order) => [String(order.id), order])
      );
      replaceOrders({
        orders: orders.map((order) => {
          const mapped = {
            ...order,
            id: order.id || randomUUID(),
            clientId: req.user.id,
            customerName:
              profile.companyName ||
              profile.contactName ||
              order.customerName ||
              "Клиент",
            customerContact:
              profile.contactName ||
              order.customerContact ||
              "",
            customerPhone:
              profile.phone ||
              order.customerPhone ||
              "",
            customerEmail:
              profile.email ||
              req.user.email,
          };
          return sanitizeOrderExchangeForSave(
            mapped,
            previousClientById.get(String(mapped.id)),
            "client"
          );
        }),
        userId: req.user.id,
        managerMode: false,
      });
    } else if (previousClientOrders.length > 0 && orders.length) {
      auditFromRequest(req, "migrate.client.orders-skipped", {
        existing: previousClientOrders.length,
        incoming: orders.length,
      });
    }

    res.json({ ok: true });
  }
);

app.post(
  "/api/migrate/manager",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    if (
      Array.isArray(req.body?.products) &&
      req.body.products.length
    ) {
      const storedProducts = getGlobalState("products", DEFAULT_PRODUCTS);
      const products = mergeProductsPreservingOneCLinks(
        req.body.products.map(stripRuntimeProductPricing),
        storedProducts
      );
      setGlobalState("products", products);
    }

    if (req.body?.settings) {
      setGlobalState("settings", {
        ...getGlobalState("settings", DEFAULT_SETTINGS),
        ...req.body.settings,
      });
    }

    if (req.body?.clientLinks) {
      const storedLinks = getGlobalState("clientLinks", {});
      const clientLinks = mergeClientLinksPreservingOneCLinks(
        req.body.clientLinks,
        storedLinks
      );
      setGlobalState("clientLinks", clientLinks);
    }

    res.json({ ok: true });
  }
);


app.post(
  "/api/admin/products/:productId/image",
  authRequired,
  roleRequired("manager"),
  imageUpload.single("image"),
  (req, res) => {
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const productIndex = products.findIndex(
      (product) => String(product.id) === String(req.params.productId)
    );

    if (productIndex < 0) {
      if (req.file?.path && existsSync(req.file.path)) {
        unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: "Товар не найден." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Выберите изображение товара." });
    }

    removeUploadedImage(products[productIndex].imageUrl);

    const imageUrl = `/uploads/${req.file.filename}`;
    const updatedProduct = {
      ...products[productIndex],
      imageUrl,
      imageUpdatedAt: new Date().toISOString(),
    };
    const updatedProducts = products.map((product, index) =>
      index === productIndex ? updatedProduct : product
    );

    setGlobalState("products", updatedProducts);
    auditFromRequest(req, "product.image.upload", {
      productId: updatedProduct.id,
      productName: updatedProduct.name,
      imageUrl,
    });

    res.status(201).json({
      ok: true,
      imageUrl,
      product: updatedProduct,
    });
  }
);

app.delete(
  "/api/admin/products/:productId/image",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const productIndex = products.findIndex(
      (product) => String(product.id) === String(req.params.productId)
    );

    if (productIndex < 0) {
      return res.status(404).json({ error: "Товар не найден." });
    }

    removeUploadedImage(products[productIndex].imageUrl);

    const updatedProduct = {
      ...products[productIndex],
      imageUrl: "",
      imageUpdatedAt: new Date().toISOString(),
    };
    const updatedProducts = products.map((product, index) =>
      index === productIndex ? updatedProduct : product
    );

    setGlobalState("products", updatedProducts);
    auditFromRequest(req, "product.image.delete", {
      productId: updatedProduct.id,
      productName: updatedProduct.name,
    });

    res.json({ ok: true, product: updatedProduct });
  }
);

const certificateUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDirectory,
    filename(req, file, callback) {
      const extensionMap = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
      };
      const fromName = path.extname(String(file.originalname || "")).toLowerCase();
      const extension =
        extensionMap[file.mimetype] ||
        (fromName === ".pdf" ? ".pdf" : ".bin");
      callback(
        null,
        `product-cert-${String(req.params.productId || "item")}-${Date.now()}-${randomUUID()}${extension}`
      );
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowed.includes(file.mimetype)) {
      return callback(
        new Error("Разрешены PDF, JPG, PNG или WEBP.")
      );
    }
    callback(null, true);
  },
});

app.post(
  "/api/admin/products/:productId/certificate",
  authRequired,
  roleRequired("manager"),
  certificateUpload.single("certificate"),
  (req, res) => {
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const productIndex = products.findIndex(
      (product) => String(product.id) === String(req.params.productId)
    );

    if (productIndex < 0) {
      if (req.file?.path && existsSync(req.file.path)) {
        unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: "Товар не найден." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Выберите файл сертификата." });
    }

    removeUploadedImage(products[productIndex].certificateUrl);

    const certificateUrl = `/uploads/${req.file.filename}`;
    const certificateName = String(req.file.originalname || "certificate").slice(0, 180);
    const updatedProduct = {
      ...products[productIndex],
      certificateUrl,
      certificateName,
      certificateUpdatedAt: new Date().toISOString(),
    };
    const updatedProducts = products.map((product, index) =>
      index === productIndex ? updatedProduct : product
    );

    setGlobalState("products", updatedProducts);
    auditFromRequest(req, "product.certificate.upload", {
      productId: updatedProduct.id,
      productName: updatedProduct.name,
      certificateUrl,
    });

    res.status(201).json({
      ok: true,
      certificateUrl,
      product: updatedProduct,
    });
  }
);

app.delete(
  "/api/admin/products/:productId/certificate",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const productIndex = products.findIndex(
      (product) => String(product.id) === String(req.params.productId)
    );

    if (productIndex < 0) {
      return res.status(404).json({ error: "Товар не найден." });
    }

    removeUploadedImage(products[productIndex].certificateUrl);

    const updatedProduct = {
      ...products[productIndex],
      certificateUrl: "",
      certificateName: "",
      certificateUpdatedAt: new Date().toISOString(),
    };
    const updatedProducts = products.map((product, index) =>
      index === productIndex ? updatedProduct : product
    );

    setGlobalState("products", updatedProducts);
    auditFromRequest(req, "product.certificate.delete", {
      productId: updatedProduct.id,
      productName: updatedProduct.name,
    });

    res.json({ ok: true, product: updatedProduct });
  }
);

app.get(
  "/api/admin/backups",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    res.json({ backups: listServerBackups() });
  }
);

app.post(
  "/api/admin/backups",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const backup = createServerBackup({
      label: req.body?.label || "manual",
      reason: req.body?.reason || "Ручная резервная копия",
    });
    auditFromRequest(req, "backup.create", backup);
    res.status(201).json({ ok: true, backup });
  }
);

app.post(
  "/api/admin/backups/cleanup",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const result = cleanupOldBackups({
      maxFiles: Number(req.body?.maxFiles) || 50,
      automaticMaxAgeDays:
        Number(req.body?.automaticMaxAgeDays) || 30,
    });
    auditFromRequest(req, "backup.cleanup", result);
    res.json({ ok: true, ...result });
  }
);

app.get(
  "/api/admin/backups/:fileName/download",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const filePath = resolveBackupPath(req.params.fileName);
      res.download(filePath, path.basename(filePath));
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/admin/backups/:fileName/restore",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      createServerBackup({
        label: "before-restore",
        reason: "Автоматическая копия перед восстановлением",
      });
      const snapshot = restoreServerBackup(req.params.fileName);
      writeAudit({
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: "backup.restore",
        details: {
          fileName: req.params.fileName,
          restoredAt: new Date().toISOString(),
          restoredPhotos: snapshot.restoredPhotos || 0,
          legacy: Boolean(snapshot.legacy),
        },
      });
      res.json({
        ok: true,
        restoredAt: snapshot.exportedAt,
        restoredPhotos: snapshot.restoredPhotos || 0,
        legacy: Boolean(snapshot.legacy),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/admin/one-c/config",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const stored = getGlobalState(ONE_C_STATE_KEY, DEFAULT_ONE_C_CONFIG);
    res.json({
      ok: true,
      ...publicOneCStatus(stored),
      exchangeContour: publicOneCExchangeStatus(),
    });
  }
);

app.put(
  "/api/admin/one-c/config",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const config = sanitizeOneCConfig(req.body?.config || req.body || {});
      setGlobalState(ONE_C_STATE_KEY, config);
      auditFromRequest(req, "exchange.config.save", {
        mode: config.mode,
        baseUrlConfigured: Boolean(config.baseUrl),
        allowDraftCreation: config.allowDraftCreation,
      });
      res.json({ ok: true, ...publicOneCStatus(config) });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/admin/one-c/test",
  authRequired,
  roleRequired("manager"),
  async (req, res) => {
    const config = getGlobalState(ONE_C_STATE_KEY, DEFAULT_ONE_C_CONFIG);
    try {
      const result = await testOneCConnection(config);
      auditFromRequest(req, "exchange.connection.test", {
        ok: true,
        mode: result.mode,
        configuration: result.configuration,
        database: result.database,
      });
      res.json({ ok: true, result, ...publicOneCStatus(config) });
    } catch (error) {
      auditFromRequest(req, "exchange.connection.error", {
        ok: false,
        message: error.message,
      });
      res.status(error?.status >= 400 && error?.status < 600 ? 502 : 400).json({
        error: error.message,
      });
    }
  }
);
app.post("/api/one-c/products-preview", async (req, res, next) => {
  try {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const receivedAt = new Date().toISOString();
    // Allowlist (TEST / VLAVKA при prod). Каталог принимаем из любой разрешённой базы.
    const sourceDatabase = requireOneCAllowedDatabase(req, res);
    if (!sourceDatabase) return;
    const allOneCProducts = normalizeOneCProducts(req.body?.items).map((item) => ({
      ...item,
      purchasePriceUpdatedAt:
        item.purchasePriceUpdatedAt || (hasPurchasePrice(item) ? receivedAt : ""),
      purchasePriceReceivedAt: hasPurchasePrice(item) ? receivedAt : "",
      purchasePriceSourceDatabase: hasPurchasePrice(item) ? sourceDatabase : "",
    }));
    const currentProducts = getGlobalState("products", DEFAULT_PRODUCTS);
    const candidateMap = buildOneCProductCandidates(
      currentProducts,
      allOneCProducts
    );
    // Кандидаты для подсказок — по-прежнему «релевантные»;
    // для поиска менеджера храним полную выгрузку разрешённой базы.
    const relevantOneCProducts = selectRelevantOneCProducts(
      currentProducts,
      allOneCProducts,
      candidateMap
    );

    const retainedIds = new Set(relevantOneCProducts.map((item) => item.id));
    const preliminaryCandidateMap = Object.fromEntries(
      Object.entries(candidateMap).map(([productId, items]) => [
        productId,
        (Array.isArray(items) ? items : [])
          .filter((item) => retainedIds.has(item.id))
          .map(({ score, reason, ...item }) => ({ item, score, reason })),
      ])
    );

    const previewDirectory = path.resolve(
      serverDirectory,
      "data",
      "one-c-preview"
    );
    mkdirSync(previewDirectory, { recursive: true });

    const filePath = path.resolve(
      previewDirectory,
      "products-preview.json"
    );
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          receivedAt,
          database: sourceDatabase,
          data: {
            sourceCount: allOneCProducts.length,
            retainedCount: allOneCProducts.length,
            relevantCount: relevantOneCProducts.length,
            candidateProducts: Object.values(preliminaryCandidateMap).filter(
              (items) => Array.isArray(items) && items.length
            ).length,
            mode: "full-catalog-for-search",
            items: allOneCProducts,
          },
        },
        null,
        2
      ),
      "utf8"
    );

    const linked = autoLinkCloverProducts(
      currentProducts,
      allOneCProducts,
      receivedAt
    );
    const reclassified = applyInferredCategories(linked.products);

    const unmatchedProductIds = new Set(
      reclassified.products
        .filter((product) => !String(product.oneCId || "").trim())
        .map((product) => String(product.id))
    );
    const cleanCandidateMap = Object.fromEntries(
      Object.entries(preliminaryCandidateMap).filter(
        ([productId, items]) => unmatchedProductIds.has(String(productId)) && Array.isArray(items) && items.length
      )
    );

    const previousOneCProducts = getGlobalState("oneCProducts", []);
    setGlobalState(
      "oneCProducts",
      preserveOneCProductPricingFields(previousOneCProducts, linked.oneCProducts)
    );
    setGlobalState("oneCProductCandidates", cleanCandidateMap);
    if (linked.changed || reclassified.changed) {
      setGlobalState("products", reclassified.products);
    }

    const meta = {
      receivedAt,
      sourceDatabase,
      lastAutoLinkAt: receivedAt,
      lastReport: linked.report,
      candidateMap: cleanCandidateMap,
    };
    setGlobalState("oneCProductsMeta", meta);

    writeAudit({
      action: "one-c.products.receive",
      details: {
        database: sourceDatabase,
        scanned: allOneCProducts.length,
        received: linked.oneCProducts.length,
        relevant: relevantOneCProducts.length,
        candidateProducts: Object.values(cleanCandidateMap).filter(
          (items) => Array.isArray(items) && items.length
        ).length,
        autoLinked: linked.report.autoLinked,
        newlyLinked: linked.report.newlyLinked,
        ambiguous: linked.report.ambiguous,
        unmatched: linked.report.unmatched,
        mode: "full-catalog-for-search",
      },
    });

    res.json({
      ok: true,
      database: sourceDatabase,
      scanned: allOneCProducts.length,
      received: linked.oneCProducts.length,
      relevant: relevantOneCProducts.length,
      candidateProducts: Object.values(cleanCandidateMap).filter(
        (items) => Array.isArray(items) && items.length
      ).length,
      mode: "full-catalog-for-search",
      autoLink: linked.report,
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/admin/one-c/products",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const items = normalizeOneCProducts(
      getGlobalState("oneCProducts", [])
    );
    const meta = getGlobalState("oneCProductsMeta", {});
    const search = String(req.query.search || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    const limit = Math.min(
      200,
      Math.max(1, Number(req.query.limit) || 50)
    );
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const linksByOneCId = new Map();
    products.forEach((product) => {
      const oneCId = String(product.oneCId || "").trim();
      if (!oneCId) return;
      linksByOneCId.set(oneCId, {
        productId: product.id,
        productName: product.name,
        linkMode: product.oneCLinkMode || "manual",
      });
    });

    const found = searchOneCProductsIndexed(items, { search, limit, offset });

    res.json({
      items: found.items.map((item) => ({
        ...item,
        cloverLink: linksByOneCId.get(String(item.id)) || null,
      })),
      total: found.total,
      offset,
      limit,
      summary: buildOneCProductsSummary(products, items, meta),
    });
  }
);

app.post(
  "/api/admin/one-c/products/from-catalog",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const products = getGlobalState("products", DEFAULT_PRODUCTS);
      const oneCProducts = normalizeOneCProducts(getGlobalState("oneCProducts", []));
      const requestedId = String(req.body?.oneCId || req.body?.id || "").trim();
      const item =
        oneCProducts.find((entry) => entry.id === requestedId) ||
        normalizeOneCProduct(req.body?.item || req.body || {});
      const linkedAt = new Date().toISOString();
      const result = createOrReuseCloverProductFromOneC(products, item, linkedAt);
      const reclassified = applyInferredCategories(result.products);
      const nextProducts = reclassified.products;
      const product =
        nextProducts.find((entry) => String(entry.id) === String(result.product.id)) ||
        result.product;
      setGlobalState("products", nextProducts);

      let clientLink = null;
      let clientLinks = getGlobalState("clientLinks", {});
      const clientId = String(req.body?.clientId || "").trim();
      if (clientId) {
        const clients = listClients();
        const client = clients.find((entry) => String(entry.id) === clientId);
        if (!client) {
          return res.status(404).json({ error: "Клиент Clover не найден." });
        }
        const matrixUpdate = addProductIdToClientMatrix(
          clientLinks,
          clientId,
          product.id
        );
        clientLinks = matrixUpdate.clientLinks;
        clientLink = normalizeClientLink(matrixUpdate.clientLink);
        setGlobalState("clientLinks", clientLinks);
      }

      auditFromRequest(req, "one-c.product.from-catalog", {
        productId: product.id,
        productName: product.name,
        productCategory: product.category,
        oneCId: item.id,
        oneCName: item.name,
        created: result.created,
        categoriesReclassified: reclassified.changed,
        clientId: clientId || null,
      });

      res.json({
        ok: true,
        created: result.created,
        product,
        products: nextProducts,
        clientId: clientId || null,
        clientLink,
        clientLinks: clientId ? clientLinks : undefined,
        message: result.created
          ? "Товар создан в Clover и связан с 1С."
          : "Товар уже был в Clover — использована существующая связь.",
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/admin/one-c/products/match-import",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ error: "Передайте rows: [{ name, code? }]." });
    }
    if (rows.length > 2000) {
      return res.status(400).json({ error: "Слишком много строк (макс. 2000)." });
    }

    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const oneCProducts = normalizeOneCProducts(getGlobalState("oneCProducts", []));
    const linksByOneCId = new Map();
    products.forEach((product) => {
      const oneCId = String(product.oneCId || "").trim();
      if (!oneCId) return;
      linksByOneCId.set(oneCId, {
        productId: product.id,
        productName: product.name,
        linkMode: product.oneCLinkMode || "manual",
      });
    });

    const catalog = oneCProducts.map((item) => ({
      ...item,
      cloverLink: linksByOneCId.get(item.id) || null,
    }));

    const matched = matchOneCImportRows(rows, catalog);
    const summary = {
      total: matched.length,
      exact: matched.filter((row) => row.status === "exact").length,
      code: matched.filter((row) => row.status === "code").length,
      fuzzy: matched.filter((row) => row.status === "fuzzy").length,
      miss: matched.filter((row) => row.status === "miss" || row.status === "empty").length,
    };

    auditFromRequest(req, "one-c.product.match-import", {
      total: summary.total,
      exact: summary.exact,
      fuzzy: summary.fuzzy,
      miss: summary.miss,
    });

    res.json({ ok: true, rows: matched, summary });
  }
);

app.get(
  "/api/admin/one-c/products/:productId/candidates",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const product = products.find(
      (item) => String(item.id) === String(req.params.productId)
    );
    if (!product) return res.status(404).json({ error: "Товар Clover не найден." });

    const candidateMap = getGlobalState("oneCProductCandidates", {});
    const items = Array.isArray(candidateMap[String(product.id)])
      ? candidateMap[String(product.id)]
      : [];
    const linksByOneCId = new Map(
      products
        .filter((item) => String(item.oneCId || "").trim())
        .map((item) => [String(item.oneCId), {
          productId: item.id,
          productName: item.name,
          linkMode: item.oneCLinkMode || "manual",
        }])
    );

    res.json({
      product: {
        id: product.id,
        name: product.name,
        query: product.oneCSearchQuery || product.oneCMatchName || product.name,
      },
      items: items.map((entry) => ({
        ...(entry.item || entry),
        score: Number(entry.score) || 0,
        reason: entry.reason || "similar",
        cloverLink: linksByOneCId.get(String((entry.item || entry).id)) || null,
      })),
      total: items.length,
    });
  }
);

app.post(
  "/api/admin/one-c/products/:productId/request",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const productIndex = products.findIndex(
      (item) => String(item.id) === String(req.params.productId)
    );
    if (productIndex < 0) return res.status(404).json({ error: "Товар Clover не найден." });

    const requestedAt = new Date().toISOString();
    const query = String(req.body?.query || products[productIndex].name || "").trim();
    const oneCMatchCode = String(req.body?.code || products[productIndex].oneCMatchCode || "").trim();
    const oneCMatchName = String(req.body?.name || products[productIndex].oneCMatchName || "").trim();
    if (!query && !oneCMatchCode && !oneCMatchName) {
      return res.status(400).json({ error: "Укажите название или код для поиска в 1С." });
    }

    const updatedProduct = {
      ...products[productIndex],
      oneCSearchQuery: query,
      oneCSearchRequestedAt: requestedAt,
      oneCMatchCode,
      oneCMatchName,
    };
    const updatedProducts = products.map((item, index) =>
      index === productIndex ? updatedProduct : item
    );
    setGlobalState("products", updatedProducts);
    auditFromRequest(req, "one-c.product.request", {
      productId: updatedProduct.id,
      productName: updatedProduct.name,
      query,
      code: oneCMatchCode,
    });

    res.json({
      ok: true,
      product: updatedProduct,
      message: "Запрос сохранён. После следующей выгрузки из 1С Clover оставит только подходящие варианты.",
    });
  }
);

app.post(
  "/api/admin/one-c/products/:productId/link",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const products = getGlobalState("products", DEFAULT_PRODUCTS);
      const oneCProducts = normalizeOneCProducts(getGlobalState("oneCProducts", []));
      const requestedId = String(req.body?.oneCId || req.body?.id || "").trim();
      const item = oneCProducts.find((entry) => entry.id === requestedId) ||
        normalizeOneCProduct(req.body?.item || req.body || {});
      const linkedAt = new Date().toISOString();
      const updatedProducts = linkCloverProduct(
        products,
        req.params.productId,
        item,
        linkedAt
      );
      setGlobalState("products", updatedProducts);

      const candidateMap = getGlobalState("oneCProductCandidates", {});
      if (candidateMap[String(req.params.productId)]) {
        const nextCandidateMap = { ...candidateMap };
        delete nextCandidateMap[String(req.params.productId)];
        setGlobalState("oneCProductCandidates", nextCandidateMap);
        const meta = getGlobalState("oneCProductsMeta", {});
        setGlobalState("oneCProductsMeta", { ...meta, candidateMap: nextCandidateMap });
      }

      const product = updatedProducts.find(
        (entry) => String(entry.id) === String(req.params.productId)
      );
      auditFromRequest(req, "one-c.product.link", {
        productId: product?.id,
        productName: product?.name,
        oneCId: item.id,
        oneCName: item.name,
      });
      res.json({ ok: true, product, products: updatedProducts });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/admin/one-c/products/auto-link",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const currentProducts = getGlobalState("products", DEFAULT_PRODUCTS);
    const oneCProducts = getGlobalState("oneCProducts", []);
    const linkedAt = new Date().toISOString();
    const linked = autoLinkCloverProducts(
      currentProducts,
      oneCProducts,
      linkedAt
    );

    if (linked.changed) {
      setGlobalState("products", linked.products);
    }

    const previousMeta = getGlobalState("oneCProductsMeta", {});
    const meta = {
      ...previousMeta,
      lastAutoLinkAt: linkedAt,
      lastReport: linked.report,
    };
    setGlobalState("oneCProductsMeta", meta);

    auditFromRequest(req, "one-c.products.auto-link", linked.report);

    res.json({
      ok: true,
      products: linked.products,
      report: linked.report,
      summary: buildOneCProductsSummary(
        linked.products,
        linked.oneCProducts,
        meta
      ),
    });
  }
);

app.post("/api/one-c/clients-preview", async (req, res, next) => {
  try {
    const sourceDatabase = requireOneCAllowedDatabase(req, res);
    if (!sourceDatabase) return;
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const receivedAt = new Date().toISOString();
    const allOneCClients = normalizeOneCClients(req.body?.items);
    const clients = listClients();
    const currentLinks = getGlobalState("clientLinks", {});
    const candidateMap = buildOneCClientCandidates(
      clients,
      currentLinks,
      allOneCClients
    );
    // Кандидаты для подсказок — выборочно; для поиска менеджера — полный список.
    const relevantOneCClients = selectRelevantOneCClients(
      clients,
      currentLinks,
      allOneCClients,
      candidateMap
    );
    const retainedIds = new Set(relevantOneCClients.map((item) => item.id));
    const cleanCandidateMap = Object.fromEntries(
      Object.entries(candidateMap).map(([clientId, items]) => [
        clientId,
        (Array.isArray(items) ? items : [])
          .filter((item) => retainedIds.has(item.id))
          .map(({ score, reason, ...item }) => ({ item, score, reason })),
      ])
    );

    const linked = autoLinkCloverClients(
      clients,
      currentLinks,
      allOneCClients,
      receivedAt
    );
    setGlobalState("oneCClients", linked.oneCClients);
    setGlobalState("oneCClientCandidates", cleanCandidateMap);
    if (linked.changed) setGlobalState("clientLinks", linked.clientLinks);

    // Справочник видов цен — из выгрузки контрагентов (поля договора).
    const harvestedTypes = allOneCClients
      .filter((item) => item.priceTypeId)
      .map((item) => ({
        id: item.priceTypeId,
        code: item.priceTypeCode || "",
        name: item.priceTypeName || item.priceTypeCode || item.priceTypeId,
      }));
    if (harvestedTypes.length) {
      const union = normalizeOneCPriceTypes([
        ...normalizeOneCPriceTypes(getGlobalState("oneCPriceTypes", [])),
        ...harvestedTypes,
      ]);
      setGlobalState("oneCPriceTypes", union);
      setGlobalState("oneCPriceTypesMeta", {
        updatedAt: receivedAt,
        source: "clients-preview",
        accepted: union.length,
      });
    }

    const meta = {
      receivedAt,
      sourceDatabase,
      lastAutoLinkAt: receivedAt,
      lastReport: linked.report,
      candidateMap: cleanCandidateMap,
    };
    setGlobalState("oneCClientsMeta", meta);

    const previewDirectory = path.resolve(serverDirectory, "data", "one-c-preview");
    mkdirSync(previewDirectory, { recursive: true });
    writeFileSync(
      path.resolve(previewDirectory, "clients-preview.json"),
      JSON.stringify({
        receivedAt,
        database: sourceDatabase,
        data: {
          sourceCount: allOneCClients.length,
          retainedCount: allOneCClients.length,
          relevantCount: relevantOneCClients.length,
          mode: "full-catalog-for-search",
          items: allOneCClients,
        },
      }, null, 2),
      "utf8"
    );

    writeAudit({
      action: "one-c.clients.receive",
      details: {
        database: sourceDatabase,
        scanned: allOneCClients.length,
        received: linked.oneCClients.length,
        relevant: relevantOneCClients.length,
        autoLinked: linked.report.autoLinked,
        candidateClients: Object.values(cleanCandidateMap).filter(
          (items) => Array.isArray(items) && items.length
        ).length,
        mode: "full-catalog-for-search",
      },
    });

    res.json({
      ok: true,
      database: sourceDatabase,
      scanned: allOneCClients.length,
      received: linked.oneCClients.length,
      relevant: relevantOneCClients.length,
      mode: "full-catalog-for-search",
      autoLink: linked.report,
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/admin/one-c/clients",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const clients = listClients();
    const clientLinks = getGlobalState("clientLinks", {});
    const items = normalizeOneCClients(getGlobalState("oneCClients", []));
    const meta = getGlobalState("oneCClientsMeta", {});
    const search = String(req.query.search || "").trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const linksByOneCId = new Map(
      Object.entries(clientLinks)
        .filter(([, link]) => String(link?.oneCId || "").trim())
        .map(([clientId, link]) => [String(link.oneCId), {
          clientId,
          clientName: clients.find((client) => String(client.id) === String(clientId))?.companyName || "",
          linkMode: link.oneCLinkMode || "manual",
        }])
    );
    const filtered = search
      ? items.filter((item) => matchesTextSearch(
          `${item.name} ${item.code} ${item.id} ${item.inn} ${item.phone} ${item.email}`,
          search
        ))
      : items;

    res.json({
      items: filtered.slice(offset, offset + limit).map((item) => ({
        ...item,
        cloverLink: linksByOneCId.get(item.id) || null,
      })),
      total: filtered.length,
      offset,
      limit,
      summary: buildOneCClientsSummary(clients, clientLinks, items, meta),
    });
  }
);

app.get(
  "/api/admin/one-c/clients/:clientId/candidates",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const clients = listClients();
    const client = clients.find((item) => String(item.id) === String(req.params.clientId));
    if (!client) return res.status(404).json({ error: "Клиент Clover не найден." });
    const candidateMap = getGlobalState("oneCClientCandidates", {});
    const items = Array.isArray(candidateMap[String(client.id)])
      ? candidateMap[String(client.id)]
      : [];
    const clientLinks = getGlobalState("clientLinks", {});
    const linksByOneCId = new Map(
      Object.entries(clientLinks)
        .filter(([, link]) => String(link?.oneCId || "").trim())
        .map(([clientId, link]) => [String(link.oneCId), {
          clientId,
          clientName: clients.find((item) => String(item.id) === String(clientId))?.companyName || "",
          linkMode: link.oneCLinkMode || "manual",
        }])
    );
    res.json({
      client,
      items: items.map((entry) => ({
        ...(entry.item || entry),
        score: Number(entry.score) || 0,
        reason: entry.reason || "similar",
        cloverLink: linksByOneCId.get(String((entry.item || entry).id)) || null,
      })),
      total: items.length,
    });
  }
);

app.post(
  "/api/admin/one-c/clients/:clientId/link",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const links = getGlobalState("clientLinks", {});
      const oneCClients = normalizeOneCClients(getGlobalState("oneCClients", []));
      const requestedId = String(req.body?.oneCId || req.body?.id || "").trim();
      const item = oneCClients.find((entry) => entry.id === requestedId) ||
        normalizeOneCClient(req.body?.item || req.body || {});
      const updatedLinks = linkCloverClient(
        links,
        req.params.clientId,
        item,
        new Date().toISOString()
      );
      setGlobalState("clientLinks", updatedLinks);

      const candidateMap = getGlobalState("oneCClientCandidates", {});
      if (candidateMap[String(req.params.clientId)]) {
        const nextCandidateMap = { ...candidateMap };
        delete nextCandidateMap[String(req.params.clientId)];
        setGlobalState("oneCClientCandidates", nextCandidateMap);
        const meta = getGlobalState("oneCClientsMeta", {});
        setGlobalState("oneCClientsMeta", { ...meta, candidateMap: nextCandidateMap });
      }

      auditFromRequest(req, "one-c.client.link", {
        clientId: req.params.clientId,
        oneCId: item.id,
        oneCName: item.name,
      });
      res.json({ ok: true, clientLink: updatedLinks[req.params.clientId], clientLinks: updatedLinks });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/admin/one-c/clients/auto-link",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const clients = listClients();
    const links = getGlobalState("clientLinks", {});
    const oneCClients = getGlobalState("oneCClients", []);
    const linkedAt = new Date().toISOString();
    const linked = autoLinkCloverClients(clients, links, oneCClients, linkedAt);
    if (linked.changed) setGlobalState("clientLinks", linked.clientLinks);
    const previousMeta = getGlobalState("oneCClientsMeta", {});
    const meta = { ...previousMeta, lastAutoLinkAt: linkedAt, lastReport: linked.report };
    setGlobalState("oneCClientsMeta", meta);
    auditFromRequest(req, "one-c.clients.auto-link", linked.report);
    res.json({
      ok: true,
      clientLinks: linked.clientLinks,
      report: linked.report,
      summary: buildOneCClientsSummary(clients, linked.clientLinks, linked.oneCClients, meta),
    });
  }
);

app.get(
  "/api/admin/one-c/preview/:type",
  authRequired,
  roleRequired("manager"),
  async (req, res) => {
    const type = req.params.type === "clients" ? "clients" : req.params.type === "products" ? "products" : "";
    if (!type) {
      return res.status(400).json({ error: "Неизвестный справочник 1С." });
    }

    const config = getGlobalState(ONE_C_STATE_KEY, DEFAULT_ONE_C_CONFIG);
    try {
      const result = await previewOneCCatalog(config, type, req.query.limit || 20);
      auditFromRequest(req, "exchange.catalog.preview", {
        type,
        mode: result.mode,
        count: result.count,
      });
      res.json(result);
    } catch (error) {
      auditFromRequest(req, "exchange.catalog.error", {
        type,
        message: error.message,
      });
      res.status(error?.status >= 400 && error?.status < 600 ? 502 : 400).json({
        error: error.message,
      });
    }
  }
);

app.post(
  "/api/admin/one-c/orders/:orderId/draft",
  authRequired,
  roleRequired("manager"),
  async (req, res) => {
    const stored = getOrderById(req.params.orderId);
    if (!stored) return res.status(404).json({ error: "Заказ не найден." });

    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const clientLinks = getGlobalState("clientLinks", {});
    const validation = validateOrderFor1C({
      order: stored.payload,
      products,
      clientLinks,
    });

    if (!validation.ready) {
      return res.status(422).json({
        error: validation.issues.join(" "),
        validation,
      });
    }

    const config = getGlobalState(ONE_C_STATE_KEY, DEFAULT_ONE_C_CONFIG);
    const payload = build1CPayload({
      order: stored.payload,
      products,
      clientLinks,
    });

    try {
      const result = await createOneCDraft(config, {
        ...payload,
        testMode: publicOneCStatus(config).config.mode !== "real",
        target: {
          configuration: "Управление нашей фирмой 1.6",
          document: "ЗаказПокупателя",
          tabularSection: "Запасы",
          conduct: false,
        },
      });
      const previous = normalizeExchangeState(stored.payload.exchange);
      const attemptedAt = new Date().toISOString();
      const remoteDocument = {
        id: result.documentId || "",
        number: result.documentNumber || "",
        date: result.documentDate || "",
        posted: Boolean(result.posted),
        duplicate: Boolean(result.duplicate),
        mode: result.mode,
      };
      const exchange = {
        ...previous,
        status: "draft",
        attempts: previous.attempts + 1,
        checkedAt: attemptedAt,
        lastAttemptAt: attemptedAt,
        sentAt: attemptedAt,
        receipt: result.documentNumber || result.documentId || "",
        remoteDocument,
        channel: result.mode === "real" ? "onec" : "simulation",
        message: result.message,
      };
      const order = updateOrderPayload(stored.id, {
        ...stored.payload,
        exchange,
        updatedAt: attemptedAt,
      });

      auditFromRequest(req, "exchange.send.draft", {
        orderId: order.id,
        orderNumber: order.number,
        mode: result.mode,
        documentId: result.documentId,
        documentNumber: result.documentNumber,
        duplicate: result.duplicate,
      });

      res.json({
        ok: true,
        result,
        order,
        exchange,
        validation,
      });
    } catch (error) {
      const previous = normalizeExchangeState(stored.payload.exchange);
      const attemptedAt = new Date().toISOString();
      const exchange = {
        ...previous,
        status: "error",
        attempts: previous.attempts + 1,
        checkedAt: attemptedAt,
        lastAttemptAt: attemptedAt,
        channel: "onec",
        message: error.message,
      };
      const order = updateOrderPayload(stored.id, {
        ...stored.payload,
        exchange,
        updatedAt: attemptedAt,
      });
      auditFromRequest(req, "exchange.send.draft.error", {
        orderId: order.id,
        orderNumber: order.number,
        message: error.message,
      });
      res.status(error?.status >= 400 && error?.status < 600 ? 502 : 400).json({
        error: error.message,
        order,
        exchange,
      });
    }
  }
);

app.get(
  "/api/admin/exchange",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const orders = listOrders();
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const clientLinks = getGlobalState("clientLinks", {});
    const overview = summarizeExchange(orders, products, clientLinks);
    const usedClientIds = new Set(
      orders.map((order) => String(order.clientId || "")).filter(Boolean)
    );
    const usedProductIds = new Set(
      orders.flatMap((order) =>
        (order.items || []).map((item) =>
          String(item.productId ?? item.id ?? "")
        )
      ).filter(Boolean)
    );
    const matchingClients = listClients()
      .filter((client) => {
        if (!usedClientIds.has(String(client.id))) return false;
        const link = clientLinks?.[client.id] || {};
        return !link.matched1C || !String(link.oneCId || "").trim();
      })
      .map((client) => ({
        id: client.id,
        companyName: client.companyName,
        contactName: client.contactName,
        phone: client.phone,
        email: client.email,
      }));
    const matchingProducts = (products || [])
      .filter((product) =>
        usedProductIds.has(String(product.id)) &&
        !String(product.oneCId || "").trim()
      )
      .map((product) => ({
        id: product.id,
        code: product.code || "",
        name: product.name || "",
      }));

    res.json({
      ...overview,
      matching: {
        clients: matchingClients,
        products: matchingProducts,
      },
      log: listExchangeAudit(req.query.limit || 300),
      testMode: !isProdExchangeEnabled(),
      exchangeContour: publicOneCExchangeStatus(),
      oneC: publicOneCStatus(
        getGlobalState(ONE_C_STATE_KEY, DEFAULT_ONE_C_CONFIG)
      ),
    });
  }
);

app.post(
  "/api/admin/exchange/orders/:orderId/check",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const stored = getOrderById(req.params.orderId);
    if (!stored) return res.status(404).json({ error: "Заказ не найден." });

    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const clientLinks = getGlobalState("clientLinks", {});
    const validation = validateOrderFor1C({
      order: stored.payload,
      products,
      clientLinks,
    });
    const previous = normalizeExchangeState(stored.payload.exchange);
    const checkedAt = new Date().toISOString();
    const exchange = {
      ...previous,
      // Проверка не ставит заказ в очередь. Передача выполняется отдельной кнопкой.
      status: validation.ready
        ? (["sent", "draft", "ready", "sending"].includes(previous.status)
          ? previous.status
          : "not_sent")
        : "error",
      checkedAt,
      message: validation.ready
        ? "Проверка пройдена. Нажмите «Передать в 1С»."
        : validation.issues.join(" "),
    };
    const order = updateOrderPayload(stored.id, {
      ...stored.payload,
      exchange,
      updatedAt: new Date().toISOString(),
    });

    auditFromRequest(req, "exchange.check", {
      orderId: order.id,
      orderNumber: order.number,
      ready: validation.ready,
      issues: validation.issues,
    });

    res.json({ ok: true, order, validation, exchange });
  }
);

app.post(
  "/api/admin/exchange/orders/:orderId/send",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const stored = getOrderById(req.params.orderId);
    if (!stored) return res.status(404).json({ error: "Заказ не найден." });

    if (!canReturnOrderToOneCQueue(stored.payload)) {
      return res.status(409).json({
        error:
          "Заказ уже подтверждён уникальным документом 1С. Повторная постановка в очередь заблокирована для защиты от дубля.",
      });
    }

    const target = resolveManagerExchangeDatabase(req);
    if (!target.ok) {
      return res.status(403).json({ error: target.error });
    }
    const targetDatabase = target.database;
    const contour = exchangeDatabaseLabel(targetDatabase);

    const previous = normalizeExchangeState(stored.payload.exchange);
    if (previous.status === "sending" && !isOneCClaimExpired(previous)) {
      return res.status(409).json({
        error:
          `Заказ уже выдан ${exchangeDatabaseLabel(previous.database || targetDatabase)} и ожидает ACK. Нельзя снова поставить в очередь, пока идёт передача. Дождитесь подтверждения 1С.`,
      });
    }

    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const clientLinks = getGlobalState("clientLinks", {});
    const validation = validateOrderFor1C({
      order: stored.payload,
      products,
      clientLinks,
    });
    const attemptedAt = new Date().toISOString();
    const exchange = {
      ...previous,
      // Заказ считается переданным только после подтверждения от 1С (ACK).
      // До ACK: ready в очереди; после pull: sending (claim), повторный pull не выдаёт тот же заказ.
      status: validation.ready ? "ready" : "error",
      database: validation.ready ? targetDatabase : previous.database || targetDatabase,
      attempts: previous.attempts + 1,
      checkedAt: attemptedAt,
      lastAttemptAt: attemptedAt,
      sentAt: validation.ready ? "" : previous.sentAt,
      receipt: validation.ready ? "" : previous.receipt,
      remoteDocument: validation.ready ? null : previous.remoteDocument,
      channel: validation.ready ? "onec-pull" : previous.channel,
      message: validation.ready
        ? isTestDatabase(targetDatabase)
          ? `Заказ поставлен в очередь ${contour}. В 1С TEST нажмите «Получить тестовый заказ из Clover».`
          : `Заказ поставлен в очередь ${contour}. В рабочей 1С нажмите получение заказа из Clover.`
        : validation.issues.join(" "),
    };
    const order = updateOrderPayload(stored.id, {
      ...stored.payload,
      exchange,
      updatedAt: attemptedAt,
    });

    let notificationsCleared = { changed: 0, readAt: "" };
    if (validation.ready) {
      // Очередь уведомлений в ЛК менеджера: new_order и связанные по этому заказу.
      notificationsCleared = markManagerNotificationsReadForOrder(order.id);
    }

    auditFromRequest(req, validation.ready
      ? (isTestDatabase(targetDatabase) ? "exchange.send.test" : "exchange.send.prod")
      : "exchange.send.error", {
      orderId: order.id,
      orderNumber: order.number,
      queued: validation.ready,
      database: targetDatabase,
      issues: validation.issues,
      attempts: exchange.attempts,
      notificationsCleared: notificationsCleared.changed,
    });

    res.status(validation.ready ? 200 : 422).json({
      ok: validation.ready,
      error: validation.ready ? undefined : validation.issues.join(" "),
      order,
      validation,
      exchange,
      database: targetDatabase,
      testMode: isTestDatabase(targetDatabase),
      queued: validation.ready,
      notificationsCleared: notificationsCleared.changed,
      managerNotifications: listManagerNotifications({ limit: 100 }),
    });
  }
);

app.post(
  "/api/admin/exchange/orders/:orderId/reset",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const stored = getOrderById(req.params.orderId);
    if (!stored) return res.status(404).json({ error: "Заказ не найден." });

    const previous = normalizeExchangeState(stored.payload.exchange);

    // После ACK / документа 1С отозвать нельзя.
    if (previous.status === "sent") {
      return res.status(409).json({
        error:
          "Заказ уже принят в 1С (есть подтверждение документа). Отменить передачу нельзя.",
        code: "ONEC_SENT_LOCKED",
      });
    }
    if (
      previous.status === "draft" &&
      (String(previous.receipt || "").trim() ||
        String(previous.remoteDocument?.id || previous.remoteDocument?.number || "").trim())
    ) {
      return res.status(409).json({
        error:
          "У заказа уже есть черновик в 1С. Отменить передачу нельзя.",
        code: "ONEC_DRAFT_LOCKED",
      });
    }

    if (
      previous.status !== "ready" &&
      previous.status !== "sending" &&
      previous.status !== "error"
    ) {
      return res.status(409).json({
        error:
          "Сброс доступен для заказов в очереди, с ошибкой или ожидающих ACK (до принятия в 1С).",
        code: "ONEC_RESET_NOT_ALLOWED",
      });
    }

    const exchange = {
      ...previous,
      status: "not_sent",
      checkedAt: "",
      lastAttemptAt: "",
      sentAt: "",
      claimedAt: "",
      claimedBy: "",
      receipt: "",
      remoteDocument: null,
      channel: "",
      message:
        previous.status === "error"
          ? "Статус передачи сброшен менеджером."
          : "Передача в 1С отменена менеджером. Можно передать снова.",
    };
    const order = updateOrderPayload(stored.id, {
      ...stored.payload,
      exchange,
      updatedAt: new Date().toISOString(),
    });

    auditFromRequest(req, "exchange.reset", {
      orderId: order.id,
      orderNumber: order.number,
      from: previous.status,
    });

    res.json({ ok: true, order, exchange });
  }
);

app.get(
  "/api/admin/exchange/orders/:orderId/download",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const stored = getOrderById(req.params.orderId);
    if (!stored) return res.status(404).json({ error: "Заказ не найден." });

    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const clientLinks = getGlobalState("clientLinks", {});
    const payload = build1CPayload({
      order: stored.payload,
      products,
      clientLinks,
    });
    const safeNumber = String(stored.payload.number || stored.id).replace(/[^a-zA-Z0-9а-яА-Я_-]/g, "-");
    const format = String(req.query.format || "json").toLowerCase();

    auditFromRequest(req, "exchange.download.order", {
      orderId: stored.id,
      orderNumber: stored.payload.number,
      format,
      ready: payload.validation.ready,
    });

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=clover-order-${safeNumber}-1c.csv`);
      return res.send(payloadToCsv(payload));
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=clover-order-${safeNumber}-1c.json`);
    return res.send(JSON.stringify(payload, null, 2));
  }
);

app.get(
  "/api/admin/exchange/batch/download",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const clientLinks = getGlobalState("clientLinks", {});
    const requestedStatus = String(req.query.status || "all");
    const format = String(req.query.format || "json").toLowerCase();
    const orders = listOrders().filter((order) => {
      if (requestedStatus === "all") return true;
      return normalizeExchangeState(order.exchange).status === requestedStatus;
    });
    const payloads = orders.map((order) => build1CPayload({ order, products, clientLinks }));
    const stamp = new Date().toISOString().slice(0, 10);

    auditFromRequest(req, "exchange.download.batch", {
      format,
      status: requestedStatus,
      count: payloads.length,
    });

    if (format === "csv") {
      const chunks = payloads.map((payload) => payloadToCsv(payload).replace(/^\uFEFF/, ""));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=clover-orders-1c-${stamp}.csv`);
      return res.send("\uFEFF" + chunks.join("\r\n\r\n"));
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=clover-orders-1c-${stamp}.json`);
    return res.send(JSON.stringify({
      schema: "clover.orders.batch.1c",
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      testMode: true,
      count: payloads.length,
      orders: payloads,
    }, null, 2));
  }
);

app.get("/api/one-c/reconciliation/requests", (req, res) => {
  const status = String(req.query.status || "new");
  const requests = listReconciliationRequests().filter((item) => !status || item.status === status);
  res.json({ ok: true, requests });
});

app.post("/api/one-c/reconciliation/:requestId/result", (req, res, next) => {
  try {
    const current = getReconciliationRequestInternal(req.params.requestId);
    if (!current) return res.status(404).json({ error: "Запрос акта сверки не найден." });
    const base64 = String(req.body?.fileBase64 || "").replace(/^data:application\/pdf;base64,/, "");
    if (!base64) return res.status(400).json({ error: "1С не передала PDF-файл." });
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length < 5 || buffer.length > 15 * 1024 * 1024 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return res.status(400).json({ error: "Передан некорректный PDF-файл." });
    }
    if (current.file_path && existsSync(current.file_path)) unlinkSync(current.file_path);
    const filePath = path.resolve(reconciliationDirectory, `act-${current.id}-${Date.now()}-${randomUUID()}.pdf`);
    writeFileSync(filePath, buffer, { flag: "wx" });
    const request = updateReconciliationRequest(current.id, {
      status: "ready",
      fileName: String(req.body?.fileName || `Акт-сверки-${current.id}.pdf`).slice(0, 240),
      filePath,
      managerComment: String(req.body?.managerComment || "Акт получен автоматически из 1С.").slice(0, 2000),
    });
    writeAudit({ action: "one-c.reconciliation.receive", details: { requestId: request.id, bytes: buffer.length } });
    sendOrderPush(request.userId, {
      title: "Акт сверки готов",
      body: "PDF получен из 1С и доступен в Clover.",
      url: "/?section=reconciliation",
      tag: `reconciliation-${request.id}`,
    }).catch((error) => console.error(error));
    res.json({ ok: true, requestId: request.id, status: request.status });
  } catch (error) {
    next(error);
  }
});

app.get("/api/reconciliation", authRequired, (req, res) => {
  const requests = isStaffRole(req.user.role)
    ? listReconciliationRequests()
    : listReconciliationRequests(req.user.id);
  res.json({ requests });
});

app.post("/api/reconciliation", authRequired, roleRequired("client"), (req, res, next) => {
  try {
    const input = reconciliationSchema.parse(req.body);
    const year = Number(input.year || new Date().getFullYear());
    let dateFrom = input.dateFrom;
    let dateTo = input.dateTo;
    if (["q1", "q2", "q3", "q4"].includes(input.periodType)) {
      const range = quarterRange(year, input.periodType);
      dateFrom = range.dateFrom;
      dateTo = range.dateTo;
    } else if (input.periodType === "all") {
      dateFrom = "";
      dateTo = "";
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) {
      return res.status(400).json({ error: "Укажите корректный период: дата начала не должна быть позже даты окончания." });
    }
    const request = createReconciliationRequest({
      userId: req.user.id, periodType: input.periodType, year, dateFrom, dateTo, clientComment: input.comment,
    });
    auditFromRequest(req, "reconciliation.create", { requestId: request.id, periodType: request.periodType, dateFrom, dateTo });
    const clientProfile = getClientState(req.user.id).profile || {};
    queueManagerNotification({
      type: "reconciliation_request",
      title: "Новый запрос акта сверки",
      body: `${clientProfile.companyName || req.user.email || "Клиент"} · ${reconciliationPeriodText(request)}${request.clientComment ? ` · ${request.clientComment}` : ""}`,
      url: `/?managerTab=acts&request=${encodeURIComponent(request.id)}`,
      sourceId: request.id,
    });
    res.status(201).json({ ok: true, request });
  } catch (error) { next(error); }
});

app.patch("/api/admin/reconciliation/:requestId", authRequired, roleRequired("manager"), (req, res, next) => {
  try {
    const input = reconciliationManagerSchema.parse(req.body);
    const request = updateReconciliationRequest(req.params.requestId, {
      status: input.status, managerComment: input.managerComment,
    });
    if (!request) return res.status(404).json({ error: "Запрос акта сверки не найден." });
    auditFromRequest(req, "reconciliation.update", { requestId: request.id, status: request.status });
    sendOrderPush(request.userId, {
      title: "Акт сверки",
      body: request.status === "ready" ? "Акт сверки готов к скачиванию." : `Статус запроса: ${request.status}`,
      url: "/?section=reconciliation",
      tag: `reconciliation-${request.id}`,
    }).catch((error) => console.error(error));
    res.json({ ok: true, request });
  } catch (error) { next(error); }
});

app.post(
  "/api/admin/reconciliation/:requestId/file",
  authRequired, roleRequired("manager"), reconciliationUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file?.path) {
        return res.status(400).json({ error: "Выберите PDF-файл акта сверки." });
      }
      const header = readFileSync(req.file.path).subarray(0, 5).toString("ascii");
      if (header !== "%PDF-") {
        unlinkSync(req.file.path);
        return res.status(400).json({ error: "Файл не является корректным PDF." });
      }
      const current = getReconciliationRequestInternal(req.params.requestId);
      if (!current) {
        if (req.file?.path && existsSync(req.file.path)) unlinkSync(req.file.path);
        return res.status(404).json({ error: "Запрос акта сверки не найден." });
      }
      if (current.file_path && existsSync(current.file_path)) unlinkSync(current.file_path);
      const request = updateReconciliationRequest(current.id, {
        status: "ready",
        fileName: req.file?.originalname || "Акт-сверки.pdf",
        filePath: req.file?.path || "",
        managerComment: String(req.body?.managerComment || current.manager_comment || ""),
      });
      auditFromRequest(req, "reconciliation.file.upload", { requestId: request.id, fileName: request.fileName });
      sendOrderPush(request.userId, {
        title: "Акт сверки готов", body: "Откройте Clover, чтобы скачать PDF.",
        url: "/?section=reconciliation", tag: `reconciliation-${request.id}`,
      }).catch((error) => console.error(error));

      const clientUser = findUserById(request.userId);
      let mail = { sent: false, reason: "account_not_found" };
      if (clientUser?.email) {
        const clientState = getClientState(clientUser.id);
        const period = request.periodType === "all"
          ? "за весь период"
          : request.dateFrom && request.dateTo
            ? `${request.dateFrom} — ${request.dateTo}`
            : "";
        const message = reconciliationReadyEmail({
          companyName: clientState.profile?.companyName || "",
          period,
        });
        try {
          mail = await sendCloverMail({
            to: clientUser.email,
            ...message,
            attachments: [{
              filename: request.fileName || "Акт-сверки.pdf",
              path: req.file.path,
              contentType: "application/pdf",
            }],
          });
        } catch (mailError) {
          console.error("Reconciliation email error", mailError);
          mail = { sent: false, reason: "send_failed" };
        }
      }
      res.json({ ok: true, request, mail: { sent: Boolean(mail.sent) } });
    } catch (error) { next(error); }
  }
);

app.get("/api/reconciliation/:requestId/file", authRequired, (req, res) => {
  const request = getReconciliationRequestInternal(req.params.requestId);
  if (!request) return res.status(404).json({ error: "Запрос акта сверки не найден." });
  if (!isStaffRole(req.user.role) && String(request.user_id) !== String(req.user.id)) {
    return res.status(403).json({ error: "Недостаточно прав для скачивания этого файла." });
  }
  if (!request.file_path || !existsSync(request.file_path)) {
    return res.status(404).json({ error: "PDF-файл ещё не прикреплён." });
  }
  auditFromRequest(req, "reconciliation.file.download", { requestId: request.id });
  return res.download(request.file_path, request.file_name || "Акт-сверки.pdf");
});

app.patch("/api/admin/clients/:clientId/approval", authRequired, roleRequired("manager"), async (req, res) => {
  const status = String(req.body?.status || "");
  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Недопустимый статус регистрации." });
  }
  const user = setUserApprovalStatus(req.params.clientId, status);
  if (!user) return res.status(404).json({ error: "Клиент не найден." });
  // Разрешение менеджером = доверенный доступ: почту тоже считаем подтверждённой,
  // иначе вход блокируется EMAIL_NOT_VERIFIED даже после «Разрешить».
  if (status === "approved" && !user.email_verified) {
    setUserEmailVerified(user.id, true);
  }
  const refreshed = findUserById(user.id) || user;
  auditFromRequest(req, "client.approval", {
    clientId: refreshed.id,
    status,
    emailVerified: Boolean(refreshed.email_verified),
  });
  if (["approved", "rejected"].includes(status)) {
    markManagerNotificationsReadBySource("client_registration", refreshed.id);
  }
  let mail = { sent: false };
  if (["approved", "rejected"].includes(status) && refreshed.email) {
    try {
      mail = await sendCloverMail({
        to: refreshed.email,
        ...approvalEmail({ approved: status === "approved" }),
      });
    } catch (mailError) {
      console.error("Approval email error", mailError);
    }
  }
  res.json({
    ok: true,
    user: publicUser(refreshed),
    clients: listClients(),
    mail: { sent: Boolean(mail.sent) },
    managerNotifications: listManagerNotifications({ limit: 100 }),
  });
});

app.get(
  "/api/admin/client-access",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const items = listClientAccessEntries(listClients());
    res.json({
      ok: true,
      items,
      savedCount: items.filter((item) => item.hasPassword).length,
    });
  }
);

app.delete(
  "/api/admin/client-access/:clientId",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const removed = removeClientAccessEntry(req.params.clientId);
    if (!removed) {
      return res.status(404).json({ error: "Запись доступа не найдена." });
    }
    auditFromRequest(req, "client.access.vault_remove", {
      clientId: req.params.clientId,
    });
    res.json({
      ok: true,
      items: listClientAccessEntries(listClients()),
    });
  }
);

app.post("/api/admin/clients", authRequired, roleRequired("manager"), async (req, res, next) => {

  try {
    const input = managerClientProvisionSchema.parse(req.body);
    const email = normalizeEmail(input.email);
    if (findUserByEmail(email)) {
      return res.status(409).json({ error: "Аккаунт с такой почтой уже существует." });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = createUser({
      email,
      passwordHash,
      role: "client",
      emailVerified: true,
      approvalStatus: "approved",
      profile: {
        companyName: input.companyName,
        contactName: input.contactName,
        phone: input.phone,
        email,
      },
    });
    auditFromRequest(req, "client.provision", {
      clientId: user.id,
      email,
      companyName: input.companyName,
    });
    const access = saveClientAccessCredentials(
      user.id,
      {
        login: email,
        password: input.password,
        companyName: input.companyName,
        contactName: input.contactName,
      },
      req.user
    );
    res.status(201).json({
      ok: true,
      message:
        "Клиент создан. Логин и пароль сохранены в «Ещё → Доступы».",
      client: listClients().find((item) => String(item.id) === String(user.id)) || null,
      user: publicUser(user),
      clients: listClients(),
      login: email,
      access,
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/admin/clients/:clientId/password",
  authRequired,
  roleRequired("manager"),
  async (req, res, next) => {
    try {
      const input = managerClientPasswordSchema.parse(req.body);
      const clientUser = findUserById(req.params.clientId);
      if (!clientUser || clientUser.role !== "client") {
        return res.status(404).json({ error: "Клиент Clover не найден." });
      }
      const passwordHash = await bcrypt.hash(input.password, 12);
      const updated = updateUserPassword(clientUser.id, passwordHash);
      // Чтобы клиент мог войти сразу после выдачи пароля менеджером.
      if (!updated?.email_verified) {
        setUserEmailVerified(clientUser.id, true);
      }
      if (updated?.approval_status !== "approved") {
        setUserApprovalStatus(clientUser.id, "approved");
      }
      const refreshed = findUserById(clientUser.id) || updated;
      auditFromRequest(req, "client.password.set_by_manager", {
        clientId: clientUser.id,
      });
      const clientCard =
        listClients().find((item) => String(item.id) === String(clientUser.id)) ||
        {};
      const access = saveClientAccessCredentials(
        clientUser.id,
        {
          login: refreshed?.email || clientUser.email,
          password: input.password,
          companyName: clientCard.companyName || "",
          contactName: clientCard.contactName || "",
        },
        req.user
      );
      res.json({
        ok: true,
        message:
          "Пароль обновлён и сохранён в «Ещё → Доступы».",
        user: publicUser(refreshed),
        login: refreshed?.email || clientUser.email,
        clients: listClients(),
        access,
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/admin/clients/:clientId",
  authRequired,
  roleRequired("manager"),
  (req, res, next) => {
    try {
      const clientId = String(req.params.clientId || "").trim();
      const clientUser = findUserById(clientId);
      if (!clientUser || clientUser.role !== "client") {
        return res.status(404).json({ error: "Клиент Clover не найден." });
      }

      const removed = deleteClientUser(clientUser.id);
      if (!removed) {
        return res.status(404).json({ error: "Клиент Clover не найден." });
      }

      removeClientAccessEntry(clientUser.id);
      deleteManagerNotificationsBySource(clientUser.id);

      const clientLinks = { ...(getGlobalState("clientLinks", {}) || {}) };
      if (Object.prototype.hasOwnProperty.call(clientLinks, String(clientUser.id))) {
        delete clientLinks[String(clientUser.id)];
        setGlobalState("clientLinks", clientLinks);
      }

      const candidateMap = { ...(getGlobalState("oneCClientCandidates", {}) || {}) };
      if (Object.prototype.hasOwnProperty.call(candidateMap, String(clientUser.id))) {
        delete candidateMap[String(clientUser.id)];
        setGlobalState("oneCClientCandidates", candidateMap);
        const meta = getGlobalState("oneCClientsMeta", {}) || {};
        setGlobalState("oneCClientsMeta", { ...meta, candidateMap });
      }

      auditFromRequest(req, "client.delete", {
        clientId: clientUser.id,
        email: clientUser.email,
      });

      res.json({
        ok: true,
        message: "Клиент удалён.",
        clients: listClients(),
        clientLinks,
        items: listClientAccessEntries(listClients()),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/admin/notifications", authRequired, roleRequired("manager"), (req, res) => {
  const unreadOnly = String(req.query?.unread || "") === "1";
  const limit = Number(req.query?.limit || 100);
  const settings = getGlobalState("settings", DEFAULT_SETTINGS);
  res.json({
    notifications: listManagerNotifications({ unreadOnly, limit }),
    status: publicManagerNotificationStatus(settings),
  });
});

app.patch("/api/admin/notifications/:notificationId/read", authRequired, roleRequired("manager"), (req, res) => {
  const notification = markManagerNotificationRead(req.params.notificationId);
  if (!notification) return res.status(404).json({ error: "Уведомление не найдено." });
  auditFromRequest(req, "manager.notification.read", { notificationId: notification.id });
  res.json({ ok: true, notification });
});

app.post("/api/admin/notifications/read-all", authRequired, roleRequired("manager"), (req, res) => {
  const result = markAllManagerNotificationsRead();
  auditFromRequest(req, "manager.notification.read_all", result);
  res.json({ ok: true, ...result });
});

app.post("/api/admin/notifications/test", authRequired, roleRequired("manager"), async (req, res, next) => {
  try {
    const result = await notifyManagers({
      type: "test",
      title: "Тестовое уведомление Clover",
      body: "Каналы уведомлений менеджера настроены и работают.",
      url: "/?managerTab=settings",
      sourceId: `test-${randomUUID()}`,
    });
    auditFromRequest(req, "manager.notification.test", { delivery: result.delivery || [] });
    res.json({ ok: true, result, status: publicManagerNotificationStatus() });
  } catch (error) { next(error); }
});

app.get("/api/push/status", authRequired, (req, res) => {
  const status = publicPushStatus();
  const subscriptions = listPushSubscriptions(req.user.id);
  res.json({ ...status, subscriptions: subscriptions.map((item) => ({
    endpoint: item.endpoint, orderEvents: item.orderEvents, promotions: item.promotions,
  })) });
});

app.post("/api/push/subscribe", authRequired, (req, res, next) => {
  try {
    const input = pushSubscriptionSchema.parse(req.body);
    const subscription = upsertPushSubscription({
      userId: req.user.id, subscription: input.subscription, preferences: input.preferences,
    });
    auditFromRequest(req, "push.subscribe", { promotions: subscription.promotions });
    res.json({ ok: true, subscription });
  } catch (error) { next(error); }
});

app.post("/api/push/unsubscribe", authRequired, (req, res) => {
  const endpoint = String(req.body?.endpoint || "");
  if (endpoint) deletePushSubscription(req.user.id, endpoint);
  auditFromRequest(req, "push.unsubscribe", {});
  res.json({ ok: true });
});

app.post("/api/admin/push/promotion", authRequired, roleRequired("manager"), async (req, res, next) => {
  try {
    const title = String(req.body?.title || "Новость Clover").trim().slice(0, 100);
    const body = String(req.body?.body || "").trim().slice(0, 300);
    if (!body) return res.status(400).json({ error: "Введите текст уведомления." });
    const result = await sendPromotionPush({ title, body, url: "/?section=promotions", tag: `promotion-${Date.now()}` });
    auditFromRequest(req, "push.promotion", { title, ...result });
    res.json({ ok: true, result });
  } catch (error) { next(error); }
});

app.get(
  "/api/admin/audit",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    res.json({ audit: listAudit(req.query.limit || 200) });
  }
);

app.post(
  "/api/admin/reset",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    if (!isAdminFullResetAllowed(req)) {
      return res.status(403).json({
        error:
          "Полный сброс запрещён. Для локального TEST оставьте ALLOW_ADMIN_FULL_RESET пустым (только loopback) или задайте true; на сервере укажите false.",
        code: "ADMIN_RESET_DENIED",
      });
    }
    if (String(req.body?.confirm || "").trim() !== "RESET") {
      return res.status(400).json({
        error: "Для полного сброса передайте confirm: \"RESET\".",
        code: "ADMIN_RESET_CONFIRM_REQUIRED",
      });
    }

    createServerBackup({
      label: "before-reset",
      reason: "Автоматическая копия перед полным сбросом",
    });
    auditFromRequest(req, "server.reset", {});
    resetServerData();
    res.json({ ok: true });
  }
);

app.use((error, req, res, next) => {
  console.error(error);

  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600) {
    return res.status(error.status).json({ error: error.message });
  }

  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error:
        "Проверьте заполнение полей и формат email.",
      details: error.issues,
    });
  }

  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: req.path.includes("reconciliation")
        ? "PDF-файл слишком большой. Максимальный размер — 15 МБ."
        : "Фотография слишком большая. Максимальный размер — 5 МБ.",
    });
  }

  if (
    String(error?.message || "").includes("JPG") ||
    String(error?.message || "").includes("PDF") ||
    String(error?.message || "").includes("резервной копии") ||
    String(error?.message || "").includes("раздел") ||
    String(error?.message || "").includes("адрес 1С") ||
    String(error?.message || "").includes("HTTP") ||
    String(error?.message || "").includes("HTTPS")
  ) {
    return res.status(400).json({ error: error.message });
  }

  if (
    error?.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    String(error?.message || "").includes("UNIQUE")
  ) {
    return res.status(409).json({
      error: "Такая запись уже существует.",
    });
  }

  res.status(500).json({
    error: "Внутренняя ошибка сервера Clover.",
  });
});

try {
  const automaticBackup = ensureDailyBackup();
  if (automaticBackup) {
    console.log(
      `Создана автоматическая резервная копия: ${automaticBackup.fileName}`
    );
  }
} catch (error) {
  console.error("Не удалось создать автоматическую резервную копию", error);
}

app.listen(port, host, () => {
  startOneCClaimRequeueTimer();
  console.log("");
  console.log("Clover Server V18.1 (4.0.4 legacy-ack-bridge) запущен");
  console.log(`API: http://localhost:${port}/api/health`);
  if (process.env.MANAGER_EMAIL) {
    console.log(`Менеджер: ${process.env.MANAGER_EMAIL}`);
  }
  console.log("Пароли и ключи в журнал не выводятся.");
  console.log("");
});
