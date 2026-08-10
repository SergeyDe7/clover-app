/**
 * Единицы в ЛК клиента:
 * - шт → поле 1,2,3; в заказ/1С 1,2,3 шт (multiplier=1)
 * - шт с кратностью 5 → поле 5,10,15; цена за шт.; в 1С те же 5,10,15 шт
 * - упаковка/пачка с packSize=100 → поле 100,200,300; в заказе 1,2,3 уп.; в 1С totalPieces
 */
import assert from "node:assert/strict";
import {
  getUnitMultiplier,
  getPieceOrderMultiple,
  getUnitOrderStep,
  snapQuantityToStep,
  toQuantityInputValue,
  fromQuantityInputValue,
  quantityInputStep,
  quantityInputUnitLabel,
} from "../../src/shared/appHelpers.js";

// Перчатки: продаём только в шт (пачка как 1 шт в 1С)
const gloves = { pieceSize: 100, packSize: 100, bundleSize: 1, saleUnits: ["piece"] };
assert.equal(getUnitMultiplier(gloves, "piece"), 1);
assert.equal(toQuantityInputValue(1, 1), 1);
assert.equal(toQuantityInputValue(2, 1), 2);
assert.equal(toQuantityInputValue(3, 1), 3);
assert.equal(quantityInputUnitLabel("piece", 1), "шт.");
// pieceSize больше не раздувает шаг для «Штука»
assert.equal(getUnitMultiplier({ pieceSize: 50, packSize: 400 }, "piece"), 1);
assert.equal(getPieceOrderMultiple({ pieceSize: 50 }), 1);
assert.equal(getUnitOrderStep({ pieceSize: 50 }, "piece"), 1);

// Кратность шт.: цена за шт., количество 5/10/15
const multi = { pieceOrderMultiple: 5, saleUnits: ["piece"], pricePiece: 10 };
assert.equal(getPieceOrderMultiple(multi), 5);
assert.equal(getUnitOrderStep(multi, "piece"), 5);
assert.equal(quantityInputStep(1, 5), 5);
assert.equal(fromQuantityInputValue("5", 1, 5), 5);
assert.equal(fromQuantityInputValue("7", 1, 5), 5);
assert.equal(fromQuantityInputValue("8", 1, 5), 10);
assert.equal(fromQuantityInputValue("0", 1, 5), 0);
assert.equal(snapQuantityToStep(12, 5), 10);
assert.equal(snapQuantityToStep(13, 5), 15);

// Банка: продаём упаковками по 100 шт
const jar = { pieceSize: 1, packSize: 100, bundleSize: 1, saleUnits: ["pack"] };
assert.equal(getUnitMultiplier(jar, "pack"), 100);
assert.equal(toQuantityInputValue(1, 100), 100);
assert.equal(toQuantityInputValue(2, 100), 200);
assert.equal(toQuantityInputValue(3, 100), 300);
assert.equal(fromQuantityInputValue("100", 100), 1);
assert.equal(fromQuantityInputValue("200", 100), 2);
assert.equal(fromQuantityInputValue("1000", 1000), 1);
assert.equal(toQuantityInputValue(1, 1000), 1000);
assert.equal(toQuantityInputValue(2, 1000), 2000);
assert.equal(quantityInputStep(100), 100);
assert.equal(quantityInputUnitLabel("pack", 100), "шт.");

// В 1С уходит totalPieces = quantity * multiplier
assert.equal(2 * getUnitMultiplier(jar, "pack"), 200);
assert.equal(3 * getUnitMultiplier(gloves, "piece"), 3);

// Упаковка без размера — шаг 1 (нужно заполнить «Внутри, шт.»)
assert.equal(getUnitMultiplier({ packSize: 1 }, "pack"), 1);

const box = { boxSize: 24, pairSize: 2, rollSize: 50, packSize: 100, saleUnits: ["box", "pair", "roll", "pack"] };
assert.equal(getUnitMultiplier(box, "box"), 24);
assert.equal(getUnitMultiplier(box, "pack"), 100);
// пара и рулон в 1С → шт 1:1 (без кратности)
assert.equal(getUnitMultiplier(box, "pair"), 1);
assert.equal(getUnitMultiplier(box, "roll"), 1);
assert.equal(toQuantityInputValue(2, 24), 48);
assert.equal(fromQuantityInputValue("48", 24), 2);
assert.equal(quantityInputUnitLabel("box", 24), "шт.");
assert.equal(quantityInputUnitLabel("pair", 1), "пар.");

console.log("verify-pack-qty-pieces-step: ok");
