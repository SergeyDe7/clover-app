import assert from "node:assert/strict";
import { readFrontendUiSource } from "./readFrontendUiSource.mjs";

const source = readFrontendUiSource();

const applyStart = source.indexOf("const applyOneCProduct =");
const applyEnd = source.indexOf("const selectOneCProduct =", applyStart);
assert.ok(
  applyStart >= 0 && applyEnd > applyStart,
  "Product editor applyOneCProduct handler was not found."
);
const applyHandler = source.slice(applyStart, applyEnd);
assert.match(
  applyHandler,
  /setForm\(nextProduct\)/,
  "The selected 1C item must be placed into the open form."
);
assert.match(
  applyHandler,
  /setOneCOpen\(false\)/,
  "The picker must close after selection."
);
assert.match(
  applyHandler,
  /Сохранить товар/,
  "The user must be told to save the product explicitly."
);

const selectStart = source.indexOf("const selectOneCProduct =");
const selectEnd = source.indexOf("const requestOneCSearch =", selectStart);
assert.ok(
  selectStart >= 0 && selectEnd > selectStart,
  "Product editor selectOneCProduct handler was not found."
);
const selectHandler = source.slice(selectStart, selectEnd);
assert.match(
  selectHandler,
  /applyOneCProduct\(item\)/,
  "Selecting a 1C item must apply it to the open form."
);
assert.doesNotMatch(
  selectHandler,
  /api\.linkOneCProduct/,
  "Choosing a 1C item must not save the link immediately."
);
assert.doesNotMatch(
  selectHandler,
  /onSave\s*\(/,
  "Choosing a 1C item must not close and save the product editor."
);

const submitStart = source.indexOf("const submit =", selectEnd);
const submitEnd = source.indexOf("return (", submitStart);
assert.ok(submitStart >= 0 && submitEnd > submitStart, "Product editor submit handler was not found.");
const submitHandler = source.slice(submitStart, submitEnd);
assert.match(
  submitHandler,
  /onSave\s*\(\s*normalizeProduct/,
  "The final Save product action must persist the edited form."
);

console.log("Проверка отложенного сохранения связи товара с 1С пройдена успешно.");
