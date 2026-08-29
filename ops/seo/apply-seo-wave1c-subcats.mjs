#!/usr/bin/env node
/**
 * Применить или откатить перенос 13 SKU Wave 1c по manifest.
 *
 *   node ops/seo/apply-seo-wave1c-subcats.mjs --apply
 *   node ops/seo/apply-seo-wave1c-subcats.mjs --rollback
 *   node ops/seo/apply-seo-wave1c-subcats.mjs --dry-run
 *
 * Backup (не в git): server/data/backups/seo-wave1c-subcats-20260828T213410Z/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_PATH = path.join(__dirname, "seo-wave1c-three-subcats-manifest.json");
const DB_PATH =
  process.env.DB_PATH || path.join(ROOT, "server/data/clover.sqlite");

const mode = process.argv.includes("--rollback")
  ? "rollback"
  : process.argv.includes("--apply")
    ? "apply"
    : process.argv.includes("--dry-run")
      ? "dry-run"
      : "";

if (!mode) {
  console.error(
    "Usage: node ops/seo/apply-seo-wave1c-subcats.mjs --apply|--rollback|--dry-run"
  );
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const moves = Array.isArray(manifest.moves) ? manifest.moves : [];
if (moves.length !== 13) {
  console.error(`Expected 13 moves in manifest, got ${moves.length}`);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
const row = db.prepare("SELECT value_json FROM app_state WHERE key = ?").get("products");
if (!row?.value_json) {
  console.error("app_state.products missing");
  process.exit(1);
}

const products = JSON.parse(row.value_json);
const byCode = new Map(products.map((p) => [String(p.code || ""), p]));
if (byCode.size !== products.length) {
  console.error("Duplicate product codes in DB");
  process.exit(1);
}

const changes = [];
const errors = [];

for (const move of moves) {
  const product = byCode.get(move.code);
  if (!product) {
    errors.push({ code: move.code, error: "not found" });
    continue;
  }
  const fromCat = mode === "rollback" ? move.toCategory : move.fromCategory;
  const fromSub = mode === "rollback" ? move.toSubcategory : move.fromSubcategory;
  const toCat = mode === "rollback" ? move.fromCategory : move.toCategory;
  const toSub = mode === "rollback" ? move.fromSubcategory : move.toSubcategory;

  const curCat = String(product.category || "").trim();
  const curSub = String(product.subcategory || "").trim();

  if (curCat === toCat && curSub === toSub) {
    changes.push({ code: move.code, status: "already-applied", to: `${toCat} / ${toSub}` });
    continue;
  }
  if (curCat !== fromCat || curSub !== fromSub) {
    errors.push({
      code: move.code,
      error: "unexpected current taxonomy",
      current: `${curCat} / ${curSub}`,
      expectedFrom: `${fromCat} / ${fromSub}`,
    });
    continue;
  }

  changes.push({
    code: move.code,
    name: product.name,
    from: `${curCat} / ${curSub}`,
    to: `${toCat} / ${toSub}`,
    status: "will-update",
  });

  if (mode !== "dry-run") {
    product.category = toCat;
    product.subcategory = toSub;
    if (product.facet) product.facet = "";
  }
}

if (errors.length) {
  console.error(JSON.stringify({ mode, errors, changes }, null, 2));
  process.exit(1);
}

if (mode !== "dry-run") {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE app_state SET value_json = ?, updated_at = ? WHERE key = ?`
  ).run(JSON.stringify(products), now, "products");
}

console.log(
  JSON.stringify(
    {
      mode,
      db: DB_PATH,
      manifest: MANIFEST_PATH,
      backupPath: manifest.backupPath,
      updated: changes.filter((c) => c.status === "will-update").length,
      alreadyApplied: changes.filter((c) => c.status === "already-applied").length,
      totalProducts: products.length,
      uniqueCodes: byCode.size,
      changes,
    },
    null,
    2
  )
);
