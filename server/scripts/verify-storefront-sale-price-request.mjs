import assert from "node:assert/strict";
import { buildSalePriceRequirements } from "../src/oneCSalePrices.js";

const retailId = "retail-type-id";
const purchaseTypeId = "purchase-type-id";
const clientTypeId = "client-type-id";

const products = [
  {
    id: 1,
    name: "Клиентский",
    active: true,
    oneCId: "onec-1",
    oneCCode: "НФ-1",
    showOnStorefront: false,
  },
  {
    id: 2,
    name: "Витрина",
    active: true,
    oneCId: "onec-2",
    oneCCode: "НФ-2",
    showOnStorefront: true,
  },
];

const clientLinks = {
  c1: {
    matrixMode: "selected",
    matrixProductIds: [1],
    oneCPriceTypeId: clientTypeId,
    defaultPricingMode: "one_c_price_type",
  },
};

const priceTypeMode = buildSalePriceRequirements(products, clientLinks, {
  storefrontPricingMode: "price_type",
  storefrontPriceTypeId: retailId,
  storefrontCostPriceTypeId: purchaseTypeId,
});
assert.equal(
  priceTypeMode.some(
    (item) => item.id === "onec-2" && item.priceTypeId === retailId
  ),
  true
);
assert.equal(
  priceTypeMode.some(
    (item) => item.id === "onec-1" && item.priceTypeId === purchaseTypeId
  ),
  true
);
assert.equal(
  priceTypeMode.some(
    (item) => item.id === "onec-2" && item.priceTypeId === purchaseTypeId
  ),
  true
);

const markupMode = buildSalePriceRequirements(products, clientLinks, {
  storefrontPricingMode: "purchase_markup",
  storefrontPriceTypeId: retailId,
  storefrontCostPriceTypeId: purchaseTypeId,
});
assert.equal(
  markupMode.some(
    (item) => item.id === "onec-2" && item.priceTypeId === purchaseTypeId
  ),
  true
);
assert.equal(
  markupMode.some(
    (item) => item.id === "onec-2" && item.priceTypeId === retailId
  ),
  false
);

console.log("verify-storefront-sale-price-request: ok");
