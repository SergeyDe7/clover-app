/**
 * Verify client-facing pricing sanitizers (response-only; no pricing logic change).
 * Mirrors server/src/server.js helpers used for role=client JSON.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverSrc = readFileSync(path.join(root, "server/src/server.js"), "utf8");

assert.match(serverSrc, /function sanitizeProductForClient/);
assert.match(serverSrc, /function sanitizeClientLinkForClient/);
assert.match(serverSrc, /function publicClientLinkForClient/);
assert.match(serverSrc, /resolveClientManagerContactSettings/);
assert.match(serverSrc, /function sanitizeOrderForClient/);
assert.match(
  serverSrc,
  /products:\s*sanitizeProductsForClient\(catalog\.matrixProducts\)/
);
assert.match(
  serverSrc,
  /fullCatalogProducts:\s*sanitizeProductsForClient\(catalog\.fullCatalogProducts\)/
);
assert.match(
  serverSrc,
  /\[req\.user\.id\]:\s*sanitizeClientLinkForClient\(catalog\.link\)/
);
assert.match(
  serverSrc,
  /orders:\s*sanitizeOrdersForClient\(listOrders\(req\.user\.id\)\)/
);
assert.match(
  serverSrc,
  /products:\s*sanitizeProductsForClient\(catalog\.matrixProducts\),\s*\n\s*fullCatalogProducts:\s*sanitizeProductsForClient/
);

// Local copies of the sanitizers (must stay in sync with server.js).
const CLIENT_PRODUCT_PRICING_BLOCKLIST = new Set([
  "purchasePrices",
  "purchasePrice",
  "purchasePriceUpdatedAt",
  "purchasePriceReceivedAt",
  "purchasePriceSourceUpdatedAt",
  "purchasePriceSourceDatabase",
  "purchasePriceSource",
  "purchasePriceUnit",
  "purchasePriceAvailable",
  "salePricesByType",
  "salePriceReceivedAt",
  "markupPercent",
  "defaultMarkupPercent",
  "defaultPricingMode",
  "clientPriceMode",
  "clientPriceOverrideMode",
  "oneCPriceTypeId",
  "oneCPriceTypeName",
  "priceSources",
]);

function sanitizeProductForClient(product = {}) {
  if (!product || typeof product !== "object") return product;
  const out = {};
  for (const [key, value] of Object.entries(product)) {
    if (CLIENT_PRODUCT_PRICING_BLOCKLIST.has(key)) continue;
    if (key.startsWith("basePrice")) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeClientLinkForClient(link = {}) {
  if (!link || typeof link !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(link)) {
    if (
      key === "defaultMarkupPercent" ||
      key === "defaultPricingMode" ||
      key === "oneCPriceTypeId" ||
      key === "oneCPriceTypeName" ||
      key === "personalPrices" ||
      key === "personalManagerId" ||
      key === "oneCId" ||
      key === "oneCCode" ||
      key === "oneCName" ||
      key === "oneCInn" ||
      key === "oneCSearchQuery" ||
      key === "managerNote" ||
      key.startsWith("oneCMatch")
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function sanitizeOrderItemForClient(item = {}) {
  if (!item || typeof item !== "object") return item;
  const {
    purchasePrice: _purchasePrice,
    purchasePriceUpdatedAt: _purchasePriceUpdatedAt,
    markupPercent: _markupPercent,
    priceSource: _priceSource,
    ...rest
  } = item;
  return rest;
}

function sanitizeOrderForClient(order = {}) {
  if (!order || typeof order !== "object") return order;
  return {
    ...order,
    items: (Array.isArray(order.items) ? order.items : []).map(
      sanitizeOrderItemForClient
    ),
  };
}

const dirtyProduct = {
  id: "p1",
  name: "Товар",
  pricePiece: 150,
  pricePack: 1500,
  saleUnits: ["piece", "pack"],
  purchasePrices: { piece: 100 },
  purchasePrice: 100,
  purchasePriceUpdatedAt: "t",
  purchasePriceReceivedAt: "t",
  purchasePriceSourceUpdatedAt: "t",
  purchasePriceSourceDatabase: "TEST",
  purchasePriceSource: "x",
  purchasePriceUnit: "piece",
  purchasePriceAvailable: true,
  salePricesByType: { a: { piece: 1 } },
  salePriceReceivedAt: "t",
  markupPercent: 33,
  defaultMarkupPercent: 33,
  defaultPricingMode: "purchase_markup",
  clientPriceMode: "purchase_markup",
  clientPriceOverrideMode: "inherit",
  oneCPriceTypeId: "uuid",
  oneCPriceTypeName: "Тип",
  priceSources: { piece: "purchase_markup" },
  basePricePiece: 120,
  basePricePack: 1200,
  imageUrl: "/x.png",
  category: "Упаковка",
};

const cleanProduct = sanitizeProductForClient(dirtyProduct);
for (const key of CLIENT_PRODUCT_PRICING_BLOCKLIST) {
  assert.equal(Object.prototype.hasOwnProperty.call(cleanProduct, key), false, key);
}
assert.equal(Object.prototype.hasOwnProperty.call(cleanProduct, "basePricePiece"), false);
assert.equal(Object.prototype.hasOwnProperty.call(cleanProduct, "basePricePack"), false);
assert.equal(cleanProduct.pricePiece, 150);
assert.equal(cleanProduct.pricePack, 1500);
assert.equal(cleanProduct.name, "Товар");
assert.equal(cleanProduct.id, "p1");
assert.equal(cleanProduct.imageUrl, "/x.png");
assert.deepEqual(dirtyProduct.purchasePrices, { piece: 100 }); // source untouched

const dirtyLink = {
  matrixMode: "selected",
  matrixProductIds: ["p1"],
  allowFullCatalog: true,
  matched1C: true,
  defaultMarkupPercent: 33,
  defaultPricingMode: "purchase_markup",
  oneCPriceTypeId: "uuid",
  oneCPriceTypeName: "Тип",
  personalPrices: { p1: { source: "manual", piece: 1 } },
  oneCId: "c-uuid",
  oneCCode: "К-1",
  oneCName: "Client",
  oneCInn: "123",
  oneCSearchQuery: "q",
  oneCMatchName: "n",
  oneCMatchCode: "c",
  oneCMatchInn: "i",
  oneCMatchPhone: "p",
  oneCMatchEmail: "e",
  managerNote: "secret",
  personalManagerId: "mgr-1",
  oneCLinkMode: "manual",
  oneCLinkedAt: "t",
};
const cleanLink = sanitizeClientLinkForClient(dirtyLink);
assert.equal(cleanLink.matrixMode, "selected");
assert.deepEqual(cleanLink.matrixProductIds, ["p1"]);
assert.equal(cleanLink.allowFullCatalog, true);
assert.equal(cleanLink.matched1C, true);
assert.equal(Object.prototype.hasOwnProperty.call(cleanLink, "defaultMarkupPercent"), false);
assert.equal(Object.prototype.hasOwnProperty.call(cleanLink, "personalPrices"), false);
assert.equal(Object.prototype.hasOwnProperty.call(cleanLink, "oneCId"), false);
assert.equal(Object.prototype.hasOwnProperty.call(cleanLink, "oneCMatchName"), false);
assert.equal(Object.prototype.hasOwnProperty.call(cleanLink, "managerNote"), false);
assert.equal(Object.prototype.hasOwnProperty.call(cleanLink, "personalManagerId"), false);
assert.equal(dirtyLink.defaultMarkupPercent, 33);

const dirtyOrder = {
  id: "o1",
  items: [
    {
      productId: "p1",
      unitPrice: 150,
      lineTotal: 150,
      purchasePrice: 100,
      purchasePriceUpdatedAt: "t",
      markupPercent: 33,
      priceSource: "purchase_markup",
    },
  ],
};
const cleanOrder = sanitizeOrderForClient(dirtyOrder);
assert.equal(cleanOrder.items[0].unitPrice, 150);
assert.equal(Object.prototype.hasOwnProperty.call(cleanOrder.items[0], "purchasePrice"), false);
assert.equal(Object.prototype.hasOwnProperty.call(cleanOrder.items[0], "markupPercent"), false);
assert.equal(Object.prototype.hasOwnProperty.call(cleanOrder.items[0], "priceSource"), false);
assert.equal(dirtyOrder.items[0].purchasePrice, 100);

// Staff bootstrap must still assign raw manager products (no sanitize on staff branch).
assert.match(serverSrc, /products:\s*managerProducts/);
assert.doesNotMatch(
  serverSrc.slice(
    serverSrc.indexOf("if (isStaffRole(req.user.role))"),
    serverSrc.indexOf("const state = getClientState")
  ),
  /sanitizeProductsForClient/
);

console.log("verify-client-pricing-sanitize: ok");
