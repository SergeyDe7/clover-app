import assert from "node:assert/strict";
import { alignLinePricesToCeilTotal, ceilMoney } from "../src/exchange.js";

assert.equal(ceilMoney(100.01), 100.01);
assert.equal(ceilMoney(100), 100);
assert.equal(ceilMoney(100.015), 100.02);

const { items, total, rawTotal } = alignLinePricesToCeilTotal(
  [
    { quantity: 2, price: 33.3 },
    { quantity: 1, price: 10.1 },
  ],
  "price"
);

assert.ok(Math.abs(rawTotal - 76.7) < 1e-9, `rawTotal=${rawTotal}`);
assert.equal(total, 76.7);
const sum = items.reduce((s, i) => s + i.quantity * i.price, 0);
assert.ok(Math.abs(sum - 76.7) < 1e-9, `sum=${sum}`);
assert.equal(items[0].price, 33.3);
assert.equal(items[1].price, 10.1);

console.log("alignLinePricesToCeilTotal (без ceil до рубля): ok");
