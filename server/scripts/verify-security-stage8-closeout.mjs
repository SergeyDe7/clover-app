import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateInventory } from "./securityStage8InventoryGate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const closeout = read("docs/technical/SECURITY_STAGE8_RELEASE_CLOSEOUT.md");
const rollback = read("ops/security-stage8/closeout/ROLLBACK.md");
const remediation = read("ops/security-stage8/closeout/PHASE1_REMEDIATION.md");
const hardener = read("scripts/linux/harden-deployment-artifacts.sh");
const installResult = read("ops/security-stage8/closeout/INSTALL_RESULT.txt");
const result = JSON.parse(read("ops/security-stage8/closeout/result-template.json"));
const serverPackage = JSON.parse(read("server/package.json"));

assert.match(closeout, /PHASE 1 BLOCKED \/ NOT DEPLOYED \/ PRODUCTION APPLY NOT RUN/u);
assert.match(closeout, /f2d8083a9314adcac48ebbb64a52aeccf1abc98a/u);
assert.match(closeout, /baseline, not the production deployment target/u);
assert.match(closeout, /exact 40-character merge commit/u);
assert.match(closeout, /Ruleset `23989349`/u);
assert.match(closeout, /GitHub Actions App `15368`/u);
assert.match(closeout, /verify-security-stage8-package-a\.sh/u);
assert.match(closeout, /harden-deployment-artifacts\.sh" --dry-run/u);
assert.match(closeout, /harden-deployment-artifacts\.sh" --apply/u);
assert.match(closeout, /run-target-deploy\.sh prepare/u);
assert.match(closeout, /promote "\$\{PREPARED_PATH\}" "\$\{TARGET_SHA\}"/u);
assert.match(closeout, /Exit code zero from the hardener is not sufficient/u);
assert.match(closeout, /effective ACL/u);
assert.match(closeout, /separate explicit approval/u);
assert.match(closeout, /securityStage8InventoryGate\.mjs" --phase pre/u);
assert.match(closeout, /securityStage8InventoryGate\.mjs" --phase post/u);
assert.match(closeout, /git -C "\$\{ROOT\}" show/u);
assert.match(closeout, /hash-object/u);
assert.match(closeout, /SOURCE_ROOT=\/opt\/clover\/worktrees/u);
assert.match(closeout, /security-stage8-closeout-\$\{TARGET_SHA\}/u);
assert.doesNotMatch(closeout, /S8_SOURCE="\$\{STAGING\}/u);
assert.match(closeout, /stat -c '%a'.*S8_SOURCE/u);
assert.match(closeout, /ROOT_BUNDLE="\/var\/lib\/clover-security-stage8/u);
assert.match(closeout, /\/usr\/bin\/bash "\$\{ROOT_BUNDLE\}\/scripts\/linux\/harden-deployment-artifacts\.sh" --dry-run/u);
assert.match(closeout, /\/usr\/bin\/bash "\$\{ROOT_BUNDLE\}\/scripts\/linux\/harden-deployment-artifacts\.sh" --apply/u);
assert.match(closeout, /\/usr\/bin\/sudo -u clover -- \/usr\/bin\/env -i PATH=\/usr\/bin:\/bin \/usr\/bin\/node/u);
assert.match(closeout, /chown root:clover "\$\{INVENTORY\}\.tmp"/u);
assert.match(closeout, /chmod 0440 "\$\{INVENTORY\}\.tmp"/u);
assert.match(closeout, /sha256sum --check "\$\{INVENTORY\}\.sha256"/u);
assert.doesNotMatch(closeout, /sudo -- (?:bash|node) scripts\//u);
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

assert.match(remediation, /BLOCKED \/ PLAN ONLY \/ NO REMEDIATION APPLIED/u);
assert.match(remediation, /595101cf369a02a0e1c1c83e442875fa19714cee/u);
assert.match(remediation, /de353f37eea428437d635df604742c60a54fc9b7c590245b9d084048478ab9a6/u);
assert.match(remediation, /\/opt\/clover\/worktrees/u);
assert.match(remediation, /exact registered\s+worktree removal/u);
assert.match(remediation, /unlink that one link\s+only/u);
assert.match(remediation, /git -C \/opt\/clover\/clover-app worktree remove/u);
assert.match(remediation, /unlink -- "\$\{RECOVERY_LINK\}"/u);
assert.match(remediation, /b3f31a3fc68303655c9ddda5c81488c3c834ce04/u);
assert.match(remediation, /989ebf819ba38e29e4478df8478b01d3b0b963d87f6ae48097ba0035de12a0fa/u);
assert.match(remediation, /\/var\/lib\/clover-security-stage8/u);
assert.match(remediation, /install_blob scripts\/linux\/harden-deployment-artifacts\.sh 0550/u);
assert.match(remediation, /install_blob scripts\/linux\/security_stage8_artifact_modes\.py 0550/u);
assert.doesNotMatch(remediation, /fchmod-allowlisted\.py/u);
assert.match(hardener, /HELPER="\$\{REPO_ROOT\}\/scripts\/linux\/security_stage8_artifact_modes\.py"/u);
assert.match(remediation, /\/usr\/bin\/git --no-replace-objects/u);
assert.match(remediation, /-c safe\.directory="\$\{REPO\}"/u);
assert.match(remediation, /realpath -e -- "\$\{REPO\}"/u);
assert.match(remediation, /stat -c '%U' -- "\$\{REPO\}"\)" = clover/u);
assert.match(remediation, /root:clover:750/u);
assert.match(remediation, /chown root:clover "\$\{destination\}\.tmp"/u);
assert.match(remediation, /chmod 0440 "\$\{INVENTORY\}\.tmp"/u);
assert.match(remediation, /test ! -L "\$\{BASE\}"/u);
assert.match(remediation, /realpath -e -- "\$\{BASE\}"/u);
assert.match(remediation, /test ! -L "\$\{TARGET_ROOT\}"/u);
assert.match(remediation, /realpath -e -- "\$\{TARGET_ROOT\}"/u);
assert.match(remediation, /test ! -e "\$\{BUNDLE\}" && test ! -L "\$\{BUNDLE\}"/u);
assert.match(remediation, /test ! -e "\$\{EVIDENCE_DIR\}" && test ! -L "\$\{EVIDENCE_DIR\}"/u);
const baseLinkGuard = remediation.indexOf('test ! -L "${BASE}"');
const baseCreation = remediation.indexOf('install -d -o root -g clover -m 0750 -- "${BASE}"');
const targetLinkGuard = remediation.indexOf('test ! -L "${TARGET_ROOT}"');
const targetCreation = remediation.indexOf('install -d -o root -g clover -m 0750 -- "${TARGET_ROOT}"');
assert.ok(baseLinkGuard >= 0 && baseLinkGuard < baseCreation, "BASE symlink guard must precede creation");
assert.ok(targetLinkGuard >= 0 && targetLinkGuard < targetCreation, "TARGET_ROOT symlink guard must precede creation");
assert.match(remediation, /\/usr\/bin\/sudo -u clover -- \/usr\/bin\/env -i PATH=\/usr\/bin:\/bin \/usr\/bin\/node/u);
assert.match(remediation, /getfacl --physical --absolute-names/u);
assert.match(remediation, /test "\$\{TARGET_SHA\}" = "595101cf369a02a0e1c1c83e442875fa19714cee"/u);
assert.match(remediation, /\$' D \.env\.production\\n M vite\.config\.js'/u);
assert.match(remediation, /getfacl` was confirmed absent/u);
assert.match(remediation, /one-time interactive privileged operator/u);
assert.match(remediation, /do not loosen directory modes/u);
assert.match(remediation, /Never suppress `NOT_ALLOWLISTED`/u);
assert.doesNotMatch(remediation, /rm\s+-rf/u);

for (const marker of [
  "SECURITY_STAGE8_CLOSEOUT_STATUS=PENDING",
  "PHASE1_STATUS=BLOCKED",
  "FAILED_PHASE1_TARGET_SHA=595101cf369a02a0e1c1c83e442875fa19714cee",
  "FAILED_INVENTORY_SHA256=de353f37eea428437d635df604742c60a54fc9b7c590245b9d084048478ab9a6",
  "FAILED_PHASE1_OBSERVED_AT_UTC=2026-09-25T19:34:23Z",
  "FAILED_PHASE1_LIVE_SHA=fdbd39152dcaf049da974ae329412001a472114f",
  "FAILED_PHASE1_API_PID=19354",
  "FAILED_PHASE1_UI_PID=19355",
  "FAILED_PHASE1_INDEX_SHA256=8555b3c47b90d8966b3d964ca4bcb814b6ccfb9ef82445411066601277db9a2b",
  "FAILED_PHASE1_UI_BUNDLE_SHA256=6456536a809a7f18e23788545f11cd0f815aba2c193bccf899fc24e17e67a4be",
  "FAILED_PHASE1_GETFACL=NOT_INSTALLED",
  "PRIVILEGED_BUNDLE_ROOT=/var/lib/clover-security-stage8",
  "SOURCE_ROOT=/opt/clover/worktrees",
  "PRIVILEGED_METADATA_AUDIT=REQUIRED",
  "TARGET_SHA=NOT_RECORDED",
  "HARDENING_APPLY=NOT_RUN",
  "PREPARE=NOT_RUN",
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
assert.equal(result.observedFailedPhase1.observedAtUtc, "2026-09-25T19:34:23Z");
assert.equal(result.observedFailedPhase1.liveSha, "fdbd39152dcaf049da974ae329412001a472114f");
assert.equal(result.observedFailedPhase1.inventorySha256, "de353f37eea428437d635df604742c60a54fc9b7c590245b9d084048478ab9a6");
assert.equal(result.observedFailedPhase1.getfacl, "NOT_INSTALLED");
assert.equal(result.apply.approved, false);
assert.equal(result.apply.hardeningApply, null);
assert.equal(result.prepare.reviewedInventorySha256, null);
assert.equal(result.prepare.phase1Status, null);
assert.equal(result.prepare.sourceRoot, "/opt/clover/worktrees");
assert.equal(result.prepare.privilegedBundleRoot, "/var/lib/clover-security-stage8");
assert.equal(result.prepare.privilegedMetadataAudit, null);
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
