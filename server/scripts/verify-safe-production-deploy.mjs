/**
 * Safe production deploy sandbox verifier.
 * NEVER mutates real /opt/clover/clover-app or live systemd units.
 *
 * Scenarios: build failure, success, health-failure rollback, rollback failure,
 * dirty source, invalid target, concurrent lock, build-tag mismatch,
 * no-live-build, no-unsafe-process-kill.
 */
import assert from "node:assert/strict";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workRoot = path.resolve(__dirname, "../..");
const SCRIPT = path.join(workRoot, "scripts/linux/restart-api-ui.sh");
const PRODUCTION_ROOT = "/opt/clover/clover-app";

assert.ok(existsSync(SCRIPT), "restart-api-ui.sh missing");
assert.notEqual(path.resolve(SCRIPT).startsWith(PRODUCTION_ROOT), true);

const scriptSrc = readFileSync(SCRIPT, "utf8");
assert.equal(/\bpkill\b/i.test(scriptSrc), false, "no pkill");
assert.equal(/\bnohup\b/i.test(scriptSrc), false, "no nohup");
assert.equal(/(^|[^a-zA-Z_])kill\s+-9\b/m.test(scriptSrc), false, "no kill -9");
assert.equal(/systemctl/i.test(scriptSrc), true, "systemd-only restart path present");
assert.ok(scriptSrc.includes("TARGET_SHA"), "requires target SHA");
assert.ok(scriptSrc.includes("rollback"), "must implement rollback");
assert.ok(
  !/^\s*cd "\$ROOT"\s*$[\s\S]*?^\s*npm run build/m.test(scriptSrc) ||
    scriptSrc.includes("BUILD_WT"),
  "must not build directly in live ROOT"
);
assert.ok(scriptSrc.includes("BUILD_WT") || scriptSrc.includes("worktree"), "off-live build worktree");
assert.ok(scriptSrc.includes("STAGED_DIST") || scriptSrc.includes("staged"), "staged dist");
console.log("STATIC_CONTRACT:PASS");

function sh(cmd, opts = {}) {
  return spawnSync("bash", ["-lc", cmd], {
    encoding: "utf8",
    ...opts,
  });
}

function writeExec(file, body) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

function initSandbox(label) {
  const root = mkdtempSync(path.join(tmpdir(), `clover-deploy-${label}-`));
  const live = path.join(root, "live");
  const staging = path.join(root, "staging");
  const lkg = path.join(root, "lkg");
  const bin = path.join(root, "bin");
  const state = path.join(root, "state");
  mkdirSync(live, { recursive: true });
  mkdirSync(staging, { recursive: true });
  mkdirSync(lkg, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(state, { recursive: true });
  mkdirSync(path.join(live, "server/data"), { recursive: true });
  mkdirSync(path.join(live, "server/src"), { recursive: true });
  mkdirSync(path.join(live, "dist"), { recursive: true });
  mkdirSync(path.join(live, "node_modules"), { recursive: true });
  mkdirSync(path.join(live, "server/node_modules"), { recursive: true });
  writeFileSync(path.join(live, "server/data/clover.sqlite"), "");
  writeFileSync(
    path.join(live, "dist/index.html"),
    `<meta name="clover-ui-build" content="ui-OLD"><script src="/assets/index-OLD.js"></script>`
  );
  writeFileSync(path.join(live, "dist/sitemap.xml"), "<urlset></urlset>");
  writeFileSync(path.join(live, "package.json"), JSON.stringify({ scripts: { build: "node ./fake-build.js" } }));
  writeFileSync(path.join(live, "server/src/server.js"), "console.log('api-old')\n");

  // Fake git repo with two commits.
  execFileSync("git", ["init"], { cwd: live });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: live });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: live });
  execFileSync("git", ["add", "-A"], { cwd: live });
  execFileSync("git", ["commit", "-m", "old"], { cwd: live });
  const oldSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: live, encoding: "utf8" }).trim();

  writeFileSync(path.join(live, "server/src/server.js"), "console.log('api-new')\n");
  writeFileSync(path.join(live, "marker-new.txt"), "new\n");
  // Keep package.json build script.
  writeFileSync(
    path.join(live, "fake-build.js"),
    `
const fs = require('fs');
const path = require('path');
const out = path.join(process.cwd(), 'dist');
fs.mkdirSync(out, { recursive: true });
const tag = process.env.FAKE_BUILD_TAG || 'ui-NEW';
const js = process.env.FAKE_BUILD_JS || '/assets/index-NEW.js';
fs.writeFileSync(path.join(out, 'index.html'), '<meta name="clover-ui-build" content="' + tag + '"><script src="' + js + '"></script>');
fs.writeFileSync(path.join(out, 'sitemap.xml'), '<urlset><url><loc>https://example.test/</loc></url></urlset>');
if (process.env.FAKE_BUILD_FAIL === '1') {
  console.error('fake build fail');
  process.exit(1);
}
`
  );
  execFileSync("git", ["add", "-A"], { cwd: live });
  execFileSync("git", ["commit", "-m", "new"], { cwd: live });
  const newSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: live, encoding: "utf8" }).trim();
  execFileSync("git", ["reset", "--hard", oldSha], { cwd: live });

  // Restore live dist as OLD after reset (git may not track dist).
  writeFileSync(
    path.join(live, "dist/index.html"),
    `<meta name="clover-ui-build" content="ui-OLD"><script src="/assets/index-OLD.js"></script>`
  );
  writeFileSync(path.join(live, "dist/sitemap.xml"), "<urlset></urlset>");

  writeFileSync(path.join(state, "health"), "ok\n");
  writeFileSync(path.join(state, "tag"), "match\n");
  writeFileSync(path.join(state, "units"), "loaded\n");
  writeFileSync(path.join(state, "restart_count"), "0\n");

  writeExec(
    path.join(bin, "systemctl"),
    `#!/usr/bin/env bash
set -euo pipefail
STATE="${state}"
if [[ "\${1:-}" == "show" ]]; then
  if grep -q fail-load "\$STATE/units" 2>/dev/null; then echo LoadState=not-found; exit 0; fi
  echo LoadState=loaded; exit 0
fi
if [[ "\${1:-}" == "is-active" ]]; then
  if grep -q inactive "\$STATE/units" 2>/dev/null; then exit 1; fi
  exit 0
fi
exit 0
`
  );
  writeExec(
    path.join(bin, "sudo-systemctl"),
    `#!/usr/bin/env bash
set -euo pipefail
STATE="${state}"
# emulate: sudo -n /bin/systemctl restart api ui
n=\$(cat "\$STATE/restart_count")
echo \$((n+1)) > "\$STATE/restart_count"
if grep -q fail-restart "\$STATE/units" 2>/dev/null; then echo restart-failed >&2; exit 1; fi
exit 0
`
  );
  writeExec(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
STATE="${state}"
URL="\${@: -1}"
LIVE_HTML=""
if [[ -n "\${CURL_LIVE_DIST:-}" && -f "\${CURL_LIVE_DIST}/index.html" ]]; then
  LIVE_HTML="\$(cat "\${CURL_LIVE_DIST}/index.html")"
fi
# Force mismatched tag for post-cutover validation tests.
if grep -q mismatch "\$STATE/tag" 2>/dev/null && [[ "\$URL" != *"/api/health"* ]]; then
  echo '<meta name="clover-ui-build" content="ui-WRONG"><script src="/assets/index-WRONG.js"></script>'
  exit 0
fi
# After rollback, live dist is OLD — treat as healthy again.
if [[ "\$LIVE_HTML" == *"ui-OLD"* ]]; then
  if [[ "\$URL" == *"/api/health"* ]]; then
    echo '{"ok":true}'
    exit 0
  fi
  echo "\$LIVE_HTML"
  exit 0
fi
if [[ "\$URL" == *"/api/health"* ]]; then
  if grep -q fail-api "\$STATE/health" 2>/dev/null; then exit 1; fi
  echo '{"ok":true}'
  exit 0
fi
if grep -q fail-ui "\$STATE/health" 2>/dev/null; then exit 1; fi
if [[ -n "\$LIVE_HTML" ]]; then
  echo "\$LIVE_HTML"
  exit 0
fi
echo '<meta name="clover-ui-build" content="ui-NEW"><script src="/assets/index-NEW.js"></script>'
`
  );
  writeExec(
    path.join(bin, "npm"),
    `#!/usr/bin/env bash
set -euo pipefail
# Only support "run build"
if [[ "\${1:-}" == "run" && "\${2:-}" == "build" ]]; then
  if [[ "\${FAKE_BUILD_FAIL:-0}" == "1" ]]; then
    echo "fake npm build fail" >&2
    exit 1
  fi
  node ./fake-build.js
  exit \$?
fi
echo "unsupported npm args: $*" >&2
exit 2
`
  );

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    CLOVER_DEPLOY_ROOT: live,
    CLOVER_DEPLOY_STAGING: staging,
    CLOVER_DEPLOY_LKG: lkg,
    CLOVER_DEPLOY_LOCK: path.join(root, "deploy.lock"),
    CLOVER_DEPLOY_GIT: "git",
    CLOVER_DEPLOY_NPM: path.join(bin, "npm"),
    CLOVER_DEPLOY_SYSTEMCTL: path.join(bin, "systemctl"),
    CLOVER_DEPLOY_SUDO_SYSTEMCTL: path.join(bin, "sudo-systemctl"),
    CLOVER_DEPLOY_CURL: path.join(bin, "curl"),
    CLOVER_DEPLOY_HEALTH_API: "http://127.0.0.1:4100/api/health",
    CLOVER_DEPLOY_HEALTH_UI: "http://127.0.0.1:5273/",
    CLOVER_DEPLOY_HEALTH_ATTEMPTS: "3",
    CLOVER_DEPLOY_DB_PATH: path.join(live, "server/data/clover.sqlite"),
    CLOVER_DEPLOY_API_UNIT: "clover-api.service",
    CLOVER_DEPLOY_UI_UNIT: "clover-ui.service",
    CURL_LIVE_DIST: path.join(live, "dist"),
  };

  return { root, live, staging, lkg, bin, state, oldSha, newSha, env };
}

function runDeploy(box, targetSha, extraEnv = {}) {
  return spawnSync("bash", [SCRIPT, targetSha], {
    encoding: "utf8",
    env: { ...box.env, ...extraEnv },
  });
}

function liveSha(box) {
  return execFileSync("git", ["-C", box.live, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function liveTag(box) {
  const html = readFileSync(path.join(box.live, "dist/index.html"), "utf8");
  const m = html.match(/content="([^"]+)"/);
  return m ? m[1] : "";
}

// --- A. BUILD FAILURE ---
{
  const box = initSandbox("buildfail");
  const before = liveSha(box);
  const beforeTag = liveTag(box);
  const res = runDeploy(box, box.newSha, { FAKE_BUILD_FAIL: "1" });
  assert.notEqual(res.status, 0, "build failure must non-zero");
  assert.equal(liveSha(box), before, "source unchanged on build failure");
  assert.equal(liveTag(box), beforeTag, "dist unchanged on build failure");
  assert.equal(readFileSync(path.join(box.state, "restart_count"), "utf8").trim(), "0");
  console.log("A_BUILD_FAILURE:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- B. SUCCESS ---
{
  const box = initSandbox("success");
  const res = runDeploy(box, box.newSha);
  assert.equal(res.status, 0, `success deploy failed: ${res.stderr}\n${res.stdout}`);
  assert.equal(liveSha(box), box.newSha);
  assert.equal(liveTag(box), "ui-NEW");
  assert.ok(Number(readFileSync(path.join(box.state, "restart_count"), "utf8").trim()) >= 1);
  assert.match(res.stdout, /Deploy OK/);
  console.log("B_SUCCESS:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- C. HEALTH FAILURE AFTER CUTOVER -> rollback ---
{
  const box = initSandbox("healthfail");
  writeFileSync(path.join(box.state, "health"), "fail-api\n");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0, "health failure must fail deploy");
  assert.equal(liveSha(box), box.oldSha, "source rolled back");
  assert.equal(liveTag(box), "ui-OLD", "dist rolled back");
  assert.doesNotMatch(res.stdout + res.stderr, /^Deploy OK\.$/m);
  console.log("C_HEALTH_FAILURE_ROLLBACK:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- D. ROLLBACK FAILURE (LKG missing after cutover start) ---
{
  const box = initSandbox("rollbackfail");
  // Make health fail and destroy LKG mid-flight by pointing LKG to unwritable/missing after build:
  // Simpler: fail restart during rollback by clearing LKG dist via wrapper.
  // Force health fail and remove LKG after successful staged build by using a npm that deletes LKG.
  writeExec(
    path.join(box.bin, "npm"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "run" && "\${2:-}" == "build" ]]; then
  node ./fake-build.js
  rm -rf "${box.lkg}/dist"
  exit 0
fi
exit 2
`
  );
  writeFileSync(path.join(box.state, "health"), "fail-api\n");
  const res = runDeploy(box, box.newSha);
  assert.equal(res.status, 3, "rollback failure must be CRITICAL exit 3");
  assert.match(res.stderr, /CRITICAL/);
  assert.doesNotMatch(res.stdout, /Deploy OK/);
  console.log("D_ROLLBACK_FAILURE:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- E. DIRTY TRACKED SOURCE ---
{
  const box = initSandbox("dirty");
  writeFileSync(path.join(box.live, "server/src/server.js"), "console.log('dirty')\n");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /local modifications|tracked source/i);
  assert.equal(liveSha(box), box.oldSha);
  console.log("E_DIRTY_SOURCE:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- F. INVALID TARGET ---
{
  const box = initSandbox("invalid");
  const res = runDeploy(box, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  assert.notEqual(res.status, 0);
  assert.equal(liveSha(box), box.oldSha);
  console.log("F_INVALID_TARGET:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- G. CONCURRENT DEPLOY ---
{
  const box = initSandbox("lock2");
  const lock = box.env.CLOVER_DEPLOY_LOCK;
  const { spawn } = await import("node:child_process");
  const child = spawn("bash", ["-c", `exec 9>"${lock}"; flock -n 9 || exit 9; sleep 20`], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  await new Promise((r) => setTimeout(r, 200));
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /another deployment|lock/i);
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      // ignore
    }
  }
  console.log("G_CONCURRENT_DEPLOY:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- H. BUILD TAG MISMATCH ---
{
  const box = initSandbox("tagmismatch");
  writeFileSync(path.join(box.state, "tag"), "mismatch\n");
  const res = runDeploy(box, box.newSha);
  assert.notEqual(res.status, 0);
  assert.equal(liveSha(box), box.oldSha, "tag mismatch rolls back source");
  assert.equal(liveTag(box), "ui-OLD", "tag mismatch rolls back dist");
  console.log("H_BUILD_TAG_MISMATCH:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- I. NO LIVE BUILD ---
{
  const box = initSandbox("nolivebuild");
  // Instrument npm to flag if cwd is live ROOT
  writeExec(
    path.join(box.bin, "npm"),
    `#!/usr/bin/env bash
set -euo pipefail
pwd > "${box.state}/npm-cwd"
if [[ "\$(pwd)" == "${box.live}" ]]; then
  echo "BUILT_IN_LIVE_ROOT" >&2
  exit 9
fi
if [[ "\${1:-}" == "run" && "\${2:-}" == "build" ]]; then
  node ./fake-build.js
  exit \$?
fi
exit 2
`
  );
  const res = runDeploy(box, box.newSha);
  assert.equal(res.status, 0, res.stderr);
  const cwd = readFileSync(path.join(box.state, "npm-cwd"), "utf8").trim();
  assert.notEqual(cwd, box.live);
  assert.ok(cwd.includes("src-"), `build cwd should be worktree, got ${cwd}`);
  console.log("I_NO_LIVE_BUILD:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

// --- J. already covered statically; also ensure short SHA rejected ---
{
  const box = initSandbox("shortsha");
  const res = runDeploy(box, box.newSha.slice(0, 12));
  assert.notEqual(res.status, 0);
  console.log("J_NO_UNSAFE_PROCESS_AND_SHORT_SHA:PASS");
  rmSync(box.root, { recursive: true, force: true });
}

console.log("SAFE_PRODUCTION_DEPLOY_VERIFY_PASS");
