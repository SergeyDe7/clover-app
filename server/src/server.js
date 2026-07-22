import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
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
} from "./db.js";
import {
  DEFAULT_PRODUCTS,
  DEFAULT_SETTINGS,
  EMPTY_LINK,
} from "./defaults.js";

const app = express();
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
    service: "clover-server",
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
    setGlobalState(
      "products",
      Array.isArray(req.body?.products)
        ? req.body.products
        : DEFAULT_PRODUCTS
    );

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

    res.json({ ok: true });
  }
);

app.put(
  "/api/state/client-links",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
    setGlobalState(
      "clientLinks",
      req.body?.clientLinks || {}
    );

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
  "/api/admin/reset",
  authRequired,
  roleRequired("manager"),
  (req, res) => {
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

app.listen(port, host, () => {
  console.log("");
  console.log("Clover Server запущен");
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
