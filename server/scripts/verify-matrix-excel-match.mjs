import assert from "node:assert/strict";
import { matchOneCImportRows } from "../src/oneCProducts.js";

const catalog = [
  { id: "a1", name: "Пакет ПВД 30х40", code: "НФ-001" },
  { id: "a2", name: "Пакет ПВД 40х50", code: "НФ-002" },
  { id: "a3", name: "Перчатки нитриловые M", code: "П-10" },
];

const rows = matchOneCImportRows(
  [
    { name: "Пакет ПВД 30х40", code: "" },
    { name: "Что-то неизвестное", code: "НФ-002" },
    { name: "перчатки нитриловые m", code: "" },
    { name: "совсем другой товар", code: "" },
    { name: "", code: "" },
  ],
  catalog
);

assert.equal(rows[0].status, "exact");
assert.equal(rows[0].match.id, "a1");
assert.equal(rows[1].status, "code");
assert.equal(rows[1].match.id, "a2");
assert.equal(rows[2].status, "exact");
assert.equal(rows[2].match.id, "a3");
assert.equal(rows[3].status, "miss");
assert.equal(rows[4].status, "empty");

console.log("matchOneCImportRows: ok");
