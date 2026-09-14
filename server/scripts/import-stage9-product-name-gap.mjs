/**
 * Controlled Stage 9 product-name gap import (18 cells).
 * Exactly one of --dry-run or --apply.
 * Refuses production DB_PATH unless CLOVER_ALLOW_STAGE9_NAME_GAP_IMPORT=YES.
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
  console.error(
    "Usage: node import-stage9-product-name-gap.mjs --file <artifact.json> --dry-run|--apply"
  );
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

const resolvedDb = realpathSync(path.resolve(dbPath));
if (lstatSync(path.resolve(dbPath)).isSymbolicLink()) {
  console.error("Refusing symlink DB_PATH.");
  process.exit(2);
}

const isProductionDb =
  resolvedDb === path.join(PRODUCTION_DATA, "clover.sqlite") ||
  resolvedDb.startsWith(`${PRODUCTION_DATA}${path.sep}`);

if (isProductionDb && process.env.CLOVER_ALLOW_STAGE9_NAME_GAP_IMPORT !== "YES") {
  console.error("Refusing production DB. Set CLOVER_ALLOW_STAGE9_NAME_GAP_IMPORT=YES only after approval.");
  process.exit(2);
}

process.env.DB_PATH = resolvedDb;
const artifact = path.resolve(args.file);
const {
  dryRunStage9ProductNameImport,
  applyStage9ProductNameImport,
} = await import("../src/stage9ProductNameImport.js");

if (args.dryRun) {
  const report = dryRunStage9ProductNameImport(artifact);
  const ok = report.fatal === 0;
  console.log(JSON.stringify({ ok, writes: 0, ...report, dbPath: resolvedDb }, null, 2));
  process.exit(ok ? 0 : 1);
}

const result = applyStage9ProductNameImport(artifact, "stage9-name-gap-import");
console.log(JSON.stringify({ ok: true, ...result, dbPath: resolvedDb }, null, 2));
