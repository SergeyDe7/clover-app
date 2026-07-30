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
  build1CPayload,
  isOneCClaimExpired,
  normalizeExchangeState,
  ONEC_CLAIM_REQUEUE_INTERVAL_MS,
  payloadToCsv,
  sanitizeOrderExchangeForSave,
  summarizeExchange,
  validateOrderFor1C,
} from "./exchange.js";
import { releaseExpiredOneCClaims } from "./onecClaimRequeue.js";
import { applyOrderStatusPolicy, buildStatusUpdatedOrder } from "./orderStatus.js";
import { hasRole, isClientRole, isStaffRole } from "./roles.js";
import { publicClientSettings } from "./clientSettings.js";
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
  selectRelevantOneCProducts,
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
} from "./pricing.js";
import {
  buildAllPriceRequirements,
  buildOrderPriceRequirements,
  buildPriceRequest,
  extractOneCDatabase,
  isTestDatabase,
  mergePurchasePrices,
  priceMaxAgeMs,
  validatePriceRequirements,
} from "./oneCPriceSync.js";
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
} from "./matrixGuard.js";

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
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: Boolean(user.email_verified),
    approvalStatus: user.approval_status || "approved",
  };
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
  password: z.string().min(8).max(200),
});

const managerCreateSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(12).max(200),
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
  password: z.string().min(8).max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

const passkeyAuthenticationOptionsSchema = z.object({
  email: z.string().trim().email().max(200),
});

const passkeyCeremonySchema = z.object({
  ceremonyId: z.string().uuid(),
  response: z.record(z.string(), z.any()).or(z.any()),
});

const passkeyAuthenticationVerifySchema = passkeyCeremonySchema.extend({
  email: z.string().trim().email().max(200),
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


function normalizeClientLink(value) {
  const link = value && typeof value === "object" ? value : {};
  const defaultPricing = normalizeDefaultPricingConfig(link);

  return {
    ...EMPTY_LINK,
    ...link,
    matched1C: Boolean(link.matched1C || String(link.oneCId || "").trim()),
    matrixProductIds: Array.isArray(link.matrixProductIds)
      ? link.matrixProductIds
      : [],
    allowFullCatalog: Boolean(link.allowFullCatalog),
    defaultPricingMode: defaultPricing.source,
    defaultMarkupPercent: defaultPricing.markupPercent,
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

  return {
    ...enrichProductWithPurchasePrices(product, oneCItem),
    isMatrixProduct,
    basePricePiece: Number(product.pricePiece) || 0,
    basePricePack: Number(product.pricePack) || 0,
    basePriceBundle: Number(product.priceBundle) || 0,
    pricePiece: pricing.prices.piece,
    pricePack: pricing.prices.pack,
    priceBundle: pricing.prices.bundle,
    priceSources: pricing.priceSources,
    clientPriceMode: pricing.source,
    clientPriceOverrideMode: pricing.overrideSource,
    markupPercent: pricing.markupPercent,
    defaultPricingMode: pricing.defaultPricingMode,
    defaultMarkupPercent: pricing.defaultMarkupPercent,
    purchasePrices: pricing.purchasePrices,
    purchasePriceUpdatedAt: pricing.purchasePriceUpdatedAt,
  };
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
    clientPriceMode,
    clientPriceOverrideMode,
    markupPercent,
    defaultPricingMode,
    defaultMarkupPercent,
    priceSources,
    basePricePiece,
    basePricePack,
    basePriceBundle,
    isMatrixProduct,
    ...stored
  } = product;
  return stored;
}

function priceForOrderUnit(product, unit) {
  if (unit === "pack") return Number(product.pricePack) || 0;
  if (unit === "bundle") return Number(product.priceBundle) || 0;
  return Number(product.pricePiece) || 0;
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
    const unit = ["piece", "pack", "bundle"].includes(item.unit) ? item.unit : "piece";
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

function listReadyOrdersForOneC() {
  releaseExpiredOneCClaims();

  const eligible = [...listOrders()].filter((order) => {
    const status = normalizeExchangeState(order.exchange).status;
    // 1С получает только заказ, который менеджер явно поставил в очередь.
    return status === "ready";
  });

  eligible.sort((left, right) => {
    const timeDifference =
      oneCQueueTimestamp(right) - oneCQueueTimestamp(left);
    if (timeDifference !== 0) return timeDifference;
    return String(right.id || "").localeCompare(String(left.id || ""), "ru");
  });

  return eligible;
}

function nextOrderForOneC() {
  return listReadyOrdersForOneC()[0] || null;
}

/**
 * Атомарная выдача: ready → sending до ACK.
 * Sync-only, чтобы два параллельных pull не получили один заказ.
 */
function claimOrderForOneC(orderId) {
  const stored = getOrderById(orderId);
  if (!stored) return null;

  const previous = normalizeExchangeState(stored.payload.exchange);
  if (previous.status !== "ready") return null;

  const claimedAt = new Date().toISOString();
  return updateOrderPayload(stored.id, {
    ...stored.payload,
    exchange: {
      ...previous,
      status: "sending",
      attempts: previous.attempts + 1,
      checkedAt: claimedAt,
      lastAttemptAt: claimedAt,
      channel: "onec-pull",
      message: "Заказ выдан 1С TEST, ожидается ACK.",
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

function oneCQueueSnapshot() {
  releaseExpiredOneCClaims();

  const rows = [...listOrders()]
    .map((order) => {
      const exchange = normalizeExchangeState(order.exchange);
      return {
        id: order.id,
        number: order.number,
        customerName: order.customerName || "",
        status: exchange.status,
        attempts: exchange.attempts,
        checkedAt: exchange.checkedAt,
        lastAttemptAt: exchange.lastAttemptAt,
        sentAt: exchange.sentAt,
        receipt: exchange.receipt,
      };
    })
    .filter((row) => row.status === "ready" || row.status === "sending")
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
  if (!isTestDatabase(database)) {
    const error = new Error("Закупочные цены принимаются только из базы 1С TEST.");
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
    lastPriceSyncDatabase: "TEST",
    lastPriceSyncAccepted: merged.accepted.length,
    lastPriceSyncRejected: merged.rejected.length,
  });
  writeAudit({
    action: "one-c.purchase-prices.receive",
    details: {
      database: "TEST",
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
    const input = managerCreateSchema.parse(req.body);
    const email = normalizeEmail(input.email);
    if (findUserByEmail(email)) {
      return res.status(409).json({ error: "Аккаунт с такой почтой уже существует." });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = createUser({
      email,
      passwordHash,
      role: "manager",
      emailVerified: false,
      approvalStatus: "approved",
    });
    const plainToken = createPlainToken();
    createAuthToken({
      userId: user.id,
      type: "verify_email",
      tokenHash: tokenHash(plainToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const verifyUrl = `${publicBaseUrl(req)}/?verify=${encodeURIComponent(plainToken)}`;
    let mail = { sent: false };
    try {
      mail = await sendCloverMail({
        to: email,
        ...verificationEmail({ companyName: "Менеджер Clover", verifyUrl }),
      });
    } catch (mailError) {
      console.error("Manager verification email error", mailError);
    }
    auditFromRequest(req, "manager.create", { managerId: user.id, mailSent: Boolean(mail.sent) });
    res.status(201).json({
      ok: true,
      manager: publicUser(user),
      requiresEmailVerification: true,
      mail: { sent: Boolean(mail.sent) },
      developmentLink: allowDevelopmentAuthLinks(req) ? verifyUrl : undefined,
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
  res.json({
    ok: true,
    staff: listStaffUsers(),
    adminCount,
    canManageRoles,
    adminRoleSupported: true,
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
    const input = passkeyAuthenticationOptionsSchema.parse(req.body);
    const email = normalizeEmail(input.email);
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
    res.json({ ceremonyId: ceremony.id, options });
  } catch (error) {
    next(error);
  }
});

app.post("/api/passkeys/authentication/verify", async (req, res, next) => {
  try {
    const input = passkeyAuthenticationVerifySchema.parse(req.body);
    const email = normalizeEmail(input.email);
    const user = findUserByEmail(email);
    const ceremony = consumeWebAuthnChallenge(input.ceremonyId, "authentication");
    const credential = getPasskey(input.response?.id || "");
    if (!user || !ceremony || ceremony.userId !== String(user.id) || !credential || credential.userId !== String(user.id)) {
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
    clearLoginLimit(email);
    markUserLogin(user.id);
    writeAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: "auth.login.passkey",
      details: { credentialId: credential.id },
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
      orders: listOrders(),
      profile: {},
      addresses: [],
      favorites: [],
      settings,
      clientLinks: normalizedClientLinks,
      clients: listClients(),
      reconciliationRequests: listReconciliationRequests(),
      managerNotifications: listManagerNotifications({ limit: 100 }),
      services: {
        mail: publicMailStatus(),
        push: publicPushStatus(),
        managerNotifications: publicManagerNotificationStatus(settings),
      },
    });
  }

  const state = getClientState(req.user.id);
  const catalog = resolveClientCatalog(
    products,
    allClientLinks[req.user.id],
    oneCProducts
  );

  const clientPayload = {
    user: publicUser(req.user),
    products: catalog.matrixProducts,
    catalogPolicy: catalog.policy,
    orders: listOrders(req.user.id),
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
  const previousOrders = isStaffRole(req.user.role) ? listOrders() : listOrders(req.user.id);
  const previousById = new Map(previousOrders.map((order) => [String(order.id), order]));

  if (isStaffRole(req.user.role)) {
    const safety = assertSafeManagerOrderReplace(previousOrders, incomingOrders);
    if (!safety.ok) {
      return res.status(safety.status || 409).json({ error: safety.error });
    }
  }

  let orders = incomingOrders.map((order) =>
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
    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const links = getGlobalState("clientLinks", {});
    const oneCProducts = getGlobalState("oneCProducts", []);
    const clientLink = normalizeClientLink(links[req.user.id]);
    const matrixViolations = findClientOrderMatrixViolations(
      orders,
      clientLink,
      products
    );
    if (matrixViolations.length) {
      return res.status(400).json({
        error:
          "В заказе есть товары вне вашей матрицы. Уберите их или оформите через «товар вне матрицы».",
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
        queueManagerNotification({
          type: "new_order",
          title: `Новый заказ №${orderNumber}`,
          body: `${customerName} · ${orderPositionCount(order)} поз. · доставка ${order.firstDeliveryDate || "не указана"}`,
          url: `/?managerTab=orders&order=${encodeURIComponent(order.id)}`,
          sourceId: String(order.id),
        });
      } else if (clientOrderSignature(previous) !== clientOrderSignature(order)) {
        const changeHash = createHash("sha256")
          .update(clientOrderSignature(order))
          .digest("hex")
          .slice(0, 16);
        queueManagerNotification({
          type: "order_changed",
          title: `Клиент изменил заказ №${orderNumber}`,
          body: `${customerName} · обновлены состав или условия доставки`,
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
          title: `Ошибка обмена с 1С по заказу №${order.number || order.id || ""}`,
          body: currentExchange.error || currentExchange.message || "Проверьте журнал обмена и настройки подключения.",
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

  res.json({ ok: true, orders });
});

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
    if (!requireOneCTestDatabase(req, res)) return;

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
        database: extractOneCDatabase(req),
      });
    }

    const candidates = listReadyOrdersForOneC();
    if (!candidates.length) {
      return res.status(404).json({
        code: "EMPTY_QUEUE",
        error: "Нет новых заказов",
        userMessage: "Нет новых заказов",
      });
    }

    let realOrder = null;
    let claimBlockedReason = null;

    for (const candidate of candidates) {
      const priceRequirements = buildOrderPriceRequirements(
        candidate,
        products,
        clientLinks[candidate.clientId] || {}
      );
      const freshnessIssues = validatePriceRequirements(
        priceRequirements,
        getGlobalState("oneCProducts", []),
        { maxAgeMs: priceMaxAgeMs() }
      );
      if (freshnessIssues.length) {
        claimBlockedReason = {
          status: 409,
          body: {
            code: "PURCHASE_PRICE_REFRESH_REQUIRED",
            error: "Перед передачей заказа 1С TEST должна отправить свежие закупочные цены.",
            items: freshnessIssues,
            priceRequest: buildPriceRequest({
              scope: "next-order",
              order: candidate,
              products,
              clientLinks,
              maxAgeMs: priceMaxAgeMs(),
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

      const claimed = claimOrderForOneC(candidate.id);
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
        database: "TEST",
      },
    });

    // Цена уже согласована клиентом в заказе и фиксируется при постановке
    // в очередь. Свежая закупочная цена из 1С обязательна для контроля и
    // расчёта следующих заказов, но не меняет сумму уже созданного заказа.
    const lockedOrderTotal = (realOrder.items || []).reduce(
      (sum, item) => sum + (Number(item.lineTotal) || 0),
      0
    );

    const items = (realOrder.items || []).map((item) => {
      const product = productsById.get(String(item.productId ?? item.id));
      const oneCId = String(item.oneCId || product?.oneCId || "").trim();
      const quantity = Number(item.quantity) || 1;
      const price =
        Number(item.unitPrice) ||
        (Number(item.lineTotal) || 0) / quantity;

      const unit = ["piece", "pack", "bundle"].includes(item.unit)
        ? item.unit
        : "piece";
      const multiplier = Math.max(1, Number(item.multiplier) || 1);

      return {
        id: oneCId,
        code: item.oneCCode || product?.oneCCode || item.code || product?.code || "",
        name: item.oneCName || product?.oneCName || item.name || product?.name || "",
        displayName: item.name || product?.name || "",
        unit,
        unitName: unit === "pack" ? "Упаковка" : unit === "bundle" ? "Пачка" : "Штука",
        multiplier,
        totalPieces: quantity * multiplier,
        quantity,
        price,
      };
    });

    const clientLink = normalizeClientLink(clientLinks[realOrder.clientId]);

    if (legacyProtocol) {
      writeAudit({
        action: "one-c.order.legacy-protocol",
        details: {
          orderId: realOrder.id,
          orderNumber: realOrder.number || "",
          database: "TEST",
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
        total: items.reduce(
          (sum, item) => sum + item.quantity * item.price,
          0
        ),
        comment: `Заказ Clover № ${realOrder.number || realOrder.displayId || ""}`.trim(),
      },
    });
  } catch (error) {
    next(error);
  }
}

app.use("/api/one-c", oneCAuthRequired);

app.get("/api/one-c/queue-status", (req, res) => {
  if (!requireOneCTestDatabase(req, res)) return;

  res.json({
    ok: true,
    database: "TEST",
    queue: oneCQueueSnapshot(),
  });
});

app.get("/api/one-c/purchase-price-request", (req, res) => {
  if (!requireOneCTestDatabase(req, res)) return;

  const products = getGlobalState("products", DEFAULT_PRODUCTS);
  const clientLinks = getGlobalState("clientLinks", {});
  const orders = listOrders();
  const scope = String(req.query.scope || "next-order") === "all" ? "all" : "next-order";
  const order = scope === "next-order" ? nextOrderForOneC() : null;
  const request = buildPriceRequest({
    scope,
    order,
    products,
    clientLinks,
    orders,
    maxAgeMs: priceMaxAgeMs(),
  });

  const requirements = scope === "all"
    ? buildAllPriceRequirements(products, clientLinks, orders)
    : request.items;
  const issues = validatePriceRequirements(
    requirements,
    getGlobalState("oneCProducts", []),
    { maxAgeMs: priceMaxAgeMs() }
  );

  res.json({
    ...request,
    refreshRequired: issues.length > 0,
    issues,
  });
});

app.post("/api/one-c/purchase-prices", (req, res, next) => {
  try {
    const merged = receivePurchasePrices({
      items: req.body?.items,
      database: extractOneCDatabase(req),
    });
    res.json({
      ok: true,
      database: "TEST",
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

  if (!requireOneCTestDatabase(req, res)) return;

  const previous = normalizeExchangeState(stored.payload.exchange);
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
      error: "Подтверждение отклонено: заказ не находится в очереди 1С TEST.",
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
      database: "TEST",
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
app.put(
  "/api/state/profile",
  authRequired,
  roleRequired("client"),
  (req, res) => {
    setClientStateField(
      req.user.id,
      "profile",
      req.body?.profile || {}
    );

    res.json({ ok: true });
  }
);

app.put(
  "/api/state/addresses",
  authRequired,
  roleRequired("client"),
  (req, res) => {
    setClientStateField(
      req.user.id,
      "addresses",
      Array.isArray(req.body?.addresses)
        ? req.body.addresses
        : []
    );

    res.json({ ok: true });
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
    setGlobalState(
      "settings",
      req.body?.settings || DEFAULT_SETTINGS
    );
    auditFromRequest(req, "settings.save", {});

    res.json({ ok: true });
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
      const client = updateClientByManager({
        clientId: clientUser.id,
        profile: parsed.profile,
        addresses,
        managerNote: parsed.managerNote,
      });

      auditFromRequest(req, "client.profile.manager_update", {
        clientId: clientUser.id,
        changedEmail: normalizeEmail(clientUser.email) !== normalizeEmail(parsed.profile.email),
        addresses: addresses.length,
        managerNoteLength: parsed.managerNote.length,
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
    setGlobalState("clientLinks", clientLinks);
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
    const addresses = Array.isArray(req.body?.addresses)
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
    res.json({ ok: true, ...publicOneCStatus(stored) });
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
    const sourceDatabase = requireOneCTestDatabase(req, res);
    if (!sourceDatabase) return;
    const verifiedTestSource = true;
    const allOneCProducts = normalizeOneCProducts(req.body?.items).map((item) => ({
      ...item,
      purchasePriceUpdatedAt:
        item.purchasePriceUpdatedAt || (hasPurchasePrice(item) ? receivedAt : ""),
      purchasePriceReceivedAt:
        hasPurchasePrice(item) && verifiedTestSource ? receivedAt : "",
      purchasePriceSourceDatabase:
        hasPurchasePrice(item) && verifiedTestSource ? "TEST" : "",
    }));
    const currentProducts = getGlobalState("products", DEFAULT_PRODUCTS);
    const candidateMap = buildOneCProductCandidates(
      currentProducts,
      allOneCProducts
    );
    // Кандидаты для подсказок — по-прежнему «релевантные»;
    // для поиска менеджера храним полную выгрузку TEST.
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

    setGlobalState("oneCProducts", linked.oneCProducts);
    setGlobalState("oneCProductCandidates", cleanCandidateMap);
    if (linked.changed || reclassified.changed) {
      setGlobalState("products", reclassified.products);
    }

    const meta = {
      receivedAt,
      lastAutoLinkAt: receivedAt,
      lastReport: linked.report,
      candidateMap: cleanCandidateMap,
    };
    setGlobalState("oneCProductsMeta", meta);

    writeAudit({
      action: "one-c.products.receive",
      details: {
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
        cloverLink: linksByOneCId.get(item.id) || null,
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
    if (!requireOneCTestDatabase(req, res)) return;
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

    const meta = {
      receivedAt,
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
    const search = String(req.query.search || "").trim().toLocaleLowerCase("ru-RU");
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
      ? items.filter((item) => `${item.name} ${item.code} ${item.id} ${item.inn} ${item.phone} ${item.email}`
          .toLocaleLowerCase("ru-RU").includes(search))
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
      testMode: true,
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
        ? "Проверка пройдена. Нажмите «Передать в 1С TEST»."
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

    const previous = normalizeExchangeState(stored.payload.exchange);
    if (previous.status === "sending" && !isOneCClaimExpired(previous)) {
      return res.status(409).json({
        error:
          "Заказ уже выдан 1С TEST и ожидает ACK. Нельзя снова поставить в очередь, пока идёт передача. Дождитесь подтверждения 1С.",
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
      attempts: previous.attempts + 1,
      checkedAt: attemptedAt,
      lastAttemptAt: attemptedAt,
      sentAt: validation.ready ? "" : previous.sentAt,
      receipt: validation.ready ? "" : previous.receipt,
      remoteDocument: validation.ready ? null : previous.remoteDocument,
      channel: validation.ready ? "onec-pull" : previous.channel,
      message: validation.ready
        ? "Заказ поставлен в очередь. Теперь в 1С TEST нажмите «Получить тестовый заказ из Clover»."
        : validation.issues.join(" "),
    };
    const order = updateOrderPayload(stored.id, {
      ...stored.payload,
      exchange,
      updatedAt: attemptedAt,
    });

    auditFromRequest(req, validation.ready ? "exchange.send.test" : "exchange.send.error", {
      orderId: order.id,
      orderNumber: order.number,
      queued: validation.ready,
      issues: validation.issues,
      attempts: exchange.attempts,
    });

    res.status(validation.ready ? 200 : 422).json({
      ok: validation.ready,
      error: validation.ready ? undefined : validation.issues.join(" "),
      order,
      validation,
      exchange,
      testMode: true,
      queued: validation.ready,
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
    if (previous.status === "sending" && !isOneCClaimExpired(previous)) {
      return res.status(409).json({
        error:
          "Заказ уже выдан 1С TEST и ожидает ACK. Сброс заблокирован, пока активен claim. Дождитесь подтверждения или истечения lease.",
        code: "ONEC_CLAIM_ACTIVE",
      });
    }

    if (!canReturnOrderToOneCQueue(stored.payload)) {
      return res.status(409).json({
        error:
          previous.status === "draft"
            ? "У заказа уже есть черновик в 1С. Сброс заблокирован для защиты от дубля."
            : "Заказ уже подтверждён уникальным документом 1С. Сброс заблокирован для защиты от дубля.",
        code:
          previous.status === "draft"
            ? "ONEC_DRAFT_LOCKED"
            : "ONEC_SENT_LOCKED",
      });
    }
    const exchange = {
      ...previous,
      status: "not_sent",
      checkedAt: "",
      lastAttemptAt: "",
      sentAt: "",
      receipt: "",
      remoteDocument: null,
      channel: "",
      message: "Статус передачи сброшен менеджером.",
    };
    const order = updateOrderPayload(stored.id, {
      ...stored.payload,
      exchange,
      updatedAt: new Date().toISOString(),
    });

    auditFromRequest(req, "exchange.reset", {
      orderId: order.id,
      orderNumber: order.number,
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
  auditFromRequest(req, "client.approval", { clientId: user.id, status });
  if (["approved", "rejected"].includes(status)) {
    markManagerNotificationsReadBySource("client_registration", user.id);
  }
  let mail = { sent: false };
  if (["approved", "rejected"].includes(status) && user.email) {
    try {
      mail = await sendCloverMail({ to: user.email, ...approvalEmail({ approved: status === "approved" }) });
    } catch (mailError) {
      console.error("Approval email error", mailError);
    }
  }
  res.json({
    ok: true,
    user: publicUser(user),
    clients: listClients(),
    mail: { sent: Boolean(mail.sent) },
    managerNotifications: listManagerNotifications({ limit: 100 }),
  });
});

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
