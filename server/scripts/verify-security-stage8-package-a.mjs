import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(repoRoot, "scripts/linux/harden-deployment-artifacts.sh");
const hardener = readFileSync(script, "utf8");
const modeHelper = readFileSync(path.join(repoRoot, "scripts/linux/security_stage8_artifact_modes.py"), "utf8");
const launcher = readFileSync(path.join(repoRoot, "scripts/linux/run-target-deploy.sh"), "utf8");
const deploy = readFileSync(path.join(repoRoot, "scripts/linux/restart-api-ui.sh"), "utf8");
const deployNormalized = deploy.replaceAll("\r\n", "\n");
assert.match(launcher, /set -euo pipefail\s+umask 077/u);
assert.match(deploy, /set -euo pipefail\s+umask 077/u);
assert.match(deploy, /protect_sensitive_tree "\$\{LKG_ROOT\}\/dist"/u);
assert.match(deploy, /protect_sensitive_tree "\$\{STAGED_DIST\}"/u);
assert.match(modeHelper, /O_NOFOLLOW/u);
assert.match(modeHelper, /dir_fd=/u);
assert.match(modeHelper, /os\.fchmod/u);
assert.match(modeHelper, /fcntl\.flock/u);
assert.doesNotMatch(modeHelper, /rollback|ROLLED_BACK/u);
assert.match(hardener, /unsafe-rollback-disabled/u);
assert.match(hardener, /PYTHON_BIN="\/usr\/bin\/python3\.13"/u);
assert.doesNotMatch(hardener, /^\s*python3\s/mu);

const bash = process.env.CLOVER_DEPLOY_TEST_BASH || (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");
const root = mkdtempSync(path.join(tmpdir(), "clover-s8a-"));
const deployments = path.join(root, "deployments");
mkdirSync(path.join(deployments, "lkg"), { recursive: true });
mkdirSync(path.join(deployments, "db-backups"), { recursive: true, mode: 0o700 });
mkdirSync(path.join(deployments, "staging", "safe"), { recursive: true, mode: 0o700 });
if (process.platform !== "win32") {
  chmodSync(root, 0o755);
  chmodSync(deployments, 0o755);
  chmodSync(path.join(deployments, "lkg"), 0o755);
}
writeFileSync(path.join(deployments, "deploy.lock"), "");
const exposed = path.join(deployments, "lkg", "old.sqlite");
const protectedDb = path.join(deployments, "db-backups", "old.sqlite-wal");
const envFile = path.join(deployments, "staging", "safe", ".env");
const readonlyDb = path.join(deployments, "lkg", "readonly.db");
writeFileSync(exposed, "fixture-only\n");
writeFileSync(protectedDb, "fixture-only\n");
writeFileSync(envFile, "fixture-only\n");
writeFileSync(readonlyDb, "fixture-only\n");
chmodSync(exposed, 0o644); chmodSync(protectedDb, 0o644); chmodSync(envFile, 0o600); chmodSync(readonlyDb, 0o440);
const allowlist = path.join(root, "allowlist.txt");
const validAllowlist = "lkg/old.sqlite\nlkg/readonly.db\ndb-backups/old.sqlite-wal\nstaging/safe/.env\n";
writeFileSync(allowlist, validAllowlist);

const toBash = (value) => value.replaceAll("\\", "/").replace(/^([A-Za-z]):/u, (_m, d) => `/${d.toLowerCase()}`);
const run = (...args) => spawnSync(bash, [toBash(script), "--root", toBash(deployments), "--allowlist", toBash(allowlist), ...args.map(toBash)], {
  encoding: "utf8",
  env: { ...process.env, S8A_FIXTURE_MODE: "1" },
});
try {
  const functionStart = deployNormalized.indexOf("protect_sensitive_tree() {");
  const functionEnd = deployNormalized.indexOf("\n}\n\ncritical()", functionStart) + 3;
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const guardScript = path.join(root, "guard-fixture.sh");
  writeFileSync(guardScript, `#!/usr/bin/env bash\nset -euo pipefail\ndie() { echo "ERROR: $*" >&2; exit 9; }\n${deployNormalized.slice(functionStart, functionEnd)}\nprotect_sensitive_tree "$1"\n`);
  const copiedTree = path.join(root, "copied-tree");
  mkdirSync(copiedTree);
  const copiedSensitive = path.join(copiedTree, "copied.sqlite");
  writeFileSync(copiedSensitive, "fixture-only\n");
  chmodSync(copiedSensitive, 0o644);
  const guarded = spawnSync(bash, [toBash(guardScript), toBash(copiedTree)], { encoding: "utf8" });
  assert.equal(guarded.status, 9, `${guarded.stderr}\n${guarded.stdout}`);
  assert.match(guarded.stderr, process.platform === "win32"
    ? /sensitive deploy artifact mode verification failed|sensitive regular file refused/u
    : /sensitive regular file refused/u);
  if (process.platform !== "win32") assert.equal(statSync(copiedSensitive).mode & 0o777, 0o600);

  const outsideFixtureRefused = spawnSync(bash, [toBash(script), "--root", toBash(deployments), "--allowlist", toBash(allowlist), "--dry-run"], {
    encoding: "utf8",
    env: { ...process.env, S8A_FIXTURE_MODE: "0" },
  });
  assert.notEqual(outsideFixtureRefused.status, 0);
  assert.match(outsideFixtureRefused.stderr, /production-root-or-allowlist-mismatch/u);

  writeFileSync(allowlist, "../escape.sqlite\n");
  const traversalRefused = run("--dry-run");
  assert.notEqual(traversalRefused.status, 0);
  assert.match(traversalRefused.stderr, /invalid-allowlist-path/u);
  writeFileSync(allowlist, validAllowlist);

  const dry = run("--dry-run");
  assert.equal(dry.status, 0, `${dry.stderr}\n${dry.stdout}`);
  if (process.platform === "win32") {
    assert.match(dry.stdout, /BLOCKED_BY_PARENT_OTHER_BITS\|lkg\/old\.sqlite\|600/u);
  } else {
    assert.match(dry.stdout, /ACCESSIBLE_PERMISSION_CHAIN\|lkg\/old\.sqlite\|644/u);
  }
  assert.match(dry.stdout, /BLOCKED_BY_PARENT_OTHER_BITS\|db-backups\/old\.sqlite-wal\|(?:600|644)/u);
  assert.match(dry.stdout, /BLOCKED_BY_(?:PARENT|FILE)_OTHER_BITS\|staging\/safe\/\.env\|600/u);
  if (process.platform !== "win32") assert.equal(statSync(exposed).mode & 0o777, 0o644);

  const rollbackRefused = run("--rollback", toBash(path.join(root, "unsafe.plan")));
  assert.notEqual(rollbackRefused.status, 0);
  assert.match(rollbackRefused.stderr, /unsafe-rollback-disabled/u);

  if (process.platform !== "win32") {
    const applied = run("--apply");
    assert.equal(applied.status, 0, `${applied.stderr}\n${applied.stdout}`);
    assert.match(applied.stdout, /APPLIED\|lkg\/old\.sqlite\|600/u);
    assert.equal(statSync(exposed).mode & 0o777, 0o600);
    assert.equal(statSync(protectedDb).mode & 0o777, 0o600);
    assert.equal(statSync(readonlyDb).mode & 0o777, 0o600);

    const reapplied = run("--apply");
    assert.equal(reapplied.status, 0, `${reapplied.stderr}\n${reapplied.stdout}`);
    assert.equal(statSync(exposed).mode & 0o777, 0o600);

    const outside = path.join(root, "outside.sqlite");
    writeFileSync(outside, "fixture-only\n");
    const outsideMode = statSync(outside).mode & 0o777;
    const link = path.join(deployments, "lkg", "linked.sqlite");
    symlinkSync(outside, link);
    writeFileSync(allowlist, "lkg/linked.sqlite\n");
    const refused = run("--apply");
    assert.notEqual(refused.status, 0, "symlink apply must fail");
    assert.equal(statSync(outside).mode & 0o777, outsideMode, "symlink target mode changed");
  } else {
    console.log("S8A_LINUX_OPENAT_FCHMOD_FLOCK:NOT_VERIFIED_WINDOWS");
  }
  console.log(process.platform === "win32"
    ? "SECURITY_STAGE8_PACKAGE_A_VERIFY_PASS_WINDOWS_PORTABLE"
    : "SECURITY_STAGE8_PACKAGE_A_VERIFY_PASS");
} finally {
  rmSync(root, { recursive: true, force: true });
}
