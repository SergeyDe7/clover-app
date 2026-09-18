/**
 * Exact-path DAC helper for sensitive Clover runtime files.
 * Dry-run by default. Does not import db.js. Does not follow symlinks.
 *
 * Usage:
 *   node scripts/run-runtime-permissions.mjs --root /tmp/fixture
 *   node scripts/run-runtime-permissions.mjs --root /tmp/fixture --apply
 *   node scripts/run-runtime-permissions.mjs --root /tmp/fixture --postcheck
 *   node scripts/run-runtime-permissions.mjs --rollback --plan /tmp/plan.json
 */
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyRuntimePermissionPlan,
  assertRuntimeRootAllowed,
  isExplicitApply,
  parseRuntimePermissionsArgs,
  planRuntimePermissionFixes,
  postcheckRuntimePermissions,
  rollbackRuntimePermissionPlan,
  summarizeRuntimePermissionsResult,
} from "../src/runtimeFilePermissions.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

const options = parseRuntimePermissionsArgs(process.argv.slice(2));
const allowProduction = process.env.CLOVER_RUNTIME_PERMISSIONS_ALLOW_PRODUCTION === "1";
const explicitApply = isExplicitApply({ apply: options.apply });
if (options.postcheck && (explicitApply || options.rollback)) {
  fail("postcheck is read-only");
}
if (options.rollback && explicitApply) {
  fail("rollback and apply are exclusive");
}

function resolvePlanPath(planPath) {
  if (!planPath) fail("Refusing missing --plan");
  const resolved = path.resolve(planPath);
  try {
    if (lstatSync(resolved).isSymbolicLink()) fail("Refusing symlink plan path");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return resolved;
}

function readPlanFile(planPath) {
  const resolved = resolvePlanPath(planPath);
  if (!existsSync(resolved)) fail("Plan file does not exist");
  return JSON.parse(readFileSync(resolved, "utf8"));
}

let result;
try {
  if (options.rollback) {
    const saved = readPlanFile(options.planPath);
    const root = assertRuntimeRootAllowed(saved.root, { repositoryRoot, allowProduction });
    if (path.resolve(saved.root) !== root) {
      fail("Refusing rollback plan root mismatch");
    }
    result = rollbackRuntimePermissionPlan(saved);
  } else {
    const requestedRoot = options.root || repositoryRoot;
    const root = assertRuntimeRootAllowed(requestedRoot, { repositoryRoot, allowProduction });
    if (options.postcheck) {
      result = postcheckRuntimePermissions(root);
    } else {
      const plan = planRuntimePermissionFixes(root);
      result = applyRuntimePermissionPlan(plan, { apply: explicitApply });
      if (options.planPath) {
        writeFileSync(resolvePlanPath(options.planPath), `${JSON.stringify(result, null, 2)}\n`, "utf8");
      }
    }
  }
} catch (error) {
  fail(error.message);
}

console.log(JSON.stringify(summarizeRuntimePermissionsResult(result)));
