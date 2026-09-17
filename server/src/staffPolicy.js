/**
 * Server-side staff feature policy (S2-NEW-003/004/005).
 * Authority is JWT user id + DB user row. Body/query role/permissions are ignored.
 *
 * Notification routes (kind: "notify"): staff, not malformed. Visibility is
 * filtered by requiredFeatureForNotification (not "any tab").
 * POST /api/admin/notifications/test is admin-only.
 * Staff administration (kind: "manageStaff"): admin or explicit manageStaff:true.
 * Migrate (kind: "migrate"): staff only; body is decided solely by evaluateManagerMigrate.
 */
import {
  MORE_FEATURE_IDS,
  ROLES,
  STAFF_FEATURE_IDS,
  inspectStaffPermissions,
  isStaffRole,
  normalizeRole,
  parseStaffPermissions,
  staffCanManageStaff,
} from "./roles.js";
import { DEFAULT_SETTINGS, EMPTY_LINK } from "./defaults.js";
import { STOREFRONT_SETTING_KEYS } from "./storefrontPublic.js";

export const FEATURE_FORBIDDEN = "FEATURE_FORBIDDEN";
export const ADMIN_REQUIRED = "ADMIN_REQUIRED";
export const PERMISSION_MALFORMED = "PERMISSION_MALFORMED";
export const MIGRATE_FORBIDDEN_FIELD = "MIGRATE_FORBIDDEN_FIELD";
export const MIGRATE_PROTECTED_FIELD = "MIGRATE_PROTECTED_FIELD";
export const MIGRATE_SELF_GRANT = "MIGRATE_SELF_GRANT";

const STOREFRONT_KEY_SET = new Set(STOREFRONT_SETTING_KEYS);

export const MANAGER_SETTINGS_ALLOWLIST = Object.freeze(
  Object.keys(DEFAULT_SETTINGS).filter((key) => !STOREFRONT_KEY_SET.has(key))
);

export const MANAGER_MIGRATE_TOP_LEVEL = Object.freeze([
  "products",
  "settings",
  "clientLinks",
]);

const MIGRATE_FORBIDDEN_TOP_LEVEL = new Set([
  "users",
  "role",
  "permissions",
  "password",
  "passwordHash",
  "password_hash",
  "vault",
  "staffAccessVault",
  "clientAccessVault",
  "token",
  "apiKey",
  "secret",
  "jwt",
  "authTokens",
  "passkeys",
  "orders",
  "audit",
  "backups",
  "oneC",
  "oneCConfig",
]);

const FORBIDDEN_KEY_ALIASES = new Set([
  "role",
  "permissions",
  "fullaccess",
  "managestaff",
  "password",
  "passwordhash",
  "vault",
  "staffaccessvault",
  "clientaccessvault",
  "token",
  "resettoken",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "secret",
  "jwt",
  "privatekey",
  "prototype",
  "constructor",
  "proto",
  "auth",
]);

const PRODUCT_UNIT_KEYS = Object.freeze([
  "piece",
  "pair",
  "meter",
  "roll",
  "pack",
  "bundle",
  "box",
]);

export const PRODUCT_MIGRATE_ALLOWLIST = Object.freeze([
  "id",
  "name",
  "code",
  "category",
  "subcategory",
  "group",
  "facet",
  "cloverCategory",
  "inferredCategory",
  "packSize",
  "pieceSize",
  "bundleSize",
  "boxSize",
  "pairSize",
  "meterSize",
  "rollSize",
  "pieceOrderMultiple",
  "saleUnits",
  "active",
  "showOnStorefront",
  "article",
  "sku",
  "barcode",
  "oneCId",
  "oneCCode",
  "oneCName",
  "oneCArticle",
  "oneCInn",
  "oneCMatchCode",
  "oneCMatchName",
  "oneCMatchInn",
  "oneCMatchPhone",
  "oneCMatchEmail",
  "oneCSearchQuery",
  "oneCSearchRequestedAt",
  "oneCLinkMode",
  "oneCLinkedAt",
  "imageUrl",
  "imageUpdatedAt",
  "certificateUrl",
  "certificateName",
  "certificateUpdatedAt",
  "description",
  "unit",
  "notes",
  "sortOrder",
  "createdAt",
  "updatedAt",
  "pricePiece",
  "pricePack",
  "priceBundle",
  "priceBox",
  "pricePair",
  "priceMeter",
  "priceRoll",
  "basePricePiece",
  "basePricePack",
  "basePriceBundle",
  "basePriceBox",
  "basePricePair",
  "basePriceMeter",
  "basePriceRoll",
  "storefrontDetails",
  "storefrontPricing",
  "purchasePrices",
  "purchasePriceUpdatedAt",
  "purchasePriceReceivedAt",
  "purchasePriceSourceUpdatedAt",
  "purchasePriceSourceDatabase",
  "purchasePriceUnit",
  "purchasePriceAvailable",
  "salePricesByType",
  "salePriceReceivedAt",
  "clientPriceMode",
  "clientPriceOverrideMode",
  "markupPercent",
  "defaultPricingMode",
  "defaultMarkupPercent",
  "oneCPriceTypeId",
  "priceSources",
  "isMatrixProduct",
]);

const STOREFRONT_DETAILS_KEYS = Object.freeze([
  "description",
  "composition",
  "characteristics",
]);
const STOREFRONT_PRICING_KEYS = Object.freeze(["source", ...PRODUCT_UNIT_KEYS]);

export const CLIENT_LINK_MIGRATE_ALLOWLIST = Object.freeze(Object.keys(EMPTY_LINK));

const DELIVERY_ZONE_KEYS = Object.freeze(["id", "name", "enabled", "freeFrom", "fee"]);
const HERO_SLIDE_KEYS = Object.freeze(["src", "alt", "href", "buttonLabel"]);
const PROMO_KEYS = Object.freeze([
  "id",
  "enabled",
  "showOnHome",
  "imageUrl",
  "title",
  "shortText",
  "fullDescription",
  "link",
  "buttonText",
  "startsAt",
  "endsAt",
  "sortOrder",
]);
const INFO_PAGE_KEYS = Object.freeze([
  "heading",
  "title",
  "description",
  "blocks",
  "updatedAt",
]);
const INFO_BLOCK_KEYS = Object.freeze(["type", "text", "items", "label", "route"]);

function deny(code, error) {
  return { allow: false, code, error };
}

function allow() {
  return { allow: true, code: null, error: null };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKeyToken(key) {
  return String(key || "")
    .replace(/^__+|__+$/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

export function isForbiddenMigrateKey(key) {
  const raw = String(key || "");
  if (raw === "__proto__" || raw === "prototype" || raw === "constructor") return true;
  return FORBIDDEN_KEY_ALIASES.has(normalizeKeyToken(raw));
}

function collectForbiddenKeys(value, hits) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectForbiddenKeys(item, hits);
    return;
  }
  for (const key of Object.keys(value)) {
    if (isForbiddenMigrateKey(key)) hits.push(key);
    collectForbiddenKeys(value[key], hits);
  }
}

function extraObjectKeys(value, allowlist) {
  if (!isPlainObject(value)) return ["<not-object>"];
  const allow = new Set(allowlist);
  return Object.keys(value).filter((key) => !allow.has(key));
}

function migrateReject(status, code, error, fields) {
  return {
    ok: false,
    status,
    code,
    error,
    ...(fields && fields.length ? { fields } : {}),
  };
}

export function evaluateStaffFeature(user, featureId) {
  const id = String(featureId || "").trim();
  const role = normalizeRole(user?.role);
  if (!id) return deny(FEATURE_FORBIDDEN, "Недостаточно прав для этого действия.");
  if (id === "storefront" || id === "languages") {
    return role === ROLES.ADMIN
      ? allow()
      : deny(ADMIN_REQUIRED, "Недостаточно прав для этого действия.");
  }
  if (id !== "more" && !STAFF_FEATURE_IDS.includes(id)) {
    return deny(FEATURE_FORBIDDEN, "Недостаточно прав для этого действия.");
  }
  if (role === ROLES.ADMIN) return allow();
  if (role !== ROLES.MANAGER) {
    return deny(FEATURE_FORBIDDEN, "Недостаточно прав для этого действия.");
  }

  const inspected = inspectStaffPermissions(
    user?.permissions_json ?? user?.permissions
  );
  if (inspected.malformed) {
    return deny(
      PERMISSION_MALFORMED,
      "Некорректные права доступа. Обратитесь к администратору."
    );
  }
  const permissions = parseStaffPermissions(inspected.source);
  if (permissions.malformed) {
    return deny(
      PERMISSION_MALFORMED,
      "Некорректные права доступа. Обратитесь к администратору."
    );
  }
  const tabs = Array.isArray(permissions.tabs) ? permissions.tabs : [];
  if (id === "more") {
    return MORE_FEATURE_IDS.some((item) => tabs.includes(item))
      ? allow()
      : deny(FEATURE_FORBIDDEN, "Недостаточно прав для этого действия.");
  }
  return tabs.includes(id)
    ? allow()
    : deny(FEATURE_FORBIDDEN, "Недостаточно прав для этого действия.");
}

export function staffAllowsFeature(user, featureId) {
  return evaluateStaffFeature(user, featureId).allow === true;
}

/**
 * Exact Express route templates. Missing manager routes fail closed.
 * kind: feature | admin | manageStaff | notify | migrate
 */
export const STAFF_ROUTE_POLICIES = Object.freeze([
  { method: "POST", path: "/api/admin/managers", kind: "manageStaff" },
  { method: "GET", path: "/api/admin/staff", kind: "manageStaff" },
  { method: "POST", path: "/api/admin/users/:userId/role", kind: "manageStaff" },
  { method: "POST", path: "/api/admin/staff/:userId/password", kind: "manageStaff" },
  { method: "PATCH", path: "/api/admin/staff/:userId/access", kind: "manageStaff" },
  { method: "PATCH", path: "/api/admin/staff/:userId/permissions", kind: "manageStaff" },
  { method: "PATCH", path: "/api/admin/staff/:userId/contacts", kind: "manageStaff" },
  { method: "DELETE", path: "/api/admin/staff/:userId", kind: "manageStaff" },

  { method: "POST", path: "/api/admin/orders/:orderId/restore", kind: "feature", feature: "orders" },
  { method: "DELETE", path: "/api/admin/orders/:orderId", kind: "feature", feature: "orders" },
  { method: "PATCH", path: "/api/orders/:orderId/status", kind: "feature", feature: "orders" },
  { method: "POST", path: "/api/orders/status/bulk", kind: "feature", feature: "orders" },

  { method: "PUT", path: "/api/state/products", kind: "feature", feature: "products" },
  { method: "POST", path: "/api/admin/products/:productId/image", kind: "feature", feature: "products" },
  { method: "DELETE", path: "/api/admin/products/:productId/image", kind: "feature", feature: "products" },
  { method: "POST", path: "/api/admin/products", kind: "feature", feature: "products" },
  { method: "PUT", path: "/api/admin/products/:productId", kind: "feature", feature: "products" },
  { method: "DELETE", path: "/api/admin/products/:productId", kind: "feature", feature: "products" },
  { method: "POST", path: "/api/admin/products/:productId/certificate", kind: "feature", feature: "products" },
  { method: "DELETE", path: "/api/admin/products/:productId/certificate", kind: "feature", feature: "products" },
  { method: "POST", path: "/api/admin/products/:productId/enrich", kind: "feature", feature: "products" },
  { method: "GET", path: "/api/admin/one-c/products", kind: "feature", feature: "products" },
  { method: "POST", path: "/api/admin/one-c/products/from-catalog", kind: "feature", feature: "products" },
  { method: "POST", path: "/api/admin/one-c/products/match-import", kind: "feature", feature: "products" },
  { method: "GET", path: "/api/admin/one-c/products/:productId/candidates", kind: "feature", feature: "products" },
  { method: "POST", path: "/api/admin/one-c/products/:productId/request", kind: "feature", feature: "products" },
  { method: "POST", path: "/api/admin/one-c/products/:productId/link", kind: "feature", feature: "products" },
  { method: "POST", path: "/api/admin/one-c/products/auto-link", kind: "feature", feature: "products" },

  { method: "GET", path: "/api/admin/clients/:clientId/matrix-prices", kind: "feature", feature: "clients" },
  { method: "PUT", path: "/api/admin/clients/:clientId", kind: "feature", feature: "clients" },
  { method: "PUT", path: "/api/state/client-links", kind: "feature", feature: "clients" },
  { method: "PATCH", path: "/api/admin/clients/:clientId/approval", kind: "feature", feature: "clients" },
  { method: "POST", path: "/api/admin/clients", kind: "feature", feature: "clients" },
  { method: "POST", path: "/api/admin/clients/:clientId/password", kind: "feature", feature: "clients" },
  { method: "DELETE", path: "/api/admin/clients/:clientId", kind: "feature", feature: "clients" },
  { method: "GET", path: "/api/admin/one-c/clients", kind: "feature", feature: "clients" },
  { method: "GET", path: "/api/admin/one-c/clients/:clientId/candidates", kind: "feature", feature: "clients" },
  { method: "POST", path: "/api/admin/one-c/clients/:clientId/link", kind: "feature", feature: "clients" },
  { method: "POST", path: "/api/admin/one-c/clients/auto-link", kind: "feature", feature: "clients" },

  { method: "GET", path: "/api/admin/one-c/config", kind: "feature", feature: "exchange" },
  { method: "PUT", path: "/api/admin/one-c/config", kind: "feature", feature: "exchange" },
  { method: "POST", path: "/api/admin/one-c/test", kind: "feature", feature: "exchange" },
  { method: "GET", path: "/api/admin/one-c/preview/:type", kind: "feature", feature: "exchange" },
  { method: "POST", path: "/api/admin/one-c/orders/:orderId/draft", kind: "feature", feature: "exchange" },
  { method: "GET", path: "/api/admin/exchange", kind: "feature", feature: "exchange" },
  { method: "POST", path: "/api/admin/exchange/orders/:orderId/check", kind: "feature", feature: "exchange" },
  { method: "POST", path: "/api/admin/exchange/orders/:orderId/send", kind: "feature", feature: "exchange" },
  { method: "POST", path: "/api/admin/exchange/orders/:orderId/reset", kind: "feature", feature: "exchange" },
  { method: "GET", path: "/api/admin/exchange/orders/:orderId/download", kind: "feature", feature: "exchange" },
  { method: "GET", path: "/api/admin/exchange/batch/download", kind: "feature", feature: "exchange" },

  { method: "PATCH", path: "/api/admin/reconciliation/:requestId", kind: "feature", feature: "acts" },
  { method: "POST", path: "/api/admin/reconciliation/:requestId/file", kind: "feature", feature: "acts" },

  { method: "GET", path: "/api/admin/client-access", kind: "feature", feature: "access" },
  { method: "DELETE", path: "/api/admin/client-access/:clientId", kind: "feature", feature: "access" },

  { method: "PUT", path: "/api/state/settings", kind: "feature", feature: "settings" },
  { method: "POST", path: "/api/admin/push/promotion", kind: "feature", feature: "settings" },

  { method: "GET", path: "/api/admin/backups", kind: "admin" },
  { method: "POST", path: "/api/admin/backups", kind: "admin" },
  { method: "POST", path: "/api/admin/backups/cleanup", kind: "admin" },
  { method: "GET", path: "/api/admin/backups/:fileName/download", kind: "admin" },
  { method: "POST", path: "/api/admin/backups/:fileName/restore", kind: "admin" },
  { method: "POST", path: "/api/admin/reset", kind: "admin" },

  { method: "GET", path: "/api/admin/audit", kind: "feature", feature: "audit" },

  { method: "GET", path: "/api/admin/notifications", kind: "notify" },
  { method: "PATCH", path: "/api/admin/notifications/:notificationId/read", kind: "notify" },
  { method: "POST", path: "/api/admin/notifications/read-all", kind: "notify" },
  { method: "POST", path: "/api/admin/notifications/test", kind: "admin" },

  { method: "POST", path: "/api/migrate/manager", kind: "migrate" },
]);

const POLICY_BY_KEY = new Map(
  STAFF_ROUTE_POLICIES.map((item) => [
    `${item.method.toUpperCase()} ${item.path}`,
    item,
  ])
);

export function lookupStaffRoutePolicy(method, routePath) {
  if (!method || !routePath) return null;
  return POLICY_BY_KEY.get(`${String(method).toUpperCase()} ${routePath}`) || null;
}

export function applyStaffRoutePolicy(req) {
  const routePath = req.route?.path;
  const policy = lookupStaffRoutePolicy(req.method, routePath);
  if (!policy) {
    return deny(
      FEATURE_FORBIDDEN,
      "Недостаточно прав для этого действия."
    );
  }
  if (policy.kind === "manageStaff") {
    return staffCanManageStaff(req.user)
      ? allow()
      : deny(FEATURE_FORBIDDEN, "Недостаточно прав для этого действия.");
  }
  if (policy.kind === "notify") {
    if (!isStaffRole(req.user?.role)) {
      return deny(FEATURE_FORBIDDEN, "Недостаточно прав для этого действия.");
    }
    const inspected = inspectStaffPermissions(
      req.user?.permissions_json ?? req.user?.permissions
    );
    if (inspected.malformed) {
      return deny(
        PERMISSION_MALFORMED,
        "Некорректные права доступа. Обратитесь к администратору."
      );
    }
    return allow();
  }
  if (policy.kind === "migrate") {
    if (!isStaffRole(req.user?.role)) {
      return deny(FEATURE_FORBIDDEN, "Недостаточно прав для этого действия.");
    }
    const inspected = inspectStaffPermissions(
      req.user?.permissions_json ?? req.user?.permissions
    );
    if (inspected.malformed) {
      return deny(
        PERMISSION_MALFORMED,
        "Некорректные права доступа. Обратитесь к администратору."
      );
    }
    return allow();
  }
  if (policy.kind === "admin") {
    return normalizeRole(req.user?.role) === ROLES.ADMIN
      ? allow()
      : deny(ADMIN_REQUIRED, "Недостаточно прав для этого действия.");
  }
  if (policy.kind === "feature") {
    return evaluateStaffFeature(req.user, policy.feature);
  }
  return deny(FEATURE_FORBIDDEN, "Недостаточно прав для этого действия.");
}

export function featureRequired(featureId) {
  return (req, res, next) => {
    const decision = evaluateStaffFeature(req.user, featureId);
    if (!decision.allow) {
      return res.status(403).json({
        error: decision.error,
        code: decision.code,
      });
    }
    next();
  };
}

export function adminRequired() {
  return (req, res, next) => {
    if (normalizeRole(req.user?.role) !== ROLES.ADMIN) {
      return res.status(403).json({
        error: "Недостаточно прав для этого действия.",
        code: ADMIN_REQUIRED,
      });
    }
    next();
  };
}

function validateUnitPriceMap(value, prefix) {
  const fields = [];
  if (!isPlainObject(value)) {
    fields.push(prefix);
    return fields;
  }
  const extra = extraObjectKeys(value, PRODUCT_UNIT_KEYS);
  extra.forEach((key) => fields.push(`${prefix}.${key}`));
  for (const [key, price] of Object.entries(value)) {
    if (isForbiddenMigrateKey(key)) fields.push(`${prefix}.${key}`);
    if (price && typeof price === "object") fields.push(`${prefix}.${key}`);
  }
  return fields;
}

function validateProductItem(product, index) {
  if (!isPlainObject(product)) {
    return [`products[${index}]`];
  }
  const prefix = `products[${index}]`;
  const fields = extraObjectKeys(product, PRODUCT_MIGRATE_ALLOWLIST).map(
    (key) => `${prefix}.${key}`
  );
  if (Object.prototype.hasOwnProperty.call(product, "storefrontDetails")) {
    if (!isPlainObject(product.storefrontDetails)) {
      fields.push(`${prefix}.storefrontDetails`);
    } else {
      extraObjectKeys(product.storefrontDetails, STOREFRONT_DETAILS_KEYS).forEach((key) => {
        fields.push(`${prefix}.storefrontDetails.${key}`);
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(product, "storefrontPricing")) {
    if (!isPlainObject(product.storefrontPricing)) {
      fields.push(`${prefix}.storefrontPricing`);
    } else {
      extraObjectKeys(product.storefrontPricing, STOREFRONT_PRICING_KEYS).forEach((key) => {
        fields.push(`${prefix}.storefrontPricing.${key}`);
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(product, "purchasePrices")) {
    fields.push(...validateUnitPriceMap(product.purchasePrices, `${prefix}.purchasePrices`));
  }
  if (Object.prototype.hasOwnProperty.call(product, "priceSources")) {
    if (!isPlainObject(product.priceSources)) {
      fields.push(`${prefix}.priceSources`);
    } else {
      for (const [key, value] of Object.entries(product.priceSources)) {
        if (isForbiddenMigrateKey(key)) fields.push(`${prefix}.priceSources.${key}`);
        if (value && typeof value === "object") {
          extraObjectKeys(value, PRODUCT_UNIT_KEYS).forEach((nested) => {
            fields.push(`${prefix}.priceSources.${key}.${nested}`);
          });
        }
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(product, "salePricesByType")) {
    if (!isPlainObject(product.salePricesByType)) {
      fields.push(`${prefix}.salePricesByType`);
    } else {
      for (const [typeId, prices] of Object.entries(product.salePricesByType)) {
        if (isForbiddenMigrateKey(typeId)) {
          fields.push(`${prefix}.salePricesByType.${typeId}`);
          continue;
        }
        if (prices && typeof prices === "object") {
          fields.push(...validateUnitPriceMap(prices, `${prefix}.salePricesByType.${typeId}`));
        } else if (prices != null && typeof prices !== "number" && typeof prices !== "string") {
          fields.push(`${prefix}.salePricesByType.${typeId}`);
        }
      }
    }
  }
  return fields;
}

function validateClientLinkEntry(clientId, link) {
  if (!isPlainObject(link)) return [`clientLinks.${clientId}`];
  const extra = extraObjectKeys(link, CLIENT_LINK_MIGRATE_ALLOWLIST);
  const fields = extra.map((key) => `clientLinks.${clientId}.${key}`);
  if (Object.prototype.hasOwnProperty.call(link, "personalPrices")) {
    if (!isPlainObject(link.personalPrices)) {
      fields.push(`clientLinks.${clientId}.personalPrices`);
    } else {
      for (const [pid, price] of Object.entries(link.personalPrices)) {
        if (isForbiddenMigrateKey(pid)) fields.push(`clientLinks.${clientId}.personalPrices.${pid}`);
        if (price && typeof price === "object") {
          fields.push(`clientLinks.${clientId}.personalPrices.${pid}`);
        }
      }
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(link, "matrixProductIds") &&
    !Array.isArray(link.matrixProductIds)
  ) {
    fields.push(`clientLinks.${clientId}.matrixProductIds`);
  }
  return fields;
}

function validateSettingsNested(settings) {
  const fields = [];
  if (Object.prototype.hasOwnProperty.call(settings, "deliveryZones")) {
    if (!Array.isArray(settings.deliveryZones)) {
      fields.push("settings.deliveryZones");
    } else {
      settings.deliveryZones.forEach((zone, index) => {
        if (!isPlainObject(zone)) {
          fields.push(`settings.deliveryZones[${index}]`);
          return;
        }
        extraObjectKeys(zone, DELIVERY_ZONE_KEYS).forEach((key) => {
          fields.push(`settings.deliveryZones[${index}].${key}`);
        });
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(settings, "storefrontHeroSlides")) {
    if (!Array.isArray(settings.storefrontHeroSlides)) {
      fields.push("settings.storefrontHeroSlides");
    } else {
      settings.storefrontHeroSlides.forEach((slide, index) => {
        if (!isPlainObject(slide)) {
          fields.push(`settings.storefrontHeroSlides[${index}]`);
          return;
        }
        extraObjectKeys(slide, HERO_SLIDE_KEYS).forEach((key) => {
          fields.push(`settings.storefrontHeroSlides[${index}].${key}`);
        });
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(settings, "storefrontPromotions")) {
    if (!Array.isArray(settings.storefrontPromotions)) {
      fields.push("settings.storefrontPromotions");
    } else {
      settings.storefrontPromotions.forEach((promo, index) => {
        if (!isPlainObject(promo)) {
          fields.push(`settings.storefrontPromotions[${index}]`);
          return;
        }
        extraObjectKeys(promo, PROMO_KEYS).forEach((key) => {
          fields.push(`settings.storefrontPromotions[${index}].${key}`);
        });
      });
    }
  }
  if (Object.prototype.hasOwnProperty.call(settings, "storefrontInfoPages")) {
    if (!isPlainObject(settings.storefrontInfoPages)) {
      fields.push("settings.storefrontInfoPages");
    } else {
      for (const [slug, page] of Object.entries(settings.storefrontInfoPages)) {
        if (isForbiddenMigrateKey(slug)) fields.push(`settings.storefrontInfoPages.${slug}`);
        if (!isPlainObject(page)) {
          fields.push(`settings.storefrontInfoPages.${slug}`);
          continue;
        }
        extraObjectKeys(page, INFO_PAGE_KEYS).forEach((key) => {
          fields.push(`settings.storefrontInfoPages.${slug}.${key}`);
        });
        if (Array.isArray(page.blocks)) {
          page.blocks.forEach((block, index) => {
            if (!isPlainObject(block)) {
              fields.push(`settings.storefrontInfoPages.${slug}.blocks[${index}]`);
              return;
            }
            extraObjectKeys(block, INFO_BLOCK_KEYS).forEach((key) => {
              fields.push(`settings.storefrontInfoPages.${slug}.blocks[${index}].${key}`);
            });
          });
        } else if (page.blocks != null) {
          fields.push(`settings.storefrontInfoPages.${slug}.blocks`);
        }
      }
    }
  }
  return fields;
}

export function evaluateManagerMigrate({ user, body }) {
  if (!isStaffRole(user?.role)) {
    return {
      ok: false,
      status: 403,
      code: FEATURE_FORBIDDEN,
      error: "Недостаточно прав для этого действия.",
    };
  }
  const payload = isPlainObject(body) ? body : {};
  const keys = Object.keys(payload);
  const forbidden = keys.filter((key) => MIGRATE_FORBIDDEN_TOP_LEVEL.has(key) || isForbiddenMigrateKey(key));
  if (forbidden.length) {
    const selfGrant = forbidden.some((key) =>
      ["role", "permissions", "users", "password", "passwordHash"].includes(key)
    );
    return migrateReject(
      selfGrant ? 403 : 422,
      selfGrant ? MIGRATE_SELF_GRANT : MIGRATE_FORBIDDEN_FIELD,
      "Импорт содержит запрещённые поля.",
      forbidden
    );
  }
  const unknown = keys.filter((key) => !MANAGER_MIGRATE_TOP_LEVEL.includes(key));
  if (unknown.length) {
    return migrateReject(
      422,
      MIGRATE_FORBIDDEN_FIELD,
      "Импорт содержит неизвестные поля.",
      unknown
    );
  }

  const nestedForbidden = [];
  collectForbiddenKeys(payload, nestedForbidden);
  if (nestedForbidden.length) {
    const unique = [...new Set(nestedForbidden)];
    const selfGrant = unique.some((key) =>
      ["role", "permissions", "password", "passwordHash", "fullAccess", "manageStaff"].includes(
        key
      ) || isForbiddenMigrateKey(key)
    );
    return migrateReject(
      selfGrant ? 403 : 422,
      selfGrant ? MIGRATE_SELF_GRANT : MIGRATE_FORBIDDEN_FIELD,
      "Импорт содержит запрещённые вложенные поля.",
      unique
    );
  }

  const isAdmin = normalizeRole(user?.role) === ROLES.ADMIN;
  const plan = { products: false, settings: null, clientLinks: false };

  if (Object.prototype.hasOwnProperty.call(payload, "products")) {
    if (!Array.isArray(payload.products)) {
      return migrateReject(422, MIGRATE_FORBIDDEN_FIELD, "Поле products должно быть массивом.");
    }
    const productExtra = payload.products.flatMap((item, index) => validateProductItem(item, index));
    if (productExtra.length) {
      return migrateReject(
        422,
        MIGRATE_FORBIDDEN_FIELD,
        "Импорт товаров содержит недопустимые поля.",
        productExtra
      );
    }
    if (payload.products.length) {
      const gate = evaluateStaffFeature(user, "products");
      if (!gate.allow) {
        return {
          ok: false,
          status: 403,
          code: gate.code,
          error: gate.error,
        };
      }
      plan.products = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "settings")) {
    if (!isPlainObject(payload.settings)) {
      return migrateReject(422, MIGRATE_FORBIDDEN_FIELD, "Поле settings должно быть объектом.");
    }
    const settingKeys = Object.keys(payload.settings);
    if (settingKeys.length) {
      const gate = evaluateStaffFeature(user, "settings");
      if (!gate.allow) {
        return {
          ok: false,
          status: 403,
          code: gate.code,
          error: gate.error,
        };
      }
      const protectedHits = settingKeys.filter((key) => STOREFRONT_KEY_SET.has(key));
      if (protectedHits.length && !isAdmin) {
        return migrateReject(
          403,
          MIGRATE_PROTECTED_FIELD,
          "Менеджер не может импортировать поля витрины и административные настройки.",
          protectedHits
        );
      }
      const allow = new Set(
        isAdmin ? Object.keys(DEFAULT_SETTINGS) : MANAGER_SETTINGS_ALLOWLIST
      );
      const extra = settingKeys.filter((key) => !allow.has(key));
      if (extra.length) {
        return migrateReject(
          422,
          MIGRATE_FORBIDDEN_FIELD,
          "Импорт настроек содержит недопустимые поля.",
          extra
        );
      }
      const nested = validateSettingsNested(payload.settings);
      if (nested.length) {
        return migrateReject(
          422,
          MIGRATE_FORBIDDEN_FIELD,
          "Импорт настроек содержит недопустимые поля.",
          nested
        );
      }
      plan.settings = payload.settings;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "clientLinks")) {
    if (!isPlainObject(payload.clientLinks)) {
      return migrateReject(422, MIGRATE_FORBIDDEN_FIELD, "Поле clientLinks должно быть объектом.");
    }
    const linkExtra = [];
    for (const [clientId, link] of Object.entries(payload.clientLinks)) {
      if (isForbiddenMigrateKey(clientId)) {
        linkExtra.push(`clientLinks.${clientId}`);
        continue;
      }
      linkExtra.push(...validateClientLinkEntry(clientId, link));
    }
    if (linkExtra.length) {
      return migrateReject(
        403,
        MIGRATE_SELF_GRANT,
        "Импорт связей клиентов содержит запрещённые поля.",
        linkExtra
      );
    }
    if (Object.keys(payload.clientLinks).length) {
      const gate = evaluateStaffFeature(user, "clients");
      if (!gate.allow) {
        return {
          ok: false,
          status: 403,
          code: gate.code,
          error: gate.error,
        };
      }
      plan.clientLinks = true;
    }
  }

  return { ok: true, plan };
}
