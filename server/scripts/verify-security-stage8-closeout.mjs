import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateInventory } from "./securityStage8InventoryGate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const closeout = read("docs/technical/SECURITY_STAGE8_RELEASE_CLOSEOUT.md");
const rollback = read("ops/security-stage8/closeout/ROLLBACK.md");
const installResult = read("ops/security-stage8/closeout/INSTALL_RESULT.txt");
const result = JSON.parse(read("ops/security-stage8/closeout/result-template.json"));
const serverPackage = JSON.parse(read("server/package.json"));

assert.match(closeout, /PREPARED \/ NOT DEPLOYED \/ PRODUCTION APPLY NOT RUN/u);
assert.match(closeout, /f2d8083a9314adcac48ebbb64a52aeccf1abc98a/u);
assert.match(closeout, /baseline, not the production deployment target/u);
assert.match(closeout, /exact 40-character merge commit/u);
assert.match(closeout, /Ruleset `23989349`/u);
assert.match(closeout, /GitHub Actions App `15368`/u);
assert.match(closeout, /verify-security-stage8-package-a\.sh/u);
assert.match(closeout, /harden-deployment-artifacts\.sh --dry-run/u);
assert.match(closeout, /harden-deployment-artifacts\.sh --apply/u);
assert.match(closeout, /run-target-deploy\.sh prepare/u);
assert.match(closeout, /promote "\$\{PREPARED_PATH\}" "\$\{TARGET_SHA\}"/u);
assert.match(closeout, /Exit code zero from the hardener is not sufficient/u);
assert.match(closeout, /effective ACL/u);
assert.match(closeout, /separate explicit approval/u);
assert.match(closeout, /securityStage8InventoryGate\.mjs --phase pre/u);
assert.match(closeout, /securityStage8InventoryGate\.mjs --phase post/u);
assert.match(closeout, /git -C "\$\{ROOT\}" show/u);
assert.match(closeout, /hash-object/u);
assert.match(closeout, /security-stage8-source-\$\{TARGET_SHA\}/u);
assert.match(closeout, /security-stage8-\$\{UTC\}-\$\{PREV_SHA\}/u);
assert.match(closeout, /not one atomic\s+lock transaction/u);
for (const marker of [
  "NOT_ALLOWLISTED",
  "NOT_VERIFIED",
  "ALLOWLIST_MISSING",
  "SYMLINK_REFUSED",
]) {
  assert.match(closeout, new RegExp(marker, "u"));
}

assert.match(rollback, /no rollback to `0644`, `0777`/u);
assert.match(rollback, /Keep every already-hardened sensitive file at `0600`/u);
assert.match(rollback, /previous source SHA/u);
assert.doesNotMatch(rollback, /chmod\s+(644|777)/u);

for (const marker of [
  "SECURITY_STAGE8_CLOSEOUT_STATUS=PENDING",
  "TARGET_SHA=NOT_RECORDED",
  "HARDENING_APPLY=NOT_RUN",
  "POST_APPLY_INVENTORY_SHA256=NOT_RECORDED",
  "LAST_KNOWN_GOOD_PATH=NOT_RECORDED",
  "PREVIOUS_UI_TAG=NOT_RECORDED",
  "PREVIOUS_UI_BUNDLE=NOT_RECORDED",
  "PROMOTE=NOT_RUN",
  "PERMISSION_ROLLBACK=FORBIDDEN",
]) {
  assert.match(installResult, new RegExp(marker, "u"));
}
assert.doesNotMatch(installResult, /PASSWORD|SECRET|TOKEN|API_KEY|JWT/iu);

assert.equal(result.schema, "clover-security-stage8-closeout/v1");
assert.equal(result.status, "PENDING");
assert.equal(result.candidateSourceSha, "f2d8083a9314adcac48ebbb64a52aeccf1abc98a");
assert.equal(result.targetSha, null);
assert.equal(result.apply.approved, false);
assert.equal(result.apply.hardeningApply, null);
assert.equal(result.prepare.reviewedInventorySha256, null);
assert.equal(result.apply.postApplyInventorySha256, null);
assert.equal(result.rollback.preCutoverBackupPath, null);
assert.equal(result.rollback.preCutoverBackupSha256, null);
assert.equal(result.rollback.lastKnownGoodPath, null);
assert.equal(result.rollback.previousUiTag, null);
assert.equal(result.rollback.previousUiBundle, null);
assert.equal(result.rollback.permissionRollbackForbidden, true);
assert.equal(result.rollback.used, false);
assert.deepEqual(result.github.requiredChecks, ["frontend", "server"]);
assert.equal(result.github.actionsAppId, 15368);
assert.equal(result.github.rulesetId, 23989349);

const sampleAllowlist = "lkg/a.sqlite\nstaging/b.env\n";
const pre = evaluateInventory({
  phase: "pre",
  expectedRoot: "/fixture",
  allowlist: sampleAllowlist,
  inventory: [
    "INVENTORY_ROOT|/fixture",
    "ACCESSIBLE_PERMISSION_CHAIN|lkg/a.sqlite|644",
    "BLOCKED_BY_PARENT_OTHER_BITS|staging/b.env|600|/fixture/staging:700",
    "DRY_RUN_OK|no-changes",
  ].join("\n"),
});
assert.deepEqual(pre, { phase: "pre", allowlisted: 2, inventoryRoot: "/fixture" });
const post = evaluateInventory({
  phase: "post",
  expectedRoot: "/fixture",
  allowlist: sampleAllowlist,
  inventory: [
    "INVENTORY_ROOT|/fixture",
    "BLOCKED_BY_FILE_OTHER_BITS|lkg/a.sqlite|600",
    "BLOCKED_BY_PARENT_OTHER_BITS|staging/b.env|600|/fixture/staging:700",
    "DRY_RUN_OK|no-changes",
  ].join("\n"),
});
assert.deepEqual(post, { phase: "post", allowlisted: 2, inventoryRoot: "/fixture" });
assert.throws(
  () => evaluateInventory({
    phase: "pre",
    allowlist: sampleAllowlist,
    inventory: "NOT_VERIFIED|lkg/a.sqlite|stat-file-failed\nDRY_RUN_OK|no-changes",
  }),
  /blocking inventory row/u
);
assert.throws(
  () => evaluateInventory({
    phase: "post",
    allowlist: sampleAllowlist,
    inventory: "ACCESSIBLE_PERMISSION_CHAIN|lkg/a.sqlite|644\nBLOCKED_BY_FILE_OTHER_BITS|staging/b.env|600\nDRY_RUN_OK|no-changes",
  }),
  /post-apply mode is not 600/u
);
for (const [inventory, expectedError] of [
  [
    "INVENTORY_ROOT|/fixture\nFUTURE_UNSAFE|lkg/a.sqlite|777\nACCESSIBLE_PERMISSION_CHAIN|lkg/a.sqlite|600\nBLOCKED_BY_FILE_OTHER_BITS|staging/b.env|600\nDRY_RUN_OK|no-changes",
    /unknown inventory row/u,
  ],
  [
    "INVENTORY_ROOT|/fixture\nERROR|unexpected\nACCESSIBLE_PERMISSION_CHAIN|lkg/a.sqlite|600\nBLOCKED_BY_FILE_OTHER_BITS|staging/b.env|600\nDRY_RUN_OK|no-changes",
    /unknown inventory row/u,
  ],
  [
    "INVENTORY_ROOT|/fixture\nACCESSIBLE_PERMISSION_CHAIN|lkg/a.sqlite|600|extra\nBLOCKED_BY_FILE_OTHER_BITS|staging/b.env|600\nDRY_RUN_OK|no-changes",
    /malformed inventory row/u,
  ],
  [
    "INVENTORY_ROOT|/fixture\nACCESSIBLE_PERMISSION_CHAIN|lkg/a.sqlite|600\nBLOCKED_BY_FILE_OTHER_BITS|staging/b.env|600\nDRY_RUN_OK|no-changes\nDRY_RUN_OK|no-changes",
    /invalid or duplicate DRY_RUN_OK/u,
  ],
  [
    "INVENTORY_ROOT|relative\nACCESSIBLE_PERMISSION_CHAIN|lkg/a.sqlite|600\nBLOCKED_BY_FILE_OTHER_BITS|staging/b.env|600\nDRY_RUN_OK|no-changes",
    /invalid or duplicate INVENTORY_ROOT/u,
  ],
]) {
  assert.throws(
    () => evaluateInventory({
      phase: "pre",
      expectedRoot: "/fixture",
      allowlist: sampleAllowlist,
      inventory,
    }),
    expectedError
  );
}
for (const wrongRoot of [
  "/tmp/unrelated",
  "//opt/clover/deployments",
  "/opt/clover/deployments/../other",
]) {
  assert.throws(
    () => evaluateInventory({
      phase: "pre",
      allowlist: sampleAllowlist,
      inventory: [
        `INVENTORY_ROOT|${wrongRoot}`,
        "ACCESSIBLE_PERMISSION_CHAIN|lkg/a.sqlite|600",
        "BLOCKED_BY_FILE_OTHER_BITS|staging/b.env|600",
        "DRY_RUN_OK|no-changes",
      ].join("\n"),
    }),
    /invalid or duplicate INVENTORY_ROOT/u
  );
}

const serialized = JSON.stringify(result);
assert.doesNotMatch(serialized, /BEGIN [A-Z ]*PRIVATE KEY/u);
assert.doesNotMatch(serialized, /password|api[_-]?key|jwt|token/iu);

assert.equal(
  serverPackage.scripts["test:security-stage8-closeout"],
  "node scripts/verify-security-stage8-closeout.mjs"
);
assert.match(serverPackage.scripts["test:all"], /npm run test:security-stage8-closeout/u);

console.log("SECURITY_STAGE8_CLOSEOUT_PREPARE_VERIFY_PASS");
