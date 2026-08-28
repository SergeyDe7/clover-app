#!/usr/bin/env node
/**
 * Строит карту 301: /magazin/product/{old-slug} → /product/{code} или категория.
 * Запуск: node ops/seo/build-magazin-product-map.mjs
 * Требует API на :4100.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAGAZIN_FOLDER_TO_PATH } from "./magazinRedirectMap.js";
import { slugifyStorefrontLabel } from "../../src/screens/storefront/storefrontSlugs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.CLOVER_API_BASE || "http://127.0.0.1:4100";
const ORIGIN = "https://clover-spb.ru";

function normalizeSlug(value) {
  return slugifyStorefrontLabel(String(value || "").replace(/-/g, " "))
    .replace(/-/g, "");
}

function tokenSet(slug) {
  return new Set(
    String(slug || "")
      .toLowerCase()
      .split(/-+/)
      .filter((t) => t.length > 2)
  );
}

function scoreMatch(oldSlug, product) {
  const oldNorm = normalizeSlug(oldSlug);
  const nameSlug = slugifyStorefrontLabel(product.name);
  const nameNorm = normalizeSlug(product.name);
  if (!oldNorm || !nameNorm) return 0;
  if (oldNorm === nameNorm) return 100;
  if (nameNorm.includes(oldNorm) || oldNorm.includes(nameNorm)) return 80;
  const a = tokenSet(oldSlug);
  const b = tokenSet(nameSlug);
  let hit = 0;
  for (const t of a) if (b.has(t)) hit += 1;
  if (!a.size) return 0;
  const ratio = hit / a.size;
  if (ratio >= 0.7 && hit >= 2) return 50 + hit;
  if (ratio >= 0.5 && hit >= 3) return 40 + hit;
  return 0;
}

async function main() {
  const urls = fs
    .readFileSync(path.join(__dirname, "magazin-urls-source.txt"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const folders = urls
    .filter((u) => u.includes("/magazin/folder/"))
    .map((u) => u.replace(/.*\/folder\//, ""));
  const products = urls
    .filter((u) => u.includes("/magazin/product/"))
    .map((u) => u.replace(/.*\/product\//, ""));

  const catalog = await fetch(`${API}/api/public/catalog`).then((r) => r.json());
  const storeProducts = Array.isArray(catalog.products) ? catalog.products : [];

  const folderMap = {};
  for (const folder of folders) {
    const target = MAGAZIN_FOLDER_TO_PATH[folder] || "/catalog";
    folderMap[`/magazin/folder/${folder}`] = `${ORIGIN}${target}`;
  }

  const productMap = {};
  let matched = 0;
  let fallbackCat = 0;
  for (const oldSlug of products) {
    let best = null;
    let bestScore = 0;
    for (const product of storeProducts) {
      const score = scoreMatch(oldSlug, product);
      if (score > bestScore) {
        bestScore = score;
        best = product;
      }
    }
    if (best && bestScore >= 40) {
      productMap[`/magazin/product/${oldSlug}`] =
        `${ORIGIN}/product/${encodeURIComponent(best.code)}`;
      matched += 1;
    } else {
      productMap[`/magazin/product/${oldSlug}`] = `${ORIGIN}/catalog`;
      fallbackCat += 1;
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    stats: {
      folders: Object.keys(folderMap).length,
      products: Object.keys(productMap).length,
      productsMatchedToSku: matched,
      productsFallbackCatalog: fallbackCat,
      storefrontProducts: storeProducts.length,
    },
    folders: folderMap,
    products: productMap,
  };

  const jsonPath = path.join(__dirname, "magazin-301-map.json");
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));

  // nginx map snippet
  const lines = [
    "# Auto-generated magazin → clover-spb.ru map. Do not edit by hand.",
    "# Include from cloverspb.ru server block when DNS points to this host.",
    "map $uri $clover_magazin_redirect {",
    "    default /catalog;",
  ];
  for (const [from, to] of Object.entries(folderMap).sort()) {
    lines.push(`    ${from} ${to};`);
  }
  for (const [from, to] of Object.entries(productMap).sort()) {
    lines.push(`    ${from} ${to};`);
  }
  lines.push("}");
  const nginxPath = path.join(__dirname, "magazin-301.map.conf");
  fs.writeFileSync(nginxPath, `${lines.join("\n")}\n`);

  console.log(JSON.stringify(out.stats, null, 2));
  console.log("wrote", jsonPath);
  console.log("wrote", nginxPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
