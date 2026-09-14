import assert from "node:assert/strict";
import {
  toPublicCatalogListProduct,
} from "../src/storefrontPublic.js";
import {
  matchesCatalogPrefixSearch,
  productCatalogSearchHaystack,
  orderedSaleUnits,
  getUnitOrderStep,
} from "../../src/shared/appHelpers.js";

const full = {
  id: 1,
  code: "НФ-00000001",
  oneCCode: "НФ-00000001",
  oneCName: "Товар тестовый",
  name: "Крышка ПЭТ",
  category: "Крышки",
  subcategory: "ПЭТ",
  facet: "38 мм",
  prices: { piece: 12.5, pack: 100 },
  priceSources: { piece: "base", pack: "base" },
  details: {
    description: "длинное описание только для карточки товара",
    composition: "ПЭТ",
    characteristics: "38мм",
  },
  imageUrl: "/uploads/x.webp",
  saleUnits: ["piece", "pack"],
  pieceSize: 1,
  packSize: 50,
  pieceOrderMultiple: 1,
};

const list = toPublicCatalogListProduct(full);

// List consumers: card price + units (ProductCard)
assert.equal(Number(list.prices.piece), 12.5);
assert.equal(Number(list.prices.pack), 100);
assert.deepEqual(orderedSaleUnits(list), ["piece", "pack"]);
assert.equal(getUnitOrderStep(list, "piece"), 1);
assert.equal(list.imageUrl, "/uploads/x.webp");
assert.equal(list.name, "Крышка ПЭТ");
assert.equal("details" in list, false);
assert.equal("priceSources" in list, false);

// Client-side catalog search haystack must not depend on details
const hay = productCatalogSearchHaystack(list);
assert.equal(hay.includes("длинное описание"), false);
assert.ok(matchesCatalogPrefixSearch(hay, "крыш"));
assert.ok(matchesCatalogPrefixSearch(hay, "НФ-00000001"));
assert.ok(matchesCatalogPrefixSearch(hay, "пет"));

// Full product (product page) still carries details for display
assert.equal(String(full.details.description).includes("описание"), true);
assert.equal(full.priceSources.piece, "base");

// Strip is non-mutating
assert.equal("details" in full, true);
assert.equal("priceSources" in full, true);

assert.equal(toPublicCatalogListProduct(null), null);

console.log("verify-public-catalog-list-payload: ok");
