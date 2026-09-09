/**
 * Controlled offline AUTO import. Refuses production/worktree DBs unless
 * CLOVER_ALLOW_PRODUCT_AUTO_IMPORT=YES is set with an explicit DB_PATH.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const PRODUCTION_DATA = path.resolve("/opt/clover/clover-app/server/data");
const workRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const WORKTREE_DATA = path.resolve(workRoot, "server/data");

function rejectUnsafePath(candidate) {
  const resolved = path.resolve(candidate);
  if (resolved === PRODUCTION_DATA || resolved.startsWith(`${PRODUCTION_DATA}${path.sep}`)) {
    throw new Error(`Refusing production DB path: ${resolved}`);
  }
  if (resolved === WORKTREE_DATA || resolved.startsWith(`${WORKTREE_DATA}${path.sep}`)) {
    throw new Error(`Refusing worktree DB path: ${resolved}`);
  }
}

const dbPath = process.env.DB_PATH;
if (!dbPath) {
  console.error("DB_PATH is required. Refusing implicit production/worktree database.");
  process.exit(2);
}
if (process.env.CLOVER_ALLOW_PRODUCT_AUTO_IMPORT !== "YES") {
  try {
    rejectUnsafePath(dbPath);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

const artifactPath = process.argv[2];
if (!artifactPath) {
  console.error("Usage: node import-product-auto-translations.mjs <artifact.json>");
  process.exit(2);
}

const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const { importProductAutoArtifact } = await import("../src/productLocalizationStore.js");
const result = importProductAutoArtifact(artifact, "offline-auto-import");
console.log(JSON.stringify({ ok: true, ...result, dbPath: path.resolve(dbPath) }, null, 2));
