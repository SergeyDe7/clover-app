import assert from "node:assert/strict";
import {
  matchesCatalogPrefixSearch,
  productArticle,
  productCatalogSearchHaystack,
} from "../../src/shared/appHelpers.js";

const cup = {
  name: "Стакан бумажный 250 мл",
  oneCCode: "НФ-000123",
  code: "CL-9",
  category: "Посуда",
};

assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(cup), "ста бум"), true);
assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(cup), "СТА БУМ"), true);
assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(cup), "бум"), true);
assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(cup), "стакан бумажный"), true);
assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(cup), "нф 000"), true);
assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(cup), ""), true);

assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(cup), "ан бум"), false);
assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(cup), "акан"), false);
assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(cup), "мыло"), false);

assert.equal(productArticle(cup), "НФ-000123");
assert.equal(productArticle({ code: "CL-9" }), "");
assert.equal(
  productArticle({ code: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
  ""
);

const hay = productCatalogSearchHaystack(cup);
assert.equal(hay.includes("CL-9"), false);

const boxed = {
  name: "Контейнер 500 мл",
  category: "Посуда",
  subcategory: "Ланч-боксы",
  facet: "Чёрные",
};
assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(boxed), "ланч"), true);
assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(boxed), "чёрн"), true);
assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(boxed), "боксы"), true);

assert.equal(matchesCatalogPrefixSearch(productCatalogSearchHaystack(cup), "0123"), true);
assert.equal(
  matchesCatalogPrefixSearch(
    productCatalogSearchHaystack({ name: "Товар", oneCCode: "00001234" }),
    "1234"
  ),
  true
);
assert.equal(
  matchesCatalogPrefixSearch(
    productCatalogSearchHaystack({ name: "Товар", oneCCode: "00001234" }),
    "123"
  ),
  false
);

console.log("verify-catalog-prefix-search: ok");
