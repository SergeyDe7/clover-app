import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const appPath = path.resolve(path.dirname(currentFile), "../../src/App.jsx");
const source = fs.readFileSync(appPath, "utf8");
const start = source.indexOf("const selectOneCProduct =");
const end = source.indexOf("const requestOneCSearch =", start);
assert.ok(start >= 0 && end > start, "Product editor selection handler was not found.");
const handler = source.slice(start, end);

assert.match(handler, /setForm\(nextProduct\)/, "The selected 1C item must be placed into the open form.");
assert.match(handler, /setOneCOpen\(false\)/, "The picker must close after selection.");
assert.match(handler, /Сохранить товар/, "The user must be told to save the product explicitly.");
assert.doesNotMatch(handler, /api\.linkOneCProduct/, "Choosing a 1C item must not save the link immediately.");
assert.doesNotMatch(handler, /onSave\s*\(/, "Choosing a 1C item must not close and save the product editor.");

const submitStart = source.indexOf("const submit =", end);
const submitEnd = source.indexOf("return (", submitStart);
assert.ok(submitStart >= 0 && submitEnd > submitStart, "Product editor submit handler was not found.");
const submitHandler = source.slice(submitStart, submitEnd);
assert.match(submitHandler, /onSave\(normalizeProduct/, "The final Save product action must persist the edited form.");

console.log("Проверка отложенного сохранения связи товара с 1С пройдена успешно.");
