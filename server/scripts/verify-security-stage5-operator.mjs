import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareArtifact,
  repositoryRoot,
  sourceFiles,
  verifyArtifact,
} from "./securityStage5Artifact.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
assert.equal(root, repositoryRoot);

const operatorRel = "ops/security-stage5/scripts/promote-package-a.sh";
const operatorPath = path.join(root, ...operatorRel.split("/"));
const operator = readFileSync(operatorPath, "utf8");
const rollback = readFileSync(path.join(root, "ops/security-stage5/PROMOTE_ROLLBACK.md"), "utf8");

function findTool(names, args = ["-c", "echo ok"]) {
  for (const candidate of names) {
    try {
      execFileSync(candidate, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function findBash() {
  const bash = findTool([
    "bash",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ]);
  if (!bash) throw new Error("bash is required for Package A operator tests");
  return bash;
}

function toPosix(value) {
  const resolved = path.resolve(value);
  if (/^[A-Za-z]:[\\/]/.test(resolved)) {
    return `/${resolved[0].toLowerCase()}/${resolved.slice(3).split(path.sep).join("/")}`;
  }
  return resolved.split(path.sep).join("/");
}

function extractBashFunction(source, name) {
  const start = source.indexOf(`${name}() {`);
  assert.ok(start >= 0, `missing bash function ${name}`);
  let depth = 0;
  let end = -1;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  assert.ok(end > start, `unclosed bash function ${name}`);
  return source.slice(start, end);
}

function runBash(script, env = {}) {
  const bash = findBash();
  return execFileSync(bash, ["-lc", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
}

function runBashAllowFail(script, env = {}) {
  const bash = findBash();
  try {
    const stdout = execFileSync(bash, ["-lc", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
    };
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function writeExec(filePath, body) {
  writeFileSync(filePath, body.replace(/\r\n/g, "\n"));
}

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function extractBootstrap(text) {
  const marker = "sudo /bin/bash -c '";
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf(marker, searchFrom);
    assert.ok(start >= 0, "runbook must contain Package A sudo /bin/bash -c launcher");
    const bodyStart = start + marker.length;
    const bodyEnd = text.indexOf("\n' --", bodyStart);
    assert.ok(bodyEnd > bodyStart, "runbook bootstrap body must end before argument list");
    const body = text.slice(bodyStart, bodyEnd);
    if (body.includes("OPERATOR_REL=ops/security-stage5/scripts/promote-package-a.sh")) {
      assert.match(body, /--no-replace-objects/);
      assert.match(body, /\/usr\/bin\/git/);
      assert.match(body, /hash-object --no-filters/);
      assert.doesNotMatch(body, /\beval\b/);
      return body;
    }
    searchFrom = bodyEnd + 1;
  }
  assert.fail("Package A bootstrap body not found");
}

function extractVerifierPreamble(text) {
  const marker = "sudo /bin/bash -c '";
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf(marker, searchFrom);
    assert.ok(start >= 0, "runbook must contain verifier sudo /bin/bash -c preamble");
    const bodyStart = start + marker.length;
    const bodyEnd = text.indexOf("\n' --", bodyStart);
    assert.ok(bodyEnd > bodyStart, "verifier preamble body must end before argument list");
    const body = text.slice(bodyStart, bodyEnd);
    if (body.includes("VERIFIER_REL=server/scripts/securityStage5Artifact.mjs")) {
      assert.match(body, /--no-replace-objects/);
      assert.match(body, /hash-object --no-filters/);
      assert.match(body, /VERIFIER_BOOTSTRAP: PASS/);
      assert.doesNotMatch(body, /\beval\b/);
      assert.doesNotMatch(body, /\| sudo tee/);
      assert.doesNotMatch(body, /git show[^\n]*\|\s*(sudo\s+)?(tee|bash)/);
      return body;
    }
    searchFrom = bodyEnd + 1;
  }
  assert.fail("verifier preamble body not found");
}

export { extractVerifierPreamble };

function operatorArgs(cfg) {
  return [
    "--target",
    cfg.target,
    "--expected-manifest",
    cfg.expectedManifest,
    "--artifact",
    cfg.artifact,
    "--repo",
    cfg.repo,
    "--live",
    cfg.live,
    "--lock",
    cfg.lock,
    "--dest-root",
    cfg.destRoot,
    "--recovery",
    cfg.recovery,
  ]
    .map(quote)
    .join(" ");
}

function envExports(extraEnv) {
  return Object.entries(extraEnv)
    .map(([key, value]) => `export ${key}=${quote(value)}`)
    .join("\n");
}

function runPipedOperator(cfg, extraEnv, command) {
  const bash = findBash();
  const script = `${envExports(extraEnv)}
source ${quote(cfg.mocks)}
${command}
`;
  try {
    const stdout = execFileSync(bash, ["-lc", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv, PATH: cfg.path },
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
    };
  }
}

function runTtyOperator(cfg, extraEnv, args) {
  const bash = findBash();
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const blobPath = path.join(tmpdir(), `clover-op-blob-${stamp}`);
  const innerPath = path.join(tmpdir(), `clover-op-inner-${stamp}.sh`);
  const rcPath = path.join(tmpdir(), `clover-op-rc-${stamp}`);
  const donePath = path.join(tmpdir(), `clover-op-done-${stamp}`);
  const logPath = path.join(tmpdir(), `clover-op-log-${stamp}`);
  const posixBlob = toPosix(blobPath);
  const posixInner = toPosix(innerPath);
  const posixRc = toPosix(rcPath);
  const posixDone = toPosix(donePath);
  const posixLog = toPosix(logPath);
  writeExec(
    innerPath,
    `#!/usr/bin/env bash
${envExports(extraEnv)}
source ${quote(cfg.mocks)}
export PATH=${quote(cfg.path)}
bash -c "$(cat ${quote(cfg.bootstrapFile)})" -- ${args}
echo $? > ${quote(posixRc)}
echo DONE > ${quote(posixDone)}
`
  );
  const launcher = `if command -v script >/dev/null 2>&1; then
  script -q -c ${quote(`/usr/bin/bash ${posixInner}`)} /dev/null
elif command -v mintty >/dev/null 2>&1; then
  mintty -w min -h never -l ${quote(posixLog)} -- /usr/bin/bash ${quote(posixInner)}
  for i in $(seq 1 120); do
    [ -f ${quote(posixDone)} ] && break
    sleep 0.25
  done
else
  echo 'FAIL: neither script nor mintty is available for TTY tests' >&2
  exit 124
fi
if [ ! -f ${quote(posixDone)} ]; then
  echo 'FAIL: TTY launcher timed out' >&2
  exit 124
fi
exit "$(cat ${quote(posixRc)})"
`;
  try {
    const stdout = execFileSync(bash, ["-lc", launcher], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv, PATH: cfg.path },
    });
    const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    return { status: 0, stdout: `${stdout}${log}`, stderr: "" };
  } catch (error) {
    const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    return {
      status: error.status ?? 1,
      stdout: `${String(error.stdout || "")}${log}`,
      stderr: String(error.stderr || ""),
    };
  } finally {
    for (const file of [blobPath, innerPath, rcPath, donePath, logPath]) {
      try {
        rmSync(file, { force: true });
      } catch {
        // ignore leftover temp files
      }
    }
  }
}

function runOperator(cfg, extraEnv = {}, options = {}) {
  const args = operatorArgs(cfg);
  const blob = `git -C ${quote(cfg.repo)} show ${quote(`${cfg.target}:${operatorRel}`)}`;
  if (options.fileLaunch) {
    return runPipedOperator(cfg, extraEnv, `bash -- ${quote(options.fileLaunch)} ${args}`);
  }
  if (!options.tty) {
    return runPipedOperator(
      cfg,
      extraEnv,
      `bash -c "$(cat ${quote(cfg.bootstrapFile)})" -- ${args}`
    );
  }
  return runTtyOperator(cfg, extraEnv, args);
}

export function runSecurityStage5OperatorTests() {
  assert.ok(sourceFiles.includes(operatorRel), "operator must be in PREPARE allowlist");
  assert.match(operator, /^set -Eeuo pipefail$/m);
  assert.match(operator, /ROLLBACK_RUNNING=0/);
  assert.match(operator, /disable_recursive_traps/);
  assert.match(operator, /require_trusted_self/);
  assert.match(operator, /require_trusted_recovery/);
  assert.match(operator, /--no-replace-objects/);
  assert.match(operator, /hash-object --no-filters/);
  assert.doesNotMatch(operator, /git show \| sudo \/bin\/bash -s|require_bash_s_launch/);
  assert.match(operator, /readonly EXIT_PROMOTE_FAIL=40/);
  assert.match(operator, /readonly EXIT_ROLLBACK_INCOMPLETE=41/);
  assert.match(operator, /SNAPSHOT_LOCKED/);
  assert.match(operator, /git_blob_sha/);
  assert.match(operator, /verifier object id mismatch/);
  assert.match(operator, /10-umask\.conf is not a destination/);
  assert.match(operator, /STOP TIMER \(first change\)/);
  assert.ok(
    operator.indexOf("sha256sum -c api-20-hardening.conf.sha256") < operator.indexOf("CHANGED=1") &&
      operator.indexOf("sha256sum -c ui-20-hardening.conf.sha256") < operator.indexOf("CHANGED=1") &&
      operator.indexOf("sha256sum -c audit-retention.timer.sha256") < operator.indexOf("CHANGED=1") &&
      operator.indexOf("10-umask.conf.evidence.sha256") < operator.indexOf("CHANGED=1"),
    "backup hashes must be checked before CHANGED=1"
  );
  assert.doesNotMatch(operator, /sudo\s+-S\b|sudo\s+-v\b|exec sudo/);
  assert.doesNotMatch(operator, /CLOVER_OPERATOR_AS_ROOT=|SUDO_ASKPASS=|\/etc\/sudoers/);
  assert.match(operator, /unset CLOVER_OPERATOR_AS_ROOT SUDO_ASKPASS ASKPASS VERIFIER/);
  assert.doesNotMatch(operator, /while\s+true;/);
  assert.doesNotMatch(operator, /rm\s+-rf|pkill|kill\s+-9|\*\.conf/);
  assert.doesNotMatch(operator, /systemd-analyze[\s\S]{0,200}\|\|\s*true/);
  assert.match(operator, /HEALTH_FAIL api attempts=\$tries/);
  assert.match(operator, /HEALTH_FAIL ui attempts=\$tries/);
  assert.match(operator, /HEALTH_FAIL nginx attempts=\$tries/);
  assert.equal((operator.match(/tries=15/g) || []).length, 3);
  const analyzeVerify = operator.match(
    /systemd-analyze verify \\\n([\s\S]*?)\n\n  systemctl daemon-reload/
  );
  assert.ok(analyzeVerify, "systemd-analyze verify block must exist before daemon-reload");
  assert.match(analyzeVerify[1], /\/etc\/systemd\/system\/clover-api\.service/);
  assert.match(analyzeVerify[1], /\/etc\/systemd\/system\/clover-ui\.service/);
  assert.match(analyzeVerify[1], /\/etc\/systemd\/system\/clover-audit-retention\.timer/);
  assert.doesNotMatch(
    analyzeVerify[1],
    /\$DST_API|\$DST_UI|\$DST_TIMER|\.service\.d\/[^\s]+\.conf/,
    "drop-in snippets must not be passed to systemd-analyze as standalone units"
  );
  assert.doesNotMatch(operator, /\beval\b/);
  assert.match(rollback, /sudo \/bin\/bash -c '/);
  assert.match(rollback, /--no-replace-objects/);
  assert.match(rollback, /hash-object --no-filters/);
  assert.match(rollback, /VERIFIER_REL=server\/scripts\/securityStage5Artifact\.mjs/);
  assert.doesNotMatch(rollback, /git show[\s\S]{0,80}\| sudo \/bin\/bash -s/);
  assert.doesNotMatch(rollback, /\| sudo tee/);
  assert.match(rollback, /10-umask\.conf` is \*\*not\*\* a\s+destination/);
  assert.doesNotMatch(rollback, /restore_exact[^\n]*10-umask/);
  extractVerifierPreamble(rollback);
  for (const name of ["backup_exact", "restore_exact", "ensure_destination_dir", "rollback_created_dir"]) {
    assert.equal(
      extractBashFunction(operator, name).replace(/\r\n/g, "\n"),
      extractBashFunction(rollback, name).replace(/\r\n/g, "\n"),
      `${name} must match the runbook helper exactly`
    );
  }

  const bash = findBash();
  execFileSync(bash, ["-n", toPosix(operatorPath)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const emptyHash = runBashAllowFail(
    `set -Eeuo pipefail
     ${extractBashFunction(operator, "require_sha256")}
     require_sha256 empty ""
    `
  );
  assert.notEqual(emptyHash.status, 0, "empty hash must block continuation");

  const manifestHashFn = extractBashFunction(operator, "manifest_file_hash");
  assert.doesNotMatch(
    manifestHashFn,
    /sys\.exit\(1 if len\(hits\)!=1 else 0\)\s*\nprint\(hits\[0\]\)/,
    "manifest_file_hash must not exit before printing the single hit"
  );
  assert.match(
    manifestHashFn,
    /if len\(hits\)!=1:\s*\n\s*sys\.exit\(1\)\s*\nprint\(hits\[0\]\)/,
    "manifest_file_hash must print after the exact-one-hit gate"
  );

  const hashProbeDir = mkdtempSync(path.join(tmpdir(), "stage5-manifest-hash-"));
  const hashMockBin = mkdtempSync(path.join(tmpdir(), "stage5-manifest-hash-mock-"));
  try {
    const probePath = "ops/security-stage5/package-a/systemd/clover-api.service.d/20-hardening.conf";
    const probeHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const otherHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    writeFileSync(
      path.join(hashProbeDir, "manifest.json"),
      JSON.stringify({
        files: [
          { path: probePath, sha256: probeHash },
          { path: "ops/other.conf", sha256: otherHash },
        ],
      }),
      "utf8"
    );
    const mockPy = path.join(hashMockBin, "python3.mjs");
    writeFileSync(
      mockPy,
      `import { readFileSync } from "node:fs";
const dashC = process.argv.indexOf("-c");
const code = String(process.argv[dashC + 1] || "");
const fileArg = process.argv[dashC + 2];
const rel = process.argv[dashC + 3];
if (!code.includes("hits") || !code.includes("sha256")) {
  console.error("unexpected python3 payload");
  process.exit(2);
}
const data = JSON.parse(readFileSync(fileArg, "utf8"));
const hits = (data.files || []).filter((entry) => entry.path === rel).map((entry) => entry.sha256);
if (hits.length !== 1) process.exit(1);
if (code.includes("sys.exit(1 if len(hits)!=1 else 0)")) {
  console.error("python payload still exits before print");
  process.exit(3);
}
process.stdout.write(String(hits[0]) + "\\n");
`
    );
    const artifactPosix = toPosix(hashProbeDir);
    const mockPyPosix = toPosix(mockPy);
    const single = runBashAllowFail(
      `set -Eeuo pipefail
       python3() { node '${mockPyPosix}' "$@"; }
       export -f python3
       ARTIFACT='${artifactPosix}'
       ${manifestHashFn}
       out=$(manifest_file_hash '${probePath}')
       printf 'OUT=%s\\n' "$out"
       [ -n "$out" ] || exit 2
       [ "$out" = '${probeHash}' ] || exit 3
      `
    );
    assert.equal(single.status, 0, `single match must succeed: ${single.stderr || single.stdout}`);
    assert.match(single.stdout, new RegExp(`OUT=${probeHash}`));

    const missing = runBashAllowFail(
      `set -Eeuo pipefail
       python3() { node '${mockPyPosix}' "$@"; }
       export -f python3
       ARTIFACT='${artifactPosix}'
       ${manifestHashFn}
       manifest_file_hash 'missing/path.conf'
      `
    );
    assert.notEqual(missing.status, 0, "missing path must fail");
    assert.equal((missing.stdout || "").trim(), "", "missing path must not print a hash");

    writeFileSync(
      path.join(hashProbeDir, "manifest.json"),
      JSON.stringify({
        files: [
          { path: probePath, sha256: probeHash },
          { path: probePath, sha256: otherHash },
        ],
      }),
      "utf8"
    );
    const dup = runBashAllowFail(
      `set -Eeuo pipefail
       python3() { node '${mockPyPosix}' "$@"; }
       export -f python3
       ARTIFACT='${artifactPosix}'
       ${manifestHashFn}
       manifest_file_hash '${probePath}'
      `
    );
    assert.notEqual(dup.status, 0, "duplicate path entries must fail");
    assert.equal((dup.stdout || "").trim(), "", "duplicate path must not print a hash");
  } finally {
    rmSync(hashProbeDir, { recursive: true, force: true });
    rmSync(hashMockBin, { recursive: true, force: true });
  }

  const trapPrelude = `
set -Eeuo pipefail
EXIT_PROMOTE_FAIL=40
EXIT_ROLLBACK_INCOMPLETE=41
CHANGED=0
ROLLBACK_RUNNING=0
IN_CLEANUP=0
LOCK_HELD=0
ORIG_EXIT=0
PROMOTE_LOG=""
ROLLBACK_STATE=NOT_NEEDED
${extractBashFunction(operator, "log")}
${extractBashFunction(operator, "release_lock")}
${extractBashFunction(operator, "cleanup")}
${extractBashFunction(operator, "disable_recursive_traps")}
${extractBashFunction(operator, "finish_fail_after_change")}
${extractBashFunction(operator, "operator_on_err")}
${extractBashFunction(operator, "operator_on_signal")}
`;

  const afterInt = runBashAllowFail(
    `${trapPrelude}
     do_rollback() { echo ROLLBACK_RAN; return 0; }
     CHANGED=1
     trap 'operator_on_signal INT' INT
     kill -INT $$
    `
  );
  assert.equal(afterInt.status, 40, `INT after CHANGED must exit 40, got ${afterInt.status}`);
  assert.match(`${afterInt.stdout}${afterInt.stderr}`, /ROLLBACK_RAN/);

  const afterTerm = runBashAllowFail(
    `${trapPrelude}
     do_rollback() { echo ROLLBACK_RAN; return 0; }
     CHANGED=1
     trap 'operator_on_signal TERM' TERM
     kill -TERM $$
    `
  );
  assert.equal(afterTerm.status, 40, `TERM after CHANGED must exit 40, got ${afterTerm.status}`);
  assert.match(`${afterTerm.stdout}${afterTerm.stderr}`, /ROLLBACK_RAN/);

  const incomplete = runBashAllowFail(
    `${trapPrelude}
     do_rollback() { echo ROLLBACK_RAN; return 1; }
     CHANGED=1
     trap operator_on_err ERR
     false
    `
  );
  assert.equal(incomplete.status, 41, `rollback incomplete must exit 41, got ${incomplete.status}`);

  const recursive = runBashAllowFail(
    `${trapPrelude}
     count=0
     do_rollback() {
       count=$((count+1))
       echo ROLLBACK_COUNT=$count
       ROLLBACK_RUNNING=1
       false
     }
     CHANGED=1
     trap operator_on_err ERR
     false
    `
  );
  assert.equal(recursive.status, 41);
  assert.match(`${recursive.stdout}${recursive.stderr}`, /ROLLBACK_COUNT=1/);
  assert.doesNotMatch(`${recursive.stdout}${recursive.stderr}`, /ROLLBACK_COUNT=2/);

  const before = runBashAllowFail(
    `${trapPrelude}
     do_rollback() { echo ROLLBACK_RAN; return 0; }
     CHANGED=0
     trap 'operator_on_signal INT' INT
     kill -INT $$
    `
  );
  assert.equal(before.status, 130);
  assert.doesNotMatch(`${before.stdout}${before.stderr}`, /ROLLBACK_RAN/);

  const work = mkdtempSync(path.join(tmpdir(), "clover-stage5-op-run-"));
  try {
    const fixtureRoot = path.join(work, "source");
    const artifact = path.join(work, "artifact");
    const destRoot = path.join(work, "dest");
    const mockBin = path.join(work, "mock-bin");
    const stateDir = path.join(work, "state");
    mkdirSync(mockBin);
    mkdirSync(stateDir);
    mkdirSync(path.join(destRoot, "etc/systemd/system/clover-api.service.d"), { recursive: true });
    mkdirSync(path.join(destRoot, "etc/systemd/system/clover-ui.service.d"), { recursive: true });
    writeFileSync(path.join(destRoot, "etc/systemd/system/clover-api.service.d/20-hardening.conf"), "OLD-API\n");
    writeFileSync(path.join(destRoot, "etc/systemd/system/clover-ui.service.d/20-hardening.conf"), "OLD-UI\n");
    writeFileSync(
      path.join(destRoot, "etc/systemd/system/clover-audit-retention.timer"),
      "[Timer]\nUnit=clover-audit-retention-apply.service\n"
    );
    const umaskPath = path.join(destRoot, "etc/systemd/system/clover-api.service.d/10-umask.conf");
    writeFileSync(umaskPath, "[Service]\nUMask=0077\n");
    const umaskSha = sha256File(umaskPath);
    runBash(`chmod 0700 "${toPosix(path.join(destRoot, "etc/systemd/system/clover-api.service.d"))}" || true`);

    const fixtureFiles = [...sourceFiles, "server/scripts/securityStage5Artifact.mjs"];
    for (const relative of fixtureFiles) {
      const source = path.join(root, ...relative.split("/"));
      const destination = path.join(fixtureRoot, ...relative.split("/"));
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
    const mockGitPath = toPosix(path.join(mockBin, "trusted-git"));
    const fixtureOperator = path.join(fixtureRoot, ...operatorRel.split("/"));
    const patchedOperator = readFileSync(fixtureOperator, "utf8").replace(
      /if \[ -x \/usr\/bin\/git \]; then\r?\n  readonly TRUSTED_GIT=\/usr\/bin\/git\r?\nelif \[ -x \/mingw64\/bin\/git \]; then\r?\n  readonly TRUSTED_GIT=\/mingw64\/bin\/git\r?\nelse\r?\n  readonly TRUSTED_GIT=\/usr\/bin\/git\r?\nfi/,
      `readonly TRUSTED_GIT=${mockGitPath}`
    );
    assert.match(patchedOperator, new RegExp(`readonly TRUSTED_GIT=${mockGitPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    writeFileSync(fixtureOperator, patchedOperator);
    execFileSync("git", ["init", "--quiet"], { cwd: fixtureRoot });
    execFileSync("git", ["config", "user.email", "stage5-operator@example.invalid"], { cwd: fixtureRoot });
    execFileSync("git", ["config", "user.name", "Stage 5 Operator"], { cwd: fixtureRoot });
    execFileSync("git", ["add", "--", ...fixtureFiles], { cwd: fixtureRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "operator fixture"], { cwd: fixtureRoot });
    const fixtureSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fixtureRoot,
      encoding: "utf8",
    }).trim();
    const manifest = prepareArtifact({
      sourceRoot: fixtureRoot,
      output: artifact,
      targetSha: fixtureSha,
    });
    assert.ok(manifest.files.some((entry) => entry.path === operatorRel));
    verifyArtifact({ artifact, expectedSha: fixtureSha, sourceRoot: fixtureRoot });
    const expectedManifest = createHash("sha256")
      .update(readFileSync(path.join(artifact, "manifest.json")))
      .digest("hex")
      .toUpperCase();

    writeFileSync(
      path.join(mockBin, "python3.mjs"),
      `import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const dashC = process.argv.indexOf("-c");
const code = dashC >= 0 ? String(process.argv[dashC + 1] || "") : "";
const fileArg = process.argv[dashC + 2];
const extra = process.argv[dashC + 3];
if (code.includes("token_hex")) {
  process.stdout.write(randomBytes(8).toString("hex") + "\\n");
  process.exit(0);
}
if (code.includes('d.get("ok")')) {
  const data = JSON.parse(readFileSync(fileArg, "utf8"));
  process.exit(data.ok === true ? 0 : 1);
}
if (code.includes("releaseId")) {
  const data = JSON.parse(readFileSync(fileArg, "utf8"));
  process.stdout.write(String(data.releaseId || data.version || "") + "\\n");
  process.exit(0);
}
if (code.includes("files")) {
  const data = JSON.parse(readFileSync(fileArg, "utf8"));
  const hits = (data.files || []).filter((entry) => entry.path === extra).map((entry) => entry.sha256);
  if (hits.length !== 1) process.exit(1);
  process.stdout.write(String(hits[0]) + "\\n");
  process.exit(0);
}
if (code.includes("ui-")) {
  const text = readFileSync(fileArg, "utf8");
  const match = text.match(/ui-[A-Za-z0-9]+/);
  process.stdout.write((match ? match[0] : "") + "\\n");
  process.stdout.write(createHash("sha256").update(text, "utf8").digest("hex") + "\\n");
  process.exit(0);
}
console.error("unsupported python3 mock");
process.exit(1);
`
    );
    writeExec(
      path.join(mockBin, "python3"),
      `#!/usr/bin/env bash
exec node "${toPosix(path.join(mockBin, "python3.mjs"))}" "$@"
`
    );
    writeExec(
      path.join(mockBin, "install"),
      `#!/usr/bin/env bash
printf '%s\\n' "install $*" >> "${toPosix(stateDir)}/commands.log"
if [ "$1" = "-d" ]; then
  mkdir -p -- "\${@: -1}"
  exit 0
fi
src=""; dest=""
while [ $# -gt 0 ]; do
  case "$1" in
    -m) shift 2 ;;
    --) shift ;;
    *) if [ -z "$src" ]; then src="$1"; else dest="$1"; fi; shift ;;
  esac
done
cp -- "$src" "$dest"
`
    );
    writeExec(
      path.join(mockBin, "chmod"),
      `#!/usr/bin/env bash
printf '%s\\n' "chmod $*" >> "${toPosix(stateDir)}/commands.log"
if [ -f "${toPosix(stateDir)}/tamper.verifier" ]; then
  for arg in "$@"; do
    case "$arg" in
      *securityStage5Artifact*) printf '\\n# tampered-root-copy\\n' >> "$arg" ;;
    esac
  done
fi
if [ -f "${toPosix(stateDir)}/tamper.operator" ]; then
  for arg in "$@"; do
    case "$arg" in
      *promote-package-a.sh) printf '\\n# tampered-root-copy\\n' >> "$arg" ;;
    esac
  done
fi
exit 0
`
    );
    writeExec(
      path.join(mockBin, "stat"),
      `#!/usr/bin/env bash
STATE="${toPosix(stateDir)}"
if [ "$1" = "-c" ]; then
  target="\${3:-}"
  case "$2" in
    %a)
      if [ -f "$STATE/operator.mode.bad" ]; then
        case "$target" in *promote-package-a.sh) echo 755; exit 0 ;; esac
      fi
      if [ -f "$STATE/recovery.mode0755" ]; then
        case "$target" in
          *promote-package-a.sh|*securityStage5Artifact*) echo 500 ;;
          *) echo 755 ;;
        esac
        exit 0
      fi
      case "$target" in
        *promote-package-a.sh|*securityStage5Artifact*) echo 500 ;;
        *) echo 700 ;;
      esac
      ;;
    %U:%G)
      if [ -f "$STATE/recovery.owner.bad" ]; then
        case "$target" in
          *promote-package-a.sh|*securityStage5Artifact*) echo root:root ;;
          *) echo clover:clover ;;
        esac
        exit 0
      fi
      echo root:root
      ;;
    %u:%g)
      if [ -f "$STATE/recovery.owner.bad" ]; then
        case "$target" in
          *promote-package-a.sh|*securityStage5Artifact*) echo 0:0 ;;
          *) echo 1000:1000 ;;
        esac
        exit 0
      fi
      echo 0:0
      ;;
    %h) echo 1 ;;
    %F)
      if [ -f "$STATE/recovery.symlink" ]; then
        case "$target" in
          *promote-package-a.sh|*securityStage5Artifact*) echo "regular file" ;;
          *) echo "symbolic link" ;;
        esac
        exit 0
      fi
      case "$target" in
        *promote-package-a.sh|*securityStage5Artifact*) echo "regular file" ;;
        *) echo directory ;;
      esac
      ;;
    *) echo "umask owner=root:root mode=644 size=20 path=$target" ;;
  esac
  exit 0
fi
exec /usr/bin/stat "$@"
`
    );
    writeExec(
      path.join(mockBin, "chown"),
      `#!/usr/bin/env bash
printf '%s\\n' "chown $*" >> "${toPosix(stateDir)}/commands.log"
exit 0
`
    );
    const realGit = runBash("command -v git").trim();
    writeExec(
      path.join(mockBin, "trusted-git"),
      `#!/usr/bin/env bash
STATE="${toPosix(stateDir)}"
REAL_GIT="${realGit}"
if [ -f "$STATE/git.fail" ]; then
  for arg in "$@"; do
    if [ "$arg" = show ]; then echo GIT_SHOW_FAIL >&2; exit 1; fi
  done
fi
if [ -f "$STATE/git.fail.verifier" ]; then
  for arg in "$@"; do
    if [ "$arg" = show ]; then
      case "$*" in *securityStage5Artifact*) echo GIT_SHOW_FAIL >&2; exit 1 ;; esac
    fi
  done
fi
if [ -f "$STATE/git.empty" ]; then
  for arg in "$@"; do
    if [ "$arg" = show ]; then exit 0; fi
  done
fi
if [ -f "$STATE/git.empty.verifier" ]; then
  for arg in "$@"; do
    if [ "$arg" = show ]; then
      case "$*" in *securityStage5Artifact*) exit 0 ;; esac
    fi
  done
fi
if [ -f "$STATE/git.trunc" ]; then
  for arg in "$@"; do
    if [ "$arg" = show ]; then
      "$REAL_GIT" "$@" | dd bs=1500 count=1 2>/dev/null
      exit 0
    fi
  done
fi
if [ -f "$STATE/git.trunc.verifier" ]; then
  for arg in "$@"; do
    if [ "$arg" = show ]; then
      case "$*" in
        *securityStage5Artifact*)
          "$REAL_GIT" "$@" | dd bs=400 count=1 2>/dev/null
          exit 0
          ;;
      esac
    fi
  done
fi
exec "$REAL_GIT" "$@"
`
    );
    writeExec(
      path.join(mockBin, "flock"),
      `#!/usr/bin/env bash
printf '%s\\n' "flock $*" >> "${toPosix(stateDir)}/commands.log"
exit 0
`
    );
    writeExec(
      path.join(mockBin, "systemd-analyze"),
      `#!/usr/bin/env bash
printf '%s\\n' "systemd-analyze $*" >> "${toPosix(stateDir)}/commands.log"
for arg in "$@"; do
  case "$arg" in
    *.service.d/*.conf)
      echo "standalone drop-in rejected: $arg" >&2
      exit 64
      ;;
  esac
done
if [ -f "${toPosix(stateDir)}/analyze.fail" ]; then echo ANALYZE_FAIL >&2; exit 1; fi
if [ -f "${toPosix(stateDir)}/send.int" ]; then kill -INT "$PPID"; sleep 2; exit 0; fi
if [ -f "${toPosix(stateDir)}/send.term" ]; then kill -TERM "$PPID"; sleep 2; exit 0; fi
exit 0
`
    );
    writeExec(
      path.join(mockBin, "curl"),
      `#!/usr/bin/env bash
printf '%s\\n' "curl $*" >> "${toPosix(stateDir)}/commands.log"
if [ -f "${toPosix(stateDir)}/curl.fail.once" ]; then
  rm -f "${toPosix(stateDir)}/curl.fail.once"
  exit 7
fi
out=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    http*|https*) url="$1"; shift ;;
    *) shift ;;
  esac
done
[ -n "$out" ] || out="${toPosix(stateDir)}/curl-default.out"
case "$url" in
  *4100/api/health*|*clover-spb.ru/api/health*) printf '%s\\n' '{"ok":true,"releaseId":"rel-pre"}' > "$out" ;;
  *5273/*|*:5273/) printf '%s\\n' '<html>ui-PRETAG</html>' > "$out" ;;
  *) echo "unexpected curl $url" >&2; exit 1 ;;
esac
`
    );
    writeExec(
      path.join(mockBin, "systemctl"),
      `#!/usr/bin/env bash
set -euo pipefail
STATE="${toPosix(stateDir)}"
printf '%s\\n' "systemctl $*" >> "$STATE/commands.log"
cmd="$1"; shift || true
show_prop() {
  local unit="$1" prop="$2"
  case "$unit:$prop" in
    clover-api.service:ActiveState|clover-ui.service:ActiveState|nginx.service:ActiveState) echo active ;;
    clover-api.service:SubState|clover-ui.service:SubState|nginx.service:SubState) echo running ;;
    nginx.service:MainPID) echo 4242 ;;
    clover-audit-retention.timer:Unit) cat "$STATE/timer.unit" ;;
    clover-audit-retention.timer:ActiveState) cat "$STATE/timer.active" ;;
    clover-audit-retention.timer:SubState) cat "$STATE/timer.sub" ;;
    clover-audit-retention-apply.service:ActiveState|clover-audit-retention-dry-run.service:ActiveState) echo inactive ;;
    *:ActiveState) echo inactive ;;
    *) echo "" ;;
  esac
}
case "$cmd" in
  list-jobs) echo "No jobs running" ;;
  show)
    unit=""; props=()
    while [ $# -gt 0 ]; do
      case "$1" in
        -p) props+=("$2"); shift 2 ;;
        --value) shift ;;
        *) unit="$1"; shift ;;
      esac
    done
    for prop in "\${props[@]}"; do show_prop "$unit" "$prop"; done
    ;;
  stop)
    if [ "\${1:-}" = clover-audit-retention.timer ]; then
      echo inactive > "$STATE/timer.active"
      echo dead > "$STATE/timer.sub"
    fi
    ;;
  start)
    if [ "\${1:-}" = clover-audit-retention-apply.service ]; then echo MUST_NOT_START_APPLY >&2; exit 1; fi
    if [ "\${1:-}" = clover-audit-retention.timer ]; then
      echo active > "$STATE/timer.active"
      echo waiting > "$STATE/timer.sub"
    fi
    ;;
  restart)
    if [ "\${1:-}" = nginx.service ]; then echo MUST_NOT_RESTART_NGINX >&2; exit 1; fi
    if [ -f "$STATE/restart.fail" ]; then exit 1; fi
    if [ -f "$STATE/health.race" ]; then touch "$STATE/curl.fail.once"; fi
    ;;
  reload) echo MUST_NOT_RELOAD >&2; exit 1 ;;
  daemon-reload)
    timer="${toPosix(path.join(destRoot, "etc/systemd/system/clover-audit-retention.timer"))}"
    if [ -f "$timer" ]; then awk -F= '/^Unit=/{print $2}' "$timer" > "$STATE/timer.unit"; fi
    ;;
  *) echo "unsupported systemctl $cmd" >&2; exit 1 ;;
esac
`
    );
    runBash(`chmod 0755 "${toPosix(mockBin)}"/*`);
    const mocksSh = path.join(work, "mocks.sh");
    writeExec(
      mocksSh,
      `#!/usr/bin/env bash
export MOCK_BIN="${toPosix(mockBin)}"
export STATE="${toPosix(stateDir)}"
id() { if [ "$1" = "-u" ]; then echo 0; else command id "$@"; fi; }
install() { "$MOCK_BIN/install" "$@"; }
chmod() { "$MOCK_BIN/chmod" "$@"; }
stat() { "$MOCK_BIN/stat" "$@"; }
chown() { "$MOCK_BIN/chown" "$@"; }
flock() { "$MOCK_BIN/flock" "$@"; }
systemd-analyze() { "$MOCK_BIN/systemd-analyze" "$@"; }
curl() { "$MOCK_BIN/curl" "$@"; }
systemctl() { "$MOCK_BIN/systemctl" "$@"; }
python3() { "$MOCK_BIN/python3" "$@"; }
export -f id install chmod stat chown flock systemd-analyze curl systemctl python3
if [ "\${CLOVER_EMPTY_SHA256:-}" = 1 ]; then
  sha256sum() { echo "  $1"; }
  export -f sha256sum
fi
if [ -f "$STATE/backup.fail" ]; then
  cp() {
    if printf '%s' "$*" | grep -q 'api-20-hardening.conf'; then
      echo "backup copy fail" >&2
      return 1
    fi
    command cp "$@"
  }
  export -f cp
fi
`
    );

    const posixArtifact = toPosix(artifact);
    const posixRepo = toPosix(fixtureRoot);
    const posixDest = toPosix(destRoot);
    const cfg = {
      target: fixtureSha,
      expectedManifest,
      artifact: posixArtifact,
      repo: posixRepo,
      live: fixtureSha,
      lock: toPosix(path.join(work, "deploy.lock")),
      destRoot: posixDest,
      recovery: toPosix(path.join(work, "recovery")),
      mockGit: toPosix(path.join(mockBin, "trusted-git")),
      bootstrapFile: toPosix(path.join(work, "bootstrap.sh")),
      mocks: toPosix(mocksSh),
      path: [
        toPosix(mockBin),
        ...runBash(`
          dirname "$(command -v git)"
          dirname "$(command -v node)"
          dirname "$(command -v bash)"
        `)
          .trim()
          .split(/\r?\n/)
          .filter(Boolean),
        "/mingw64/bin",
        "/usr/bin",
        "/bin",
        "/cmd",
      ].join(":"),
    };
    writeExec(
      path.join(work, "bootstrap.sh"),
      extractBootstrap(rollback).replaceAll("/usr/bin/git", cfg.mockGit)
    );

    const resetHost = () => {
      writeFileSync(path.join(stateDir, "timer.unit"), "clover-audit-retention-apply.service\n");
      writeFileSync(path.join(stateDir, "timer.active"), "active\n");
      writeFileSync(path.join(stateDir, "timer.sub"), "waiting\n");
      writeFileSync(path.join(stateDir, "commands.log"), "");
      writeFileSync(path.join(destRoot, "etc/systemd/system/clover-api.service.d/20-hardening.conf"), "OLD-API\n");
      writeFileSync(path.join(destRoot, "etc/systemd/system/clover-ui.service.d/20-hardening.conf"), "OLD-UI\n");
      writeFileSync(
        path.join(destRoot, "etc/systemd/system/clover-audit-retention.timer"),
        "[Timer]\nUnit=clover-audit-retention-apply.service\n"
      );
    };

    resetHost();
    const fileLaunch = runOperator(cfg, {}, { fileLaunch: toPosix(operatorPath) });
    assert.notEqual(fileLaunch.status, 0);
    assert.match(
      `${fileLaunch.stdout}${fileLaunch.stderr}`,
      /TTY GATE: FAIL|must not be sourced|outside recovery|worktree|absolute|recovery is not|BASH_SOURCE/
    );
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl |flock -n/);

    const worktreeTty = runPipedOperator(
      cfg,
      {},
      `source ${quote(cfg.mocks)}; if [ -e /dev/tty ]; then exec 1>/dev/tty 2>/dev/tty; fi; bash -- ${quote(toPosix(operatorPath))} ${operatorArgs({ ...cfg, recovery: toPosix(path.join(work, "recovery-filetty")) })}`
    );
    assert.notEqual(worktreeTty.status, 0);

    const sourced = runPipedOperator(cfg, {}, `source ${quote(toPosix(operatorPath))}`);
    assert.notEqual(sourced.status, 0);
    assert.match(`${sourced.stdout}${sourced.stderr}`, /must not be sourced|piped on stdin/);

    const stdinLaunch = runPipedOperator(
      cfg,
      {},
      `git -C ${quote(posixRepo)} show ${quote(`${fixtureSha}:${operatorRel}`)} | bash -s -- ${operatorArgs(cfg)}`
    );
    assert.notEqual(stdinLaunch.status, 0);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl stop/);

    const artifactLaunch = runOperator(
      cfg,
      {},
      { fileLaunch: toPosix(path.join(artifact, ...operatorRel.split("/"))) }
    );
    assert.notEqual(artifactLaunch.status, 0);

    const noTty = runOperator({ ...cfg, recovery: toPosix(path.join(work, "recovery-notty")) }, {}, { tty: false });
    assert.notEqual(noTty.status, 0);
    assert.match(`${noTty.stdout}${noTty.stderr}`, /TTY GATE: FAIL|TTY \/dev\/tty required/);

    resetHost();
    writeFileSync(path.join(stateDir, "git.empty"), "1");
    const emptyGit = runOperator({ ...cfg, recovery: toPosix(path.join(work, "recovery-empty-git")) }, {}, { tty: true });
    rmSync(path.join(stateDir, "git.empty"));
    assert.notEqual(emptyGit.status, 0);
    assert.match(`${emptyGit.stdout}${emptyGit.stderr}`, /empty operator blob|BOOTSTRAP: FAIL/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl /);

    resetHost();
    writeFileSync(path.join(stateDir, "git.trunc"), "1");
    const truncGit = runOperator({ ...cfg, recovery: toPosix(path.join(work, "recovery-trunc")) }, {}, { tty: true });
    rmSync(path.join(stateDir, "git.trunc"));
    assert.notEqual(truncGit.status, 0);
    assert.match(`${truncGit.stdout}${truncGit.stderr}`, /object id mismatch|BOOTSTRAP: FAIL/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl /);

    resetHost();
    writeFileSync(path.join(stateDir, "git.fail"), "1");
    const failGit = runOperator({ ...cfg, recovery: toPosix(path.join(work, "recovery-gitfail")) }, {}, { tty: true });
    rmSync(path.join(stateDir, "git.fail"));
    assert.notEqual(failGit.status, 0);
    assert.match(`${failGit.stdout}${failGit.stderr}`, /git show operator|BOOTSTRAP: FAIL/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl /);

    resetHost();
    writeFileSync(path.join(stateDir, "tamper.operator"), "1");
    const tamperCopy = runOperator({ ...cfg, recovery: toPosix(path.join(work, "recovery-tamper-op")) }, {}, { tty: true });
    rmSync(path.join(stateDir, "tamper.operator"));
    assert.notEqual(tamperCopy.status, 0);
    assert.match(`${tamperCopy.stdout}${tamperCopy.stderr}`, /object id mismatch after lock|BOOTSTRAP: FAIL/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl /);

    const envBypass = runTtyOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-env")) },
      {
        TARGET: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        EXPECTED_MANIFEST: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        ARTIFACT: "/tmp/nope",
        CLOVER_OPERATOR_AS_ROOT: "1",
      },
      `--repo ${quote(posixRepo)} --live ${quote(fixtureSha)} --lock ${quote(cfg.lock)} --dest-root ${quote(posixDest)} --recovery ${quote(toPosix(path.join(work, "recovery-env")))}`
    );
    assert.notEqual(envBypass.status, 0);
    assert.match(
      `${envBypass.stdout}${envBypass.stderr}`,
      /TARGET must be|FAIL_BEFORE_CHANGE|empty or invalid/
    );

    const unknownArg = runTtyOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-unknown")) },
      {},
      `${operatorArgs({ ...cfg, recovery: toPosix(path.join(work, "recovery-unknown")) })} --oops 1`
    );
    assert.notEqual(unknownArg.status, 0);
    assert.match(`${unknownArg.stdout}${unknownArg.stderr}`, /unknown argument/);

    resetHost();
    writeFileSync(path.join(stateDir, "backup.fail"), "1");
    const backupFail = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-backup")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "backup.fail"));
    assert.notEqual(backupFail.status, 0);
    assert.notEqual(backupFail.status, 40);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl stop clover-audit-retention\.timer/);

    resetHost();
    const preMutate = path.join(artifact, "ops/security-stage5/package-a/systemd/clover-api.service.d/20-hardening.conf");
    const originalApi = readFileSync(preMutate);
    writeFileSync(preMutate, "MUTATED-BEFORE-SNAPSHOT\n");
    const mutatedBefore = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-mutate-before")) },
      {},
      { tty: true }
    );
    writeFileSync(preMutate, originalApi);
    assert.notEqual(mutatedBefore.status, 0);
    assert.notEqual(mutatedBefore.status, 40);

    resetHost();
    writeFileSync(path.join(stateDir, "tamper.verifier"), "1");
    const verifierTamper = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-verifier")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "tamper.verifier"));
    assert.notEqual(verifierTamper.status, 0);
    assert.notEqual(verifierTamper.status, 40);
    assert.match(`${verifierTamper.stdout}${verifierTamper.stderr}`, /verifier object id mismatch|FAIL_BEFORE_CHANGE/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl stop/);

    resetHost();
    writeFileSync(path.join(stateDir, "recovery.mode0755"), "1");
    const recoveryMode = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-mode0755")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "recovery.mode0755"));
    assert.notEqual(recoveryMode.status, 0);
    assert.match(`${recoveryMode.stdout}${recoveryMode.stderr}`, /recovery mode|FAIL_BEFORE_CHANGE/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl |flock -n/);

    resetHost();
    writeFileSync(path.join(stateDir, "recovery.owner.bad"), "1");
    const recoveryOwner = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-owner")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "recovery.owner.bad"));
    assert.notEqual(recoveryOwner.status, 0);
    assert.match(`${recoveryOwner.stdout}${recoveryOwner.stderr}`, /recovery owner|FAIL_BEFORE_CHANGE/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl |flock -n/);

    resetHost();
    writeFileSync(path.join(stateDir, "recovery.symlink"), "1");
    const recoverySymlink = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-symlink")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "recovery.symlink"));
    assert.notEqual(recoverySymlink.status, 0);
    assert.match(
      `${recoverySymlink.stdout}${recoverySymlink.stderr}`,
      /recovery must not be a symlink|recovery is not a directory|FAIL_BEFORE_CHANGE/
    );
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl |flock -n/);

    resetHost();
    writeFileSync(path.join(stateDir, "operator.mode.bad"), "1");
    const operatorMode = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-opmode")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "operator.mode.bad"));
    assert.notEqual(operatorMode.status, 0);
    assert.match(`${operatorMode.stdout}${operatorMode.stderr}`, /mode|BOOTSTRAP: FAIL|FAIL_BEFORE_CHANGE/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl /);

    resetHost();
    writeFileSync(path.join(stateDir, "git.empty.verifier"), "1");
    const emptyVerifier = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-empty-ver")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "git.empty.verifier"));
    assert.notEqual(emptyVerifier.status, 0);
    assert.match(`${emptyVerifier.stdout}${emptyVerifier.stderr}`, /empty verifier blob|object id mismatch|FAIL_BEFORE_CHANGE/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl stop/);

    resetHost();
    writeFileSync(path.join(stateDir, "git.trunc.verifier"), "1");
    const truncVerifier = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-trunc-ver")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "git.trunc.verifier"));
    assert.notEqual(truncVerifier.status, 0);
    assert.match(`${truncVerifier.stdout}${truncVerifier.stderr}`, /object id mismatch|FAIL_BEFORE_CHANGE/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl stop/);

    resetHost();
    writeFileSync(path.join(stateDir, "git.fail.verifier"), "1");
    const failVerifier = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-fail-ver")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "git.fail.verifier"));
    assert.notEqual(failVerifier.status, 0);
    assert.match(`${failVerifier.stdout}${failVerifier.stderr}`, /git show verifier|FAIL_BEFORE_CHANGE/);
    assert.doesNotMatch(readFileSync(path.join(stateDir, "commands.log"), "utf8"), /systemctl stop/);

    resetHost();
    const worktreeOperator = path.join(fixtureRoot, ...operatorRel.split("/"));
    const originalWorktreeOperator = readFileSync(worktreeOperator);
    writeFileSync(worktreeOperator, `${originalWorktreeOperator}\n# local writable $0 mutation\n`);
    const blobIgnoresWritable = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-writable")) },
      {},
      { tty: true }
    );
    writeFileSync(worktreeOperator, originalWorktreeOperator);
    assert.equal(
      blobIgnoresWritable.status,
      0,
      `writable $0 mutation must not change git-show root operator\n${blobIgnoresWritable.stdout}\n${blobIgnoresWritable.stderr}`
    );

    resetHost();
    writeFileSync(path.join(stateDir, "analyze.fail"), "1");
    writeFileSync(path.join(stateDir, "health.race"), "1");
    const blocked = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-analyze")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "analyze.fail"));
    rmSync(path.join(stateDir, "health.race"));
    assert.equal(blocked.status, 40, `syntax-check failure must exit 40, got ${blocked.status}\n${blocked.stdout}\n${blocked.stderr}`);
    assert.match(
      `${blocked.stdout}${blocked.stderr}`,
      /ROLLBACK: COMPLETED/,
      "rollback health probes must tolerate the same restart race"
    );
    assert.equal(readFileSync(path.join(destRoot, "etc/systemd/system/clover-api.service.d/20-hardening.conf"), "utf8"), "OLD-API\n");
    assert.equal(sha256File(umaskPath), umaskSha);

    resetHost();
    writeFileSync(path.join(stateDir, "analyze.fail"), "1");
    writeFileSync(path.join(stateDir, "restart.fail"), "1");
    const rbIncomplete = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-rb41")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "analyze.fail"));
    rmSync(path.join(stateDir, "restart.fail"));
    assert.equal(rbIncomplete.status, 41, `rollback incomplete must exit 41, got ${rbIncomplete.status}\n${rbIncomplete.stdout}\n${rbIncomplete.stderr}`);

    resetHost();
    writeFileSync(path.join(stateDir, "send.int"), "1");
    const liveInt = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-int")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "send.int"));
    assert.equal(liveInt.status, 40, `live INT after change must exit 40, got ${liveInt.status}\n${liveInt.stdout}\n${liveInt.stderr}`);
    assert.match(`${liveInt.stdout}${liveInt.stderr}`, /AUTOMATIC ROLLBACK/);

    resetHost();
    writeFileSync(path.join(stateDir, "send.term"), "1");
    const liveTerm = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-term")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "send.term"));
    assert.equal(liveTerm.status, 40, `live TERM after change must exit 40, got ${liveTerm.status}`);

    resetHost();
    const honestOid = execFileSync("git", ["--no-replace-objects", "rev-parse", `${fixtureSha}:${operatorRel}`], {
      cwd: fixtureRoot,
      encoding: "utf8",
    }).trim();
    const evilPath = path.join(fixtureRoot, "evil-operator.sh");
    writeFileSync(evilPath, "# evil replace\n");
    const evilOid = execFileSync("git", ["hash-object", "-w", evilPath], {
      cwd: fixtureRoot,
      encoding: "utf8",
    }).trim();
    execFileSync("git", ["replace", honestOid, evilOid], { cwd: fixtureRoot });
    const swapped = execFileSync("git", ["show", `${fixtureSha}:${operatorRel}`], {
      cwd: fixtureRoot,
      encoding: "utf8",
    });
    assert.match(swapped, /evil replace/);
    const replacePinned = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-replace")) },
      {},
      { tty: true }
    );
    assert.equal(
      replacePinned.status,
      0,
      `replace ref must not change trusted bootstrap\n${replacePinned.stdout}\n${replacePinned.stderr}`
    );
    execFileSync("git", ["replace", "-d", honestOid], { cwd: fixtureRoot });

    resetHost();
    writeFileSync(path.join(stateDir, "health.race"), "1");
    const healthRace = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-health-race")) },
      {},
      { tty: true }
    );
    rmSync(path.join(stateDir, "health.race"));
    assert.equal(
      healthRace.status,
      0,
      `one refused connection after each restart must be retried\n${healthRace.stdout}\n${healthRace.stderr}`
    );
    const healthRaceCommands = readFileSync(path.join(stateDir, "commands.log"), "utf8");
    assert.ok(
      (healthRaceCommands.match(/curl .*4100\/api\/health/g) || []).length >= 3,
      "API health must retry after a restart race"
    );
    assert.ok(
      (healthRaceCommands.match(/curl .*5273\//g) || []).length >= 3,
      "UI health must retry after a restart race"
    );

    resetHost();
    const passed = runOperator(cfg, {}, { tty: true });
    assert.equal(passed.status, 0, `happy-path operator failed ${passed.status}\n${passed.stdout}\n${passed.stderr}`);
    assert.match(passed.stdout, /PACKAGE A PROMOTE: PASS/);
    const commands = readFileSync(path.join(stateDir, "commands.log"), "utf8");
    const stopAt = commands.indexOf("systemctl stop clover-audit-retention.timer");
    const installAt = commands.indexOf("install -m 0644");
    assert.ok(stopAt >= 0);
    assert.ok(installAt > stopAt);
    assert.match(commands, /payload\/api-20-hardening\.conf/);
    assert.doesNotMatch(commands, /install -m 0644 -- .*\/artifact\/ops\//);
    assert.doesNotMatch(commands, /restart nginx|reload nginx|start clover-audit-retention-apply/);
    assert.equal(sha256File(umaskPath), umaskSha);
    const installedTimer = readFileSync(path.join(destRoot, "etc/systemd/system/clover-audit-retention.timer"), "utf8");
    writeFileSync(path.join(artifact, "ops/systemd/clover-audit-retention.timer"), "[Timer]\nUnit=MUTATED-AFTER\n");
    assert.equal(
      installedTimer,
      execFileSync("git", ["-C", fixtureRoot, "show", `${fixtureSha}:ops/systemd/clover-audit-retention.timer`], {
        encoding: "utf8",
      })
    );
    const recoveryVerifier = readFileSync(path.join(work, "recovery", `securityStage5Artifact-${fixtureSha}.mjs`));
    const gitVerifier = execFileSync("git", ["-C", fixtureRoot, "show", `${fixtureSha}:server/scripts/securityStage5Artifact.mjs`]);
    assert.deepEqual(recoveryVerifier, gitVerifier);

    const emptyPromote = runOperator(
      { ...cfg, recovery: toPosix(path.join(work, "recovery-empty")) },
      { CLOVER_EMPTY_SHA256: "1" },
      { tty: true }
    );
    assert.notEqual(emptyPromote.status, 0);
    assert.notEqual(emptyPromote.status, 40);

    const tampered = path.join(artifact, ...operatorRel.split("/"));
    writeFileSync(tampered, `${readFileSync(tampered, "utf8")}\n# tampered\n`);
    const manifestPath = path.join(artifact, "manifest.json");
    const forged = JSON.parse(readFileSync(manifestPath, "utf8"));
    const record = forged.files.find((entry) => entry.path === operatorRel);
    record.size = statSync(tampered).size;
    record.sha256 = sha256File(tampered);
    writeFileSync(manifestPath, `${JSON.stringify(forged, null, 2)}\n`);
    assert.throws(
      () => verifyArtifact({ artifact, expectedSha: fixtureSha, sourceRoot: fixtureRoot }),
      /Git blob mismatch/
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runSecurityStage5OperatorTests();
  console.log("SECURITY_STAGE5_OPERATOR:PASS");
}
