#!/usr/bin/env node
/**
 * nginx map из classified JSON + исходной карты (85 product + 50 folder).
 * node ops/seo/build-classified-magazin-map.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://clover-spb.ru";

const classified = JSON.parse(
  fs.readFileSync(path.join(__dirname, "magazin-fallback-classified.json"), "utf8")
);
const legacy = JSON.parse(
  fs.readFileSync(path.join(__dirname, "magazin-301-map.json"), "utf8")
);

const map = new Map();

for (const [from, to] of Object.entries(legacy.folders)) {
  map.set(from, to);
}
for (const [from, to] of Object.entries(legacy.products)) {
  if (!to.endsWith("/catalog")) map.set(from, to);
}
for (const item of [
  ...classified.groups.exact_product,
  ...classified.groups.confident_category,
]) {
  map.set(item.oldUrl, item.target);
}

const lines = [
  "# Generated from magazin-fallback-classified.json — do not edit",
  "map $uri $clover_magazin_redirect {",
  "    default \"\";",
];
for (const [from, to] of [...map.entries()].sort()) {
  lines.push(`    ${from} ${to};`);
}
lines.push("}");

const out = path.join(__dirname, "magazin-301-classified.map.conf");
fs.writeFileSync(out, `${lines.join("\n")}\n`);
console.log("entries", map.size, "→", out);
