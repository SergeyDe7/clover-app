/**
 * Controlled offline AUTO import.
 * Exactly one of --dry-run or --apply is required.
 * --dry-run never imports db.js and opens SQLite read-only.
 * Production apply requires DB_PATH + CLOVER_ALLOW_PRODUCT_AUTO_IMPORT=YES
 * + CLOVER_EXPECT_PRODUCT_AUTO_RUN_ID + CLOVER_EXPECT_PRODUCT_AUTO_FINGERPRINT.
 */
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");

function parseArgs(argv) {
  const out = { file: "", dryRun: false, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") out.dryRun = true;
    else if (token === "--apply") out.apply = true;
    else if (token === "--file") {
      out.file = String(argv[i + 1] || "");
      i += 1;
    } else if (!token.startsWith("--") && !out.file) {
      out.file = token;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.file) {
  console.error("Usage: node import-product-auto-translations.mjs --file <manifest.json> --dry-run|--apply");
  process.exit(2);
}
if (args.dryRun === args.apply) {
  console.error("Exactly one of --dry-run or --apply is required.");
  process.exit(2);
}

const dbPath = process.env.DB_PATH;
if (!args.dryRun && !dbPath) {
  console.error("DB_PATH is required for --apply.");
  process.exit(2);
}
if (args.dryRun && !dbPath) {
  console.error("DB_PATH is required for --dry-run.");
  process.exit(2);
}

const resolvedDb = realpathSync(path.resolve(dbPath));
if (lstatSync(path.resolve(dbPath)).isSymbolicLink()) {
  console.error("Refusing symlink DB_PATH.");
  process.exit(2);
}

const isProductionDb =
  resolvedDb === path.join(PRODUCTION_DATA, "clover.sqlite") ||
  resolvedDb.startsWith(`${PRODUCTION_DATA}${path.sep}`);

const expected = {
  runId: process.env.CLOVER_EXPECT_PRODUCT_AUTO_RUN_ID || "",
  fingerprint: process.env.CLOVER_EXPECT_PRODUCT_AUTO_FINGERPRINT || "",
  baseMainSha: process.env.CLOVER_EXPECT_PRODUCT_AUTO_BASE_SHA || "",
};

if (args.apply) {
  if (isProductionDb && process.env.CLOVER_ALLOW_PRODUCT_AUTO_IMPORT !== "YES") {
    console.error("Production apply requires CLOVER_ALLOW_PRODUCT_AUTO_IMPORT=YES.");
    process.exit(2);
  }
  if (isProductionDb && (!expected.runId || !expected.fingerprint)) {
    console.error(
      "Production apply requires CLOVER_EXPECT_PRODUCT_AUTO_RUN_ID and CLOVER_EXPECT_PRODUCT_AUTO_FINGERPRINT."
    );
    process.exit(2);
  }
}

if (args.dryRun) {
  const { dryRunProductAutoImportReadOnly } = await import("../src/productAutoImportReadOnly.js");
  const report = dryRunProductAutoImportReadOnly(path.resolve(args.file), resolvedDb, expected);
  console.log(JSON.stringify({ ok: true, writes: 0, ...report, dbPath: resolvedDb }, null, 2));
  process.exit(0);
}

process.env.DB_PATH = resolvedDb;
const { applyProductAutoImport, loadAutoImportManifest } = await import("../src/productAutoImport.js");
const loaded = loadAutoImportManifest(path.resolve(args.file), expected);
const result = applyProductAutoImport(loaded, "offline-auto-import", expected);
console.log(JSON.stringify({ ok: true, ...result, dbPath: resolvedDb }, null, 2));
