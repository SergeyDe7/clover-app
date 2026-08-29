#!/usr/bin/env node
/**
 * Проверка category-mapping: все 187 URL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditCategoryMapping } from "./category-mapping-audit.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "magazin-fallback-classified.json"), "utf8")
);

const results = data.groups.confident_category.map((item) => ({
  oldSlug: item.oldSlug,
  target: item.target.replace("https://clover-spb.ru", ""),
  ...auditCategoryMapping(item),
}));

const summary = {
  checked: results.length,
  ok: results.filter((r) => r.status === "ok").length,
  warn: 0,
  error: results.filter((r) => r.status === "error").length,
};

fs.writeFileSync(
  path.join(__dirname, "magazin-category-spot-check.json"),
  JSON.stringify({ summary, results }, null, 2)
);

console.log(JSON.stringify(summary, null, 2));
if (summary.error) {
  for (const r of results.filter((x) => x.status === "error")) {
    console.log(`[error] ${r.oldSlug} → ${r.target}`);
    for (const n of r.notes) console.log(`  - ${n}`);
  }
  process.exit(1);
}
