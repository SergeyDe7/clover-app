import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
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

assert.match(closeout, /PASS — PRODUCTION APPLY, PROMOTE, POST-AUDIT, AND EXTERNAL SMOKE COMPLETE/u);
assert.match(closeout, /f2d8083a9314adcac48ebbb64a52aeccf1abc98a/u);
assert.match(closeout, /baseline, not the production deployment target/u);
assert.match(closeout, /a573e749641607a855c127e7a138966165a8050f/u);
assert.match(closeout, /all 17 allowlisted regular files are mode `0600`/u);
assert.match(closeout, /no extended or default ACL entry/u);
assert.match(closeout, /expectedLocaleStamp=enabled/u);
assert.match(closeout, /expectedMetrikaEnabled=on/u);
assert.match(closeout, /desktop `1280x720` and mobile `390x844`/u);
assert.match(closeout, /No residual item remains unverified/u);
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

assert.match(remediation, /PHASE 1 REMEDIATION COMPLETED \/ PREPARE NOT RUN \/ APPLY NOT RUN/u);
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
assert.match(remediation, /\("scripts\/linux\/harden-deployment-artifacts\.sh", 6591,/u);
assert.match(remediation, /\("scripts\/linux\/security_stage8_artifact_modes\.py", 4924,/u);
assert.doesNotMatch(remediation, /fchmod-allowlisted\.py/u);
assert.match(hardener, /HELPER="\$\{REPO_ROOT\}\/scripts\/linux\/security_stage8_artifact_modes\.py"/u);
assert.match(remediation, /APPROVED_TARGET_SHA/u);
assert.match(remediation, /GitHub PR merge result/u);
assert.match(remediation, /GIT_NO_LAZY_FETCH=1/u);
assert.match(remediation, /git --no-replace-objects -C "\$\{REPO\}" merge-base --is-ancestor/u);
assert.match(remediation, /realpath -e -- "\$\{REPO\}"/u);
assert.match(remediation, /stat -c '%U' -- "\$\{REPO\}"\)" = clover/u);
assert.match(remediation, /Root must never invoke Git/u);
const unprivilegedExportMatch = remediation.match(
  /As unprivileged user `clover`[\s\S]*?```bash\r?\n([\s\S]*?)\r?\n```/u
);
assert.ok(unprivilegedExportMatch, "unprivileged export block must exist");
const unprivilegedExportBlock = unprivilegedExportMatch[1];
assert.match(unprivilegedExportBlock, /EXPORT_DIRECTORIES=\(/u);
for (const directory of [
  '"${EXPORT_ROOT}/scripts"',
  '"${EXPORT_ROOT}/scripts/linux"',
  '"${EXPORT_ROOT}/server"',
  '"${EXPORT_ROOT}/server/scripts"',
  '"${EXPORT_ROOT}/ops"',
  '"${EXPORT_ROOT}/ops/security-stage8"',
  '"${EXPORT_ROOT}/ops/security-stage8/package-a"',
]) {
  assert.ok(unprivilegedExportBlock.includes(directory), `export directory must be explicit: ${directory}`);
}
assert.match(unprivilegedExportBlock, /stat -c '%U:%G:%a'.*clover:clover:700/u);
assert.doesNotMatch(unprivilegedExportBlock, /install -d -m 0700 -- "\$\(dirname/u);
const privilegedBundleMatch = remediation.match(
  /Only after that unprivileged export succeeds[\s\S]*?```bash\r?\n([\s\S]*?)\r?\n```/u
);
assert.ok(privilegedBundleMatch, "privileged bundle block must exist");
const privilegedBundleBlock = privilegedBundleMatch[1];
assert.match(privilegedBundleBlock, /BUNDLE_DIRECTORIES=\(/u);
for (const directory of [
  '"${BUNDLE}"',
  '"${BUNDLE}/scripts"',
  '"${BUNDLE}/scripts/linux"',
  '"${BUNDLE}/server"',
  '"${BUNDLE}/server/scripts"',
  '"${BUNDLE}/ops"',
  '"${BUNDLE}/ops/security-stage8"',
  '"${BUNDLE}/ops/security-stage8/package-a"',
  '"${EVIDENCE_DIR}"',
]) {
  assert.ok(privilegedBundleBlock.includes(directory), `bundle directory must be explicit: ${directory}`);
}
assert.match(privilegedBundleBlock, /stat -c '%U:%G:%a'.*root:clover:750/u);
assert.doesNotMatch(privilegedBundleBlock, /(?:^|\s)(?:\/usr\/bin\/)?git(?:\s|$)/mu);
assert.doesNotMatch(privilegedBundleBlock, /\.git(?:\/|\s|$)/mu);
for (const digest of [
  "60016601d5dcb97996aa6a42b56049defd81fb9cd89008f1e77dcc480cf53cef",
  "9f77dd3524146e60b12b52d2a996c9527b6401516141fea4a886404d6d2aa286",
  "77331fdea55484b7f30dcdedfb27cd6f7aeb68d97443c509046985d03ec6b98c",
  "14d44f33ba2eab8efa923750a69fd4a426f6e7d6a6e2686673c64d734eb7dbb9",
]) {
  assert.ok(remediation.split(digest).length >= 3, `digest must pin export and privileged import: ${digest}`);
}
assert.match(privilegedBundleBlock, /\/usr\/bin\/python3 -I -/u);
assert.match(privilegedBundleBlock, /os\.O_DIRECTORY \| os\.O_NOFOLLOW/u);
assert.match(privilegedBundleBlock, /os\.O_NONBLOCK \| os\.O_NOFOLLOW/u);
assert.match(privilegedBundleBlock, /source_details\.st_size/u);
assert.match(privilegedBundleBlock, /if os\.read\(source_fd, 1\)/u);
assert.match(privilegedBundleBlock, /independent SHA-256 mismatch/u);
assert.match(privilegedBundleBlock, /os\.O_EXCL \| os\.O_NOFOLLOW/u);
assert.match(privilegedBundleBlock, /os\.fchown\(destination_fd, destination_uid, clover_gid\)/u);
for (const expectedSize of [6591, 4924, 4398, 1270]) {
  assert.match(privilegedBundleBlock, new RegExp(`, ${expectedSize},`, "u"));
}
assert.doesNotMatch(privilegedBundleBlock, /safe\.directory/u);
assert.doesNotMatch(remediation, /test "\$\{TARGET_SHA\}" = "595101cf369a02a0e1c1c83e442875fa19714cee"/u);
assert.match(remediation, /root:clover:750/u);
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
assert.match(remediation, /\$' D \.env\.production\\n M vite\.config\.js'/u);
assert.match(remediation, /getfacl` was confirmed absent/u);
assert.match(remediation, /one-time interactive privileged operator/u);
assert.match(remediation, /do not loosen directory modes/u);
assert.match(remediation, /Never suppress `NOT_ALLOWLISTED`/u);
assert.doesNotMatch(remediation, /rm\s+-rf/u);

for (const marker of [
  "SECURITY_STAGE8_CLOSEOUT_STATUS=PASS",
  "PHASE1_STATUS=PASS",
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
  "PRIVILEGED_METADATA_AUDIT=PASS",
  "PRIVILEGED_BUNDLE_SOURCE_SHA=2566b67039ad654c0d365518ab26f27a528b100c",
  "TARGET_SHA=a573e749641607a855c127e7a138966165a8050f",
  "TARGET_SHA_SOURCE=GITHUB_PR_179_MERGE_RESULT",
  "OPERATOR_EXPORT_ROOT=/opt/clover/worktrees/security-stage8-operator-export-2566b67039ad654c0d365518ab26f27a528b100c",
  "OPERATOR_BUNDLE_SHA256=VERIFIED",
  "REVIEWED_INVENTORY_SHA256=cb1e7abb66b8a7c0e9f87efd3faf0cc4ae18c7fd9dd674d935d5fe45ec6e6952",
  "ACL_PRE_SHA256=1496516c800e0fb54f31fc14676a096c4a2408e496d93fd260e8df1a52d08f14",
  "HARDENING_APPLY=PASS",
  "POST_APPLY_INVENTORY_SHA256=cb1e7abb66b8a7c0e9f87efd3faf0cc4ae18c7fd9dd674d935d5fe45ec6e6952",
  "ALLOWLISTED_REGULAR_FILES_0600=PASS_17_OF_17",
  "PREPARE=PASS",
  "PREPARED_MANIFEST_SHA256=e20fe30c7beaea6996f70f62a0fada436e6c3785909115264fdc3e1f1efe5728",
  "PREPARED_EXPECTED_LOCALE_STAMP=enabled",
  "PREPARED_EXPECTED_METRIKA_ENABLED=on",
  "LAST_KNOWN_GOOD_PATH=/opt/clover/deployments/lkg/security-stage8-20260925T212649Z-fdbd39152dcaf049da974ae329412001a472114f",
  "PREVIOUS_UI_TAG=ui-20260924uB0fzjIT",
  "PREVIOUS_UI_BUNDLE=/assets/20260924uB0fzjIT/index-GaRMwR1l.js",
  "PROMOTE=PASS",
  "DEPLOYED_UI_TAG=ui-20260925I49u0uCM",
  "DESKTOP_SMOKE=PASS_1280x720",
  "MOBILE_SMOKE=PASS_390x844_NO_HORIZONTAL_OVERFLOW",
  "RESIDUAL_NOT_VERIFIED=NONE",
  "PERMISSION_ROLLBACK=FORBIDDEN",
]) {
  assert.match(installResult, new RegExp(marker, "u"));
}
assert.doesNotMatch(installResult, /PASSWORD|SECRET|TOKEN|API_KEY|JWT/iu);

assert.equal(result.schema, "clover-security-stage8-closeout/v1");
assert.equal(result.status, "PASS");
assert.equal(result.candidateSourceSha, "f2d8083a9314adcac48ebbb64a52aeccf1abc98a");
assert.equal(result.targetSha, "a573e749641607a855c127e7a138966165a8050f");
assert.equal(result.targetShaSource, "GitHub PR #179 merge result");
assert.equal(result.observedFailedPhase1.observedAtUtc, "2026-09-25T19:34:23Z");
assert.equal(result.observedFailedPhase1.liveSha, "fdbd39152dcaf049da974ae329412001a472114f");
assert.equal(result.observedFailedPhase1.inventorySha256, "de353f37eea428437d635df604742c60a54fc9b7c590245b9d084048478ab9a6");
assert.equal(result.observedFailedPhase1.getfacl, "NOT_INSTALLED");
assert.equal(result.apply.approved, true);
assert.equal(result.apply.hardeningApply, "PASS");
assert.equal(result.prepare.reviewedInventorySha256, "cb1e7abb66b8a7c0e9f87efd3faf0cc4ae18c7fd9dd674d935d5fe45ec6e6952");
assert.equal(result.prepare.phase1Status, "PASS");
assert.equal(result.prepare.sourceRoot, "/opt/clover/worktrees");
assert.equal(result.prepare.operatorExportRoot, "/opt/clover/worktrees/security-stage8-operator-export-2566b67039ad654c0d365518ab26f27a528b100c");
assert.equal(result.prepare.privilegedBundleRoot, "/var/lib/clover-security-stage8");
assert.equal(result.prepare.operatorBundleSha256Verified, true);
assert.deepEqual(result.prepare.operatorBundleExpectedSha256, {
  "scripts/linux/harden-deployment-artifacts.sh": "60016601d5dcb97996aa6a42b56049defd81fb9cd89008f1e77dcc480cf53cef",
  "scripts/linux/security_stage8_artifact_modes.py": "9f77dd3524146e60b12b52d2a996c9527b6401516141fea4a886404d6d2aa286",
  "server/scripts/securityStage8InventoryGate.mjs": "77331fdea55484b7f30dcdedfb27cd6f7aeb68d97443c509046985d03ec6b98c",
  "ops/security-stage8/package-a/deployment-sensitive-files.allowlist": "14d44f33ba2eab8efa923750a69fd4a426f6e7d6a6e2686673c64d734eb7dbb9",
});
assert.equal(result.prepare.privilegedMetadataAudit, "PASS");
assert.equal(result.prepare.privilegedBundleSourceSha, "2566b67039ad654c0d365518ab26f27a528b100c");
assert.equal(result.prepare.operatorFilesMatchDeployTarget, true);
assert.equal(result.prepare.manifestSha256, "e20fe30c7beaea6996f70f62a0fada436e6c3785909115264fdc3e1f1efe5728");
assert.ok(["enabled", "disabled"].includes(result.prepare.expectedLocaleStamp));
assert.ok(["on", "off"].includes(result.prepare.expectedMetrikaEnabled));
assert.equal(result.prepare.expectedLocaleStamp, "enabled");
assert.equal(result.prepare.expectedMetrikaEnabled, "on");
assert.equal(installResult.includes(`PREPARED_EXPECTED_LOCALE_STAMP=${result.prepare.expectedLocaleStamp}`), true);
assert.equal(installResult.includes(`PREPARED_EXPECTED_METRIKA_ENABLED=${result.prepare.expectedMetrikaEnabled}`), true);
assert.equal(result.apply.postApplyInventorySha256, "cb1e7abb66b8a7c0e9f87efd3faf0cc4ae18c7fd9dd674d935d5fe45ec6e6952");
assert.equal(result.apply.allowlistedRegularFiles0600, 17);
assert.equal(result.apply.promote, "PASS");
assert.equal(result.postcheck.liveShaMatches, true);
assert.equal(result.postcheck.trackedTreeClean, true);
assert.equal(result.postcheck.desktopSmoke, "PASS_1280x720");
assert.equal(result.postcheck.mobileSmoke, "PASS_390x844_NO_HORIZONTAL_OVERFLOW");
assert.equal(result.postcheck.browserConsoleWarningsAndErrors, 0);
assert.equal(result.rollback.preCutoverBackupPath, "/opt/clover/deployments/lkg/security-stage8-20260925T212649Z-fdbd39152dcaf049da974ae329412001a472114f");
assert.equal(result.rollback.preCutoverBackupSha256, "8d40177ab7be68b51b541a68fb8b755df2dce4e3b9cb05fe359f02e03a92157c");
assert.equal(result.rollback.lastKnownGoodPath, result.rollback.preCutoverBackupPath);
assert.equal(result.rollback.previousUiTag, "ui-20260924uB0fzjIT");
assert.equal(result.rollback.previousUiBundle, "/assets/20260924uB0fzjIT/index-GaRMwR1l.js");
assert.equal(result.rollback.permissionRollbackForbidden, true);
assert.equal(result.rollback.used, false);
assert.deepEqual(result.residualNotVerified, []);
assert.deepEqual(result.github.requiredChecks, ["frontend", "server"]);
assert.equal(result.github.actionsAppId, 15368);
assert.equal(result.github.rulesetId, 23989349);

const importerMatch = privilegedBundleBlock.match(/<<'PY'\r?\n([\s\S]*?)\r?\nPY/u);
assert.ok(importerMatch, "fd-based Python importer must be embedded in the privileged block");

if (process.platform === "linux") {
  const importer = importerMatch[1];
  const fixtureManifest = [
    ["scripts/linux/harden-deployment-artifacts.sh", 6591,
      "60016601d5dcb97996aa6a42b56049defd81fb9cd89008f1e77dcc480cf53cef", 0o550],
    ["scripts/linux/security_stage8_artifact_modes.py", 4924,
      "9f77dd3524146e60b12b52d2a996c9527b6401516141fea4a886404d6d2aa286", 0o550],
    ["server/scripts/securityStage8InventoryGate.mjs", 4398,
      "77331fdea55484b7f30dcdedfb27cd6f7aeb68d97443c509046985d03ec6b98c", 0o550],
    ["ops/security-stage8/package-a/deployment-sensitive-files.allowlist", 1270,
      "14d44f33ba2eab8efa923750a69fd4a426f6e7d6a6e2686673c64d734eb7dbb9", 0o440],
  ];
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "clover-s8-import-"));

  const mkdirTree = (directory, mode) => {
    mkdirSync(directory, { recursive: true, mode });
    let cursor = directory;
    while (cursor.startsWith(fixtureRoot) && cursor !== fixtureRoot) {
      chmodSync(cursor, mode);
      cursor = path.dirname(cursor);
    }
  };
  const makeFixture = (name) => {
    const fixture = path.join(fixtureRoot, name);
    const source = path.join(fixture, "source");
    const destination = path.join(fixture, "destination");
    mkdirTree(source, 0o700);
    mkdirTree(destination, 0o750);
    for (const [relative] of fixtureManifest) {
      const sourceFile = path.join(source, relative);
      const destinationFile = path.join(destination, relative);
      mkdirTree(path.dirname(sourceFile), 0o700);
      mkdirTree(path.dirname(destinationFile), 0o750);
      copyFileSync(path.join(root, relative), sourceFile);
      chmodSync(sourceFile, 0o400);
    }
    return { fixture, source, destination };
  };
  const runImporter = ({ source, destination }, timeout = 5000) => spawnSync(
    "/usr/bin/python3",
    [
      "-I", "-", source, destination,
      String(process.getuid()), String(process.getgid()), String(process.getuid()),
    ],
    { input: importer, encoding: "utf8", timeout }
  );

  try {
    const clean = makeFixture("clean");
    const cleanRun = runImporter(clean);
    assert.equal(cleanRun.status, 0, cleanRun.stderr || cleanRun.error?.message);
    for (const [relative, expectedSize, expectedSha256, expectedMode] of fixtureManifest) {
      const installed = path.join(clean.destination, relative);
      const bytes = readFileSync(installed);
      assert.equal(bytes.length, expectedSize);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSha256);
      assert.equal(lstatSync(installed).mode & 0o777, expectedMode);
    }

    const parentLink = makeFixture("parent-link");
    const outsideScripts = path.join(parentLink.fixture, "outside-scripts");
    rmSync(path.join(parentLink.source, "scripts"), { recursive: true });
    mkdirTree(outsideScripts, 0o700);
    symlinkSync(outsideScripts, path.join(parentLink.source, "scripts"));
    const parentLinkRun = runImporter(parentLink);
    assert.notEqual(parentLinkRun.status, 0, "parent symlink must fail closed");

    const modeDrift = makeFixture("parent-mode-drift");
    chmodSync(path.join(modeDrift.source, "scripts"), 0o755);
    const modeDriftRun = runImporter(modeDrift);
    assert.notEqual(modeDriftRun.status, 0, "0755 source parent must fail closed");

    const fifo = makeFixture("fifo");
    const fifoPath = path.join(fifo.source, fixtureManifest[0][0]);
    rmSync(fifoPath);
    const mkfifo = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
    assert.equal(mkfifo.status, 0, mkfifo.stderr);
    chmodSync(fifoPath, 0o400);
    const fifoRun = runImporter(fifo, 2000);
    assert.equal(fifoRun.signal, null, "FIFO fixture must not time out");
    assert.notEqual(fifoRun.status, 0, "FIFO must fail closed");

    const oversized = makeFixture("oversized");
    const oversizedPath = path.join(oversized.source, fixtureManifest[0][0]);
    const original = readFileSync(oversizedPath);
    chmodSync(oversizedPath, 0o600);
    writeFileSync(oversizedPath, Buffer.concat([original, Buffer.from("x")]));
    chmodSync(oversizedPath, 0o400);
    const oversizedRun = runImporter(oversized);
    assert.notEqual(oversizedRun.status, 0, "oversized source must fail closed");
    assert.equal(existsSync(path.join(oversized.destination, fixtureManifest[0][0])), false);
    assert.equal(existsSync(path.join(oversized.destination, `${fixtureManifest[0][0]}.tmp`)), false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

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

console.log("SECURITY_STAGE8_CLOSEOUT_FINAL_VERIFY_PASS");
