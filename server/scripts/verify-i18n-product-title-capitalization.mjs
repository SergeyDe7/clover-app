/**
 * Focused verifier: display-only foreign product title capitalization.
 * Temp/synthetic fixtures only. No DB writes. No provider. No orders.
 */
import assert from "node:assert/strict";
import { sourceHash } from "../../src/shared/i18n/sourceHash.js";
import { normalizeProductDisplayTitle } from "../../src/shared/i18n/normalizeProductDisplayTitle.js";
import { projectLocalizedProductDisplay } from "../../src/shared/i18n/productDisplayProjection.js";
import {
  productDisplayName,
  applyProductDisplayNameMap,
} from "../../src/shared/i18n/productDisplayName.js";

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures.push({ name, message: err?.message || String(err) });
    console.error(`FAIL ${name}: ${err?.message || err}`);
  }
}

const HELPER_CASES = [
  ["liquid soap", "en", "Liquid soap"],
  ["  liquid soap", "en", "Liquid soap"],
  ['"liquid soap"', "en", '"Liquid soap"'],
  ["«liquid soap»", "en", "«Liquid soap»"],
  ["123 liquid soap", "en", "123 Liquid soap"],
  ["суюк самын", "ky", "Суюк самын"],
  ["собуни моеъ", "tg", "Собуни моеъ"],
  ["iPhone case", "en", "iPhone case"],
  ["eBay product", "en", "eBay product"],
  ["3M tape", "en", "3M tape"],
  ["YouTube item", "en", "YouTube item"],
  ["123 iPhone case", "en", "123 iPhone case"],
  ["Liquid soap", "en", "Liquid soap"],
];

for (const [input, locale, expected] of HELPER_CASES) {
  check(`helper:${locale}:${JSON.stringify(input)}`, () => {
    assert.equal(normalizeProductDisplayTitle(input, locale), expected);
    assert.equal(
      normalizeProductDisplayTitle(normalizeProductDisplayTitle(input, locale), locale),
      normalizeProductDisplayTitle(input, locale),
      "idempotent"
    );
  });
}

check("helper:zh exact no-op", () => {
  const zh = "  中文标题 soap";
  assert.equal(normalizeProductDisplayTitle(zh, "zh"), zh);
  assert.equal(normalizeProductDisplayTitle(zh, "zh-CN"), zh);
});

check("helper:ar exact no-op", () => {
  const ar = "  عنوان عربي";
  assert.equal(normalizeProductDisplayTitle(ar, "ar"), ar);
});

check("helper:ru exact no-op", () => {
  const ru = "  жидкое мыло";
  assert.equal(normalizeProductDisplayTitle(ru, "ru"), ru);
});

check("helper:empty contract", () => {
  assert.equal(normalizeProductDisplayTitle(null, "en"), "");
  assert.equal(normalizeProductDisplayTitle(undefined, "en"), "");
  assert.equal(normalizeProductDisplayTitle("", "en"), "");
  assert.equal(normalizeProductDisplayTitle("   ", "en"), "");
});

check("helper:uz latin", () => {
  assert.equal(normalizeProductDisplayTitle("suyuq sovun", "uz"), "Suyuq sovun");
});

const canonicalName = "Жидкое мыло Синергетик миндальное молоко 500 мл";
const product = Object.freeze({
  id: "p-cap-1",
  name: canonicalName,
  pricePiece: 100,
  storefrontDetails: Object.freeze({
    description: "RU desc",
    composition: "",
    characteristics: "",
  }),
});
const nameHash = sourceHash(canonicalName);

function cell(autoValue, autoHash = nameHash) {
  return {
    autoValue,
    manualValue: "",
    autoSourceHash: autoHash,
    manualSourceHash: "",
  };
}

check("projection:en normalized", () => {
  const cells = { name: cell("liquid soap Synergetic almond milk 500 ml") };
  const out = projectLocalizedProductDisplay(product, "en", ["ru", "en"], cells);
  assert.equal(out.name, "Liquid soap Synergetic almond milk 500 ml");
  assert.equal(out.pricePiece, 100);
  assert.equal(product.name, canonicalName);
});

check("projection:uz/ky/tg", () => {
  assert.equal(
    projectLocalizedProductDisplay(product, "uz", ["ru", "uz"], {
      name: cell("suyuq sovun"),
    }).name,
    "Suyuq sovun"
  );
  assert.equal(
    projectLocalizedProductDisplay(product, "ky", ["ru", "ky"], {
      name: cell("суюк самын"),
    }).name,
    "Суюк самын"
  );
  assert.equal(
    projectLocalizedProductDisplay(product, "tg", ["ru", "tg"], {
      name: cell("собуни моеъ"),
    }).name,
    "Собуни моеъ"
  );
});

check("projection:zh/ar unchanged", () => {
  const zhVal = "中文标题产品";
  assert.equal(
    projectLocalizedProductDisplay(product, "zh", ["ru", "zh"], {
      name: cell(zhVal),
    }).name,
    zhVal
  );
  const arVal = "عنوان المنتج";
  assert.equal(
    projectLocalizedProductDisplay(product, "ar", ["ru", "ar"], {
      name: cell(arVal),
    }).name,
    arVal
  );
});

check("projection:ru returns same object path / canonical", () => {
  const out = projectLocalizedProductDisplay(product, "ru", ["ru", "en"], {
    name: cell("liquid soap"),
  });
  assert.equal(out, product);
  assert.equal(out.name, canonicalName);
});

check("projection:missing translation → RU unchanged", () => {
  const out = projectLocalizedProductDisplay(product, "en", ["ru", "en"], {});
  assert.equal(out.name, canonicalName);
  assert.equal(out.name, product.name);
});

check("projection:stale → RU unchanged", () => {
  const out = projectLocalizedProductDisplay(product, "en", ["ru", "en"], {
    name: cell("liquid soap", "0".repeat(64)),
  });
  assert.equal(out.name, canonicalName);
});

check("projection:disabled language → RU unchanged", () => {
  const out = projectLocalizedProductDisplay(
    product,
    "en",
    ["ru"],
    { name: cell("liquid soap") }
  );
  assert.equal(out, product);
  assert.equal(out.name, canonicalName);
});

check("projection:MANUAL/AUTO/sourceHash cells unchanged + no product mutation", () => {
  const frozenCell = Object.freeze({
    autoValue: "liquid soap",
    manualValue: "",
    autoSourceHash: nameHash,
    manualSourceHash: "",
  });
  const cells = { name: frozenCell };
  const before = JSON.stringify(cells);
  const beforeProduct = JSON.stringify(product);
  projectLocalizedProductDisplay(product, "en", ["ru", "en"], cells);
  assert.equal(JSON.stringify(cells), before);
  assert.equal(JSON.stringify(product), beforeProduct);
  assert.equal(frozenCell.autoValue, "liquid soap");
  assert.equal(frozenCell.autoSourceHash, nameHash);
});

check("projection:manual wins + normalized", () => {
  const cells = {
    name: {
      manualValue: "liquid soap manual",
      manualSourceHash: nameHash,
      autoValue: "ignored auto",
      autoSourceHash: nameHash,
    },
  };
  const out = projectLocalizedProductDisplay(product, "en", ["ru", "en"], cells);
  assert.equal(out.name, "Liquid soap manual");
  assert.equal(cells.name.manualValue, "liquid soap manual");
  assert.equal(cells.name.autoValue, "ignored auto");
});

check("storefront + LK same normalized foreign title", () => {
  const translated = "liquid soap Synergetic almond milk 500 ml";
  const cells = { name: cell(translated) };
  const storefront = projectLocalizedProductDisplay(product, "en", ["ru", "en"], cells);
  const displayMap = {
    [product.id]: storefront.name,
  };
  const lkList = applyProductDisplayNameMap([product], displayMap);
  assert.equal(storefront.name, "Liquid soap Synergetic almond milk 500 ml");
  assert.equal(productDisplayName(lkList[0]), storefront.name);
  assert.equal(lkList[0].name, canonicalName);
  assert.equal(product.name, canonicalName);
});

check("productDisplayName: uses overlay as-is; RU fallback untouched; no en re-cap for zh", () => {
  assert.equal(
    productDisplayName({
      name: canonicalName,
      displayName: "Liquid soap Synergetic almond milk 500 ml",
    }),
    "Liquid soap Synergetic almond milk 500 ml"
  );
  assert.equal(productDisplayName({ name: canonicalName }), canonicalName);
  assert.equal(
    productDisplayName({ name: "  " + canonicalName + "  " }),
    canonicalName
  );
  // Must not re-capitalize Latin-looking zh overlay with default en rules.
  const zhOverlay = "liquid soap brand";
  assert.equal(
    productDisplayName({ name: canonicalName, displayName: zhOverlay }),
    zhOverlay
  );
});

check("mixed-case brands preserved through projection", () => {
  for (const title of ["iPhone case", "eBay product", "3M tape", "YouTube item", "123 iPhone case"]) {
    const out = projectLocalizedProductDisplay(product, "en", ["ru", "en"], {
      name: cell(title),
    });
    assert.equal(out.name, title, title);
  }
});

check("zh projection + LK overlay stay aligned (no en re-cap)", () => {
  const raw = "liquid soap brand";
  const storefront = projectLocalizedProductDisplay(product, "zh", ["ru", "zh"], {
    name: cell(raw),
  });
  assert.equal(storefront.name, raw);
  const lk = applyProductDisplayNameMap([product], { [product.id]: storefront.name });
  assert.equal(productDisplayName(lk[0]), raw);
});

check("historical order snapshot unchanged (byte-equivalent)", () => {
  const orderSnapshot = Object.freeze({
    id: "ord-1",
    items: Object.freeze([
      Object.freeze({
        productId: "p-cap-1",
        name: "liquid soap Synergetic almond milk 500 ml",
        qty: 2,
        price: 100,
      }),
    ]),
  });
  const before = JSON.stringify(orderSnapshot);
  const display = productDisplayName({
    id: "p-cap-1",
    name: canonicalName,
    displayName: "Liquid soap Synergetic almond milk 500 ml",
  });
  assert.equal(display, "Liquid soap Synergetic almond milk 500 ml");
  assert.equal(JSON.stringify(orderSnapshot), before);
  assert.equal(orderSnapshot.items[0].name, "liquid soap Synergetic almond milk 500 ml");
});

check("order payload identity/price remain canonical fields", () => {
  const payloadItem = {
    productId: product.id,
    name: product.name,
    price: product.pricePiece,
    qty: 1,
  };
  const projected = projectLocalizedProductDisplay(product, "en", ["ru", "en"], {
    name: cell("liquid soap"),
  });
  assert.equal(payloadItem.name, canonicalName);
  assert.equal(payloadItem.price, 100);
  assert.notEqual(projected.name, payloadItem.name);
});

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nOK verify-i18n-product-title-capitalization");
