import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAFE_CLASSIFICATIONS = new Set([
  "ACCESSIBLE_PERMISSION_CHAIN",
  "BLOCKED_BY_PARENT_OTHER_BITS",
  "BLOCKED_BY_FILE_OTHER_BITS",
]);
const BLOCKING_CLASSIFICATIONS = new Set([
  "NOT_ALLOWLISTED",
  "NOT_VERIFIED",
  "ALLOWLIST_MISSING",
  "SYMLINK_REFUSED",
]);

function allowlistRows(source) {
  return String(source)
    .split(/\r?\n/u)
    .map((row) => row.trim())
    .filter((row) => row && !row.startsWith("#"));
}

export function evaluateInventory({
  inventory,
  allowlist,
  phase,
  expectedRoot = "/opt/clover/deployments",
}) {
  if (phase !== "pre" && phase !== "post") {
    throw new Error("phase must be pre or post");
  }
  const allowed = allowlistRows(allowlist);
  const expected = new Set(allowed);
  if (expected.size !== allowed.length || expected.size === 0) {
    throw new Error("allowlist must be non-empty and unique");
  }

  const observed = new Map();
  let dryRunMarker = false;
  let inventoryRoot = null;
  for (const raw of String(inventory).split(/\r?\n/u)) {
    const row = raw.trim();
    if (!row) continue;
    const fields = row.split("|");
    const kind = fields[0];
    if (kind === "INVENTORY_ROOT") {
      if (fields.length !== 2 || fields[1] !== expectedRoot || inventoryRoot !== null) {
        throw new Error(`invalid or duplicate INVENTORY_ROOT row: ${row}`);
      }
      inventoryRoot = fields[1];
      continue;
    }
    if (kind === "DRY_RUN_OK") {
      if (fields.length !== 2 || fields[1] !== "no-changes" || dryRunMarker) {
        throw new Error(`invalid or duplicate DRY_RUN_OK row: ${row}`);
      }
      dryRunMarker = true;
      continue;
    }
    if (BLOCKING_CLASSIFICATIONS.has(kind)) {
      throw new Error(`blocking inventory row: ${row}`);
    }
    if (!SAFE_CLASSIFICATIONS.has(kind)) {
      throw new Error(`unknown inventory row: ${row}`);
    }
    const expectedFields = kind === "BLOCKED_BY_PARENT_OTHER_BITS" ? 4 : 3;
    if (fields.length !== expectedFields || fields.some((field) => field.length === 0)) {
      throw new Error(`malformed inventory row: ${row}`);
    }
    const relative = fields[1];
    if (!expected.has(relative)) {
      throw new Error(`classified path is not allowlisted: ${relative}`);
    }
    if (observed.has(relative)) {
      throw new Error(`duplicate inventory classification: ${relative}`);
    }
    const mode = fields[2] || "";
    if (!/^\d{3,4}$/u.test(mode)) {
      throw new Error(`invalid mode for ${relative}: ${mode}`);
    }
    if (phase === "post" && mode !== "600") {
      throw new Error(`post-apply mode is not 600 for ${relative}: ${mode}`);
    }
    observed.set(relative, { kind, mode });
  }

  if (inventoryRoot === null) throw new Error("INVENTORY_ROOT marker missing");
  if (!dryRunMarker) throw new Error("DRY_RUN_OK marker missing");
  const missing = allowed.filter((relative) => !observed.has(relative));
  if (missing.length > 0) {
    throw new Error(`allowlisted paths missing from inventory: ${missing.join(",")}`);
  }
  return { phase, allowlisted: allowed.length, inventoryRoot };
}

function parseArgs(argv) {
  const out = { phase: "", inventory: "", allowlist: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--phase") out.phase = String(argv[++i] || "");
    else if (arg === "--inventory") out.inventory = String(argv[++i] || "");
    else if (arg === "--allowlist") out.allowlist = String(argv[++i] || "");
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!out.phase || !out.inventory || !out.allowlist) {
    throw new Error("usage: --phase pre|post --inventory FILE --allowlist FILE");
  }
  return out;
}

const isCli = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = evaluateInventory({
      phase: args.phase,
      inventory: readFileSync(args.inventory, "utf8"),
      allowlist: readFileSync(args.allowlist, "utf8"),
      expectedRoot: "/opt/clover/deployments",
    });
    console.log(JSON.stringify({ SECURITY_STAGE8_INVENTORY_GATE: "PASS", ...result }));
  } catch (error) {
    console.error(`SECURITY_STAGE8_INVENTORY_GATE_FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
