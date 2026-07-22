import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  writeAudit,
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
  build1CPayload,
  normalizeExchangeState,
  payloadToCsv,
  summarizeExchange,
  validateOrderFor1C,
} from "./exchange.js";
import {
  DEFAULT_ONE_C_CONFIG,
  createOneCDraft,
  previewOneCCatalog,
  publicOneCStatus,
  sanitizeOneCConfig,
  testOneCConnection,
} from "./oneC.js";

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
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";
const jwtSecret =
  process.env.JWT_SECRET ||
  "clover-local-development-secret-change-before-production";

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: false,
  })
);
app.use(express.json({ limit: "8mb" }));
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

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
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

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      error: "Сессия истекла. Войдите снова.",
    });
  }
}

function roleRequired(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
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

const registerSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(50),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});


function normalizeClientLink(value) {
  const link = value && typeof value === "object" ? value : {};

  return {
    ...EMPTY_LINK,
    ...link,
    matrixProductIds: Array.isArray(link.matrixProductIds)
      ? link.matrixProductIds
      : [],
    allowFullCatalog: Boolean(link.allowFullCatalog),
    personalPrices:
      link.personalPrices &&
      typeof link.personalPrices === "object"
        ? link.personalPrices
        : {},
  };
}

function readPersonalPrice(priceConfig, unit) {
  const value = priceConfig?.[unit];

  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? Math.max(0, numericValue)
    : null;
}

function applyClientPrices(product, link, isMatrixProduct) {
  const priceConfig =
    link.personalPrices?.[String(product.id)] ||
    link.personalPrices?.[product.id] ||
    {};

  const piecePrice = readPersonalPrice(priceConfig, "piece");
  const packPrice = readPersonalPrice(priceConfig, "pack");
  const bundlePrice = readPersonalPrice(priceConfig, "bundle");
  const source = priceConfig.source || "manual";

  return {
    ...product,
    isMatrixProduct,
    basePricePiece: Number(product.pricePiece) || 0,
    basePricePack: Number(product.pricePack) || 0,
    basePriceBundle: Number(product.priceBundle) || 0,
    pricePiece:
      piecePrice === null
        ? Number(product.pricePiece) || 0
        : piecePrice,
    pricePack:
      packPrice === null
        ? Number(product.pricePack) || 0
        : packPrice,
    priceBundle:
      bundlePrice === null
        ? Number(product.priceBundle) || 0
        : bundlePrice,
    priceSources: {
      piece:
        piecePrice === null
          ? Number(product.pricePiece) > 0
            ? "base"
            : "unspecified"
          : source,
      pack:
        packPrice === null
          ? Number(product.pricePack) > 0
            ? "base"
            : "unspecified"
          : source,
      bundle:
        bundlePrice === null
          ? Number(product.priceBundle) > 0
            ? "base"
            : "unspecified"
          : source,
    },
  };
}

function resolveClientCatalog(products, rawLink) {
  const link = normalizeClientLink(rawLink);
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

  return {
    link,
    matrixProducts: matrixProducts.map((product) =>
      applyClientPrices(product, link, true)
    ),
    fullCatalogProducts: fullCatalog.map((product) =>
      applyClientPrices(
        product,
        link,
        matrixIds.has(String(product.id))
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

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "clover-server", version: "1.9.0",
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
      profile: {
        companyName: input.companyName,
        contactName: input.contactName,
        phone: input.phone,
        email,
      },
    });

    writeAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: "auth.register",
      details: { companyName: input.companyName },
    });

    res.status(201).json({
      token: signToken(user),
      user: publicUser(user),
    });
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
        error:
          "Слишком много попыток входа. Попробуйте через несколько минут.",
      });
    }

    const user = findUserByEmail(email);

    if (
      !user ||
      !(await bcrypt.compare(
        input.password,
        user.password_hash
      ))
    ) {
      return res.status(401).json({
        error: "Неверная почта или пароль.",
      });
    }

    clearLoginLimit(email);
    writeAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: "auth.login",
      details: {},
    });

    res.json({
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", authRequired, (req, res) => {
  const products = getGlobalState(
    "products",
    DEFAULT_PRODUCTS
  );
  const settings = getGlobalState(
    "settings",
    DEFAULT_SETTINGS
  );
  const allClientLinks = getGlobalState(
    "clientLinks",
    {}
  );

  if (req.user.role === "manager") {
    const normalizedClientLinks = Object.fromEntries(
      Object.entries(allClientLinks).map(([clientId, link]) => [
        clientId,
        normalizeClientLink(link),
      ])
    );

    return res.json({
      user: publicUser(req.user),
      products,
      fullCatalogProducts: products,
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
    });
  }

  const state = getClientState(req.user.id);
  const catalog = resolveClientCatalog(
    products,
    allClientLinks[req.user.id]
  );

  return res.json({
    user: publicUser(req.user),
    products: catalog.matrixProducts,
    fullCatalogProducts: catalog.fullCatalogProducts,
    catalogPolicy: catalog.policy,
    orders: listOrders(req.user.id),
    profile: state.profile,
    addresses: state.addresses,
    favorites: state.favorites,
    settings,
    clientLinks: {
      [req.user.id]: catalog.link,
    },
    clients: [],
  });
});

app.put("/api/state/orders", authRequired, (req, res) => {
  const orders = Array.isArray(req.body?.orders)
    ? req.body.orders
    : [];

  replaceOrders({
    orders,
    userId: req.user.id,
    managerMode: req.user.role === "manager",
  });
  auditFromRequest(req, "orders.save", { count: orders.length });

  res.json({ ok: true });
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
    const products = Array.isArray(req.body?.products)
      ? req.body.products
      : DEFAULT_PRODUCTS;
    setGlobalState("products", products);
    auditFromRequest(req, "products.save", { count: products.length });

    res.json({ ok: true });
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
  "/api/state/client-links",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    const clientLinks = req.body?.clientLinks || {};
    setGlobalState("clientLinks", clientLinks);
    auditFromRequest(req, "client.matrix.save", {
      clients: Object.keys(clientLinks).length,
    });

    res.json({ ok: true });
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

    replaceOrders({
      orders: orders.map((order) => ({
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
      })),
      userId: req.user.id,
      managerMode: false,
    });

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
      setGlobalState("products", req.body.products);
    }

    if (req.body?.settings) {
      setGlobalState("settings", req.body.settings);
    }

    if (req.body?.clientLinks) {
      setGlobalState(
        "clientLinks",
        req.body.clientLinks
      );
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
    const exchange = {
      ...previous,
      status: validation.ready ? "ready" : "error",
      checkedAt: new Date().toISOString(),
      message: validation.ready
        ? "Заказ готов к тестовой передаче в 1С."
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

    const products = getGlobalState("products", DEFAULT_PRODUCTS);
    const clientLinks = getGlobalState("clientLinks", {});
    const validation = validateOrderFor1C({
      order: stored.payload,
      products,
      clientLinks,
    });
    const previous = normalizeExchangeState(stored.payload.exchange);
    const attemptedAt = new Date().toISOString();
    const receipt = validation.ready
      ? `TEST-1C-${Date.now()}-${String(stored.payload.number || stored.id).replace(/[^a-zA-Z0-9_-]/g, "")}`
      : "";
    const exchange = {
      ...previous,
      status: validation.ready ? "sent" : "error",
      attempts: previous.attempts + 1,
      checkedAt: attemptedAt,
      lastAttemptAt: attemptedAt,
      sentAt: validation.ready ? attemptedAt : previous.sentAt,
      receipt,
      message: validation.ready
        ? "Тестовая передача выполнена. Реальное подключение к 1С пока не включено."
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
      receipt,
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

  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error:
        "Проверьте заполнение полей. Пароль должен содержать не менее 8 символов.",
      details: error.issues,
    });
  }

  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "Фотография слишком большая. Максимальный размер — 5 МБ.",
    });
  }

  if (
    String(error?.message || "").includes("JPG") ||
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
  console.log("");
  console.log("Clover Server 2.2 запущен");
  console.log(`API: http://localhost:${port}/api/health`);
  console.log(
    `Менеджер: ${
      process.env.MANAGER_EMAIL || "manager@clover.local"
    }`
  );
  console.log(
    `Пароль: ${
      process.env.MANAGER_PASSWORD || "Clover123!"
    }`
  );
  console.log("");
});
