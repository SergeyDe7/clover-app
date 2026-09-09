/**
 * Controlled offline AUTO import.
 * Exactly one of --dry-run or --apply is required.
 * Production apply also requires DB_PATH + CLOVER_ALLOW_PRODUCT_AUTO_IMPORT=YES.
 */
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
if (!dbPath) {
  console.error("DB_PATH is required.");
  process.exit(2);
}

const resolvedDb = path.resolve(dbPath);
const isProductionDb =
  resolvedDb === path.join(PRODUCTION_DATA, "clover.sqlite") ||
  resolvedDb.startsWith(`${PRODUCTION_DATA}${path.sep}`);

if (args.apply && isProductionDb && process.env.CLOVER_ALLOW_PRODUCT_AUTO_IMPORT !== "YES") {
  console.error("Production apply requires CLOVER_ALLOW_PRODUCT_AUTO_IMPORT=YES.");
  process.exit(2);
}

const {
  applyProductAutoImport,
  dryRunProductAutoImport,
  loadAutoImportManifest,
} = await import("../src/productAutoImport.js");

const loaded = loadAutoImportManifest(path.resolve(args.file));
if (args.dryRun) {
  const report = dryRunProductAutoImport(loaded);
  console.log(JSON.stringify({ ok: true, writes: 0, ...report }, null, 2));
  process.exit(0);
}

const result = applyProductAutoImport(loaded, "offline-auto-import");
console.log(JSON.stringify({ ok: true, ...result, dbPath: resolvedDb }, null, 2));
