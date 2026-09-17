/**
 * Feature-scoped GET /api/bootstrap projection.
 * Closed collections stay present as empty arrays/objects. Secrets never included.
 */
import {
  ROLES,
  normalizeRole,
} from "./roles.js";
import { DEFAULT_SETTINGS } from "./defaults.js";
import { staffAllowsFeature, MANAGER_SETTINGS_ALLOWLIST } from "./staffPolicy.js";
import {
  projectManagerNotifications,
  projectManagerNotificationStatus,
} from "./staffNotifications.js";

const ORDER_PRODUCT_REF_KEYS = Object.freeze([
  "id",
  "name",
  "article",
  "category",
  "subcategory",
  "active",
  "saleUnits",
  "packSize",
  "pieceSize",
  "bundleSize",
  "imageUrl",
  "unit",
]);

const SAFE_MANAGER_SETTINGS_KEYS = Object.freeze([
  "showPrices",
  "allowCustomItems",
  "allowClientEdit",
  "allowClientDelete",
  "allowRepeatOrder",
  "requireProfile",
  "requireAddress",
  "managerCanDeleteOrders",
  "showFavorites",
  "enableDrafts",
  "managerNotificationsEnabled",
  "managerNotifyNewOrders",
  "managerNotifyOrderChanges",
  "managerNotifyCustomItems",
  "managerNotifyReconciliation",
  "managerNotifyRegistrations",
  "managerNotifyOneCErrors",
  "managerNotifyPush",
]);

const EMPTY_CATALOG_POLICY = Object.freeze({
  matrixMode: "selected",
  allowFullCatalog: false,
  matrixReady: true,
  matrixProductIds: [],
});

const STAFF_CATALOG_POLICY = Object.freeze({
  matrixMode: "all",
  allowFullCatalog: true,
  matrixReady: true,
  matrixProductIds: [],
});

function pickKeys(source, keys) {
  const out = {};
  const src = source && typeof source === "object" ? source : {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(src, key)) out[key] = src[key];
  }
  return out;
}

function projectOrderProductRefs(products) {
  return (Array.isArray(products) ? products : []).map((product) =>
    pickKeys(product, ORDER_PRODUCT_REF_KEYS)
  );
}

function projectManagerSettings(settings, user) {
  const merged = { ...DEFAULT_SETTINGS, ...(settings && typeof settings === "object" ? settings : {}) };
  if (normalizeRole(user?.role) === ROLES.ADMIN) return merged;
  if (staffAllowsFeature(user, "settings")) {
    return pickKeys(merged, MANAGER_SETTINGS_ALLOWLIST);
  }
  return pickKeys(merged, SAFE_MANAGER_SETTINGS_KEYS);
}

export function projectStaffBootstrap({
  user,
  products = [],
  settings = {},
  clientLinks = {},
  clients = [],
  orders = [],
  trashedOrders = [],
  reconciliationRequests = [],
  managerNotifications = [],
  oneCPriceTypes = [],
  catalogPricesVersion = "",
  services = {},
}) {
  const admin = normalizeRole(user?.role) === ROLES.ADMIN;
  const allowOrders = admin || staffAllowsFeature(user, "orders");
  const allowProducts = admin || staffAllowsFeature(user, "products");
  const allowClients = admin || staffAllowsFeature(user, "clients");
  const allowActs = admin || staffAllowsFeature(user, "acts");
  const allowExchange = admin || staffAllowsFeature(user, "exchange");

  let projectedProducts = [];
  if (allowProducts) {
    projectedProducts = products;
  } else if (allowOrders) {
    projectedProducts = projectOrderProductRefs(products);
  }

  const mail = services.mail && typeof services.mail === "object"
    ? { configured: Boolean(services.mail.configured), from: String(services.mail.from || "") }
    : { configured: false, from: "" };
  const push = services.push && typeof services.push === "object"
    ? { enabled: Boolean(services.push.enabled), publicKey: services.push.enabled ? String(services.push.publicKey || "") : "" }
    : { enabled: false, publicKey: "" };

  return {
    user,
    products: projectedProducts,
    catalogPolicy: allowProducts || allowOrders ? { ...STAFF_CATALOG_POLICY } : { ...EMPTY_CATALOG_POLICY },
    catalogPricesVersion: String(catalogPricesVersion || ""),
    orders: allowOrders ? orders : [],
    trashedOrders: allowOrders ? trashedOrders : [],
    profile: {},
    addresses: [],
    favorites: [],
    settings: projectManagerSettings(settings, user),
    clientLinks: allowClients ? clientLinks : {},
    clients: allowClients ? clients : [],
    reconciliationRequests: allowActs ? reconciliationRequests : [],
    managerNotifications: projectManagerNotifications(user, managerNotifications),
    oneCPriceTypes: allowExchange || allowProducts ? oneCPriceTypes : [],
    services: {
      mail,
      push,
      managerNotifications: projectManagerNotificationStatus(user, settings),
    },
  };
}
