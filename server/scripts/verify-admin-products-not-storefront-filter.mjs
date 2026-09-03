/**
 * Focused: в ЛК администратора → «Товары» фильтр «Не на витрине»
 * показывает товары с showOnStorefront !== true (включая отсутствие поля).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(path.join(root, "src/screens/manager/ManagerProducts.jsx"), "utf8");

const selectMatch = source.match(
  /<select value=\{visibility\} onChange=\{\(e\) => setVisibility\(e\.target\.value\)\}>([\s\S]*?)<\/select>/
);
assert.ok(selectMatch, "Не найден select фильтра visibility");

const options = [...selectMatch[1].matchAll(/<option>([^<]*)<\/option>/g)].map((m) => m[1]);
const storefrontIndex = options.indexOf("На витрине сайта");
assert.notEqual(storefrontIndex, -1, "В select должен остаться пункт «На витрине сайта»");
assert.equal(
  options[storefrontIndex + 1],
  "Не на витрине",
  "Пункт «Не на витрине» должен стоять сразу после «На витрине сайта»"
);
assert.deepEqual(
  options,
  [
    "Все",
    "Активные",
    "Скрытые",
    "На витрине сайта",
    "Не на витрине",
    "Связанные с 1С",
    "Без связи с 1С",
    "Есть варианты",
  ],
  "Остальные пункты select не должны меняться"
);

const visibilityMatch = source.match(/const byVisibility =\s*([\s\S]*?);/);
assert.ok(visibilityMatch, "Не найдено выражение byVisibility");
const byVisibilityExpr = visibilityMatch[1];

assert.match(
  source,
  /return bySearch && byCategory && byVisibility;/,
  "Фильтр должен по-прежнему сочетаться с поиском и категорией"
);

function matchesVisibility(product, visibility, extras = {}) {
  const hasOneCLink = extras.hasOneCLink ?? Boolean(String(product.oneCId || "").trim());
  const hasVariants = extras.hasVariants ?? false;
  return Function(
    "product",
    "visibility",
    "hasOneCLink",
    "hasVariants",
    `"use strict"; return (${byVisibilityExpr});`
  )(product, visibility, hasOneCLink, hasVariants);
}

const onStorefrontActive = { id: "on-a", active: true, showOnStorefront: true };
const onStorefrontHidden = { id: "on-h", active: false, showOnStorefront: true };
const offStorefrontActive = { id: "off-a", active: true, showOnStorefront: false };
const offStorefrontHidden = { id: "off-h", active: false, showOnStorefront: false };
const missingFieldActive = { id: "miss-a", active: true };
const missingFieldHidden = { id: "miss-h", active: false };

assert.equal(
  matchesVisibility(onStorefrontActive, "Не на витрине"),
  false,
  "showOnStorefront=true не должен попадать в «Не на витрине»"
);
assert.equal(
  matchesVisibility(onStorefrontHidden, "Не на витрине"),
  false,
  "скрытый товар с showOnStorefront=true не должен попадать в «Не на витрине»"
);
assert.equal(
  matchesVisibility(offStorefrontActive, "Не на витрине"),
  true,
  "showOnStorefront=false должен попадать в «Не на витрине»"
);
assert.equal(
  matchesVisibility(offStorefrontHidden, "Не на витрине"),
  true,
  "скрытый товар с showOnStorefront=false должен попадать в «Не на витрине»"
);
assert.equal(
  matchesVisibility(missingFieldActive, "Не на витрине"),
  true,
  "товар без showOnStorefront должен попадать в «Не на витрине»"
);
assert.equal(
  matchesVisibility(missingFieldHidden, "Не на витрине"),
  true,
  "скрытый товар без showOnStorefront должен попадать в «Не на витрине»"
);

assert.equal(matchesVisibility(onStorefrontActive, "На витрине сайта"), true);
assert.equal(matchesVisibility(offStorefrontActive, "На витрине сайта"), false);
assert.equal(matchesVisibility(missingFieldActive, "На витрине сайта"), false);
assert.equal(matchesVisibility(onStorefrontActive, "Активные"), true);
assert.equal(matchesVisibility(onStorefrontHidden, "Скрытые"), true);
assert.equal(matchesVisibility(offStorefrontHidden, "Все"), true);

console.log("verify-admin-products-not-storefront-filter: ok");
