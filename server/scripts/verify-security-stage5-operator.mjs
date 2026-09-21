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

function toBashPath(winPath) {
  return String(winPath || "")
    .split(";")
    .filter(Boolean)
    .map((entry) => {
      if (/^[A-Za-z]:[\\/]/.test(entry)) return toPosix(entry);
      return entry.split(path.sep).join("/");
    })
    .join(":");
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

function runBash(script, env = {}, extraArgs = []) {
  const bash = findBash();
  return execFileSync(bash, ["-lc", script, ...extraArgs], {
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

function runOperator(env) {
  const bash = findBash();
  const mocks = env.CLOVER_OPERATOR_MOCKS;
  const args = mocks
    ? ["-lc", `source "${mocks}"; exec bash -- "${toPosix(operatorPath)}"`]
    : [toPosix(operatorPath)];
  try {
    const stdout = execFileSync(bash, args, {
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

export function runSecurityStage5OperatorTests() {
  assert.ok(sourceFiles.includes(operatorRel), "operator must be in PREPARE allowlist");
  assert.match(operator, /^set -Eeuo pipefail$/m);
  assert.match(operator, /trap operator_on_err ERR/);
  assert.match(operator, /trap 'operator_on_signal INT' INT/);
  assert.match(operator, /trap 'operator_on_signal TERM' TERM/);
  assert.match(operator, /trap cleanup EXIT/);
  assert.match(operator, /readonly EXIT_PROMOTE_FAIL=40/);
  assert.match(operator, /readonly EXIT_ROLLBACK_INCOMPLETE=41/);
  assert.match(operator, /sudo -v/);
  assert.match(operator, /exec sudo -n env CLOVER_OPERATOR_AS_ROOT=1/);
  assert.match(operator, /git -C "\$ROOT" show "\$\{TARGET\}:server\/scripts\/securityStage5Artifact\.mjs"/);
  assert.match(operator, /10-umask\.conf is not a destination/);
  assert.match(operator, /STOP TIMER \(first change\)/);
  assert.match(operator, /CHANGED=1/);
  assert.doesNotMatch(operator, /sudo\s+-S\b/);
  assert.doesNotMatch(operator, /SUDO_ASKPASS|askpass|sudoers/i);
  assert.doesNotMatch(operator, /while\s+true;\s*do\s*sudo\s+-n\s+true/);
  assert.doesNotMatch(operator, /sudo\s+-n\s+true\s+sleep/);
  assert.doesNotMatch(operator, /rm\s+-rf|pkill|kill\s+-9|\*\.conf/);
  assert.doesNotMatch(operator, /systemd-analyze[\s\S]{0,200}\|\|\s*true/);
  assert.doesNotMatch(operator, /VERIFIER=.*\.verifier-/);
  assert.match(rollback, /10-umask\.conf` is \*\*not\*\* a\s+destination/);
  assert.match(rollback, /ops\/security-stage5\/scripts\/promote-package-a\.sh/);
  assert.match(rollback, /exits `40` when rollback completes and\s+`41`/);
  assert.doesNotMatch(rollback, /restore_exact[^\n]*10-umask/);

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
     source "${toPosix(operatorPath)}"
     require_sha256 empty ""
    `,
    { CLOVER_OPERATOR_SOURCE_ONLY: "1" }
  );
  assert.notEqual(emptyHash.status, 0, "empty hash must block continuation");
  assert.match(`${emptyHash.stdout}${emptyHash.stderr}`, /empty or invalid SHA-256/);

  const trapDir = mkdtempSync(path.join(tmpdir(), "clover-stage5-op-traps-"));
  try {
    const after = runBashAllowFail(
      `set -Eeuo pipefail
       source "${toPosix(operatorPath)}"
       do_rollback() { echo ROLLBACK_RAN; return 0; }
       CHANGED=1
       IN_ROLLBACK=0
       IN_CLEANUP=0
       LOCK_HELD=0
       trap operator_on_err ERR
       trap 'operator_on_signal INT' INT
       trap 'operator_on_signal TERM' TERM
       false
      `,
      { CLOVER_OPERATOR_SOURCE_ONLY: "1" }
    );
    assert.equal(after.status, 40, `INT/ERR after CHANGED must exit 40, got ${after.status}`);
    assert.match(`${after.stdout}${after.stderr}`, /ROLLBACK_RAN/);
    assert.match(`${after.stdout}${after.stderr}`, /ROLLBACK: COMPLETED/);

    const incomplete = runBashAllowFail(
      `set -Eeuo pipefail
       source "${toPosix(operatorPath)}"
       do_rollback() { echo ROLLBACK_RAN; return 1; }
       CHANGED=1
       IN_ROLLBACK=0
       IN_CLEANUP=0
       LOCK_HELD=0
       trap operator_on_err ERR
       false
      `,
      { CLOVER_OPERATOR_SOURCE_ONLY: "1" }
    );
    assert.equal(incomplete.status, 41, `rollback incomplete must exit 41, got ${incomplete.status}`);
    assert.match(`${incomplete.stdout}${incomplete.stderr}`, /ROLLBACK: INCOMPLETE/);

    const before = runBashAllowFail(
      `set -Eeuo pipefail
       source "${toPosix(operatorPath)}"
       do_rollback() { echo ROLLBACK_RAN; return 0; }
       CHANGED=0
       IN_ROLLBACK=0
       IN_CLEANUP=0
       LOCK_HELD=0
       trap 'operator_on_signal INT' INT
       kill -INT $$
      `,
      { CLOVER_OPERATOR_SOURCE_ONLY: "1" }
    );
    assert.equal(before.status, 130, `INT before CHANGED must keep 130, got ${before.status}`);
    assert.doesNotMatch(`${before.stdout}${before.stderr}`, /ROLLBACK_RAN/);
    assert.match(`${before.stdout}${before.stderr}`, /ROLLBACK: NOT_NEEDED/);
  } finally {
    rmSync(trapDir, { recursive: true, force: true });
  }

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
    try {
      execFileSync("chmod", ["0700", path.join(destRoot, "etc/systemd/system/clover-api.service.d")]);
    } catch {
      runBash(`chmod 0700 "${toPosix(path.join(destRoot, "etc/systemd/system/clover-api.service.d"))}"`);
    }

    const fixtureFiles = [...sourceFiles, "server/scripts/securityStage5Artifact.mjs"];
    for (const relative of fixtureFiles) {
      const source = path.join(root, ...relative.split("/"));
      const destination = path.join(fixtureRoot, ...relative.split("/"));
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
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
src=""
dest=""
while [ $# -gt 0 ]; do
  case "$1" in
    -m) shift 2 ;;
    --) shift ;;
    *)
      if [ -z "$src" ]; then src="$1"
      else dest="$1"
      fi
      shift
      ;;
  esac
done
cp -- "$src" "$dest"
`
    );
    writeExec(
      path.join(mockBin, "chmod"),
      `#!/usr/bin/env bash
printf '%s\\n' "chmod $*" >> "${toPosix(stateDir)}/commands.log"
exit 0
`
    );
    writeExec(
      path.join(mockBin, "stat"),
      `#!/usr/bin/env bash
if [ "$1" = "-c" ]; then
  fmt="$2"
  target="$3"
  if [ "$fmt" = "%a" ]; then
    echo 700
    exit 0
  fi
  echo "umask owner=root:root mode=644 size=20 path=$target"
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
if [ -f "${toPosix(stateDir)}/analyze.fail" ]; then
  echo "ANALYZE_FAIL" >&2
  exit 1
fi
exit 0
`
    );
    writeExec(
      path.join(mockBin, "curl"),
      `#!/usr/bin/env bash
printf '%s\\n' "curl $*" >> "${toPosix(stateDir)}/commands.log"
out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    http*|https*) url="$1"; shift ;;
    *) shift ;;
  esac
done
if [ -z "$out" ]; then
  out="${toPosix(stateDir)}/curl-default.out"
fi
case "$url" in
  *4100/api/health*|*clover-spb.ru/api/health*)
    printf '%s\\n' '{"ok":true,"releaseId":"rel-pre"}' > "$out"
    ;;
  *5273/*|*:5273/)
    printf '%s\\n' '<html>ui-PRETAG</html>' > "$out"
    ;;
  *)
    echo "unexpected curl $url" >&2
    exit 1
    ;;
esac
`
    );
    writeExec(
      path.join(mockBin, "systemctl"),
      `#!/usr/bin/env bash
set -euo pipefail
STATE="${toPosix(stateDir)}"
printf '%s\\n' "systemctl $*" >> "$STATE/commands.log"
cmd="$1"
shift || true
show_prop() {
  local unit="$1" prop="$2"
  case "$unit:$prop" in
    clover-api.service:ActiveState|clover-ui.service:ActiveState|nginx.service:ActiveState)
      echo active ;;
    clover-api.service:SubState|clover-ui.service:SubState|nginx.service:SubState)
      echo running ;;
    nginx.service:MainPID)
      echo 4242 ;;
    clover-audit-retention.timer:Unit)
      cat "$STATE/timer.unit" ;;
    clover-audit-retention.timer:ActiveState)
      cat "$STATE/timer.active" ;;
    clover-audit-retention.timer:SubState)
      cat "$STATE/timer.sub" ;;
    clover-audit-retention-apply.service:ActiveState|clover-audit-retention-dry-run.service:ActiveState)
      echo inactive ;;
    *:ActiveState)
      echo inactive ;;
    *)
      echo "" ;;
  esac
}
case "$cmd" in
  list-jobs)
    echo "No jobs running"
    ;;
  show)
    unit=""
    props=()
    while [ $# -gt 0 ]; do
      case "$1" in
        -p) props+=("$2"); shift 2 ;;
        --value) shift ;;
        *) unit="$1"; shift ;;
      esac
    done
    for prop in "\${props[@]}"; do
      show_prop "$unit" "$prop"
    done
    ;;
  stop)
    if [ "\${1:-}" = clover-audit-retention.timer ]; then
      echo inactive > "$STATE/timer.active"
      echo dead > "$STATE/timer.sub"
    fi
    ;;
  start)
    if [ "\${1:-}" = clover-audit-retention-apply.service ]; then
      echo "MUST NOT START APPLY" >&2
      exit 1
    fi
    if [ "\${1:-}" = clover-audit-retention.timer ]; then
      echo active > "$STATE/timer.active"
      echo waiting > "$STATE/timer.sub"
    fi
    ;;
  restart)
    if [ "\${1:-}" = nginx.service ]; then
      echo "MUST NOT RESTART NGINX" >&2
      exit 1
    fi
    ;;
  reload)
    echo "MUST NOT RELOAD $1" >&2
    exit 1
    ;;
  daemon-reload)
    timer="${toPosix(path.join(destRoot, "etc/systemd/system/clover-audit-retention.timer"))}"
    if [ -f "$timer" ]; then
      awk -F= '/^Unit=/{print $2}' "$timer" > "$STATE/timer.unit"
    fi
    ;;
  *)
    echo "unsupported systemctl $cmd" >&2
    exit 1
    ;;
esac
`
    );
    writeFileSync(path.join(stateDir, "timer.unit"), "clover-audit-retention-apply.service\n");
    writeFileSync(path.join(stateDir, "timer.active"), "active\n");
    writeFileSync(path.join(stateDir, "timer.sub"), "waiting\n");
    writeFileSync(path.join(stateDir, "commands.log"), "");
    runBash(`chmod 0755 "${toPosix(mockBin)}"/*`);
    const mocksSh = path.join(work, "mocks.sh");
    writeExec(
      mocksSh,
      `#!/usr/bin/env bash
export MOCK_BIN="${toPosix(mockBin)}"
install() { "$MOCK_BIN/install" "$@"; }
chmod() { "$MOCK_BIN/chmod" "$@"; }
stat() { "$MOCK_BIN/stat" "$@"; }
chown() { "$MOCK_BIN/chown" "$@"; }
flock() { "$MOCK_BIN/flock" "$@"; }
systemd-analyze() { "$MOCK_BIN/systemd-analyze" "$@"; }
curl() { "$MOCK_BIN/curl" "$@"; }
systemctl() { "$MOCK_BIN/systemctl" "$@"; }
python3() { "$MOCK_BIN/python3" "$@"; }
export -f install chmod stat chown flock systemd-analyze curl systemctl python3
if [ "\${CLOVER_EMPTY_SHA256:-}" = 1 ]; then
  sha256sum() { echo "  $1"; }
  export -f sha256sum
fi
`
    );

    const commonEnv = {
      CLOVER_OPERATOR_AS_ROOT: "1",
      CLOVER_OPERATOR_MOCKS: toPosix(mocksSh),
      ROOT: toPosix(fixtureRoot),
      ARTIFACT: toPosix(artifact),
      TARGET: fixtureSha,
      EXPECTED_MANIFEST: expectedManifest,
      LIVE: fixtureSha,
      LOCK: toPosix(path.join(work, "deploy.lock")),
      DEST_ROOT: toPosix(destRoot),
      RECOVERY_OVERRIDE: toPosix(path.join(work, "recovery")),
      PATH: `${toPosix(mockBin)}:/usr/bin:/bin:${toBashPath(process.env.PATH)}`,
    };

    writeFileSync(path.join(stateDir, "analyze.fail"), "1");
    writeFileSync(path.join(stateDir, "timer.unit"), "clover-audit-retention-apply.service\n");
    writeFileSync(path.join(stateDir, "timer.active"), "active\n");
    writeFileSync(path.join(stateDir, "timer.sub"), "waiting\n");
    writeFileSync(path.join(destRoot, "etc/systemd/system/clover-api.service.d/20-hardening.conf"), "OLD-API\n");
    writeFileSync(path.join(destRoot, "etc/systemd/system/clover-ui.service.d/20-hardening.conf"), "OLD-UI\n");
    writeFileSync(
      path.join(destRoot, "etc/systemd/system/clover-audit-retention.timer"),
      "[Timer]\nUnit=clover-audit-retention-apply.service\n"
    );
    const blocked = runOperator({
      ...commonEnv,
      RECOVERY_OVERRIDE: toPosix(path.join(work, "recovery-analyze")),
    });
    assert.equal(blocked.status, 40, `syntax-check failure must exit 40, got ${blocked.status}\n${blocked.stdout}\n${blocked.stderr}`);
    assert.match(`${blocked.stdout}${blocked.stderr}`, /ROLLBACK: COMPLETED/);
    assert.match(`${blocked.stdout}${blocked.stderr}`, /RESIDUAL: restored pre-state timer still targets apply\.service/);
    assert.equal(
      readFileSync(path.join(destRoot, "etc/systemd/system/clover-api.service.d/20-hardening.conf"), "utf8"),
      "OLD-API\n"
    );
    assert.equal(sha256File(umaskPath), umaskSha);
    rmSync(path.join(stateDir, "analyze.fail"));

    writeFileSync(path.join(stateDir, "commands.log"), "");
    writeFileSync(path.join(stateDir, "timer.unit"), "clover-audit-retention-apply.service\n");
    writeFileSync(path.join(stateDir, "timer.active"), "active\n");
    writeFileSync(path.join(stateDir, "timer.sub"), "waiting\n");
    const passed = runOperator(commonEnv);
    assert.equal(passed.status, 0, `happy-path operator failed ${passed.status}\n${passed.stdout}\n${passed.stderr}`);
    assert.match(passed.stdout, /PACKAGE A PROMOTE: PASS/);
    const commands = readFileSync(path.join(stateDir, "commands.log"), "utf8");
    const stopAt = commands.indexOf("systemctl stop clover-audit-retention.timer");
    const installAt = commands.indexOf("systemd-analyze");
    assert.ok(stopAt >= 0, "timer stop must be recorded");
    assert.ok(installAt > stopAt, "timer stop must precede install/verify");
    assert.doesNotMatch(commands, /restart nginx|reload nginx|start clover-audit-retention-apply/);
    assert.doesNotMatch(commands, /rm -rf|pkill|kill -9/);
    assert.match(passed.stdout, /PRE_UI_TAG=ui-PRETAG/);
    assert.match(passed.stdout, /UMASK_EVIDENCE=/);
    assert.equal(sha256File(umaskPath), umaskSha);
    assert.equal(
      readFileSync(path.join(destRoot, "etc/systemd/system/clover-audit-retention.timer"), "utf8"),
      readFileSync(path.join(artifact, "ops/systemd/clover-audit-retention.timer"), "utf8")
    );
    const recoveryFiles = readFileSync(path.join(work, "recovery", `securityStage5Artifact-${fixtureSha}.mjs`));
    const gitVerifier = execFileSync(
      "git",
      ["-C", fixtureRoot, "show", `${fixtureSha}:server/scripts/securityStage5Artifact.mjs`],
      { encoding: "buffer" }
    );
    assert.deepEqual(recoveryFiles, gitVerifier);
    assert.equal(existsSync(path.join(destRoot, "etc/ssh")), false);
    assert.equal(existsSync(path.join(destRoot, "etc/nginx")), false);

    const emptyPromote = runOperator({
      ...commonEnv,
      CLOVER_EMPTY_SHA256: "1",
      RECOVERY_OVERRIDE: toPosix(path.join(work, "recovery-empty")),
    });
    assert.notEqual(emptyPromote.status, 0, "empty hash during promote must fail");
    assert.notEqual(emptyPromote.status, 40, "empty hash before change must not look like promote failure after change");

    const preplaced = runOperator({
      ...commonEnv,
      VERIFIER: "/tmp/preplaced-verifier.mjs",
      RECOVERY_OVERRIDE: toPosix(path.join(work, "recovery-preplaced")),
    });
    assert.equal(preplaced.status, 20);
    assert.match(`${preplaced.stdout}${preplaced.stderr}`, /pre-placed verifier is forbidden/);

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
